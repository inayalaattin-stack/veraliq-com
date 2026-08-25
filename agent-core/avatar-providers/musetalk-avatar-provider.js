// agent-core/avatar-providers/musetalk-avatar-provider.js
//
// MuseTalk — spec's FALLBACK avatar model, run through the self-hosted
// OpenTalking server (see opentalking-base.js for the shared client).
//
// LICENSE: confirmed MIT (Tencent Music, TMElyralab/MuseTalk) — see
// docs/DIGITAL_HUMAN_ENGINE_REPORT.md §7. No commercial-use restriction
// found. Given QuickTalk's weights carry an unconfirmed "License: other"
// tag as of this writing, MuseTalk is the more defensible choice to flip on
// FIRST in production, even though the spec lists QuickTalk as primary —
// see the report for the full reasoning.
//
// Not selected by default — see agent-core/config.js.

import { OpenTalkingAvatarProviderBase } from './opentalking-base.js';

export class MuseTalkAvatarProvider extends OpenTalkingAvatarProviderBase {
  constructor(opts) {
    super(Object.assign({}, opts, { model: 'musetalk' }));
  }
}
