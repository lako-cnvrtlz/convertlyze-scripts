// convertlyze-orbit.js — v2.4
// GitHub: lako-cnvrtlz/convertlyze-scripts
(function () {
  var CATS = [
    { label: "Hero",       icon: "⚡", angle: -90,  sev: "CRITICAL", sevCol: "#ef4444", finding: "Features statt Outcomes",    tip: "Hero auf Ergebnis umschreiben, nicht auf das Tool." },
    { label: "Conversion", icon: "🎯", angle: -30,  sev: "HIGH",     sevCol: "#f59e0b", finding: "CTA unklar positioniert",     tip: "CTA direkt nach dem staerksten Trust-Signal." },
    { label: "Zielgruppe", icon: "👥", angle: 30,   sev: "HIGH",     sevCol: "#f59e0b", finding: "Keine Zielgruppe im Hero",    tip: "Zielgruppe explizit im Hero nennen." },
    { label: "Trust",      icon: "🛡️", angle: 90,   sev: "MEDIUM",   sevCol: "#4fd1c5", finding: "Testimonials zu weit unten", tip: "Mindestens ein Testimonial above the fold." },
    { label: "Struktur",   icon: "📐", angle: 150,  sev: "HIGH",     sevCol: "#f59e0b", finding: "Kein klarer AIDA-Flow",       tip: "Problem - Loesung - Proof - CTA aufbauen." },
    { label: "Wettbewerb", icon: "🔍", angle: 210,  sev: "MEDIUM",   sevCol: "#4fd1c5", finding: "USP nicht differenziert",    tip: "Konkret benennen was du besser machst." },
  ];

  var W   = 680;   // design width — never changes
  var H   = 580;
  var R   = 218;
  var NW  = 92;
  var NH  = 78;
  var MKW = 130;
  var MKH = 178;

  var cx = W / 2, cy = H / 2;
  var active = null, pulseIdx = 0, autoTimer = null;

  function init() {
    var wrap = document.getElementById("cvly-orbit-wrap");
    if (!wrap) return;

    var style = document.createElement("style");
    style.textContent =
      "#cvly-orbit-wrap{width:100%;max-width:" + W + "px;margin:0 auto;" +
        "font-family:system-ui,-apple-system,sans-serif;user-select:none;}" +

      // Scaler: fixed design size, scaled down on small screens
      "#cvly-orbit-scaler{width:" + W + "px;transform-origin:top center;}" +

      // Orbit area
      "#cvly-orbit-area{position:relative;width:100%;}" +
      "#cvly-orbit-area svg{display:block;width:100%;height:auto;}" +

      // Nodes
      ".cvly-node{position:absolute;border-radius:16px;background:#161b27;" +
        "border:1.5px solid rgba(79,209,197,0.22);display:flex;flex-direction:column;" +
        "align-items:center;justify-content:center;gap:5px;cursor:pointer;" +
        "transition:all 0.3s ease;box-sizing:border-box;padding:8px 6px;}" +
      ".cvly-node.active{border-color:var(--sc);" +
        "background:color-mix(in srgb,var(--sc) 14%,#161b27);" +
        "box-shadow:0 0 28px color-mix(in srgb,var(--sc) 45%,transparent);}" +
      ".cvly-node-icon{font-size:28px;line-height:1;}" +
      ".cvly-node-label{font-size:11px;font-weight:700;color:#64748b;" +
        "letter-spacing:.3px;transition:color .3s;white-space:nowrap;}" +
      ".cvly-node.active .cvly-node-label{color:var(--sc);}" +

      // Center mockup
      ".cvly-cc{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:20;}" +
      ".cvly-frame{padding:12px;border-radius:18px;" +
        "background:linear-gradient(135deg,#161b27,#1e2535);" +
        "border:1.5px solid rgba(79,209,197,0.22);" +
        "box-shadow:0 0 28px rgba(79,209,197,0.18);transition:border-color .4s,box-shadow .4s;}" +
      ".cvly-mock{border-radius:10px;overflow:hidden;" +
        "border:1px solid rgba(79,209,197,0.15);background:#0a0f1a;}" +
      ".cvly-bar{height:14px;background:#1e2535;display:flex;align-items:center;" +
        "padding-left:6px;gap:4px;}" +
      ".cvly-dot{width:5px;height:5px;border-radius:50%;opacity:.7;}" +
      ".cvly-body{padding:5px 5px 0;}" +
      ".cvly-s{border-radius:5px;margin-bottom:4px;border:1px solid transparent;" +
        "transition:all .35s ease;overflow:hidden;}" +
      ".cvly-l{border-radius:2px;margin-bottom:3px;transition:background .35s;}" +

      // Panel — fixed height, outside scaler so it stays readable on mobile
      "#cvly-panel{margin:14px auto 0;width:100%;max-width:340px;" +
        "height:90px;padding:14px 16px;border-radius:14px;background:#1e2535;" +
        "border:1px solid rgba(79,209,197,0.2);" +
        "box-shadow:0 8px 32px rgba(0,0,0,0.4);" +
        "transition:border-color .3s,opacity .3s;" +
        "box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;" +
        "visibility:hidden;opacity:0;}" +
      "#cvly-panel.visible{visibility:visible;opacity:1;}" +
      "#cvly-panel .ph{display:flex;align-items:center;gap:7px;margin-bottom:7px;}" +
      "#cvly-panel .pi{font-size:16px;}" +
      "#cvly-panel .pn{font-size:13px;font-weight:700;color:#e2e8f0;}" +
      ".cvly-badge{display:inline-block;padding:2px 7px;border-radius:5px;" +
        "font-size:9px;font-weight:800;letter-spacing:.8px;}" +
      "#cvly-panel .pf{font-size:13px;font-weight:600;color:#e2e8f0;" +
        "margin-bottom:5px;line-height:1.3;}" +
      "#cvly-panel .pt{font-size:12px;color:#94a3b8;line-height:1.4;}";

    document.head.appendChild(style);

    var heroH    = Math.round(MKH * 0.32);
    var trustH   = Math.round(MKH * 0.10);
    var contentH = Math.round(MKH * 0.20);
    var ctaH     = Math.round(MKH * 0.14);

    wrap.innerHTML =
      // Scaler wraps only the orbit graphic
      '<div id="cvly-orbit-scaler">' +
        '<div id="cvly-orbit-area">' +
          '<svg id="cvly-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '"></svg>' +
          '<div class="cvly-cc"><div class="cvly-frame" id="cvly-frame">' +
            '<div class="cvly-mock" style="width:' + MKW + 'px;height:' + MKH + 'px;">' +
              '<div class="cvly-bar">' +
                '<div class="cvly-dot" style="background:#ef4444"></div>' +
                '<div class="cvly-dot" style="background:#f59e0b"></div>' +
                '<div class="cvly-dot" style="background:#4fd1c5"></div>' +
              '</div>' +
              '<div class="cvly-body">' +
                '<div class="cvly-s" id="s-hero" style="height:' + heroH + 'px;background:#1e2535;padding:5px;display:flex;flex-direction:column;align-items:flex-start;">' +
                  '<div class="cvly-l hl" style="height:4px;width:80%;background:#334155;"></div>' +
                  '<div class="cvly-l hl" style="height:4px;width:60%;background:#334155;"></div>' +
                  '<div id="s-hcta" style="height:9px;width:52px;border-radius:4px;background:#1e3a5f;transition:background .35s;margin-top:3px;"></div>' +
                '</div>' +
                '<div class="cvly-s" id="s-trust" style="height:' + trustH + 'px;display:flex;gap:4px;padding:4px 5px;background:#0a0f1a;">' +
                  '<div class="tb" style="flex:1;height:7px;border-radius:2px;background:#1e293b;transition:background .35s;"></div>' +
                  '<div class="tb" style="flex:1;height:7px;border-radius:2px;background:#1e293b;transition:background .35s;"></div>' +
                  '<div class="tb" style="flex:1;height:7px;border-radius:2px;background:#1e293b;transition:background .35s;"></div>' +
                '</div>' +
                '<div class="cvly-s" id="s-content" style="height:' + contentH + 'px;background:#0a0f1a;padding:5px;display:flex;flex-direction:column;align-items:flex-start;">' +
                  '<div class="cvly-l cl" style="height:3px;width:75%;background:#1e293b;"></div>' +
                  '<div class="cvly-l cl" style="height:3px;width:90%;background:#1e293b;"></div>' +
                  '<div class="cvly-l cl" style="height:3px;width:55%;background:#1e293b;"></div>' +
                '</div>' +
                '<div class="cvly-s" id="s-cta" style="height:' + ctaH + 'px;background:#0a0f1a;display:flex;align-items:center;justify-content:center;">' +
                  '<div id="s-ctabtn" style="padding:3px 14px;border-radius:5px;background:rgba(79,209,197,.3);font-size:8px;font-weight:700;color:#4fd1c5;transition:all .3s;font-family:system-ui;">CTA</div>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div></div>' +
        '</div>' +
      '</div>' +

      // Panel outside scaler — always readable, never scaled
      '<div id="cvly-panel"></div>';

    // ── Responsive scaling ────────────────────────────────────────────────────
    var scaler = document.getElementById("cvly-orbit-scaler");

    function applyScale() {
      var available = wrap.offsetWidth;
      var scale = Math.min(1, available / W);
      scaler.style.transform = "scale(" + scale + ")";
      // Shrink the wrapper height to match scaled content, avoid whitespace
      scaler.style.height = (H * scale) + "px";
      scaler.style.marginBottom = (-H * (1 - scale)) + "px";
    }

    applyScale();
    window.addEventListener("resize", applyScale);

    // ── SVG ───────────────────────────────────────────────────────────────────
    var svg = document.getElementById("cvly-svg");
    function svgEl(tag, a) {
      var el = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (var k in a) el.setAttribute(k, a[k]);
      return el;
    }
    svg.appendChild(svgEl("circle", { cx:cx,cy:cy,r:R+18,fill:"none",stroke:"#4fd1c5","stroke-width":"0.5",opacity:"0.05" }));
    svg.appendChild(svgEl("circle", { cx:cx,cy:cy,r:R,fill:"none",stroke:"rgba(79,209,197,0.15)","stroke-width":"1.4","stroke-dasharray":"5 12" }));

    var lines = [];
    var pDot = svgEl("circle", { r:"5", opacity:"0" });
    svg.appendChild(pDot);

    CATS.forEach(function (cat) {
      var rad = cat.angle * Math.PI / 180;
      var nx = cx + R * Math.cos(rad), ny = cy + R * Math.sin(rad);
      var ln = svgEl("line", { x1:cx,y1:cy,x2:nx,y2:ny,
        stroke:"rgba(79,209,197,0.15)","stroke-width":"1.2","stroke-dasharray":"5 7" });
      svg.appendChild(ln);
      lines.push({ el:ln, nx:nx, ny:ny });
    });

    // ── Nodes ─────────────────────────────────────────────────────────────────
    var orbitArea = document.getElementById("cvly-orbit-area");
    var nodes = [];
    CATS.forEach(function (cat, i) {
      var rad = cat.angle * Math.PI / 180;
      var nx = cx + R * Math.cos(rad), ny = cy + R * Math.sin(rad);
      var node = document.createElement("div");
      node.className = "cvly-node";
      node.style.cssText =
        "--sc:" + cat.sevCol + ";" +
        "width:" + NW + "px;height:" + NH + "px;" +
        "left:calc(" + (nx / W * 100) + "% - " + (NW / 2) + "px);" +
        "top:calc(" + (ny / H * 100) + "% - " + (NH / 2) + "px);";
      node.innerHTML =
        '<span class="cvly-node-icon">' + cat.icon + '</span>' +
        '<span class="cvly-node-label">' + cat.label + '</span>';
      node.addEventListener("mouseenter", function () { setActive(i); });
      node.addEventListener("mouseleave", function () { setActive(null); });
      node.addEventListener("touchstart", function (e) {
        e.preventDefault(); setActive(active === i ? null : i);
      }, { passive: false });
      orbitArea.appendChild(node);
      nodes.push({ el: node, cat: cat, nx: nx, ny: ny });
    });

    // ── State ─────────────────────────────────────────────────────────────────
    function setActive(idx) {
      active = idx;
      var panel = document.getElementById("cvly-panel");
      var frame = document.getElementById("cvly-frame");

      nodes.forEach(function (n, i) {
        var isA = i === idx;
        n.el.classList.toggle("active", isA);
        if (isA) {
          lines[i].el.setAttribute("stroke", n.cat.sevCol);
          lines[i].el.setAttribute("stroke-width", "2");
          lines[i].el.removeAttribute("stroke-dasharray");
          pDot.setAttribute("cx", (n.nx + cx) / 2);
          pDot.setAttribute("cy", (n.ny + cy) / 2);
          pDot.setAttribute("fill", n.cat.sevCol);
          pDot.setAttribute("opacity", "1");
        } else {
          lines[i].el.setAttribute("stroke", "rgba(79,209,197,0.15)");
          lines[i].el.setAttribute("stroke-width", "1.2");
          lines[i].el.setAttribute("stroke-dasharray", "5 7");
        }
      });

      if (idx !== null) {
        var cat = CATS[idx];
        panel.classList.add("visible");
        panel.style.borderColor = cat.sevCol + "55";
        panel.innerHTML =
          '<div class="ph">' +
            '<span class="pi">' + cat.icon + '</span>' +
            '<span class="pn">' + cat.label + '</span>' +
            '<span class="cvly-badge" style="background:' + cat.sevCol + '22;' +
              'border:1px solid ' + cat.sevCol + '55;color:' + cat.sevCol + '">' + cat.sev + '</span>' +
          '</div>' +
          '<div class="pf">' + cat.finding + '</div>' +
          '<div class="pt">&#8594; ' + cat.tip + '</div>';
        frame.style.borderColor = cat.sevCol + "88";
        frame.style.boxShadow = "0 0 36px " + cat.sevCol + "44";
        hlLP(cat.label, cat.sevCol);
      } else {
        pDot.setAttribute("opacity", "0");
        panel.classList.remove("visible");
        panel.style.borderColor = "rgba(79,209,197,0.2)";
        frame.style.borderColor = "rgba(79,209,197,0.22)";
        frame.style.boxShadow = "0 0 28px rgba(79,209,197,0.18)";
        hlLP(null, null);
      }
    }

    function hlLP(label, color) {
      var col = color || "#4fd1c5";
      var map = { Hero:"hero", Conversion:"cta", Zielgruppe:"hero",
                  Trust:"trust", Struktur:"content", Wettbewerb:"content" };
      var sec = map[label] || null;
      ["hero","trust","content","cta"].forEach(function (id) {
        var el = document.getElementById("s-" + id);
        if (!el) return;
        var isA = id === sec;
        el.style.borderColor = isA ? col : "transparent";
        el.style.boxShadow   = isA ? "0 0 12px " + col + "55" : "none";
        el.style.background  = isA ? col + "28" : (id === "hero" ? "#1e2535" : "#0a0f1a");
      });
      wrap.querySelectorAll(".tb").forEach(function (b) {
        b.style.background = sec === "trust"   ? col : "#1e293b"; });
      wrap.querySelectorAll(".hl").forEach(function (l) {
        l.style.background = sec === "hero"    ? col + "99" : "#334155"; });
      wrap.querySelectorAll(".cl").forEach(function (l) {
        l.style.background = sec === "content" ? col + "88" : "#1e293b"; });
      var hcta = document.getElementById("s-hcta");
      if (hcta) hcta.style.background = sec === "hero" ? col : "#1e3a5f";
      var btn = document.getElementById("s-ctabtn");
      if (btn) {
        btn.style.background = sec === "cta" ? col : "rgba(79,209,197,0.3)";
        btn.style.color      = sec === "cta" ? "#0d1117" : "#4fd1c5";
      }
    }

    // ── Auto-play ─────────────────────────────────────────────────────────────
    function startAuto() {
      autoTimer = setInterval(function () {
        pulseIdx = (pulseIdx + 1) % CATS.length;
        setActive(pulseIdx);
      }, 2200);
    }
    wrap.addEventListener("mouseenter", function () { clearInterval(autoTimer); });
    wrap.addEventListener("mouseleave", function () { startAuto(); });

    var pDir = 1, pO = 0;
    setInterval(function () {
      if (active === null) { pDot.setAttribute("opacity","0"); return; }
      pO += pDir * 0.05;
      if (pO >= 1) pDir = -1;
      if (pO <= 0.15) pDir = 1;
      pDot.setAttribute("opacity", pO);
    }, 40);

    startAuto();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
