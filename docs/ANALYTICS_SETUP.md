# 📊 Analytics & SEO Setup Guide

## 🎯 Google Analytics 4 Setup

### Step 1: Create Google Analytics Account

1. Go to https://analytics.google.com
2. Click "Start measuring"
3. Create an account:
   - Account name: `CipherScan`
   - Data sharing settings: (your choice)

### Step 2: Create Property

1. Property name: `CipherScan Testnet`
2. Reporting timezone: `UTC`
3. Currency: `USD`

### Step 3: Set Up Data Stream

1. Platform: **Web**
2. Website URL: `https://testnet.cipherscan.app`
3. Stream name: `CipherScan Testnet`
4. Enhanced measurement: **Enable** (recommended)

### Step 4: Get Your Measurement ID

After creating the stream, you'll see your **Measurement ID** (format: `G-XXXXXXXXXX`)

**Copy this ID!**

### Step 5: Add to Your Project

#### For Local Development:

Create or update `.env.local`:

```bash
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
```

#### For Production (Netlify):

1. Go to Netlify Dashboard
2. Site settings → Environment variables
3. Add new variable:
   - **Key**: `NEXT_PUBLIC_GA_ID`
   - **Value**: `G-XXXXXXXXXX`
4. Redeploy your site

---

## 🔍 Google Search Console Setup

### Step 1: Add Your Property

1. Go to https://search.google.com/search-console
2. Click "Add property"
3. Choose "URL prefix": `https://testnet.cipherscan.app`

### Step 2: Verify Ownership

**Option A: HTML tag (Recommended)**

Add this to your `app/layout.tsx` metadata:

```typescript
export const metadata: Metadata = {
  // ... existing metadata
  verification: {
    google: 'YOUR_VERIFICATION_CODE',
  },
}
```

**Option B: HTML file**

Download the verification file and place it in `public/` folder.

### Step 3: Submit Sitemap

1. In Search Console, go to "Sitemaps"
2. Add new sitemap: `https://testnet.cipherscan.app/sitemap.xml`
3. Click "Submit"

---

## 📈 What You Can Track

### Google Analytics Dashboard

After 24-48 hours, you'll see:

- **Real-time users**: Who's on your site right now
- **Page views**: Most visited pages
- **User demographics**: Countries, devices, browsers
- **Traffic sources**: Direct, organic search, referral
- **Events**: Button clicks, form submissions (if configured)

### Google Search Console

- **Search queries**: What people search to find you
- **Impressions**: How many times your site appears in search
- **Click-through rate (CTR)**: % of people who click your link
- **Average position**: Your ranking in search results
- **Index coverage**: Which pages are indexed by Google

---

## 🎯 SEO Best Practices

### 1. Content Strategy

Create valuable content:
- `/about` - About CipherScan and Zcash
- `/faq` - Common questions about Zcash privacy
- `/guides` - How to use the explorer

### 2. Keywords to Target

- "Zcash explorer"
- "Zcash blockchain explorer"
- "ZEC testnet explorer"
- "Zcash privacy explorer"
- "Shielded transaction explorer"

### 3. Get Backlinks

Submit your site to:
- ✅ Zcash Forum: https://forum.zcashcommunity.com/
- ✅ Reddit r/zec
- ✅ Zcash Discord
- ✅ CoinGecko (add to explorer list)
- ✅ CoinMarketCap
- ✅ Awesome Zcash GitHub list

### 4. Social Media

Share on:
- Twitter/X with #Zcash #ZEC #Privacy
- LinkedIn (crypto/blockchain groups)
- Hacker News (if you have a good story)

---

## 🚀 Expected Results

### Week 1:
- Google starts crawling your site
- Sitemap indexed

### Month 1:
- 10-50 organic visitors/day
- Appearing in search for "zcash testnet explorer"

### Month 3:
- 50-200 organic visitors/day
- Ranking in top 10 for niche keywords

### Month 6:
- 200-1000 organic visitors/day
- Backlinks from Zcash community

---

## 💡 Pro Tips

1. **Update content regularly** - Google loves fresh content
2. **Optimize page speed** - Use Lighthouse in Chrome DevTools
3. **Mobile-first** - Most users are on mobile
4. **Internal linking** - Link between your pages
5. **Alt text for images** - Helps SEO and accessibility

---

## 📊 Monitoring Checklist

- [ ] Google Analytics installed and tracking
- [ ] Google Search Console verified
- [ ] Sitemap submitted
- [ ] robots.txt accessible
- [ ] Check analytics weekly
- [ ] Monitor Search Console monthly
- [ ] Track keyword rankings
- [ ] Analyze user behavior

---

## 🆘 Troubleshooting

**Analytics not showing data?**
- Wait 24-48 hours for data to appear
- Check if GA_ID is correct in environment variables
- Verify the script is loaded (check browser DevTools)

**Site not appearing in Google?**
- Wait 1-2 weeks after submitting sitemap
- Check Search Console for indexing issues
- Ensure robots.txt allows crawling

**Low traffic?**
- Create more content
- Get backlinks from Zcash community
- Share on social media
- Optimize for long-tail keywords

---

## 📚 Resources

- [Google Analytics 4 Documentation](https://support.google.com/analytics/answer/9304153)
- [Google Search Console Help](https://support.google.com/webmasters/)
- [Next.js SEO Guide](https://nextjs.org/learn/seo/introduction-to-seo)
- [Zcash Community Forum](https://forum.zcashcommunity.com/)

