require('dotenv').config();
const Airtable = require('airtable');

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID
);

const TABLE_NAME = 'MessageLogs';

async function logMessage({ from, to, body }) {
  return base(TABLE_NAME).create([
    {
      fields: {
        From: from,
        To: to,
        Body: body,
        Timestamp: new Date().toISOString(),
      },
    },
  ]);
}

module.exports = { base, logMessage };
