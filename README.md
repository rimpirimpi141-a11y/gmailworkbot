# Zenox Mail & Social Master Pro — Cloudflare Workers Telegram Bot (`worker.js`)

A high-performance, zero-dependency, single-file Telegram Bot (`worker.js`) built on **Cloudflare Workers (ES Modules)** with **Cloudflare KV (`env.DB`)** for full state management, Gmail & Facebook account trading, colon-free credential formatting, recovery mail security notices, dynamic rate management, user inspection, and multi-admin operations.

---

## 📁 Repository File Structure

```text
├── worker.js          # Complete single-file Telegram Bot (ES Modules, zero dependencies)
├── wrangler.toml      # Cloudflare Workers configuration with KV binding `DB`
├── package.json       # Minimal Wrangler CLI scripts for local dev & deployment
├── .env.example       # Template for `.dev.vars` (local development secrets)
├── .gitignore         # Ignores node_modules, .wrangler, .dev.vars, and .env files
└── README.md          # Complete deployment, KV setup, and webhook guide
```

---

## ✨ Key Features & Architecture Upgrades

1. **Mail Master Pro Style Admin Control Center (`⚡ Admin Dashboard` / `/admin`)**
   - **📊 Inventory & Stats:** Live overview of registered users, active Gmail stock, active Facebook stock, pending buy/sell/payout queues, and current rates.
   - **👥 View User List & 🔍 Inspect User:** Paginated directory of all registered users with inline `🔍 Inspect` cards showing wallet balance, total lifetime earnings, buy/sell history, and direct admin actions (`➕ Add Balance`, `➖ Deduct Balance`, `🚫 Ban / ✅ Unban User`).
   - **⚙️ Set Rates & Min Withdraw:** Interactive inline configuration panel to dynamically update Buy/Sell rates for Gmail and Facebook, Referral Bonus, USDT Exchange Rate, and the **Minimum Withdrawal limit (default strictly ₹100)** in `system:config`.
   - **🛒 Pending Buy Orders, 📥 Pending Sell Queue & 💳 Pending Payouts:** Dedicated queue managers with 1-click approval or custom-note rejection.
   - **➕ Add Gmail Stock & ➕ Add FB Stock:** Separate bulk line-by-line stock loaders for Gmail (`stock:gmails`) and Facebook (`stock:facebook`).
   - **📢 Broadcast Message, 🛡 Admin Manager & 🔧 Maintenance Mode.**

2. **Dual-Service Trading: Gmail & Facebook Accounts**
   - **🛒 Buy Gmail & 📥 Sell Gmail** (`stock:gmails`, default Buy ₹22 / Sell ₹15).
   - **📘 Buy Facebook & 📤 Sell Facebook** (`stock:facebook`, default Buy ₹30 / Sell ₹20).

3. **Clean Colon-Free Credential Format & Recovery Mail Notices**
   - **No Colons Required:** Users and admins submit accounts using simple space separation (`email password` or `uid password`), with optional recovery email (`email password recovery@mail.com`). Legacy colon/pipe inputs are also automatically normalized into clean objects.
   - **Explicit Recovery Mail Notice:** Every delivered or previewed account displays a clean, colon-free card with an explicit **🛡 Recovery Mail Notice** indicating either `"No Recovery Mail Linked (Fresh Account — bind your own recovery email & 2FA immediately)"` or showing the attached recovery email with security instructions.

4. **Strict ₹100 Minimum Withdrawal & Wallet Engine**
   - Default minimum withdrawal is strictly **₹100** (`MIN_WITHDRAW_INR: 100`), enforced across wallet checks and withdrawal requests.
   - Supports UPI and USDT (TRC20/BEP20) payouts with automatic wallet refund if an admin rejects a payout.

---

## 🚀 Step-by-Step Deployment Guide

### Option A: Deploy via Wrangler CLI (Recommended)

#### 1. Install Wrangler & Authenticate
```bash
npm install
npx wrangler login
```

#### 2. Create the Cloudflare KV Namespace (`DB`)
```bash
npx wrangler kv namespace create DB
npx wrangler kv namespace create DB --preview
```
Copy the `id` and `preview_id` into `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "DB"
id = "YOUR_PRODUCTION_KV_NAMESPACE_ID"
preview_id = "YOUR_PREVIEW_KV_NAMESPACE_ID"
```

#### 3. Configure Environment Variables & Secrets
Update `[vars]` in `wrangler.toml`:
```toml
[vars]
OWNER_ID = "YOUR_TELEGRAM_NUMERIC_USER_ID"
SUPPORT_USERNAME = "@ZenoxWorker"
FORCE_CHANNEL = "@YourChannelUsername"
UPI_DETAILS = "yourmerchant@upi (Pay & send 12-digit UTR or Screenshot)"
```
Set your secret `BOT_TOKEN`:
```bash
npx wrangler secret put BOT_TOKEN
```

#### 4. Deploy & Register Webhook
```bash
npm run deploy
```
Then open `https://zenox-gmail-bot.YOUR_SUBDOMAIN.workers.dev/register-webhook` in your browser to automatically bind your Telegram Webhook.

---

## 🗄️ Cloudflare KV Schema Reference (`env.DB`)

| KV Key | Type | Description |
| :--- | :--- | :--- |
| `system:config` | JSON Object | Dynamic rates (`BUY_GMAIL_INR`, `SELL_GMAIL_INR`, `BUY_FB_INR`, `SELL_FB_INR`, `MIN_WITHDRAW_INR`: 100, `REF_BONUS_INR`, `USDT_RATE_INR`) |
| `user:${chat_id}:data` | JSON Object | User profile, wallet balance, referral stats, language, currency, ban status, order IDs |
| `user:${chat_id}:state` | JSON Object | Active multi-step conversational state (`action`, `meta`) |
| `stock:gmails` | JSON Array | Active inventory of verified Gmail account objects (`identifier`, `password`, `recovery`) |
| `stock:facebook` | JSON Array | Active inventory of verified Facebook account objects (`identifier`, `password`, `recovery`) |
| `orders:${id}` | JSON Object | Buy order record (`GMAIL` or `FACEBOOK`), buyer info, UTR/screenshot proof, delivery status |
| `PENDING_BUY_QUEUE` | JSON Array | Queue of pending buy order IDs awaiting Admin verification |
| `sells:${id}` | JSON Object | Sell submission record (`GMAIL` or `FACEBOOK`), submitted accounts, payout status |
| `PENDING_SELL_QUEUE` | JSON Array | Queue of pending sell submission IDs awaiting Admin review |
| `payouts:${id}` | JSON Object | Withdrawal request record, UPI/USDT address, status |
| `payouts:pending_list` | JSON Array | Queue of pending withdrawal IDs |
| `users:list` | JSON Array | Global list of registered user chat IDs for User List, Inspect User & Broadcasts |
| `admins:list` | JSON Array | Dynamic sub-admin Telegram User IDs managed via Admin Manager |
| `system:maintenance` | JSON Boolean | Global maintenance mode flag (`true` / `false`) |
