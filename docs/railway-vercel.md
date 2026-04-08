# Railway + Vercel

## Goal

Use Railway for the API and PostgreSQL, and Vercel for the frontend mini app.

## Railway

### Services

Create:

1. Postgres database
2. API service from this repository

### API service settings

- Root directory: repository root
- Start command: `npm run start -w @mini-hads/api`

### Environment variables

- `DATABASE_URL` = Railway Postgres connection string
- `PORT` = `3001`
- `ALLOWED_ORIGINS` = comma-separated frontend domains, for example:
  `https://your-project.vercel.app,https://app.your-domain.com`
- `ALLOW_DEV_AUTH` = `false`
- `MAX_BOT_TOKEN` = production token of your MAX bot

### One-time setup command

Run in the Railway shell or deploy hook:

```bash
npm run db:generate
npm run db:push
```

## Vercel

### Project settings

- Framework preset: `Vite`
- Root directory: `apps/miniapp`

### Environment variable

- `VITE_API_URL` = your Railway API URL
- `VITE_MAX_BOT_NAME` = public MAX bot name used for deep links

Example:

```bash
VITE_API_URL=https://mini-hads-api.up.railway.app
VITE_MAX_BOT_NAME=your_max_bot
```

## Public domains

Recommended:

- `app.your-domain.com` -> Vercel frontend
- `api.your-domain.com` -> Railway API

## After deploy

1. Open `https://api.your-domain.com/health`
2. Open `https://app.your-domain.com`
3. Confirm SSE works from the doctor dashboard
4. Register the public frontend domain in MAX, Telegram, and VK settings
