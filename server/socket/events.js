/**
 * Socket.IO event emission hook.
 *
 * Controllers call emit() immediately AFTER their DB writes commit.
 * In Stage 1 this was a safe no-op. In Stage 2, socket/index.js attaches the
 * real emitter at startup via setEmitter(fn), and every emit() below is
 * routed to the correct Socket.IO rooms (staff + public display).
 *
 * The emitter is fire-and-forget: emit() never blocks the HTTP request and
 * never throws, even if the socket layer is down or a route lookup fails.
 * A failed emit only costs a missed UI refresh, never a failed request.
 */

let emitter = null;

function setEmitter(fn) {
  emitter = fn;
}

function emit(event, payload) {
  if (emitter) {
    try {
      const result = emitter(event, payload);
      // The real emitter is async (it resolves rooms from the DB);
      // swallow rejections so controllers are never affected.
      if (result && typeof result.catch === 'function') {
        result.catch((err) => console.error(`[events] emitter failed for ${event}:`, err.message));
      }
    } catch (err) {
      console.error(`[events] emitter failed for ${event}:`, err.message);
    }
  }
}

module.exports = { setEmitter, emit };
