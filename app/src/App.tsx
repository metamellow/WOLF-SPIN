import { WalletProvider } from './components/WalletProvider'
import SpinningWheel from './components/SpinningWheel'

function App() {
  return (
    <WalletProvider>
      <SpinningWheel />
    </WalletProvider>
  )
}

export default App