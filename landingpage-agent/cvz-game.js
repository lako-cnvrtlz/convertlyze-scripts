/* ============================================================================
   CONVERTLYZE HEADLINE-DUELL - cvz-game.js
   Kleines Spiel für Wartezeiten (Aufbau-Tool, später Kurz-Check).

   Zwei Formulierungen stehen nebeneinander, der Nutzer tippt auf die stärkere
   und bekommt sofort eine Erklärung in einem Satz. Die Kriterien sind dieselben,
   nach denen Convertlyze Seiten baut und bewertet. Das Spiel erklärt also
   nebenbei den Ansatz des Tools.

   EINBINDEN (im Webflow-Embed VOR app.js laden):
     <script src="https://cdn.jsdelivr.net/gh/lako-cnvrtlz/convertlyze-scripts@<commit>/cvz-game.js"></script>

   NUTZEN:
     CVZGame.mount(containerElement, {
       set: 'landingpage' | 'pillar' | 'ai',   // Fragenset
       rounds: 10,                             // Runden pro Durchgang
       prepHint: { afterMs: 180000, text: '…' } // optional: Hinweis nach X ms
     });
     CVZGame.unmount();                        // z.B. wenn das Ergebnis da ist

   Die Datei bringt ihr eigenes CSS mit (unter .cvz-game gescoped) und nutzt
   die --cvz-*-Variablen aus style.css, falls vorhanden, sonst eigene Werte.
   Kein Netzwerkzugriff, keine Abhängigkeiten. localStorage nur für
   "Spiel ausgeblendet" und bereits gespielte Fragen, alles in try/catch.
   ============================================================================ */
