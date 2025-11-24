// content.js — Combined, cleaned, modular logger (v2)
// Single-file; safe namespace: window.__ext_logger_v2
(() => {
  // ===== NAMESPACE / CONFIG =====
  const NS = "__ext_logger_v2";
  if (window[NS] && window[NS].version === "2.0.0") {
    // already installed same version; skip re-injection
    console.log("[ContentLogger]", "v2 already installed");
    return;
  }

  // Feature flags (toggle sections for quick testing)
  const featureFlags = {
    click: true,
    keydown: true,
    input: true,
    change: true,
    focusBlur: true,
    selection: true,
    copyCutPaste: true,
    scroll: true,
    hover: true,
    mouseSampling: true,
    resizeOrientation: true,
    networkStatus: true,
    beforeUnload: true,
    formSubmit: true,
    dragDrop: true,
    rageClick: true,
    typingSpeed: true,
    batching: true,
    sendToBackground: false // keep off by default; can enable during tests
  };

  const CONFIG = {
    SAMPLE_MOUSE_MS: 150,
    SCROLL_DEBOUNCE_MS: 200,
    RESIZE_DEBOUNCE_MS: 200,
    BATCH_INTERVAL_MS: 5000,
    RAGE_CLICK_THRESHOLD_MS: 600,
    RAGE_CLICK_REQUIRED: 3,
    RAGE_CLICK_RADIUS_PX: 25
  };

  // ===== BRIDGE TO BACKGROUND (safe, non-blocking) =====
  function forwardToBackground(tag, payload) {
    if (!featureFlags.sendToBackground) return;
    try {
      chrome.runtime.sendMessage({
        type: "EVENT_FROM_CONTENT",
        tag,
        payload,
        url: location.href,
        ts: Date.now()
      });
    } catch (err) {
      console.warn("[LoggerBridge] sendMessage failed", err);
    }
  }

  // ----------------- Utilities -----------------
  const util = (() => {
    function safeStringify(obj) {
      try { return JSON.stringify(obj); }
      catch (e) {
        const seen = new WeakSet();
        return JSON.stringify(obj, function (k, v) {
          if (typeof v === "object" && v !== null) {
            if (seen.has(v)) return "[Circular]";
            seen.add(v);
          }
          return v;
        });
      }
    }

    function cssPath(el) {
      if (!el || el.nodeType !== 1) return "";
      const parts = [];
      while (el && el.nodeType === 1 && parts.length < 12) {
        let part = el.nodeName.toLowerCase();
        if (el.id) {
          part += `#${el.id}`;
          parts.unshift(part);
          break;
        } else {
          const className = (el.className || "").toString().trim().replace(/\s+/g, ".");
          if (className) part += `.${className}`;
          let idx = 1, sib = el;
          while ((sib = sib.previousElementSibling) != null) {
            if (sib.nodeName === el.nodeName) idx++;
          }
          part += `:nth-of-type(${idx})`;
        }
        parts.unshift(part);
        el = el.parentElement;
      }
      return parts.join(" > ");
    }

    function lzwCompressToBase64(str) {
      const dict = new Map();
      const data = (str + "").split("");
      const out = [];
      let phrase = data[0] || "";
      let code = 256;
      for (let i = 1; i < data.length; i++) {
        const curr = data[i];
        if (dict.has(phrase + curr)) {
          phrase = phrase + curr;
        } else {
          out.push(phrase.length === 1 ? phrase.charCodeAt(0) : dict.get(phrase));
          dict.set(phrase + curr, code++);
          phrase = curr;
        }
      }
      out.push(phrase.length === 1 ? phrase.charCodeAt(0) : dict.get(phrase));
      let byteStr = out.map(c => String.fromCharCode(c)).join("");
      try {
        return btoa(unescape(encodeURIComponent(byteStr)));
      } catch (e) {
        return btoa(unescape(encodeURIComponent(str)));
      }
    }

    return { safeStringify, cssPath, lzwCompressToBase64 };
  })();

  // ----------------- Event helper (dedupe) -----------------
  const EventRegistry = (() => {
    const map = new Map(); // key -> handler
    function add(target, evName, fn, opts) {
      const k = evName + "::" + (fn.__loggerId || (fn.__loggerId = Math.random().toString(36).slice(2)));
      if (map.has(k)) return false;
      try {
        target.addEventListener(evName, fn, opts);
      } catch (e) {
        // ignore
      }
      map.set(k, { target, evName, fn, opts });
      return true;
    }
    function removeAll() {
      for (const [k, meta] of map.entries()) {
        try { meta.target.removeEventListener(meta.evName, meta.fn, meta.opts); } catch (e) {}
      }
      map.clear();
    }
    return { add, removeAll };
  })();

  // ----------------- Batching module -----------------
  const Batcher = (() => {
    const queue = [];
    let intervalId = null;

    function enqueue(obj) {
      if (!featureFlags.batching) {
        // immediate log
        console.log(obj._consoleTag || "[Event]", obj);
        return;
      }
      queue.push(obj);
    }

    function flush(logFullPayload = false) {
      if (!queue.length) return null;
      const batch = queue.splice(0, queue.length);
      const json = util.safeStringify({ time: new Date().toISOString(), batch });
      const compressed = util.lzwCompressToBase64(json);
      const out = {
        time: new Date().toISOString(),
        events: batch.length,
        originalSize: json.length,
        compressedBase64Length: compressed.length
      };
      if (logFullPayload) out.compressed = compressed;
      console.log("[BatchLogger]", out);
      return out;
    }

    function start() {
      if (intervalId != null) return;
      intervalId = setInterval(() => {
        if (!queue.length) return;
        flush(true);
      }, CONFIG.BATCH_INTERVAL_MS);
    }
    function stop() {
      if (intervalId != null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }
    // start automatically
    start();

    return { enqueue, flush, stop, start, _queue: queue };
  })();


  // ----------------- Core log wrapper -----------------
 function logEvent(tag, payload) {
  try { console.log(tag, payload); } catch (e) {}

  // 1) Forward to background for live console logs
  forwardToBackground(tag, payload);

  // 2) Also write to background queue (persistence)
  if (featureFlags.sendToBackground) {
    try {
      chrome.runtime.sendMessage({
        type: "ENQUEUE",
        payload: Object.assign({ _consoleTag: tag }, payload)
      });
    } catch (err) {
      console.warn("[LoggerBridge] ENQUEUE failed", err);
    }
  }

  // 3) Regular batcher
  Batcher.enqueue(Object.assign({ _consoleTag: tag }, payload));
}

  // ----------------- Implemented loggers -----------------

  // Click
  function handleClick(evt) {
    if (!featureFlags.click) return;
    const el = evt.target;
    const info = {
      time: new Date().toISOString(),
      button: evt.button,
      clientX: evt.clientX,
      clientY: evt.clientY,
      pageX: evt.pageX,
      pageY: evt.pageY,
      target: {
        tag: el && el.tagName,
        id: el && el.id || null,
        classes: el && el.classList ? Array.from(el.classList) : [],
        cssPath: util.cssPath(el),
        textSample: (el && (el.innerText || "")).slice(0, 80)
      },
      modifiers: {
        alt: evt.altKey,
        ctrl: evt.ctrlKey,
        meta: evt.metaKey,
        shift: evt.shiftKey
      },
      actionType: "click"
    };
    logEvent("[ClickLogger]", info);
    if (featureFlags.rageClick) detectRageClick(evt);
  }

  // Keydown / typing detection
  function handleKeydown(event) {
    if (!featureFlags.keydown) return;
    const data = {
      type: "keydown",
      time: new Date().toISOString(),
      key: event.key,
      code: event.code,
      modifiers: {
        alt: event.altKey,
        ctrl: event.ctrlKey,
        shift: event.shiftKey,
        meta: event.metaKey
      },
      pageUrl: location.href
    };
    const el = event.target;
    data.element = {
      tag: el && el.tagName || null,
      id: el && el.id || null,
      name: el && el.name || null,
      type: el && el.type || null,
      classes: el && el.classList ? Array.from(el.classList) : [],
      isContentEditable: el && el.isContentEditable || false
    };

    if (featureFlags.typingSpeed) trackTypingSpeed(event, el);

    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el.isContentEditable) {
      if (el.type !== "password") {
        data.valueBefore = el.value ?? el.innerText ?? null;
        requestAnimationFrame(() => {
          const after = el.value ?? el.innerText ?? null;
          data.valueAfter = after;
          data.actionType = (after !== data.valueBefore) ? "typing" : "key";
          logEvent("[KeyLogger]", data);
        });
        return;
      }
    }
    data.actionType = "key";
    logEvent("[KeyLogger]", data);
  }

  // Input & Change
  function handleInput(evt) {
    if (!featureFlags.input) return;
    const el = evt.target;
    const info = {
      time: new Date().toISOString(),
      actionType: "input",
      pageUrl: location.href,
      target: {
        tag: el && el.tagName,
        id: el && el.id || null,
        name: el && el.name || null,
        type: el && el.type || null,
        classes: el && el.classList ? Array.from(el.classList) : [],
        cssPath: util.cssPath(el)
      }
    };
    if ("value" in el && el.type !== "password") info.value = el.value;
    logEvent("[InputLogger]", info);
  }

  function handleChange(evt) {
    if (!featureFlags.change) return;
    const el = evt.target;
    const info = {
      time: new Date().toISOString(),
      actionType: "change",
      pageUrl: location.href,
      target: {
        tag: el && el.tagName,
        id: el && el.id || null,
        name: el && el.name || null,
        type: el && el.type || null,
        classes: el && el.classList ? Array.from(el.classList) : [],
        cssPath: util.cssPath(el)
      }
    };
    if ("value" in el && el.type !== "password") info.value = el.value;
    logEvent("[ChangeLogger]", info);
  }

  // Selection
  function handleSelectionChange() {
    if (!featureFlags.selection) return;
    const selection = window.getSelection();
    if (!selection) return;
    const s = selection.toString();
    if (!s || !s.trim()) return;
    logEvent("[SelectionLogger]", {
      time: new Date().toISOString(),
      actionType: "selection",
      pageUrl: window.location.href,
      selectedText: s
    });
  }

  // Focus/Blur
  function handleFocus(evt) {
    if (!featureFlags.focusBlur) return;
    const el = evt.target;
    logEvent("[FocusLogger]", {
      time: new Date().toISOString(),
      actionType: "focus",
      pageUrl: location.href,
      target: {
        tag: el && el.tagName,
        id: el && el.id || null,
        name: el && el.name || null,
        type: el && el.type || null,
        classes: el && el.classList ? Array.from(el.classList) : [],
        cssPath: util.cssPath(el)
      }
    });
  }
  function handleBlur(evt) {
    if (!featureFlags.focusBlur) return;
    const el = evt.target;
    logEvent("[BlurLogger]", {
      time: new Date().toISOString(),
      actionType: "blur",
      pageUrl: location.href,
      target: {
        tag: el && el.tagName,
        id: el && el.id || null,
        name: el && el.name || null,
        type: el && el.type || null,
        classes: el && el.classList ? Array.from(el.classList) : [],
        cssPath: util.cssPath(el)
      }
    });
  }

  // Copy/Cut/Paste
  function handleCopy(evt) {
    if (!featureFlags.copyCutPaste) return;
    logEvent("[CopyLogger]", { time: new Date().toISOString(), actionType: "copy", pageUrl: location.href });
  }
  function handleCut(evt) {
    if (!featureFlags.copyCutPaste) return;
    logEvent("[CutLogger]", { time: new Date().toISOString(), actionType: "cut", pageUrl: location.href });
  }
  function handlePaste(evt) {
    if (!featureFlags.copyCutPaste) return;
    let pasted = null;
    try { if (evt.clipboardData) pasted = evt.clipboardData.getData("text/plain"); } catch (e) { pasted = null; }
    logEvent("[PasteLogger]", { time: new Date().toISOString(), actionType: "paste", pageUrl: location.href, pastedText: pasted });
  }

  // Scroll (debounced)
  let _lastScroll = { top: window.scrollY, left: window.scrollX, time: Date.now() };
  let _scrollTimer = null;
  function onScrollDebounced() {
    if (!featureFlags.scroll) return;
    const now = Date.now();
    const current = { top: window.scrollY, left: window.scrollX, time: now };
    const dy = current.top - _lastScroll.top;
    const dx = current.left - _lastScroll.left;
    const dt = Math.max(1, now - _lastScroll.time);
    const speed = Math.sqrt(dx*dx + dy*dy) / dt;
    logEvent("[ScrollLogger]", { time: new Date().toISOString(), pageUrl: location.href, position: { x: current.left, y: current.top }, delta: { dx, dy }, speedPxPerMs: speed });
    _lastScroll = current;
  }

  // Hover (delegated)
  const HOVER_SELECTOR = "a, button, img, input, [role='button']";
  const _hoveredSet = new WeakSet();
  function handleMouseOver(evt) {
    if (!featureFlags.hover) return;
    const el = evt.target && evt.target.closest ? evt.target.closest(HOVER_SELECTOR) : null;
    if (!el) return;
    if (_hoveredSet.has(el)) return;
    _hoveredSet.add(el);
    logEvent("[HoverEnter]", { time: new Date().toISOString(), pageUrl: location.href, target: { tag: el.tagName, id: el.id || null, cssPath: util.cssPath(el) } });
    el.addEventListener("mouseout", function _onceOut() {
      _hoveredSet.delete(el);
      logEvent("[HoverLeave]", { time: new Date().toISOString(), pageUrl: location.href, target: { tag: el.tagName, id: el.id || null, cssPath: util.cssPath(el) } });
      el.removeEventListener("mouseout", _onceOut);
    });
  }

  // Mouse sampling
  let _mousePos = { x: 0, y: 0 };
  function handleMouseMove(e) {
    if (!featureFlags.mouseSampling) return;
    _mousePos.x = e.clientX;
    _mousePos.y = e.clientY;
  }
  setInterval(() => {
    if (!featureFlags.mouseSampling) return;
    Batcher.enqueue({ time: new Date().toISOString(), actionType: "mouse_sample", x: _mousePos.x, y: _mousePos.y });
  }, CONFIG.SAMPLE_MOUSE_MS);

  // Resize & orientation
  let _resizeTimer = null;
  function handleResize() {
    if (!featureFlags.resizeOrientation) return;
    if (_resizeTimer) clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
      logEvent("[ResizeLogger]", { time: new Date().toISOString(), pageUrl: location.href, size: { width: window.innerWidth, height: window.innerHeight } });
    }, CONFIG.RESIZE_DEBOUNCE_MS);
  }
  function handleOrientation() {
    if (!featureFlags.resizeOrientation) return;
    logEvent("[OrientationLogger]", { time: new Date().toISOString(), pageUrl: location.href, orientation: screen.orientation ? screen.orientation.type : (window.orientation || null) });
  }

  // Network status
  function handleOnline() { if (!featureFlags.networkStatus) return; logEvent("[NetworkStatus]", { time: new Date().toISOString(), action: "online", pageUrl: location.href }); }
  function handleOffline(){ if (!featureFlags.networkStatus) return; logEvent("[NetworkStatus]", { time: new Date().toISOString(), action: "offline", pageUrl: location.href }); }

  // Beforeunload / visibility / pagehide
  function handleBeforeUnload(e) {
    if (!featureFlags.beforeUnload) return;
    if (featureFlags.batching && Batcher._queue && Batcher._queue.length) {
      const batch = Batcher._queue.splice(0, Batcher._queue.length);
      const json = util.safeStringify({ time: new Date().toISOString(), batch });
      const compressed = util.lzwCompressToBase64(json);
      console.log("[BatchLogger-beforeunload]", { time: new Date().toISOString(), events: batch.length, originalSize: json.length, compressedBase64Length: compressed.length });
    }
    logEvent("[BeforeUnload]", { time: new Date().toISOString(), pageUrl: location.href });
  }
  function handleVisibility() { if (!featureFlags.beforeUnload) return; logEvent("[VisibilityLogger]", { time: new Date().toISOString(), state: document.visibilityState, pageUrl: location.href }); }
  function handlePageHide() { if (!featureFlags.beforeUnload) return; logEvent("[PageHide]", { time: new Date().toISOString(), pageUrl: location.href }); }

  // Form submit
  function handleFormSubmit(evt) {
    if (!featureFlags.formSubmit) return;
    try {
      const form = evt.target;
      if (!(form && form.tagName === "FORM")) return;
      const info = {
        time: new Date().toISOString(),
        actionType: "form_submit",
        pageUrl: location.href,
        formAction: form.action || null,
        method: form.method || null,
        fields: {}
      };
      const fd = new FormData(form);
      for (const [k, v] of fd.entries()) {
        const el = form.elements[k];
        const tag = el && el.type ? el.type.toLowerCase() : null;
        if (tag === "password") info.fields[k] = "[PASSWORD_SUPPRESSED]";
        else {
          try { info.fields[k] = String(v).slice(0, 200); } catch (e) { info.fields[k] = "[UNSERIALIZABLE]"; }
        }
      }
      logEvent("[FormSubmitLogger]", info);
    } catch (err) {}
  }

  // Drag & Drop
  function handleDragStart(e) {
    if (!featureFlags.dragDrop) return;
    const el = e.target;
    logEvent("[DragStart]", { time: new Date().toISOString(), pageUrl: location.href, target: { tag: el && el.tagName, id: el && el.id || null, cssPath: util.cssPath(el) } });
  }
  function handleDragOver(e) {
    if (!featureFlags.dragDrop) return;
    logEvent("[DragOver]", { time: new Date().toISOString(), pageUrl: location.href, pos: { x: e.clientX, y: e.clientY } });
  }
  function handleDrop(e) {
    if (!featureFlags.dragDrop) return;
    const el = e.target;
    let dtInfo = null;
    try { const dt = e.dataTransfer; dtInfo = { types: Array.from(dt.types || []), items: dt.items ? dt.items.length : null }; } catch (ex) { dtInfo = null; }
    logEvent("[Drop]", { time: new Date().toISOString(), pageUrl: location.href, target: { tag: el && el.tagName, id: el && el.id || null, cssPath: util.cssPath(el) }, pos: { x: e.clientX, y: e.clientY }, dataTransfer: dtInfo });
  }

  // Rage click detection
  const _recentClicks = [];
  function detectRageClick(evt) {
    if (!featureFlags.rageClick) return;
    const now = Date.now();
    _recentClicks.push({ x: evt.clientX, y: evt.clientY, t: now });
    while (_recentClicks.length && now - _recentClicks[0].t > CONFIG.RAGE_CLICK_THRESHOLD_MS) _recentClicks.shift();
    const center = _recentClicks[_recentClicks.length - 1];
    if (!center) return;
    const nearby = _recentClicks.filter(c => {
      const dx = c.x - center.x, dy = c.y - center.y;
      return Math.sqrt(dx*dx + dy*dy) <= CONFIG.RAGE_CLICK_RADIUS_PX;
    });
    if (nearby.length >= CONFIG.RAGE_CLICK_REQUIRED) {
      logEvent("[RageClick]", { time: new Date().toISOString(), pageUrl: location.href, center: { x: center.x, y: center.y }, count: nearby.length, windowSize: { w: window.innerWidth, h: window.innerHeight } });
      _recentClicks.length = 0;
    }
  }

  // Typing speed (per-element)
  const _typingMap = new WeakMap();
  function trackTypingSpeed(keyEvent, el) {
    if (!featureFlags.typingSpeed) return;
    try {
      if (!(el instanceof Element)) return;
      let s = _typingMap.get(el);
      const now = Date.now();
      if (!s) { s = { last: now, intervals: [] }; _typingMap.set(el, s); return; }
      const dt = now - (s.last || now);
      s.intervals.push(dt);
      s.last = now;
      if (s.intervals.length > 40) s.intervals.shift();
      if (s.intervals.length % 10 === 0) {
        const avg = s.intervals.reduce((a,b) => a+b,0)/s.intervals.length;
        logEvent("[TypingSpeed]", { time: new Date().toISOString(), pageUrl: location.href, target: { tag: el.tagName, id: el.id || null, name: el.name || null }, avgMsBetweenKeys: Math.round(avg), sampleCount: s.intervals.length });
      }
    } catch (e) {}
  }

  // ----------------- Register listeners (deduped) -----------------
  try {
    EventRegistry.add(document, "click", handleClick, true);
    EventRegistry.add(document, "keydown", handleKeydown, true);
    EventRegistry.add(document, "input", handleInput, true);
    EventRegistry.add(document, "change", handleChange, true);
    EventRegistry.add(document, "selectionchange", handleSelectionChange, true);
    EventRegistry.add(document, "focus", handleFocus, true);
    EventRegistry.add(document, "blur", handleBlur, true);
    EventRegistry.add(document, "copy", handleCopy, true);
    EventRegistry.add(document, "cut", handleCut, true);
    EventRegistry.add(document, "paste", handlePaste, true);
    EventRegistry.add(document, "mouseover", handleMouseOver, true);
    EventRegistry.add(document, "mousemove", handleMouseMove, true);
    EventRegistry.add(window, "scroll", () => { if (_scrollTimer) clearTimeout(_scrollTimer); _scrollTimer = setTimeout(onScrollDebounced, CONFIG.SCROLL_DEBOUNCE_MS); }, true);
    EventRegistry.add(window, "resize", handleResize, true);
    EventRegistry.add(window, "orientationchange", handleOrientation, true);
    EventRegistry.add(window, "online", handleOnline, true);
    EventRegistry.add(window, "offline", handleOffline, true);
    EventRegistry.add(window, "beforeunload", handleBeforeUnload, true);
    EventRegistry.add(document, "visibilitychange", handleVisibility, true);
    EventRegistry.add(window, "pagehide", handlePageHide, true);
    EventRegistry.add(document, "submit", handleFormSubmit, true);
    EventRegistry.add(document, "dragstart", handleDragStart, true);
    EventRegistry.add(document, "dragover", handleDragOver, true);
    EventRegistry.add(document, "drop", handleDrop, true);
  } catch (err) {
    console.warn("[ContentLogger] event registration error", err);
  }

  // ----------------- Exposed API (namespaced) -----------------
  const api = {
    version: "2.0.0",
    featureFlags,
    CONFIG,

    // batch API
    flushBatch: (logFullPayload = false) => Batcher.flush(logFullPayload),
    getPendingBatchCount: () => Batcher._queue.length,
    // toggle features programmatically
    setFeature: (name, val) => {
      if (typeof featureFlags[name] === "undefined") throw new Error("Unknown feature " + name);
      featureFlags[name] = !!val;
      return featureFlags[name];
    },
    // stop all listeners and batching (clean uninstall)
    stopAll: () => {
      EventRegistry.removeAll();
      Batcher.stop();
      try { delete window[NS]; } catch (e) { window[NS] = undefined; }
    },
    // retrieve a tiny init summary
    initSummary: () => ({ version: api.version, ua: navigator.userAgent, url: location.href })
  };

  // attach to window under namespace — primary API
  try {
    Object.defineProperty(window, NS, {
      value: Object.assign(window[NS] || {}, api),
      writable: false,
      configurable: true,
      enumerable: false
    });
  } catch (e) {
    window[NS] = Object.assign(window[NS] || {}, api);
  }

  // --- Convenience plain aliases for page console / dev use ---
  try {
    window.__ext_logger_v2 = window[NS];
  } catch (e) { /* ignore */ }

  // initial log
  logEvent("[ContentLoggerInit]", { time: new Date().toISOString(), pageUrl: location.href, userAgent: navigator.userAgent });

  // done
})();
