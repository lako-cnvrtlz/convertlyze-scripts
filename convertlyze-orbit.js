// convertlyze-orbit.js — v3.0
// GitHub: lako-cnvrtlz/convertlyze-scripts
(function () {
  var CATS = [
    { label: "Hero",       icon: "⚡", angle: -90,  sev: "CRITICAL", sevCol: "#ef4444", finding: "Features statt Outcomes",    tip: "Hero auf Ergebnis umschreiben, nicht auf das Tool." },
    { label: "Conversion", icon: "🎯", angle: -30,  sev: "HIGH",     sevCol: "#f59e0b", finding: "CTA unklar positioniert",     tip: "CTA direkt nach dem staerksten Trust-Signal." },
    { label: "Zielgruppe", icon: "👥", angle: 30,   sev: "HIGH",     sevCol: "#f59e0b", finding: "Keine Zielgruppe im Hero",    tip: "Zielgruppe explizit im Hero nennen." },
    { label: "Trust",      icon: "🛡️", angle: 90,   sev: "MEDIUM",   sevCol: "#4fd1c5", finding: "Testimonials zu weit unten", tip: "Mindestens ein Testimonial above the fold." },
    { label: "Struktur",   icon: "📐", angle: 150,  sev: "HIGH",     sevCol: "#f59e0b", finding: "Kein klarer AIDA-Flow",       tip: "Problem - Loesung - Proof - CTA aufbauen." },
    { label: "Wettbewerb", icon: "🔍", angle: 210,  sev: "MEDIUM",   sevCol: "#4fd1c5", finding: "USP nicht differenziert",    tip: "Konkret benennen, was du besser machst." },
  ];

  // Canvas size — big enough for tooltips outside the orbit
  var W = 700, H = 640;
  var cx = W / 2, cy = H / 2;
  var R = 168;       // orbit radius
  var NW = 74, NH = 62; // node size
  var TW = 176;      // tooltip width
  var active = null, pulseIdx = 0, autoTimer = null;

  function init() {
    var wrap = document.getElementById("cvly-orbit-wrap");
    if (!wrap) return;

    // ── CSS ──────────────────────────────────────────────────────────────────
    var style = document.createElement("style");
    style.textContent =
      "#cvly-orbit-wrap{width:100%;max-width:700px;margin:0 auto;position:relative;" +
        "user-select:none;font-family:system-ui,-apple-system,sans-serif;}" +
      "#cvly-orbit-wrap svg{display:block;width:100%;height:auto;overflow:visible;}" +

      // Node
      ".cvly-node{position:absolute;border-radius:14px;background:#161b27;" +
        "border:1.5px solid rgba(79,209,197,0.2);display:flex;flex-direction:column;" +
        "align-items:center;justify-content:center;gap:4px;cursor:pointer;" +
        "transition:all 0.3s ease;box-sizing:border-box;padding:6px 4px;z-index:10;}" +
      ".cvly-node.active{border-color:var(--sc);" +
        "background:color-mix(in srgb,var(--sc) 14%,#161b27);" +
        "box-shadow:0 0 22px color-mix(in srgb,var(--sc) 40%,transparent);}" +
      ".cvly-node-icon{font-size:22px;line-height:1;}" +
      ".cvly-node-label{font-size:10px;font-weight:700;color:#64748b;" +
        "letter-spacing:.3px;transition:color .3s;white-space:nowrap;}" +
      ".cvly-node.active .cvly-node-label{color:var(--sc);}" +

      // Tooltip — hidden by default, shown when active
      ".cvly-tt{position:absolute;width:" + TW + "px;padding:10px 12px;border-radius:10px;" +
        "background:#1a2235;border:1px solid rgba(79,209,197,0.2);" +
        "box-shadow:0 8px 28px rgba(0,0,0,0.6);z-index:30;pointer-events:none;" +
        "opacity:0;transform:scale(0.92);transition:opacity .25s ease,transform .25s ease;}" +
      ".cvly-tt.show{opacity:1;transform:scale(1);}" +
      ".cvly-tt-head{display:flex;align-items:center;gap:5px;margin-bottom:6px;}" +
      ".cvly-tt-icon{font-size:13px;}" +
      ".cvly-tt-name{font-size:11px;font-weight:700;color:#e2e8f0;}" +
      ".cvly-badge{display:inline-block;padding:2px 6px;border-radius:4px;" +
        "font-size:8px;font-weight:800;letter-spacing:.8px;}" +
      ".cvly-tt-finding{font-size:11px;font-weight:600;color:#e2e8f0;" +
        "margin-bottom:4px;line-height:1.4;}" +
      ".cvly-tt-tip{font-size:10px;color:#94a3b8;line-height:1.5;}" +

      // Center mockup
      ".cvly-cc{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:20;}" +
      ".cvly-frame{padding:10px;border-radius:16px;" +
        "background:linear-gradient(135deg,#161b27,#1e2535);" +
        "border:1.5px solid rgba(79,209,197,0.2);" +
        "box-shadow:0 0 24px rgba(79,209,197,0.15);" +
        "transition:border-color .4s,box-shadow .4s;}" +
      ".cvly-mock{width:96px;height:132px;border-radius:8px;" +
        "overflow:hidden;border:1px solid rgba(79,209,197,0.15);background:#0a0f1a;}" +
      ".cvly-bar{height:11px;background:#1e2535;display:flex;align-items:center;" +
        "padding-left:5px;gap:3px;}" +
      ".cvly-dot2{width:4px;height:4px;border-radius:50%;opacity:.7;}" +
      ".cvly-body{padding:3px 3px 0;}" +
      ".cvly-ms{border-radius:4px;margin-bottom:3px;border:1px solid transparent;" +
        "transition:all .35s ease;overflow:hidden;}" +
      ".cvly-ml{border-radius:2px;margin-bottom:3px;transition:background .35s;}";
    document.head.appendChild(style);

    // ── HTML ─────────────────────────────────────────────────────────────────
    wrap.innerHTML =
      '<svg id="cvly-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '"></svg>' +

      '<div class="cvly-cc"><div class="cvly-frame" id="cvly-frame">' +
        '<div class="cvly-mock">' +
          '<div class="cvly-bar">' +
            '<div class="cvly-dot2" style="background:#ef4444"></div>' +
            '<div class="cvly-dot2" style="background:#f59e0b"></div>' +
            '<div class="cvly-dot2" style="background:#4fd1c5"></div>' +
          '</div>' +
          '<div class="cvly-body">' +
            '<div class="cvly-ms" id="ms-hero" style="height:42px;background:#1e2535;padding:4px;display:flex;flex-direction:column;align-items:flex-start;">' +
              '<div class="cvly-ml mhl" style="height:3px;width:80%;background:#334155;"></div>' +
              '<div class="cvly-ml mhl" style="height:3px;width:60%;background:#334155;"></div>' +
              '<div id="ms-hcta" style="height:7px;width:42px;border-radius:3px;background:#1e3a5f;transition:background .35s;margin-top:2px;"></div>' +
            '</div>' +
            '<div class="cvly-ms" id="ms-trust" style="height:13px;display:flex;gap:3px;padding:3px 4px;background:#0a0f1a;">' +
              '<div class="mtb" style="flex:1;height:6px;border-radius:2px;background:#1e293b;transition:background .35s;"></div>' +
              '<div class="mtb" style="flex:1;height:6px;border-radius:2px;background:#1e293b;transition:background .35s;"></div>' +
              '<div class="mtb" style="flex:1;height:6px;border-radius:2px;background:#1e293b;transition:background .35s;"></div>' +
            '</div>' +
            '<div class="cvly-ms" id="ms-content" style="height:28px;background:#0a0f1a;padding:4px;display:flex;flex-direction:column;align-items:flex-start;">' +
              '<div class="cvly-ml mcl" style="height:2px;width:75%;background:#1e293b;"></div>' +
              '<div class="cvly-ml mcl" style="height:2px;width:90%;background:#1e293b;"></div>' +
              '<div class="cvly-ml mcl" style="height:2px;width:55%;background:#1e293b;"></div>' +
            '</div>' +
            '<div class="cvly-ms" id="ms-cta" style="height:17px;background:#0a0f1a;display:flex;align-items:center;justify-content:center;">' +
              '<div id="ms-ctabtn" style="padding:2px 10px;border-radius:4px;background:rgba(79,209,197,.3);font-size:6px;font-weight:700;color:#4fd1c5;transition:all .3s;font-family:system-ui;">CTA</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div></div>';

    // ── SVG ──────────────────────────────────────────────────────────────────
    var svg = document.getElementById("cvly-svg");
    function svgEl(tag, a) {
      var el = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (var k in a) el.setAttribute(k, a[k]);
      return el;
    }
    svg.appendChild(svgEl("circle", { cx:cx,cy:cy,r:R+16,fill:"none",stroke:"#4fd1c5","stroke-width":"0.5",opacity:"0.05" }));
    svg.appendChild(svgEl("circle", { cx:cx,cy:cy,r:R,fill:"none",stroke:"rgba(79,209,197,0.15)","stroke-width":"1.2","stroke-dasharray":"4 10" }));

    var lines = [];
    var pDot = svgEl("circle", { r:"4",opacity:"0" });
    svg.appendChild(pDot);

    CATS.forEach(function (cat) {
      var rad = cat.angle * Math.PI / 180;
      var nx = cx + R * Math.cos(rad), ny = cy + R * Math.sin(rad);
      var ln = svgEl("line", { x1:cx,y1:cy,x2:nx,y2:ny,
        stroke:"rgba(79,209,197,0.15)","stroke-width":"1","stroke-dasharray":"4 6" });
      svg.appendChild(ln);
      lines.push({ el:ln, nx:nx, ny:ny });
    });

    // ── Nodes + Tooltips ─────────────────────────────────────────────────────
    var nodes = [];

    CATS.forEach(function (cat, i) {
      var rad = cat.angle * Math.PI / 180;
      var nx = cx + R * Math.cos(rad);
      var ny = cy + R * Math.sin(rad);

      // Node
      var node = document.createElement("div");
      node.className = "cvly-node";
      node.style.cssText =
        "--sc:" + cat.sevCol + ";" +
        "width:" + NW + "px;height:" + NH + "px;" +
        "left:calc(" + (nx/W*100) + "% - " + (NW/2) + "px);" +
        "top:calc(" + (ny/H*100) + "% - " + (NH/2) + "px);";
      node.innerHTML =
        '<span class="cvly-node-icon">' + cat.icon + '</span>' +
        '<span class="cvly-node-label">' + cat.label + '</span>';

      // Tooltip — positioned outward from node
      // Determine direction: push tooltip away from center
      var tt = document.createElement("div");
      tt.className = "cvly-tt";
      tt.style.borderColor = cat.sevCol + "55";
      tt.innerHTML =
        '<div class="cvly-tt-head">' +
          '<span class="cvly-tt-icon">' + cat.icon + '</span>' +
          '<span class="cvly-tt-name">' + cat.label + '</span>' +
          '<span class="cvly-badge" style="background:' + cat.sevCol + '22;border:1px solid ' + cat.sevCol + '55;color:' + cat.sevCol + '">' + cat.sev + '</span>' +
        '</div>' +
        '<div class="cvly-tt-finding">' + cat.finding + '</div>' +
        '<div class="cvly-tt-tip">&#8594; ' + cat.tip + '</div>';

      // Smart tooltip placement based on angle
      // angle -90 = top, 0/-180 = right/left, 90 = bottom
      var a = ((cat.angle % 360) + 360) % 360; // normalize 0-360
      var GAP = 10; // gap from node edge

      if (a >= 315 || a < 45) {
        // Right side nodes: tooltip to the right
        tt.style.left = (NW + GAP) + "px";
        tt.style.top = "50%";
        tt.style.transform = "translateY(-50%)";
      } else if (a >= 45 && a < 135) {
        // Bottom nodes: tooltip below
        tt.style.top = (NH + GAP) + "px";
        tt.style.left = "50%";
        tt.style.transform = "translateX(-50%)";
      } else if (a >= 135 && a < 225) {
        // Left side nodes: tooltip to the left
        tt.style.right = (NW + GAP) + "px";
        tt.style.top = "50%";
        tt.style.transform = "translateY(-50%)";
      } else {
        // Top nodes: tooltip above
        tt.style.bottom = (NH + GAP) + "px";
        tt.style.left = "50%";
        tt.style.transform = "translateX(-50%)";
      }

      node.appendChild(tt);
      wrap.appendChild(node);
      nodes.push({ el:node, tt:tt, cat:cat, nx:nx, ny:ny });

      node.addEventListener("mouseenter", function () { setActive(i); });
      node.addEventListener("mouseleave", function () { setActive(null); });
      node.addEventListener("touchstart", function (e) {
        e.preventDefault(); setActive(active === i ? null : i);
      }, { passive:false });
    });

    // ── State ─────────────────────────────────────────────────────────────────
    function setActive(idx) {
      active = idx;
      var frame = document.getElementById("cvly-frame");

      nodes.forEach(function (n, i) {
        var isA = i === idx;
        n.el.classList.toggle("active", isA);
        n.tt.classList.toggle("show", isA);

        if (isA) {
          lines[i].el.setAttribute("stroke", n.cat.sevCol);
          lines[i].el.setAttribute("stroke-width", "2");
          lines[i].el.removeAttribute("stroke-dasharray");
          lines[i].el.setAttribute("opacity", "0.9");
          pDot.setAttribute("cx", (n.nx + cx) / 2);
          pDot.setAttribute("cy", (n.ny + cy) / 2);
          pDot.setAttribute("fill", n.cat.sevCol);
          pDot.setAttribute("opacity", "1");
        } else {
          lines[i].el.setAttribute("stroke", "rgba(79,209,197,0.15)");
          lines[i].el.setAttribute("stroke-width", "1");
          lines[i].el.setAttribute("stroke-dasharray", "4 6");
          lines[i].el.setAttribute("opacity", "1");
        }
      });

      if (idx !== null) {
        var cat = CATS[idx];
        frame.style.borderColor = cat.sevCol + "88";
        frame.style.boxShadow = "0 0 32px " + cat.sevCol + "44";
        hlLP(cat.label, cat.sevCol);
      } else {
        pDot.setAttribute("opacity", "0");
        frame.style.borderColor = "rgba(79,209,197,0.2)";
        frame.style.boxShadow = "0 0 24px rgba(79,209,197,0.15)";
        hlLP(null, null);
      }
    }

    function hlLP(label, color) {
      var col = color || "#4fd1c5";
      var map = { Hero:"hero", Conversion:"cta", Zielgruppe:"hero",
                  Trust:"trust", Struktur:"content", Wettbewerb:"content" };
      var sec = map[label] || null;
      ["hero","trust","content","cta"].forEach(function (id) {
        var el = document.getElementById("ms-" + id);
        if (!el) return;
        var isA = id === sec;
        el.style.borderColor = isA ? col : "transparent";
        el.style.boxShadow = isA ? "0 0 10px " + col + "55" : "none";
        el.style.background = isA ? col + "28" : (id === "hero" ? "#1e2535" : "#0a0f1a");
      });
      wrap.querySelectorAll(".mtb").forEach(function (b) {
        b.style.background = sec === "trust" ? col : "#1e293b";
      });
      wrap.querySelectorAll(".mhl").forEach(function (l) {
        l.style.background = sec === "hero" ? col + "99" : "#334155";
      });
      var hcta = document.getElementById("ms-hcta");
      if (hcta) hcta.style.background = sec === "hero" ? col : "#1e3a5f";
      wrap.querySelectorAll(".mcl").forEach(function (l) {
        l.style.background = sec === "content" ? col + "88" : "#1e293b";
      });
      var btn = document.getElementById("ms-ctabtn");
      if (btn) {
        btn.style.background = sec === "cta" ? col : "rgba(79,209,197,0.3)";
        btn.style.color = sec === "cta" ? "#0d1117" : "#4fd1c5";
      }
    }

    // ── Auto-play ─────────────────────────────────────────────────────────────
    function startAuto() {
      autoTimer = setInterval(function () {
        pulseIdx = (pulseIdx + 1) % CATS.length;
        setActive(pulseIdx);
      }, 2400);
    }
    wrap.addEventListener("mouseenter", function () { clearInterval(autoTimer); });
    wrap.addEventListener("mouseleave", function () { startAuto(); });

    // Pulse animation for dot
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
