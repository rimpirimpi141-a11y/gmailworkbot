# Zenox Gmail Exchange — Cloudflare Workers Telegram Bot (`worker.js`)

A high-performance, zero-dependency, single-file Telegram Bot (`worker.js`) built on **Cloudflare Workers (ES Modules)** with **Cloudflare KV (`env.DB`)** for full state management, user wallets, automated Gmail stock delivery, sell queues, referral tracking, and multi-admin operations.

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

## ✨ Key Features & Architecture

1. **Force Channel Join & Referral Engine (`₹2` Bonus)**
   - Blocks all bot interactions until the user joins `FORCE_CHANNEL` (verified live via Telegram `getChatMember` API).
   - **Important:** Make sure your bot is added as an **Administrator** inside your `FORCE_CHANNEL` so `getChatMember` can verify members accurately.
   - Automatically awards **₹2** to the referrer's wallet the moment a referred user (`/start <ref_id>`) verifies channel membership.

2. **Automated Buy Gmail Workflow (`₹22` / account)**
   - Checks active stock in `stock:gmails` KV array -> Prompts quantity -> Calculates total in INR/USDT -> Displays `UPI_DETAILS` & unique Order ID -> Accepts UTR text or Screenshot photo -> Sends interactive **Approve / Reject** card to Admins.
   - On `✅ Approve Order #{id}`, automatically pops the exact quantity from `stock:gmails` KV and DMs the buyer in `email:password:recovery` format.
   - On `❌ Reject Order #{id}`, prompts the Admin for a custom rejection reason and sends it to the buyer.

3. **Automated Sell Gmail Queue (`₹15` / account)**
   - Accepts single or multi-line `email:password:recovery` submissions -> Pushes to `PENDING_SELL_QUEUE` and `sells:${id}` -> Alerts Admins.
   - On Admin approval, credits **₹15 per account** to the seller's wallet and appends the verified accounts directly into active `stock:gmails`.

4. **Wallet & Payout System (`₹50` Minimum)**
   - Tracks available balance, lifetime earnings, referral earnings, and withdrawal history.
   - Enforces a ₹50 minimum withdrawal limit, locks funds upon request, and routes `✅ Mark Paid` / `❌ Reject Refund` inline buttons to Admins. Rejecting a payout automatically refunds the user's wallet balance.

5. **Interactive Settings & Bilingual Support**
   - Inline toggles for **Language (English / Hindi)**, **Notifications (ON / OFF)**, and **Currency Display (INR ₹ / USDT $ at 1 USDT = ₹90)**.

6. **Role-Based Admin Control Panel (`⚡ Admin Dashboard` / `/admin`)**
   - Dynamically visible on Row 5 of the bottom reply keyboard **only** for `OWNER_ID` and sub-admins stored in `admins:list`.
   - Includes **➕ Add Stock** (bulk line-by-line paste), **📊 Check Inventory & Stats**, **📥 Pending Sell Queue**, **💳 Pending Payouts**, **👥 Admin Manager**, **📢 Broadcast Message**, and **🔧 Maintenance Mode**.

---

## 🚀 Step-by-Step Deployment Guide

### Option A: Deploy via Wrangler CLI (Recommended)

#### 1. Clone the Repository & Install Wrangler
```bash
git clone https://github.com/YOUR_USERNAME/zenox-gmail-bot.git
cd zenox-gmail-bot
npm install
```

#### 2. Authenticate with Cloudflare
```bash
npx wrangler login
```

#### 3. Create the Cloudflare KV Namespace (`DB`)
Run the following command to create your production and preview KV namespaces:
```bash
npx wrangler kv namespace create DB
npx wrangler kv namespace create DB --preview
```
Copy the `id` and `preview_id` output from your terminal and paste them into `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "DB"
id = "YOUR_PRODUCTION_KV_NAMESPACE_ID"
preview_id = "YOUR_PREVIEW_KV_NAMESPACE_ID"
```

