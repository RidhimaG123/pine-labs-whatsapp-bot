require('dotenv').config();
const axios = require('axios');
const cron = require('node-cron');
const OpenAI = require('openai');
const { saveCompetitorIntel } = require('./airtable');

const COMPETITORS = [
  'GHL Systems Malaysia',
  'Ingenico Malaysia',
  'PAX Technology Malaysia',
  'Soft Space Malaysia',
  'iPay88 Malaysia',
  'MOLPay Malaysia',
  'Curlec Malaysia',
  'Billplz Malaysia',
  'Stripe Malaysia',
  'GrabPay Malaysia',
];

const CATEGORIES = [
  { label: 'news',    query: (c) => `${c} latest news` },
  { label: 'pricing', query: (c) => `${c} pricing fees` },
];

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function searchSerper(query) {
  const response = await axios.post(
    'https://google.serper.dev/search',
    { q: query, gl: 'my', num: 5 },
    {
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY,
        'Content-Type': 'application/json',
      },
    }
  );
  return response.data;
}

async function summariseResults(competitor, category, results) {
  const organic = (results.organic || []).slice(0, 3);
  if (organic.length === 0) return null;

  const snippets = organic
    .map((r, i) => `${i + 1}. ${r.title}: ${r.snippet}`)
    .join('\n');
  const sourceURL = organic[0]?.link || '';

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content:
          'You are a business intelligence analyst. Summarise search results about a payment company in 2-3 concise sentences. Focus on factual, business-relevant information. Do not use bullet points or numbered lists.',
      },
      {
        role: 'user',
        content: `Summarise this ${category} information about ${competitor}:\n\n${snippets}`,
      },
    ],
    max_tokens: 150,
  });

  return {
    summary: response.choices[0].message.content.trim(),
    sourceURL,
  };
}

async function refreshCompetitor(competitor) {
  console.log(`[competitor] Refreshing: ${competitor}`);
  for (const { label, query } of CATEGORIES) {
    try {
      const results = await searchSerper(query(competitor));
      const data = await summariseResults(competitor, label, results);
      if (data) {
        await saveCompetitorIntel({
          competitor,
          category: label,
          summary: data.summary,
          sourceURL: data.sourceURL,
        });
        console.log(`[competitor] Saved ${competitor} / ${label}`);
      }
    } catch (err) {
      console.error(`[competitor] Failed ${competitor} / ${label}: ${err.message}`);
    }
  }
}

async function refreshAllCompetitors() {
  console.log('[competitor] Starting full refresh...');
  for (const competitor of COMPETITORS) {
    await refreshCompetitor(competitor);
  }
  console.log('[competitor] Full refresh complete');
}

// Daily cron at 8am Malaysia time
cron.schedule(
  '0 8 * * *',
  () => {
    console.log('[competitor] Cron: triggering daily refresh');
    refreshAllCompetitors().catch((err) =>
      console.error('[competitor] Cron refresh failed:', err.message)
    );
  },
  { timezone: 'Asia/Kuala_Lumpur' }
);

module.exports = { refreshAllCompetitors };
