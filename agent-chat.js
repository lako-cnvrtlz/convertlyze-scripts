(function() {
  if (window.convertlyzeAgentInit) {
    console.log('Agent already initialized');
    return;
  }
  window.convertlyzeAgentInit = true;

  console.log('Convertlyze Agent V2.33 - Badge Position via CSS');

  // ==================== MARKED.JS KONFIGURATION ====================

  if (window.marked) {
    marked.setOptions({
      breaks: true,
      gfm: true,
      headerIds: false,
      mangle: false
    });
  }

  const API_URL = 'https://convertlyze-agent-api-production.up.railway.app';

  let sessionId  = null;
  let userId     = null;
  let analysisId = null;
  let authToken  = null;

  let isExportMode      = false;
  let selectedMessages  = new Set();

  function init() {
    console.log('Initializing agent...');

    const messagesDiv = document.getElementById('messages');
    const userInput   = document.getElementById('user-input');
    const sendButton  = document.getElementById('send-button');
    const loading     = document.getElementById('loading');

    if (!messagesDiv || !userInput || !sendButton) {
      console.error('Missing elements!');
      return;
    }

    // ==================== LOADING / TYPING INDICATOR ====================

    const CVZ_TYPING_INDICATOR_ID = 'cvz-typing-indicator';

    const CVZ_TYPING_SVG =
      '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="12" viewBox="0 0 60 20" fill="none">' +
        '<defs><style>' +
          '@keyframes cvz-dot{0%,80%,100%{transform:scale(0.6);opacity:0.3}40%{transform:scale(1);opacity:1}}' +
          '.cvzd1{animation:cvz-dot 1.2s ease-in-out 0s infinite;transform-origin:10px 10px}' +
          '.cvzd2{animation:cvz-dot 1.2s ease-in-out 0.2s infinite;transform-origin:30px 10px}' +
          '.cvzd3{animation:cvz-dot 1.2s ease-in-out 0.4s infinite;transform-origin:50px 10px}' +
        '</style>' +
        '<filter id="cvz-df2"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
        '</defs>' +
        '<g filter="url(#cvz-df2)">' +
          '<circle class="cvzd1" cx="10" cy="10" r="5" fill="#4fd1c5"/>' +
          '<circle class="cvzd2" cx="30" cy="10" r="5" fill="#4fd1c5"/>' +
          '<circle class="cvzd3" cx="50" cy="10" r="5" fill="#4fd1c5"/>' +
        '</g>' +
      '</svg>';

    function showLoading() {
      const existing = document.getElementById(CVZ_TYPING_INDICATOR_ID);
      if (existing) existing.remove();

      const indicator       = document.createElement('div');
      indicator.id          = CVZ_TYPING_INDICATOR_ID;
      indicator.className   = 'message assistant';
      indicator.style.cssText = 'display:flex;align-items:center;min-height:36px;padding:10px 14px;';
      indicator.innerHTML   = CVZ_TYPING_SVG;

      messagesDiv.appendChild(indicator);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;

      if (loading) loading.style.display = 'none';
    }

    function hideLoading() {
      const indicator = document.getElementById(CVZ_TYPING_INDICATOR_ID);
      if (indicator) indicator.remove();
    }

    // ==================== OWNERSHIP ERROR UI ====================

    function showOwnershipError() {
      sendButton.disabled           = true;
      sendButton.style.opacity      = '0.4';
      sendButton.style.cursor       = 'not-allowed';
      userInput.disabled            = true;
      userInput.placeholder         = 'Kein Zugriff - diese Analyse gehört einem anderen Team-Mitglied.';

      messagesDiv.innerHTML = '';

      const lockSvg =
        '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" style="margin-bottom:12px" aria-hidden="true">' +
          '<rect x="5" y="11" width="14" height="10" rx="2" fill="#9CA3AF"/>' +
          '<path d="M8 11V7a4 4 0 018 0v4" stroke="#9CA3AF" stroke-width="2" stroke-linecap="round"/>' +
        '</svg>';

      const notice = document.createElement('div');
      notice.style.cssText = [
        'text-align:center',
        'padding:32px 20px',
        'color:#6B7280',
        'font-size:14px',
        'line-height:1.7',
        'background:#F9FAFB',
        'border:1px solid #E5E7EB',
        'border-radius:12px',
        'margin:24px 0'
      ].join(';');
      notice.innerHTML =
        lockSvg +
        '<strong style="color:#374151;font-size:16px">Kein Zugriff auf diesen Agent</strong><br><br>' +
        'Der KI-Agent ist nur für den Ersteller der Analyse verfügbar.<br>' +
        'Als Team-Mitglied kannst du die Analyse-Ergebnisse einsehen,<br>' +
        'aber keine eigenen Agent-Nachrichten senden.';
      messagesDiv.appendChild(notice);

      if (window.cvzShowModal) {
        cvzShowModal({
          title: 'Kein Zugriff auf diesen Agent',
          text:  'Der KI-Agent ist nur für den Ersteller der Analyse verfügbar.\n\nAls Team-Mitglied kannst du die Analyse-Ergebnisse einsehen, aber keine eigenen Agent-Nachrichten senden.',
          buttons: [
            {
              label:   'Zum Dashboard',
              primary: true,
              onClick: function() { window.location.href = '/member/dashboard'; }
            }
          ]
        });
      }
    }

    // ==================== NACHRICHTEN-ANZEIGE (GESTUFT) ====================
    // Solange genug Nachrichten da sind, wird NICHTS angezeigt (kein
    // Knappheits-Stress beim Explorieren). Erst wenn es knapp wird, taucht
    // der Hinweis auf und eskaliert farblich: Amber ab <=8, Rot ab <=3.

    function updateCreditsDisplay(remaining) {
      console.log('Updating messages display:', remaining);

      if (remaining === null || remaining === undefined) return;

      const rounded = Math.max(0, Math.round(remaining));

      let creditsEl = document.getElementById('credits-display');
      if (!creditsEl && window.parent && window.parent.document) {
        creditsEl = window.parent.document.getElementById('credits-display');
      }

      // Badge zuverlaessig oben rechts im Chat-Bereich verankern.
      // Unabhaengig vom Webflow-Container-Namen: wir nehmen den Eltern-Container
      // von #messages und stellen sicher, dass er position:relative hat,
      // dann haengen wir das Badge dort oben rechts ein.
      function anchorBadge(el) {
        if (!el) return;
        const messagesDiv = document.getElementById('messages');
        if (!messagesDiv) return;
        // Eltern-Container von #messages (der sichtbare Chat-Kasten)
        const container = messagesDiv.parentElement;
        if (!container) return;

        // Sicherstellen, dass der Container positioniert ist
        const pos = getComputedStyle(container).position;
        if (pos === 'static') {
          container.style.position = 'relative';
        }
        // Badge in diesen Container verschieben, falls noch nicht drin
        if (el.parentElement !== container) {
          container.appendChild(el);
        }
        // Nur Struktur + horizontale Zentrierung im JS.
        // Der vertikale Abstand (top) kommt aus dem CSS per Media-Query,
        // damit Desktop und Mobil getrennt justierbar sind. Wir markieren
        // das Element mit einer Klasse, an die das CSS andockt.
        el.classList.add('cvz-badge-anchored');
        el.style.position  = 'absolute';
        el.style.left      = '50%';
        el.style.right     = 'auto';
        el.style.transform = 'translateX(-50%)';
        el.style.zIndex    = '30';
      }

      function applyCounterState(el) {
        if (!el) return;

        let label = '';
        let textColor = '';
        let bgColor = '';
        let borderColor = '';

        if (rounded <= 0) {
          label = 'Keine Nachrichten übrig';
          textColor = '#f0a0a0'; bgColor = 'rgba(226,75,74,0.12)'; borderColor = 'rgba(226,75,74,0.35)';
        } else if (rounded <= 3) {
          label = rounded + (rounded === 1 ? ' Nachricht übrig' : ' Nachrichten übrig');
          textColor = '#f0a0a0'; bgColor = 'rgba(226,75,74,0.12)'; borderColor = 'rgba(226,75,74,0.35)';
        } else if (rounded <= 8) {
          label = rounded + ' Nachrichten übrig';
          textColor = '#e8b87a'; bgColor = 'rgba(239,159,39,0.12)'; borderColor = 'rgba(239,159,39,0.35)';
        } else {
          // Viel uebrig: sichtbar, aber ruhig (teal, kein Stress)
          label = rounded + ' Nachrichten übrig';
          textColor = '#7ee0d4'; bgColor = 'rgba(79,209,197,0.10)'; borderColor = 'rgba(79,209,197,0.28)';
        }

        // Badge-Optik (kleines Pill mit Punkt)
        el.innerHTML = '<span class="cvz-badge-dot"></span>' + label;
        el.style.cssText = [
          'display:inline-flex',
          'align-items:center',
          'gap:6px',
          'font-size:12px',
          'font-weight:600',
          'padding:4px 10px',
          'border-radius:20px',
          'color:' + textColor,
          'background:' + bgColor,
          'border:1px solid ' + borderColor,
          'visibility:visible',
          'opacity:1',
          'white-space:nowrap'
        ].join(';');

        // Den Punkt im Badge einfaerben
        const dot = el.querySelector('.cvz-badge-dot');
        if (dot) {
          dot.style.cssText = 'width:6px;height:6px;border-radius:50%;background:' + textColor + ';display:inline-block;flex-shrink:0;';
        }
      }

      if (creditsEl) {
        applyCounterState(creditsEl);
        anchorBadge(creditsEl);
      } else {
        console.warn('credits-display not found - creating fallback');
        const creditsBar = document.getElementById('credits-info-bar');
        if (creditsBar) {
          const fallbackEl = document.createElement('div');
          fallbackEl.id    = 'credits-display';
          creditsBar.parentElement.insertBefore(fallbackEl, creditsBar);
          applyCounterState(fallbackEl);
          anchorBadge(fallbackEl);
        }
      }

      // Input/Button-State
      if (rounded <= 0) {
        sendButton.disabled      = true;
        sendButton.style.opacity = '0.4';
        sendButton.style.cursor  = 'not-allowed';
        userInput.disabled       = true;
        userInput.placeholder    = 'Keine Nachrichten mehr verfügbar - bitte upgrade deinen Plan.';
      } else {
        sendButton.disabled      = false;
        sendButton.style.opacity = '';
        sendButton.style.cursor  = '';
        userInput.disabled       = false;
        if (userInput.placeholder === 'Keine Nachrichten mehr verfügbar - bitte upgrade deinen Plan.') {
          userInput.placeholder = 'Stelle deine Frage zur Optimierung...';
        }
      }
    }

    async function loadMessageBalance() {
      try {
        const response = await fetch(API_URL + '/api/agent/messages-remaining', {
          method:  'POST',
          headers: authHeaders(),
          body:    JSON.stringify({ user_id: userId, analysis_id: analysisId })
        });
        if (response.ok) {
          const data = await response.json();
          if (data.messages_remaining !== undefined) updateCreditsDisplay(data.messages_remaining);
        }
      } catch (error) {
        console.error('Messages load error:', error);
      }
    }

    // ==================== INFO-BAR ====================

    function createCreditsBar() {
      if (document.getElementById('credits-info-bar')) return;
      const bar       = document.createElement('div');
      bar.id          = 'credits-info-bar';
      bar.className   = 'credits-info-bar';
      bar.innerHTML   = '<span class="credits-cost-hint">1 Agenten-Antwort pro Anfrage</span>';
      const inputArea = sendButton.parentElement;
      if (inputArea) inputArea.parentElement.insertBefore(bar, inputArea);
    }

    // ==================== EXPORT UI SETUP ====================

    function createExportButton() {
      if (document.getElementById('export-toggle-btn')) return;
      const btn     = document.createElement('button');
      btn.id        = 'export-toggle-btn';
      btn.innerHTML = 'Nachrichten exportieren';
      btn.className = 'export-toggle-btn';
      btn.addEventListener('click', toggleExportMode);
      const inputArea = sendButton.parentElement;
      if (inputArea && inputArea.parentElement) {
        inputArea.parentElement.insertBefore(btn, inputArea.nextSibling);
      } else {
        messagesDiv.parentElement.appendChild(btn);
      }
    }

    function createExportBar() {
      if (document.getElementById('export-bar')) return;

      const bar     = document.createElement('div');
      bar.id        = 'export-bar';
      bar.className = 'export-bar';
      bar.style.display = 'none';
      bar.innerHTML =
        '<div class="export-bar-left">' +
          '<span id="export-count">0 ausgewählt</span>' +
          '<button id="export-select-all" class="export-btn-small">Alle auswählen</button>' +
          '<button id="export-select-agent" class="export-btn-small">Nur Agent</button>' +
          '<label class="export-checkbox-label">' +
            '<input type="checkbox" id="export-include-user" checked>' +
            '<span>Eigene Nachrichten einbeziehen</span>' +
          '</label>' +
        '</div>' +
        '<div class="export-bar-right">' +
          '<button id="export-md-btn" class="export-btn-action">Markdown</button>' +
          '<button id="export-pdf-btn" class="export-btn-action export-btn-primary">PDF</button>' +
          '<button id="export-cancel-btn" class="export-btn-cancel">Abbrechen</button>' +
        '</div>';

      document.body.appendChild(bar);

      document.getElementById('export-select-all').addEventListener('click',    selectAllMessages);
      document.getElementById('export-select-agent').addEventListener('click',  selectAgentOnly);
      document.getElementById('export-md-btn').addEventListener('click',        exportAsMarkdown);
      document.getElementById('export-pdf-btn').addEventListener('click',       exportAsPDF);
      document.getElementById('export-cancel-btn').addEventListener('click',    toggleExportMode);
      document.getElementById('export-include-user').addEventListener('change', updateExportCount);
    }

    // ==================== EXPORT MODE TOGGLE ====================

    function toggleExportMode() {
      isExportMode = !isExportMode;
      const btn = document.getElementById('export-toggle-btn');
      const bar = document.getElementById('export-bar');

      if (isExportMode) {
        btn.innerHTML = 'Abbrechen';
        btn.classList.add('active');
        bar.style.display = 'flex';
        messagesDiv.classList.add('export-mode');

        const messages = messagesDiv.querySelectorAll('.message');
        messages.forEach((msg, index) => {
          if (msg.querySelector('.export-checkbox')) return;

          const checkbox         = document.createElement('input');
          checkbox.type          = 'checkbox';
          checkbox.className     = 'export-checkbox';
          checkbox.dataset.index = index;
          checkbox.addEventListener('change', function() {
            if (this.checked) { selectedMessages.add(index);    msg.classList.add('selected'); }
            else              { selectedMessages.delete(index); msg.classList.remove('selected'); }
            updateExportCount();
          });

          msg.style.position = 'relative';
          msg.insertBefore(checkbox, msg.firstChild);

          msg.addEventListener('click', function(e) {
            if (isExportMode && e.target !== checkbox) {
              checkbox.checked = !checkbox.checked;
              checkbox.dispatchEvent(new Event('change'));
            }
          });
        });

      } else {
        btn.innerHTML = 'Nachrichten exportieren';
        btn.classList.remove('active');
        bar.style.display = 'none';
        messagesDiv.classList.remove('export-mode');
        messagesDiv.querySelectorAll('.export-checkbox').forEach(cb => cb.remove());
        messagesDiv.querySelectorAll('.message.selected').forEach(msg => msg.classList.remove('selected'));
        selectedMessages.clear();
      }
    }

    // ==================== SELECTION HELPERS ====================

    function selectAllMessages() {
      messagesDiv.querySelectorAll('.export-checkbox').forEach(cb => {
        cb.checked = true;
        cb.dispatchEvent(new Event('change'));
      });
    }

    function selectAgentOnly() {
      const messages  = messagesDiv.querySelectorAll('.message');
      const checkboxes = messagesDiv.querySelectorAll('.export-checkbox');
      checkboxes.forEach((cb, index) => {
        const msg  = messages[index];
        cb.checked = !!(msg && msg.classList.contains('assistant'));
        cb.dispatchEvent(new Event('change'));
      });
    }

    function updateExportCount() {
      const includeUser = document.getElementById('export-include-user') ? document.getElementById('export-include-user').checked : true;
      const messages    = messagesDiv.querySelectorAll('.message');
      let count = 0;
      selectedMessages.forEach(index => {
        const msg = messages[index];
        if (msg && (includeUser || msg.classList.contains('assistant'))) count++;
      });
      const countEl = document.getElementById('export-count');
      if (countEl) countEl.textContent = count + ' ausgewählt';
      const mdBtn  = document.getElementById('export-md-btn');
      const pdfBtn = document.getElementById('export-pdf-btn');
      if (mdBtn)  mdBtn.disabled  = count === 0;
      if (pdfBtn) pdfBtn.disabled = count === 0;
    }

    // ==================== EXPORT: COLLECT MESSAGES ====================

    // Wandelt die Hebel-Karten-HTML (cvz-hebel) in saubere Markdown-Zeilen um,
    // damit der Export lesbaren Text statt rohem HTML enthaelt.
    // Wird per DOMParser robust geparst (kein Regex-Gefrickel am HTML).
    function cardsToMarkdown(rawText) {
      if (!rawText || rawText.indexOf('cvz-hebel-wrap') === -1) return rawText;
      try {
        const doc = new DOMParser().parseFromString(rawText, 'text/html');
        const wraps = doc.querySelectorAll('.cvz-hebel-wrap');
        wraps.forEach(wrap => {
          let md = '\n### Deine größten Conversion-Hebel\n';
          wrap.querySelectorAll('.cvz-hebel').forEach((card, idx) => {
            const cat  = (card.querySelector('.cvz-hebel-cat') || {}).textContent || '';
            const prob = (card.querySelector('.cvz-hebel-prob') || {}).textContent || '';
            // cat enthaelt "Hero · kritisch" -> wir trennen sauber
            const catClean = cat.replace(/\s*·\s*(kritisch|wichtig)\s*$/i, '').trim();
            const sevMatch = cat.match(/·\s*(kritisch|wichtig)/i);
            const sev = sevMatch ? sevMatch[1].toLowerCase() : '';
            md += (idx + 1) + '. **' + catClean + '**'
               +  (sev ? ' (' + sev + ')' : '') + ': '
               +  prob.trim() + '\n';
          });
          // Den HTML-Block im Text durch das Markdown ersetzen
          const placeholder = doc.createTextNode(md);
          wrap.parentNode.replaceChild(placeholder, wrap);
        });
        // Restlichen Text (Markdown ausserhalb der Karten) wiederherstellen.
        // body.textContent wuerde Markdown-Sonderzeichen behalten, da der Rest
        // ohnehin Plain-Markdown-Text ist.
        return doc.body.textContent.replace(/\n{3,}/g, '\n\n').trim();
      } catch (e) {
        console.warn('cardsToMarkdown fallback:', e);
        // Fallback: HTML-Tags grob strippen
        return rawText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      }
    }

    function getSelectedContent() {
      const includeUser = document.getElementById('export-include-user') ? document.getElementById('export-include-user').checked : true;
      const messages    = messagesDiv.querySelectorAll('.message');
      const collected   = [];
      selectedMessages.forEach(index => {
        const msg = messages[index];
        if (!msg) return;
        const isUser = msg.classList.contains('user');
        if (isUser && !includeUser) return;

        let rawText = msg.dataset.rawText || msg.textContent.replace(/^[\s\n]+|[\s\n]+$/g, '');
        // Hebel-Karten in lesbares Markdown wandeln (nur Assistant-Nachrichten betroffen)
        rawText = cardsToMarkdown(rawText);
        collected.push({ index, role: isUser ? 'user' : 'assistant', text: rawText });
      });
      collected.sort((a, b) => a.index - b.index);
      return collected;
    }

    // ==================== EXPORT: MARKDOWN ====================

    function exportAsMarkdown() {
      const content = getSelectedContent();
      if (content.length === 0) return;

      const now     = new Date();
      const dateStr = now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const timeStr = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

      let md = '# Convertlyze - Optimierungsprotokoll\n\n';
      md    += '**Datum:** ' + dateStr + ', ' + timeStr + '\n';
      md    += '**Nachrichten:** ' + content.length + '\n\n---\n\n';

      content.forEach(msg => {
        md += msg.role === 'user' ? '### Frage\n\n' : '### Empfehlung\n\n';
        md += msg.text + '\n\n---\n\n';
      });
      md += '\n*Exportiert aus Convertlyze AI-Agent*';

      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const a    = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = 'convertlyze-export-' + now.toISOString().slice(0,10) + '.md';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      showExportFeedback('Markdown exportiert');
    }

    // ==================== EXPORT: PDF ====================

    function exportAsPDF() {
      const content = getSelectedContent();
      if (content.length === 0) return;

      const now     = new Date();
      const dateStr = now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const timeStr = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

      function parseMarkdown(text) {
        const lines    = text.split('\n');
        const segments = [];
        for (const line of lines) {
          const stripped = line.replace(/^\*\*/, '').replace(/\*\*$/, '');
          if      (line.startsWith('## '))        segments.push({ type: 'h2',      text: line.slice(3).trim() });
          else if (line.startsWith('### '))       segments.push({ type: 'h3',      text: line.slice(4).trim() });
          else if (line.trim() === '---')          segments.push({ type: 'hr' });
          else if (stripped.match(/^[-*] /))       segments.push({ type: 'bullet',  text: stripped.slice(2).trim() });
          else if (stripped.match(/^\d+[.:] /)) {
            const m = stripped.match(/^(\d+)[.:] /);
            segments.push({ type: 'numbered', text: stripped.replace(/^\d+[.:] /, '').trim(), num: m[1] });
          }
          else if (line.trim() === '')             segments.push({ type: 'spacer' });
          else if (/^[\u2193\u2195vV]$/.test(line.trim()))  segments.push({ type: 'arrow' });
          else                                     segments.push({ type: 'para',    text: line });
        }
        return segments;
      }

      function sanitize(text) {
        return text
          .replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1')
          .replace(/\u2192/g, '>').replace(/\u2190/g, '<').replace(/\u2191/g, '^').replace(/\u2193/g, 'v')
          .replace(/\u2197/g, '>').replace(/\u2198/g, '>').replace(/\u21d2/g, '=>')
          .replace(/\u2022/g, '-').replace(/\u00b7/g, '-').replace(/\u2026/g, '...')
          .replace(/\u201e/g, '"').replace(/\u201c/g, '"').replace(/\u201d/g, '"')
          .replace(/\u201a/g, "'").replace(/\u2018/g, "'").replace(/\u2019/g, "'")
          .replace(/\u2013/g, '-').replace(/\u2014/g, '-')
          .replace(/[\u2713\u2714\u2611]/g, '+').replace(/[\u2717\u2718\u2612]/g, 'x').replace(/[\u2605\u2606]/g, '*')
          // Umlaute & ß für jsPDF-Helvetica sicher transliterieren (konsistent statt kaputt)
          .replace(/\u00e4/g, 'ae').replace(/\u00f6/g, 'oe').replace(/\u00fc/g, 'ue')
          .replace(/\u00c4/g, 'Ae').replace(/\u00d6/g, 'Oe').replace(/\u00dc/g, 'Ue')
          .replace(/\u00df/g, 'ss')
          .replace(/[^\x00-\x7E]/g, '');
      }

      const LOGO_URL = 'https://cdn.prod.website-files.com/68aa0ecac3a6a586fee94df1/691664f71a064dcad970d70f_convertlyze-ki-b2b-landingpage-analyse.png';

      function buildPDF(logoBase64) {
        try {
          const jsPDF = window.jspdf.jsPDF;
          const doc = new jsPDF({ unit: 'mm', format: 'a4' });

          const PW = 210, PH = 297;
          const ML = 18, MR = 18, MBOT = 18;
          const CW = PW - ML - MR;

          const C = {
            dark:      [31,  41,  55],
            blue:      [59,  130, 246],
            white:     [255, 255, 255],
            textDark:  [17,  24,  39],
            textMid:   [75,  85,  99],
            textLight: [156, 163, 175],
            border:    [229, 231, 235]
          };

          let y = 0;

          function ensureSpace(h) {
            if (y + h > PH - MBOT) {
              doc.addPage();
              y = 0;
              drawRunningHeader();
            }
          }

          function drawRunningHeader() {
            const RH = 18;
            doc.setFillColor.apply(doc, C.dark);
            doc.rect(0, 0, PW, RH, 'F');
            doc.setFillColor.apply(doc, C.blue);
            doc.rect(0, RH, PW, 0.5, 'F');
            if (logoBase64) {
              doc.addImage(logoBase64, 'PNG', ML, 3, 40, 11, undefined, 'FAST');
            } else {
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(10);
              doc.setTextColor.apply(doc, C.white);
              doc.text('Convertlyze', ML, 12);
            }
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor.apply(doc, C.textMid);
            doc.text('Optimierungsprotokoll - KI-Agent', ML, RH + 5);
            y = RH + 12;
          }

          const HEADER_H = 56;
          doc.setFillColor.apply(doc, C.dark);
          doc.rect(0, 0, PW, HEADER_H, 'F');
          doc.setFillColor.apply(doc, C.blue);
          doc.rect(0, HEADER_H - 1, PW, 1, 'F');
          doc.setFillColor.apply(doc, C.blue);
          doc.setGState(new doc.GState({ opacity: 0.08 }));
          doc.rect(PW - 55, 0, 55, HEADER_H, 'F');
          doc.setGState(new doc.GState({ opacity: 0.15 }));
          doc.rect(PW - 30, 0, 30, HEADER_H, 'F');
          doc.setGState(new doc.GState({ opacity: 1.0 }));

          if (logoBase64) {
            doc.addImage(logoBase64, 'PNG', ML + 4, 11, 58, 16, undefined, 'FAST');
            y = 32;
          } else {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(22);
            doc.setTextColor.apply(doc, C.white);
            doc.text('Convertlyze', ML + 4, 26);
            y = 32;
          }

          const countLabel = content.filter(m => m.role === 'assistant').length === content.length
            ? content.length + ' Empfehlung' + (content.length !== 1 ? 'en' : '')
            : content.length + ' Nachricht' + (content.length !== 1 ? 'en' : '');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor.apply(doc, C.blue);
          doc.text('DATUM', ML + 4, y);
          y += 4;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9.5);
          doc.setTextColor.apply(doc, C.white);
          doc.text(dateStr + ', ' + timeStr + ' Uhr', ML + 4, y);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor.apply(doc, C.blue);
          doc.text('UMFANG', ML + 90, y - 4);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9.5);
          doc.setTextColor.apply(doc, C.white);
          doc.text(countLabel, ML + 90, y);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor.apply(doc, C.textMid);
          doc.text('Optimierungsprotokoll - KI-Agent', ML, HEADER_H + 6);
          y = HEADER_H + 13;

          content.forEach((msg, msgIdx) => {
            const isAgent = msg.role === 'assistant';
            ensureSpace(22);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor.apply(doc, C.blue);
            doc.text(isAgent ? 'EMPFEHLUNG' : 'FRAGE', ML, y);
            y += 7;

            const textX    = ML;
            const textW    = CW;
            const segments = parseMarkdown(msg.text);

            segments.forEach(seg => {
              ensureSpace(8);

              if (seg.type === 'spacer') {
                y += 2.5;
              } else if (seg.type === 'arrow') {
                ensureSpace(7);
                y += 1;
                doc.setFillColor.apply(doc, C.blue);
                const ax = textX + 5;
                const ay = y;
                doc.triangle(ax - 2.5, ay - 3, ax + 2.5, ay - 3, ax, ay, 'F');
                y += 5;
              } else if (seg.type === 'hr') {
                y += 1;
                doc.setDrawColor.apply(doc, C.border);
                doc.setLineWidth(0.2);
                doc.line(textX, y, textX + textW, y);
                y += 5;
              } else if (seg.type === 'h2') {
                y += 3;
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10.5);
                doc.setTextColor.apply(doc, C.blue);
                const h2Lines = doc.splitTextToSize(sanitize(seg.text), textW);
                h2Lines.forEach(line => { ensureSpace(7); doc.text(line, textX, y); y += 6; });
                y += 2;
              } else if (seg.type === 'h3') {
                y += 3;
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9.5);
                doc.setTextColor.apply(doc, C.textDark);
                const h3Lines = doc.splitTextToSize(sanitize(seg.text), textW);
                h3Lines.forEach(line => { ensureSpace(6); doc.text(line, textX, y); y += 5.5; });
                y += 2;
              } else if (seg.type === 'bullet') {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor.apply(doc, C.textDark);
                const bLines = doc.splitTextToSize(sanitize(seg.text), textW - 10);
                bLines.forEach(line => {
                  ensureSpace(5);
                  doc.setFillColor.apply(doc, C.blue);
                  doc.circle(textX + 5.5, y - 1.5, 0.7, 'F');
                  doc.setFont('helvetica', 'normal');
                  doc.setFontSize(9);
                  doc.setTextColor.apply(doc, C.textDark);
                  doc.text(line, textX + 9, y);
                  y += 4.8;
                });
                y += 0.5;
              } else if (seg.type === 'numbered') {
                y += 1;
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.setTextColor.apply(doc, C.blue);
                doc.text(seg.num + '.', textX, y);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor.apply(doc, C.textDark);
                const nLines = doc.splitTextToSize(sanitize(seg.text), textW - 8);
                nLines.forEach((line, li) => {
                  ensureSpace(5);
                  doc.text(line, textX + 7, y);
                  y += li < nLines.length - 1 ? 4.5 : 5;
                });
              } else {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor.apply(doc, C.textDark);
                const pLines = doc.splitTextToSize(sanitize(seg.text), textW);
                pLines.forEach(line => { ensureSpace(5); doc.text(line, textX, y); y += 4.8; });
              }
            });

            y += 4;

            if (msgIdx < content.length - 1) {
              ensureSpace(5);
              doc.setDrawColor.apply(doc, C.border);
              doc.setLineWidth(0.2);
              doc.line(ML, y, PW - MR, y);
              y += 8;
            }
          });

          const totalPages = doc.internal.getNumberOfPages();
          for (let p = 1; p <= totalPages; p++) {
            doc.setPage(p);
            doc.setDrawColor.apply(doc, C.border);
            doc.setLineWidth(0.3);
            doc.line(ML, PH - 11, PW - MR, PH - 11);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor.apply(doc, C.textLight);
            doc.text('Erstellt mit Convertlyze AI-Agent  -  convertlyze.com', ML, PH - 5);
            if (totalPages > 1) doc.text(p + ' / ' + totalPages, PW - MR, PH - 5, { align: 'right' });
          }

          doc.save('convertlyze-optimierung-' + now.toISOString().slice(0,10) + '.pdf');
          showExportFeedback('PDF exportiert');

        } catch (err) {
          console.error('PDF export error:', err);
          showExportFeedback('PDF-Export fehlgeschlagen');
        }
      }

      const img        = new Image();
      img.crossOrigin  = 'anonymous';
      img.onload = function() {
        try {
          const canvas  = document.createElement('canvas');
          canvas.width  = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx     = canvas.getContext('2d');
          ctx.fillStyle = '#1f2937';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          buildPDF(canvas.toDataURL('image/png'));
        } catch(e) {
          console.warn('Logo canvas error:', e.message);
          buildPDF(null);
        }
      };
      img.onerror = function() { console.warn('Logo fallback'); buildPDF(null); };
      img.src = LOGO_URL;
    }

    // ==================== EXPORT FEEDBACK ====================

    function showExportFeedback(text) {
      const existing = document.getElementById('export-feedback');
      if (existing) existing.remove();
      const toast       = document.createElement('div');
      toast.id          = 'export-feedback';
      toast.className   = 'export-feedback';
      toast.textContent = text;
      document.body.appendChild(toast);
      requestAnimationFrame(() => toast.classList.add('visible'));
      setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
      }, 2500);
    }

    // ==================== CHAT FUNCTIONS ====================

    function addMessage(text, role) {
      const div       = document.createElement('div');
      div.className   = 'message ' + role;
      div.dataset.rawText = text;

      if (role === 'assistant' && window.marked) {
        div.innerHTML = marked.parse(text);
      } else {
        div.textContent = text;
      }

      messagesDiv.appendChild(div);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;

      if (isExportMode) {
        const index        = messagesDiv.querySelectorAll('.message').length - 1;
        const checkbox     = document.createElement('input');
        checkbox.type      = 'checkbox';
        checkbox.className = 'export-checkbox';
        checkbox.dataset.index = index;
        checkbox.addEventListener('change', function() {
          if (this.checked) { selectedMessages.add(index);    div.classList.add('selected'); }
          else              { selectedMessages.delete(index); div.classList.remove('selected'); }
          updateExportCount();
        });
        div.style.position = 'relative';
        div.insertBefore(checkbox, div.firstChild);
      }
    }

    function getAnalysisId() {
      return new URLSearchParams(window.location.search).get('analysis_id');
    }

    function authHeaders() {
      return {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + authToken
      };
    }

    async function getMemberstackUser() {
      if (!window.$memberstackDom) throw new Error('Memberstack not loaded');
      const member = await window.$memberstackDom.getCurrentMember();
      if (!member || !member.data) throw new Error('Not logged in');
      return {
        id:    member.data.id,
        email: (member.data.auth && member.data.auth.email) || (member.data.customFields && member.data.customFields.email) || 'unknown@convertlyze.com',
        name:  (member.data.customFields && (member.data.customFields.name || member.data.customFields['full-name'])) || 'User'
      };
    }

    async function ensureUserExists(memberstackUser) {
      try {
        const response = await fetch(API_URL + '/api/user/get-by-memberstack', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ memberstack_id: memberstackUser.id })
        });
        if (response.ok) {
          const data = await response.json();
          if (data.user_id) return data.user_id;
        }
        const createResponse = await fetch(API_URL + '/api/user/create', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            memberstack_id: memberstackUser.id,
            email:          memberstackUser.email,
            full_name:      memberstackUser.name,
            plan_type:      'starter',
            credits_limit:  100,
            plan_price:     97.00,
            license_type:   'professional',
            license_status: 'active'
          })
        });
        if (!createResponse.ok) {
          const error = await createResponse.json();
          throw new Error('User creation failed: ' + (error.error || 'Unknown error'));
        }
        const createData = await createResponse.json();
        return createData.user_id;
      } catch (error) {
        console.error('User lookup/creation error:', error);
        throw error;
      }
    }

    async function startSession() {
      try {
        showLoading();

        analysisId = getAnalysisId();
        if (!analysisId) throw new Error('Keine Analysis ID in URL - bitte öffne den Agent über die Analyse-Seite');

        const memberstackUser = await getMemberstackUser();
        authToken             = memberstackUser.id;
        userId                = await ensureUserExists(memberstackUser);

        const response = await fetch(API_URL + '/api/agent/start-session', {
          method:  'POST',
          headers: authHeaders(),
          body:    JSON.stringify({ user_id: userId, analysis_id: analysisId })
        });

        if (response.status === 403) {
          const errorData = await response.json().catch(() => ({}));
          hideLoading();
          if (errorData.error_code === 'NOT_ANALYSIS_OWNER') {
            showOwnershipError();
            return;
          }
          throw new Error('Zugriff verweigert');
        }

        if (!response.ok) {
          const error = await response.json();
          if (response.status === 401) throw new Error('Authentifizierung fehlgeschlagen - bitte neu einloggen');
          throw new Error(error.error || 'Session start failed');
        }

        const data = await response.json();
        sessionId  = data.session_id;

        hideLoading();

        if (data.existing && data.history && Array.isArray(data.history) && data.history.length > 0) {
          messagesDiv.innerHTML = '';
          const infoDiv         = document.createElement('div');
          infoDiv.style.cssText = 'text-align: center; color: #6B7280; font-size: 14px; margin: 10px 0; padding: 10px; background: #F3F4F6; border-radius: 8px;';
          const date            = new Date(data.history[0].created_at).toLocaleDateString('de-DE', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
          });
          infoDiv.textContent = 'Fortgesetzter Chat vom ' + date + ' (' + data.history.length + ' Nachrichten)';
          messagesDiv.appendChild(infoDiv);
          data.history.forEach(msg => {
            if (msg && msg.content && msg.role) addMessage(msg.content, msg.role);
          });
          setTimeout(() => { messagesDiv.scrollTop = 0; }, 100);
        } else {
          if (data.message) addMessage(data.message, 'assistant');
        }

        if (data.messages_remaining !== undefined) {
          updateCreditsDisplay(data.messages_remaining);
        } else {
          await loadMessageBalance();
        }

        createCreditsBar();
        createExportButton();
        createExportBar();

      } catch (error) {
        console.error('Start session error:', error);
        hideLoading();
        let errorMessage = 'Fehler beim Starten des Agents';
        if (error.message.includes('Not logged in') || error.message.includes('Authentifizierung')) {
          errorMessage = 'Bitte melde dich an um den AI-Agent zu nutzen';
          setTimeout(() => { window.location.href = '/login'; }, 2000);
        } else if (error.message.includes('Analysis ID')) {
          errorMessage = error.message;
        } else if (error.message.includes('User creation failed')) {
          errorMessage = 'Fehler beim Erstellen deines Accounts. Bitte kontaktiere den Support.';
        } else {
          errorMessage += ': ' + error.message;
        }
        addMessage(errorMessage, 'assistant');
      }
    }

    async function sendMessage() {
      const message = userInput.value.trim();
      if (!message)          return;
      if (sendButton.disabled) return;

      if (!sessionId || !userId) {
        addMessage('Session nicht aktiv - bitte Seite neu laden', 'assistant');
        return;
      }
      if (!authToken) {
        addMessage('Nicht authentifiziert - bitte Seite neu laden', 'assistant');
        return;
      }
      if (isExportMode) toggleExportMode();

      addMessage(message, 'user');
      userInput.value = '';
      showLoading();
      setTimeout(() => { messagesDiv.scrollTop = messagesDiv.scrollHeight; }, 50);

      try {
        const response = await fetch(API_URL + '/api/agent/chat', {
          method:  'POST',
          headers: authHeaders(),
          body:    JSON.stringify({ user_id: userId, session_id: sessionId, message: message })
        });

        if (response.status === 403) {
          const errorData = await response.json().catch(() => ({}));
          hideLoading();
          if (errorData.error_code === 'NOT_ANALYSIS_OWNER') {
            showOwnershipError();
            return;
          }
          throw new Error('Zugriff verweigert');
        }

        if (!response.ok) {
          const error = await response.json();
          if (response.status === 401) throw new Error('Sitzung abgelaufen - bitte Seite neu laden');
          if (error.error && (error.error.includes('limit') || error.error.includes('Credits'))) {
            throw new Error('Dein Nachrichten-Limit ist erreicht. Bitte upgrade deinen Plan.');
          }
          throw new Error(error.error || 'Nachricht konnte nicht gesendet werden');
        }

        const data = await response.json();
        hideLoading();
        addMessage(data.message, 'assistant');

        if (data.messages_remaining !== undefined) {
          updateCreditsDisplay(Math.round(data.messages_remaining));
        } else {
          await loadMessageBalance();
        }

        setTimeout(() => { messagesDiv.scrollTop = messagesDiv.scrollHeight; }, 100);

      } catch (error) {
        console.error('Send message error:', error);
        hideLoading();
        addMessage(error.message, 'assistant');
      }
    }

    // Event Listeners
    sendButton.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && isExportMode) toggleExportMode();
    });

    if (window.$memberstackDom) {
      startSession();
    } else {
      window.addEventListener('memberstack:loaded', () => startSession());
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 500);
  }
})();
