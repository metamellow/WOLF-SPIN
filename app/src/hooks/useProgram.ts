import { useState, useEffect, useCallback } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, getAccount } from '@solana/spl-token'
import { createProgram, getGameStatePDA, getRewardPoolPDA, WOLF_TOKEN_MINT } from '../lib/program'
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
      const [rewardPoolPDA] = getRewardPoolPDA()
      const poolAccount = await getAccount(programContext.connection, rewardPoolPDA)
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
      const [rewardPoolPDA] = getRewardPoolPDA()

      const tx = await programContext.program.methods
        .initialize()
        .accounts({
          gameState: gameStatePDA,
          wolfTokenMint: WOLF_TOKEN_MINT,
          rewardPool: rewardPoolPDA,
          authority: publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc()

      console.log('Initialize transaction:', tx)
      await fetchGameState()
      return tx

    } catch (err) {
      console.error('Error initializing game:', err)
      setError(err instanceof Error ? err.message : 'Failed to initialize game')
      throw err
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

      const [gameStatePDA] = getGameStatePDA()
      const [rewardPoolPDA] = getRewardPoolPDA()
      const funderTokenAccount = await getAssociatedTokenAddress(WOLF_TOKEN_MINT, publicKey)

      const tx = await programContext.program.methods
        .fundPool(amount)
        .accounts({
          gameState: gameStatePDA,
          rewardPool: rewardPoolPDA,
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
      setError(err instanceof Error ? err.message : 'Failed to fund pool')
      throw err
    } finally {
      setLoading(false)
    }
  }, [programContext, publicKey, fetchGameState])

  // Spin the wheel
  const spinWheel = useCallback(async (betAmount: number) => {
    if (!programContext || !publicKey) {
      throw new Error('Wallet not connected')
    }

    try {
      setLoading(true)
      setError(null)

      const [gameStatePDA] = getGameStatePDA()
      const [rewardPoolPDA] = getRewardPoolPDA()
      const playerTokenAccount = await getAssociatedTokenAddress(WOLF_TOKEN_MINT, publicKey)
      
      // For now, we'll use the authority as dev fee account
      // In production, this should be a separate dev account
      const devFeeAccount = await getAssociatedTokenAddress(WOLF_TOKEN_MINT, publicKey)

      const tx = await programContext.program.methods
        .spin(betAmount)
        .accounts({
          gameState: gameStatePDA,
          rewardPool: rewardPoolPDA,
          playerTokenAccount,
          devFeeAccount,
          player: publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc()

      console.log('Spin transaction:', tx)
      await fetchGameState()
      return tx

    } catch (err) {
      console.error('Error spinning wheel:', err)
      setError(err instanceof Error ? err.message : 'Failed to spin wheel')
      throw err
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
