# Deployment

## Goal

Publish the mini app and API to the internet so MAX, Telegram, and VK can open the product from public HTTPS domains.

## Recommended target topology

- `app.your-domain.com` - frontend mini app
- `api.your-domain.com` - backend API and SSE endpoints
- Managed PostgreSQL - production database

## Baseline production stack

- Frontend: Vercel, Netlify, or static assets behind Nginx
- API: Render, Fly.io, Railway, a VPS with Docker, or any Node-friendly hosting
- Database: Neon, Supabase Postgres, Render Postgres, Railway Postgres, or a managed Postgres on your cloud
- TLS: automatic certificates via platform or Nginx + Let's Encrypt

## Required production steps

1. Provision a public Postgres database
2. Set `DATABASE_URL` in the API environment
3. Run `npm run db:generate`
4. Run `npm run db:push`
5. Deploy the API with `PORT` support
6. Deploy the frontend with `VITE_API_URL=https://api.your-domain.com`
7. Enable CORS for the frontend domain
8. Register public domains in MAX, Telegram, and VK platform settings

## Ready-made option

See [railway-vercel.md](./railway-vercel.md) for the fastest staging path:

- Railway for API + Postgres
- Vercel for frontend

## Platform integration checklist

- MAX Mini App:
  validate launch payload server-side
- Telegram Mini App:
  validate `initData` server-side
- VK Mini App:
  validate launch params signature server-side

## Security checklist

- HTTPS only
- production secrets only in environment variables
- request logging and error monitoring
- database backups
- rate limiting on public endpoints
- privacy policy and user agreement available on public domain
