import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['buffer', 'process', 'util', 'crypto', 'stream', 'events', 'os', 'path', 'fs']
    })
  ],
  define: {
    global: 'globalThis',
  },
  server: {
    port: 3000,
    host: true
  },
  build: {
    target: 'es2020',
    outDir: 'dist'
  },
  optimizeDeps: {
    include: [
      'buffer',
      'process',
      'util',
      'crypto',
      'stream',
      'events',
      'os',
      'path',
      'fs',
      '@solana/web3.js',
      '@solana/spl-token',
      '@coral-xyz/anchor',
      'elliptic',
      'bn.js',
      'hash.js',
      'cipher-base',
      'create-hash',
      'create-hmac',
      'randombytes',
      'browserify-cipher',
      'browserify-sign',
      'create-ecdh',
      'diffie-hellman',
      'miller-rabin',
      'parse-asn1',
      'pbkdf2',
      'public-encrypt',
      'ripemd160',
      'sha.js',
      'stream-browserify',
      'timers-browserify',
      'events',
      '@walletconnect/time',
      'pino',
      'pino/browser'
    ]
  }
})