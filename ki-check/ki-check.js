/* Convertlyze KI-Sichtbarkeits-Check: Formular, Fortschritt, Spiel, Bestenliste.
   GEÄNDERT (18.11.2026): Liegt jetzt im Scripts-Repo (ki-check/ki-check.js) und wird über jsDelivr
   im zweiten Embed der Webflow-Komponente "KI-Check Formular" geladen. Davor stand der Code direkt
   im Embed. Änderungen hier machen, dann im Embed den Commit-Hash in der URL anpassen.
   Einstellungen stehen als data-Attribute am Element #ki-check (Embed im Hero):
   data-api-base           Railway-Adresse des Visibility-Tracker-Dienstes.
                           LEER = Demo-Modus, es wird nichts abgeschickt.
                           Im Demo-Modus testen: ?kcdemo=domainlimit, ?kcdemo=iplimit,
                           ?kcdemo=daylimit oder ?kcdemo=failed.
   data-turnstile-sitekey  Cloudflare Turnstile Site Key (leer = ohne Captcha)
   data-report-url         Pfad der Report-Seite in Webflow
   data-register-url       Registrierung für den 7-Tage-Test
   data-consent-version    bei Änderung des Einwilligungstexts hochzählen
   GEÄNDERT (18.11.2026): Geschäftliche E-Mail ist Pflicht und steht im Startformular, zusammen mit
   der freiwilligen Einwilligung. Beides geht mit POST /lead-checks raus. Der eigene E-Mail-Schritt
   im Wartezustand ist entfallen. Neue Antworten vom Server: email_required, invalid_email, freemail.
   GEÄNDERT (27.10.2026): Einwilligung ist eine Checkbox im E-Mail-Formular. Ist sie angehakt, geht
   nach erfolgreichem POST /email direkt POST /consent hinterher. Der Ja/Nein-Schritt ist entfallen.
   NEU (26.10.2026): Mit dem Start gehen die UTM-Parameter der Seitenadresse und der Pfad der Seite
   an den Server (Felder utm_source bis utm_term und landing_path), damit sich die Anzeigen-Seite
   und die Content-Hub-Seite vergleichen lassen. */
