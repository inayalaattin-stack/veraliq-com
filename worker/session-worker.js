// veraliq-agent — minimal, single-purpose Cloudflare Worker.
//
// Its ONLY job: exchange our Anam API key (kept as a server-side secret,
// ANAM_API_KEY) for a short-lived Anam session token, so the browser never
// sees the real API key. This is the standard "stateful session token"
// pattern from Anam's own production docs — the persona itself (name,
// voice, system prompt, tools) stays fully managed in Anam Lab; this
// worker only references it by personaId.
//
// No other business logic lives here on purpose — no chat model, no CRM,
// no lead storage. Keeping this worker tiny keeps it easy to reason about
// and easy to audit.

const ELIF_KAYA_PERSONA_ID = "9ae72476-5233-481d-a836-1c0b433b4fd1";

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    if (url.pathname === "/session" && request.method === "POST") {
      if (!env.ANAM_API_KEY) {
        return new Response(
          JSON.stringify({ error: "server_not_configured" }),
          { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
        );
      }

      let personaId = ELIF_KAYA_PERSONA_ID;
      try {
        const body = await request.json();
        if (body && typeof body.personaId === "string" && body.personaId.length > 0) {
          // Allows a future tenant-aware frontend to request a different
          // company's persona; today the site only ever sends the default.
          personaId = body.personaId;
        }
      } catch (_) {
        // no body / not JSON — fine, use the default persona.
      }

      let anamResp;
      try {
        anamResp = await fetch("https://api.anam.ai/v1/auth/session-token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${env.ANAM_API_KEY}`,
          },
          body: JSON.stringify({ personaConfig: { personaId } }),
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ error: "upstream_unreachable" }),
          { status: 502, headers: { ...headers, "Content-Type": "application/json" } }
        );
      }

      if (!anamResp.ok) {
        const detail = await anamResp.text().catch(() => "");
        return new Response(
          JSON.stringify({ error: "session_token_failed", status: anamResp.status, detail: detail.slice(0, 300) }),
          { status: 502, headers: { ...headers, "Content-Type": "application/json" } }
        );
      }

      const data = await anamResp.json();
      return new Response(
        JSON.stringify({ sessionToken: data.sessionToken }),
        { headers: { ...headers, "Content-Type": "application/json" } }
      );
    }

    return new Response("Not found", { status: 404, headers });
  },
};