#### 4. Configure Environment Variables & Secrets
Update `[vars]` in `wrangler.toml` with your Telegram details:
```toml
[vars]
OWNER_ID = "YOUR_TELEGRAM_NUMERIC_USER_ID"
SUPPORT_USERNAME = "@ZenoxWorker"
FORCE_CHANNEL = "@YourChannelUsername"
UPI_DETAILS = "yourmerchant@upi (Pay & send 12-digit UTR or Screenshot)"
```
Set your secret `BOT_TOKEN` securely via Wrangler CLI:
```bash
npx wrangler secret put BOT_TOKEN
# Paste your token from @BotFather when prompted
```

#### 5. Deploy to Cloudflare Workers
```bash
npm run deploy
# or: npx wrangler deploy
```
Wrangler will output your live Worker URL, for example:
`https://zenox-gmail-bot.YOUR_SUBDOMAIN.workers.dev`

---

### Option B: Deploy via GitHub + Cloudflare Dashboard (No CLI Needed)

1. Push this repository (`worker.js`, `wrangler.toml`, `package.json`, `.gitignore`, `.env.example`, `README.md`) to your GitHub account.
2. Log in to the **Cloudflare Dashboard** → **Workers & Pages** → **KV** → click **Create a namespace** named `ZENOX_BOT_DB`.
3. Go to **Workers & Pages** → **Create** → **Import a repository** (or create a Worker and paste `worker.js`).
4. In your Worker settings, go to **Settings** → **Bindings** → **Add Binding** → **KV Namespace**:
   - **Variable name:** `DB` *(must be exact)*
   - **KV namespace:** Select `ZENOX_BOT_DB`
5. Go to **Settings** → **Variables and Secrets** and add:
   - `BOT_TOKEN` (Secret): Your BotFather token
   - `OWNER_ID` (Text): Your numeric Telegram User ID (get it from `@userinfobot`)
   - `SUPPORT_USERNAME` (Text): `@ZenoxWorker`
   - `FORCE_CHANNEL` (Text): `@YourChannelUsername` (remember to add the bot as an Admin in this channel!)
   - `UPI_DETAILS` (Text): Your UPI ID / payment instructions
6. Click **Deploy**.

---

## 🔗 Setting Up the Telegram Webhook

Once deployed, bind your Telegram Bot to your Cloudflare Worker URL using **either** method below:

### Method 1: Built-in Auto-Registration Route (Fastest)
Simply open this URL in your browser:
```text
https://zenox-gmail-bot.YOUR_SUBDOMAIN.workers.dev/register-webhook
```
It will automatically call Telegram's `setWebhook` API pointing to your Worker root URL and return:
```json
{
  "webhookUrl": "https://zenox-gmail-bot.YOUR_SUBDOMAIN.workers.dev/",
  "result": {
    "ok": true,
    "result": true,
    "description": "Webhook was set"
  }
}
```

### Method 2: Manual `curl` Command
```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://zenox-gmail-bot.YOUR_SUBDOMAIN.workers.dev/", "drop_pending_updates": true}'
```

---

## 🗄️ Cloudflare KV Schema Reference (`env.DB`)

| KV Key | Type | Description |
| :--- | :--- | :--- |
| `user:${chat_id}:data` | JSON Object | User profile, wallet balance, referral stats, language, currency, order IDs |
| `user:${chat_id}:state` | JSON Object | Active multi-step conversational state (`action`, `meta`) |
| `stock:gmails` | JSON Array | Active inventory of `email:password:recovery` strings |
| `orders:${id}` | JSON Object | Buy order record, buyer info, UTR/screenshot proof, delivery status |
| `sells:${id}` | JSON Object | Sell submission record, submitted accounts, payout status |
| `PENDING_SELL_QUEUE` | JSON Array | Queue of pending sell submission IDs awaiting Admin review |
| `payouts:${id}` | JSON Object | Withdrawal request record, UPI/USDT address, status |
| `payouts:pending_list` | JSON Array | Queue of pending withdrawal IDs |
| `users:list` | JSON Array | Global list of registered user chat IDs for broadcasts & stats |
| `admins:list` | JSON Array | Dynamic sub-admin Telegram User IDs managed via Admin Manager |
| `system:maintenance` | JSON Boolean | Global maintenance mode flag (`true` / `false`) |
