import React, { useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { useProgram } from '../hooks/useProgram'

const BettingWheel: React.FC = () => {
  const { connected } = useWallet()
  const { gameState, poolInfo, loading, error, initializeGame, spinWheel } = useProgram()
  const [betAmount, setBetAmount] = useState('')
  const [isSpinning, setIsSpinning] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [wheelRotation, setWheelRotation] = useState(0)

  console.log('BettingWheel render:', { connected, gameState, poolInfo, loading, error })

  // Show a simple fallback if there's an error
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Error</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="bg-gray-900 text-white px-6 py-3 rounded-lg hover:bg-gray-800"
          >
            Reload Page
          </button>
        </div>
      </div>
    )
  }

  // Wheel segments with proper distribution
  const segments = [
    { color: '#ef4444', label: 'LOSS', multiplier: 0, probability: 60, angle: 216 }, // 60% - 216 degrees
    { color: '#f59e0b', label: '1.2x', multiplier: 1.2, probability: 20, angle: 72 }, // 20% - 72 degrees  
    { color: '#10b981', label: '2x', multiplier: 2, probability: 10, angle: 36 }, // 10% - 36 degrees
    { color: '#3b82f6', label: '4x', multiplier: 4, probability: 10, angle: 36 }, // 10% - 36 degrees
  ]

  const handleSpin = async () => {
    if (!connected || !betAmount || !poolInfo) return
    
    const bet = parseFloat(betAmount) * 1e9 // Convert to lamports
    const minBet = poolInfo.minBet
    const maxBet = poolInfo.maxBet
    
    if (bet < minBet) {
      alert(`Minimum bet: ${(minBet / 1e9).toFixed(4)} WOLF`)
      return
    }
    
    if (bet > maxBet) {
      alert(`Maximum bet: ${(maxBet / 1e9).toFixed(4)} WOLF`)
      return
    }
    
    setIsSpinning(true)
    setResult(null)
    
    try {
      // Start wheel animation
      const spins = 5 + Math.random() * 5 // 5-10 spins
      const randomAngle = Math.random() * 360
      const finalRotation = (spins * 360) + randomAngle
      setWheelRotation(prev => prev + finalRotation)
      
      // Call the real program
      const tx = await spinWheel(bet)
      console.log('Spin transaction:', tx)
      
      // The result will be updated when the program emits the SpinResult event
      // For now, we'll show a success message
      setResult({
        outcome: 'Transaction submitted',
        multiplier: 0,
        payout: 0,
        bet: bet / 1e9,
        profit: 0,
        tx
      })
      
    } catch (err) {
      console.error('Spin failed:', err)
      alert(`Spin failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIsSpinning(false)
    }
  }

  if (!connected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center max-w-md mx-auto p-8">
          <img 
            src="/assets/wolf-banner-bw.png" 
            alt="WOLF SPIN" 
            className="w-full h-auto mb-8"
          />
          <h1 className="text-4xl font-bold text-gray-900 mb-4">WOLF SPIN</h1>
          <p className="text-xl text-gray-600 mb-8">In $WOLF We Trust</p>
          <WalletMultiButton className="!bg-black !text-white hover:!bg-gray-800 !px-8 !py-4 !text-lg !rounded-xl" />
        </div>
      </div>
    )
  }

  // Show loading state
  if (loading && !gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-lg text-gray-600">Loading game state...</p>
        </div>
      </div>
    )
  }

  // Show initial loading state
  if (!connected && !loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <div className="animate-pulse rounded-full h-12 w-12 bg-gray-300 mx-auto mb-4"></div>
          <p className="text-lg text-gray-600">Initializing...</p>
        </div>
      </div>
    )
  }

  // Show error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Error</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="bg-gray-900 text-white px-6 py-3 rounded-lg hover:bg-gray-800"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-6xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-4 mb-4">
            <img 
              src="/assets/wolf-logo-trans-a.png" 
              alt="WOLF" 
              className="w-12 h-12"
            />
            <h1 className="text-4xl font-bold text-gray-900">WOLF SPIN</h1>
          </div>
          <p className="text-gray-600 mb-4">In $WOLF We Trust</p>
          <div className="flex items-center justify-center space-x-4">
            <WalletMultiButton className="!bg-black !text-white hover:!bg-gray-800 !px-6 !py-3 !rounded-lg" />
            <div className="text-sm text-gray-500">
              Pool: {poolInfo ? (poolInfo.balance / 1e9).toFixed(2) : '0.00'} WOLF
            </div>
          </div>
        </div>

        {/* Game not initialized */}
        {!gameState && (
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-8 mb-8">
            <h3 className="text-2xl font-bold text-yellow-800 mb-4 text-center">Game Not Initialized</h3>
            <p className="text-yellow-700 mb-6 text-center">
              The game needs to be initialized before you can start playing. This only needs to be done once.
            </p>
            <div className="flex justify-center space-x-4">
              <button
                onClick={initializeGame}
                disabled={loading}
                className="bg-yellow-600 text-white px-6 py-3 rounded-lg hover:bg-yellow-700 disabled:opacity-50"
              >
                {loading ? 'Initializing...' : 'Initialize Game'}
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          {/* Wheel Section */}
          <div className="flex flex-col items-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-8">Spin the Wheel</h2>
            
            {/* Wheel Container */}
            <div className="relative mb-8">
              {/* Wheel */}
              <div 
                className="w-80 h-80 rounded-full border-8 border-gray-900 relative overflow-hidden shadow-2xl transition-transform duration-3000 ease-out"
                style={{ transform: `rotate(${wheelRotation}deg)` }}
              >
                {/* Segments */}
                {segments.map((segment, index) => {
                  const startAngle = segments.slice(0, index).reduce((acc, s) => acc + s.angle, 0)
                  
                  return (
                    <div
                      key={index}
                      className="absolute inset-0"
                      style={{
                        background: `conic-gradient(from ${startAngle}deg, ${segment.color} 0deg, ${segment.color} ${segment.angle}deg, transparent ${segment.angle}deg)`
                      }}
                    />
                  )
                })}
                
                {/* Center Circle */}
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-20 h-20 bg-white rounded-full flex items-center justify-center border-4 border-gray-900 shadow-lg">
                  <img 
                    src="/assets/wolf-logo-trans-b.png" 
                    alt="WOLF" 
                    className="w-10 h-10"
                  />
                </div>
              </div>
              
              {/* Pointer */}
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                <div className="w-0 h-0 border-l-6 border-r-6 border-b-12 border-l-transparent border-r-transparent border-b-gray-900"></div>
              </div>
            </div>

            {/* Bet Input */}
            <div className="w-full max-w-sm space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Bet Amount (WOLF)
                </label>
                <input
                  type="number"
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  placeholder="Enter bet amount"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-gray-900 focus:outline-none text-lg"
                  disabled={isSpinning}
                />
              </div>
              
              <button
                onClick={handleSpin}
                disabled={!betAmount || isSpinning}
                className="w-full bg-gray-900 text-white py-4 rounded-xl font-bold text-xl hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSpinning ? 'SPINNING...' : 'SPIN WHEEL'}
              </button>
            </div>
          </div>

          {/* Results & Info Section */}
          <div className="space-y-6">
            {/* Last Result */}
            {result && (
              <div className="bg-white rounded-2xl p-8 shadow-lg border-2 border-gray-200">
                <h3 className="text-2xl font-bold text-gray-900 mb-6 text-center">Result</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-3 border-b border-gray-200">
                    <span className="text-lg font-medium">Outcome:</span>
                    <span className={`text-2xl font-bold ${
                      result.multiplier === 0 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {result.outcome}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-gray-200">
                    <span className="text-lg font-medium">Multiplier:</span>
                    <span className="text-2xl font-bold">{result.multiplier}x</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-gray-200">
                    <span className="text-lg font-medium">Bet:</span>
                    <span className="text-xl">{(result.bet / 1e9).toFixed(4)} WOLF</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-gray-200">
                    <span className="text-lg font-medium">Payout:</span>
                    <span className="text-xl">{(result.payout / 1e9).toFixed(4)} WOLF</span>
                  </div>
                  <div className="flex justify-between items-center py-3">
                    <span className="text-lg font-medium">Profit/Loss:</span>
                    <span className={`text-xl font-bold ${
                      result.profit >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {result.profit >= 0 ? '+' : ''}{(result.profit / 1e9).toFixed(4)} WOLF
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Wheel Segments Info */}
            <div className="bg-white rounded-2xl p-8 shadow-lg border-2 border-gray-200">
              <h3 className="text-2xl font-bold text-gray-900 mb-6 text-center">Wheel Segments</h3>
              <div className="space-y-4">
                {segments.map((segment, index) => (
                  <div key={index} className="flex items-center justify-between py-3 border-b border-gray-200 last:border-b-0">
                    <div className="flex items-center space-x-3">
                      <div 
                        className="w-6 h-6 rounded-full"
                        style={{ backgroundColor: segment.color }}
                      ></div>
                      <span className="text-lg font-medium">{segment.label}</span>
                    </div>
                    <span className="text-lg font-bold">{segment.probability}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Pool Info */}
            <div className="bg-white rounded-2xl p-8 shadow-lg border-2 border-gray-200">
              <h3 className="text-2xl font-bold text-gray-900 mb-6 text-center">Pool Status</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center py-3 border-b border-gray-200">
                  <span className="text-lg font-medium">Pool Balance:</span>
                  <span className="text-xl font-bold">
                    {poolInfo ? (poolInfo.balance / 1e9).toFixed(2) : '0.00'} WOLF
                  </span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-gray-200">
                  <span className="text-lg font-medium">Min Bet:</span>
                  <span className="text-lg">
                    {poolInfo ? (poolInfo.minBet / 1e9).toFixed(4) : '0.0000'} WOLF
                  </span>
                </div>
                <div className="flex justify-between items-center py-3">
                  <span className="text-lg font-medium">Max Bet:</span>
                  <span className="text-lg">
                    {poolInfo ? (poolInfo.maxBet / 1e9).toFixed(2) : '0.00'} WOLF
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BettingWheel

