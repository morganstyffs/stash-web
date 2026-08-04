/**
 * Shared numeric limits for the AI assistant — the ONE place both sides of
 * `/api/ai` read them from, so the enforcing side and the client can never drift.
 *
 * This module imports NOTHING, which is what lets the Worker pull these values over
 * a relative path (`../lib/aiLimits`) without dragging any client-only code into its
 * bundle — the same discipline as `ChatTurn` in `aiChat.ts`. Keep it dependency-free.
 */

/**
 * Max characters allowed in one question — a cost ceiling. The Worker
 * (`src/worker/ai.ts`) is the ENFORCING authority: it 400s a longer question. The
 * client imports the SAME number so a deep-linked `/ai?q=…` is truncated to
 * something the Worker will actually accept, instead of being sent and bounced.
 * ONE definition is what keeps the two sides in step — a second copy behind a
 * "keep in sync" comment is exactly the drift this avoids.
 */
export const AI_MAX_QUESTION_CHARS = 2000
