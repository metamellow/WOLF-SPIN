```markdown
# Solana Spin Wheel DApp - Complete Setup Guide

## Step 1: Environment Setup

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install latest
avm use latest

# Verify installations
rustc --version
solana --version
anchor --version
```

---

## Step 2: Project Initialization

```bash
# Create project
anchor init spin_wheel
cd spin_wheel

# Configure for devnet
solana config set --url devnet

# Create wallet (SAVE THE SEED PHRASE THAT APPEARS!)
solana-keygen new --outfile ~/.config/solana/id.json

# Get devnet SOL
solana airdrop 2
solana balance
```

---

## Step 3: Create Test Token (WOLF Substitute)

```bash
# Install SPL Token CLI
cargo install spl-token-cli

# Create test token
spl-token create-token --decimals 9

# Save the token address that appears
# Example output: "Creating token AbC...XyZ"

# Create token account for yourself
spl-token create-account <TOKEN_ADDRESS_FROM_ABOVE>

# Mint test tokens (1 billion tokens)
spl-token mint <TOKEN_ADDRESS_FROM_ABOVE> 1000000000

# Check balance
spl-token balance <TOKEN_ADDRESS_FROM_ABOVE>
```

**SAVE THIS TOKEN ADDRESS**

---

## Step 4: Program Code

Replace `programs/spin_wheel/src/lib.rs` with:

