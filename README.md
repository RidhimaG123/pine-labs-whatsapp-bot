# Pine Labs WhatsApp Bot

A WhatsApp merchant support bot for Pine Labs, built with Node.js, Express, Twilio, and Airtable.

## Prerequisites

- Node.js v18+
- A [Twilio](https://www.twilio.com) account with WhatsApp sandbox access
- An [Airtable](https://airtable.com) account with a base containing a `MessageLogs` table

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in `.env` with your credentials:

| Variable | Description |
|---|---|
| `TWILIO_ACCOUNT_SID` | Found in your Twilio Console dashboard |
| `TWILIO_AUTH_TOKEN` | Found in your Twilio Console dashboard |
| `TWILIO_WHATSAPP_NUMBER` | Your Twilio WhatsApp sandbox number (e.g. `whatsapp:+14155238886`) |
| `AIRTABLE_API_KEY` | Create a Personal Access Token at airtable.com/create/tokens |
| `AIRTABLE_BASE_ID` | Found in the Airtable API docs for your base (starts with `app...`) |

### 3. Set up Airtable

Create a table called `MessageLogs` in your Airtable base with these fields:

| Field name | Field type |
|---|---|
| `From` | Single line text |
| `To` | Single line text |
| `Body` | Long text |
| `Timestamp` | Single line text |

### 4. Set up Twilio WhatsApp Sandbox

1. In the [Twilio Console](https://console.twilio.com), go to **Messaging → Try it out → Send a WhatsApp message**
2. Follow the sandbox join instructions (send a join code from your WhatsApp)
3. Under **Sandbox Settings**, set the **When a message comes in** webhook URL to:
   ```
   https://<your-public-url>/webhook
   ```
   Method: `HTTP POST`
4. Use [ngrok](https://ngrok.com) locally to expose port 3000:
   ```bash
   ngrok http 3000
   ```
   Then paste the ngrok HTTPS URL into Twilio's sandbox webhook field.

### 5. Start the server

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

## Usage

Send any WhatsApp message to the Twilio sandbox number. The bot will echo your message back and log it to Airtable.

## Project Structure

```
src/
  server.js     # Express server and /webhook endpoint
  airtable.js   # Airtable connection and logMessage helper
.env.example    # Environment variable template
```
