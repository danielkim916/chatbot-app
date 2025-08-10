const { AzureOpenAI } = require("openai");

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

  const endpoint = process.env["AZURE_OPENAI_ENDPOINT"]; // e.g., https://<resource>.openai.azure.com/
  const apiKey = process.env["AZURE_OPENAI_API_KEY"];
  const deployment = process.env["AZURE_OPENAI_CHAT_DEPLOYMENT"]; // your deployment name
  const apiVersion = process.env["AZURE_OPENAI_API_VERSION"] || "2024-10-21";

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
    const client = new AzureOpenAI({ endpoint, apiKey, deployment, apiVersion });
    const completion = await client.chat.completions.create({ messages });
    const reply = completion?.choices?.[0]?.message?.content ?? "";
    context.res = { status: 200, body: { reply } };
  } catch (error) {
    context.log.error("Azure OpenAI error:", error);
    context.res = { status: 500, body: { error: error.message || "Azure OpenAI request failed" } };
  }
};