```rust
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};
use anchor_lang::solana_program::hash::hash;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod spin_wheel {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let game_state = &mut ctx.accounts.game_state;
        game_state.authority = ctx.accounts.authority.key();
        game_state.wolf_token_mint = ctx.accounts.wolf_token_mint.key();
        game_state.reward_pool = ctx.accounts.reward_pool.key();
        game_state.total_spins = 0;
        game_state.dev_fees_collected = 0;
        game_state.bump = ctx.bumps.game_state;
        Ok(())
    }

    pub fn spin(ctx: Context<Spin>, bet_amount: u64) -> Result<()> {
        let game_state = &mut ctx.accounts.game_state;
        let reward_pool_balance = ctx.accounts.reward_pool.amount;

        // Calculate min and max bets
        let min_bet = reward_pool_balance
            .checked_div(1000)
            .unwrap_or(0)
            .max(100_000); // Minimum 0.0001 tokens (100k lamports with 9 decimals)
        
        let max_bet = reward_pool_balance
            .checked_div(8)
            .ok_or(ErrorCode::CalculationError)?;

        require!(bet_amount >= min_bet, ErrorCode::BetTooLow);
        require!(bet_amount <= max_bet, ErrorCode::BetTooHigh);

        // Generate random number 0-99
        // NOTE: This is placeholder randomness for testing only
        // Replace with Switchboard VRF for production
        let random_number = generate_random_number(
            &game_state.total_spins,
            &ctx.accounts.player.key(),
        )?;

        // Determine outcome based on probabilities
        let (multiplier_percent, outcome_type) = match random_number {
            0..=59 => (0, "LOSS"),      // 60% - Loss
            60..=79 => (120, "1.2x"),   // 20% - Small win
            80..=89 => (200, "2x"),     // 10% - Medium win
            90..=99 => (400, "4x"),     // 10% - Big win
            _ => (0, "LOSS"),
        };

        // Calculate payout with overflow protection
        let payout = if multiplier_percent == 0 {
            0
        } else {
            (bet_amount as u128)
                .checked_mul(multiplier_percent as u128)
                .ok_or(ErrorCode::CalculationError)?
                .checked_div(100)
                .ok_or(ErrorCode::CalculationError)?
                as u64
        };

        // Validate payout doesn't exceed pool
        if payout > 0 {
            require!(payout <= reward_pool_balance, ErrorCode::InsufficientPool);
        }

        // Update state before transfers
        game_state.total_spins = game_state.total_spins
            .checked_add(1)
            .ok_or(ErrorCode::CalculationError)?;

        if payout > 0 {
            // Player wins - transfer from reward pool to player
            let seeds = &[
                b"game_state".as_ref(),
                &[game_state.bump],
            ];
            let signer_seeds = &[&seeds[..]];

            let cpi_accounts = Transfer {
                from: ctx.accounts.reward_pool.to_account_info(),
                to: ctx.accounts.player_token_account.to_account_info(),
                authority: ctx.accounts.game_state.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
            token::transfer(cpi_ctx, payout)?;

            emit!(SpinResult {
                player: ctx.accounts.player.key(),
                bet_amount,
                multiplier: multiplier_percent,
                payout,
                random_number,
                outcome: outcome_type.to_string(),
                pool_balance: reward_pool_balance.checked_sub(payout).unwrap_or(0),
            });
        } else {
            // Player loses
            let to_pool = (bet_amount as u128)
                .checked_mul(75)
                .ok_or(ErrorCode::CalculationError)?
                .checked_div(100)
                .ok_or(ErrorCode::CalculationError)?
                as u64;
            
            let dev_fee = bet_amount.checked_sub(to_pool).ok_or(ErrorCode::CalculationError)?;

            // Transfer 75% to reward pool
            let cpi_accounts = Transfer {
                from: ctx.accounts.player_token_account.to_account_info(),
                to: ctx.accounts.reward_pool.to_account_info(),
                authority: ctx.accounts.player.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
            token::transfer(cpi_ctx, to_pool)?;

            // Transfer 25% dev fee
            let cpi_accounts_dev = Transfer {
                from: ctx.accounts.player_token_account.to_account_info(),
                to: ctx.accounts.dev_fee_account.to_account_info(),
                authority: ctx.accounts.player.to_account_info(),
            };
            let cpi_program_dev = ctx.accounts.token_program.to_account_info();
            let cpi_ctx_dev = CpiContext::new(cpi_program_dev, cpi_accounts_dev);
            token::transfer(cpi_ctx_dev, dev_fee)?;

            game_state.dev_fees_collected = game_state.dev_fees_collected
                .checked_add(dev_fee)
                .ok_or(ErrorCode::CalculationError)?;

            emit!(SpinResult {
                player: ctx.accounts.player.key(),
                bet_amount,
                multiplier: 0,
                payout: 0,
                random_number,
                outcome: outcome_type.to_string(),
                pool_balance: reward_pool_balance.checked_add(to_pool).unwrap_or(reward_pool_balance),
            });
        }

        Ok(())
    }

    pub fn withdraw_profits(ctx: Context<WithdrawProfits>, amount: u64) -> Result<()> {
        let game_state = &ctx.accounts.game_state;
        
        require!(
            ctx.accounts.authority.key() == game_state.authority,
            ErrorCode::Unauthorized
        );

        require!(
            amount <= ctx.accounts.reward_pool.amount,
            ErrorCode::InsufficientPool
        );

        let seeds = &[
            b"game_state".as_ref(),
            &[game_state.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.reward_pool.to_account_info(),
            to: ctx.accounts.authority_token_account.to_account_info(),
            authority: ctx.accounts.game_state.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        token::transfer(cpi_ctx, amount)?;

        Ok(())
    }

    pub fn fund_pool(ctx: Context<FundPool>, amount: u64) -> Result<()> {
        let cpi_accounts = Transfer {
            from: ctx.accounts.funder_token_account.to_account_info(),
            to: ctx.accounts.reward_pool.to_account_info(),
            authority: ctx.accounts.funder.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        Ok(())
    }
}

// Placeholder random number generator
// REPLACE THIS WITH SWITCHBOARD VRF FOR PRODUCTION
fn generate_random_number(total_spins: &u64, player: &Pubkey) -> Result<u8> {
    let clock = Clock::get()?;
    let random_seed = hash(&[
        &clock.slot.to_le_bytes(),
        &total_spins.to_le_bytes(),
        &player.to_bytes(),
    ]);
    Ok(u8::from_le_bytes([random_seed.to_bytes()[0]]) % 100)
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 32 + 8 + 8 + 1,
        seeds = [b"game_state"],
        bump
    )]
    pub game_state: Account<'info, GameState>,
    
    pub wolf_token_mint: Account<'info, Mint>,
    
    #[account(
        init,
        payer = authority,
        token::mint = wolf_token_mint,
        token::authority = game_state,
    )]
    pub reward_pool: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Spin<'info> {
    #[account(
        mut,
        seeds = [b"game_state"],
        bump = game_state.bump,
    )]
    pub game_state: Account<'info, GameState>,
    
    #[account(
        mut,
        constraint = reward_pool.key() == game_state.reward_pool @ ErrorCode::InvalidRewardPool,
        constraint = reward_pool.mint == game_state.wolf_token_mint @ ErrorCode::InvalidMint,
    )]
    pub reward_pool: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = player_token_account.mint == game_state.wolf_token_mint @ ErrorCode::InvalidMint,
        constraint = player_token_account.owner == player.key() @ ErrorCode::InvalidTokenAccount,
    )]
    pub player_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = dev_fee_account.mint == game_state.wolf_token_mint @ ErrorCode::InvalidMint,
        constraint = dev_fee_account.owner == game_state.authority @ ErrorCode::InvalidDevAccount,
    )]
    pub dev_fee_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub player: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawProfits<'info> {
    #[account(
        seeds = [b"game_state"],
        bump = game_state.bump,
    )]
    pub game_state: Account<'info, GameState>,
    
    #[account(
        mut,
        constraint = reward_pool.key() == game_state.reward_pool @ ErrorCode::InvalidRewardPool,
    )]
    pub reward_pool: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = authority_token_account.mint == game_state.wolf_token_mint @ ErrorCode::InvalidMint,
        constraint = authority_token_account.owner == authority.key() @ ErrorCode::InvalidTokenAccount,
    )]
    pub authority_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = authority.key() == game_state.authority @ ErrorCode::Unauthorized,
    )]
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct FundPool<'info> {
    #[account(
        seeds = [b"game_state"],
        bump = game_state.bump,
    )]
    pub game_state: Account<'info, GameState>,
    
    #[account(
        mut,
        constraint = reward_pool.key() == game_state.reward_pool @ ErrorCode::InvalidRewardPool,
    )]
    pub reward_pool: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = funder_token_account.mint == game_state.wolf_token_mint @ ErrorCode::InvalidMint,
    )]
    pub funder_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub funder: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct GameState {
    pub authority: Pubkey,           // 32
    pub wolf_token_mint: Pubkey,     // 32
    pub reward_pool: Pubkey,         // 32
    pub total_spins: u64,            // 8
    pub dev_fees_collected: u64,     // 8
    pub bump: u8,                    // 1
}

#[event]
pub struct SpinResult {
    pub player: Pubkey,
    pub bet_amount: u64,
    pub multiplier: u64,
    pub payout: u64,
    pub random_number: u8,
    pub outcome: String,
    pub pool_balance: u64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized: Only the authority can perform this action")]
    Unauthorized,
    #[msg("Bet amount is below minimum (0.1% of pool)")]
    BetTooLow,
    #[msg("Bet amount exceeds maximum (ensures 4x payout ≤ 50% of pool)")]
    BetTooHigh,
    #[msg("Insufficient funds in reward pool")]
    InsufficientPool,
    #[msg("Calculation error or overflow")]
    CalculationError,
    #[msg("Invalid reward pool account")]
    InvalidRewardPool,
    #[msg("Invalid token mint")]
    InvalidMint,
    #[msg("Invalid token account")]
    InvalidTokenAccount,
    #[msg("Invalid dev fee account")]
    InvalidDevAccount,
}
```

