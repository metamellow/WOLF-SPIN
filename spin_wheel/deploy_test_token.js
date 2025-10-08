const anchor = require('@coral-xyz/anchor');
const { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const { 
  createMint, 
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} = require('@solana/spl-token');
const fs = require('fs');

async function deployTestToken() {
  // Load the keypair
  const keypairData = JSON.parse(fs.readFileSync(process.env.HOME + '/.config/solana/wolf-spin-key.json', 'utf8'));
  const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
  
  // Set up connection
  const connection = new Connection('https://api.devnet.solana.com');
  
  console.log('🚀 Deploying test WOLF token...');
  console.log('Authority:', keypair.publicKey.toString());
  
  try {
    // Create test WOLF token
    const wolfTokenMint = await createMint(
      connection,
      keypair,
      keypair.publicKey, // mint authority
      null, // freeze authority
      9 // decimals
    );
    
    console.log('✅ WOLF Token Mint:', wolfTokenMint.toString());
    
    // Create authority token account using the simpler approach
    let authorityTokenAccount;
    try {
      authorityTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        keypair,
        wolfTokenMint,
        keypair.publicKey
      );
      console.log('✅ Authority Token Account:', authorityTokenAccount.address.toString());
    } catch (error) {
      console.log('❌ Error creating token account:', error.message);
      throw error;
    }
    
    // Mint 1,000,000 WOLF tokens to authority
    const mintAmount = 1_000_000_000_000; // 1,000,000 tokens (9 decimals)
    await mintTo(
      connection,
      keypair,
      wolfTokenMint,
      authorityTokenAccount.address,
      keypair,
      mintAmount
    );
    
    console.log('✅ Minted 1,000,000 WOLF tokens to authority');
    
    // Verify balance
    const balance = await getAccount(connection, authorityTokenAccount.address);
    console.log('✅ Authority balance:', Number(balance.amount) / 1e9, 'WOLF tokens');
    
    // Save token details
    const tokenDetails = {
      mint: wolfTokenMint.toString(),
      authority: keypair.publicKey.toString(),
      authorityTokenAccount: authorityTokenAccount.address.toString(),
      decimals: 9,
      totalSupply: mintAmount
    };
    
    fs.writeFileSync('test-token-details.json', JSON.stringify(tokenDetails, null, 2));
    console.log('✅ Token details saved to test-token-details.json');
    
    return tokenDetails;
    
  } catch (error) {
    console.error('❌ Error deploying test token:', error);
    throw error;
  }
}

if (require.main === module) {
  deployTestToken().catch(console.error);
}

module.exports = { deployTestToken };
