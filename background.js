// background.js — minimal service worker for event queueing (safe / MV3)
const QUEUE_KEY = "ext_v2_event_queue";
const MAX_QUEUE_ITEMS = 5000; // safety cap

console.log("[BackgroundSW] starting");

// Helper: get queue (returns Promise<array>)
function getQueue() {
  return new Promise((resolve) => {
    chrome.storage.local.get([QUEUE_KEY], (res) => {
      const q = Array.isArray(res[QUEUE_KEY]) ? res[QUEUE_KEY] : [];
      resolve(q);
    });
  });
}

// Helper: set queue (returns Promise)
function setQueue(q) {
  if (!Array.isArray(q)) q = [];
  // enforce cap
  if (q.length > MAX_QUEUE_ITEMS) q = q.slice(-MAX_QUEUE_ITEMS);
  return new Promise((resolve) => {
    const obj = {};
    obj[QUEUE_KEY] = q;
    chrome.storage.local.set(obj, () => resolve());
  });
}

// Enqueue an item (returns Promise)
async function enqueueItem(item) {
  const q = await getQueue();
  q.push(item);
  await setQueue(q);
  return q.length;
}

// Flush queue (returns Promise<flushedBatch>)
async function flushQueue() {
  const q = await getQueue();
  if (!q.length) return { flushed: 0, batch: [] };
  // For now, just snapshot and clear the queue.
  const snapshot = q.slice();
  await setQueue([]);
  return { flushed: snapshot.length, batch: snapshot };
}

// Count
async function getCount() {
  const q = await getQueue();
  return q.length;
}

// Clear
async function clearQueue() {
  await setQueue([]);
  return true;
}

// On install / startup
chrome.runtime.onInstalled.addListener(() => {
  console.log("[BackgroundSW] onInstalled");
});

// ===== NEW: receive events from content script (non-breaking) =====
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === "EVENT_FROM_CONTENT") {
    console.log("[BG] Received event:", {
      tag: msg.tag,
      payload: msg.payload,
      url: msg.url,
      ts: msg.ts
    });
  }
});

// Message handler
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (!msg || typeof msg.type !== "string") {
        sendResponse({ ok: false, error: "invalid_message" });
        return;
      }

      switch (msg.type) {
        case "PING":
          sendResponse({ ok: true, pong: true, ts: Date.now() });
          break;

        case "ENQUEUE":
          // expect msg.payload = event object
          await enqueueItem(Object.assign({ _ts: Date.now() }, msg.payload || {}));
          sendResponse({ ok: true, queued: true });
          break;

        case "GET_PENDING_COUNT": {
          const count = await getCount();
          sendResponse({ ok: true, count });
          break;
        }

        case "FLUSH_QUEUE": {
          // returns the flushed batch (for inspection in dev)
          const result = await flushQueue();
          sendResponse({ ok: true, flushed: result.flushed, sample: result.batch.slice(0, 20) });
          break;
        }

        case "CLEAR_QUEUE": {
          await clearQueue();
          sendResponse({ ok: true, cleared: true });
          break;
        }

        default:
          sendResponse({ ok: false, error: "unknown_type" });
      }
    } catch (err) {
      console.error("[BackgroundSW] message handler error", err);
      sendResponse({ ok: false, error: String(err) });
    }
  })();

  // Indicate we'll call sendResponse asynchronously
  return true;
});
