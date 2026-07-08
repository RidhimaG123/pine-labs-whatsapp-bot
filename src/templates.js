require('dotenv').config();
const twilio = require('twilio');
const {
  getTemplateByName,
  touchTemplateLastUsed,
  getAllSessions,
  updateSession,
} = require('./airtable');

const FOLLOW_UP_BODY =
  "Hi! This is Priya from Pine Labs Malaysia 🤖 Just checking in — did you have any more questions about our payment solutions? We'd love to help your business get started!";

const REENGAGEMENT_BODY =
  "Hi! Pine Labs Malaysia here 😊 We noticed you were exploring our POS solutions. Our Plutus Smart terminal with 0% IPP is still available — would you like to know more?";

const FOLLOW_UP_TEMPLATE_NAME = 'Daily Follow-up';
const REENGAGEMENT_TEMPLATE_NAME = '48h Re-engagement';

const FOLLOW_UP_HOURS = 24;
const REENGAGEMENT_HOURS = 48;
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly

function getTwilioClient() {
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

function normalizeTo(phoneNumber) {
  return phoneNumber.startsWith('whatsapp:') ? phoneNumber : `whatsapp:${phoneNumber}`;
}

function fillVariables(body, variables = {}) {
  return Object.entries(variables).reduce(
    (text, [key, value]) => text.split(`{{${key}}}`).join(value),
    body
  );
}

async function sendRawMessage(phoneNumber, body) {
  return getTwilioClient().messages.create({
    from: process.env.TWILIO_WHATSAPP_NUMBER,
    to: normalizeTo(phoneNumber),
    body,
  });
}

// Sends a pre-approved Twilio/WhatsApp template message to any number.
// If the Airtable record has a Content SID, sends via Twilio's Content API
// (required by WhatsApp outside the 24h session window) with `variables` as
// the numbered contentVariables map, e.g. { "1": "John", "2": "Malaysia" }.
// Otherwise falls back to sending Template Body as a plain message body with
// {{key}} substitution — only valid inside an active 24h session window.
async function sendProactiveMessage(phoneNumber, templateName, variables = {}) {
  console.log(`[templates] sendProactiveMessage to=${phoneNumber} template="${templateName}"`);

  const template = await getTemplateByName(templateName);
  if (!template) {
    throw new Error(`Template "${templateName}" not found in Airtable`);
  }
  if (template.fields.Status !== 'Approved') {
    throw new Error(
      `Template "${templateName}" is not Approved (status: ${template.fields.Status || 'unknown'})`
    );
  }

  const contentSid = template.fields['Content SID'];
  let message;
  if (contentSid) {
    message = await getTwilioClient().messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: normalizeTo(phoneNumber),
      contentSid,
      contentVariables: JSON.stringify(variables),
    });
  } else {
    console.log(`[templates] No Content SID for "${templateName}" — falling back to plain body (24h window only)`);
    const body = fillVariables(template.fields['Template Body'] || '', variables);
    message = await sendRawMessage(phoneNumber, body);
  }

  await touchTemplateLastUsed(template.id).catch((err) =>
    console.error(`[templates] Failed to update Last Used for "${templateName}": ${err.message}`)
  );

  console.log(`[templates] Sent "${templateName}" to ${phoneNumber} (sid: ${message.sid})`);
  return message;
}

// Falls back to the hardcoded copy if the Airtable Templates record isn't set up yet.
async function sendFollowUp(session) {
  const phone = session.fields['Phone Number'];
  console.log(`[templates] 24h follow-up due for ${phone}`);
  try {
    await sendProactiveMessage(phone, FOLLOW_UP_TEMPLATE_NAME);
  } catch (err) {
    console.log(`[templates] Falling back to hardcoded follow-up body: ${err.message}`);
    await sendRawMessage(phone, FOLLOW_UP_BODY);
  }
  await updateSession(session.id, { Status: 'followed_up' });
}

