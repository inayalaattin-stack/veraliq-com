// agent-core/state-machine.js
//
// ConversationStateMachine — the 8 states from the architecture spec:
// IDLE, LISTENING, THINKING, SPEAKING, INTERRUPTED, PRESENTING,
// WAITING_APPROVAL, COMPLETED.
//
// Each transition is validated against an explicit allow-list so a bug
// elsewhere (e.g. two STT events firing out of order) can't silently put the
// UI in an impossible combination (e.g. "speaking" avatar animation while
// the mic indicator also shows "listening"). Invalid transitions are logged
// and ignored rather than thrown, so a single bad event never crashes the
// whole widget for a live visitor.

export const AgentState = Object.freeze({
  IDLE: 'IDLE',
  LISTENING: 'LISTENING',
  THINKING: 'THINKING',
  SPEAKING: 'SPEAKING',
  INTERRUPTED: 'INTERRUPTED',
  PRESENTING: 'PRESENTING',
  WAITING_APPROVAL: 'WAITING_APPROVAL',
  COMPLETED: 'COMPLETED',
});

// Allow-list of transitions. Keys = current state, values = states it may
// move to next. This is intentionally permissive about returning to IDLE or
// LISTENING from almost anywhere (real conversations are messy), but strict
// about anything moving into COMPLETED or WAITING_APPROVAL.
const TRANSITIONS = {
  // IDLE -> SPEAKING covers the short opening greeting (spec section 11),
  // which is spoken once right after connect(), before the agent has ever
  // listened for anything — confirmed missing by an end-to-end browser
  // smoke test while building this (the greeting's transition was silently
  // rejected without it).
  [AgentState.IDLE]: [AgentState.LISTENING, AgentState.PRESENTING, AgentState.SPEAKING],
  [AgentState.LISTENING]: [AgentState.THINKING, AgentState.IDLE, AgentState.PRESENTING],
  [AgentState.THINKING]: [AgentState.SPEAKING, AgentState.WAITING_APPROVAL, AgentState.LISTENING],
  [AgentState.SPEAKING]: [AgentState.INTERRUPTED, AgentState.LISTENING, AgentState.IDLE, AgentState.PRESENTING, AgentState.COMPLETED],
  [AgentState.INTERRUPTED]: [AgentState.LISTENING, AgentState.THINKING],
  [AgentState.PRESENTING]: [AgentState.LISTENING, AgentState.SPEAKING, AgentState.IDLE],
  [AgentState.WAITING_APPROVAL]: [AgentState.SPEAKING, AgentState.LISTENING, AgentState.COMPLETED],
  [AgentState.COMPLETED]: [AgentState.IDLE],
};

// Per-state UI/avatar/voice behaviour hints (section 38 of the spec: "Her
// state için: avatar animation, voice behavior, UI state tanımla"). These
// are consumed by the avatar provider and the widget CSS (via a
// data-agent-state attribute) rather than hard-coded in the orchestrator.
export const STATE_BEHAVIOR = Object.freeze({
  [AgentState.IDLE]: { avatarPose: 'idle', micActive: false, uiLabel: 'idle' },
  [AgentState.LISTENING]: { avatarPose: 'attentive', micActive: true, uiLabel: 'listening' },
  [AgentState.THINKING]: { avatarPose: 'thinking', micActive: false, uiLabel: 'thinking' },
  [AgentState.SPEAKING]: { avatarPose: 'speaking', micActive: true, uiLabel: 'speaking' },
  [AgentState.INTERRUPTED]: { avatarPose: 'attentive', micActive: true, uiLabel: 'interrupted' },
  [AgentState.PRESENTING]: { avatarPose: 'presenting-corner', micActive: true, uiLabel: 'presenting' },
  [AgentState.WAITING_APPROVAL]: { avatarPose: 'neutral', micActive: true, uiLabel: 'waiting-approval' },
  [AgentState.COMPLETED]: { avatarPose: 'idle', micActive: false, uiLabel: 'completed' },
});

export class ConversationStateMachine {
  constructor(initial = AgentState.IDLE) {
    this._state = initial;
    this._listeners = [];
  }

  get state() { return this._state; }
  get behavior() { return STATE_BEHAVIOR[this._state]; }

  /** @param {(next: string, prev: string) => void} handler */
  onChange(handler) { this._listeners.push(handler); return () => { this._listeners = this._listeners.filter((h) => h !== handler); }; }

  /**
   * @param {string} next
   * @returns {boolean} whether the transition was accepted
   */
  transition(next) {
    const allowed = TRANSITIONS[this._state] || [];
    if (next === this._state) return true; // idempotent no-op
    if (!allowed.includes(next)) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[VeraliqAgentFSM] rejected transition', this._state, '->', next);
      }
      return false;
    }
    const prev = this._state;
    this._state = next;
    this._listeners.forEach((h) => { try { h(next, prev); } catch (e) {} });
    return true;
  }
}
