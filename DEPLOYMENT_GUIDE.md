# 🚀 Deployment & Configuration Guide

## Crypto Market Intelligence & Signal Telegram Mini App + Bot

This system is built with a **Node.js/Express backend**, **React + Vite frontend**, **Firebase Firestore** persistence schema, and a **Telegram Bot Engine**.

---

## 1. Telegram Bot & Mini App Setup (BotFather)

1. Open Telegram and search for `@BotFather`.
2. Send `/newbot` and follow the instructions to create your bot name and username (e.g. `@CryptoIntelRadarBot`).
3. Save the **HTTP API Token** provided by BotFather (e.g. `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`).
4. Set up the Telegram Mini App Menu Button:
   - Send `/newapp` to `@BotFather`.
   - Select your bot.
   - Enter your app title and description.
   - Upload a 640x360 app icon.
   - Enter your Web App URL (e.g. `https://your-deployed-domain.com`).
   - Choose a short name (e.g. `radar` or `app`).
5. Configure bot commands in BotFather with `/setcommands`:
   ```text
   start - Launch the Telegram Mini App and welcome dashboard
   dashboard - View market pulse, BTC price & active setups
   signals - View latest algorithmic market signals
   bullish - Filter bullish setups (upside momentum)
   bearish - Filter bearish setups (downside risk)
   sectors - Sector radar (AI, Layer-1, DeFi, Meme, etc.)
   market - Real-time monitored coin prices and volume
   watchlist - View and manage your starred assets
   history - Statistical backtesting & audit logs
   settings - Configure notification thresholds and alert types
   ```

---

## 2. Environment Variables (.env)

Create or edit your `.env` file in the project root:

```env
# Server Port (3000 for Cloud Run / default)
PORT=3000
NODE_ENV=production

# Telegram Bot Credentials
TELEGRAM_BOT_TOKEN=your_bot_father_token_here
TELEGRAM_ADMIN_CHAT_ID=your_telegram_id_here
TELEGRAM_WEBAPP_URL=https://your-domain.com

# Binance API Credentials (Optional - Public market data endpoints work out of the box)
BINANCE_API_KEY=
BINANCE_API_SECRET=

# Firebase Configuration (For persistent Firestore storage)
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_CLIENT_EMAIL=your_service_account_email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

---

## 3. Running the Standalone Telegram Bot

You can run the bot in two ways:
1. **Integrated Webhook Mode (Recommended for Cloud Hosting):**
   The Express server natively handles `/api/telegram/webhook` updates.
2. **Standalone Long-Polling Mode:**
   ```bash
   node bot/bot.js
   ```
   Or add to your process manager (`pm2 start bot/bot.js --name "crypto-bot"`).

---

## 4. Production Build & Deployment

### Option A: Cloud Run (Antigravity / Google Cloud)
1. Build the frontend and backend bundle:
   ```bash
   npm run build
   ```
2. Start the production server:
   ```bash
   npm start
   ```

### Option B: VPS (Ubuntu, Debian, Docker, PM2)
1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Build the project:
   ```bash
   npm run build
   ```
3. Run with PM2:
   ```bash
   pm2 start "npm start" --name "cryptointel-app"
   pm2 start "node bot/bot.js" --name "cryptointel-bot"
   pm2 save
   ```

---

## 5. Security & Responsible Signals Philosophy

- **Zero Price Predictions:** All signals output objective technical confluence tags (`Bullish setup detected`, `Bearish setup detected`, `Upside momentum increasing`, `Downside risk increasing`).
- **Standardized Disclaimer:**
  > *"Crypto markets are highly volatile. Signals are algorithmic market analysis, not guaranteed predictions or financial advice."*
- **Spam Cooldown:** Default 4-hour cooldown prevents redundant alerts for identical coins in the same direction.
- **Backend Key Isolation:** Telegram bot token and exchange credentials remain exclusively on the server side.
