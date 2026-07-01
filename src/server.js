require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const { logMessage } = require('./airtable');
const { handleMessage } = require('./merchant');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.post('/webhook', async (req, res) => {
  const { Body, From, To } = req.body;

  console.log(`Message from ${From}: ${Body}`);

  try {
    await logMessage({ from: From, to: To, body: Body });
  } catch (err) {
    console.error('Airtable logging failed:', err.message);
  }

  let reply;
  try {
    reply = await handleMessage(From, Body);
  } catch (err) {
    console.error('Message handling failed:', err.message);
    reply = 'Sorry, something went wrong. Please try again.';
  }

  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(reply);
  res.type('text/xml').send(twiml.toString());
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
