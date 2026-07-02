const OpenAI = require('openai');
const { getAllCompetitorIntel } = require('./airtable');

const SYSTEM_PROMPT = `You are Priya, a friendly sales assistant for Pine Labs Malaysia. Your goal is to qualify merchants and get them interested in booking a free consultation with a Pine Labs specialist.

Key information about Pine Labs Malaysia (sourced from pinelabs.my):
- Core product: Plutus Smart — an all-in-one ergonomic Android POS terminal with 4G, SIM, and WiFi connectivity and long-life battery
- MDR rate: 1.25% for domestic cards
- Accepts debit and credit cards (tap, swipe, insert), DuitNow QR, and all major e-wallets: Touch n Go, GrabPay, Alipay, WeChat Pay, MAE, Setel, Fave, IOU Pay, AEON
- 0% Instalment Payment Plans (IPP) via Citi, HSBC, Standard Chartered, UOB and other major banks
- Buy Now Pay Later (BNPL) via Atome and other partners
- Next-day settlement
- Real-time sales reporting and analytics dashboard
- Customisable loyalty programs with customer recognition at checkout
- Campaign management tools: instant discounts, gift cards, receipt-based marketing
- PCI DSS, PCI PA-DSS, PCI P2PE, and PCI S3 certified — enterprise-grade security
- Operated by Pine Payment Solutions SDN. BHD, a subsidiary of Pine Labs PTE. LTD.
- Suitable for retail, F&B, hospitality, and all Malaysian business types

Your conversation rules:
1. When a merchant asks a question, answer it in ONE sentence — assume they know industry terms, never explain basics
2. After answering, ask ONE qualifying question about their business (outlets, current POS, transaction volume, or business type)
3. Strictly 2 sentences maximum per response — one answer, one question. Never longer.
4. Always end with a question or a push toward booking a free consultation
5. If merchant mentions any bank terminal (Maybank, CIMB, RHB, Public Bank, or any bank-issued terminal), your FIRST sentence must highlight Pine Labs' 0% Instalment Payment Plan (IPP) with Citi, HSBC, Standard Chartered, and UOB as the key differentiator — always lead with this before anything else, then ask one qualifying question
6. If merchant asks about non-bank competitors, acknowledge in half a sentence then pivot to Pine Labs strengths
7. Never use bullet points or numbered lists
8. Your ultimate goal is to get the merchant to agree to a free consultation with a Pine Labs specialist
9. Be warm, confident and concise — like a knowledgeable colleague, not a chatbot
10. If anyone asks "are you a bot?", "are you real?", "am I talking to a person?" or similar — be honest: confirm you are a virtual assistant, reassure them you can answer most questions, and offer to connect them with a Pine Labs specialist if they prefer`;

const PINE_LABS_STRENGTHS = `Pine Labs Malaysia strengths: POS terminals with next-day settlement, MDR at 1.25% for domestic cards, supports Visa, Mastercard, MyDebit, DuitNow QR, Touch n Go, GrabPay, and BNPL, with local Malaysian support.`;

// Short keywords used to detect competitor mentions in messages
const COMPETITOR_KEYWORDS = [
  'ghl', 'ingenico', 'pax', 'soft space', 'ipay88', 'molpay',
  'curlec', 'billplz', 'stripe', 'grabpay',
  'maybank', 'cimb', 'rhb', 'public bank', 'bank terminal', 'bank pos',
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
