const {
  lookupMerchantByPhone,
  lookupMerchantByMerchantId,
  linkPhoneToMerchant,
  getSession,
  createSession,
  updateSession,
} = require('./airtable');

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

  if (merchant) {
    const name = merchant.fields.Name || 'there';
    console.log(`[session] Known merchant. Getting session for ${phone}...`);
    let session;
    try {
      session = await getSession(phone);
      console.log(`[session] ${session ? `found session ${session.id} (topic: ${session.fields['Current Topic']})` : 'no session found, will create'}`);
    } catch (err) {
      console.error(`[session] getSession failed: ${err.message}`);
      throw err;
    }

    if (session) {
      await updateSession(session.id, { 'Current Topic': 'main_menu' });
      console.log(`[session] Updated session ${session.id} to main_menu`);
    } else {
      const newSession = await createSession(phone, 'main_menu');
      console.log(`[session] Created new session ${newSession.id}`);
    }
    return `Hello ${name}! How can I help you today?`;
  }

  // Unknown phone — check session state
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

  // Unexpected state — reset to registration
  console.log(`[session] Unexpected topic "${session.fields['Current Topic']}", resetting to awaiting_merchant_id`);
  await updateSession(session.id, { 'Current Topic': 'awaiting_merchant_id' });
  return "Please share your Merchant ID to get started.";
}

module.exports = { handleMessage };
