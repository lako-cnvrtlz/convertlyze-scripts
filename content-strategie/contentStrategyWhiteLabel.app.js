// contentStrategyWhiteLabel.app.js
//
// Einstellungen-Widget für Logo + Akzentfarbe des White-Label-PDF-Exports (Content-Strategie).
// Eigener Abschnitt auf /member/einstellungen (Lasse hat bestätigt: es gibt dort noch KEINEN
// "Branding"-Abschnitt, den man mitbenutzen könnte - daher bewusst analog zum bereits
// bestehenden "Integrationen"-Abschnitt als eigener, neuer Block aufgebaut, siehe
// contentStrategySettings.app.js/.style.css für das identische Muster).
//
// Gleiches Look&Feel wie contentStrategySettings.app.js (Dark Theme, cvly-card/cvly-badge/
// cvly-action-btn), eigener Wurzel-Container "cvly-white-label" + eigenes CSS-Prefix
// "cvly-wl-", damit dieses Widget neben den anderen Einstellungen-Widgets auf derselben Seite
// laufen kann, ohne IDs/Klassen zu kollidieren.
//
// API-Vertrag (gegen routes/user.js geprüft):
//   - GET  /api/user/white-label        -> { eligible, license_type, logo_url, accent_color }
//   - POST /api/user/white-label/logo   -> multipart/form-data, Feldname "file" (PNG/JPEG/SVG/WebP, max 2MB)
//                                           -> { success: true, logo_url }
//   - POST /api/user/white-label/color  -> JSON { accent_color: "#rrggbb" } -> { success: true, accent_color }
// Auth identisch zu contentStrategySettings.app.js: "Authorization: Bearer <Memberstack-Member-JWT>"
// (NICHT die pure Member-ID - siehe Sicherheits-Kommentar dort), da routes/user.js dieselbe
// authenticateMember-Middleware nutzt.
//
// EINBINDUNG auf https://www.convertlyze.com/member/einstellungen, z.B. direkt unter dem
// "Integrationen"-Abschnitt:
//   <section id="pdf-export-branding">
//     <h2>PDF-Export-Branding</h2>
//     <div id="cvly-white-label"></div>
//   </section>
// plus dieses Script + contentStrategyWhiteLabel.style.css.

