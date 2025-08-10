const { OpenAI } = require("openai");

module.exports = async function (context, req) {
  context.log('Chat API called');

  if (req.method !== 'POST') {
    context.res = { status: 405, body: 'Method Not Allowed' };
    return;
  }

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    context.res = { status: 400, body: 'Invalid request: missing messages array' };
    return;
  }

  try {
    const openai = new OpenAI({
      apiKey: process.env["AZURE_OPENAI_API_KEY"]
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
    });

    context.res = {
      status: 200,
      body: { reply: completion.choices[0].message.content }
    };
  } catch (error) {
    context.log.error('OpenAI error:', error);
    context.res = {
      status: 500,
      body: { error: error.message || 'OpenAI request failed' }
    };
  }
};