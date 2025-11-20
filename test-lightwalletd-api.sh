#!/bin/bash

# Test Lightwalletd API Route
# This tests the /api/lightwalletd/scan endpoint with REAL data

echo "🧪 Testing Lightwalletd API Route (Production)"
echo ""

# Configuration
API_URL="https://api.testnet.cipherscan.app/api/lightwalletd/scan"
VIEWING_KEY="uviewtest1eruekgghjgquag8avaxa62wuk7ym7skgjv4gevvpmztk8gpzsjr7vvqs7ce5prqfg85su43y5t6t3pz5m5l22sxvz5zz4am6c4q2fv22jcz79wl5n3alzw6zzzt04eca6t6m5ufe07vsaj3rcddyx74fhdqxkgl258wjx8a3nsxmujfde8n5net07df9xffu6m0xa25vldk36jgm0hnfln3df7vfd89xv096xf2ywjgw3lqp6lnncp8dz2zvkgmgmzq8az2rdl9xp7enugjkwr66wmg5jmzdfmp9ewusp9jdkerdcvgnua7npyzlypxhjqvu58ypaukneseda5a5cj43rsh35kaa7j0jarcrtqmk6ssp8nkv7eja5prrzlt2wp5uwu6c0tz9x09m30vyka6rhdgwrmev2cvvz8tdx0w8f8llh55u0ahc990e9fqk224y3cntz6hhamdrf7skqvanu4zaam0eca5jsldwmvz7dks34vkan5ug"

# Birthday block for this viewing key (from Zingo CLI)
BIRTHDAY_BLOCK=3121131

# Get current block height
echo "📊 Fetching current block height..."
CURRENT_HEIGHT=$(curl -s https://api.testnet.cipherscan.app/api/info | grep -o '"blocks":"[0-9]*"' | grep -o '[0-9]*')
echo "   Current height: $CURRENT_HEIGHT"
echo "   Birthday block: $BIRTHDAY_BLOCK"
echo "   Blocks to scan: $((CURRENT_HEIGHT - BIRTHDAY_BLOCK))"
echo ""

# Test 1: Small range (10 blocks from birthday)
echo "📦 Test 1: Scanning 10 blocks from birthday ($BIRTHDAY_BLOCK - $((BIRTHDAY_BLOCK + 10)))"
echo ""

START_TIME=$(date +%s)
RESPONSE=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"startHeight\": $BIRTHDAY_BLOCK,
    \"endHeight\": $((BIRTHDAY_BLOCK + 10))
  }")
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
echo ""
echo "⏱️  Duration: ${DURATION}s"
echo "✅ Test 1 complete!"
echo ""
echo "=================================================="
echo ""

# Test 2: Larger range (1000 blocks from birthday)
echo "📦 Test 2: Scanning 1000 blocks from birthday ($BIRTHDAY_BLOCK - $((BIRTHDAY_BLOCK + 1000)))"
echo ""

START_TIME=$(date +%s)
RESPONSE=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"startHeight\": $BIRTHDAY_BLOCK,
    \"endHeight\": $((BIRTHDAY_BLOCK + 1000))
  }")
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Extract summary
SUCCESS=$(echo "$RESPONSE" | grep -o '"success":[^,]*' | cut -d':' -f2)
BLOCKS_SCANNED=$(echo "$RESPONSE" | grep -o '"blocksScanned":[0-9]*' | cut -d':' -f2)
TX_COUNT=$(echo "$RESPONSE" | grep -o '"hash":' | wc -l)

  echo "   Success: $SUCCESS"
  echo "   Blocks scanned: $BLOCKS_SCANNED"
  echo "   Transactions found: $TX_COUNT"
  echo "   Duration: ${DURATION}s"
  if [ "$DURATION" -gt 0 ]; then
    echo "   Speed: $((BLOCKS_SCANNED / DURATION)) blocks/sec"
  else
    echo "   Speed: INSTANT! (< 1s)"
  fi
echo ""
echo "✅ Test 2 complete!"
echo ""
echo "=================================================="
echo ""

# Test 3: FULL SCAN from birthday to current
TOTAL_BLOCKS=$((CURRENT_HEIGHT - BIRTHDAY_BLOCK))

echo "📦 Test 3: FULL SCAN from birthday to current ($BIRTHDAY_BLOCK - $CURRENT_HEIGHT)"
echo "   Total blocks: $TOTAL_BLOCKS"
echo "   ⚠️  This may take a few minutes..."
echo ""

  START_TIME=$(date +%s)
  RESPONSE=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -d "{
      \"startHeight\": $BIRTHDAY_BLOCK,
      \"endHeight\": $CURRENT_HEIGHT
    }")
  END_TIME=$(date +%s)
  DURATION=$((END_TIME - START_TIME))

  # Extract summary
  SUCCESS=$(echo "$RESPONSE" | grep -o '"success":[^,]*' | cut -d':' -f2)
  BLOCKS_SCANNED=$(echo "$RESPONSE" | grep -o '"blocksScanned":[0-9]*' | cut -d':' -f2)
  TX_COUNT=$(echo "$RESPONSE" | grep -o '"hash":' | wc -l)

  echo "   Success: $SUCCESS"
  echo "   Blocks scanned: $BLOCKS_SCANNED"
  echo "   Transactions found: $TX_COUNT"
  echo "   Duration: ${DURATION}s"
  if [ "$DURATION" -gt 0 ]; then
    echo "   Speed: $((BLOCKS_SCANNED / DURATION)) blocks/sec"
  else
    echo "   Speed: INSTANT! (< 1s)"
  fi
  echo ""
  echo "✅ Test 3 complete!"

echo ""
echo "=================================================="
echo ""
echo "🎉 All tests complete!"
echo ""
echo "Next steps:"
echo "1. If all tests passed, Lightwalletd is working correctly!"
echo "2. Update frontend to use /api/lightwalletd/scan"
echo "3. Test memo decryption with WASM"