(function () {
  'use strict';

  var DEFAULT_CONFIG = {
    apiBaseUrl: 'https://YOUR-API-DOMAIN.example',
    containerId: 'cvly-white-label',
    // TODO: echten Anker/Pfad zum Plan-Upgrade eintragen (analog zu den anderen TODO-Platzhaltern
    // im Projekt, z.B. landingpageAssistantUrl in contentStrategyAgent.app.js).
    upgradeUrl: '/member/einstellungen#plan',
  };
  var CONFIG = Object.assign({}, DEFAULT_CONFIG, window.CVZ_WHITE_LABEL_CONFIG || {});

  var MAX_LOGO_BYTES = 2 * 1024 * 1024;
  var ACCEPTED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
  var HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

  var state = { root: null, memberstackToken: null, currentColor: null };

  // ── Deps-Warten, gleiches Muster wie contentStrategySettings.app.js ───────────────────────
  function retry(fn, maxAttempts, intervalMs) {
    var attempts = 0;
    return new Promise(function (resolve, reject) {
      (function attempt() {
        if (fn()) return resolve();
        if (++attempts >= maxAttempts) return reject(new Error('Max retry attempts reached'));
        setTimeout(attempt, intervalMs);
      })();
    });
  }
  function depsReady() {
    return !!window.$memberstackDom;
  }

  function qs(id) {
    return document.getElementById(id);
  }

  function apiFetch(path, options) {
    options = options || {};
    var headers = Object.assign({}, options.headers || {});
    // WICHTIG: bei multipart/form-data (Logo-Upload) KEIN "Content-Type" von Hand setzen - der
    // Browser muss die Boundary selbst anhängen. Nur bei JSON-Bodies explizit setzen.
    if (!(options.body instanceof FormData) && options.method && options.method !== 'GET') {
      headers['Content-Type'] = 'application/json';
    }
    if (state.memberstackToken) headers.Authorization = 'Bearer ' + state.memberstackToken;
    return fetch(CONFIG.apiBaseUrl + path, Object.assign({}, options, { headers: headers })).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (body) {
          if (!res.ok) {
            var err = new Error(body.error || body.message || 'API-Fehler (' + res.status + ')');
            err.status = res.status;
            throw err;
          }
          return body;
        });
    });
  }

  // ── Toast, 1:1 aus contentStrategySettings.app.js übernommen ──────────────────────────────
  function showToast(msg, type) {
    var t = document.createElement('div');
    t.style.cssText =
      'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a2133;color:#e8edf5;' +
      'padding:12px 20px;border-radius:10px;font-size:14px;z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,0.4);' +
      'max-width:420px;text-align:center;line-height:1.5;border:1px solid ' +
      (type === 'error' ? '#4a1f1f' : 'rgba(79,209,197,0.3)') +
      ';border-left:3px solid ' +
      (type === 'error' ? '#f87171' : '#4fd1c5');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () {
      t.remove();
    }, 5000);
  }

  function placeholderLogoSvg() {
    return (
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>' +
      '</svg>'
    );
  }

  // ── Skeleton/Content-Shell ──────────────────────────────────────────────────────────────
  function renderShell() {
    state.root.innerHTML =
      '<div id="cvly-wl-skeleton">' +
      '<div class="cvly-wl-card">' +
      '<div class="cvly-wl-skeleton-line lg" style="width:50%;margin-bottom:20px"></div>' +
      '<div class="cvly-wl-skeleton-line" style="width:80%"></div>' +
      '<div class="cvly-wl-skeleton-line sm" style="width:35%"></div>' +
      '</div></div>' +
      '<div id="cvly-wl-content" style="display:none"></div>';
  }

  function renderUpsell(licenseType) {
    var content = qs('cvly-wl-content');
    content.innerHTML =
      '<div class="cvly-wl-card">' +
      '<div class="cvly-wl-card-header">' +
      '<p class="cvly-wl-card-title">PDF-Export-Branding</p>' +
      '<span class="cvly-wl-badge pending"><span class="cvly-wl-badge-dot"></span>Nicht verfügbar</span>' +
      '</div>' +
      '<p class="cvly-wl-meta">' +
      'Mit einem Pro- oder Enterprise-Plan kannst du deine Content-Strategie-Berichte als PDF mit eigenem Logo und ' +
      'eigener Akzentfarbe statt im Standard-Convertlyze-Stil exportieren' +
      (licenseType ? ' (aktueller Plan: ' + escapeHtml(licenseType) + ').' : '.') +
      '</p>' +
      '<div class="cvly-wl-action-row">' +
      '<a class="cvly-wl-action-btn upgrade" href="' + escapeAttr(CONFIG.upgradeUrl) + '">Plan upgraden</a>' +
      '</div>' +
      '</div>';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function escapeAttr(s) {
    return escapeHtml(s);
  }

  function renderEditor(profile) {
    var content = qs('cvly-wl-content');
    content.innerHTML =
      '<div class="cvly-wl-card">' +
      '<div class="cvly-wl-card-header">' +
      '<p class="cvly-wl-card-title">PDF-Export-Branding</p>' +
      '<span class="cvly-wl-badge active"><span class="cvly-wl-badge-dot"></span>' + escapeHtml(profile.license_type || 'Aktiv') + '</span>' +
      '</div>' +
      '<p class="cvly-wl-meta">Wird für den PDF-Export deiner Content-Strategie-Berichte verwendet, gilt für dein ganzes Team.</p>' +

      '<div class="cvly-wl-row">' +
      '<div class="cvly-wl-logo-preview" id="cvly-wl-logo-preview"></div>' +
      '<div class="cvly-wl-logo-controls">' +
      '<button type="button" class="cvly-wl-action-btn" id="cvly-wl-logo-btn">Logo hochladen</button>' +
      '<input type="file" id="cvly-wl-logo-input" accept="' + ACCEPTED_LOGO_TYPES.join(',') + '" style="display:none">' +
      '<p class="cvly-wl-hint">PNG, JPEG, SVG oder WebP, max. 2&nbsp;MB. Ersetzt ein vorhandenes Logo.</p>' +
      '</div>' +
      '</div>' +

      '<div class="cvly-wl-divider"></div>' +

      '<div class="cvly-wl-row">' +
      '<input type="color" id="cvly-wl-color-picker" class="cvly-wl-color-picker" value="' + escapeAttr(profile.accent_color || '#2563eb') + '">' +
      '<div class="cvly-wl-color-controls">' +
      '<label class="cvly-wl-label" for="cvly-wl-color-text">Akzentfarbe</label>' +
      '<div class="cvly-wl-color-input-row">' +
      '<input type="text" id="cvly-wl-color-text" class="cvly-wl-color-text" value="' + escapeAttr(profile.accent_color || '#2563eb') + '" placeholder="#2563eb">' +
      '<button type="button" class="cvly-wl-action-btn primary" id="cvly-wl-color-save">Speichern</button>' +
      '</div>' +
      '<p class="cvly-wl-hint" id="cvly-wl-color-hint">Wird für Überschriften und Akzente im exportierten PDF verwendet.</p>' +
      '</div>' +
      '</div>' +
      '</div>';

    state.currentColor = profile.accent_color || '#2563eb';
    renderLogoPreview(profile.logo_url);
    wireLogoUpload();
    wireColorControls();
  }

  function renderLogoPreview(logoUrl) {
    var preview = qs('cvly-wl-logo-preview');
    if (!preview) return;
    if (logoUrl) {
      preview.innerHTML = '<img src="' + escapeAttr(logoUrl) + '" alt="Aktuelles Logo">';
    } else {
      preview.innerHTML = '<span class="cvly-wl-logo-placeholder">' + placeholderLogoSvg() + '</span>';
    }
  }

  function wireLogoUpload() {
    var btn = qs('cvly-wl-logo-btn');
    var input = qs('cvly-wl-logo-input');
    btn.addEventListener('click', function () {
      input.click();
    });
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      input.value = '';
      if (!file) return;

      if (!ACCEPTED_LOGO_TYPES.includes(file.type)) {
        showToast('Nicht unterstütztes Dateiformat. Bitte PNG, JPEG, SVG oder WebP verwenden.', 'error');
        return;
      }
      if (file.size > MAX_LOGO_BYTES) {
        showToast('Datei zu groß (max. 2 MB).', 'error');
        return;
      }

      var originalLabel = btn.textContent;
      btn.textContent = 'Wird hochgeladen …';
      btn.disabled = true;

      var formData = new FormData();
      formData.append('file', file);

      apiFetch('/api/user/white-label/logo', { method: 'POST', body: formData })
        .then(function (res) {
          renderLogoPreview(res.logo_url);
          showToast('Logo aktualisiert.', 'success');
        })
        .catch(function (err) {
          showToast('Logo-Upload fehlgeschlagen: ' + err.message, 'error');
        })
        .finally(function () {
          btn.textContent = originalLabel;
          btn.disabled = false;
        });
    });
  }

  function wireColorControls() {
    var picker = qs('cvly-wl-color-picker');
    var text = qs('cvly-wl-color-text');
    var saveBtn = qs('cvly-wl-color-save');
    var hint = qs('cvly-wl-color-hint');

    // Nativer Color-Picker feuert bei jedem Drag ein 'input'-Event - das Textfeld wird live
    // mitgezogen, aber es wird BEWUSST nicht bei jedem Pixel gespeichert (Netzwerk-Spam), erst
    // per Klick auf "Speichern".
    picker.addEventListener('input', function () {
      text.value = picker.value;
    });
    text.addEventListener('input', function () {
      if (HEX_COLOR_RE.test(text.value)) {
        picker.value = text.value;
      }
    });

    saveBtn.addEventListener('click', function () {
      var value = text.value.trim();
      if (!HEX_COLOR_RE.test(value)) {
        showToast('Ungültige Farbe - bitte als 6-stelligen Hex-Wert angeben, z.B. #2563eb', 'error');
        return;
      }
      var originalLabel = saveBtn.textContent;
      saveBtn.textContent = 'Speichert …';
      saveBtn.disabled = true;

      apiFetch('/api/user/white-label/color', { method: 'POST', body: JSON.stringify({ accent_color: value }) })
        .then(function () {
          state.currentColor = value;
          showToast('Akzentfarbe gespeichert.', 'success');
        })
        .catch(function (err) {
          showToast('Speichern fehlgeschlagen: ' + err.message, 'error');
        })
        .finally(function () {
          saveBtn.textContent = originalLabel;
          saveBtn.disabled = false;
        });
    });
  }

  function load() {
    apiFetch('/api/user/white-label')
      .then(function (profile) {
        qs('cvly-wl-skeleton').style.display = 'none';
        qs('cvly-wl-content').style.display = '';
        if (profile.eligible) {
          renderEditor(profile);
        } else {
          renderUpsell(profile.license_type);
        }
      })
      .catch(function (err) {
        qs('cvly-wl-skeleton').innerHTML =
          '<div class="cvly-wl-card"><p style="color:#f87171;font-size:14px">Fehler beim Laden: ' + escapeHtml(err.message) + '</p></div>';
      });
  }

  function init() {
    var root = document.getElementById(CONFIG.containerId);
    if (!root) {
      console.error('cvly-white-label: Container #' + CONFIG.containerId + ' nicht gefunden.');
      return;
    }
    state.root = root;
    root.id = root.id || CONFIG.containerId;
    renderShell();

    retry(depsReady, 20, 500)
      .then(function () {
        // Gleiches Sicherheits-Prinzip wie contentStrategySettings.app.js: echtes, signiertes
        // Memberstack-JWT (getMemberCookie()), NICHT die pure member.id.
        return Promise.all([window.$memberstackDom.getCurrentMember(), window.$memberstackDom.getMemberCookie()]);
      })
      .then(function (results) {
        var member = results[0] && results[0].data;
        var token = results[1];
        if (!member || !member.id || !token) {
          root.innerHTML = '<div class="cvly-wl-card"><p style="font-size:14px">Bitte zuerst einloggen.</p></div>';
          return;
        }
        state.memberstackToken = token;
        load();
      })
      .catch(function () {
        root.innerHTML = '<div class="cvly-wl-card"><p style="color:#f87171;font-size:14px">Seite konnte nicht geladen werden. Bitte neu laden.</p></div>';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
