const OpenAI = require('openai');

const SYSTEM_PROMPT = `You are a helpful Pine Labs merchant support assistant. You help merchants with settlement queries, terminal issues, refunds, EMI questions, and onboarding. Be conversational, concise and friendly. Never use bullet points or numbered lists. Always respond in plain natural sentences as if you are a knowledgeable colleague.`;

function getClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function getAIReply(userMessage, merchantContext = {}) {
  let systemContent = SYSTEM_PROMPT;
  if (merchantContext.name) {
    systemContent += `\n\nYou are speaking with ${merchantContext.name}`;
    if (merchantContext.tier) {
      systemContent += `, a ${merchantContext.tier} tier merchant`;
    }
    systemContent += '.';
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
