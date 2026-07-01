require('dotenv').config();
const Airtable = require('airtable');
const { randomUUID } = require('crypto');

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

// Merchants table

async function lookupMerchantByPhone(phone) {
  const records = await getBase()('Merchants')
    .select({ filterByFormula: `{PhoneNumber} = "${phone}"`, maxRecords: 1 })
    .firstPage();
  return records[0] || null;
}

async function lookupMerchantByMerchantId(merchantId) {
  const records = await getBase()('Merchants')
    .select({ filterByFormula: `{MerchantID} = "${merchantId}"`, maxRecords: 1 })
    .firstPage();
  return records[0] || null;
}

async function linkPhoneToMerchant(recordId, phone) {
  return getBase()('Merchants').update(recordId, { PhoneNumber: phone });
}

// Sessions table

async function getSession(phone) {
  const records = await getBase()('Sessions')
    .select({ filterByFormula: `{PhoneNumber} = "${phone}"`, maxRecords: 1 })
    .firstPage();
  return records[0] || null;
}

async function createSession(phone, topic) {
  const records = await getBase()('Sessions').create([
    {
      fields: {
        PhoneNumber: phone,
        CurrentTopic: topic,
        LastActive: new Date().toISOString(),
        EscalationFlag: false,
        SessionID: randomUUID(),
      },
    },
  ]);
  return records[0];
}

async function updateSession(recordId, fields) {
  return getBase()('Sessions').update(recordId, {
    ...fields,
    LastActive: new Date().toISOString(),
  });
}

module.exports = {
  getBase,
  logMessage,
  lookupMerchantByPhone,
  lookupMerchantByMerchantId,
  linkPhoneToMerchant,
  getSession,
  createSession,
  updateSession,
};
