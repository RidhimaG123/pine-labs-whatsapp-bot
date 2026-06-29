# Pine Labs WhatsApp Bot — Project Context

## What this project is

A WhatsApp-based merchant support bot for Pine Labs. Merchants message the bot on WhatsApp and receive automated, intelligent responses. All data (messages, merchant records, etc.) is stored in Airtable.

## Tech stack

- **Runtime**: Node.js (v18+)
- **Framework**: Express
- **WhatsApp channel**: Twilio WhatsApp API (sandbox for dev, production number for prod)
- **Data storage**: Airtable (single source of truth for all data)
- **Config**: dotenv for environment variables

## Entry point

`src/server.js` — starts the Express server and exposes the `/webhook` POST endpoint that Twilio calls for every inbound WhatsApp message.

## Key files

| File | Purpose |
|---|---|
| `src/server.js` | HTTP server, `/webhook` route, orchestrates message handling |
| `src/airtable.js` | Airtable client setup and data helper functions |
| `.env.example` | Template for all required environment variables |

## Airtable tables

| Table | Purpose |
|---|---|
| `MessageLogs` | Raw log of every inbound WhatsApp message |

## Branch strategy

- `main` — stable, tested code only; never commit directly
- `milestone-N` — one branch per milestone, merged to main after acceptance
- Feature branches named descriptively (e.g. `competitor-intel`, `faq-flow`)
- Delete branches after merge

## Environment variables

See `.env.example` for the full list. Never commit `.env`.

## Running locally

```bash
npm install
cp .env.example .env   # fill in credentials
npm run dev            # nodemon auto-reload
ngrok http 3000        # expose to Twilio webhook
```
