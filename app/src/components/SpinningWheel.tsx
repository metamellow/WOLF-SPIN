import React, { useState, useRef, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { getAccount } from '@solana/spl-token'
import confetti from 'canvas-confetti'
import AdminPanel from './AdminPanel'
import { useProgram } from '../hooks/useProgram'
import { WOLF_TOKEN_MINT } from '../lib/program'

interface WheelSegment {
  color: string
  label: string
  multiplier: number
  probability: number
  angle: number
}

const SpinningWheel: React.FC = () => {
  const { connected, publicKey } = useWallet()
  const { 
    gameState,
    poolInfo, 
    loading, 
    error, 
    spinWheel, 
    fetchGameState 
  } = useProgram()
  
  const [isSpinning, setIsSpinning] = useState(false)
  const [totalRotation, setTotalRotation] = useState(0)
  const [currentVisualPosition, setCurrentVisualPosition] = useState(0)
  const [result, setResult] = useState<WheelSegment | null>(null)
  const [betAmount, setBetAmount] = useState('0.1')
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [isAdjusting, setIsAdjusting] = useState(false)
  const [spinError, setSpinError] = useState<string | null>(null)
  const [userWolfBalance, setUserWolfBalance] = useState<number>(0)
  const wheelRef = useRef<HTMLDivElement>(null)
  const validationTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Admin public key - replace with your actual admin key
  const ADMIN_PUBLIC_KEY = 'EohTDz5Hit8Y2zQHUKJW9kbPDjxpk5WRBsVxDX9B8iyz'
  const isAdmin = publicKey?.toString() === ADMIN_PUBLIC_KEY

  // Fetch user's WOLF balance
  const fetchUserWolfBalance = async () => {
    if (!publicKey) return
    
    try {
      const { getAssociatedTokenAddress } = await import('@solana/spl-token')
      const { Connection } = await import('@solana/web3.js')
      
      const connection = new Connection('https://api.devnet.solana.com', 'confirmed')
      const userTokenAccount = await getAssociatedTokenAddress(WOLF_TOKEN_MINT, publicKey)
      
      try {
        const account = await getAccount(connection, userTokenAccount)
        setUserWolfBalance(Number(account.amount) / 1e9)
      } catch (err) {
        // Token account doesn't exist yet
        setUserWolfBalance(0)
      }
    } catch (err) {
      console.error('Error fetching WOLF balance:', err)
      setUserWolfBalance(0)
    }
  }

  // Fetch WOLF balance when wallet connects
  useEffect(() => {
    if (connected && publicKey) {
      fetchUserWolfBalance()
    } else {
      setUserWolfBalance(0)
    }
  }, [connected, publicKey])

  // Set default bet amount to min bet when pool info is available
  useEffect(() => {
    if (poolInfo && betAmount === '0.1') {
      const minBet = poolInfo.minBet / 1e9
      setBetAmount(minBet.toString())
    }
  }, [poolInfo])

  // Wheel segments with exact multipliers: 0x 1.2x 0x 4x 0x 0x 1.2x 0x 2x 0x
  const segments: WheelSegment[] = [
    { color: '#000000', label: '0x', multiplier: 0, probability: 10, angle: 36 }, // Black background
    { color: '#ffffff', label: '1.2x', multiplier: 1.2, probability: 10, angle: 36 }, // White background
    { color: '#000000', label: '0x', multiplier: 0, probability: 10, angle: 36 }, // Black background
    { color: '#ffffff', label: '4x', multiplier: 4, probability: 10, angle: 36 }, // White background
    { color: '#000000', label: '0x', multiplier: 0, probability: 10, angle: 36 }, // Black background
    { color: '#ffffff', label: '0x', multiplier: 0, probability: 10, angle: 36 }, // White background
    { color: '#000000', label: '1.2x', multiplier: 1.2, probability: 10, angle: 36 }, // Black background
    { color: '#ffffff', label: '0x', multiplier: 0, probability: 10, angle: 36 }, // White background
    { color: '#000000', label: '2x', multiplier: 2, probability: 10, angle: 36 }, // Black background
    { color: '#ffffff', label: '0x', multiplier: 0, probability: 10, angle: 36 }, // White background
  ]

  // 10 equal sectors of 36° each, but starting from -90° (matching conic-gradient)
  const VALUE_SECTORS = Array.from({ length: 10 }, (_, i) => ({
    start: -90 + (i * 36),
    end: -90 + ((i + 1) * 36),
    value: i
  }))

  // Helper functions
  const calculateClockwisePath = (currentAngle: number, targetAngle: number): number => {
    let path = targetAngle - currentAngle
    if (path <= 0) {
      path += 360
    }
    return path
  }


  const getValueSectorCenter = (targetValue: number): number => {
    const sector = VALUE_SECTORS.find(s => s.value === targetValue)
    if (!sector) throw new Error(`Invalid value: ${targetValue}`)
    // Calculate center of the sector
    // Since the pointer is at 0°, we need to rotate the wheel so the center
    // of the target sector ends up at 0° (under the pointer)
    const center = (sector.start + sector.end) / 2
    return center
  }

  // Bet validation and auto-adjustment with delay
  const handleBetChange = (value: string) => {
    setBetAmount(value)
    
    // Clear existing timeout
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current)
    }
    
    // Set new timeout for validation
    validationTimeoutRef.current = setTimeout(() => {
      const numValue = parseFloat(value)
      if (isNaN(numValue) || numValue <= 0) {
        setIsAdjusting(true)
        setBetAmount('0.1')
        setTimeout(() => setIsAdjusting(false), 1000)
        return
      }
      
      // Use real pool limits if available, otherwise fallback
      const minBet = poolInfo ? poolInfo.minBet / 1e9 : 0.1
      const maxBet = poolInfo ? poolInfo.maxBet / 1e9 : 100
      
      if (numValue < minBet) {
        setIsAdjusting(true)
        setBetAmount(minBet.toString())
        setTimeout(() => setIsAdjusting(false), 1000)
      } else if (numValue > maxBet) {
        setIsAdjusting(true)
        setBetAmount(maxBet.toString())
        setTimeout(() => setIsAdjusting(false), 1000)
      }
    }, 2000) // 2 second delay
  }


  const handleSpin = async () => {
    if (!connected || !betAmount || isSpinning) return

    // Check if game is initialized
    if (!gameState) {
      setSpinError('Game not initialized. Please initialize the game first.')
      return
    }

    setIsSpinning(true)
    setResult(null)
    setSpinError(null)

    try {
      // Convert bet amount to lamports (9 decimals)
      const betAmountLamports = Math.floor(parseFloat(betAmount) * 1e9)
      
      console.log('Spinning with bet amount:', betAmountLamports, 'lamports')

      // Call blockchain spin
      let spinResponse
      try {
        spinResponse = await spinWheel(betAmountLamports)
        console.log('Spin transaction:', spinResponse.tx)
        console.log('🎯 ACTUAL BLOCKCHAIN RESULT:', spinResponse.result)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to spin wheel'
        
        // Check if it's a "already processed" error (which means success)
        if (errorMessage.includes('already been processed')) {
          console.log('Transaction already processed - this means it succeeded!')
          
          // For now, we'll show a loss since we can't easily determine the result from the error case
          // Balance updates will happen after the wheel animation completes
          spinResponse = {
            tx: 'already-processed',
            result: {
              isWin: false,
              multiplier: 0,
              payout: 0,
              segment: '0x'
            }
          }
          console.log('🎯 USING DEFAULT LOSS RESULT for already processed transaction')
        } else {
          throw err // Re-throw other errors
        }
      }
      
      // Game state and balance updates will happen after the wheel animation completes

      // Use the actual result from the blockchain
      const actualResult = spinResponse.result
      const selectedSegment = segments.find(s => s.label === actualResult.segment) || segments[0]
      const randomIndex = segments.findIndex(s => s.label === actualResult.segment)

      console.log('🎯 USING ACTUAL RESULT:', selectedSegment.label, 'at index:', randomIndex)

      // Step 1: Calculate target position
      const targetSectorCenter = getValueSectorCenter(randomIndex)
      
      // The issue: we want the center of the sector to be under the pointer (at 0°)
      // But our current calculation puts the edge under the pointer
      // We need to rotate the wheel so the center of the target sector ends up at 0°
      const targetSector = VALUE_SECTORS[randomIndex]
      
      // The conic-gradient starts from -90°, so the first segment is at -90° to -54°
      // The pointer is at 0°, so we need to rotate the wheel so the center of the
      // target sector ends up at 0° (under the pointer)
      // Since the sector center is at targetSectorCenter, we need to rotate by
      // (0 - targetSectorCenter) degrees to bring the center to 0°
      let baseTarget = (0 - targetSectorCenter) % 360
      
      // Add random variance (±8°) for more natural-looking results
      // but keep it well within the sector bounds (36° per sector)
      const variance = (Math.random() - 0.5) * 16 // ±8 degrees
      const clampedTarget = (baseTarget + variance) % 360

      console.log('🎯 VISUAL POSITIONING:')
      console.log('  Target sector center:', targetSectorCenter, '°')
      console.log('  Base target:', baseTarget.toFixed(2), '°')
      console.log('  Random variance:', variance.toFixed(2), '°')
      console.log('  Final target (with variance):', clampedTarget.toFixed(2), '°')
      console.log('  Sector bounds:', targetSector.start, '° to', targetSector.end, '°')

      // Step 2: Calculate required rotation
      const requiredRotation = calculateClockwisePath(currentVisualPosition, clampedTarget)
      
      // Add multiple full rotations for visual effect (6-8 rotations)
      const fullRotations = 6 + Math.floor(Math.random() * 3)
      const fullRotationsDegrees = fullRotations * 360
      
      // Total additional rotation needed
      const totalAdditionalRotation = fullRotationsDegrees + requiredRotation

      console.log('Required rotation:', requiredRotation, 'Total additional:', totalAdditionalRotation)

      // Step 3: Update state
      const newTotalRotation = totalRotation + totalAdditionalRotation
      const newVisualPosition = clampedTarget

      setTotalRotation(newTotalRotation)
      setCurrentVisualPosition(newVisualPosition)

      // Show result after animation
      setTimeout(() => {
        setResult(selectedSegment)
        setIsSpinning(false)
        
        // Trigger confetti if player wins
        if (selectedSegment.multiplier > 0) {
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#000000', '#ffffff', '#666666']
          })
        }
        
        // Refresh all balances after spin animation completes
        fetchGameState()
        fetchUserWolfBalance()
      }, 3000)

    } catch (err) {
      console.error('Error spinning wheel:', err)
      setSpinError(err instanceof Error ? err.message : 'Failed to spin wheel')
      setIsSpinning(false)
    }
  }



  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-black text-white py-4">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {/* WOLF Logo with white background */}
              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center p-2 shadow-lg">
                <img
                  src="/assets/wolf-logo-trans-a.png"
                  alt="WOLF"
                  className="w-8 h-8 object-contain"
                />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight">WOLF SPIN</h1>
                <p className="text-gray-300 text-sm">In $WOLF We Trust</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <WalletMultiButton className="!bg-white !text-black !px-4 !py-2 !rounded-lg !font-semibold !text-sm hover:!bg-gray-100 !transition-all !duration-200" />
              {isAdmin && (
                <button
                  onClick={() => setShowAdminPanel(true)}
                  className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-2 rounded-lg font-medium transition-all duration-200 text-sm"
                >
                  Admin
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Game Area */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-2 gap-8 items-center">
          
          {/* Spinning Wheel */}
          <div className="flex justify-center">
            <div className="relative">
              {/* Static shadow container */}
              <div className="absolute inset-0 w-64 h-64 lg:w-80 lg:h-80 rounded-full shadow-xl"></div>
              
              <div className="relative w-64 h-64 lg:w-80 lg:h-80">
                {/* Wheel Container */}
                    <div 
                      ref={wheelRef}
                      className="w-full h-full rounded-full border-4 border-gray-200 overflow-hidden relative"
                      style={{ 
                        transform: `rotate(${totalRotation}deg)`,
                        transition: isSpinning ? 'transform 3s cubic-bezier(0.17, 0.67, 0.12, 0.99)' : 'none',
                    background: `conic-gradient(
                      from -90deg,
                      #000000 0deg 36deg,
                      #ffffff 36deg 72deg,
                      #000000 72deg 108deg,
                      #ffffff 108deg 144deg,
                      #000000 144deg 180deg,
                      #ffffff 180deg 216deg,
                      #000000 216deg 252deg,
                      #ffffff 252deg 288deg,
                      #000000 288deg 324deg,
                      #ffffff 324deg 360deg
                    )`
                  }}
                >
                  {/* Segment Labels */}
                  {segments.map((segment, index) => {
                    const angle = index * 36 + 18 + 90 // Center of each segment, adjusted for -90deg start
                    
                    return (
                      <div
                        key={index}
                        className="absolute inset-0 flex items-center justify-center"
                        style={{ 
                          transform: `rotate(${angle}deg) translateY(-90px)`,
                          transformOrigin: 'center'
                        }}
                      >
                        <span className={`font-black text-lg lg:text-xl ${
                          segment.color === '#000000' ? 'text-black' : 'text-white'
                        }`} style={{
                          textShadow: segment.color === '#000000' 
                            ? '1px 1px 2px rgba(255,255,255,0.8)' 
                            : '1px 1px 2px rgba(0,0,0,0.8)'
                        }}>
                          {segment.label}
                        </span>
                      </div>
                    )
                  })}
                </div>

                {/* Center Circle */}
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-black rounded-full shadow-xl flex items-center justify-center border-4 border-white">
                  <div className="w-8 h-8 bg-white rounded-full"></div>
                </div>

                {/* Pointer */}
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-2 z-20">
                  <div className="w-0 h-0 border-l-4 border-r-4 border-t-8 border-l-transparent border-r-transparent border-t-gray-600"></div>
                </div>
              </div>
            </div>
          </div>

          {/* Game Controls */}
          <div className="bg-white rounded-2xl p-6 border-2 border-gray-100 shadow-lg slide-up">
            <h2 className="text-2xl font-black text-black mb-6 text-center">Place Your Bet</h2>
            
            {/* Bet Amount Input */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-3">
                <label className="block text-gray-800 text-sm font-semibold">
                  Bet Amount
                </label>
                <div className="text-sm text-gray-600">
                  Balance: <span className="font-semibold text-black">{userWolfBalance.toFixed(2)} WOLF</span>
                </div>
              </div>
              <div className="relative">
                <input
                  type="number"
                  value={betAmount}
                  onChange={(e) => handleBetChange(e.target.value)}
                  placeholder="0.1"
                  step="0.1"
                  min="0.1"
                  max="100"
                  className={`w-full px-4 py-3 bg-gray-50 border-2 rounded-xl text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-300 text-lg font-semibold transition-all duration-200 ${
                    isAdjusting 
                      ? 'border-orange-400 bg-orange-50 animate-pulse' 
                      : 'border-gray-200'
                  }`}
                  disabled={isSpinning}
                />
                <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-600 font-bold text-sm">
                  WOLF
                </div>
              </div>
            </div>

             {/* Spin Button */}
             <button
               onClick={handleSpin}
               disabled={!connected || !betAmount || isSpinning || loading || !poolInfo}
               className={`w-full py-4 px-6 rounded-xl font-black text-lg transition-all duration-200 transform btn-hover ${
                 connected && betAmount && !isSpinning && !loading && poolInfo
                   ? 'bg-black text-white hover:bg-gray-800 hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl'
                   : 'bg-gray-200 text-gray-400 cursor-not-allowed'
               }`}
             >
               {isSpinning ? (
                 <div className="flex items-center justify-center space-x-2">
                   <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                   <span>Spinning...</span>
                 </div>
               ) : loading ? (
                 <div className="flex items-center justify-center space-x-2">
                   <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                   <span>Loading...</span>
                 </div>
               ) : (
                 'SPIN THE WHEEL'
               )}
             </button>

             {/* Error Display */}
             {(error || spinError) && (
               <div className="mt-4 p-3 bg-red-100 border-2 border-red-300 rounded-xl">
                 <div className="text-red-800 text-sm font-medium">
                   {error || spinError}
                 </div>
               </div>
             )}

            {/* Result Display */}
            {result && (
              <div className="mt-6 p-4 bg-gray-50 rounded-xl border-2 border-gray-200 bounce-in">
                <h3 className="text-lg font-black text-black mb-4 text-center">Result</h3>
                <div className="text-center">
                  <div className="text-4xl font-black text-black mb-3">{result.label}</div>
                  {result.multiplier > 0 ? (
                    <div className="bg-green-100 border-2 border-green-300 rounded-xl p-4">
                      <div className="text-lg font-bold text-green-800 mb-2">🎉 YOU WIN! 🎉</div>
                      <div className="text-2xl font-black text-green-600">
                        {(parseFloat(betAmount) * result.multiplier).toFixed(2)} WOLF
                      </div>
                      <div className="text-sm text-green-700 mt-1">
                        {result.multiplier}x multiplier on {betAmount} WOLF bet
                      </div>
                    </div>
                  ) : (
                    <div className="bg-red-100 border-2 border-red-300 rounded-xl p-4">
                      <div className="text-lg font-bold text-red-800 mb-2">Better luck next time!</div>
                      <div className="text-sm text-red-600">You lost {betAmount} WOLF</div>
                    </div>
                  )}
                </div>
              </div>
            )}

             {/* Game Stats */}
             <div className="mt-6 space-y-2 text-sm text-gray-600">
               <div className="flex justify-between items-center py-1 border-b border-gray-100">
                 <span className="font-medium">Pool Balance</span>
                 <span className="font-bold text-black">
                   {poolInfo ? `${(poolInfo.balance / 1e9).toFixed(2)} WOLF` : 'Loading...'}
                 </span>
               </div>
               <div className="flex justify-between items-center py-1 border-b border-gray-100">
                 <span className="font-medium">Min Bet</span>
                 <span className="font-bold text-black">
                   {poolInfo ? `${(poolInfo.minBet / 1e9).toFixed(4)} WOLF` : 'Loading...'}
                 </span>
               </div>
               <div className="flex justify-between items-center py-1">
                 <span className="font-medium">Max Bet</span>
                 <span className="font-bold text-black">
                   {poolInfo ? `${(poolInfo.maxBet / 1e9).toFixed(2)} WOLF` : 'Loading...'}
                 </span>
               </div>
             </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-100 py-8">
        <div className="max-w-6xl mx-auto px-6 text-center text-gray-600 text-sm">
          <p>Built on Solana • Powered by WOLF Token</p>
        </div>
      </div>

      {/* Admin Panel */}
      <AdminPanel 
        isOpen={showAdminPanel} 
        onClose={() => setShowAdminPanel(false)} 
      />
    </div>
  )
}

export default SpinningWheel
