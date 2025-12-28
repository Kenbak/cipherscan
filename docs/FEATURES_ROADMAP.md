# CipherScan Features Roadmap

## 🔥 High Priority (Zooko-endorsed)

### Round-Trip Transaction Linking (Privacy Education)

**Source**: Twitter discussion (Dec 22, 2025)
**Status**: To implement
**Potential**: Indexer bounty candidate (suggested by @_TomHoward)

---

#### The Problem

**@zkDragon** (original idea):
> "Imagine someone shields 1.23456 ZEC, then someone unshields 1.2345 ZEC — they are likely the same person! (Only difference is tiny and likely to be tx fee)"

> "This has been a de-anonymization vector, as many ppl just shield then unshield months later, no activity in between"

---

#### The Solution

Detect potential "round-trip" transactions where someone:
1. **Shields** X ZEC (transparent → shielded)
2. Later **deshields** ~X ZEC (shielded → transparent)

If amounts are nearly identical (within tx fee tolerance ~1%), flag them as "potentially linked".

**Goal**: Educational - teach users that just shielding then deshielding without activity in between ≠ real privacy.

---

#### Community Support

**@zooko** (Zcash founder) - Full endorsement:
> "This would be a way to teach those people! People probably won't read anything we write about this critical issue, but maybe if they looked up their own tx and it said 'probably linked to $this-other-tx' then the penny would drop."

> "Although what will they do once they realize their transactions are linkable? What we don't want them to do is modify their just enough to avoid CipherScan's educational algorithm but not enough to avoid determined attackers, such as by subtracting 0.1 or something…"

> "So it should have a little **'ⓘ How is this linkage detected?'** tooltip that explains CipherScan's algorithm, that other observers out there are using more sophisticated algorithms to detect such linkage, and that **the only foolproof way to defeat them is to ZODL!**"

> "By the way, this issue is not hypothetical—**people are making this mistake all the time** because they've never thought about it. You can see it in real-time by following @ShieldedFlow"

> "CipherScan, if you do this you will be on the front line of education about the fundamental **'in-flight-vs-at-rest'** nature of privacy! (And fair warning: there will be at least one and probably more than one additional step in the educational arms race…)"

> "For example: run a **Twitter bot** that whenever @ShieldedFlows posts a linkable unshielding transaction, your bot replies showing the linked previous transaction. 🙂"

**@_TomHoward**:
> "Might be an interesting indexer bounty!"

**@RektPaws**:
> "That's clean attribution. Heuristic matching reduces false positives. Good step toward real on-chain accounting."

**@mineZcash**:
> "Maximum privacy comes from money at rest not constantly on the move."
> "You can get essentially the same thing by holding your ZEC in the shielded pool for awhile and withdrawing different amounts than you put in."

---

#### Technical Implementation

##### Phase 1: Database & Indexing
- [ ] Create `shielded_flows` table to track all shielding/deshielding with amounts
- [ ] Index transactions by amount for fast lookup
- [ ] Backfill historical data

##### Phase 2: Linkability Detection Algorithm
- [ ] For each deshielding, search for shieldings with similar amounts (±1% tolerance)
- [ ] Calculate a "linkability score" based on:
  - **Amount similarity** (closer = more likely linked)
  - **Time gap** (shorter = more likely linked)
  - **Uniqueness of amount** (rare amounts = higher linkability)
- [ ] API endpoint: `GET /api/tx/:txid/linkability`

##### Phase 3: Frontend Display
- [ ] Warning banner on transaction page: "⚠️ This transaction may be linkable"
- [ ] Show potential source transaction with link
- [ ] **Educational tooltip** (Zooko's requirement):
  - Explain how CipherScan detects the link
  - Warn that "real attackers use MORE sophisticated algorithms"
  - Recommend: "The only foolproof way is to ZODL"
  - Link to privacy best practices

##### Phase 4: Twitter Bot (Optional)
- [ ] Monitor @ShieldedFlows for new deshielding transactions
- [ ] Auto-detect linkable transactions
- [ ] Reply with educational message showing the potential link
- [ ] Promote "in-flight vs at-rest" privacy concept

##### Phase 5: Cross-Chain Linkability (Advanced - "Arms Race")

**Context** (from @zooko):
> "False negatives are the problem... an important next step in the arms race is that you have to monitor NEAR Intents, too… 😂"
> "Actually I mean you'll have to start monitoring the Bitcoin and Ethereum blockchains, too. 😂"

Users can bypass on-chain detection by going cross-chain:
```
Shield ZEC → Swap to ETH via NEAR Intents → Swap back to ZEC on new wallet
```

**Implementation ideas**:
- [ ] Correlate ZEC Flows data with shielding/deshielding events
- [ ] Detect pattern: Shield X ZEC → soon after, NEAR Intents outflow ~X ZEC
- [ ] Detect pattern: NEAR Intents inflow ~X ZEC → soon after, Deshield ~X ZEC
- [ ] Cross-reference with timing and amounts
- [ ] *Future*: Monitor ETH/BTC for ZEC-related swaps (DEXs, bridges)

**Note**: We already have ZEC Flows (NEAR Intents) integration - this gives us a head start! 🚀

---

#### Considerations

- **False positives possible** (as noted by @fullyshielded) - someone could deshield a similar amount on purpose
- Frame as "potential" not "definite" link
- Focus on **education**, not accusation
- Be **transparent** about algorithm limitations
- Emphasize that real attackers use more sophisticated methods
- The goal is to make users think: "Oh, I should ZODL instead"

---

## 📋 Backlog

### Light Mode Improvements
- [x] Homepage light mode
- [x] Network stats page light mode
- [x] Privacy page light mode
- [x] Fix theme flash (FOUC)
- [ ] Flows page light mode
- [ ] Transaction detail page light mode
- [ ] Block detail page light mode

### ZEC Flows (NEAR Intents)
- [x] Basic integration
- [x] Fix token symbol parsing (USDT/USDC detection)
- [ ] Add more known token addresses
- [ ] Show tx hash links to NEAR/destination chain explorers
- [ ] Historical volume charts
- [ ] **Net inflows/outflows by period** (community request):
  - 24h net flow (inflows - outflows)
  - 7 days net flow
  - 30 days net flow
  - Visual indicator: is ZEC flowing IN or OUT overall?

### Privacy Dashboard
- [ ] Real-time pool size updates (currently every 100 blocks)
- [ ] Shielding rate trends
- [ ] Pool health indicators

---

## 💡 Ideas (Not prioritized)

- Wallet privacy scoring
- Address clustering detection
- Exchange deposit/withdrawal tracking
- Mining pool flow analysis
