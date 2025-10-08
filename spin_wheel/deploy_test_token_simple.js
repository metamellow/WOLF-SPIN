const { execSync } = require('child_process');
const fs = require('fs');

async function deployTestToken() {
  try {
    console.log('🚀 Deploying test WOLF token using Solana CLI...');
    
    // Get the current authority
    const authority = execSync('solana address', { encoding: 'utf8' }).trim();
    console.log('✅ Authority:', authority);
    
    // Create a new token mint using spl-token CLI
    console.log('📝 Creating token mint...');
    const createOutput = execSync('spl-token create-token --url devnet', { encoding: 'utf8' });
    const mintMatch = createOutput.match(/Creating token ([A-Za-z0-9]+)/);
    if (!mintMatch) {
      throw new Error('Failed to extract token mint from output');
    }
    const tokenMint = mintMatch[1];
    console.log('✅ WOLF Token Mint:', tokenMint);
    
    // Create token account
    console.log('📝 Creating token account...');
    const accountOutput = execSync(`spl-token create-account ${tokenMint} --url devnet`, { encoding: 'utf8' });
    const accountMatch = accountOutput.match(/Creating account ([A-Za-z0-9]+)/);
    if (!accountMatch) {
      throw new Error('Failed to extract token account from output');
    }
    const tokenAccount = accountMatch[1];
    console.log('✅ Token Account:', tokenAccount);
    
    // Mint tokens
    console.log('📝 Minting 1,000,000 tokens...');
    execSync(`spl-token mint ${tokenMint} 1000000 --url devnet`, { encoding: 'utf8' });
    console.log('✅ Minted 1,000,000 WOLF tokens');
    
    // Verify balance
    const balanceOutput = execSync(`spl-token balance ${tokenMint} --url devnet`, { encoding: 'utf8' });
    console.log('✅ Token Balance:', balanceOutput.trim());
    
    // Save token details
    const tokenDetails = {
      mint: tokenMint,
      authority: authority,
      authorityTokenAccount: tokenAccount,
      decimals: 9,
      totalSupply: 1000000
    };
    
    fs.writeFileSync('test-token-details.json', JSON.stringify(tokenDetails, null, 2));
    console.log('✅ Token details saved to test-token-details.json');
    
    console.log('\n🎉 Test WOLF token deployed successfully!');
    console.log('📋 Token Details:');
    console.log(`   Mint: ${tokenMint}`);
    console.log(`   Authority: ${authority}`);
    console.log(`   Token Account: ${tokenAccount}`);
    console.log(`   Balance: 1,000,000 WOLF tokens`);
    
  } catch (error) {
    console.error('❌ Error deploying test token:', error.message);
    throw error;
  }
}

deployTestToken().catch(console.error);
