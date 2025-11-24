// src/modules/bridge.js
// Small wrapper to talk to the background service worker.
// Usage (from a content script): chrome.runtime.sendMessage({ type: 'ENQUEUE', payload: {...} }, cb)
// These helpers just wrap that behavior and return Promises.

const BackgroundBridge = (function () {
  function send(msg) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(msg, (resp) => {
          const err = chrome.runtime.lastError;
          if (err) {
            reject(err);
            return;
          }
          resolve(resp);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  return {
    ping: () => send({ type: "PING" }),
    enqueue: (payload) => send({ type: "ENQUEUE", payload }),
    getPendingCount: () => send({ type: "GET_PENDING_COUNT" }),
    flushQueue: () => send({ type: "FLUSH_QUEUE" }),
    clearQueue: () => send({ type: "CLEAR_QUEUE" })
  };
})();

// Export for bundlers / future imports; also expose globally for quick testing
try { window.__ext_bridge = BackgroundBridge; } catch (e) { /* not in page context maybe */ }
if (typeof module !== "undefined") module.exports = BackgroundBridge;
