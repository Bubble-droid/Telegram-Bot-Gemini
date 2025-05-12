# Telegram Bot Gemini

## Quick Start

### 1. Clone project to local

```bash
git https://github.com/Bubble-droid/Telegram-Bot-Gemini.git
cd Telegram-Bot-Gemini
```

### 2. Install dependencies

```bash
npm install
```

### 3. Log in to the Cloudflare account

```bash
npx wrangler login
```

### 4. Create kV namespace

```bash

```

### 5. Configure wrangler.json

```json

```

### 6. Deploy to Cloudflare Workers

```bash
npx wrangler deploy
```

### 7. Set Telegram WebHook

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" -d "url=<YOUR_WORKERS_URL>&secret_token=<YOUR_SECRET_TOKEN>"
```