---

## Step 5: Update Cargo.toml

Replace `programs/spin_wheel/Cargo.toml` with:

```toml
[package]
name = "spin_wheel"
version = "0.1.0"
description = "Created with Anchor"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "spin_wheel"

[features]
no-entrypoint = []
no-idl = []
no-log-ix-name = []
cpi = ["no-entrypoint"]
default = []

[dependencies]
anchor-lang = "0.30.1"
anchor-spl = "0.30.1"
```

---

## Step 6: Build and Get Program ID

```bash
# Build the program
anchor build

# Get your program ID
solana address -k target/deploy/spin_wheel-keypair.json
```

**COPY THE PROGRAM ID**

---

## Step 7: Update Program ID

Edit `programs/spin_wheel/src/lib.rs` - Replace line 5:

```rust
declare_id!("YOUR_PROGRAM_ID_HERE");
```

Edit `Anchor.toml` - Replace the `[programs.devnet]` section:

```toml
[programs.devnet]
spin_wheel = "YOUR_PROGRAM_ID_HERE"
```

---

## Step 8: Rebuild and Deploy

```bash
# Rebuild with correct program ID
anchor build

# Deploy to devnet
anchor deploy

# Verify deployment
solana program show YOUR_PROGRAM_ID_HERE
```

---

## Step 9: Test Script