(function () {
  'use strict';

  // ==================== FRAGEN ====================
  // better: welche Seite stärker ist. why: Erklärung in einem Satz, ohne Fachjargon.
  var SETS = {
    landingpage: {
      title: 'Headline-Duell',
      question: 'Welche Headline überzeugt eher?',
      items: [
        { a: 'Innovative Software für Ihre Buchhaltung', b: 'Monatsabschluss in 3 statt 8 Tagen', better: 'b', why: 'Rechts steht ein Ergebnis, das man sich vorstellen kann. „Innovativ“ behauptet jeder.' },
        { a: 'Rechnungen automatisch erfassen und freigeben', b: 'Die Komplettlösung für modernes Finanzmanagement', better: 'a', why: 'Links weiß man sofort, was das Produkt tut. „Komplettlösung“ sagt nichts darüber.' },
        { a: 'Wir sind Ihr Partner für die digitale Transformation', b: 'SAP S/4HANA-Migration ohne Stillstand im Lager', better: 'b', why: 'Rechts sind Thema und Sorge der Zielgruppe benannt. Links passt auf jede IT-Firma.' },
        { a: 'Recruiting-Software für Handwerksbetriebe', b: 'Recruiting-Software für Unternehmen jeder Größe', better: 'a', why: 'Wer sich angesprochen fühlt, bleibt. „Jeder Größe“ meint niemanden.' },
        { a: 'ISO 27001 zertifiziert', b: 'Besteht jede IT-Sicherheitsprüfung ohne Nacharbeit', better: 'b', why: 'Das Zertifikat ist die Ursache, die bestandene Prüfung die Folge, die den Käufer interessiert.' },
        { a: 'Schluss mit Excel-Chaos in der Einsatzplanung', b: 'Einsatzplanung neu gedacht', better: 'a', why: 'Links beschreibt ein Problem, das der Leser kennt. „Neu gedacht“ ist eine leere Formel.' },
        { a: 'Mehr Leads aus derselben Anzeige', b: 'Landingpages, die begeistern', better: 'a', why: 'Begeisterung ist kein Ziel im Marketing-Budget, mehr Leads schon.' },
        { a: 'Ihr Server-Ausfall kostet Sie jede Stunde Umsatz', b: 'Hochverfügbare Infrastruktur auf höchstem Niveau', better: 'a', why: 'Links macht die Konsequenz greifbar. „Höchstes Niveau“ kann niemand prüfen.' },
        { a: 'Zeiterfassung, die Ihr Team wirklich nutzt', b: 'Zeiterfassung mit über 50 Funktionen', better: 'a', why: 'Funktionsmenge ist selten der Kaufgrund. Dass das Team mitzieht, schon.' },
        { a: 'Steuerberatung für Gründer in Hamburg', b: 'Ihre Steuerberatung mit Herz und Verstand', better: 'a', why: 'Zielgruppe und Ort helfen bei der Entscheidung. „Herz und Verstand“ hilft niemandem beim Vergleichen.' },
        { a: 'Datenschutz, auf den Sie sich verlassen können', b: 'Hosting in Frankfurt, Auftragsverarbeitungsvertrag inklusive', better: 'b', why: 'Rechts steht der Beleg, links nur das Versprechen. Im DACH-B2B zählt der Beleg.' },
        { a: 'Angebote in 10 Minuten statt 2 Stunden', b: 'Angebotserstellung leicht gemacht', better: 'a', why: 'Eine konkrete Zeitersparnis ist nachprüfbar, „leicht gemacht“ nicht.' },
        { a: 'Die führende Plattform für Facility Management', b: 'Wartungstermine, die niemand mehr vergisst', better: 'b', why: '„Führend“ braucht einen Beleg. Rechts steht ein Nutzen, den man sofort versteht.' },
        { a: 'Weniger Retouren durch passende Größenberatung', b: 'KI-gestützte Größenberatung der nächsten Generation', better: 'a', why: 'Die Technik ist Mittel zum Zweck. Weniger Retouren ist der Zweck.' },
        { a: 'Lohnabrechnung für 50 bis 500 Mitarbeitende', b: 'Lohnabrechnung, die einfach funktioniert', better: 'a', why: 'Die Größenangabe lässt den Leser sofort prüfen, ob das Angebot für ihn passt.' },
        { a: 'Starten Sie jetzt Ihre digitale Reise', b: 'In 14 Tagen live, ohne eigenes IT-Team', better: 'b', why: 'Rechts sind die zwei häufigsten Einwände beantwortet: Dauer und Aufwand.' },
        { a: 'Agentur für ganzheitliches Marketing', b: 'Google Ads für Online-Shops mit kleinem Budget', better: 'b', why: 'Spezialisierung schafft Vertrauen. „Ganzheitlich“ klingt nach allem und nichts.' },
        { a: 'Ausfallsichere Telefonie für Arztpraxen', b: 'Moderne Cloud-Telefonie für alle', better: 'a', why: 'Arztpraxen erkennen sich wieder, und „ausfallsicher“ trifft ihre größte Sorge.' },
        { a: 'Entdecken Sie unsere Lösungen', b: 'Finden Sie heraus, ob sich der Umstieg rechnet', better: 'b', why: 'Rechts steht ein konkreter Grund weiterzulesen. Links nur eine Aufforderung ohne Nutzen.' },
        { a: 'Kein Nachfassen mehr bei fehlenden Belegen', b: 'Intelligentes Belegmanagement', better: 'a', why: 'Links nennt die lästige Aufgabe, die wegfällt. „Intelligent“ ist ein Füllwort.' },
        { a: 'Vertrauen Sie dem Marktführer', b: 'Von 1.200 Kanzleien täglich genutzt', better: 'b', why: 'Eine Zahl ist ein Beleg, „Marktführer“ eine Behauptung. (Die Zahl muss natürlich stimmen.)' },
        { a: 'Weiterbildung, die in den Arbeitsalltag passt: 15 Minuten am Tag', b: 'Lernen neu erleben mit unserer Plattform', better: 'a', why: 'Links beantwortet den Haupteinwand „keine Zeit“ direkt.' },
        { a: 'Wir bieten maßgeschneiderte Lösungen', b: 'Lagerverwaltung für Betriebe mit wechselnden Saisonwaren', better: 'b', why: 'Rechts ist klar, für wen und wofür. „Maßgeschneidert“ sagt jede Agentur.' },
        { a: 'Bewerbungen in einem Postfach statt in fünf', b: 'All-in-One-Bewerbermanagement', better: 'a', why: 'Links beschreibt den Unterschied im Alltag, rechts nur eine Produktkategorie.' },
        { a: 'Versicherung für Freelancer, monatlich kündbar', b: 'Sicherheit für Ihre Zukunft', better: 'a', why: 'Zielgruppe plus Risikoumkehr. Links kann man sofort einordnen.' },
        { a: 'Energiekosten senken mit Lastspitzen-Analyse', b: 'Nachhaltigkeit beginnt bei uns', better: 'a', why: 'Links verbindet Ergebnis und Methode. Rechts ist ein Slogan ohne Angebot.' },
        { a: 'Endlich wieder Überblick über alle Projekte', b: 'Projektmanagement-Software mit Gantt, Kanban und Zeiterfassung', better: 'a', why: 'Das Gefühl, das der Käufer haben will, schlägt die Funktionsliste. Die gehört weiter nach unten.' },
        { a: 'Die beste Lösung für Ihr Unternehmen', b: 'Für IT-Leiter, die SAP ECC bis 2027 ablösen müssen', better: 'b', why: 'Rechts trifft Rolle, Thema und Frist. Wer sich darin erkennt, liest weiter.' },
        { a: 'Fehlerfreie Inventur in einem Tag', b: 'Inventur einfach digital', better: 'a', why: 'Zwei konkrete Ergebnisse gegen ein vages Adjektiv.' },
        { a: 'Mehr Zeit für das Wesentliche', b: 'Dienstpläne in 10 Minuten statt einem halben Tag', better: 'b', why: '„Das Wesentliche“ steht auf tausend Seiten. Rechts steht, wie viel Zeit es wirklich bringt.' },
      ],
    },
    pillar: {
      title: 'Überschriften-Duell',
      question: 'Welche Kapitelüberschrift hilft dem Leser mehr?',
      items: [
        { a: 'Grundlagen', b: 'Was ist eine SAP S/4HANA-Migration?', better: 'b', why: 'Als Frage formuliert trifft die Überschrift genau das, was Leute suchen und KI-Antworten zitieren.' },
        { a: 'Was kostet eine Migration?', b: 'Kostenaspekte', better: 'a', why: 'Die Frage verspricht eine Antwort. „Kostenaspekte“ verspricht nur ein Thema.' },
        { a: 'Greenfield oder Brownfield: Welcher Weg passt zu wem?', b: 'Migrationsstrategien im Überblick', better: 'a', why: 'Links nennt die konkrete Entscheidung, vor der der Leser steht.' },
        { a: 'Fazit', b: 'Wann sich der Umstieg lohnt und wann nicht', better: 'b', why: 'Auch der Abschluss sollte etwas Konkretes versprechen. „Fazit“ überspringt man.' },
        { a: 'Die 5 häufigsten Fehler bei der Einführung', b: 'Herausforderungen', better: 'a', why: 'Konkret und zählbar. Leser wissen, was sie bekommen.' },
        { a: 'Wie lange dauert ein Projekt?', b: 'Zeitlicher Rahmen', better: 'a', why: 'Die Frage entspricht der Suchanfrage. Das ist gut für Google und für KI-Antworten.' },
        { a: 'Weitere Informationen', b: 'Welche Förderprogramme es dafür gibt', better: 'b', why: '„Weitere Informationen“ ist ein Platzhalter, keine Überschrift.' },
        { a: 'Vor- und Nachteile im Vergleich', b: 'Ein Blick auf verschiedene Perspektiven', better: 'a', why: 'Links weiß der Leser, dass er hier abwägen kann. Rechts ist es vage.' },
        { a: 'Checkliste: Sind Sie bereit für die Umstellung?', b: 'Vorbereitung', better: 'a', why: 'Eine Checkliste ist ein klarer Mehrwert, den man sich merkt und teilt.' },
        { a: 'Rechtliche Rahmenbedingungen', b: 'Was die E-Rechnungspflicht ab 2025 für Sie bedeutet', better: 'b', why: 'Rechts sind Thema, Zeitpunkt und Betroffenheit genannt.' },
        { a: 'Beispiel aus der Praxis: Ein Maschinenbauer mit 300 Mitarbeitern', b: 'Praxisbeispiele', better: 'a', why: 'Ein konkreter Fall wirkt glaubwürdiger als eine Sammelüberschrift.' },
        { a: 'Worauf Sie bei der Anbieterauswahl achten sollten', b: 'Die richtige Wahl treffen', better: 'a', why: 'Links benennt die Aufgabe, rechts nur das Ziel ohne Inhalt.' },
        { a: 'Ausblick', b: 'Wie sich das Thema bis 2030 entwickelt', better: 'b', why: 'Ein konkreter Zeitraum macht neugierig, „Ausblick“ nicht.' },
        { a: 'Lohnt sich die Investition für kleine Betriebe?', b: 'Wirtschaftlichkeit', better: 'a', why: 'Die Frage holt eine bestimmte Lesergruppe direkt ab.' },
        { a: 'Schritt für Schritt zur Einführung', b: 'Implementierung', better: 'a', why: 'Der Leser weiß, dass er eine Anleitung bekommt.' },
        { a: 'Typische Einwände und was dahintersteckt', b: 'Häufige Missverständnisse über Cloud-ERP', better: 'b', why: 'Rechts ist das Thema genannt. Ohne Thema ist eine Überschrift im Inhaltsverzeichnis wertlos.' },
        { a: 'Was die KI hier kann und was nicht', b: 'KI im Fokus', better: 'a', why: 'Ehrlich und konkret. „Im Fokus“ sagt nichts aus.' },
      ],
    },
    ai: {
      title: 'Zitier-Duell',
      question: 'Welchen Satz würde eine KI eher zitieren?',
      items: [
        { a: 'Wir sind ein innovatives Unternehmen mit langjähriger Erfahrung.', b: 'Die Muster GmbH entwickelt seit 2009 Zeiterfassung für Handwerksbetriebe in Deutschland.', better: 'b', why: 'Wer, was, für wen, seit wann: Daraus kann eine KI eine Antwort bauen. Links ist austauschbar.' },
        { a: 'Eine E-Rechnung ist eine Rechnung in einem strukturierten Datenformat, das Software automatisch auslesen kann.', b: 'E-Rechnungen sind ein spannendes Thema, das viele Unternehmen beschäftigt.', better: 'a', why: 'Eine klare Definition in einem Satz ist genau das, was KI-Antworten übernehmen.' },
        { a: 'Unsere Kunden lieben uns.', b: 'Über 400 Kanzleien in Deutschland nutzen die Software für die Mandantenkommunikation.', better: 'b', why: 'Zahlen mit Bezug sind zitierbar. Gefühle ohne Beleg nicht.' },
        { a: 'Die Einführung dauert in der Regel 2 bis 4 Wochen und braucht kein eigenes IT-Team.', b: 'Die Einführung ist schnell und unkompliziert.', better: 'a', why: 'Wer fragt „Wie lange dauert das?“, bekommt links eine Antwort.' },
        { a: 'Mehr erfahren Sie in unserem Beratungsgespräch.', b: 'Der Preis richtet sich nach der Zahl der Nutzer und beginnt bei 9 € pro Monat.', better: 'b', why: 'Preisfragen sind häufige KI-Prompts. Wer keine Antwort gibt, wird nicht zitiert.' },
        { a: 'Im Vergleich zu Excel entfällt das manuelle Zusammenführen der Stundenzettel.', b: 'Wir sind besser als die Konkurrenz.', better: 'a', why: 'Ein konkreter Vergleichspunkt ist überprüfbar und zitierfähig.' },
        { a: 'Lösungen für alle Branchen.', b: 'Die Software richtet sich an Logistikunternehmen mit eigenem Fuhrpark ab 20 Fahrzeugen.', better: 'b', why: 'KI-Antworten empfehlen Anbieter für konkrete Situationen. Dafür muss die Situation auf der Seite stehen.' },
        { a: 'Die Daten liegen in einem Rechenzentrum in Frankfurt am Main.', b: 'Datenschutz hat bei uns höchste Priorität.', better: 'a', why: 'Ein prüfbarer Fakt beantwortet die DSGVO-Frage, ein Versprechen nicht.' },
        { a: 'Ganzheitliche Beratung aus einer Hand.', b: 'Wir begleiten SAP-Migrationen von der Analyse bis zum Go-live, Schwerpunkt Fertigungsindustrie.', better: 'b', why: 'Leistung, Umfang und Schwerpunkt sind benannt. Daraus wird eine Empfehlung.' },
        { a: 'Für wen eignet sich das? Für Teams ab 10 Personen, die Urlaubsanträge noch per Mail abwickeln.', b: 'Für jeden, der effizienter arbeiten möchte.', better: 'a', why: 'Frage plus klare Antwort ist das ideale Format für KI-Suche.' },
        { a: 'Die Software ist nicht geeignet für Unternehmen, die Lohnabrechnung in mehreren Ländern brauchen.', b: 'Die Software passt für jeden Bedarf.', better: 'a', why: 'Ehrliche Grenzen machen eine Quelle glaubwürdig, auch für KI.' },
        { a: 'Erfahren Sie, warum wir anders sind.', b: 'Anders als Zeiterfassungs-Apps erfasst das System auch Material und Fahrten pro Auftrag.', better: 'b', why: 'Der Unterschied steht direkt im Satz, statt nur angekündigt zu werden.' },
        { a: 'Testen Sie jetzt kostenlos!', b: 'Die Testphase dauert 14 Tage, eine Kreditkarte ist nicht nötig.', better: 'b', why: 'Fakten zur Testphase beantworten Fragen. Ein Ausrufezeichen beantwortet keine.' },
        { a: 'Laut einer Umfrage von 2025 nutzen 61 % der befragten Betriebe noch Papierformulare.', b: 'Viele Betriebe arbeiten noch mit Papier.', better: 'a', why: 'Mit Quelle und Zahl wird ein Satz zur zitierbaren Aussage. (Nur mit echter Quelle!)' },
        { a: 'Wir freuen uns auf Ihre Anfrage.', b: 'Nach der Anfrage meldet sich innerhalb eines Werktags eine Ansprechpartnerin aus dem Vertrieb.', better: 'b', why: 'Ablauf und Reaktionszeit sind konkrete, oft gefragte Informationen.' },
        { a: 'Die Schnittstelle zu DATEV überträgt Buchungen täglich automatisch.', b: 'Zahlreiche Integrationen sorgen für einen reibungslosen Ablauf.', better: 'a', why: 'Benannte Integrationen tauchen in KI-Antworten auf, „zahlreiche“ nicht.' },
      ],
    },
  };

  var STYLE_ID = 'cvz-game-style';
  var CSS = [
    '.cvz-game{--g-bg:var(--cvz-bg,#0d1117);--g-card:var(--cvz-bg-elevated,#161b22);--g-border:var(--cvz-border,#30363d);--g-text:var(--cvz-text,#e6edf3);--g-muted:var(--cvz-text-muted,#8b949e);--g-accent:var(--cvz-teal,#4fd1c5);--g-accent-dim:var(--cvz-teal-dim,rgba(79,209,197,.12));--g-bad:var(--cvz-danger,#f87171);',
    'box-sizing:border-box;text-align:left;margin:28px auto 0;max-width:720px;color:var(--g-text);font-family:inherit;}',
    '.cvz-game *,.cvz-game *::before,.cvz-game *::after{box-sizing:border-box;}',
    '.cvz-game .cvz-game-panel{background:var(--g-card);border:1px solid var(--g-border);padding:18px 20px;}',
    '.cvz-game .cvz-game-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 4px;}',
    '.cvz-game .cvz-game-title{font-weight:700;font-size:1rem;color:var(--g-text);margin:0;}',
    '.cvz-game .cvz-game-score{font-size:.8rem;color:var(--g-muted);font-variant-numeric:tabular-nums;}',
    '.cvz-game .cvz-game-q{font-size:.88rem;color:var(--g-muted);margin:0 0 14px;}',
    '.cvz-game .cvz-game-options{display:grid;grid-template-columns:1fr 1fr;gap:10px;}',
    '@media (max-width:600px){.cvz-game .cvz-game-options{grid-template-columns:1fr;}.cvz-game .cvz-game-panel{padding:14px;}}',
    '.cvz-game button.cvz-game-opt{all:unset;box-sizing:border-box;display:block;cursor:pointer;background:var(--g-bg);border:1px solid var(--g-border);padding:16px;font-size:1rem;line-height:1.4;font-weight:600;color:var(--g-text);min-height:76px;transition:border-color .15s ease,background .15s ease;}',
    '.cvz-game button.cvz-game-opt:hover:not([disabled]){border-color:var(--g-accent);}',
    '.cvz-game button.cvz-game-opt:focus-visible{outline:2px solid var(--g-accent);outline-offset:2px;}',
    '.cvz-game button.cvz-game-opt[disabled]{cursor:default;}',
    '.cvz-game button.cvz-game-opt.is-right{border-color:var(--g-accent);background:var(--g-accent-dim);}',
    '.cvz-game button.cvz-game-opt.is-wrong{border-color:var(--g-bad);opacity:.75;}',
    '.cvz-game button.cvz-game-opt.is-dim{opacity:.55;}',
    '.cvz-game .cvz-game-tag{display:block;font-size:.68rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-top:10px;}',
    '.cvz-game .is-right .cvz-game-tag{color:var(--g-accent);}',
    '.cvz-game .is-wrong .cvz-game-tag{color:var(--g-bad);}',
    '.cvz-game .cvz-game-feedback{margin:14px 0 0;font-size:.9rem;line-height:1.5;color:var(--g-text);min-height:1.5em;}',
    '.cvz-game .cvz-game-feedback strong{color:var(--g-accent);}',
    '.cvz-game .cvz-game-feedback strong.bad{color:var(--g-bad);}',
    '.cvz-game .cvz-game-actions{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:14px;flex-wrap:wrap;}',
    '.cvz-game button.cvz-game-next{all:unset;box-sizing:border-box;cursor:pointer;background:var(--g-accent);color:var(--g-bg);font-weight:600;font-size:.9rem;padding:10px 20px;}',
    '.cvz-game button.cvz-game-next:focus-visible{outline:2px solid var(--g-text);outline-offset:2px;}',
    '.cvz-game button.cvz-game-link{all:unset;cursor:pointer;font-size:.78rem;color:var(--g-muted);text-decoration:underline;}',
    '.cvz-game button.cvz-game-link:hover{color:var(--g-accent);}',
    '.cvz-game .cvz-game-progress{height:2px;background:var(--g-border);margin:12px 0 0;}',
    '.cvz-game .cvz-game-progress span{display:block;height:100%;background:var(--g-accent);transition:width .3s ease;}',
    '.cvz-game .cvz-game-end p{margin:0 0 10px;font-size:.92rem;line-height:1.5;color:var(--g-text);}',
    '.cvz-game .cvz-game-big{font-size:1.6rem;font-weight:700;color:var(--g-accent);margin:0 0 6px;}',
    '.cvz-game .cvz-game-hint{margin-top:12px;border:1px solid var(--g-border);border-left:3px solid var(--g-accent);background:var(--g-bg);padding:12px 14px;font-size:.85rem;line-height:1.5;color:var(--g-text);}',
    '.cvz-game .cvz-game-collapsed{display:flex;justify-content:center;}',
    '@media (prefers-reduced-motion:reduce){.cvz-game *{transition:none!important;}}'
  ].join('');

  // ==================== HILFEN ====================
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function store(key, value) {
    try {
      if (value === undefined) return window.localStorage.getItem('cvzGame.' + key);
      window.localStorage.setItem('cvzGame.' + key, value);
    } catch (e) { /* privater Modus o.ä.: Spiel läuft trotzdem */ }
    return null;
  }
  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = CSS;
    document.head.appendChild(el);
  }

  // Fragen so wählen, dass bis zum Ende des Pools nichts doppelt kommt (auch über Seitenaufrufe).
  function pickRound(setKey, items, count) {
    var seenRaw = store('seen.' + setKey);
    var seen = seenRaw ? seenRaw.split(',').map(Number) : [];
    var fresh = [];
    for (var i = 0; i < items.length; i++) if (seen.indexOf(i) === -1) fresh.push(i);
    if (fresh.length < count) { seen = []; fresh = items.map(function (_, i) { return i; }); }
    var chosen = shuffle(fresh).slice(0, count);
    store('seen.' + setKey, seen.concat(chosen).join(','));
    return chosen.map(function (idx) {
      var it = items[idx];
      // Seiten zufällig tauschen, damit "rechts ist richtig" kein Muster wird
      var swap = Math.random() < 0.5;
      return swap
        ? { a: it.b, b: it.a, better: it.better === 'a' ? 'b' : 'a', why: it.why }
        : { a: it.a, b: it.b, better: it.better, why: it.why };
    });
  }

  function verdict(score, total) {
    var r = total ? score / total : 0;
    if (r >= 0.9) return 'Starkes Gespür. Damit würdest du die Kommentare des Assistenten gleich mitschreiben.';
    if (r >= 0.7) return 'Gutes Gespür für Formulierungen, die überzeugen.';
    if (r >= 0.5) return 'Solide. Die Erklärungen zeigen, worauf es ankommt: Ergebnis statt Eigenschaft, konkret statt allgemein.';
    return 'Die Unterschiede sind oft kleiner, als man denkt. Genau dafür gibt es die Prüfung im Tool.';
  }

  // ==================== SPIEL ====================
  var current = null;

  function mount(container, options) {
    unmount();
    if (!container) return null;
    injectStyle();
    var opts = options || {};
    var setKey = SETS[opts.set] ? opts.set : 'landingpage';
    var set = SETS[setKey];
    var rounds = Math.max(3, Math.min(opts.rounds || 10, set.items.length));
    var root = document.createElement('div');
    root.className = 'cvz-game';
    root.setAttribute('data-set', setKey);
    container.appendChild(root);

    var state = { list: [], i: 0, score: 0, answered: false, hidden: store('hidden') === '1', ended: false, hintShown: false };
    var timers = [];

    function newGame() {
      state.list = pickRound(setKey, set.items, rounds);
      state.i = 0; state.score = 0; state.answered = false; state.ended = false;
      render();
    }

    function hintHtml() {
      if (!state.hintShown || !opts.prepHint || !opts.prepHint.text) return '';
      return '<div class="cvz-game-hint" role="note">' + esc(opts.prepHint.text) + '</div>';
    }

    function render() {
      if (state.hidden) {
        root.innerHTML = '<div class="cvz-game-collapsed"><button type="button" class="cvz-game-link" data-act="show">' + esc(set.title) + ' spielen, während du wartest</button></div>' + hintHtml();
        return;
      }
      if (state.ended) {
        root.innerHTML =
          '<div class="cvz-game-panel cvz-game-end" aria-live="polite">' +
          '<div class="cvz-game-head"><p class="cvz-game-title">' + esc(set.title) + '</p></div>' +
          '<p class="cvz-game-big">' + state.score + ' von ' + state.list.length + ' richtig</p>' +
          '<p>' + esc(verdict(state.score, state.list.length)) + '</p>' +
          '<div class="cvz-game-actions"><button type="button" class="cvz-game-next" data-act="again">Neue Runde</button>' +
          '<button type="button" class="cvz-game-link" data-act="hide">Spiel ausblenden</button></div>' +
          '</div>' + hintHtml();
        focus('[data-act="again"]');
        return;
      }
      var item = state.list[state.i];
      var pct = Math.round((state.i / state.list.length) * 100);
      root.innerHTML =
        '<div class="cvz-game-panel">' +
        '<div class="cvz-game-head"><p class="cvz-game-title">' + esc(set.title) + '</p>' +
        '<span class="cvz-game-score">Runde ' + (state.i + 1) + ' von ' + state.list.length + ' · ' + state.score + ' richtig</span></div>' +
        '<p class="cvz-game-q">' + esc(set.question) + '</p>' +
        '<div class="cvz-game-options">' +
        optionHtml('a', item.a) + optionHtml('b', item.b) +
        '</div>' +
        '<p class="cvz-game-feedback" aria-live="polite"></p>' +
        '<div class="cvz-game-actions"><button type="button" class="cvz-game-link" data-act="hide">Spiel ausblenden</button></div>' +
        '<div class="cvz-game-progress" aria-hidden="true"><span style="width:' + pct + '%"></span></div>' +
        '</div>' + hintHtml();
    }

    function optionHtml(key, text) {
      return '<button type="button" class="cvz-game-opt" data-act="pick" data-key="' + key + '">' + esc(text) + '<span class="cvz-game-tag"></span></button>';
    }

    function focus(selector) {
      var el = root.querySelector(selector);
      // Fokus nur setzen, wenn der Nutzer schon im Spiel interagiert, sonst springt die Seite
      if (el && root.contains(document.activeElement)) el.focus();
    }

    function pick(key) {
      if (state.answered) return;
      state.answered = true;
      var item = state.list[state.i];
      var right = key === item.better;
      if (right) state.score++;
      var buttons = root.querySelectorAll('.cvz-game-opt');
      for (var i = 0; i < buttons.length; i++) {
        var b = buttons[i];
        var k = b.getAttribute('data-key');
        b.disabled = true;
        var tag = b.querySelector('.cvz-game-tag');
        if (k === item.better) { b.classList.add('is-right'); tag.textContent = 'Stärker'; }
        else if (k === key) { b.classList.add('is-wrong'); tag.textContent = 'Deine Wahl'; }
        else b.classList.add('is-dim');
      }
      var fb = root.querySelector('.cvz-game-feedback');
      fb.innerHTML = (right ? '<strong>Richtig.</strong> ' : '<strong class="bad">Knapp daneben.</strong> ') + esc(item.why);
      var score = root.querySelector('.cvz-game-score');
      if (score) score.textContent = 'Runde ' + (state.i + 1) + ' von ' + state.list.length + ' · ' + state.score + ' richtig';
      var actions = root.querySelector('.cvz-game-actions');
      var last = state.i === state.list.length - 1;
      actions.insertAdjacentHTML('afterbegin', '<button type="button" class="cvz-game-next" data-act="next">' + (last ? 'Ergebnis ansehen' : 'Weiter') + '</button>');
      focus('[data-act="next"]');
    }

    function onClick(ev) {
      var t = ev.target.closest ? ev.target.closest('[data-act]') : null;
      if (!t || !root.contains(t)) return;
      var act = t.getAttribute('data-act');
      if (act === 'pick') pick(t.getAttribute('data-key'));
      else if (act === 'next') {
        if (state.i < state.list.length - 1) { state.i++; state.answered = false; render(); focus('.cvz-game-opt'); }
        else { state.ended = true; render(); }
      } else if (act === 'again') { newGame(); focus('.cvz-game-opt'); }
      else if (act === 'hide') { state.hidden = true; store('hidden', '1'); render(); }
      else if (act === 'show') { state.hidden = false; store('hidden', '0'); render(); }
    }
    root.addEventListener('click', onClick);

    if (opts.prepHint && opts.prepHint.text) {
      timers.push(setTimeout(function () { state.hintShown = true; render(); }, Math.max(0, opts.prepHint.afterMs || 0)));
    }

    newGame();
    current = {
      root: root,
      destroy: function () {
        timers.forEach(clearTimeout);
        root.removeEventListener('click', onClick);
        if (root.parentNode) root.parentNode.removeChild(root);
      },
    };
    return current;
  }

  function unmount() {
    if (current) { current.destroy(); current = null; }
  }

  window.CVZGame = {
    mount: mount,
    unmount: unmount,
    isMounted: function () { return !!current; },
    // Für Tests und Pflege: Anzahl Fragen je Set
    _sets: SETS,
  };
})();
