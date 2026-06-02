# 🎉 SitotaBot — Telegram Growth Giveaway Bot

A full-featured, production-ready Telegram giveaway bot with **verifiable fairness**, anti-cheat validation, and CSV exports.

## ✨ Features

- 🎁 **Giveaway Management** — Create, monitor, end, and reroll giveaways
- 🔐 **Verifiable Fairness** — SHA-256 hash chaining with publishable proof
- 👥 **Participant Tracking** — Automatic registration via deep links
- 🛡️ **Anti-Cheat** — Account age checks, channel membership verification
- 📊 **CSV Exports** — Download participant and winner lists
- 🔄 **Reroll Support** — Re-select winners from remaining pool
- 📢 **Auto-Announcements** — Channel announcements with join buttons
- 💬 **Winner DMs** — Automatic winner notification
- ⏰ **Scheduled Endings** — Auto-end with crash recovery
- 🐳 **Docker Ready** — One-command deployment

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- Telegram Bot Token from [@BotFather](https://t.me/BotFather)

### 1. Clone & Install

```bash
git clone https://github.com/yourusername/sitotabot.git
cd sitotabot
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
BOT_TOKEN=your_bot_token_from_botfather
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sitotabot
```

### 3. Set Up Database

```bash
# Generate migration files from schema
npm run db:generate

# Apply migrations
npm run db:migrate
```

### 4. Run

```bash
# Development (with hot reload)
npm run dev

# Production
npm run build
npm start
```

### Docker Deployment

```bash
# Set your bot token
export BOT_TOKEN=your_bot_token

# Start everything
docker compose up -d
```

## 📖 Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message / join a giveaway via deep link |
| `/create_giveaway` | Interactive wizard to create a new giveaway |
| `/status [id]` | View giveaway status and stats |
| `/participants [id]` | View participant count and eligibility |
| `/end_giveaway [id]` | End a giveaway and draw winners |
| `/reroll [id] [count]` | Re-select winners from remaining pool |
| `/export [id] [type]` | Download participants/winners CSV |
| `/help` | Full command reference |

## 🔐 How Fairness Works

SitotaBot uses **SHA-256 hash chaining** for verifiable random winner selection:

1. **Participant List Hash** — All participant IDs are sorted and hashed: `SHA256(JSON.stringify(sortedIds))`
2. **Seed Generation** — A unique seed is generated from the end timestamp + cryptographic randomness
3. **Combined Proof Hash** — `SHA256(seed + participantHash)` produces the proof
4. **Winner Selection** — Hash chaining deterministically selects winners:
   - Convert hash to index via `BigInt(hash) % poolSize`
   - Remove selected winner from pool
   - Rehash for next selection

**Anyone can verify**: Given the participant list and seed, re-running the algorithm must produce the same winners and proof hash.

Optional: Use [Random.org API](https://api.random.org/) for trusted external randomness by setting `RANDOM_ORG_API_KEY`.

## 📁 Project Structure

```
sitotabot/
├── src/
│   ├── index.ts              # Entry point
│   ├── bot.ts                # Bot configuration
│   ├── env.ts                # Environment validation
│   ├── db/                   # Database (Drizzle ORM)
│   │   ├── schema.ts         # Table definitions
│   │   ├── index.ts          # Connection
│   │   └── migrate.ts        # Migration runner
│   ├── commands/             # Bot command handlers
│   ├── callbacks/            # Inline button handlers
│   ├── conversations/        # Multi-step flows
│   ├── services/             # Business logic
│   ├── middleware/           # Bot middleware
│   ├── utils/                # Utilities
│   └── types/                # TypeScript types
├── tests/                    # Unit tests
├── drizzle/                  # SQL migrations
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

## ⚙️ Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BOT_TOKEN` | ✅ | — | Telegram bot token |
| `DATABASE_URL` | ✅ | — | PostgreSQL connection URL |
| `RANDOM_ORG_API_KEY` | ❌ | — | Random.org API key for external randomness |
| `WEBHOOK_URL` | ❌ | — | Set to enable webhook mode |
| `WEBHOOK_PORT` | ❌ | `8443` | Webhook server port |
| `WEBHOOK_SECRET` | ❌ | — | Webhook secret token |
| `LOG_LEVEL` | ❌ | `info` | Log level (debug, info, warn, error) |
| `DEFAULT_MIN_ACCOUNT_AGE` | ❌ | `0` | Default minimum account age in days |

## 🔧 Bot Setup with BotFather

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow the prompts
3. Copy the bot token
4. Add the bot as an **administrator** to your channel(s)
5. The bot needs these admin permissions:
   - Post Messages
   - Read Messages (to verify membership)

## 📈 Deployment

### Railway / Render / Fly.io

1. Push code to GitHub
2. Connect your repository
3. Set environment variables (`BOT_TOKEN`, `DATABASE_URL`)
4. For webhook mode, set `WEBHOOK_URL` to your deployment URL
5. Deploy!

### Self-Hosted

```bash
docker compose up -d
```

## 📄 License

MIT
