// convertlyze-orbit.js — v3.2
// Desktop: Orbit (4 Nodes) | Mobile + iPad: Stepper
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
  // Angles: 4 nodes evenly at -90, 0, 90, 180 (top, right, bottom, left)
  var CATS = [
    {
      label:   "Hero",
      angle:   -90,
      sev:     "CRITICAL",
      sevCol:  "#ef4444",
      finding: "Kein Outcome sichtbar",
      tip:     "Besucher sehen Features — nicht was sich fuer sie konkret aendert.",
      sec:     "hero",
    },
    {
      label:   "Zielgruppe",
      angle:   0,
      sev:     "HIGH",
      sevCol:  "#f59e0b",
      finding: "Nur Anwender angesprochen",
      tip:     "CEO, IT-Leiter und DSGVO-Verantwortliche finden keine Antworten auf ihre Fragen.",
      sec:     "hero",
    },
    {
      label:   "Conversion",
      angle:   90,
      sev:     "HIGH",
      sevCol:  "#f59e0b",
      finding: "Kein klarer naechster Schritt",
      tip:     "Besucher wissen nicht wann und warum sie jetzt handeln sollen.",
      sec:     "cta",
    },
    {
      label:   "Trust",
      angle:   180,
      sev:     "MEDIUM",
      sevCol:  "#4fd1c5",
      finding: "Proof ohne Relevanz",
      tip:     "Logos und Zahlen ohne Bezug zum konkreten Problem des Besuchers.",
      sec:     "trust",
    },
  ];

  var MOBILE_BP    = 1024;
  var currentMode  = null;
  var resizeTimer  = null;

  // ── Shared: LP mockup HTML ──────────────────────────────────────────────────
  function mockupHTML(prefix, w, h) {
    var heroH    = Math.round(h * 0.32);
    var trustH   = Math.round(h * 0.10);
    var contentH = Math.round(h * 0.20);
    var ctaH     = Math.round(h * 0.14);
    return (
      '<div class="cvly-lp-frame" id="' + prefix + 'frame">' +
        '<div class="cvly-lp-mock" style="width:' + w + 'px;height:' + h + 'px;">' +
          '<div class="cvly-lp-bar">' +
            '<div class="cvly-lp-dot" style="background:#ef4444"></div>' +
            '<div class="cvly-lp-dot" style="background:#f59e0b"></div>' +
            '<div class="cvly-lp-dot" style="background:#4fd1c5"></div>' +
          '</div>' +
          '<div class="cvly-lp-body">' +
            '<div class="cvly-lp-sec" id="' + prefix + 'hero" style="height:' + heroH + 'px;background:#1e2535;padding:5px;display:flex;flex-direction:column;align-items:flex-start;">' +
              '<div class="cvly-lp-line ' + prefix + 'hl" style="height:4px;width:80%;background:#334155;"></div>' +
              '<div class="cvly-lp-line ' + prefix + 'hl" style="height:4px;width:60%;background:#334155;"></div>' +
              '<div id="' + prefix + 'hcta" style="height:9px;width:52px;border-radius:4px;background:#1e3a5f;transition:background .35s;margin-top:3px;"></div>' +
            '</div>' +
            '<div class="cvly-lp-sec" id="' + prefix + 'trust" style="height:' + trustH + 'px;display:flex;gap:4px;padding:4px 5px;background:#0a0f1a;">' +
              '<div class="' + prefix + 'tb" style="flex:1;height:7px;border-radius:2px;background:#1e293b;transition:background .35s;"></div>' +
              '<div class="' + prefix + 'tb" style="flex:1;height:7px;border-radius:2px;background:#1e293b;transition:background .35s;"></div>' +
              '<div class="' + prefix + 'tb" style="flex:1;height:7px;border-radius:2px;background:#1e293b;transition:background .35s;"></div>' +
            '</div>' +
            '<div class="cvly-lp-sec" id="' + prefix + 'content" style="height:' + contentH + 'px;background:#0a0f1a;padding:5px;display:flex;flex-direction:column;align-items:flex-start;">' +
              '<div class="cvly-lp-line ' + prefix + 'cl" style="height:3px;width:75%;background:#1e293b;"></div>' +
              '<div class="cvly-lp-line ' + prefix + 'cl" style="height:3px;width:90%;background:#1e293b;"></div>' +
              '<div class="cvly-lp-line ' + prefix + 'cl" style="height:3px;width:55%;background:#1e293b;"></div>' +
            '</div>' +
            '<div class="cvly-lp-sec" id="' + prefix + 'cta" style="height:' + ctaH + 'px;background:#0a0f1a;display:flex;align-items:center;justify-content:center;">' +
              '<div id="' + prefix + 'ctabtn" style="padding:3px 14px;border-radius:5px;background:rgba(79,209,197,.3);font-size:8px;font-weight:700;color:#4fd1c5;transition:all .3s;font-family:system-ui;">CTA</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  // ── Shared: highlight LP ────────────────────────────────────────────────────
  function hlLP(wrap, prefix, catLabel, color) {
    var sec = null;
    if (catLabel) {
      for (var i = 0; i < CATS.length; i++) {
        if (CATS[i].label === catLabel) { sec = CATS[i].sec; break; }
      }
    }
    var col = color || "#4fd1c5";
    ["hero","trust","content","cta"].forEach(function(id) {
      var el = document.getElementById(prefix + id);
      if (!el) return;
      var isA = id === sec;
      el.style.borderColor = isA ? col : "transparent";
      el.style.boxShadow   = isA ? "0 0 12px " + col + "55" : "none";
      el.style.background  = isA ? col + "28" : (id === "hero" ? "#1e2535" : "#0a0f1a");
    });
    wrap.querySelectorAll("." + prefix + "hl").forEach(function(l) { l.style.background = sec==="hero"    ? col+"99" : "#334155"; });
    wrap.querySelectorAll("." + prefix + "tb").forEach(function(b) { b.style.background = sec==="trust"   ? col      : "#1e293b"; });
    wrap.querySelectorAll("." + prefix + "cl").forEach(function(l) { l.style.background = sec==="content" ? col+"88" : "#1e293b"; });
    var hcta = document.getElementById(prefix + "hcta");
    if (hcta) hcta.style.background = sec === "hero" ? col : "#1e3a5f";
    var btn = document.getElementById(prefix + "ctabtn");
    if (btn) { btn.style.background = sec==="cta" ? col : "rgba(79,209,197,.3)"; btn.style.color = sec==="cta" ? "#0d1117" : "#4fd1c5"; }
    var frame = document.getElementById(prefix + "frame");
    if (frame) {
      frame.style.borderColor = catLabel ? col+"88" : "rgba(79,209,197,0.22)";
      frame.style.boxShadow   = catLabel ? "0 0 32px "+col+"44" : "0 0 28px rgba(79,209,197,0.18)";
    }
  }

  // ── Base CSS (once) ─────────────────────────────────────────────────────────
  var baseCSSInjected = false;
  function injectBaseCSS() {
    if (baseCSSInjected) return;
    baseCSSInjected = true;
    var s = document.createElement("style");
    s.textContent =
      ".cvly-lp-frame{padding:12px;border-radius:18px;background:linear-gradient(135deg,#161b27,#1e2535);border:1.5px solid rgba(79,209,197,0.22);box-shadow:0 0 28px rgba(79,209,197,0.18);transition:border-color .4s,box-shadow .4s;display:inline-block;}" +
      ".cvly-lp-mock{border-radius:10px;overflow:hidden;border:1px solid rgba(79,209,197,0.15);background:#0a0f1a;}" +
      ".cvly-lp-bar{height:14px;background:#1e2535;display:flex;align-items:center;padding-left:6px;gap:4px;}" +
      ".cvly-lp-dot{width:5px;height:5px;border-radius:50%;opacity:.7;}" +
      ".cvly-lp-body{padding:5px 5px 0;}" +
      ".cvly-lp-sec{border-radius:5px;margin-bottom:4px;border:1px solid transparent;transition:all .35s ease;overflow:hidden;}" +
      ".cvly-lp-line{border-radius:2px;margin-bottom:3px;transition:background .35s;}" +
      ".cvly-badge{display:inline-block;padding:2px 7px;border-radius:5px;font-size:9px;font-weight:800;letter-spacing:.8px;}";
    document.head.appendChild(s);
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  DESKTOP — Orbit (4 nodes, more breathing room)
  // ════════════════════════════════════════════════════════════════════════════
  function initOrbit(wrap) {
    var W=640, H=560, R=200, NW=96, NH=82, MKW=130, MKH=178;
    var cx=W/2, cy=H/2;
    var active=null, pulseIdx=0, autoTimer=null, pulseInterval=null;

    var s = document.createElement("style");
    s.id = "cvly-orbit-style";
    s.textContent =
      "#cvly-orbit-wrap{width:100%;height:auto!important;min-height:0!important;padding:0!important;max-width:"+W+"px;margin:0 auto!important;font-family:system-ui,-apple-system,sans-serif;user-select:none;}" +
      "#cvly-orbit-scaler{width:"+W+"px;transform-origin:top center;}" +
      "#cvly-orbit-area{position:relative;width:100%;}" +
      "#cvly-orbit-area svg{display:block;width:100%;height:auto;}" +
      ".cvly-node{position:absolute;border-radius:16px;background:#161b27;border:1.5px solid rgba(79,209,197,0.22);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;cursor:pointer;transition:all 0.3s ease;box-sizing:border-box;padding:12px 8px;}" +
      ".cvly-node.active{border-color:var(--sc);background:color-mix(in srgb,var(--sc) 14%,#161b27);box-shadow:0 0 28px color-mix(in srgb,var(--sc) 45%,transparent);}" +
      ".cvly-node-icon{display:flex;align-items:center;justify-content:center;color:#64748b;transition:color .3s;}" +
      ".cvly-node.active .cvly-node-icon{color:var(--sc);}" +
      ".cvly-node-label{font-size:11px;font-weight:700;color:#64748b;letter-spacing:.3px;transition:color .3s;white-space:nowrap;}" +
      ".cvly-node.active .cvly-node-label{color:var(--sc);}" +
      ".cvly-orbit-cc{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:20;}" +
      "#cvly-panel{margin:16px auto 0;width:100%;max-width:380px;height:90px;padding:14px 18px;border-radius:14px;background:#1e2535;border:1px solid rgba(79,209,197,0.2);box-shadow:0 8px 32px rgba(0,0,0,0.4);transition:border-color .3s,opacity .3s;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;visibility:hidden;opacity:0;}" +
      "#cvly-panel.visible{visibility:visible;opacity:1;}" +
      "#cvly-panel .ph{display:flex;align-items:center;gap:7px;margin-bottom:7px;}" +
      "#cvly-panel .pi{display:flex;align-items:center;}" +
      "#cvly-panel .pn{font-size:13px;font-weight:700;color:#e2e8f0;}" +
      "#cvly-panel .pf{font-size:13px;font-weight:600;color:#e2e8f0;margin-bottom:5px;line-height:1.3;}" +
      "#cvly-panel .pt{font-size:12px;color:#94a3b8;line-height:1.4;}";
    document.head.appendChild(s);

    wrap.innerHTML =
      '<div id="cvly-orbit-scaler">' +
        '<div id="cvly-orbit-area">' +
          '<svg id="cvly-orbit-svg" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'"></svg>' +
          '<div class="cvly-orbit-cc">'+mockupHTML("d-", MKW, MKH)+'</div>' +
        '</div>' +
      '</div>' +
      '<div id="cvly-panel"></div>';

    var scaler = document.getElementById("cvly-orbit-scaler");
    function applyScale() {
      var sc = Math.min(1, wrap.offsetWidth / W);
      scaler.style.transform = "scale("+sc+")";
      scaler.style.height = (H*sc)+"px";
      scaler.style.marginBottom = (-H*(1-sc))+"px";
    }
    applyScale();
    wrap._scaleHandler = applyScale;
    window.addEventListener("resize", applyScale);

    var svg = document.getElementById("cvly-orbit-svg");
    function svgEl(tag, a) {
      var el = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (var k in a) el.setAttribute(k, a[k]);
      return el;
    }
    svg.appendChild(svgEl("circle",{cx:cx,cy:cy,r:R+18,fill:"none",stroke:"#4fd1c5","stroke-width":"0.5",opacity:"0.05"}));
    svg.appendChild(svgEl("circle",{cx:cx,cy:cy,r:R,fill:"none",stroke:"rgba(79,209,197,0.15)","stroke-width":"1.4","stroke-dasharray":"5 14"}));

    var lines=[], pDot=svgEl("circle",{r:"5",opacity:"0"});
    svg.appendChild(pDot);
    CATS.forEach(function(cat) {
      var rad=cat.angle*Math.PI/180, nx=cx+R*Math.cos(rad), ny=cy+R*Math.sin(rad);
      var ln=svgEl("line",{x1:cx,y1:cy,x2:nx,y2:ny,stroke:"rgba(79,209,197,0.15)","stroke-width":"1.2","stroke-dasharray":"5 7"});
      svg.appendChild(ln);
      lines.push({el:ln,nx:nx,ny:ny});
    });

    var orbitArea=document.getElementById("cvly-orbit-area"), nodes=[];
    CATS.forEach(function(cat,i) {
      var rad=cat.angle*Math.PI/180, nx=cx+R*Math.cos(rad), ny=cy+R*Math.sin(rad);
      var node=document.createElement("div");
      node.className="cvly-node";
      node.style.cssText="--sc:"+cat.sevCol+";width:"+NW+"px;height:"+NH+"px;left:calc("+(nx/W*100)+"% - "+(NW/2)+"px);top:calc("+(ny/H*100)+"% - "+(NH/2)+"px);";
      node.innerHTML='<span class="cvly-node-icon">'+ICONS[cat.label]+'</span><span class="cvly-node-label">'+cat.label+'</span>';
      node.addEventListener("mouseenter",function(){setActive(i);});
      node.addEventListener("mouseleave",function(){setActive(null);});
      node.addEventListener("touchstart",function(e){e.preventDefault();setActive(active===i?null:i);},{passive:false});
      orbitArea.appendChild(node);
      nodes.push({el:node,cat:cat,nx:nx,ny:ny});
    });

    function setActive(idx) {
      active=idx;
      var panel=document.getElementById("cvly-panel");
      nodes.forEach(function(n,i) {
        var isA=i===idx;
        n.el.classList.toggle("active",isA);
        if (isA) {
          lines[i].el.setAttribute("stroke",n.cat.sevCol);
          lines[i].el.setAttribute("stroke-width","2");
          lines[i].el.removeAttribute("stroke-dasharray");
          pDot.setAttribute("cx",(n.nx+cx)/2);
          pDot.setAttribute("cy",(n.ny+cy)/2);
          pDot.setAttribute("fill",n.cat.sevCol);
          pDot.setAttribute("opacity","1");
        } else {
          lines[i].el.setAttribute("stroke","rgba(79,209,197,0.15)");
          lines[i].el.setAttribute("stroke-width","1.2");
          lines[i].el.setAttribute("stroke-dasharray","5 7");
        }
      });
      if (idx!==null) {
        var cat=CATS[idx];
        panel.classList.add("visible");
        panel.style.borderColor=cat.sevCol+"55";
        panel.innerHTML=
          '<div class="ph">' +
            '<span class="pi" style="color:'+cat.sevCol+'">'+ICONS[cat.label]+'</span>' +
            '<span class="pn">'+cat.label+'</span>' +
            '<span class="cvly-badge" style="background:'+cat.sevCol+'22;border:1px solid '+cat.sevCol+'55;color:'+cat.sevCol+'">'+cat.sev+'</span>' +
          '</div>' +
          '<div class="pf">'+cat.finding+'</div>' +
          '<div class="pt">&#8594; '+cat.tip+'</div>';
        hlLP(wrap,"d-",cat.label,cat.sevCol);
      } else {
        pDot.setAttribute("opacity","0");
        panel.classList.remove("visible");
        panel.style.borderColor="rgba(79,209,197,0.2)";
        hlLP(wrap,"d-",null,null);
      }
    }

    function startAuto() { autoTimer=setInterval(function(){pulseIdx=(pulseIdx+1)%CATS.length;setActive(pulseIdx);},2400); }
    wrap.addEventListener("mouseenter",function(){clearInterval(autoTimer);});
    wrap.addEventListener("mouseleave",function(){startAuto();});

    var pDir=1,pO=0;
    pulseInterval=setInterval(function(){
      if(active===null){pDot.setAttribute("opacity","0");return;}
      pO+=pDir*0.05; if(pO>=1)pDir=-1; if(pO<=0.15)pDir=1;
      pDot.setAttribute("opacity",pO);
    },40);

    wrap._cleanup=function(){
      clearInterval(autoTimer);
      clearInterval(pulseInterval);
      if(wrap._scaleHandler) window.removeEventListener("resize",wrap._scaleHandler);
    };
    startAuto();
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  MOBILE/IPAD — Stepper (4 steps)
  // ════════════════════════════════════════════════════════════════════════════
  function initStepper(wrap) {
    var idx=0;

    var s=document.createElement("style");
    s.id="cvly-stepper-style";
    s.textContent=
      "#cvly-orbit-wrap{width:100%;height:auto!important;min-height:0!important;padding:0!important;margin:0 auto!important;font-family:system-ui,-apple-system,sans-serif;user-select:none;}" +
      ".cvly-stepper{background:#0d1117;border-radius:20px;border:1px solid rgba(79,209,197,0.15);overflow:hidden;}" +
      ".cvly-stepper-top{padding:28px 24px;display:flex;gap:20px;align-items:center;height:230px;}" +
      ".cvly-stepper-info{flex:1;}" +
      ".cvly-step-counter{font-size:10px;color:#4a5568;letter-spacing:.5px;margin-bottom:12px;}" +
      ".cvly-step-head{display:flex;align-items:center;gap:10px;margin-bottom:10px;}" +
      ".cvly-icon-wrap{width:38px;height:38px;border-radius:10px;background:#161b27;border:1.5px solid var(--sc);box-shadow:0 0 12px color-mix(in srgb,var(--sc) 30%,transparent);display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:border-color .3s,box-shadow .3s;color:var(--sc);}" +
      ".cvly-step-label{font-size:15px;font-weight:700;color:#e2e8f0;}" +
      ".cvly-step-finding{font-size:13px;font-weight:600;color:#e2e8f0;margin-bottom:6px;line-height:1.4;}" +
      ".cvly-step-tip{font-size:11px;color:#94a3b8;line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;}" +
      ".cvly-stepper-controls{display:flex;align-items:center;justify-content:space-between;padding:18px 24px;border-top:1px solid rgba(255,255,255,0.05);}" +
      ".cvly-ctrl{width:40px;height:40px;border-radius:50%;background:#161b27;border:1px solid rgba(79,209,197,0.2);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s;color:#4fd1c5;user-select:none;}" +
      ".cvly-ctrl:hover{background:rgba(79,209,197,0.1);}" +
      ".cvly-pips{display:flex;gap:6px;align-items:center;}" +
      ".cvly-pip{height:3px;border-radius:2px;background:#1e2535;transition:all .3s;width:8px;}" +
      ".cvly-pip.active{background:#4fd1c5;width:20px;}";
    document.head.appendChild(s);

    wrap.innerHTML=
      '<div class="cvly-stepper" id="cvly-stepper">' +
        '<div class="cvly-stepper-top">' +
          mockupHTML("m-",100,136) +
          '<div class="cvly-stepper-info" id="cvly-step-info"></div>' +
        '</div>' +
        '<div class="cvly-stepper-controls">' +
          '<div class="cvly-ctrl" id="cvly-prev"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="#4fd1c5" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>' +
          '<div class="cvly-pips" id="cvly-pips"></div>' +
          '<div class="cvly-ctrl" id="cvly-next"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4L10 8L6 12" stroke="#4fd1c5" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>' +
        '</div>' +
      '</div>';

    var pipsEl=document.getElementById("cvly-pips");
    CATS.forEach(function(_,i){
      var pip=document.createElement("div");
      pip.className="cvly-pip"+(i===0?" active":"");
      pipsEl.appendChild(pip);
    });

    function render() {
      var cat=CATS[idx];
      document.getElementById("cvly-step-info").innerHTML=
        '<div class="cvly-step-counter">'+(idx+1)+' von '+CATS.length+'</div>'+
        '<div class="cvly-step-head" style="--sc:'+cat.sevCol+'"><div class="cvly-icon-wrap">'+ICONS[cat.label]+'</div><span class="cvly-step-label">'+cat.label+'</span></div>'+
        '<span class="cvly-badge" style="background:'+cat.sevCol+'22;border:1px solid '+cat.sevCol+'55;color:'+cat.sevCol+';margin-bottom:10px;display:inline-block;">'+cat.sev+'</span>'+
        '<div class="cvly-step-finding">'+cat.finding+'</div>'+
        '<div class="cvly-step-tip" style="margin-top:6px;">&#8594; '+cat.tip+'</div>';
      document.querySelectorAll(".cvly-pip").forEach(function(p,i){
        p.classList.toggle("active",i===idx);
        p.style.width=i===idx?"20px":"8px";
      });
      hlLP(wrap,"m-",cat.label,cat.sevCol);
    }

    var n=CATS.length;
    document.getElementById("cvly-next").addEventListener("click",function(){idx=(idx+1)%n;render();});
    document.getElementById("cvly-prev").addEventListener("click",function(){idx=(idx+n-1)%n;render();});

    var tx=0;
    var stepperEl=document.getElementById("cvly-stepper");
    stepperEl.addEventListener("touchstart",function(e){tx=e.touches[0].clientX;},{passive:true});
    stepperEl.addEventListener("touchend",function(e){
      var dx=e.changedTouches[0].clientX-tx;
      if(Math.abs(dx)>40){idx=dx<0?(idx+1)%n:(idx+n-1)%n;render();}
    },{passive:true});

    wrap._cleanup=function(){};
    render();
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Router
  // ════════════════════════════════════════════════════════════════════════════
  function isMobile() { return window.innerWidth < MOBILE_BP; }

  function renderMode(wrap) {
    var mobile = isMobile();
    var mode   = mobile ? "stepper" : "orbit";
    if (currentMode === mode) return;
    currentMode = mode;

    if (wrap._cleanup) wrap._cleanup();
    var old = document.getElementById("cvly-orbit-style") || document.getElementById("cvly-stepper-style");
    if (old) old.parentNode.removeChild(old);

    wrap.style.height    = "auto";
    wrap.style.minHeight = "0";
    wrap.style.maxHeight = "none";
    wrap.style.padding   = "0";
    wrap.innerHTML = "";

    if (mobile) initStepper(wrap);
    else        initOrbit(wrap);
  }

  function init() {
    var wrap = document.getElementById("cvly-orbit-wrap");
    if (!wrap) return;
    injectBaseCSS();
    renderMode(wrap);

    window.addEventListener("resize", function() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function() { renderMode(wrap); }, 150);
    });
    window.addEventListener("orientationchange", function() {
      setTimeout(function() { renderMode(wrap); }, 300);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

})();
