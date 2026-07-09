require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const { logMessage } = require('./airtable');
const { handleMessage } = require('./merchant');
const { refreshAllCompetitors } = require('./competitor');
const { handleSendTemplate, handleBroadcast, startScheduler } = require('./templates');
const {
  requireAdminPage,
  requireAdminApi,
  handleLoginPage,
  handleLogin,
  handleDashboardPage,
  handleDashboardData,
  handleSuppressIntel,
} = require('./dashboard');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.post('/webhook', async (req, res) => {
  const { Body, From, To } = req.body;

  console.log('─'.repeat(60));
  console.log('[webhook] Incoming message');
  console.log(`[webhook]   From : ${From}`);
  console.log(`[webhook]   To   : ${To}`);
  console.log(`[webhook]   Body : ${Body}`);

  console.log('[webhook] Step 1: Logging message to Airtable...');
  try {
    await logMessage({ from: From, to: To, body: Body });
    console.log('[webhook] Step 1: Message logged OK');
  } catch (err) {
    console.error('[webhook] Step 1 FAILED: Airtable log error');
    console.error(`[webhook]   message: ${err.message}`);
    console.error(err.stack);
  }

  console.log('[webhook] Step 2: Running merchant/session handler...');
  let reply;
  try {
    reply = await handleMessage(From, Body);
    console.log(`[webhook] Step 2: Handler returned reply: "${reply}"`);
  } catch (err) {
    console.error('[webhook] Step 2 FAILED: handleMessage threw');
    console.error(`[webhook]   message: ${err.message}`);
    console.error(err.stack);
    reply = 'Sorry, something went wrong. Please try again.';
  }

  console.log('[webhook] Step 3: Sending TwiML response...');
  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(reply);
  res.type('text/xml').send(twiml.toString());
  console.log('[webhook] Step 3: Response sent');
  console.log('─'.repeat(60));
});

app.get('/admin/login', handleLoginPage);
app.post('/admin/login', handleLogin);

app.get('/admin', requireAdminPage, handleDashboardPage);
app.get('/admin/data', requireAdminApi, handleDashboardData);
app.post('/admin/suppress-intel', requireAdminApi, handleSuppressIntel);

app.post('/admin/refresh-intel', requireAdminApi, async (req, res) => {
  console.log('[admin] Manual competitor intel refresh triggered');
  res.json({ status: 'started' });
  refreshAllCompetitors().catch((err) =>
    console.error('[admin] Refresh failed:', err.message)
  );
});

app.post('/admin/send-template', requireAdminApi, handleSendTemplate);

app.post('/admin/broadcast', requireAdminApi, handleBroadcast);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startScheduler();
});
