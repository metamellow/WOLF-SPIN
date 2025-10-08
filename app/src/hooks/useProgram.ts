import { useState, useEffect, useCallback } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Keypair } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, getAccount } from '@solana/spl-token'
import * as anchor from '@coral-xyz/anchor'
import { createProgram, getGameStatePDA, WOLF_TOKEN_MINT } from '../lib/program'
import type { ProgramContext } from '../lib/program'

export interface GameState {
  authority: PublicKey
  wolfTokenMint: PublicKey
  rewardPool: PublicKey
  totalSpins: number
  devFeesCollected: number
  bump: number
}

export interface PoolInfo {
  balance: number
  minBet: number
  maxBet: number
}

export const useProgram = () => {
  const { publicKey, signTransaction, connected } = useWallet()
  const [programContext, setProgramContext] = useState<ProgramContext | null>(null)
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [poolInfo, setPoolInfo] = useState<PoolInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize program context when wallet connects
  useEffect(() => {
    console.log('useProgram: Wallet state changed', { connected, publicKey: !!publicKey, signTransaction: !!signTransaction })
    
    if (connected && publicKey && signTransaction) {
      try {
        const context = createProgram({ publicKey, signTransaction } as any)
        console.log('useProgram: Program context created', context)
        setProgramContext(context)
      } catch (error) {
        console.error('useProgram: Error creating program context', error)
        setError(error instanceof Error ? error.message : 'Failed to create program context')
      }
    } else {
      setProgramContext(null)
      setGameState(null)
      setPoolInfo(null)
    }
  }, [connected, publicKey, signTransaction])

  // Fetch game state
  const fetchGameState = useCallback(async () => {
    if (!programContext) return

    try {
      setLoading(true)
      setError(null)

      const [gameStatePDA] = getGameStatePDA()
      const gameStateAccount = await (programContext.program.account as any).gameState.fetch(gameStatePDA)
      
      setGameState({
        authority: gameStateAccount.authority,
        wolfTokenMint: gameStateAccount.wolfTokenMint,
        rewardPool: gameStateAccount.rewardPool,
        totalSpins: gameStateAccount.totalSpins.toNumber(),
        devFeesCollected: gameStateAccount.devFeesCollected.toNumber(),
        bump: gameStateAccount.bump
      })

        // Fetch pool balance
        const poolAccount = await getAccount(programContext.connection, gameStateAccount.rewardPool)
      const balance = Number(poolAccount.amount)
      
      setPoolInfo({
        balance,
        minBet: Math.max(100000, balance / 1000), // 0.1% of pool, min 0.0001 tokens
        maxBet: balance / 8 // 12.5% of pool
      })

    } catch (err) {
      console.error('Error fetching game state:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch game state')
    } finally {
      setLoading(false)
    }
  }, [programContext])

  // Initialize game (authority only)
  const initializeGame = useCallback(async () => {
    if (!programContext || !publicKey) {
      throw new Error('Wallet not connected')
    }

    try {
      setLoading(true)
      setError(null)

      const [gameStatePDA] = getGameStatePDA()
      
      // Generate a new keypair for the reward pool token account
      const rewardPoolKeypair = Keypair.generate()

      // Create the associated token account for the reward pool
      await getAssociatedTokenAddress(
        WOLF_TOKEN_MINT,
        rewardPoolKeypair.publicKey
      )

      const tx = await programContext.program.methods
        .initialize()
        .accounts({
          gameState: gameStatePDA,
          wolfTokenMint: WOLF_TOKEN_MINT,
          rewardPool: rewardPoolKeypair.publicKey,
          authority: publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([rewardPoolKeypair])
        .rpc()

      console.log('Initialize transaction:', tx)
      await fetchGameState()
      return tx

    } catch (err) {
      console.error('Error initializing game:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize game'
      
      // Check if it's a "already processed" error (which means success)
      if (errorMessage.includes('already been processed')) {
        console.log('Transaction already processed - this means it succeeded!')
        setError(null) // Clear error since transaction actually succeeded
      } else {
        setError(errorMessage)
        throw err
      }
    } finally {
      setLoading(false)
    }
  }, [programContext, publicKey, fetchGameState])


  // Fund pool
  const fundPool = useCallback(async (amount: number) => {
    if (!programContext || !publicKey) {
      throw new Error('Wallet not connected')
    }

    try {
      setLoading(true)
      setError(null)

      // Fetch game state first to get the reward pool address
      const [gameStatePDA] = getGameStatePDA()
      const gameStateAccount = await (programContext.program.account as any).gameState.fetch(gameStatePDA)
      
      const funderTokenAccount = await getAssociatedTokenAddress(WOLF_TOKEN_MINT, publicKey)

      console.log('Available methods:', Object.keys(programContext.program.methods))
      
      const tx = await programContext.program.methods
        .fundPool(new anchor.BN(amount))
        .accounts({
          gameState: gameStatePDA,
          rewardPool: gameStateAccount.rewardPool,
          funderTokenAccount,
          funder: publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc()

      console.log('Fund pool transaction:', tx)
      await fetchGameState()
      return tx

    } catch (err) {
      console.error('Error funding pool:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to fund pool'
      
      // Check if it's a "already processed" error (which means success)
      if (errorMessage.includes('already been processed')) {
        console.log('Transaction already processed - this means it succeeded!')
        setError(null) // Clear error since transaction actually succeeded
      } else {
        setError(errorMessage)
        throw err
      }
    } finally {
      setLoading(false)
    }
  }, [programContext, publicKey, fetchGameState])

  // Spin the wheel
  const spinWheel = useCallback(async (betAmount: number) => {
    if (!programContext || !publicKey) {
      throw new Error('Wallet not connected')
    }

    // Declare variables in outer scope so they're accessible in catch block
    let userBalanceBefore = 0
    let userBalanceAfter = 0
    let poolBalanceBefore = 0

    try {
      setLoading(true)
      setError(null)

      // Fetch game state first to get the reward pool address
      const [gameStatePDA] = getGameStatePDA()
      const gameStateAccount = await (programContext.program.account as any).gameState.fetch(gameStatePDA)
      
      console.log('Game state:', {
        authority: gameStateAccount.authority.toString(),
        wolfTokenMint: gameStateAccount.wolfTokenMint.toString(),
        rewardPool: gameStateAccount.rewardPool.toString(),
        totalSpins: gameStateAccount.totalSpins.toNumber(),
        devFeesCollected: gameStateAccount.devFeesCollected.toNumber()
      })
      
      // Get current pool balance for debugging
      try {
        const poolAccount = await getAccount(programContext.connection, gameStateAccount.rewardPool)
        const poolBalance = Number(poolAccount.amount)
        const minBet = Math.max(100000, poolBalance / 1000) // 0.1% of pool, min 0.0001 tokens
        const maxBet = poolBalance / 8 // 12.5% of pool
        
        poolBalanceBefore = poolBalance / 1e9
        console.log('🏦 Pool balance BEFORE spin:', poolBalanceBefore, 'WOLF tokens')
        console.log('Min bet:', minBet / 1e9, 'WOLF tokens')
        console.log('Max bet:', maxBet / 1e9, 'WOLF tokens')
        console.log('Bet amount:', betAmount / 1e9, 'WOLF tokens')
        console.log('Reward pool address:', gameStateAccount.rewardPool.toString())
      } catch (poolError) {
        console.error('Error fetching pool account:', poolError)
        throw new Error('Reward pool account not found or invalid')
      }
      
      const playerTokenAccount = await getAssociatedTokenAddress(WOLF_TOKEN_MINT, publicKey)
      
      // Log user's WOLF balance BEFORE the transaction
      try {
        const userAccountBefore = await getAccount(programContext.connection, playerTokenAccount)
        userBalanceBefore = Number(userAccountBefore.amount) / 1e9
        console.log('🪙 User WOLF balance BEFORE spin:', userBalanceBefore, 'WOLF')
      } catch (err) {
        console.log('🪙 User WOLF balance BEFORE spin: 0 WOLF (no token account)')
      }
      
      // For now, we'll use the authority as dev fee account
      // In production, this should be a separate dev account
      const devFeeAccount = await getAssociatedTokenAddress(WOLF_TOKEN_MINT, publicKey)

      const tx = await programContext.program.methods
        .spin(new anchor.BN(betAmount))
        .accounts({
          gameState: gameStatePDA,
          rewardPool: gameStateAccount.rewardPool,
          playerTokenAccount,
          devFeeAccount,
          authority: publicKey, // Add authority account
          player: publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc()

      console.log('Spin transaction:', tx)
      
      // Log user's WOLF balance AFTER the transaction
      try {
        const userAccountAfter = await getAccount(programContext.connection, playerTokenAccount)
        userBalanceAfter = Number(userAccountAfter.amount) / 1e9
        console.log('🪙 User WOLF balance AFTER spin:', userBalanceAfter, 'WOLF')
      } catch (err) {
        console.log('🪙 User WOLF balance AFTER spin: 0 WOLF (no token account)')
      }
      
      // Log pool balance AFTER the transaction
      try {
        const poolAccountAfter = await getAccount(programContext.connection, gameStateAccount.rewardPool)
        const poolBalanceAfter = Number(poolAccountAfter.amount) / 1e9
        console.log('🏦 Pool balance AFTER spin:', poolBalanceAfter, 'WOLF')
        
        // Calculate the difference
        const poolChange = poolBalanceAfter - poolBalanceBefore
        console.log('📊 Pool change:', poolChange > 0 ? `+${poolChange}` : `${poolChange}`, 'WOLF')
        
        // Try to get user balance change
        try {
          const userChange = userBalanceAfter - userBalanceBefore
          console.log('📊 User balance change:', userChange > 0 ? `+${userChange}` : `${userChange}`, 'WOLF')
          
          // Calculate expected vs actual
          const betAmountWOLF = betAmount / 1e9
          console.log('🎯 Bet amount:', betAmountWOLF, 'WOLF')
          console.log('💡 Expected user change for LOSS:', `-${betAmountWOLF}`, 'WOLF')
          console.log('💡 Expected user change for WIN (1.2x):', `+${betAmountWOLF * 1.2}`, 'WOLF (bet back + 20% profit)')
          console.log('💡 Expected user change for WIN (2x):', `+${betAmountWOLF * 2}`, 'WOLF (bet back + 100% profit)')
          console.log('💡 Expected user change for WIN (4x):', `+${betAmountWOLF * 4}`, 'WOLF (bet back + 300% profit)')
          
          // Analysis
          console.log('🔍 ANALYSIS:')
          if (userChange < 0) {
            console.log('   Result: LOSS (user balance decreased)')
            const actualLoss = Math.abs(userChange)
            const expectedLoss = betAmountWOLF
            if (Math.abs(actualLoss - expectedLoss) < 0.01) {
              console.log('   ✅ Loss amount is correct')
            } else {
              console.log('   ❌ Loss amount is WRONG!')
              console.log(`   Expected loss: ${expectedLoss} WOLF`)
              console.log(`   Actual loss: ${actualLoss} WOLF`)
              console.log(`   Difference: ${Math.abs(actualLoss - expectedLoss)} WOLF`)
            }
          } else if (userChange > 0) {
            console.log('   Result: WIN (user balance increased)')
            const actualWin = userChange
            const expectedWin1_2x = betAmountWOLF * 1.2
            const expectedWin2x = betAmountWOLF * 2
            const expectedWin4x = betAmountWOLF * 4
            
            if (Math.abs(actualWin - expectedWin1_2x) < 0.01) {
              console.log('   ✅ Win amount matches 1.2x multiplier')
            } else if (Math.abs(actualWin - expectedWin2x) < 0.01) {
              console.log('   ✅ Win amount matches 2x multiplier')
            } else if (Math.abs(actualWin - expectedWin4x) < 0.01) {
              console.log('   ✅ Win amount matches 4x multiplier')
            } else {
              console.log('   ❌ Win amount does not match any expected multiplier!')
              console.log(`   Actual win: ${actualWin} WOLF`)
              console.log(`   Expected 1.2x: ${expectedWin1_2x} WOLF (bet back + 20% profit)`)
              console.log(`   Expected 2x: ${expectedWin2x} WOLF (bet back + 100% profit)`)
              console.log(`   Expected 4x: ${expectedWin4x} WOLF (bet back + 300% profit)`)
            }
          } else {
            console.log('   Result: NO CHANGE (user balance unchanged)')
          }
        } catch (userErr) {
          console.log('📊 User balance change: Could not calculate')
        }
      } catch (err) {
        console.log('🏦 Pool balance AFTER spin: Error fetching')
      }
      
      await fetchGameState()
      
      // Determine the actual result based on balance changes
      const betAmountWOLF = betAmount / 1e9
      const userChange = userBalanceAfter - userBalanceBefore
      
      let actualResult = {
        isWin: false,
        multiplier: 0,
        payout: 0,
        segment: '0x'
      }
      
      if (userChange > 0) {
        // User won - determine multiplier based on payout
        actualResult.isWin = true
        actualResult.payout = userChange
        
        // Determine multiplier based on payout
        if (Math.abs(userChange - (betAmountWOLF * 1.2)) < 0.01) {
          actualResult.multiplier = 1.2
          actualResult.segment = '1.2x'
        } else if (Math.abs(userChange - (betAmountWOLF * 2)) < 0.01) {
          actualResult.multiplier = 2
          actualResult.segment = '2x'
        } else if (Math.abs(userChange - (betAmountWOLF * 4)) < 0.01) {
          actualResult.multiplier = 4
          actualResult.segment = '4x'
        }
      } else {
        // User lost
        actualResult.isWin = false
        actualResult.multiplier = 0
        actualResult.payout = 0
        actualResult.segment = '0x'
      }
      
      console.log('🎯 DETERMINED ACTUAL RESULT:', actualResult)
      
      return { tx, result: actualResult }

    } catch (err) {
      console.error('Error spinning wheel:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to spin wheel'
      
      // Check if it's a "already processed" error (which means success)
      if (errorMessage.includes('already been processed')) {
        console.log('Transaction already processed - this means it succeeded!')
        setError(null) // Clear error since transaction actually succeeded
        
        // Still need to determine the result and return the same structure
        const betAmountWOLF = betAmount / 1e9
        const userChange = userBalanceAfter - userBalanceBefore
        
        let actualResult = {
          isWin: false,
          multiplier: 0,
          payout: 0,
          segment: '0x'
        }
        
        if (userChange > 0) {
          // User won - determine multiplier based on payout
          actualResult.isWin = true
          actualResult.payout = userChange
          
          // Determine multiplier based on payout
          if (Math.abs(userChange - (betAmountWOLF * 1.2)) < 0.01) {
            actualResult.multiplier = 1.2
            actualResult.segment = '1.2x'
          } else if (Math.abs(userChange - (betAmountWOLF * 2)) < 0.01) {
            actualResult.multiplier = 2
            actualResult.segment = '2x'
          } else if (Math.abs(userChange - (betAmountWOLF * 4)) < 0.01) {
            actualResult.multiplier = 4
            actualResult.segment = '4x'
          }
        } else {
          // User lost
          actualResult.isWin = false
          actualResult.multiplier = 0
          actualResult.payout = 0
          actualResult.segment = '0x'
        }
        
        console.log('🎯 DETERMINED ACTUAL RESULT (already processed):', actualResult)
        
        // Don't throw error, return the result instead
        return { tx: 'already-processed', result: actualResult }
      } else {
        setError(errorMessage)
        throw err
      }
    } finally {
      setLoading(false)
    }
  }, [programContext, publicKey, fetchGameState])

  // Auto-fetch game state when program context changes
  useEffect(() => {
    if (programContext) {
      console.log('useProgram: Fetching game state...')
      fetchGameState().catch(err => {
        console.error('useProgram: Error fetching game state', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch game state')
      })
    }
  }, [programContext, fetchGameState])

  return {
    programContext,
    gameState,
    poolInfo,
    loading,
    error,
    fetchGameState,
    initializeGame,
    fundPool,
    spinWheel
  }
}
