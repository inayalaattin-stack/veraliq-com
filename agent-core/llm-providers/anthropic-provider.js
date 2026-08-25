// agent-core/llm-providers/anthropic-provider.js
//
// AnthropicProvider — same shape and same security rule as
// openai-provider.js (read that file's header first): no API key ever
// lives in this browser-side class. Point `baseUrl` at a server-side proxy
// worker holding ANTHROPIC_API_KEY as a secret. Not wired up yet — no such
// worker exists in this repo.

import { LLMProvider } from '../providers.js';

export class AnthropicProvider extends LLMProvider {
  constructor({ baseUrl } = {}) {
    super();
    this.baseUrl = (baseUrl || '').replace(/\/$/, '');
  }

  async respond(userText, context) {
    if (!this.baseUrl) {
      throw new Error(
        'anthropic_provider_not_configured — build a server-side proxy worker that holds ' +
        'ANTHROPIC_API_KEY (never in browser JS) and point selfHostedBaseUrl at it. See openai-provider.js\'s header comment.'
      );
    }
    const resp = await fetch(this.baseUrl + '/llm/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'anthropic', userText, history: context.history, lang: context.lang, agentIdentity: context.agentIdentity }),
    });
    if (!resp.ok) throw new Error('anthropic_proxy_failed_' + resp.status);
    const data = await resp.json();
    return { replyText: data.replyText, emotion: data.emotion || 'neutral', intent: data.intent || null };
  }
}
