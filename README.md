# Mini HADS

Monorepo for a cross-platform mini app that lets a doctor create a QR-linked HADS questionnaire session and receive the patient's result in real time.

## Platforms

- Telegram Mini App
- MAX Mini App
- VK Mini App

## Workspace layout

- `apps/miniapp` - shared frontend for doctor and patient flows
- `apps/api` - backend API, platform auth validation, session management, realtime updates
- `packages/domain` - HADS questions, scoring, interpretation, shared types
- `docs` - architecture, API contract, user flows

## Planned flow

1. Doctor opens the mini app in Telegram, MAX, or VK.
2. Backend validates launch data and resolves the doctor account.
3. Doctor creates a survey session and shows a QR code.
4. Patient scans the QR and opens the questionnaire.
5. Patient submits HADS answers.
6. Backend computes anxiety and depression scores.
7. Doctor sees the result instantly via realtime updates.

## Local run

1. `npm install`
2. `cp apps/api/.env.example apps/api/.env`
3. `npm run infra:up`
4. `npm run db:generate`
5. `npm run db:push`
6. `npm run dev:api`
7. `npm run dev:miniapp`

The frontend opens on `http://localhost:5173`, the API listens on `http://localhost:3001`.

## Infrastructure

- Local and production-oriented development now target `PostgreSQL`
- A ready-to-run local database is defined in `docker-compose.yml`
- Prisma schema remains in `apps/api/prisma/schema.prisma`

## Deployment preparation

- [deployment.md](./docs/deployment.md) describes the path to a public internet deployment
- [roadmap.md](./docs/roadmap.md) breaks the project into the next practical milestones
- [railway-vercel.md](./docs/railway-vercel.md) gives the fastest staging deployment path

## Important env vars

- API:
  `DATABASE_URL`, `PORT`, `ALLOWED_ORIGINS`, `ALLOW_DEV_AUTH`, `SESSION_SECRET`, `MAX_BOT_TOKEN`, `TELEGRAM_BOT_TOKEN`
- Frontend:
  `VITE_API_URL`, `VITE_MAX_BOT_NAME`, `VITE_TELEGRAM_BOT_USERNAME`, `VITE_TELEGRAM_APP_NAME`

## Notes

- If your workspace path contains spaces and `npm install` behaves oddly, run the same commands from a symlink path without spaces.

## Next steps

1. Replace mock platform launch payloads with real validation for Telegram, MAX, and VK.
2. Add realtime delivery with WebSocket or SSE for the doctor dashboard.
3. Turn the patient form into the final localized HADS questionnaire UI.
4. Add production deployment, HTTPS, and public domains for the mini app and API.