(function () {
  var root = document.getElementById("ki-check");
  // Schutz gegen doppeltes Laden (z. B. Script versehentlich zusätzlich im Seiten-Footer)
  if (!root || root.getAttribute("data-kc-init")) return;
  root.setAttribute("data-kc-init", "1");
  var $ = function (id) { return document.getElementById(id); };
  var cfg = {
    apiBase: (root.getAttribute("data-api-base") || "").replace(/\/$/, ""),
    siteKey: root.getAttribute("data-turnstile-sitekey") || "",
    reportUrl: root.getAttribute("data-report-url") || "/lp/ki-check-report",
    registerUrl: root.getAttribute("data-register-url") || "https://www.convertlyze.com/register",
    consentVersion: root.getAttribute("data-consent-version") || "",
    pollMs: 8000
  };
  var demo = !cfg.apiBase;
  var params = new URLSearchParams(location.search);
  var form = $("kc-form");
  var STATES = ["kc-form", "kc-wait", "kc-already", "kc-failed"];
  var STEPS = ["prompts", "engines", "knowledge", "report"];
  var turnstileToken = "";
  var lastPayload = null;
  var current = { token: null, email: null, finished: false };

  function show(id, label) {
    STATES.forEach(function (s) { $(s).hidden = s !== id; });
    $("kc-state").textContent = label;
  }
  function setError(msg) { var e = $("kc-err"); e.textContent = msg || ""; e.classList.toggle("on", !!msg); }
  function track(name, extra) {
    try { (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: name }, extra || {})); } catch (e) {}
  }
  function normalizeDomain(raw) {
    var v = (raw || "").trim().toLowerCase();
    v = v.replace(/^[a-z]+:\/\//, "").replace(/^\/\//, "");
    v = v.split(/[\/?#]/)[0].split("@").pop().split(":")[0].replace(/\.$/, "");
    return v.replace(/^www\./, "");
  }
  // NEU (26.10.2026): Herkunft. Gleiche Regel wie auf dem Server (lead_guard.clean_utm): Buchstaben,
  // Ziffern, Leerzeichen und - _ . + %, höchstens 100 Zeichen. Es wird nichts im Browser gespeichert,
  // und nur diese sechs Angaben gehen mit: UTM-Parameter und Pfad der Seite.
  function cleanUtm(v) { return String(v || "").replace(/[^\p{L}\p{N} _.+%-]/gu, "").slice(0, 100).trim(); }
  function origin() {
    var out = { landing_path: location.pathname };
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(function (k) {
      var v = cleanUtm(params.get(k));
      if (v) out[k] = v;
    });
    return out;
  }
  // NEU (18.11.2026): gleiche Liste wie auf dem Server (lead_guard.FREEMAIL_DOMAINS). Der Server prüft
  // trotzdem selbst, die Prüfung hier spart nur einen Umweg.
  var FREEMAIL = ["gmail.com", "googlemail.com", "gmx.de", "gmx.net", "gmx.at", "gmx.ch", "gmx.com", "gmx.org", "gmx.li",
    "web.de", "t-online.de", "freenet.de", "arcor.de", "online.de", "email.de", "mail.de", "posteo.de", "posteo.net",
    "mailbox.org", "vodafone.de", "1und1.de", "aon.at", "chello.at", "bluewin.ch", "hispeed.ch", "icloud.com", "me.com",
    "mac.com", "aol.com", "aol.de", "msn.com", "protonmail.com", "protonmail.ch", "proton.me", "pm.me", "tutanota.com",
    "tutanota.de", "tuta.io", "yandex.com", "yandex.ru", "mail.ru", "zoho.com"];
  var FREEMAIL_PREFIX = /^(yahoo|ymail|hotmail|outlook|live|windowslive)\./;
  var EMAIL_RE = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;
  function isFreemail(mail) {
    var dom = mail.split("@").pop();
    return FREEMAIL.indexOf(dom) !== -1 || FREEMAIL_PREFIX.test(dom);
  }
  var MAIL_MSG = {
    email_required: "Bitte gib deine geschäftliche E-Mail-Adresse ein.",
    invalid_email: "Bitte gib eine gültige E-Mail-Adresse ein.",
    freemail: "Bitte nutze deine geschäftliche Adresse. Private Postfächer wie Gmail oder GMX nehmen wir nicht an."
  };
  function emailProblem(mail) {
    if (!mail) return "email_required";
    if (!EMAIL_RE.test(mail)) return "invalid_email";
    if (isFreemail(mail)) return "freemail";
    return "";
  }
  function validate(d) {
    var bad = [];
    function mark(name, ok) { form.elements[name].setAttribute("aria-invalid", ok ? "false" : "true"); if (!ok) bad.push(name); }
    mark("company", d.company.length >= 2);
    mark("domain", /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d.domain));
    mark("seed_keyword", d.seed_keyword.length >= 2);
    var mp = emailProblem(d.email);
    mark("email", !mp);
    if (bad.length === 1 && mp) return MAIL_MSG[mp];
    if (bad.length) return "Bitte prüfe die rot markierten Felder.";
    if (cfg.siteKey && !turnstileToken) return "Bitte bestätige kurz, dass du kein Bot bist.";
    return "";
  }

  // Turnstile nur mit Site Key
  if (cfg.siteKey) {
    window.kcTurnstileReady = function () {
      window.turnstile.render("#kc-turnstile", {
        sitekey: cfg.siteKey, theme: "dark", language: "de",
        callback: function (t) { turnstileToken = t; },
        "expired-callback": function () { turnstileToken = ""; }
      });
    };
    var ts = document.createElement("script");
    ts.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=kcTurnstileReady&render=explicit";
    ts.async = true;
    document.head.appendChild(ts);
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = form.elements;
    var d = {
      company: f.company.value.trim(),
      domain: normalizeDomain(f.domain.value),
      seed_keyword: f.seed_keyword.value.trim(),
      email: f.email.value.trim().toLowerCase(),
      marketing_consent: !!f.consent.checked,
      consent_version: cfg.consentVersion,
      turnstile_token: turnstileToken
    };
    Object.assign(d, origin());
    var msg = validate(d);
    setError(msg);
    if (msg) return;
    // Honeypot: Bots füllen das versteckte Feld, Menschen nicht. Die Anfrage
    // geht trotzdem raus, damit der Server eine Alarm-Mail schicken kann.
    // Der Server startet dann keinen Check.
    if (f.website.value) {
      if (!demo) start(Object.assign({ website: f.website.value }, d)).catch(function () {});
      show("kc-wait", "Läuft");
      return;
    }

    var btn = $("kc-submit");
    btn.disabled = true; btn.textContent = "Wird gestartet …";
    lastPayload = d;
    start(d).then(function (res) { handle(res, d); })
      .catch(function () { setError("Der Check konnte gerade nicht gestartet werden. Bitte versuch es in einer Minute noch einmal."); })
      .then(function () { btn.disabled = false; btn.textContent = "Check starten"; });
  });

  function start(d) {
    if (demo) {
      return new Promise(function (r) { setTimeout(r, 700); }).then(function () {
        var dm = params.get("kcdemo");
        if (dm === "domainlimit") return { status: "domain_limit", domain: d.domain, limit: 5 };
        if (dm === "iplimit") return { status: "ip_limit", domain: d.domain, limit: 5 };
        if (dm === "daylimit") return { status: "daily_limit", domain: d.domain, limit: 50 };
        return { status: "admitted", token: "demo" };
      });
    }
    return fetch(cfg.apiBase + "/lead-checks", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d)
    }).then(function (r) {
      if (!r.ok && r.status !== 422) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  function handle(res, d) {
    if (res.status === "admitted") {
      track("ki_check_started");
      track("ki_check_email_added", { after_done: false });
      track("ki_check_optin", { answer: d.marketing_consent ? "yes" : "no" });
      waitFor(res.token, d.email, d.marketing_consent);
    } else if (MAIL_MSG[res.status]) {
      form.elements.email.setAttribute("aria-invalid", "true");
      setError(MAIL_MSG[res.status]);
      track("ki_check_email_rejected", { reason: res.status });
    } else if (/^(domain_limit|ip_limit|daily_limit|already_checked)$/.test(res.status)) {
      showLimit(res.status, res.domain || d.domain, res.limit);
    } else if (res.status === "invalid" || res.detail) {
      setError("Bitte prüfe deine Eingaben. Die Website muss eine gültige Domain sein.");
    } else {
      setError("Der Check konnte gerade nicht gestartet werden. Bitte versuch es später noch einmal.");
    }
  }

  // Limit erreicht: pro Domain (insgesamt), pro IP (heute) oder alle Checks (heute)
  function showLimit(kind, dom, limit) {
    var h = $("kc-lim-h"), p = $("kc-lim-p"), eb = $("kc-lim-eb");
    var tracker = " Im Customer Journey Tracker siehst du über 7 Tage, wie stabil die Nennungen sind, und bekommst einen Aktionsplan dazu.";
    h.textContent = "";
    if (kind === "ip_limit") {
      eb.textContent = "Tageslimit erreicht";
      h.textContent = "Von deinem Anschluss sind heute schon " + (limit || 5) + " Checks gelaufen.";
      p.textContent = "Ab Mitternacht kannst du wieder prüfen. Wenn du eine Domain regelmäßig beobachten willst, ist der Tracker ohnehin der bessere Weg." + tracker;
    } else if (kind === "daily_limit") {
      eb.textContent = "Für heute ausgebucht";
      h.textContent = "Für heute sind alle kostenlosen Checks vergeben.";
      p.textContent = "Ab Mitternacht geht es weiter. Wenn du nicht warten willst, starte direkt mit dem Tracker." + tracker;
    } else {
      eb.textContent = "Limit erreicht";
      var span = document.createElement("span"); span.textContent = dom;
      h.appendChild(document.createTextNode("Für "));
      h.appendChild(span);
      h.appendChild(document.createTextNode(" sind alle kostenlosen Checks verbraucht."));
      p.textContent = "Pro Domain gibt es " + (limit || 5) + " kostenlose Checks. Jeder Lauf ist eine Momentaufnahme, weil KI-Antworten von Abfrage zu Abfrage schwanken." + tracker;
    }
    $("kc-already-cta").href = cfg.registerUrl + (dom ? "?domain=" + encodeURIComponent(dom) : "");
    show("kc-already", "Limit");
    track("ki_check_limit", { limit_type: kind });
  }

  function paint(step, done) {
    var idx = STEPS.indexOf(step);
    var lis = document.querySelectorAll("#kc-steps li");
    for (var i = 0; i < lis.length; i++) {
      lis[i].classList.toggle("ok", done || i < idx);
      lis[i].classList.toggle("run", !done && i === idx);
    }
  }
  function reportLink(token) {
    var base = new URL(cfg.reportUrl, location.href);
    if (demo) base.searchParams.set("demo", "1"); else base.searchParams.set("t", token);
    return base.href;
  }
  // Der Kasten mit dem Report-Button steht von Anfang an da (deaktiviert),
  // damit beim Fertigwerden nichts verrutscht.
  function setDone(ready, link) {
    var txt = $("kc-done-txt"), btn = $("kc-report-btn");
    txt.textContent = "";
    var b = document.createElement("b");
    b.textContent = ready ? "Fertig." : "Report wird erstellt.";
    txt.appendChild(b);
    txt.appendChild(document.createTextNode(ready
      ? " Dein Report ist bereit, auch als PDF zum Speichern."
      : " Der Button wird aktiv, sobald er fertig ist."));
    $("kc-done").classList.toggle("on", ready);
    if (ready) { btn.href = link; btn.removeAttribute("aria-disabled"); }
    else { btn.removeAttribute("href"); btn.setAttribute("aria-disabled", "true"); }
  }
  function finish() {
    current.finished = true;
    paint("report", true);
    setDone(true, $("kc-report-link").value);
    if (current.email) renderMok();
    $("kc-note").textContent = "Den Link findest du auch in deiner E-Mail. Wenn du magst, spiel ruhig weiter:";
    $("kc-state").textContent = "Fertig";
    track("ki_check_done");
  }
  function waitFor(token, email, consent) {
    current = { token: token, email: email || null, finished: false };
    show("kc-wait", "Läuft");
    if (current.email) renderMok();
    $("kc-optin-note").hidden = !consent;
    var link = reportLink(token);
    $("kc-report-link").value = link;
    setDone(false);
    var note = $("kc-note");
    note.textContent = "";
    note.appendChild(document.createTextNode("Das dauert ein paar Minuten. "));
    var b = document.createElement("b");
    b.textContent = "Du kannst die Seite offen lassen oder schließen, der Link kommt per E-Mail.";
    note.appendChild(b);
    note.appendChild(document.createTextNode(" Oder du vertreibst dir die Zeit:"));
    paint("prompts", false);
    Game.init();
    Board.load();

    if (demo) {
      if (params.get("kcdemo") === "failed") { setTimeout(function () { show("kc-failed", "Abgebrochen"); }, 5000); return; }
      var i = 0;
      var t = setInterval(function () {
        i++;
        if (i < STEPS.length) paint(STEPS[i], false); else { clearInterval(t); finish(); }
      }, 6000);
      return;
    }
    function poll() {
      fetch(cfg.apiBase + "/lead-checks/" + encodeURIComponent(token) + "/status")
        .then(function (r) { return r.json(); })
        .then(function (s) {
          if (s.status === "done") return finish();
          if (s.status === "failed") return show("kc-failed", "Abgebrochen");
          if (s.step) paint(s.step, false);
          setTimeout(poll, cfg.pollMs);
        })
        .catch(function () { setTimeout(poll, cfg.pollMs); });
    }
    setTimeout(poll, cfg.pollMs);
  }

  // ------------------------------------------- Bestätigung der E-Mail im Wartezustand
  function mailText() {
    return current.finished
      ? "Der Link zu deinem Report ist unterwegs an "
      : "Sobald der Report fertig ist, schicken wir den Link an ";
  }
  function renderMok() {
    var ok = $("kc-mok"); ok.textContent = mailText();
    var b = document.createElement("b"); b.textContent = current.email; ok.appendChild(b); ok.appendChild(document.createTextNode("."));
  }
  function post(path, body) {
    if (demo) return new Promise(function (r) { setTimeout(function () { r({ status: "ok" }); }, 400); });
    return fetch(cfg.apiBase + "/lead-checks/" + encodeURIComponent(current.token) + path, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    }).then(function (r) { if (!r.ok && r.status !== 422) throw new Error("HTTP " + r.status); return r.json(); });
  }
  // GEÄNDERT (18.11.2026): Der E-Mail-Schritt im Wartezustand und POST /email bzw. /consent werden
  // hier nicht mehr genutzt. Die Endpunkte bleiben auf dem Server für Seiten, die noch offen sind.

  $("kc-retry").addEventListener("click", function () {
    show("kc-form", "Kostenlos");
    if (lastPayload) form.requestSubmit();
  });
  $("kc-copy").addEventListener("click", function () {
    var v = $("kc-report-link").value;
    var done = function () { $("kc-copy").textContent = "Kopiert"; setTimeout(function () { $("kc-copy").textContent = "Kopieren"; }, 1800); };
    if (navigator.clipboard) navigator.clipboard.writeText(v).then(done, function () { $("kc-report-link").select(); });
    else $("kc-report-link").select();
    track("ki_check_link_copied");
  });
  $("kc-report-btn").addEventListener("click", function () { track("ki_check_report_opened"); });

  // ---------------------------------------------------------- Bestenliste
  // Top 10 der Woche vom Server (game_scores.py). Eintragen nur mit dem Token
  // des laufenden Checks. Im Demo-Modus bleibt alles im Browser.
  var Board = (function () {
    var entries = [];
    var DEMO = [["Mara", 41], ["SEO-Jens", 37], ["Anonym", 33], ["kat.b2b", 29], ["Tobi", 24], ["Anonym", 19], ["LeadLisa", 15]];
    function render(highlight) {
      var ol = $("kc-blist");
      ol.textContent = "";
      if (!entries.length) {
        var e = document.createElement("li"); e.className = "kc-bempty";
        e.textContent = "Noch keine Einträge diese Woche. Du kannst die Liste anführen.";
        ol.appendChild(e); return;
      }
      entries.forEach(function (x) {
        var li = document.createElement("li");
        if (highlight && x.nickname === highlight.nickname && x.score === highlight.score) li.className = "me";
        var n = document.createElement("span"); n.className = "n"; n.textContent = x.nickname;
        var sc = document.createElement("span"); sc.className = "s"; sc.textContent = x.score;
        li.appendChild(n); li.appendChild(sc); ol.appendChild(li);
      });
    }
    function load() {
      if (demo) { entries = DEMO.map(function (d) { return { nickname: d[0], score: d[1] }; }); render(); return; }
      fetch(cfg.apiBase + "/game/leaderboard").then(function (r) { return r.json(); })
        .then(function (d) { entries = (d && d.entries) || []; render(); })
        .catch(function () { entries = []; render(); });
    }
    function qualifies(score) {
      return score > 0 && (entries.length < 10 || score > entries[entries.length - 1].score);
    }
    function submit(nick, score, durationMs) {
      if (demo) {
        var name = (nick || "").trim() || "Anonym";
        if (!/^[0-9A-Za-zÄÖÜäöüß .\-_]{2,16}$/.test(name)) return Promise.resolve({ status: "invalid" });
        entries.push({ nickname: name, score: score });
        entries.sort(function (a, b) { return b.score - a.score; });
        entries = entries.slice(0, 10);
        var rank = entries.findIndex(function (x) { return x.nickname === name && x.score === score; }) + 1;
        render({ nickname: name, score: score });
        return Promise.resolve({ status: "ok", rank: rank || null });
      }
      return fetch(cfg.apiBase + "/game/scores", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: current.token, nickname: nick, score: score, duration_ms: durationMs })
      }).then(function (r) { return r.json(); }).then(function (res) {
        if (res.status === "ok" && res.board) {
          entries = res.board.entries || [];
          var name = (nick || "").trim().replace(/\s+/g, " ") || "Anonym";
          render({ nickname: name, score: score });
        }
        return res;
      });
    }
    return { load: load, qualifies: qualifies, submit: submit };
  })();

  // ---------------------------------------------------------------- Spiel
  var Game = (function () {
    var C = { t: "#4fd1c5", gr: "#4ec68a", rd: "#de5b50", mu: "#71879a", bg: "#0d1117" };
    var TYPES = [
      { kind: "cite", label: "Zitat", color: C.t, points: 1, weight: 62 },
      { kind: "link", label: "Link", color: C.gr, points: 3, weight: 12 },
      { kind: "hallu", label: "Halluzination", color: C.rd, points: 0, weight: 26 }
    ];
    var canvas, ctx, stage, W = 0, H = 240, dpr = 1, running = false, ready = false, last = 0, raf = 0;
    var player, items, pops, score, lives, spawnIn, elapsed, keys = {}, best = 0, lastRun = null, dragging = false;

    function readBest() { try { return parseInt(localStorage.getItem("cvz_zitat_best") || "0", 10) || 0; } catch (e) { return 0; } }
    function saveBest(v) { try { localStorage.setItem("cvz_zitat_best", String(v)); } catch (e) {} }
    function resize() {
      var rect = stage.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(240, Math.floor(rect.width));
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (player) player.x = Math.min(player.x, W - player.w / 2);
      if (!running) grid();
    }
    function pick() { var r = Math.random() * 100; for (var i = 0; i < TYPES.length; i++) { if ((r -= TYPES[i].weight) < 0) return TYPES[i]; } return TYPES[0]; }
    function reset() { player = { x: W / 2, w: 74, h: 10, target: null }; items = []; pops = []; score = 0; lives = 3; spawnIn = 0.4; elapsed = 0; hud(); }
    function hud() {
      $("kc-score").textContent = score; $("kc-best").textContent = best;
      var l = document.querySelectorAll("#kc-lives i");
      for (var i = 0; i < l.length; i++) l[i].classList.toggle("off", i >= lives);
    }
    function spawn() {
      var type = pick();
      ctx.font = "600 11px Geist, sans-serif";
      var w = Math.ceil(ctx.measureText(type.label).width) + 16;
      items.push({ type: type, w: w, h: 20, x: 8 + Math.random() * (W - w - 16), y: -22, vy: 70 + Math.min(elapsed, 60) * 3.2 + Math.random() * 40 });
    }
    function step(dt) {
      elapsed += dt;
      if (keys.left) player.x -= 420 * dt;
      if (keys.right) player.x += 420 * dt;
      if (player.target != null) player.x += (player.target - player.x) * Math.min(1, dt * 18);
      player.x = Math.max(player.w / 2, Math.min(W - player.w / 2, player.x));
      spawnIn -= dt;
      if (spawnIn <= 0) { spawn(); spawnIn = Math.max(0.32, 0.95 - elapsed * 0.012) * (0.7 + Math.random() * 0.6); }
      var py = H - 20;
      for (var i = items.length - 1; i >= 0; i--) {
        var it = items[i];
        it.y += it.vy * dt;
        var hit = it.y + it.h >= py && it.y <= py + player.h && it.x + it.w >= player.x - player.w / 2 && it.x <= player.x + player.w / 2;
        if (hit) {
          items.splice(i, 1);
          if (it.type.kind === "hallu") {
            lives--; pops.push({ x: it.x + it.w / 2, y: py - 8, text: "−1 Leben", color: C.rd, t: 0.9 });
            if (lives <= 0) { hud(); return over(); }
          } else {
            score += it.type.points; pops.push({ x: it.x + it.w / 2, y: py - 8, text: "+" + it.type.points, color: it.type.color, t: 0.7 });
          }
          hud();
        } else if (it.y > H) items.splice(i, 1);
      }
      for (var j = pops.length - 1; j >= 0; j--) { pops[j].t -= dt; pops[j].y -= 30 * dt; if (pops[j].t <= 0) pops.splice(j, 1); }
    }
    function grid() {
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(150,180,200,.06)"; ctx.lineWidth = 1;
      for (var x = 0; x < W; x += 24) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
    }
    function draw() {
      grid();
      ctx.font = "600 11px Geist, sans-serif"; ctx.textBaseline = "middle"; ctx.textAlign = "center";
      items.forEach(function (it) {
        ctx.fillStyle = it.type.color + "22"; ctx.fillRect(it.x, it.y, it.w, it.h);
        ctx.strokeStyle = it.type.color; ctx.lineWidth = 1; ctx.strokeRect(it.x + 0.5, it.y + 0.5, it.w - 1, it.h - 1);
        ctx.fillStyle = it.type.color; ctx.fillText(it.type.label, it.x + it.w / 2, it.y + it.h / 2 + 0.5);
      });
      var px = player.x - player.w / 2, py = H - 20;
      ctx.fillStyle = C.t;
      ctx.fillRect(px, py, player.w, 4); ctx.fillRect(px, py - 8, 4, 12); ctx.fillRect(px + player.w - 4, py - 8, 4, 12);
      ctx.font = "500 10px Geist Mono, monospace"; ctx.fillStyle = C.mu; ctx.fillText("deine Domain", player.x, py + 12);
      ctx.font = "700 13px Geist, sans-serif";
      pops.forEach(function (p) { ctx.globalAlpha = Math.max(0, Math.min(1, p.t * 1.6)); ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, p.y); });
      ctx.globalAlpha = 1;
    }
    function loop(ts) {
      if (!running) return;
      var dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
      step(dt); if (running) draw();
      raf = requestAnimationFrame(loop);
    }
    function begin() { reset(); $("kc-nick").hidden = true; $("kc-nickmsg").textContent = ""; $("kc-ov").hidden = true; running = true; last = performance.now(); raf = requestAnimationFrame(loop); }
    function over() {
      running = false; cancelAnimationFrame(raf); draw();
      var record = score > best; if (record) { best = score; saveBest(best); } hud();
      $("kc-gtitle").textContent = record ? "Neuer Rekord: " + score : score + " Punkte";
      $("kc-leg").hidden = true;
      $("kc-nickmsg").textContent = "";
      lastRun = { score: score, durationMs: Math.round(elapsed * 1000) };
      var top = Board.qualifies(score) && (demo || current.token);
      $("kc-nick").hidden = !top;
      if (top) {
        $("kc-gtext").textContent = "Das reicht für die Top 10 dieser Woche. Trag dich ein:";
        var input = $("kc-nick").elements.nick;
        try { input.value = localStorage.getItem("cvz_zitat_nick") || ""; } catch (e) {}
      } else {
        $("kc-gtext").textContent = score >= 25 ? "So viele Zitate bekommt kaum eine Marke. Im echten Report siehst du, wie es bei dir aussieht." : "Drei Halluzinationen erwischt. Noch eine Runde?";
      }
      $("kc-gstart").textContent = "Nochmal"; $("kc-ov").hidden = false;
      track("ki_check_game_over");
    }
    function pause() {
      if (!running) return;
      running = false; cancelAnimationFrame(raf);
      $("kc-gtitle").textContent = "Pause"; $("kc-gtext").textContent = "Punkte bisher: " + score;
      $("kc-gstart").textContent = "Weiter"; $("kc-gstart").setAttribute("data-resume", "1"); $("kc-ov").hidden = false;
    }
    function resume() { $("kc-ov").hidden = true; running = true; last = performance.now(); raf = requestAnimationFrame(loop); }
    // GEÄNDERT (22.10.2026): Maus und Finger setzen den Fänger direkt auf die
    // Zeigerposition. Vorher hörte nur das Spielfeld zu, und sobald die Maus
    // oben oder unten aus dem 240 px hohen Feld rutschte, blieb der Fänger stehen.
    function moveTo(e) {
      var r = canvas.getBoundingClientRect();
      if (!r.width) return;
      player.target = null;
      player.x = (e.clientX - r.left) * (W / r.width);
    }
    function init() {
      if (ready) { resize(); return; }
      ready = true;
      canvas = $("kc-canvas"); ctx = canvas.getContext("2d"); stage = $("kc-stage");
      best = readBest(); resize(); reset();
      window.addEventListener("resize", resize);
      $("kc-nick").addEventListener("submit", function (e) {
        e.preventDefault();
        if (!lastRun) return;
        var form = $("kc-nick"), nick = form.elements.nick.value.trim(), btn = form.querySelector("button");
        btn.disabled = true;
        Board.submit(nick, lastRun.score, lastRun.durationMs).then(function (res) {
          var msg = $("kc-nickmsg");
          if (res.status === "ok") {
            form.hidden = true;
            try { if (nick) localStorage.setItem("cvz_zitat_nick", nick); } catch (e2) {}
            $("kc-gtext").textContent = "";
            msg.textContent = res.rank ? "Eingetragen. Du stehst auf Platz " + res.rank + "." : "Eingetragen.";
            lastRun = null;
            track("ki_check_game_score_saved", { rank: res.rank || 0 });
          } else if (res.status === "invalid") {
            msg.textContent = "Bitte 2 bis 16 Zeichen: Buchstaben, Ziffern, Leerzeichen. Oder leer lassen.";
          } else {
            form.hidden = true;
            msg.textContent = "Das hat leider nicht geklappt.";
          }
        }).catch(function () { $("kc-nickmsg").textContent = "Das hat leider nicht geklappt."; })
          .then(function () { btn.disabled = false; });
      });
      $("kc-gstart").addEventListener("click", function () {
        if ($("kc-gstart").getAttribute("data-resume")) { $("kc-gstart").removeAttribute("data-resume"); resume(); } else begin();
      });
      window.addEventListener("pointermove", function (e) {
        if (running && (e.pointerType === "mouse" || dragging)) moveTo(e);
      }, { passive: true });
      canvas.addEventListener("pointerdown", function (e) {
        if (!running) return;
        dragging = true; moveTo(e);
        try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      });
      window.addEventListener("pointerup", function () { dragging = false; });
      window.addEventListener("pointercancel", function () { dragging = false; });
      window.addEventListener("keydown", function (e) {
        if (!running) return;
        if (e.key === "ArrowLeft" || e.key === "a") { keys.left = true; player.target = null; e.preventDefault(); }
        if (e.key === "ArrowRight" || e.key === "d") { keys.right = true; player.target = null; e.preventDefault(); }
        if (e.key === "Escape" || e.key === "p") pause();
      });
      window.addEventListener("keyup", function (e) {
        if (e.key === "ArrowLeft" || e.key === "a") keys.left = false;
        if (e.key === "ArrowRight" || e.key === "d") keys.right = false;
      });
      document.addEventListener("visibilitychange", function () { if (document.hidden) pause(); });
    }
    return { init: init };
  })();
})();
