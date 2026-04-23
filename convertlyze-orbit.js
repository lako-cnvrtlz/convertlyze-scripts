// convertlyze-orbit.js — v2.0
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

  var W = 560, H = 480;
  var cx = W / 2, cy = H / 2 - 10;
  var R = 172;
  var NW = 76, NH = 64;
  var active = null, pulseIdx = 0, autoTimer = null;

  function init() {
    var wrap = document.getElementById("cvly-orbit-wrap");
    if (!wrap) return;

    var style = document.createElement("style");
    style.textContent =
      "#cvly-orbit-wrap{width:100%;max-width:560px;margin:0 auto;position:relative;user-select:none;font-family:system-ui,-apple-system,sans-serif;}" +
      "#cvly-orbit-wrap svg{display:block;width:100%;height:auto;}" +
      ".cvly-node{position:absolute;border-radius:14px;background:#161b27;border:1.5px solid rgba(79,209,197,0.2);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer;transition:all 0.3s ease;box-sizing:border-box;padding:6px 4px;}" +
      ".cvly-node.active{border-color:var(--sc);background:color-mix(in srgb,var(--sc) 14%,#161b27);box-shadow:0 0 22px color-mix(in srgb,var(--sc) 40%,transparent);}" +
      ".cvly-node-icon{font-size:22px;line-height:1;}" +
      ".cvly-node-label{font-size:10px;font-weight:700;color:#64748b;letter-spacing:.3px;transition:color .3s;white-space:nowrap;}" +
      ".cvly-node.active .cvly-node-label{color:var(--sc);}" +
      "#cvly-panel{position:absolute;left:50%;transform:translateX(-50%);width:270px;bottom:10px;padding:12px 14px;border-radius:12px;background:#1e2535;border:1px solid rgba(79,209,197,0.2);box-shadow:0 8px 32px rgba(0,0,0,0.5);transition:border-color .3s;}" +
      "#cvly-panel .ph{display:flex;align-items:center;gap:6px;margin-bottom:6px;}" +
      "#cvly-panel .pi{font-size:14px;}" +
      "#cvly-panel .pn{font-size:12px;font-weight:700;color:#e2e8f0;}" +
      ".cvly-badge{display:inline-block;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:800;letter-spacing:.8px;}" +
      "#cvly-panel .pf{font-size:12px;font-weight:600;color:#e2e8f0;margin-bottom:5px;line-height:1.4;}" +
      "#cvly-panel .pt{font-size:11px;color:#94a3b8;line-height:1.5;}" +
      "#cvly-panel .hint{font-size:11px;color:#64748b;text-align:center;}" +
      ".cvly-cc{position:absolute;left:50%;top:50%;transform:translate(-50%,-62%);z-index:20;}" +
      ".cvly-frame{padding:10px;border-radius:16px;background:linear-gradient(135deg,#161b27,#1e2535);border:1.5px solid rgba(79,209,197,0.2);box-shadow:0 0 24px rgba(79,209,197,0.15);transition:border-color .4s,box-shadow .4s;}" +
      ".cvly-mock{width:100px;height:136px;border-radius:8px;overflow:hidden;border:1px solid rgba(79,209,197,0.15);background:#0a0f1a;}" +
      ".cvly-bar{height:12px;background:#1e2535;display:flex;align-items:center;padding-left:5px;gap:3px;}" +
      ".cvly-dot{width:4px;height:4px;border-radius:50%;opacity:.7;}" +
      ".cvly-body{padding:4px 4px 0;}" +
      ".cvly-s{border-radius:4px;margin-bottom:3px;border:1px solid transparent;transition:all .35s ease;overflow:hidden;}" +
      ".cvly-l{border-radius:2px;margin-bottom:3px;transition:background .35s;}";
    document.head.appendChild(style);

    wrap.innerHTML =
      '<svg id="cvly-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '"></svg>' +

      '<div class="cvly-cc"><div class="cvly-frame" id="cvly-frame">' +
        '<div class="cvly-mock">' +
          '<div class="cvly-bar">' +
            '<div class="cvly-dot" style="background:#ef4444"></div>' +
            '<div class="cvly-dot" style="background:#f59e0b"></div>' +
            '<div class="cvly-dot" style="background:#4fd1c5"></div>' +
          '</div>' +
          '<div class="cvly-body">' +
            '<div class="cvly-s" id="s-hero" style="height:44px;background:#1e2535;padding:4px;display:flex;flex-direction:column;align-items:flex-start;">' +
              '<div class="cvly-l hl" style="height:3px;width:80%;background:#334155;"></div>' +
              '<div class="cvly-l hl" style="height:3px;width:60%;background:#334155;"></div>' +
              '<div id="s-hcta" style="height:7px;width:44px;border-radius:3px;background:#1e3a5f;transition:background .35s;margin-top:2px;"></div>' +
            '</div>' +
            '<div class="cvly-s" id="s-trust" style="height:14px;display:flex;gap:3px;padding:3px 4px;background:#0a0f1a;">' +
              '<div class="tb" style="flex:1;height:6px;border-radius:2px;background:#1e293b;transition:background .35s;"></div>' +
              '<div class="tb" style="flex:1;height:6px;border-radius:2px;background:#1e293b;transition:background .35s;"></div>' +
              '<div class="tb" style="flex:1;height:6px;border-radius:2px;background:#1e293b;transition:background .35s;"></div>' +
            '</div>' +
            '<div class="cvly-s" id="s-content" style="height:28px;background:#0a0f1a;padding:4px;display:flex;flex-direction:column;align-items:flex-start;">' +
              '<div class="cvly-l cl" style="height:2px;width:75%;background:#1e293b;"></div>' +
              '<div class="cvly-l cl" style="height:2px;width:90%;background:#1e293b;"></div>' +
              '<div class="cvly-l cl" style="height:2px;width:55%;background:#1e293b;"></div>' +
            '</div>' +
            '<div class="cvly-s" id="s-cta" style="height:18px;background:#0a0f1a;display:flex;align-items:center;justify-content:center;">' +
              '<div id="s-ctabtn" style="padding:2px 10px;border-radius:4px;background:rgba(79,209,197,.3);font-size:6px;font-weight:700;color:#4fd1c5;transition:all .3s;font-family:system-ui;">CTA</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div></div>' +

      '<div id="cvly-panel"><span class="hint">Kategorie auswaehlen fuer Findings</span></div>';

    var svg = document.getElementById("cvly-svg");
    function svgEl(tag, a) {
      var el = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (var k in a) el.setAttribute(k, a[k]);
      return el;
    }
    svg.appendChild(svgEl("circle", { cx:cx,cy:cy,r:R+14,fill:"none",stroke:"#4fd1c5","stroke-width":"0.5",opacity:"0.05" }));
    svg.appendChild(svgEl("circle", { cx:cx,cy:cy,r:R,fill:"none",stroke:"rgba(79,209,197,0.15)","stroke-width":"1.2","stroke-dasharray":"4 10" }));

    var lines = [];
    var pDot = svgEl("circle", { r:"4",opacity:"0" });
    svg.appendChild(pDot);

    CATS.forEach(function (cat) {
      var rad = cat.angle * Math.PI / 180;
      var nx = cx + R * Math.cos(rad), ny = cy + R * Math.sin(rad);
      var ln = svgEl("line", { x1:cx,y1:cy,x2:nx,y2:ny,stroke:"rgba(79,209,197,0.15)","stroke-width":"1","stroke-dasharray":"4 6" });
      svg.appendChild(ln);
      lines.push({ el:ln, nx:nx, ny:ny });
    });

    var nodes = [];
    CATS.forEach(function (cat, i) {
      var rad = cat.angle * Math.PI / 180;
      var nx = cx + R * Math.cos(rad), ny = cy + R * Math.sin(rad);
      var node = document.createElement("div");
      node.className = "cvly-node";
      node.style.cssText = "--sc:" + cat.sevCol + ";width:" + NW + "px;height:" + NH + "px;" +
        "left:calc(" + (nx/W*100) + "% - " + (NW/2) + "px);" +
        "top:calc(" + (ny/H*100) + "% - " + (NH/2) + "px);";
      node.innerHTML = '<span class="cvly-node-icon">' + cat.icon + '</span><span class="cvly-node-label">' + cat.label + '</span>';
      node.addEventListener("mouseenter", function () { setActive(i); });
      node.addEventListener("mouseleave", function () { setActive(null); });
      node.addEventListener("touchstart", function (e) { e.preventDefault(); setActive(active === i ? null : i); }, { passive:false });
      wrap.appendChild(node);
      nodes.push({ el:node, cat:cat, nx:nx, ny:ny });
    });

    function setActive(idx) {
      active = idx;
      var panel = document.getElementById("cvly-panel");
      var frame = document.getElementById("cvly-frame");

      nodes.forEach(function (n, i) {
        var isA = i === idx;
        n.el.classList.toggle("active", isA);
        if (isA) {
          lines[i].el.setAttribute("stroke", n.cat.sevCol);
          lines[i].el.setAttribute("stroke-width", "1.8");
          lines[i].el.removeAttribute("stroke-dasharray");
          lines[i].el.setAttribute("opacity", "0.85");
          pDot.setAttribute("cx", (n.nx + cx) / 2);
          pDot.setAttribute("cy", (n.ny + cy) / 2);
          pDot.setAttribute("fill", n.cat.sevCol);
          pDot.setAttribute("opacity", "1");
        } else {
          lines[i].el.setAttribute("stroke", "rgba(79,209,197,0.15)");
          lines[i].el.setAttribute("stroke-width", "1");
          lines[i].el.setAttribute("stroke-dasharray", "4 6");
        }
      });

      if (idx !== null) {
        var cat = CATS[idx];
        panel.style.borderColor = cat.sevCol + "55";
        panel.innerHTML =
          '<div class="ph"><span class="pi">' + cat.icon + '</span><span class="pn">' + cat.label + '</span>' +
          '<span class="cvly-badge" style="background:' + cat.sevCol + '22;border:1px solid ' + cat.sevCol + '55;color:' + cat.sevCol + '">' + cat.sev + '</span></div>' +
          '<div class="pf">' + cat.finding + '</div>' +
          '<div class="pt">&#8594; ' + cat.tip + '</div>';
        frame.style.borderColor = cat.sevCol + "88";
        frame.style.boxShadow = "0 0 32px " + cat.sevCol + "44";
        hlLP(cat.label, cat.sevCol);
      } else {
        pDot.setAttribute("opacity", "0");
        panel.style.borderColor = "rgba(79,209,197,0.2)";
        panel.innerHTML = '<span class="hint">Kategorie auswaehlen fuer Findings</span>';
        frame.style.borderColor = "rgba(79,209,197,0.2)";
        frame.style.boxShadow = "0 0 24px rgba(79,209,197,0.15)";
        hlLP(null, null);
      }
    }

    function hlLP(label, color) {
      var col = color || "#4fd1c5";
      var map = { Hero:"hero", Conversion:"cta", Zielgruppe:"hero", Trust:"trust", Struktur:"content", Wettbewerb:"content" };
      var sec = map[label] || null;
      ["hero","trust","content","cta"].forEach(function (id) {
        var el = document.getElementById("s-" + id);
        if (!el) return;
        var isA = id === sec;
        el.style.borderColor = isA ? col : "transparent";
        el.style.boxShadow = isA ? "0 0 10px " + col + "55" : "none";
        el.style.background = isA ? col + "28" : (id === "hero" ? "#1e2535" : "#0a0f1a");
      });
      wrap.querySelectorAll(".tb").forEach(function (b) { b.style.background = sec === "trust" ? col : "#1e293b"; });
      wrap.querySelectorAll(".hl").forEach(function (l) { l.style.background = sec === "hero" ? col + "99" : "#334155"; });
      var hcta = document.getElementById("s-hcta");
      if (hcta) hcta.style.background = sec === "hero" ? col : "#1e3a5f";
      wrap.querySelectorAll(".cl").forEach(function (l) { l.style.background = sec === "content" ? col + "88" : "#1e293b"; });
      var btn = document.getElementById("s-ctabtn");
      if (btn) { btn.style.background = sec === "cta" ? col : "rgba(79,209,197,0.3)"; btn.style.color = sec === "cta" ? "#0d1117" : "#4fd1c5"; }
    }

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
      pO += pDir * 0.05; if (pO >= 1) pDir = -1; if (pO <= 0.15) pDir = 1;
      pDot.setAttribute("opacity", pO);
    }, 40);

    startAuto();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
