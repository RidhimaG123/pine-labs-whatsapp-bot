const {
  lookupMerchantByPhone,
  lookupMerchantByMerchantId,
  linkPhoneToMerchant,
  getSession,
  createSession,
  updateSession,
} = require('./airtable');

async function handleMessage(phone, text) {
  const merchant = await lookupMerchantByPhone(phone);

  if (merchant) {
    const name = merchant.fields.Name || 'there';
    const session = await getSession(phone);
    if (session) {
      await updateSession(session.id, { CurrentTopic: 'main_menu' });
    } else {
      await createSession(phone, 'main_menu');
    }
    return `Hello ${name}! How can I help you today?`;
  }

  // Unknown phone — check session state
  let session = await getSession(phone);

  if (!session) {
    session = await createSession(phone, 'awaiting_merchant_id');
    return "Welcome to Pine Labs support! It looks like you're not registered yet. Please share your Merchant ID to get started.";
  }

  if (session.fields.CurrentTopic === 'awaiting_merchant_id') {
    const merchantRecord = await lookupMerchantByMerchantId(text.trim());
    if (merchantRecord) {
      await linkPhoneToMerchant(merchantRecord.id, phone);
      await updateSession(session.id, { CurrentTopic: 'main_menu' });
      const name = merchantRecord.fields.Name || 'there';
      return `Welcome, ${name}! You've been successfully registered. How can I help you today?`;
    }
    return `I couldn't find a merchant with ID "${text.trim()}". Please check and try again.`;
  }

  // Unexpected state — reset to registration
  await updateSession(session.id, { CurrentTopic: 'awaiting_merchant_id' });
  return "Please share your Merchant ID to get started.";
}

module.exports = { handleMessage };
