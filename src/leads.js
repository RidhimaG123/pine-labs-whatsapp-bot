require('dotenv').config();
const twilio = require('twilio');
const { getMessagesByPhone, saveHotLead } = require('./airtable');
const { generateLeadSummary } = require('./openai');

const HIGH_INTENT_PHRASES = [
  'interested', 'sign me up', 'sign up', 'how do i get started', 'get started',
  'i want this', 'i want to', "let's do it", 'lets do it',
  'book a demo', 'book a call', 'send someone', 'contact me',
  'agent', 'help',
];

function isHighIntent(text) {
  const lower = text.toLowerCase();
  return HIGH_INTENT_PHRASES.some((phrase) => lower.includes(phrase));
}

function getTwilioClient() {
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

async function sendSalesNotification({ name, phone, businessType, outletCount, currentPOS, summary }) {
  const raw = process.env.SALES_TEAM_NUMBER || '';
  const to = raw.startsWith('whatsapp:') ? raw : `whatsapp:${raw}`;

  const body =
    `🔥 New Hot Lead!\n` +
    `Name: ${name}\n` +
    `Phone: ${phone}\n` +
    `Business: ${businessType}\n` +
    `Outlets: ${outletCount}\n` +
    `Current POS: ${currentPOS}\n` +
    `Summary: ${summary}`;

  await getTwilioClient().messages.create({
    from: process.env.TWILIO_WHATSAPP_NUMBER,
    to,
    body,
  });
  console.log(`[leads] Sales team notification sent to ${to}`);
}

async function captureLeadAndNotify(phone, prospectName) {
  console.log(`[leads] Capturing lead for ${phone} (${prospectName})...`);

  let messages = [];
  try {
    messages = await getMessagesByPhone(phone);
    console.log(`[leads] Retrieved ${messages.length} messages from MessageLogs`);
  } catch (err) {
    console.error(`[leads] getMessagesByPhone failed: ${err.message}`);
  }

  let businessType = 'Unknown';
  let outletCount = 'Unknown';
  let currentPOS = 'Unknown';
  let summary = 'No summary available';

  try {
    const extracted = await generateLeadSummary(messages);
    businessType = extracted.businessType || 'Unknown';
    outletCount = extracted.outletCount || 'Unknown';
    currentPOS = extracted.currentPOS || 'Unknown';
    summary = extracted.summary || 'No summary available';
    console.log(`[leads] GPT-4o extracted: business=${businessType}, outlets=${outletCount}, pos=${currentPOS}`);
  } catch (err) {
    console.error(`[leads] generateLeadSummary failed: ${err.message}`);
  }

  try {
    await saveHotLead({ name: prospectName, phone, businessType, outletCount, currentPOS, summary });
    console.log(`[leads] HotLead saved to Airtable`);
  } catch (err) {
    console.error(`[leads] saveHotLead failed: ${err.message}`);
  }

  try {
    await sendSalesNotification({ name: prospectName, phone, businessType, outletCount, currentPOS, summary });
  } catch (err) {
    console.error(`[leads] sendSalesNotification failed: ${err.message}`);
  }
}

module.exports = { isHighIntent, captureLeadAndNotify };
