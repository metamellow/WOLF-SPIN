import { AnchorProvider, Program } from '@coral-xyz/anchor'
import { Connection, PublicKey } from '@solana/web3.js'
import type { WalletContextState } from '@solana/wallet-adapter-react'
import { IDL } from '../idl/spin_wheel'

// Program ID from deployed contract
export const PROGRAM_ID = new PublicKey('8vMotdQTcxhgXfUQdoJTqoFaAKLjJsTxw4iP4yGvGiHY')

// WOLF Token Mint (Devnet) - test token deployed
export const WOLF_TOKEN_MINT = new PublicKey('5BM3bRG44QtKKfTfmxvue4GC4gbe4MsCmcDi8Zs8zy9U')

// RPC endpoint
// const DEVNET_RPC = 'https://api.devnet.solana.com'
const MAINNET_RPC = 'https://api.mainnet-beta.solana.com'

export interface ProgramContext {
  program: Program
  provider: AnchorProvider
  connection: Connection
}

export const createProgram = (wallet: WalletContextState): ProgramContext | null => {
  try {
    if (!wallet.publicKey || !wallet.signTransaction) {
      console.log('createProgram: Wallet not ready', { publicKey: !!wallet.publicKey, signTransaction: !!wallet.signTransaction })
      return null
    }

    console.log('createProgram: Creating program context...')
    const connection = new Connection(MAINNET_RPC, 'confirmed')
    
    const provider = new AnchorProvider(
      connection,
      wallet as any,
      { commitment: 'confirmed' }
    )

        const program = new Program(IDL, provider)
    console.log('createProgram: Program created successfully')

    return {
      program,
      provider,
      connection
    }
  } catch (error) {
    console.error('createProgram: Error creating program', error)
    throw error
  }
}

// Helper function to get game state PDA
export const getGameStatePDA = (): [PublicKey, number] => {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('game_state')],
    PROGRAM_ID
  )
}

// Helper function to get reward pool PDA
export const getRewardPoolPDA = (): [PublicKey, number] => {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('reward_pool')],
    PROGRAM_ID
  )
}

// Helper function to get associated token address
export const getAssociatedTokenAddress = async (
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey> => {
  const { getAssociatedTokenAddress } = await import('@solana/spl-token')
  return getAssociatedTokenAddress(mint, owner)
}
