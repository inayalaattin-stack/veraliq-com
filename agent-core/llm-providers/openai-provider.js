// agent-core/llm-providers/openai-provider.js
//
// OpenAIProvider — stub for when you want a real conversational LLM instead
// of the deterministic FaqSalesBrainProvider (spec section 34: "kalite
// gerektiğinde OpenAI/Anthropic/Gemini gibi provider'lar sonradan
// bağlanabilsin").
//
// ⚠️ SECURITY (spec section 25: "API anahtarlarını frontend'e koyma"): this
// class deliberately does NOT accept an API key. An OpenAI key embedded in
// browser JS is visible to every visitor via view-source — that is exactly
// the mistake the original Anam integration avoided (worker/session-worker.js
// keeps ANAM_API_KEY server-side). Follow the same pattern here: deploy a
// small server-side proxy (a new Cloudflare Worker, e.g. `veraliq-llm`,
// sibling to `veraliq-agent`) that holds OPENAI_API_KEY as a secret and
// forwards chat-completion requests; point `baseUrl` at THAT worker, never
// at api.openai.com directly.
//
// NOT WIRED UP: no such worker exists in this repo yet — this file will
// throw until you build one and set AGENT_PROVIDER_CONFIG.selfHostedBaseUrl
// (or a dedicated llmBaseUrl) to it. Left as a clearly-marked stub rather
// than a fake "working" implementation.

import { LLMProvider } from '../providers.js';

export class OpenAIProvider extends LLMProvider {
  constructor({ baseUrl } = {}) {
    super();
    this.baseUrl = (baseUrl || '').replace(/\/$/, '');
  }

  async respond(userText, context) {
    if (!this.baseUrl) {
      throw new Error(
        'openai_provider_not_configured — build a server-side proxy worker that holds ' +
        'OPENAI_API_KEY (never in browser JS) and point selfHostedBaseUrl at it. See this file\'s header comment.'
      );
    }
    const resp = await fetch(this.baseUrl + '/llm/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'openai', userText, history: context.history, lang: context.lang, agentIdentity: context.agentIdentity }),
    });
    if (!resp.ok) throw new Error('openai_proxy_failed_' + resp.status);
    const data = await resp.json();
    // SECURITY BOUNDARY reminder (see providers.js): `data.intent`, if the
    // proxy returns one, must still only ever be treated as a proposal, and
    // is passed straight through to the orchestrator, which does not
    // execute it either — see orchestrator.js.
    return { replyText: data.replyText, emotion: data.emotion || 'neutral', intent: data.intent || null };
  }
}
