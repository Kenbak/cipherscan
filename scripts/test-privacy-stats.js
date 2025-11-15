#!/usr/bin/env node

/**
 * Test Privacy Stats Calculator
 * Tests the calculation on a small sample of blocks
 */

const { main } = require('./calculate-privacy-stats.js');

// Override to only scan last 100 blocks for testing
process.env.TEST_MODE = 'true';
process.env.TEST_BLOCK_LIMIT = '100';

console.log('🧪 Testing privacy stats calculator on last 100 blocks...\n');

main().then(() => {
  console.log('\n✅ Test completed successfully!');
  console.log('\n📝 Next steps:');
  console.log('1. Review data/privacy-stats.json');
  console.log('2. Test API: curl http://localhost:3000/api/privacy-stats');
  console.log('3. Setup cron job for daily updates');
}).catch((error) => {
  console.error('\n❌ Test failed:', error.message);
  process.exit(1);
});
