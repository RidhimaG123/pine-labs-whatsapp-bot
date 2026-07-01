const {
  lookupMerchantByPhone,
  lookupMerchantByMerchantId,
  linkPhoneToMerchant,
  getSession,
  createSession,
  updateSession,
} = require('./airtable');
const { getAIReply } = require('./openai');

const ESCALATION_KEYWORDS = ['agent', 'help'];

async function handleMessage(phone, text) {
  console.log(`[handleMessage] phone=${phone} text="${text}"`);

  console.log(`[merchant] Looking up phone in Merchants table...`);
  let merchant;
  try {
    merchant = await lookupMerchantByPhone(phone);
    console.log(`[merchant] Lookup result: ${merchant ? `found record ${merchant.id} (Name: ${merchant.fields.Name})` : 'not found'}`);
  } catch (err) {
    console.error(`[merchant] lookupMerchantByPhone failed: ${err.message}`);
    throw err;
  }

  // --- Unknown merchant: registration flow ---
  if (!merchant) {
    console.log(`[session] Unknown phone. Getting session for ${phone}...`);
    let session;
    try {
      session = await getSession(phone);
      console.log(`[session] ${session ? `found session ${session.id} (topic: ${session.fields['Current Topic']})` : 'no session found'}`);
    } catch (err) {
      console.error(`[session] getSession failed: ${err.message}`);
      throw err;
    }

    if (!session) {
      console.log(`[session] Creating new session with topic awaiting_merchant_id...`);
      try {
        session = await createSession(phone, 'awaiting_merchant_id');
        console.log(`[session] Created session ${session.id}`);
      } catch (err) {
        console.error(`[session] createSession failed: ${err.message}`);
        throw err;
      }
      return "Welcome to Pine Labs support! It looks like you're not registered yet. Please share your Merchant ID to get started.";
    }

    if (session.fields['Current Topic'] === 'awaiting_merchant_id') {
      console.log(`[merchant] Looking up MerchantID="${text.trim()}" in Merchants table...`);
      let merchantRecord;
      try {
        merchantRecord = await lookupMerchantByMerchantId(text.trim());
        console.log(`[merchant] MerchantID lookup result: ${merchantRecord ? `found record ${merchantRecord.id}` : 'not found'}`);
      } catch (err) {
        console.error(`[merchant] lookupMerchantByMerchantId failed: ${err.message}`);
        throw err;
      }

      if (merchantRecord) {
        await linkPhoneToMerchant(merchantRecord.id, phone);
        await updateSession(session.id, { 'Current Topic': 'main_menu' });
        const name = merchantRecord.fields.Name || 'there';
        console.log(`[merchant] Linked phone to merchant ${merchantRecord.id}, session updated to main_menu`);
        return `Welcome, ${name}! You've been successfully registered. How can I help you today?`;
      }
      return `I couldn't find a merchant with ID "${text.trim()}". Please check and try again.`;
    }

    console.log(`[session] Unexpected topic "${session.fields['Current Topic']}", resetting to awaiting_merchant_id`);
    await updateSession(session.id, { 'Current Topic': 'awaiting_merchant_id' });
    return "Please share your Merchant ID to get started.";
  }

  // --- Known merchant: AI-powered conversation ---
  const name = merchant.fields.Name || 'there';
  const tier = merchant.fields.Tier || null;

  console.log(`[session] Known merchant ${name}. Getting session...`);
  let session;
  try {
    session = await getSession(phone);
    console.log(`[session] ${session ? `found session ${session.id} (topic: ${session.fields['Current Topic']})` : 'no session, will create'}`);
  } catch (err) {
    console.error(`[session] getSession failed: ${err.message}`);
    throw err;
  }

  if (!session) {
    session = await createSession(phone, 'main_menu');
    console.log(`[session] Created session ${session.id}`);
  }

  // Escalation check
  const normalised = text.toLowerCase().trim();
  if (ESCALATION_KEYWORDS.some(kw => normalised.includes(kw))) {
    console.log(`[escalation] Keyword detected — setting Escalation Flag and escalating`);
    await updateSession(session.id, { 'Current Topic': 'escalated', 'Escalation Flag': true });
    return `I've flagged your conversation for a Pine Labs support agent, ${name}. Someone will be in touch with you shortly. Is there anything else I can try to help you with in the meantime?`;
  }

  // AI reply
  console.log(`[openai] Sending message to GPT-4o...`);
  let reply;
  try {
    reply = await getAIReply(text, { name, tier });
    console.log(`[openai] Reply received (${reply.length} chars)`);
  } catch (err) {
    console.error(`[openai] getAIReply failed: ${err.message}`);
    throw err;
  }

  await updateSession(session.id, { 'Current Topic': 'main_menu' });
  return reply;
}

module.exports = { handleMessage };
