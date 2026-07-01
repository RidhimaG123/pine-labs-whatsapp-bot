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
    .select({ filterByFormula: `{Phone Number} = "${phone}"`, maxRecords: 1 })
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
  return getBase()('Merchants').update(recordId, { 'Phone Number': phone });
}

// Sessions table

async function getSession(phone) {
  const records = await getBase()('Sessions')
    .select({ filterByFormula: `{Phone Number} = "${phone}"`, maxRecords: 1 })
    .firstPage();
  return records[0] || null;
}

async function createSession(phone, topic) {
  const records = await getBase()('Sessions').create([
    {
      fields: {
        'Phone Number': phone,
        'Current Topic': topic,
        'Last Active': new Date().toISOString(),
        'Escalation Flag': false,
        SessionID: randomUUID(),
      },
    },
  ]);
  return records[0];
}

async function updateSession(recordId, fields) {
  return getBase()('Sessions').update(recordId, {
    ...fields,
    'Last Active': new Date().toISOString(),
  });
}

// CompetitorIntel table

async function saveCompetitorIntel({ competitor, category, summary, sourceURL }) {
  const existing = await getBase()('CompetitorIntel')
    .select({
      filterByFormula: `AND({Competitor} = "${competitor}", {Category} = "${category}")`,
      maxRecords: 1,
    })
    .firstPage();

  const fields = {
    Competitor: competitor,
    Category: category,
    Summary: summary,
    SourceURL: sourceURL,
    DateFetched: new Date().toISOString().split('T')[0],
    Status: 'active',
  };

  if (existing[0]) {
    return getBase()('CompetitorIntel').update(existing[0].id, fields);
  }
  return getBase()('CompetitorIntel').create([{ fields }]);
}

async function getAllCompetitorIntel() {
  const records = await getBase()('CompetitorIntel')
    .select({ filterByFormula: `{Status} = "active"` })
    .all();
  return records;
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
  saveCompetitorIntel,
  getAllCompetitorIntel,
};