Replace `tests/spin_wheel.ts` with:

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SpinWheel } from "../target/types/spin_wheel";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import { 
  TOKEN_PROGRAM_ID, 
  createMint, 
  createAccount, 
  mintTo, 
  getAccount,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { expect } from "chai";

describe("spin_wheel", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SpinWheel as Program<SpinWheel>;
  
  let wolfTokenMint: PublicKey;
  let authorityTokenAccount: PublicKey;
  let devFeeTokenAccount: PublicKey;
  let playerTokenAccount: PublicKey;
  let gameStatePDA: PublicKey;
  let rewardPoolTokenAccount: PublicKey;
  let gameStateBump: number;

  before(async () => {
    console.log("Setting up test environment...");

    // Create test token (WOLF substitute)
    wolfTokenMint = await createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      null,
      9
    );

    console.log("✅ Test WOLF Token Mint:", wolfTokenMint.toBase58());

    // Derive game state PDA
    [gameStatePDA, gameStateBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("game_state")],
      program.programId
    );

    console.log("✅ Game State PDA:", gameStatePDA.toBase58());

    // Create authority token account
    const authorityATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      wolfTokenMint,
      provider.wallet.publicKey
    );
    authorityTokenAccount = authorityATA.address;

    // Create dev fee token account (same as authority for testing)
    devFeeTokenAccount = authorityTokenAccount;

    // Create player token account
    const playerATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      wolfTokenMint,
      provider.wallet.publicKey
    );
    playerTokenAccount = playerATA.address;

    // Mint tokens to player for testing
    await mintTo(
      provider.connection,
      provider.wallet.payer,
      wolfTokenMint,
      playerTokenAccount,
      provider.wallet.publicKey,
      1_000_000_000_000 // 1000 tokens
    );

    console.log("✅ Setup complete!");
  });

  it("Initializes the game and creates reward pool", async () => {
    // Find the reward pool address that will be created
    const rewardPoolKeypair = Keypair.generate();
    rewardPoolTokenAccount = rewardPoolKeypair.publicKey;

    const tx = await program.methods
      .initialize()
      .accounts({
        gameState: gameStatePDA,
        wolfTokenMint: wolfTokenMint,
        rewardPool: rewardPoolTokenAccount,
        authority: provider.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([rewardPoolKeypair])
      .rpc();

    console.log("Initialize transaction:", tx);

    const gameState = await program.account.gameState.fetch(gameStatePDA);
    expect(gameState.authority.toBase58()).to.equal(provider.wallet.publicKey.toBase58());
    expect(gameState.wolfTokenMint.toBase58()).to.equal(wolfTokenMint.toBase58());
    expect(gameState.rewardPool.toBase58()).to.equal(rewardPoolTokenAccount.toBase58());
    expect(gameState.totalSpins.toNumber()).to.equal(0);
    
    console.log("✅ Game initialized");
    console.log("   Reward Pool:", rewardPoolTokenAccount.toBase58());
  });

  it("Funds the reward pool", async () => {
    const fundAmount = new anchor.BN(100_000_000_000); // 100 tokens

    await program.methods
      .fundPool(fundAmount)
      .accounts({
        gameState: gameStatePDA,
        rewardPool: rewardPoolTokenAccount,
        funderTokenAccount: authorityTokenAccount,
        funder: provider.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const poolAccount = await getAccount(provider.connection, rewardPoolTokenAccount);
    expect(poolAccount.amount.toString()).to.equal(fundAmount.toString());
    
    console.log("✅ Pool funded with 100 tokens");
  });

  it("Spins the wheel", async () => {
    const betAmount = new anchor.BN(1_000_000_000); // 1 token

    const initialPlayerBalance = (await getAccount(provider.connection, playerTokenAccount)).amount;
    const initialPoolBalance = (await getAccount(provider.connection, rewardPoolTokenAccount)).amount;

    const tx = await program.methods
      .spin(betAmount)
      .accounts({
        gameState: gameStatePDA,
        rewardPool: rewardPoolTokenAccount,
        playerTokenAccount: playerTokenAccount,
        devFeeAccount: devFeeTokenAccount,
        player: provider.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const finalPlayerBalance = (await getAccount(provider.connection, playerTokenAccount)).amount;
    const finalPoolBalance = (await getAccount(provider.connection, rewardPoolTokenAccount)).amount;

    console.log("✅ Spin completed!");
    console.log("   Player balance change:", Number(finalPlayerBalance - initialPlayerBalance) / 1e9, "tokens");
    console.log("   Pool balance change:", Number(finalPoolBalance - initialPoolBalance) / 1e9, "tokens");

    const gameState = await program.account.gameState.fetch(gameStatePDA);
    expect(gameState.totalSpins.toNumber()).to.equal(1);
  });

  it("Spins 20 times to test probabilities", async () => {
    const betAmount = new anchor.BN(1_000_000_000); // 1 token
    let wins = 0;
    let losses = 0;

    for (let i = 0; i < 20; i++) {
      try {
        const tx = await program.methods
          .spin(betAmount)
          .accounts({
            gameState: gameStatePDA,
            rewardPool: rewardPoolTokenAccount,
            playerTokenAccount: playerTokenAccount,
            devFeeAccount: devFeeTokenAccount,
            player: provider.wallet.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();

        // Parse transaction logs to determine outcome
        const txDetails = await provider.connection.getTransaction(tx, {
          commitment: "confirmed",
        });
        
        const logs = txDetails?.meta?.logMessages || [];
        const hasWin = logs.some(log => log.includes("WIN"));
        
        if (hasWin) {
          wins++;
          console.log(`   Spin ${i + 1}: WIN ✨`);
        } else {
          losses++;
          console.log(`   Spin ${i + 1}: Loss`);
        }
      } catch (error) {
        console.log(`   Spin ${i + 1} failed:`, error.message);
      }
    }

    console.log("\n📊 Results after 20 spins:");
    console.log("   Wins:", wins);
    console.log("   Losses:", losses);
    console.log("   Win rate:", ((wins / 20) * 100).toFixed(1) + "%");

    const gameState = await program.account.gameState.fetch(gameStatePDA);
    console.log("   Total spins:", gameState.totalSpins.toNumber());
    console.log("   Dev fees collected:", Number(gameState.devFeesCollected) / 1e9, "tokens");
  });

  it("Tests minimum bet enforcement", async () => {
    const poolBalance = (await getAccount(provider.connection, rewardPoolTokenAccount)).amount;
    const minBet = Number(poolBalance) / 1000; // 0.1% of pool
    const tooSmallBet = new anchor.BN(Math.max(1, minBet - 1_000_000));

    try {
      await program.methods
        .spin(tooSmallBet)
        .accounts({
          gameState: gameStatePDA,
          rewardPool: rewardPoolTokenAccount,
          playerTokenAccount: playerTokenAccount,
          devFeeAccount: devFeeTokenAccount,
          player: provider.wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      
      expect.fail("Should have thrown BetTooLow error");
    } catch (error) {
      expect(error.message).to.include("BetTooLow");
      console.log("✅ Minimum bet validation works");
    }
  });

  it("Tests maximum bet enforcement", async () => {
    const poolBalance = (await getAccount(provider.connection, rewardPoolTokenAccount)).amount;
    const maxBet = Number(poolBalance) / 8;
    const tooBigBet = new anchor.BN(maxBet + 1_000_000_000);

    try {
      await program.methods
        .spin(tooBigBet)
        .accounts({
          gameState: gameStatePDA,
          rewardPool: rewardPoolTokenAccount,
          playerTokenAccount: playerTokenAccount,
          devFeeAccount: devFeeTokenAccount,
          player: provider.wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      
      expect.fail("Should have thrown BetTooHigh error");
    } catch (error) {
      expect(error.message).to.include("BetTooHigh");
      console.log("✅ Maximum bet validation works");
    }
  });

  it("Withdraws profits as authority", async () => {
    const withdrawAmount = new anchor.BN(5_000_000_000); // 5 tokens

    const initialAuthorityBalance = (await getAccount(provider.connection, authorityTokenAccount)).amount;
    const initialPoolBalance = (await getAccount(provider.connection, rewardPoolTokenAccount)).amount;

    await program.methods
      .withdrawProfits(withdrawAmount)
      .accounts({
        gameState: gameStatePDA,
        rewardPool: rewardPoolTokenAccount,
        authorityTokenAccount: authorityTokenAccount,
        authority: provider.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const finalAuthorityBalance = (await getAccount(provider.connection, authorityTokenAccount)).amount;
    const finalPoolBalance = (await getAccount(provider.connection, rewardPoolTokenAccount)).amount;
    
    const withdrawn = finalAuthorityBalance - initialAuthorityBalance;
    const poolDecrease = initialPoolBalance - finalPoolBalance;

    expect(withdrawn.toString()).to.equal(withdrawAmount.toString());
    expect(poolDecrease.toString()).to.equal(withdrawAmount.toString());
    
    console.log("✅ Withdrawn 5 tokens to authority");
  });

  it("Shows final statistics", async () => {
    const gameState = await program.account.gameState.fetch(gameStatePDA);
    const poolAccount = await getAccount(provider.connection, rewardPoolTokenAccount);
    const devAccount = await getAccount(provider.connection, devFeeTokenAccount);

    console.log("\n📈 Final Statistics:");
    console.log("   Total Spins:", gameState.totalSpins.toNumber());
    console.log("   Reward Pool Balance:", Number(poolAccount.amount) / 1e9, "tokens");
    console.log("   Dev Fees Collected:", Number(gameState.devFeesCollected) / 1e9, "tokens");
    console.log("   Dev Account Balance:", Number(devAccount.amount) / 1e9, "tokens");
  });
});
```

---

## Step 10: Install Test Dependencies

```bash
npm install --save-dev chai @types/chai @types/mocha
```

---

## Step 11: Run Tests

```bash
anchor test
```

---

## Step 12: Verify Deployment

```bash
# Check program
solana program show YOUR_PROGRAM_ID_HERE

# Check balance
solana balance

# Check token accounts
spl-token accounts
```
