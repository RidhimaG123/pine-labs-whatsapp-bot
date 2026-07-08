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
        Status: 'active',
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

async function getAllSessions() {
  return getBase()('Sessions').select().all();
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
  };

  if (existing[0]) {
    return getBase()('CompetitorIntel').update(existing[0].id, fields);
  }
  return getBase()('CompetitorIntel').create([{ fields }]);
}

async function getAllCompetitorIntel() {
  const records = await getBase()('CompetitorIntel')
    .select()
    .all();
  return records;
}

// MessageLogs table

async function getMessagesByPhone(phone) {
  const records = await getBase()('MessageLogs')
    .select({ filterByFormula: `{From} = "${phone}"`, sort: [{ field: 'Created', direction: 'asc' }] })
    .all();
  return records;
}

// HotLeads table

async function saveHotLead({ name, phone, businessType, outletCount, currentPOS, summary }) {
  return getBase()('HotLeads').create([
    {
      fields: {
        Name: name,
        'Phone Number': phone,
        'Business Type': businessType,
        'Outlet Count': outletCount,
        'Current POS': currentPOS,
        'Conversation Summary': summary,
        Status: 'New',
        'Date Created': new Date().toISOString().split('T')[0],
      },
    },
  ]);
}

// Templates table

async function getTemplateByName(name) {
  const records = await getBase()('Templates')
    .select({ filterByFormula: `{Template Name} = "${name}"`, maxRecords: 1 })
    .firstPage();
  return records[0] || null;
}

async function touchTemplateLastUsed(recordId) {
  return getBase()('Templates').update(recordId, {
    'Last Used': new Date().toISOString(),
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
  getAllSessions,
  saveCompetitorIntel,
  getMessagesByPhone,
  saveHotLead,
  getAllCompetitorIntel,
  getTemplateByName,
  touchTemplateLastUsed,
};
