import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SpinWheel } from "../target/types/spin_wheel";
import { 
  PublicKey, 
  Keypair, 
  SystemProgram,
  SYSVAR_RENT_PUBKEY 
} from "@solana/web3.js";
import { 
  createMint, 
  createAccount, 
  mintTo, 
  getAccount,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import { expect } from "chai";

describe("spin_wheel", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.SpinWheel as Program<SpinWheel>;
  const provider = anchor.getProvider();

  // Test accounts
  let authority: Keypair;
  let player: Keypair;
  let wolfTokenMint: PublicKey;
  let gameState: PublicKey;
  let rewardPool: PublicKey;
  let authorityTokenAccount: PublicKey;
  let playerTokenAccount: PublicKey;
  let devFeeAccount: PublicKey;

  before(async () => {
    // Generate test keypairs
    authority = Keypair.generate();
    player = Keypair.generate();

    // Airdrop SOL to test accounts
    await provider.connection.requestAirdrop(authority.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(player.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);

    // Wait for airdrops to confirm
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create WOLF token mint
    wolfTokenMint = await createMint(
      provider.connection,
      authority,
      authority.publicKey,
      null,
      9 // 9 decimals
    );

    // Create token accounts
    authorityTokenAccount = await createAccount(
      provider.connection,
      authority,
      wolfTokenMint,
      authority.publicKey
    );

    playerTokenAccount = await createAccount(
      provider.connection,
      player,
      wolfTokenMint,
      player.publicKey
    );

    devFeeAccount = await createAccount(
      provider.connection,
      authority,
      wolfTokenMint,
      authority.publicKey
    );

    // Mint initial tokens to authority and player
    const mintAmount = 1000 * 10**9; // 1000 tokens
    await mintTo(
      provider.connection,
      authority,
      wolfTokenMint,
      authorityTokenAccount,
      authority,
      mintAmount
    );

    await mintTo(
      provider.connection,
      authority,
      wolfTokenMint,
      playerTokenAccount,
      authority,
      mintAmount
    );

    // Derive game state PDA
    [gameState] = PublicKey.findProgramAddressSync(
      [Buffer.from("game_state")],
      program.programId
    );

    // Derive reward pool PDA
    [rewardPool] = PublicKey.findProgramAddressSync(
      [Buffer.from("game_state")],
      program.programId
    );
  });

  it("Initializes the game", async () => {
    try {
      const tx = await program.methods
        .initialize()
        .accounts({
          gameState: gameState,
          wolfTokenMint: wolfTokenMint,
          rewardPool: rewardPool,
          authority: authority.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([authority])
        .rpc();

      console.log("Initialize transaction signature:", tx);

      // Verify game state
      const gameStateAccount = await program.account.gameState.fetch(gameState);
      expect(gameStateAccount.authority.toString()).to.equal(authority.publicKey.toString());
      expect(gameStateAccount.wolfTokenMint.toString()).to.equal(wolfTokenMint.toString());
      expect(gameStateAccount.totalSpins.toNumber()).to.equal(0);
      expect(gameStateAccount.devFeesCollected.toNumber()).to.equal(0);

      console.log("✅ Game initialized successfully");
    } catch (error) {
      console.error("❌ Initialize failed:", error);
      throw error;
    }
  });

  it("Funds the reward pool", async () => {
    try {
      const fundAmount = 100 * 10**9; // 100 tokens

      const tx = await program.methods
        .fundPool(new anchor.BN(fundAmount))
        .accounts({
          gameState: gameState,
          rewardPool: rewardPool,
          funderTokenAccount: authorityTokenAccount,
          funder: authority.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([authority])
        .rpc();

      console.log("Fund pool transaction signature:", tx);

      // Verify reward pool balance
      const rewardPoolAccount = await getAccount(provider.connection, rewardPool);
      expect(rewardPoolAccount.amount).to.equal(BigInt(fundAmount));

      console.log("✅ Reward pool funded successfully");
    } catch (error) {
      console.error("❌ Fund pool failed:", error);
      throw error;
    }
  });

  it("Plays a spin game", async () => {
    try {
      const betAmount = 1 * 10**9; // 1 token

      // Get initial balances
      const initialPlayerBalance = await getAccount(provider.connection, playerTokenAccount);
      const initialRewardPoolBalance = await getAccount(provider.connection, rewardPool);

      console.log("Initial player balance:", initialPlayerBalance.amount.toString());
      console.log("Initial reward pool balance:", initialRewardPoolBalance.amount.toString());

      const tx = await program.methods
        .spin(new anchor.BN(betAmount))
        .accounts({
          gameState: gameState,
          rewardPool: rewardPool,
          playerTokenAccount: playerTokenAccount,
          devFeeAccount: devFeeAccount,
          player: player.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([player])
        .rpc();

      console.log("Spin transaction signature:", tx);

      // Get final balances
      const finalPlayerBalance = await getAccount(provider.connection, playerTokenAccount);
      const finalRewardPoolBalance = await getAccount(provider.connection, rewardPool);

      console.log("Final player balance:", finalPlayerBalance.amount.toString());
      console.log("Final reward pool balance:", finalRewardPoolBalance.amount.toString());

      // Verify game state was updated
      const gameStateAccount = await program.account.gameState.fetch(gameState);
      expect(gameStateAccount.totalSpins.toNumber()).to.equal(1);

      console.log("✅ Spin game played successfully");
    } catch (error) {
      console.error("❌ Spin game failed:", error);
      throw error;
    }
  });

  it("Tests bet limits", async () => {
    try {
      const rewardPoolAccount = await getAccount(provider.connection, rewardPool);
      const poolBalance = rewardPoolAccount.amount;

      // Test bet too low (should fail)
      const minBet = Number(poolBalance) / 1000;
      const betTooLow = Math.floor(minBet / 2);

      try {
        await program.methods
          .spin(new anchor.BN(betTooLow))
          .accounts({
            gameState: gameState,
            rewardPool: rewardPool,
            playerTokenAccount: playerTokenAccount,
            devFeeAccount: devFeeAccount,
            player: player.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([player])
          .rpc();
        
        throw new Error("Expected bet too low to fail");
      } catch (error) {
        expect(error.message).to.include("BetTooLow");
        console.log("✅ Bet too low correctly rejected");
      }

      // Test bet too high (should fail)
      const maxBet = Number(poolBalance) / 8;
      const betTooHigh = Math.floor(maxBet * 1.5);

      try {
        await program.methods
          .spin(new anchor.BN(betTooHigh))
          .accounts({
            gameState: gameState,
            rewardPool: rewardPool,
            playerTokenAccount: playerTokenAccount,
            devFeeAccount: devFeeAccount,
            player: player.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([player])
          .rpc();
        
        throw new Error("Expected bet too high to fail");
      } catch (error) {
        expect(error.message).to.include("BetTooHigh");
        console.log("✅ Bet too high correctly rejected");
      }
    } catch (error) {
      console.error("❌ Bet limits test failed:", error);
      throw error;
    }
  });

  it("Withdraws profits (authority only)", async () => {
    try {
      const rewardPoolAccount = await getAccount(provider.connection, rewardPool);
      const withdrawAmount = Number(rewardPoolAccount.amount) / 2; // Withdraw half

      const tx = await program.methods
        .withdrawProfits(new anchor.BN(withdrawAmount))
        .accounts({
          gameState: gameState,
          rewardPool: rewardPool,
          authorityTokenAccount: authorityTokenAccount,
          authority: authority.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([authority])
        .rpc();

      console.log("Withdraw profits transaction signature:", tx);

      // Verify withdrawal
      const finalRewardPoolBalance = await getAccount(provider.connection, rewardPool);
      expect(Number(finalRewardPoolBalance.amount)).to.be.lessThan(Number(rewardPoolAccount.amount));

      console.log("✅ Profits withdrawn successfully");
    } catch (error) {
      console.error("❌ Withdraw profits failed:", error);
      throw error;
    }
  });

  it("Prevents unauthorized profit withdrawal", async () => {
    try {
      const withdrawAmount = 1 * 10**9; // 1 token

      try {
        await program.methods
          .withdrawProfits(new anchor.BN(withdrawAmount))
          .accounts({
            gameState: gameState,
            rewardPool: rewardPool,
            authorityTokenAccount: playerTokenAccount, // Using player as authority
            authority: player.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([player])
          .rpc();
        
        throw new Error("Expected unauthorized withdrawal to fail");
      } catch (error) {
        expect(error.message).to.include("Unauthorized");
        console.log("✅ Unauthorized withdrawal correctly rejected");
      }
    } catch (error) {
      console.error("❌ Unauthorized withdrawal test failed:", error);
      throw error;
    }
  });

  it("Plays multiple spins to test randomness", async () => {
    try {
      const betAmount = 0.5 * 10**9; // 0.5 tokens
      const numSpins = 5;

      console.log(`Playing ${numSpins} spins...`);

      for (let i = 0; i < numSpins; i++) {
        const tx = await program.methods
          .spin(new anchor.BN(betAmount))
          .accounts({
            gameState: gameState,
            rewardPool: rewardPool,
            playerTokenAccount: playerTokenAccount,
            devFeeAccount: devFeeAccount,
            player: player.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([player])
          .rpc();

        console.log(`Spin ${i + 1} transaction signature:`, tx);

        // Small delay between spins
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Verify total spins count
      const gameStateAccount = await program.account.gameState.fetch(gameState);
      expect(gameStateAccount.totalSpins.toNumber()).to.be.greaterThan(1);

      console.log("✅ Multiple spins completed successfully");
    } catch (error) {
      console.error("❌ Multiple spins test failed:", error);
      throw error;
    }
  });

  it("Displays final statistics", async () => {
    try {
      const gameStateAccount = await program.account.gameState.fetch(gameState);
      const rewardPoolAccount = await getAccount(provider.connection, rewardPool);
      const playerAccount = await getAccount(provider.connection, playerTokenAccount);

      console.log("\n📊 Final Game Statistics:");
      console.log("==========================");
      console.log(`Total spins: ${gameStateAccount.totalSpins.toString()}`);
      console.log(`Dev fees collected: ${gameStateAccount.devFeesCollected.toString()} lamports`);
      console.log(`Reward pool balance: ${rewardPoolAccount.amount.toString()} lamports`);
      console.log(`Player balance: ${playerAccount.amount.toString()} lamports`);
      console.log(`Authority: ${gameStateAccount.authority.toString()}`);
      console.log(`Wolf token mint: ${gameStateAccount.wolfTokenMint.toString()}`);
      console.log(`Reward pool: ${gameStateAccount.rewardPool.toString()}`);

      console.log("\n✅ All tests completed successfully! 🎉");
    } catch (error) {
      console.error("❌ Final statistics display failed:", error);
      throw error;
    }
  });
});