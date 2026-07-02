const {
  lookupMerchantByPhone,
  getSession,
  createSession,
  updateSession,
} = require('./airtable');
const { getAIReply } = require('./openai');
const { isHighIntent, captureLeadAndNotify } = require('./leads');

async function handleMessage(phone, text) {
  console.log(`[handleMessage] phone=${phone} text="${text}"`);

  // Check if this is a known registered merchant (matched by phone)
  let merchant = null;
  try {
    merchant = await lookupMerchantByPhone(phone);
    console.log(`[merchant] ${merchant ? `Known merchant: ${merchant.fields.Name}` : 'Unknown number — treating as new prospect'}`);
  } catch (err) {
    console.error(`[merchant] lookupMerchantByPhone failed: ${err.message}`);
    throw err;
  }

  const name = merchant ? (merchant.fields.Name || null) : null;
  const tier = merchant ? (merchant.fields.Tier || null) : null;

  // Get or create session
  let session;
  try {
    session = await getSession(phone);
    console.log(`[session] ${session ? `found session ${session.id} (topic: ${session.fields['Current Topic']})` : 'no session found'}`);
  } catch (err) {
    console.error(`[session] getSession failed: ${err.message}`);
    throw err;
  }

  if (!session) {
    try {
      session = await createSession(phone, 'main_menu');
      console.log(`[session] Created session ${session.id} — sending greeting`);
    } catch (err) {
      console.error(`[session] createSession failed: ${err.message}`);
      throw err;
    }
    const greeting = name
      ? `Hi ${name}! I'm Priya, Pine Labs Malaysia's virtual assistant 🤖 I'm here to help you explore our payment solutions! What type of business do you run?`
      : `Hi! I'm Priya, Pine Labs Malaysia's virtual assistant 🤖 I'm here to help you explore our payment solutions! What type of business do you run?`;
    return greeting;
  }

  const topic = session.fields['Current Topic'];

  // Awaiting name after high-intent trigger
  if (topic === 'awaiting_name') {
    const prospectName = text.trim();
    console.log(`[leads] Name received: "${prospectName}" — capturing lead`);
    await updateSession(session.id, { 'Current Topic': 'lead_captured' });
    captureLeadAndNotify(phone, prospectName).catch((err) =>
      console.error(`[leads] captureLeadAndNotify failed: ${err.message}`)
    );
    return `Thanks ${prospectName}! A Pine Labs specialist will be in touch with you very soon 😊 Is there anything else I can help with while you wait?`;
  }

  // High-intent detection
  if (isHighIntent(text)) {
    console.log(`[leads] High-intent detected — asking for name`);
    await updateSession(session.id, { 'Current Topic': 'awaiting_name', 'Escalation Flag': true });
    return `Great! I'll have one of our Pine Labs specialists reach out to you shortly 😊 Can I get your name so they know who to contact?`;
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
