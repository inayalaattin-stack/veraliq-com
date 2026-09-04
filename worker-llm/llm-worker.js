// veraliq-llm — minimal, single-purpose Cloudflare Worker.
//
// Its ONLY job: hold ANTHROPIC_API_KEY server-side and proxy a chat turn to
// Claude, so the browser never sees the real API key (see
// agent-core/llm-providers/anthropic-provider.js's header comment — that
// class throws until a worker like this one exists and
// AGENT_PROVIDER_CONFIG.selfHostedBaseUrl points at it).
//
// No CRM/lead logic lives here on purpose — this worker only turns
// (userText, history, agentIdentity, lang) into a Claude reply. Anything
// the reply should trigger downstream (lead creation, appointment, etc.)
// stays in agent-core's own intent-handling, per the Zero Trust AI rule:
// this worker never touches D1/CRM directly, it only talks to Claude.

const CLAUDE_MODEL = "claude-sonnet-5";
const MAX_TOKENS = 1024;

const ALLOWED_ORIGINS = new Set([
  "https://veraliq.com",
  "https://www.veraliq.com",
]);

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://veraliq.com";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

// agentIdentity: {first_name?, last_name?, display_name, company_name, role}
// (see agent-core/widget-runtime.js). Builds the system prompt that makes
// Claude answer in-character as the named sales agent, in the visitor's
// language — never as "an AI assistant" generically.
function buildSystemPrompt(agentIdentity, lang) {
  const name = (agentIdentity && agentIdentity.display_name) || "Elif Kaya";
  const company = (agentIdentity && agentIdentity.company_name) || "the company";
  const role = (agentIdentity && agentIdentity.role) || "sales assistant";
  return (
    `You are ${name}, a ${role} at ${company}. You speak with visitors on the ` +
    `company website as a real member of their sales team — warm, concise, ` +
    `never mentioning that you are an AI. Answer only using information the ` +
    `visitor or the conversation has given you; if you don't know something ` +
    `specific to ${company} (pricing, inventory, availability), say you'll ` +
    `check and follow up rather than inventing details. Reply in the ` +
    `visitor's language (ISO code: ${lang || "tr"}). Keep replies short — ` +
    `two or three sentences, like a real chat message, not an essay.`
  );
}

function historyToMessages(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((h) => h && typeof h.text === "string" && h.text.trim())
    .map((h) => ({
      role: h.role === "agent" ? "assistant" : "user",
      content: h.text,
    }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    if (url.pathname !== "/llm/chat" || request.method !== "POST") {
      return new Response("Not found", { status: 404, headers });
    }

    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: "server_not_configured" }, 500, headers);
    }

    // Basic abuse guard, same threshold as veraliq-agent's session-worker.js
    // (a chat turn + short history is small; anything past this is not a
    // real chat message).
    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength > 16384) {
      return json({ error: "payload_too_large" }, 413, headers);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400, headers);
    }

    if (body.provider !== "anthropic") {
      return json({ error: "unsupported_provider" }, 400, headers);
    }
    if (typeof body.userText !== "string" || !body.userText.trim()) {
      return json({ error: "missing_userText" }, 400, headers);
    }

    const messages = historyToMessages(body.history);
    messages.push({ role: "user", content: body.userText });

    let upstream;
    try {
      upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: MAX_TOKENS,
          system: buildSystemPrompt(body.agentIdentity, body.lang),
          messages,
        }),
      });
    } catch {
      return json({ error: "upstream_unreachable" }, 502, headers);
    }

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      return json({ error: "claude_request_failed", status: upstream.status, detail: detail.slice(0, 300) }, 502, headers);
    }

    const data = await upstream.json();
    const replyText = (data.content || [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!replyText) {
      return json({ error: "empty_reply" }, 502, headers);
    }

    return json({ replyText, emotion: "neutral", intent: null }, 200, headers);
  },
};
