require('dotenv').config();
const Airtable = require('airtable');

const TABLE_NAME = 'MessageLogs';

function getBase() {
  return new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
    process.env.AIRTABLE_BASE_ID
  );
}

async function logMessage({ from, to, body }) {
  return getBase()(TABLE_NAME).create([
    {
      fields: {
        From: from,
        To: to,
        Body: body,
      },
    },
  ]);
}

module.exports = { getBase, logMessage };
