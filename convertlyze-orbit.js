// convertlyze-orbit.js — v1.0
// GitHub: lako-cnvrtlz/convertlyze-scripts
(function () {
  var CATS = [
    { label: "Hero",       icon: "⚡", angle: -90,  sev: "CRITICAL", sevCol: "#ef4444", finding: "Features statt Outcomes",    tip: "Schreib den Hero auf das Ergebnis um, nicht auf das Tool.",       lpSection: "hero" },
    { label: "Conversion", icon: "🎯", angle: -22,  sev: "HIGH",     sevCol: "#f59e0b", finding: "CTA unklar positioniert",     tip: "CTA direkt nach dem staerksten Trust-Signal platzieren.",          lpSection: "cta" },
    { label: "Zielgruppe", icon: "👥", angle: 46,   sev: "HIGH",     sevCol: "#f59e0b", finding: "Keine Zielgruppe im Hero",    tip: "Zielgruppe explizit im Hero nennen.",                              lpSection: "hero" },
    { label: "Trust",      icon: "🛡️", angle: 114,  sev: "MEDIUM",   sevCol: "#4fd1c5", finding: "Testimonials zu weit unten", tip: "Mindestens ein Testimonial above the fold setzen.",                lpSection: "trust" },
    { label: "Struktur",   icon: "📐", angle: 182,  sev: "HIGH",     sevCol: "#f59e0b", finding: "Kein klarer AIDA-Flow",       tip: "Problem - Loesung - Proof - CTA konsequent aufbauen.",             lpSection: "content" },
    { label: "Wettbewerb", icon: "🔍", angle: 250,  sev: "MEDIUM",   sevCol: "#4fd1c5", finding: "USP nicht differenziert",    tip: "Konkret benennen, was du besser machst als Wettbewerber.",         lpSection: "content" },
  ];

  var SIZE = 340, cx = 170, cy = 170, R = 118;
  var active = null, pulseIdx = 0, autoTimer = null;

  function init() {
    var wrap = document.getElementById("cvly-orbit-wrap");
    if (!wrap) return;

    // ── Inject CSS ──────────────────────────────────────────────────────────
    var style = document.createElement("style");
    style.textContent = [
      "#cvly-orbit-wrap{width:100%;max-width:420px;margin:0 auto;position:relative;user-select:none;}",
      "#cvly-orbit-wrap svg{overflow:visible;display:block;}",
      ".cvly-node{position:absolute;width:60px;height:60px;border-radius:14px;background:#161b27;",
        "border:1.5px solid rgba(79,209,197,0.18);display:flex;flex-direction:column;",
        "align-items:center;justify-content:center;gap:3px;cursor:pointer;transition:all 0.3s ease;box-sizing:border-box;}",
      ".cvly-node.active{border-color:var(--sev-color);",
        "box-shadow:0 0 20px color-mix(in srgb,var(--sev-color) 35%,transparent);",
        "background:color-mix(in srgb,var(--sev-color) 12%,#161b27);}",
      ".cvly-node-icon{font-size:20px;line-height:1;}",
      ".cvly-node-label{font-size:9px;font-weight:700;color:rgba(100,116,139,1);letter-spacing:.3px;transition:color .3s;}",
      ".cvly-node.active .cvly-node-label{color:var(--sev-color);}",
      ".cvly-tooltip{position:absolute;width:160px;padding:10px 12px;border-radius:10px;background:#1e2535;",
        "border:1px solid rgba(79,209,197,.25);box-shadow:0 8px 24px rgba(0,0,0,.5);z-index:50;",
        "pointer-events:none;top:50%;transform:translateY(-50%);display:none;",
        "font-family:system-ui,-apple-system,sans-serif;}",
      ".cvly-tooltip.show{display:block;}",
      ".cvly-tooltip.left{right:68px;}.cvly-tooltip.right{left:68px;}",
      ".cvly-tooltip-header{display:flex;align-items:center;gap:5px;margin-bottom:6px;}",
      ".cvly-tooltip-icon{font-size:12px;}.cvly-tooltip-name{font-size:11px;font-weight:700;color:#e2e8f0;}",
      ".cvly-badge{display:inline-block;padding:1px 5px;border-radius:4px;font-size:8px;font-weight:800;letter-spacing:.8px;}",
      ".cvly-tooltip-finding{font-size:11px;font-weight:600;color:#e2e8f0;margin-bottom:4px;line-height:1.4;}",
      ".cvly-tooltip-tip{font-size:10px;color:#64748b;line-height:1.5;}",
      ".cvly-center-card{position:absolute;left:50%;top:50%;transform:translate(-50%,-58%);z-index:20;",
        "display:flex;flex-direction:column;align-items:center;gap:0;}",
      ".cvly-lp-frame{padding:8px;border-radius:14px;background:linear-gradient(135deg,#161b27,#1e2535);",
        "border:1.5px solid rgba(79,209,197,.18);box-shadow:0 0 20px rgba(79,209,197,.2);transition:border-color .4s,box-shadow .4s;}",
      ".cvly-lp-mockup{width:80px;height:110px;border-radius:8px;overflow:hidden;",
        "border:1.5px solid rgba(79,209,197,.18);background:#0a0f1a;}",
      ".cvly-lp-bar{height:10px;background:#1e2535;display:flex;align-items:center;padding-left:4px;gap:2px;}",
      ".cvly-lp-dot{width:3px;height:3px;border-radius:50%;opacity:.7;}",
      ".cvly-lp-body{padding:3px 3px 0;}",
      ".cvly-lp-section{border-radius:3px;margin-bottom:2px;border:1px solid transparent;",
        "transition:all .35s ease;display:flex;align-items:center;justify-content:center;overflow:hidden;}",
      ".cvly-lp-line{height:2px;border-radius:1px;margin-bottom:2px;background:#1e293b;transition:background .35s;}",
      ".cvly-finding-bubble{margin-top:8px;padding:6px 12px;border-radius:8px;",
        "background:rgba(79,209,197,.08);border:1px solid rgba(79,209,197,.18);",
        "max-width:160px;text-align:center;transition:all .35s ease;min-height:44px;",
        "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;",
        "font-family:system-ui,-apple-system,sans-serif;}",
      ".cvly-finding-text{font-size:10px;font-weight:600;color:#e2e8f0;line-height:1.3;}",
      ".cvly-finding-hint{font-size:10px;color:#64748b;}",
    ].join("");
    document.head.appendChild(style);

    // ── Build HTML ──────────────────────────────────────────────────────────
    wrap.innerHTML = [
      '<svg id="cvly-svg" width="340" height="340" style="width:100%;height:auto;"></svg>',
      '<div class="cvly-center-card">',
        '<div class="cvly-lp-frame" id="cvly-lp-frame">',
          '<div class="cvly-lp-mockup">',
            '<div class="cvly-lp-bar">',
              '<div class="cvly-lp-dot" style="background:#ef4444"></div>',
              '<div class="cvly-lp-dot" style="background:#f59e0b"></div>',
              '<div class="cvly-lp-dot" style="background:#4fd1c5"></div>',
            '</div>',
            '<div class="cvly-lp-body">',
              '<div class="cvly-lp-section" id="lp-hero" style="height:36px;background:#1e2535;padding:2px 4px;flex-direction:column;justify-content:flex-start;align-items:flex-start;">',
                '<div class="cvly-lp-line" style="width:80%;margin-top:4px"></div>',
                '<div class="cvly-lp-line" style="width:60%"></div>',
                '<div id="lp-hero-cta" style="height:5px;background:#1e3a5f;border-radius:3px;width:50%;transition:background .35s;"></div>',
              '</div>',
              '<div class="cvly-lp-section" id="lp-trust" style="height:12px;padding:0 3px;gap:2px;">',
                '<div style="flex:1;height:4px;background:#1e293b;border-radius:2px;transition:background .35s;" class="cvly-trust-bar"></div>',
                '<div style="flex:1;height:4px;background:#1e293b;border-radius:2px;transition:background .35s;" class="cvly-trust-bar"></div>',
                '<div style="flex:1;height:4px;background:#1e293b;border-radius:2px;transition:background .35s;" class="cvly-trust-bar"></div>',
              '</div>',
              '<div class="cvly-lp-section" id="lp-content" style="height:22px;padding:2px 4px;flex-direction:column;align-items:flex-start;">',
                '<div class="cvly-lp-line" style="width:70%"></div>',
                '<div class="cvly-lp-line" style="width:90%"></div>',
                '<div class="cvly-lp-line" style="width:55%"></div>',
              '</div>',
              '<div class="cvly-lp-section" id="lp-cta" style="height:14px;background:#0a0f1a;">',
                '<div id="lp-cta-btn" style="padding:2px 8px;border-radius:3px;background:rgba(79,209,197,.3);font-size:5px;font-weight:700;color:#4fd1c5;transition:all .3s;font-family:system-ui;">CTA</div>',
              '</div>',
            '</div>',
          '</div>',
        '</div>',
        '<div class="cvly-finding-bubble" id="cvly-bubble"><span class="cvly-finding-hint">Hover fuer Findings</span></div>',
      '</div>',
    ].join("");

    // ── SVG ────────────────────────────────────────────────────────────────
    var svg = document.getElementById("cvly-svg");
    svg.setAttribute("viewBox", "0 0 340 340");

    function svgEl(tag, attrs) {
      var el = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (var k in attrs) el.setAttribute(k, attrs[k]);
      return el;
    }

    svg.appendChild(svgEl("circle", { cx: cx, cy: cy, r: R + 8, fill: "none", stroke: "#4fd1c5", "stroke-width": "0.5", opacity: "0.08" }));
    svg.appendChild(svgEl("circle", { cx: cx, cy: cy, r: R,     fill: "none", stroke: "rgba(79,209,197,0.18)", "stroke-width": "1", "stroke-dasharray": "3 8" }));

    var lines = [];
    CATS.forEach(function (cat) {
      var rad = cat.angle * Math.PI / 180;
      var line = svgEl("line", {
        x1: cx, y1: cy - 4,
        x2: cx + R * Math.cos(rad), y2: cy + R * Math.sin(rad),
        stroke: "rgba(79,209,197,0.18)", "stroke-width": "0.8", "stroke-dasharray": "3 4",
      });
      svg.appendChild(line);
      lines.push(line);
    });

    var pulseDot = svgEl("circle", { r: "3", fill: "#4fd1c5", opacity: "0" });
    svg.appendChild(pulseDot);

    // ── Nodes ───────────────────────────────────────────────────────────────
    var nodes = [];
    CATS.forEach(function (cat, i) {
      var rad = cat.angle * Math.PI / 180;
      var nx = cx + R * Math.cos(rad);
      var ny = cy + R * Math.sin(rad);
      var isLeft = cat.angle > 90 && cat.angle < 270;

      var node = document.createElement("div");
      node.className = "cvly-node";
      node.style.cssText = "--sev-color:" + cat.sevCol + ";left:" + (nx / SIZE * 100 - 8.8) + "%;top:" + (ny / SIZE * 100 - 8.8) + "%;";
      node.innerHTML =
        '<span class="cvly-node-icon">' + cat.icon + "</span>" +
        '<span class="cvly-node-label">' + cat.label + "</span>";

      var tt = document.createElement("div");
      tt.className = "cvly-tooltip " + (isLeft ? "left" : "right");
      tt.innerHTML =
        '<div class="cvly-tooltip-header">' +
          '<span class="cvly-tooltip-icon">' + cat.icon + "</span>" +
          '<span class="cvly-tooltip-name">' + cat.label + "</span>" +
          '<span class="cvly-badge" style="background:' + cat.sevCol + '22;border:1px solid ' + cat.sevCol + '55;color:' + cat.sevCol + '">' + cat.sev + "</span>" +
        "</div>" +
        '<div class="cvly-tooltip-finding">' + cat.finding + "</div>" +
        '<div class="cvly-tooltip-tip">&#8594; ' + cat.tip + "</div>";
      node.appendChild(tt);
      wrap.appendChild(node);
      nodes.push({ el: node, tt: tt, cat: cat, nx: nx, ny: ny });

      node.addEventListener("mouseenter", function () { setActive(i); });
      node.addEventListener("mouseleave", function () { setActive(null); });
      node.addEventListener("touchstart", function (e) { e.preventDefault(); setActive(i); }, { passive: false });
    });

    // ── State ───────────────────────────────────────────────────────────────
    function setActive(idx) {
      active = idx;
      var bubble = document.getElementById("cvly-bubble");
      var frame  = document.getElementById("cvly-lp-frame");

      nodes.forEach(function (n, i) {
        var isA = i === idx;
        n.el.classList.toggle("active", isA);
        n.tt.classList.toggle("show", isA);
        if (isA) {
          lines[i].setAttribute("stroke", n.cat.sevCol);
          lines[i].setAttribute("stroke-width", "1.5");
          lines[i].removeAttribute("stroke-dasharray");
          lines[i].setAttribute("opacity", "0.9");
          pulseDot.setAttribute("cx", (n.nx + cx) / 2);
          pulseDot.setAttribute("cy", (n.ny + cy) / 2);
          pulseDot.setAttribute("fill", n.cat.sevCol);
          pulseDot.setAttribute("opacity", "0.9");
        } else {
          lines[i].setAttribute("stroke", "rgba(79,209,197,0.18)");
          lines[i].setAttribute("stroke-width", "0.8");
          lines[i].setAttribute("stroke-dasharray", "3 4");
          lines[i].setAttribute("opacity", "1");
        }
      });

      if (idx !== null) {
        var cat = CATS[idx];
        bubble.style.background   = cat.sevCol + "18";
        bubble.style.borderColor  = cat.sevCol + "44";
        bubble.innerHTML =
          '<span class="cvly-badge" style="background:' + cat.sevCol + '20;border:1px solid ' + cat.sevCol + '55;color:' + cat.sevCol + '">' + cat.sev + "</span>" +
          '<span class="cvly-finding-text">' + cat.finding + "</span>";
        frame.style.borderColor = cat.sevCol + "88";
        frame.style.boxShadow   = "0 0 28px " + cat.sevCol + "44";
        highlightLP(cat.lpSection, cat.sevCol);
      } else {
        pulseDot.setAttribute("opacity", "0");
        bubble.style.background  = "rgba(79,209,197,0.08)";
        bubble.style.borderColor = "rgba(79,209,197,0.18)";
        bubble.innerHTML = '<span class="cvly-finding-hint">Hover fuer Findings</span>';
        frame.style.borderColor = "rgba(79,209,197,0.18)";
        frame.style.boxShadow   = "0 0 20px rgba(79,209,197,0.2)";
        highlightLP(null, null);
      }
    }

    function highlightLP(section, color) {
      var col = color || "#4fd1c5";
      var secs = { hero: "lp-hero", trust: "lp-trust", content: "lp-content", cta: "lp-cta" };
      for (var k in secs) {
        var el = document.getElementById(secs[k]);
        if (!el) continue;
        var isA = k === section;
        el.style.background   = isA ? col + "30" : (k === "hero" ? "#1e2535" : "#0a0f1a");
        el.style.borderColor  = isA ? col : "transparent";
        el.style.boxShadow    = isA ? "0 0 8px " + col + "44" : "none";
      }
      wrap.querySelectorAll(".cvly-trust-bar").forEach(function (b) {
        b.style.background = section === "trust" ? col : "#1e293b";
      });
      wrap.querySelectorAll("#lp-hero .cvly-lp-line").forEach(function (l) {
        l.style.background = section === "hero" ? col + "88" : "#1e293b";
      });
      var btn = document.getElementById("lp-cta-btn");
      if (btn) {
        btn.style.background = section === "cta" ? col : "rgba(79,209,197,0.3)";
        btn.style.color      = section === "cta" ? "#0d1117" : "#4fd1c5";
      }
    }

    // ── Auto-play ───────────────────────────────────────────────────────────
    function startAuto() {
      autoTimer = setInterval(function () {
        pulseIdx = (pulseIdx + 1) % CATS.length;
        setActive(pulseIdx);
      }, 2000);
    }

    wrap.addEventListener("mouseenter", function () { clearInterval(autoTimer); });
    wrap.addEventListener("mouseleave", function () { startAuto(); });

    startAuto();
  }

  // Run after DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
