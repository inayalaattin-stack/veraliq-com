// agent-core/avatar-providers/quicktalk-avatar-provider.js
//
// QuickTalk — spec's PRIMARY avatar model choice, run through the
// self-hosted OpenTalking server (see opentalking-base.js for the shared
// client and its WHEP/SSE caveats).
//
// ⚠️ LICENSE FLAG (docs/DIGITAL_HUMAN_ENGINE_REPORT.md §7): the QuickTalk
// model WEIGHTS (huggingface.co/datascale-ai/quicktalk) are tagged
// "License: other" with no standard license text found in this pass — read
// the actual LICENSE/model card on that page yourself before enabling this
// provider in production. The OpenTalking ORCHESTRATION FRAMEWORK itself is
// Apache-2.0 and fine; it's specifically the QuickTalk weights that need a
// manual read. Until that's done, MuseTalkAvatarProvider (confirmed MIT) is
// the safer production default among the two self-hosted options.
//
// Not selected by default — see agent-core/config.js.

import { OpenTalkingAvatarProviderBase } from './opentalking-base.js';

export class QuickTalkAvatarProvider extends OpenTalkingAvatarProviderBase {
  constructor(opts) {
    super(Object.assign({}, opts, { model: 'quicktalk' }));
  }
}
