const { OpenAIClient, AzureKeyCredential } = require("@azure/openai");

module.exports = async function (context, req) {
  context.log("Chat API called");

  if (req.method !== "POST") {
    context.res = { status: 405, body: "Method Not Allowed" };
    return;
  }

  const { messages } = req.body || {};
  if (!messages || !Array.isArray(messages)) {
    context.res = { status: 400, body: "Invalid request: missing messages array" };
    return;
  }

  const endpoint = process.env["AZURE_OPENAI_ENDPOINT"];
  const apiKey = process.env["AZURE_OPENAI_API_KEY"];
  const deployment = process.env["AZURE_OPENAI_CHAT_DEPLOYMENT"]; // deployment name

  if (!endpoint || !apiKey || !deployment) {
    context.res = {
      status: 500,
      body: {
        error:
          "Missing Azure OpenAI configuration. Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, and AZURE_OPENAI_CHAT_DEPLOYMENT."
      }
    };
    return;
  }

  try {
    const client = new OpenAIClient(endpoint, new AzureKeyCredential(apiKey));
    const result = await client.getChatCompletions(deployment, messages);

    const reply = result?.choices?.[0]?.message?.content ?? "";
    context.res = { status: 200, body: { reply } };
  } catch (error) {
    context.log.error("AOI error:", error);
    context.res = {
      status: 500,
      body: { error: error.message || "AOI request failed" }
    };
  }
};