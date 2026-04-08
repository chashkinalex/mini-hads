# Architecture

## Core idea

One frontend codebase serves three mini app containers: Telegram, MAX, and VK. Platform differences are isolated in adapter modules, while business logic lives in a shared backend and a reusable domain package.

## Main components

- `miniapp`: doctor and patient UI, QR presentation, form submission
- `api`: authentication, sessions, results, realtime notifications
- `domain`: HADS questionnaire metadata, scoring, interpretation

## Runtime flow

1. The mini app detects the platform container.
2. Launch payload is sent to `/auth/platform-login`.
3. API validates the platform signature and resolves the doctor account.
4. Doctor creates a new `survey_session`.
5. The frontend renders a QR with a public token.
6. Patient opens `/join/:token` and submits answers.
7. API computes the score and emits a realtime event to the doctor channel.

## Platform adapters

- `telegram.ts`: reads Telegram WebApp launch data
- `max.ts`: reads MAX WebApp launch data
- `vk.ts`: reads VK launch params and bridge data

## Security notes

- All platform launch data must be verified on the server
- QR tokens should expire and be single-use for submission
- The MVP stores no direct patient identity data
