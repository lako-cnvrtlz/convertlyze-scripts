// convertlyze-orbit.js — v4.0
// Desktop: Horizontal Stepper | Mobile + iPad: Vertical Stepper
// GitHub: lako-cnvrtlz/convertlyze-scripts
(function () {

  // ── SVG Icons ───────────────────────────────────────────────────────────────
  var ICONS = {
    Hero:
      '<svg width="22" height="22" viewBox="0 0 18 18" fill="none">' +
      '<path d="M10 2L4 10H9L8 16L14 8H9L10 2Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>',
    Zielgruppe:
      '<svg width="22" height="22" viewBox="0 0 18 18" fill="none">' +
      '<circle cx="7" cy="6" r="2.5" stroke="currentColor" stroke-width="1.6"/>' +
      '<path d="M2 15c0-3 2.2-5 5-5s5 2 5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
      '<circle cx="13" cy="6" r="2" stroke="currentColor" stroke-width="1.4"/>' +
      '<path d="M13 11c1.8.3 3 1.8 3 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>' +
      '</svg>',
    Conversion:
      '<svg width="22" height="22" viewBox="0 0 18 18" fill="none">' +
      '<circle cx="9" cy="9" r="7" stroke="currentColor" stroke-width="1.6"/>' +
      '<circle cx="9" cy="9" r="3.5" stroke="currentColor" stroke-width="1.6"/>' +
      '<circle cx="9" cy="9" r="1" fill="currentColor"/>' +
      '</svg>',
    Trust:
      '<svg width="22" height="22" viewBox="0 0 18 18" fill="none">' +
      '<path d="M9 2L3 5v5c0 3.5 2.5 6 6 7 3.5-1 6-3.5 6-7V5L9 2Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<path d="M6.5 9l2 2 3-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>',
  };

  // ── 4 Categories ─────────────────────────────────────────────────────────────
  var CATS = [
    {
      label:   "Hero",
      sev:     "CRITICAL",
      sevCol:  "#ef4444",
      finding: "Kein Outcome sichtbar",
      tip:     "Besucher sehen Features — nicht was sich fuer sie konkret aendert.",
      sec:     "hero",
    },
    {
      label:   "Zielgruppe",
      sev:     "HIGH",
      sevCol:  "#f59e0b",
      finding: "Nur Anwender angesprochen",
      tip:     "CEO, IT-Leiter und DSGVO-Verantwortliche finden keine Antworten auf ihre Fragen.",
      sec:     "hero",
    },
    {
      label:   "Conversion",
      sev:     "HIGH",
      sevCol:  "#f59e0b",
      finding: "Kein klarer naechster Schritt",
      tip:     "Besucher wissen nicht wann und warum sie jetzt handeln sollen.",
      sec:     "cta",
    },
    {
      label:   "Trust",
      sev:     "MEDIUM",
      sevCol:  "#4fd1c5",
      finding: "Proof ohne Relevanz",
      tip:     "Logos und Zahlen ohne Bezug zum konkreten Problem des Besuchers.",
      sec:     "trust",
    },
  ];

  var MOBILE_BP   = 768;
  var currentMode = null;
  var resizeTimer = null;

  // ── Shared: LP mockup HTML ──────────────────────────────────────────────────
  function mockupHTML(prefix, w, h) {
    var heroH    = Math.round(h * 0.32);
    var trustH   = Math.round(h * 0.12);
    var contentH = Math.round(h * 0.22);
    var ctaH     = Math.round(h * 0.15);
    return (
      '<div class="cvly-lp-frame" id="' + prefix + 'frame">' +
        '<div class="cvly-lp-mock" style="width:' + w + 'px;height:' + h + 'px;">' +
          '<div class="cvly-lp-bar">' +
            '<div class="cvly-lp-dot" style="background:#ef4444"></div>' +
            '<div class="cvly-lp-dot" style="background:#f59e0b"></div>' +
            '<div class="cvly-lp-dot" style="background:#4fd1c5"></div>' +
          '</div>' +
          '<div class="cvly-lp-body" style="padding-bottom:6px;">' +
            '<div class="cvly-lp-sec" id="' + prefix + 'hero" style="height:' + heroH + 'px;background:#1e2535;padding:5px;display:flex;flex-direction:column;align-items:flex-start;">' +
              '<div class="cvly-lp-line ' + prefix + 'hl" style="height:3px;width:80%;background:#334155;"></div>' +
              '<div class="cvly-lp-line ' + prefix + 'hl" style="height:3px;width:60%;background:#334155;"></div>' +
              '<div id="' + prefix + 'hcta" style="height:8px;width:46px;border-radius:3px;background:#1e3a5f;transition:background .35s;margin-top:3px;"></div>' +
            '</div>' +
            '<div class="cvly-lp-sec" id="' + prefix + 'trust" style="height:' + trustH + 'px;display:flex;gap:3px;padding:4px 5px;background:#0a0f1a;">' +
              '<div class="' + prefix + 'tb" style="flex:1;height:6px;border-radius:2px;background:#1e293b;transition:background .35s;"></div>' +
              '<div class="' + prefix + 'tb" style="flex:1;height:6px;border-radius:2px;background:#1e293b;transition:background .35s;"></div>' +
              '<div class="' + prefix + 'tb" style="flex:1;height:6px;border-radius:2px;background:#1e293b;transition:background .35s;"></div>' +
            '</div>' +
            '<div class="cvly-lp-sec" id="' + prefix + 'content" style="height:' + contentH + 'px;background:#0a0f1a;padding:5px;display:flex;flex-direction:column;align-items:flex-start;">' +
              '<div class="cvly-lp-line ' + prefix + 'cl" style="height:2px;width:75%;background:#1e293b;"></div>' +
              '<div class="cvly-lp-line ' + prefix + 'cl" style="height:2px;width:90%;background:#1e293b;"></div>' +
              '<div class="cvly-lp-line ' + prefix + 'cl" style="height:2px;width:55%;background:#1e293b;"></div>' +
            '</div>' +
            '<div class="cvly-lp-sec" id="' + prefix + 'cta" style="height:' + ctaH + 'px;background:#0a0f1a;display:flex;align-items:center;justify-content:center;margin-bottom:5px;">' +
              '<div id="' + prefix + 'ctabtn" style="padding:3px 12px;border-radius:4px;background:rgba(79,209,197,.3);font-size:7px;font-weight:700;color:#4fd1c5;transition:all .3s;font-family:system-ui;">CTA</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  // ── Shared: highlight LP sections ───────────────────────────────────────────
  function hlLP(wrap, prefix, catLabel, color) {
    var sec = null;
    if (catLabel) {
      for (var i = 0; i < CATS.length; i++) {
        if (CATS[i].label === catLabel) { sec = CATS[i].sec; break; }
      }
    }
    var col = color || "#4fd1c5";
    ["hero", "trust", "content", "cta"].forEach(function (id) {
      var el = document.getElementById(prefix + id);
      if (!el) return;
      var isA = id === sec;
      el.style.borderColor = isA ? col : "transparent";
      el.style.boxShadow   = isA ? "0 0 10px " + col + "44" : "none";
      el.style.background  = isA ? col + "28" : (id === "hero" ? "#1e2535" : "#0a0f1a");
    });
    wrap.querySelectorAll("." + prefix + "hl").forEach(function (l) { l.style.background = sec === "hero"    ? col + "88" : "#334155"; });
    wrap.querySelectorAll("." + prefix + "tb").forEach(function (b) { b.style.background = sec === "trust"   ? col       : "#1e293b"; });
    wrap.querySelectorAll("." + prefix + "cl").forEach(function (l) { l.style.background = sec === "content" ? col + "77" : "#1e293b"; });
    var hcta = document.getElementById(prefix + "hcta");
    if (hcta) hcta.style.background = sec === "hero" ? col : "#1e3a5f";
    var btn = document.getElementById(prefix + "ctabtn");
    if (btn) { btn.style.background = sec === "cta" ? col : "rgba(79,209,197,.3)"; btn.style.color = sec === "cta" ? "#0d1117" : "#4fd1c5"; }
    var frame = document.getElementById(prefix + "frame");
    if (frame) {
      frame.style.borderColor = catLabel ? col + "88" : "rgba(79,209,197,0.22)";
      frame.style.boxShadow   = catLabel ? "0 0 24px " + col + "33" : "0 0 24px rgba(79,209,197,0.15)";
    }
  }

  // ── Base CSS (once) ─────────────────────────────────────────────────────────
  var baseCSSInjected = false;
  function injectBaseCSS() {
    if (baseCSSInjected) return;
    baseCSSInjected = true;
    var s = document.createElement("style");
    s.textContent =
      ".cvly-lp-frame{padding:10px;border-radius:16px;background:linear-gradient(135deg,#161b27,#1e2535);border:1.5px solid rgba(79,209,197,0.22);box-shadow:0 0 24px rgba(79,209,197,0.15);transition:border-color .4s,box-shadow .4s;display:inline-block;}" +
      ".cvly-lp-mock{border-radius:9px;overflow:hidden;border:1px solid rgba(79,209,197,0.12);background:#0a0f1a;}" +
      ".cvly-lp-bar{height:12px;background:#1e2535;display:flex;align-items:center;padding-left:6px;gap:3px;}" +
      ".cvly-lp-dot{width:4px;height:4px;border-radius:50%;opacity:.7;}" +
      ".cvly-lp-body{padding:4px 4px 0;}" +
      ".cvly-lp-sec{border-radius:4px;margin-bottom:3px;border:1px solid transparent;transition:all .35s ease;overflow:hidden;}" +
      ".cvly-lp-line{border-radius:2px;margin-bottom:2px;transition:background .35s;}" +
      ".cvly-badge{display:inline-block;padding:2px 7px;border-radius:5px;font-size:9px;font-weight:800;letter-spacing:.8px;}";
    document.head.appendChild(s);
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  DESKTOP — Horizontal Stepper
  //  Layout: LP mockup left | info panel right
  // ════════════════════════════════════════════════════════════════════════════
  function initDesktopStepper(wrap) {
    var idx      = 0;
    var n        = CATS.length;
    var autoTimer = null;

    var s = document.createElement("style");
    s.id = "cvly-stepper-style";
    s.textContent =
      "#cvly-orbit-wrap{width:100%;max-width:100%;height:auto!important;min-height:0!important;padding:0!important;margin:0 auto!important;font-family:system-ui,-apple-system,sans-serif;user-select:none;box-sizing:border-box;}" +
      ".cvly-ds-inner{background:#0d1117;border-radius:20px;border:1px solid rgba(79,209,197,0.15);overflow:hidden;width:100%;box-sizing:border-box;}" +
      ".cvly-ds-body{display:flex;align-items:stretch;gap:0;padding:24px 24px 20px;min-height:210px;width:100%;box-sizing:border-box;}" +
      ".cvly-ds-mockup-col{flex-shrink:0;display:flex;align-items:center;margin-right:24px;}" +
      ".cvly-ds-info-col{flex:1;min-width:0;width:0;overflow:hidden;display:flex;flex-direction:column;justify-content:center;}" +
      ".cvly-ds-counter{font-size:10px;color:#475569;letter-spacing:.6px;margin-bottom:14px;text-transform:uppercase;white-space:nowrap;}" +
      ".cvly-ds-head{display:flex;align-items:center;gap:10px;margin-bottom:8px;overflow:hidden;}" +
      ".cvly-ds-icon-wrap{width:36px;height:36px;border-radius:10px;background:#161b27;border:1.5px solid #4fd1c5;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:border-color .3s;}" +
      ".cvly-ds-label{font-size:16px;font-weight:700;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
      ".cvly-ds-badge-wrap{margin-bottom:10px;margin-left:46px;}" +
      ".cvly-ds-finding{font-size:13px;font-weight:600;color:#e2e8f0;margin-bottom:7px;line-height:1.45;word-break:break-word;}" +
      ".cvly-ds-tip{font-size:11.5px;color:#94a3b8;line-height:1.55;word-break:break-word;}" +
      ".cvly-ds-controls{display:flex;align-items:center;justify-content:space-between;padding:14px 24px;border-top:1px solid rgba(255,255,255,0.05);}" +
      ".cvly-ds-ctrl{width:36px;height:36px;border-radius:50%;background:#161b27;border:1px solid rgba(79,209,197,0.2);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .2s;color:#4fd1c5;flex-shrink:0;}" +
      ".cvly-ds-ctrl:hover{background:rgba(79,209,197,0.1);}" +
      ".cvly-ds-pips{display:flex;gap:6px;align-items:center;}" +
      ".cvly-ds-pip{height:3px;border-radius:2px;background:#1e2535;transition:all .3s;width:8px;}" +
      ".cvly-ds-pip.active{background:#4fd1c5;width:22px;}";
    document.head.appendChild(s);

    wrap.innerHTML =
      '<div class="cvly-ds-inner">' +
        '<div class="cvly-ds-body">' +
          '<div class="cvly-ds-mockup-col">' +
            mockupHTML("d-", 108, 158) +
          '</div>' +
          '<div class="cvly-ds-info-col">' +
            '<div class="cvly-ds-counter" id="cvly-ds-counter"></div>' +
            '<div class="cvly-ds-head" id="cvly-ds-head"></div>' +
            '<div class="cvly-ds-badge-wrap" id="cvly-ds-badge-wrap"></div>' +
            '<div class="cvly-ds-finding" id="cvly-ds-finding"></div>' +
            '<div class="cvly-ds-tip" id="cvly-ds-tip"></div>' +
          '</div>' +
        '</div>' +
        '<div class="cvly-ds-controls">' +
          '<div class="cvly-ds-ctrl" id="cvly-ds-prev">' +
            '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="#4fd1c5" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          '</div>' +
          '<div class="cvly-ds-pips" id="cvly-ds-pips"></div>' +
          '<div class="cvly-ds-ctrl" id="cvly-ds-next">' +
            '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 4L10 8L6 12" stroke="#4fd1c5" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          '</div>' +
        '</div>' +
      '</div>';

    // Build pips
    var pipsEl = document.getElementById("cvly-ds-pips");
    CATS.forEach(function (_, i) {
      var pip = document.createElement("div");
      pip.className = "cvly-ds-pip" + (i === 0 ? " active" : "");
      pipsEl.appendChild(pip);
    });

    function render() {
      var cat = CATS[idx];
      document.getElementById("cvly-ds-counter").textContent = (idx + 1) + " von " + n;
      document.getElementById("cvly-ds-head").innerHTML =
        '<div class="cvly-ds-icon-wrap" style="border-color:' + cat.sevCol + ';color:' + cat.sevCol + ';">' + ICONS[cat.label] + '</div>' +
        '<span class="cvly-ds-label">' + cat.label + '</span>';
      document.getElementById("cvly-ds-badge-wrap").innerHTML =
        '<span class="cvly-badge" style="background:' + cat.sevCol + '22;border:1px solid ' + cat.sevCol + '55;color:' + cat.sevCol + ';">' + cat.sev + '</span>';
      document.getElementById("cvly-ds-finding").textContent = cat.finding;
      document.getElementById("cvly-ds-tip").innerHTML = "&#8594; " + cat.tip;
      document.querySelectorAll(".cvly-ds-pip").forEach(function (p, i) {
        p.classList.toggle("active", i === idx);
        p.style.width      = i === idx ? "22px" : "8px";
        p.style.background = i === idx ? "#4fd1c5" : "#1e2535";
      });
      hlLP(wrap, "d-", cat.label, cat.sevCol);
    }

    function startAuto() { autoTimer = setInterval(function () { idx = (idx + 1) % n; render(); }, 2600); }
    function stopAuto()  { clearInterval(autoTimer); }

    document.getElementById("cvly-ds-next").addEventListener("click", function () { stopAuto(); idx = (idx + 1) % n; render(); startAuto(); });
    document.getElementById("cvly-ds-prev").addEventListener("click", function () { stopAuto(); idx = (idx + n - 1) % n; render(); startAuto(); });

    wrap.addEventListener("mouseenter", stopAuto);
    wrap.addEventListener("mouseleave", startAuto);

    var tx = 0;
    wrap.addEventListener("touchstart", function (e) { tx = e.touches[0].clientX; stopAuto(); }, { passive: true });
    wrap.addEventListener("touchend",   function (e) {
      var dx = e.changedTouches[0].clientX - tx;
      if (Math.abs(dx) > 40) { idx = dx < 0 ? (idx + 1) % n : (idx + n - 1) % n; render(); }
      startAuto();
    }, { passive: true });

    wrap._cleanup = function () { stopAuto(); };
    render();
    startAuto();
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  MOBILE — Vertical Stepper (stacked: mockup top, info bottom)
  // ════════════════════════════════════════════════════════════════════════════
  function initMobileStepper(wrap) {
    var idx      = 0;
    var n        = CATS.length;

    var s = document.createElement("style");
    s.id = "cvly-stepper-style";
    s.textContent =
      "#cvly-orbit-wrap{width:100%;height:auto!important;min-height:0!important;padding:0!important;margin:0 auto!important;font-family:system-ui,-apple-system,sans-serif;user-select:none;}" +
      ".cvly-ms-inner{background:#0d1117;border-radius:20px;border:1px solid rgba(79,209,197,0.15);overflow:hidden;}" +
      ".cvly-ms-top{padding:28px 24px;display:flex;gap:20px;align-items:center;min-height:200px;}" +
      ".cvly-ms-info{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;}" +
      ".cvly-ms-counter{font-size:10px;color:#475569;letter-spacing:.5px;margin-bottom:12px;text-transform:uppercase;}" +
      ".cvly-ms-icon-wrap{width:36px;height:36px;border-radius:10px;background:#161b27;border:1.5px solid #4fd1c5;display:flex;align-items:center;justify-content:center;margin-bottom:8px;transition:border-color .3s;}" +
      ".cvly-ms-label{font-size:15px;font-weight:700;color:#e2e8f0;margin-bottom:8px;width:100%;}" +
      ".cvly-ms-finding{font-size:13px;font-weight:600;color:#e2e8f0;margin-bottom:6px;line-height:1.4;text-align:left;width:100%;}" +
      ".cvly-ms-tip{font-size:11px;color:#94a3b8;line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;text-align:left;width:100%;}" +
      ".cvly-ms-controls{display:flex;align-items:center;justify-content:space-between;padding:14px 24px;border-top:1px solid rgba(255,255,255,0.05);}" +
      ".cvly-ms-ctrl{width:38px;height:38px;border-radius:50%;background:#161b27;border:1px solid rgba(79,209,197,0.2);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s;color:#4fd1c5;}" +
      ".cvly-ms-ctrl:hover{background:rgba(79,209,197,0.1);}" +
      ".cvly-ms-pips{display:flex;gap:6px;align-items:center;}" +
      ".cvly-ms-pip{height:3px;border-radius:2px;background:#1e2535;transition:all .3s;width:8px;}" +
      ".cvly-ms-pip.active{background:#4fd1c5;width:20px;}";
    document.head.appendChild(s);

    wrap.innerHTML =
      '<div class="cvly-ms-inner" id="cvly-ms-inner">' +
        '<div class="cvly-ms-top">' +
          mockupHTML("m-", 100, 148) +
          '<div class="cvly-ms-info" id="cvly-ms-info"></div>' +
        '</div>' +
        '<div class="cvly-ms-controls">' +
          '<div class="cvly-ms-ctrl" id="cvly-ms-prev"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="#4fd1c5" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>' +
          '<div class="cvly-ms-pips" id="cvly-ms-pips"></div>' +
          '<div class="cvly-ms-ctrl" id="cvly-ms-next"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 4L10 8L6 12" stroke="#4fd1c5" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>' +
        '</div>' +
      '</div>';

    var pipsEl = document.getElementById("cvly-ms-pips");
    CATS.forEach(function (_, i) {
      var pip = document.createElement("div");
      pip.className = "cvly-ms-pip" + (i === 0 ? " active" : "");
      pipsEl.appendChild(pip);
    });

    function render() {
      var cat = CATS[idx];
      document.getElementById("cvly-ms-info").innerHTML =
        '<div style="font-size:10px;color:#475569;letter-spacing:.5px;margin-bottom:12px;text-transform:uppercase;">' + (idx + 1) + " von " + n + "</div>" +
        '<div style="width:36px;height:36px;border-radius:10px;background:#161b27;border:1.5px solid ' + cat.sevCol + ';display:flex;align-items:center;justify-content:center;margin-bottom:8px;color:' + cat.sevCol + ';">' + ICONS[cat.label] + "</div>" +
        '<div style="font-size:15px;font-weight:700;color:#e2e8f0;margin-bottom:8px;width:100%;">' + cat.label + "</div>" +
        '<span class="cvly-badge" style="background:' + cat.sevCol + '22;border:1px solid ' + cat.sevCol + '55;color:' + cat.sevCol + ';margin-bottom:10px;display:inline-block;">' + cat.sev + "</span>" +
        '<div style="font-size:13px;font-weight:600;color:#e2e8f0;margin-bottom:6px;line-height:1.4;width:100%;">' + cat.finding + "</div>" +
        '<div style="font-size:11px;color:#94a3b8;line-height:1.5;width:100%;">&#8594; ' + cat.tip + "</div>";
      document.querySelectorAll(".cvly-ms-pip").forEach(function (p, i) {
        p.classList.toggle("active", i === idx);
        p.style.width      = i === idx ? "20px" : "8px";
        p.style.background = i === idx ? "#4fd1c5" : "#1e2535";
      });
      hlLP(wrap, "m-", cat.label, cat.sevCol);
    }

    document.getElementById("cvly-ms-next").addEventListener("click", function () { idx = (idx + 1) % n; render(); });
    document.getElementById("cvly-ms-prev").addEventListener("click", function () { idx = (idx + n - 1) % n; render(); });

    var tx = 0;
    var inner = document.getElementById("cvly-ms-inner");
    inner.addEventListener("touchstart", function (e) { tx = e.touches[0].clientX; }, { passive: true });
    inner.addEventListener("touchend",   function (e) {
      var dx = e.changedTouches[0].clientX - tx;
      if (Math.abs(dx) > 40) { idx = dx < 0 ? (idx + 1) % n : (idx + n - 1) % n; render(); }
    }, { passive: true });

    wrap._cleanup = function () {};
    render();
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Router — Desktop >= 768px uses horizontal stepper, mobile uses vertical
  // ════════════════════════════════════════════════════════════════════════════
  function isMobile() { return window.innerWidth < MOBILE_BP; }

  function renderMode(wrap) {
    var mobile = isMobile();
    var mode   = mobile ? "mobile" : "desktop";
    if (currentMode === mode) return;
    currentMode = mode;

    if (wrap._cleanup) wrap._cleanup();
    var old = document.getElementById("cvly-stepper-style");
    if (old) old.parentNode.removeChild(old);

    wrap.style.height    = "auto";
    wrap.style.minHeight = "0";
    wrap.style.maxHeight = "none";
    wrap.style.padding   = "0";
    wrap.innerHTML = "";

    if (mobile) initMobileStepper(wrap);
    else        initDesktopStepper(wrap);
  }

  function init() {
    var wrap = document.getElementById("cvly-orbit-wrap");
    if (!wrap) return;
    injectBaseCSS();
    renderMode(wrap);

    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { renderMode(wrap); }, 150);
    });
    window.addEventListener("orientationchange", function () {
      setTimeout(function () { renderMode(wrap); }, 300);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

})();