async function sendReEngagement(session) {
  const phone = session.fields['Phone Number'];
  console.log(`[templates] 48h re-engagement due for ${phone}`);
  try {
    await sendProactiveMessage(phone, REENGAGEMENT_TEMPLATE_NAME);
  } catch (err) {
    console.log(`[templates] Falling back to hardcoded re-engagement body: ${err.message}`);
    await sendRawMessage(phone, REENGAGEMENT_BODY);
  }
  await updateSession(session.id, { Status: 're_engaged' });
}

// Walks all Sessions and fires the 24h follow-up / 48h re-engagement as needed.
async function runFollowUpCheck() {
  console.log('[templates] Running follow-up/re-engagement check...');
  let sessions = [];
  try {
    sessions = await getAllSessions();
  } catch (err) {
    console.error(`[templates] getAllSessions failed: ${err.message}`);
    return;
  }

  const now = Date.now();

  for (const session of sessions) {
    const status = session.fields.Status || 'active';
    const phone = session.fields['Phone Number'];
    const lastActive = session.fields['Last Active'];
    if (!phone || !lastActive || status === 'converted' || status === 'dead') continue;

    const hoursSince = (now - new Date(lastActive).getTime()) / (1000 * 60 * 60);

    try {
      if (status === 'active' && hoursSince >= FOLLOW_UP_HOURS) {
        await sendFollowUp(session);
      } else if (status === 'followed_up' && hoursSince >= REENGAGEMENT_HOURS) {
        await sendReEngagement(session);
      }
    } catch (err) {
      console.error(`[templates] Failed processing session ${session.id}: ${err.message}`);
    }
  }
  console.log('[templates] Follow-up/re-engagement check complete');
}

function startScheduler() {
  console.log(`[templates] Starting follow-up scheduler (every ${CHECK_INTERVAL_MS / 60000}min)`);
  setInterval(() => {
    runFollowUpCheck().catch((err) =>
      console.error(`[templates] Scheduled check failed: ${err.message}`)
    );
  }, CHECK_INTERVAL_MS);
}

// Sends a template to every session with activity in the last 7 days that isn't converted/dead.
async function broadcastToActiveSessions(templateName, variables = {}) {
  console.log(`[templates] Broadcasting "${templateName}" to active sessions from the last 7 days`);
  const sessions = await getAllSessions();
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const targets = sessions.filter((s) => {
    const status = s.fields.Status || 'active';
    const lastActive = s.fields['Last Active'];
    if (!lastActive || status === 'converted' || status === 'dead') return false;
    return new Date(lastActive).getTime() >= cutoff;
  });

  console.log(`[templates] Broadcasting to ${targets.length} session(s)`);

  const results = { sent: 0, failed: 0 };
  for (const session of targets) {
    const phone = session.fields['Phone Number'];
    try {
      await sendProactiveMessage(phone, templateName, variables);
      results.sent += 1;
    } catch (err) {
      console.error(`[templates] Broadcast to ${phone} failed: ${err.message}`);
      results.failed += 1;
    }
  }
  console.log(`[templates] Broadcast complete: sent=${results.sent} failed=${results.failed}`);
  return results;
}

// Express route handlers

async function handleSendTemplate(req, res) {
  const { phoneNumber, templateName, variables } = req.body;
  if (!phoneNumber || !templateName) {
    return res.status(400).json({ error: 'phoneNumber and templateName are required' });
  }
  try {
    const message = await sendProactiveMessage(phoneNumber, templateName, variables || {});
    res.json({ status: 'sent', sid: message.sid });
  } catch (err) {
    console.error(`[admin] send-template failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}

async function handleBroadcast(req, res) {
  const { templateName, variables } = req.body;
  if (!templateName) {
    return res.status(400).json({ error: 'templateName is required' });
  }
  res.json({ status: 'started' });
  broadcastToActiveSessions(templateName, variables || {}).catch((err) =>
    console.error(`[admin] broadcast failed: ${err.message}`)
  );
}

module.exports = {
  sendProactiveMessage,
  runFollowUpCheck,
  startScheduler,
  broadcastToActiveSessions,
  handleSendTemplate,
  handleBroadcast,
};
