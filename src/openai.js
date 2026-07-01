const OpenAI = require('openai');
const { getAllCompetitorIntel } = require('./airtable');

const SYSTEM_PROMPT = `You are a helpful Pine Labs merchant support assistant. You help merchants with settlement queries, terminal issues, refunds, EMI questions, and onboarding. Be conversational, concise and friendly. Never use bullet points or numbered lists. Always respond in plain natural sentences as if you are a knowledgeable colleague.`;

const PINE_LABS_STRENGTHS = `Pine Labs Malaysia strengths: deep integration with Malaysian banks, strong EMI and buy-now-pay-later ecosystem, enterprise-grade reliability, dedicated local support, and a proven track record with major Malaysian retailers.`;

// Short keywords used to detect competitor mentions in messages
const COMPETITOR_KEYWORDS = [
  'ghl', 'ingenico', 'pax', 'soft space', 'ipay88', 'molpay',
  'curlec', 'billplz', 'stripe', 'grabpay',
  'competitor', 'compare', 'vs', 'versus', 'better than', 'switch to', 'alternative',
];

function isComparisonQuestion(text) {
  const lower = text.toLowerCase();
  return COMPETITOR_KEYWORDS.some((kw) => lower.includes(kw));
}

function getRelevantIntel(allRecords, text) {
  const lower = text.toLowerCase();
  return allRecords.filter((r) => {
    const name = (r.fields.Competitor || '').toLowerCase();
    // Match if any word from the competitor name appears in the message
    return name.split(' ').some((word) => word.length > 3 && lower.includes(word));
  });
}

function getClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function getAIReply(userMessage, merchantContext = {}) {
  let systemContent = SYSTEM_PROMPT;

  if (merchantContext.name) {
    systemContent += `\n\nYou are speaking with ${merchantContext.name}`;
    if (merchantContext.tier) systemContent += `, a ${merchantContext.tier} tier merchant`;
    systemContent += '.';
  }

  // Inject competitor intelligence if message is a comparison question
  if (isComparisonQuestion(userMessage)) {
    try {
      const allIntel = await getAllCompetitorIntel();
      const relevant = getRelevantIntel(allIntel, userMessage);

      if (relevant.length > 0) {
        const intelText = relevant
          .map((r) => {
            const { Competitor, Category, Summary, DateFetched } = r.fields;
            return `${Competitor} (${Category}, as of ${DateFetched}): ${Summary}`;
          })
          .join('\n');

        systemContent += `\n\nCompetitor intelligence (for context only — do not repeat verbatim):\n${intelText}`;
      }

      systemContent += `\n\n${PINE_LABS_STRENGTHS}`;
      systemContent += `\n\nWhen answering comparison questions: always lead with Pine Labs strengths, stay factual and respectful about competitors, and mention the date of any competitor information you reference.`;
    } catch (err) {
      console.error('[openai] Failed to fetch competitor intel:', err.message);
    }
  }

  const response = await getClient().chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userMessage },
    ],
    max_tokens: 300,
  });

  return response.choices[0].message.content.trim();
}

module.exports = { getAIReply };
