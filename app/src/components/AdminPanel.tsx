import React, { useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useProgram } from '../hooks/useProgram'

// Admin public key - replace with your actual admin key
const ADMIN_PUBLIC_KEY = '3XAgZaouZthDRH8VNLRCZX1jifYei5zjNN99vs1bXRoR'

interface AdminPanelProps {
  isOpen: boolean
  onClose: () => void
}

const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose }) => {
  const { publicKey } = useWallet()
  const { poolInfo, fundPool, loading, error } = useProgram()
  const [fundAmount, setFundAmount] = useState('')
  const [isFunding, setIsFunding] = useState(false)

  if (!isOpen) return null

  const handleFundPool = async () => {
    if (!fundAmount || isFunding) return

    try {
      setIsFunding(true)
      const amountLamports = Math.floor(parseFloat(fundAmount) * 1e9)
      await fundPool(amountLamports)
      setFundAmount('')
      alert(`Successfully funded pool with ${fundAmount} WOLF tokens!`)
    } catch (err) {
      console.error('Error funding pool:', err)
      alert(`Error funding pool: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIsFunding(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Admin Panel</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          {/* Pool Stats */}
          {poolInfo && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-2">Pool Statistics</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Balance:</span>
                  <span className="font-mono">{(poolInfo.balance / 1e9).toFixed(2)} WOLF</span>
                </div>
                <div className="flex justify-between">
                  <span>Min Bet:</span>
                  <span className="font-mono">{(poolInfo.minBet / 1e9).toFixed(4)} WOLF</span>
                </div>
                <div className="flex justify-between">
                  <span>Max Bet:</span>
                  <span className="font-mono">{(poolInfo.maxBet / 1e9).toFixed(2)} WOLF</span>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Fund Pool Amount (WOLF)
            </label>
            <input
              type="number"
              value={fundAmount}
              onChange={(e) => setFundAmount(e.target.value)}
              placeholder="1000"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          <button
            onClick={handleFundPool}
            disabled={!fundAmount || isFunding || loading}
            className={`w-full font-semibold py-3 px-4 rounded-lg transition-colors ${
              fundAmount && !isFunding && !loading
                ? 'bg-black hover:bg-gray-800 text-white'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isFunding ? 'Funding...' : 'Fund Pool'}
          </button>

          {error && (
            <div className="text-red-600 text-sm">
              {error}
            </div>
          )}

          <div className="text-xs text-gray-500 mt-4">
            Connected as: {publicKey?.toString().slice(0, 8)}...
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminPanel
