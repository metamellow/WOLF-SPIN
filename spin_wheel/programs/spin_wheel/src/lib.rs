use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};
use anchor_lang::solana_program::hash::hash;

declare_id!("2Sdz9VvLEXNu9f3Gm8S1BWpPjX5ZYUW72mKjwpxB4Hac");

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
        
        // Note: Token authority transfer removed for simplicity
        // The reward pool will be managed by the authority for now
        
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
            .checked_div(2)
            .ok_or(ErrorCode::CalculationError)?;

        require!(bet_amount >= min_bet, ErrorCode::InvalidOperation);
        require!(bet_amount <= max_bet, ErrorCode::InvalidOperation);

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
            require!(payout <= reward_pool_balance, ErrorCode::InsufficientFunds);
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
                authority: ctx.accounts.authority.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
            token::transfer(cpi_ctx, payout)?;

            emit!(SpinResult {
                player: ctx.accounts.player.key(),
                bet_amount,
                multiplier: multiplier_percent,
                payout,
                random_number,
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
            ErrorCode::InsufficientFunds
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
    let mut data = Vec::new();
    data.extend_from_slice(&clock.slot.to_le_bytes());
    data.extend_from_slice(&total_spins.to_le_bytes());
    data.extend_from_slice(&player.to_bytes());
    
    let random_seed = hash(&data);
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
        token::authority = authority,
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
        constraint = reward_pool.key() == game_state.reward_pool @ ErrorCode::InvalidOperation,
        constraint = reward_pool.mint == game_state.wolf_token_mint @ ErrorCode::InvalidOperation,
    )]
    pub reward_pool: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = player_token_account.mint == game_state.wolf_token_mint @ ErrorCode::InvalidOperation,
        constraint = player_token_account.owner == player.key() @ ErrorCode::InvalidOperation,
    )]
    pub player_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = dev_fee_account.mint == game_state.wolf_token_mint @ ErrorCode::InvalidOperation,
        constraint = dev_fee_account.owner == game_state.authority @ ErrorCode::InvalidOperation,
    )]
    pub dev_fee_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = authority.key() == game_state.authority @ ErrorCode::Unauthorized,
    )]
    pub authority: Signer<'info>,
    
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
        constraint = reward_pool.key() == game_state.reward_pool @ ErrorCode::InvalidOperation,
    )]
    pub reward_pool: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = authority_token_account.mint == game_state.wolf_token_mint @ ErrorCode::InvalidOperation,
        constraint = authority_token_account.owner == authority.key() @ ErrorCode::InvalidOperation,
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
        constraint = reward_pool.key() == game_state.reward_pool @ ErrorCode::InvalidOperation,
    )]
    pub reward_pool: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = funder_token_account.mint == game_state.wolf_token_mint @ ErrorCode::InvalidOperation,
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
    pub pool_balance: u64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid operation")]
    InvalidOperation,
    #[msg("Insufficient funds")]
    InsufficientFunds,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Calculation error")]
    CalculationError,
}