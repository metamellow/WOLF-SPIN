import React from 'react'
import { WalletProvider } from './components/WalletProvider'
import BettingWheel from './components/BettingWheel'
import './App.css'

function App() {
  return (
    <WalletProvider>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <BettingWheel />
      </div>
    </WalletProvider>
  )
}

export default App
