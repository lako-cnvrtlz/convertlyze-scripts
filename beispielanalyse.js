/**
 * Convertlyze – Statische Beispielanalyse v2 (echte Analyse, anonymisiert)
 * Grundlage: realer Analyselauf, Document-Intelligence/IDP-Anbieter (DACH, SaaS Self-Service)
 * Anonymisiert: Produktname, Wettbewerber-Referenz und identifizierende Badges entfernt/generalisiert.
 *
 * Einbindung (GitHub + jsdelivr):
 *   <script src="https://cdn.jsdelivr.net/gh/USER/REPO@main/beispielanalyse.js"></script>
 *
 * v2: Optik und Verhalten wie report.js v9
 *   - Deep-Dive-Kategorien sind aufklappbar (Name, Kurzinfo, Teaser, Score). Empfehlungen
 *     in einer geöffneten Kategorie bleiben sichtbar, "Stärken" ist eingeklappt,
 *     Roadmap-Gruppen sind aufklappbar ("Sofort umsetzen" offen), Button "Alle aufklappen".
 *   - Schweregrade auf Deutsch (Kritisch / Hoch / Mittel), Badges neutral, Farbe nur im linken Strich.
 *   - Glühbirnen-Icon entfernt, stattdessen Label "Lösung".
 *   - Alles eckig (border-radius 0).
 *   - Navigation, Mobile-Overflow-Fixes und "Nicht im Gesamt-Score"-Block wie im echten Report.
 *   - Der Render-Code ist bewusst 1:1 aus report.js. Nur die Datenquelle ist statisch (DATA unten).
 */

(function () {
  'use strict';

  var DATA = {

  keyword:         'Intelligente Dokumentenverarbeitung',
  url:             'demo-idp.example/dokumentenverarbeitung',
  target_audience: 'Sachbearbeiter:innen und Teamleads in Fachabteilungen (Buchhaltung, Vertrieb, Verwaltung) bei KMU ohne eigene IT-Abteilung',
  conversion_goal: 'Kostenlose Testversion (Trial)',
  industry:        'Document Intelligence / Intelligente Dokumentenverarbeitung',
  business_type:   'SaaS / Self-Service',
  search_intent:   'Informational mit Commercial-Anteil',
  created_at:      '26.07.2026, 20:42',

  overall_score:       5.8,
  hero_score:          6.5,
  content_score:       5.5,
  zielgruppe_score:    5.0,
  conversion_score:    5.5,
  struktur_score:      6.5,
  search_intent_score: 5.5,
  wettbewerb_score:    6.2,
  performance_score:   6.8,
  ai_readiness_score:  5.1,

  industry_fit_summary: 'Die Landingpage erfüllt grundlegende Standards im Bereich Intelligent Document Processing (IDP) teilweise: Prozessdarstellung, Sicherheits- und Datenschutzsektion sowie FAQ-Bereich entsprechen Branchenerwartungen. Branchentypische Elemente wie konkrete Genauigkeitsangaben mit Quellennachweis, eine Integrations-Ökosystem-Übersicht und Use-Case-spezifische Beispiele fehlen jedoch. Der fehlende Nachweis von ISO 27001 oder vergleichbaren Sicherheitszertifizierungen ist für eine IDP-Lösung, die sensible Geschäftsdokumente verarbeitet, ein relevanter Branchen-Gap.',

  dach_fit_summary: 'Positiv: DSGVO-Konformität, EU-Hosting und ein klares Datenschutzversprechen (kein KI-Training auf Kundendaten) sind prominent platziert und adressieren zentrale DACH-Bedenken direkt. Kritisch: Die Landingpage ist auf Englisch verfasst, obwohl die Zielgruppe explizit deutschsprachige KMU-Fachabteilungen sind – ein erheblicher kultureller Mismatch. Branchenspezifische Zertifizierungen wie ISO 27001 oder BSI-Grundschutz fehlen vollständig.',

  exec_staerken: `<ul>
    <li><strong>Zwei Einstiegswege mit klarer Aufgabenteilung:</strong> Ein Trial-Start als primärer Button und eine Demo-Buchung als sekundäre Option bedienen unterschiedliche Bedürfnisse mit eindeutiger visueller Hierarchie.</li>
    <li><strong>Subheadline entkräftet die größten Einstiegshürden in einem Satz:</strong> Der Verzicht auf Einrichtung, IT-Projekt und Schulung spricht direkt die Kernbedenken von Fachabteilungen ohne IT-Abteilung an.</li>
    <li><strong>Problemdarstellung trifft den Alltag der Zielgruppe punktgenau:</strong> Vier Problemkarten (manuelles Öffnen, Suchen, Copy-Paste, Berichtserstellung) beschreiben exakt die Tätigkeiten von Sachbearbeiter:innen.</li>
    <li><strong>Datenschutz-Signale prominent und substanziell platziert:</strong> DSGVO-Konformität, EU-Hosting und ein Data Processing Agreement auf Anfrage sind nicht nur als Badges sichtbar, sondern in einer eigenen Sektion ausgeführt.</li>
  </ul>`,

  exec_schwaechen: `<ul>
    <li><strong>Kein Social Proof vorhanden – der stärkste Vertrauensanker fehlt vollständig:</strong> Weder Kundenstimmen noch Logos oder eine einfache Nutzerzahl sind zu finden. Für Sachbearbeiter:innen in KMU ohne IT-Begleitung ist "Nutzen andere Unternehmen das schon?" kaufentscheidend.</li>
    <li><strong>Die Hauptaussage im Hero ist zu abstrakt:</strong> Das Wertversprechen benennt eine Richtung, aber kein messbares Ergebnis. Die Zielgruppe wird zudem an keiner Stelle explizit benannt.</li>
    <li><strong>Kein Hinweis auf Folgeprozess und Preismodell nach dem CTA-Klick:</strong> Weder ist erklärt, was nach dem Trial-Start passiert, noch existiert ein Preishinweis – Entscheider können intern nicht vorqualifizieren.</li>
  </ul>`,

  // ── HERO ──────────────────────────────────────────────────────────────────
  hero_summary: 'Der Hero kommuniziert die Kernidee (Dokumente rein, strukturierte Daten raus) und senkt Einstiegshürden über die Subheadline. Die Dual-CTA-Strategie mit klarer visueller Hierarchie und ein Produktvideo sind solide Grundlagen. Größter Hebel: Die Primary Headline bleibt zu abstrakt – sie benennt keine messbare Größe. Zweiter Hebel: Die Zielgruppe ist im gesamten Hero nicht erkennbar, weder explizit noch durch situationsspezifische Sprache.',

  hero_staerken: `<ul>
    <li><strong>Dual-CTA-Strategie mit klarer visueller Hierarchie:</strong> Ein farbiger Solid-Button (Primary) und ein Outline-Button (Secondary) sind visuell klar unterscheidbar.</li>
    <li><strong>Subheadline senkt Einstiegshürden:</strong> Der Verzicht auf Einrichtung, IT-Projekt und Schulung entkräftet drei konkrete Barrieren in einem Satz.</li>
    <li><strong>Vertrauenssignale sofort sichtbar:</strong> DSGVO-Konformität und EU-Hosting sind als Eyebrow-Badges oberhalb der Headline platziert.</li>
    <li><strong>Produktvideo im Hero:</strong> Ein autoplay-Video zeigt Dokumenten-Screenshots mit strukturierten Daten und macht die Kernfunktion greifbar, ohne Scrollen.</li>
  </ul>`,

  hero_prioritized: [
    {
      severity: 'critical',
      problem: 'Die Primary Headline bleibt auf einem abstrakten Wertversprechen ohne messbares Ergebnis. Sachbearbeiter:innen und Teamleads können nicht einschätzen, wie viel Zeit sie sparen oder welche Fehler entfallen.',
      loesung: 'Headline auf ein konkretes, messbares Ergebnis umschreiben, das die Zielgruppe sofort versteht, z.B. Zeitersparnis oder Wegfall manueller Abtipparbeit.',
      aufwand: 'gering',
    },
    {
      severity: 'critical',
      problem: 'Die Zielgruppe wird im gesamten Hero weder explizit genannt noch durch situationsspezifische Sprache erkennbar. Der Text könnte für jedes Unternehmen jeder Größe gelten.',
      loesung: 'Zielgruppe im Subheading oder als Eyebrow-Label konkretisieren, z.B. "Für Buchhaltung, Vertrieb und Verwaltung – ohne IT-Projekt".',
      aufwand: 'gering',
    },
    {
      severity: 'high',
      problem: 'Der primäre CTA kommuniziert keinen Benefit und keine Risikoumkehr. Unklar ist, ob eine Kreditkarte oder IT-Einrichtung nötig ist.',
      loesung: 'Risikoumkehr direkt unter dem CTA ergänzen, z.B. "Kostenlos starten – keine Kreditkarte, keine IT nötig".',
      aufwand: 'gering',
    },
  ],

  // ── CONTENT ───────────────────────────────────────────────────────────────
  content_summary: 'Die Problemdarstellung ist stark und situationsspezifisch. Business-Impact-Kennzahlen und die Sicherheits-Section mit DSGVO-Fokus sind solide Grundlagen für die DACH-Zielgruppe. Größter Hebel: Kein Social Proof vorhanden. Zweiter Hebel: Nur funktionaler Nutzen kommuniziert, emotionale Bedenken der Zielgruppe werden nicht adressiert. Dritter Hebel: Kein Pricing sichtbar.',

  content_staerken: `<ul>
    <li><strong>Problem-Section mit konkreten Situationsbeschreibungen:</strong> Vier Problemkarten beschreiben exakt die Alltagssituationen von Sachbearbeiter:innen.</li>
    <li><strong>Business Impact quantifiziert:</strong> Kennzahlen zu weniger manueller Dateneingabe, schnellerer Berichtserstellung und weniger Fehlern kommunizieren messbaren Nutzen.</li>
    <li><strong>Onboarding-Klarheit durch 3-Schritt-Prozess:</strong> Ingest, Understand, Act mit konkreten Integrationsoptionen zeigt, wie der Einstieg funktioniert.</li>
    <li><strong>FAQ mit kaufentscheidenden Fragen:</strong> Deckt Onboarding-Aufwand, technische Voraussetzungen, Genauigkeit und DSGVO ab.</li>
  </ul>`,

  content_prioritized: [
    {
      severity: 'critical',
      problem: 'Kein Social Proof vorhanden – keine Kundenstimmen, Logos oder Nutzerzahlen. Für Fachabteilungen ohne IT-Begleitung ist Peer-Validierung besonders wichtig.',
      loesung: 'Mindestens eine Kundenstimme mit Name, Funktion, Unternehmen und konkretem Ergebnis ergänzen. Auch eine einfache Nutzerzahl-Aussage schafft ersten sozialen Beweis.',
      aufwand: 'gering',
    },
    {
      severity: 'high',
      problem: 'Nur funktionaler Nutzen kommuniziert – emotionale Bedenken (Ersetzt das Tool meine Arbeit? Bin ich mit meinen Daten sicher?) werden nicht adressiert.',
      loesung: 'Emotionale Ebene ergänzen, z.B. "Keine IT-Kenntnisse nötig – wenn du Excel bedienen kannst, kannst du die Software nutzen."',
      aufwand: 'gering',
    },
    {
      severity: 'high',
      problem: 'Kein Return on Investment kommuniziert – Kennzahlen sind vorhanden, aber nicht in wirtschaftlichen Nutzen übersetzt. Teamleads müssen die Einführung intern rechtfertigen.',
      loesung: 'Eine einfache ROI-Beispielrechnung ergänzen: Zeitersparnis pro Woche hochgerechnet auf den Monat.',
      aufwand: 'gering',
    },
  ],

  content_gaps: [],

  // ── ZIELGRUPPE ──────────────────────────────────────────────────────────────
  zielgruppe_summary: 'Die Problemdarstellung trifft die Alltagssituationen der Zielgruppe gut. Größter Hebel: Die "Wie es funktioniert"-Section widerspricht dem Versprechen "kein IT-Projekt" durch technische Begriffe (SDKs, API), das schreckt die primäre Zielgruppe ab. Zweiter Hebel: Die Zielgruppe wird nirgendwo explizit genannt. Dritter Hebel: Teamleads als Entscheider finden keine ROI-Argumentation.',

  zielgruppe_staerken: `<ul>
    <li><strong>Problemdarstellung trifft Alltagssituationen:</strong> Die vier Problemkarten beschreiben exakt die Tätigkeiten von Sachbearbeiter:innen – ohne dass die Zielgruppe explizit genannt wird, ist die Situation wiedererkennbar.</li>
    <li><strong>Technische Barrieren explizit entkräftet:</strong> Der Verzicht auf Einrichtung und Schulung positioniert die Lösung als selbst einrichtbar für Fachabteilungen.</li>
    <li><strong>Tonalität angemessen:</strong> Klare, direkte Sprache ohne übermäßigen Tech-Jargon.</li>
  </ul>`,

  zielgruppe_prioritized: [
    {
      severity: 'critical',
      problem: 'Persona-Mismatch in der "Wie es funktioniert"-Section: Einstiegsmöglichkeiten werden mit technischen Begriffen (SDKs, API) beschrieben, die dem Versprechen "kein IT-Projekt" direkt widersprechen.',
      loesung: 'Die Section in zwei Ebenen aufteilen: nicht-technische Einstiegswege (Upload, E-Mail-Postfach, Cloud-Speicher) in den Vordergrund stellen, technische Optionen als Zusatz kennzeichnen.',
      aufwand: 'gering',
    },
    {
      severity: 'high',
      problem: 'Zielgruppe wird auf der gesamten Seite nicht explizit adressiert – weder Abteilung noch Unternehmensgröße erscheinen im sichtbaren Content.',
      loesung: 'Zielgruppe an mindestens zwei Stellen konkretisieren: im Hero als Eyebrow-Label und in der Problem-Section mit einem einleitenden Satz.',
      aufwand: 'gering',
    },
    {
      severity: 'high',
      problem: 'Buying Center nicht vollständig adressiert: Teamleads als Entscheider finden keine ROI-Argumentation zur internen Rechtfertigung.',
      loesung: 'Eine kurze Kennzahl-Box ergänzen: "Dein Team spart X Stunden pro Woche – das entspricht Y Stunden pro Monat für wertschöpfende Aufgaben."',
      aufwand: 'gering',
    },
  ],

  // ── CONVERSION ──────────────────────────────────────────────────────────────
  conversion_summary: 'Die Dual-CTA-Strategie mit unterschiedlichen Commitment-Leveln ist eine solide Grundlage. Größter Hebel: Kein Social Proof als Vertrauensanker vor dem Trial-CTA. Zweiter Hebel: Kein Risk-Reversal-Signal – unklar ob Kreditkarte oder Setup nötig sind. Dritter Hebel: Folgeprozess nach CTA-Klick nicht kommuniziert.',

  conversion_staerken: `<ul>
    <li><strong>Dual-CTA-Strategie mit unterschiedlichen Commitment-Leveln:</strong> Trial-Start und Demo-Buchung bedienen unterschiedliche Nutzerpräferenzen.</li>
    <li><strong>CTA-Wiederholung konsistent:</strong> Beide CTAs erscheinen sowohl im Hero als auch im finalen CTA-Block.</li>
    <li><strong>FAQ als Einwandbehandlung vor dem finalen CTA:</strong> Neun Fragen adressieren Unsicherheiten direkt am Entscheidungspunkt.</li>
  </ul>`,

  conversion_prioritized: [
    {
      severity: 'critical',
      problem: 'Kein Social Proof als Vertrauensanker vor oder neben den CTAs – für Sachbearbeiter:innen und Teamleads ist "Nutzen andere Unternehmen das schon?" kaufentscheidend.',
      loesung: 'Mindestens eine konkrete Kundenstimme direkt vor oder nach dem finalen CTA-Block platzieren. Alternativ eine einfache Nutzerzahl-Aussage als Micro-Copy.',
      aufwand: 'gering',
    },
    {
      severity: 'high',
      problem: 'Kein Risk-Reversal-Signal beim Trial-CTA – nicht kommuniziert, ob Kreditkarte oder IT-Einrichtung nötig ist.',
      loesung: 'Micro-Copy direkt unter dem CTA ergänzen: "Kostenlos starten – keine Kreditkarte, keine IT-Einrichtung nötig."',
      aufwand: 'gering',
    },
    {
      severity: 'high',
      problem: 'Kein Pricing sichtbar – Teamleads können die Lösung nicht intern vorqualifizieren, bevor sie einen Trial starten.',
      loesung: 'Zumindest einen Hinweis auf das Preismodell ergänzen oder eine Pricing-Seite verlinken.',
      aufwand: 'mittel',
    },
  ],

  // ── STRUKTUR ──────────────────────────────────────────────────────────────
  struktur_summary: 'Der logische Informationsfluss ist solide – Problem, Lösung, Vertrauen, Handlung folgen einer nachvollziehbaren Kauflogik. Größter Hebel: Die Agitate-Phase fehlt – das Problem wird benannt, aber keine Dringlichkeit erzeugt. Zweiter Hebel: Kein Social Proof im sofort sichtbaren Bereich. Dritter Hebel: Keine Anchor-Navigation trotz mehrerer Sektionen.',

  struktur_staerken: `<ul>
    <li><strong>Logischer Informationsfluss ohne kritische Verstöße:</strong> Hero, Problem, Lösung, Prozess, Business Impact, Sicherheit, FAQ und finaler CTA folgen einer nachvollziehbaren Kauflogik.</li>
    <li><strong>FAQ als Einwandbehandlung direkt vor dem finalen CTA platziert:</strong> Letzte Unsicherheiten werden genau dort adressiert, wo die Entscheidung fällt.</li>
    <li><strong>Scanbarkeit durch kurze Abschnitte:</strong> Problemkarten und Prozessschritte sind als eigenständige Einheiten strukturiert.</li>
  </ul>`,

  struktur_prioritized: [
    {
      severity: 'high',
      problem: 'Die Agitate-Phase fehlt: Das Problem wird benannt, aber die Konsequenzen des Status quo werden nicht verstärkt.',
      loesung: 'Nach den Problemkarten einen Agitations-Satz ergänzen, der die Konsequenz benennt, z.B. eine einfache Zeitrechnung pro Woche/Jahr.',
      aufwand: 'gering',
    },
    {
      severity: 'high',
      problem: 'Trust-Elemente im sofort sichtbaren Bereich sind schwach – Text-Badges vorhanden, aber kein Social Proof (Kundenzahlen, Logos) im Hero sichtbar.',
      loesung: 'Eine einfache Kundenzahl oder ein kurzes Zitat direkt im Hero als Micro-Copy unter den CTAs ergänzen.',
      aufwand: 'gering',
    },
    {
      severity: 'medium',
      problem: 'Keine Anchor-Navigation trotz mehrerer inhaltlicher Sektionen – Teamleads, die gezielt nach Pricing oder Security suchen, müssen linear scrollen.',
      loesung: 'Eine einfache Anchor-Navigation oder Sprungmarken zu den wichtigsten Sektionen ergänzen.',
      aufwand: 'mittel',
    },
  ],

  // ── SEARCH INTENT ───────────────────────────────────────────────────────────
  search_intent_bewertung: 'Das Keyword signalisiert primär Informationsabsicht – Nutzer wollen verstehen, was das Konzept bedeutet und ob es relevant ist. Die Problem-Section und die Prozess-Section bedienen diesen Bedarf teilweise. Es fehlen jedoch erklärende Inhalte für Erstinteressierte: Was unterscheidet die Lösung von einfacher OCR oder manuellen Prozessen? Der sekundäre Commercial Intent (Vergleich von Lösungen) wird ebenfalls nicht bedient.',

  search_intent_prioritized: [
    {
      severity: 'high',
      problem: 'Fehlende Erklärung des Grundkonzepts – Nutzer mit Informationsabsicht wollen verstehen, wie es sich von einfacher Texterkennung (OCR) oder manuellen Prozessen unterscheidet.',
      loesung: 'Eine kurze Erklärungs-Section ergänzen: "Was ist intelligente Dokumentenverarbeitung?" mit einer verständlichen Definition für Nicht-IT-Nutzer.',
      aufwand: 'mittel',
    },
    {
      severity: 'high',
      problem: 'Kein Differenzierungsmerkmal gegenüber alternativen Ansätzen – Nutzer, die Lösungen vergleichen, erhalten keine Orientierung, warum diese Lösung die bessere Wahl ist.',
      loesung: 'Eine kurze Abgrenzungs-Section ergänzen, z.B. "Warum nicht einfach OCR?" mit zwei bis drei konkreten Unterschieden.',
      aufwand: 'mittel',
    },
  ],

  // ── DIFFERENZIERUNG / WETTBEWERB ─────────────────────────────────────────────
  wettbewerb_summary: 'Differenzierung ist teilweise kommuniziert: Die Self-Service-Positionierung und Compliance-Badges sind klare Stärken gegenüber komplexeren Enterprise-Lösungen. Trust-Signal-Basis ist schwach – keine Kundennachweise mit messbaren Outcomes erkennbar, während ein Wettbewerber konkrete Unternehmensreferenzen und Branchenanwendungen zeigt. Kein einziger quantifizierter Outcome-Claim auf der Seite.',

  wettbewerb_staerken: `<ul>
    <li><strong>Klare Self-Service-Positionierung:</strong> Der Verzicht auf Einrichtung, IT-Projekt und Schulung ist ein direkter Vorteil gegenüber komplexeren Enterprise-Lösungen.</li>
    <li><strong>Starke Compliance-Signale:</strong> DSGVO-Konformität, EU-Hosting und EU-AI-Act-Konformität sind als visuelle Badges prominent platziert.</li>
    <li><strong>Dual-CTA-Strategie:</strong> Trial-Start und Demo-Buchung adressieren gleichzeitig selbstständige Evaluatoren und Entscheider mit Beratungsbedarf.</li>
  </ul>`,

  wettbewerb_prioritized: [
    {
      severity: 'critical',
      problem: 'Fehlende Kundennachweise mit messbaren Outcomes – ein Wettbewerber zeigt konkrete Unternehmensreferenzen mit benannten Anwendungsfällen.',
      loesung: 'Mindestens 2-3 Kundenstimmen mit konkreten Ergebnissen ergänzen. Alternativ einen benannten Referenzkunden als Mini-Case-Study einbinden.',
      aufwand: 'mittel',
    },
    {
      severity: 'critical',
      problem: 'Value Proposition ohne messbare Outcomes – kein einziger Claim belegt den Nutzen mit einer konkreten Zahl.',
      loesung: 'Mindestens einen messbaren Outcome-Claim in Hero oder Content ergänzen, z.B. Zeitersparnis pro Woche oder Verarbeitungsgeschwindigkeit.',
      aufwand: 'gering',
    },
    {
      severity: 'high',
      problem: 'Zielgruppe nicht explizit benannt – ein Wettbewerber adressiert explizit Branchen und Rollen, hier bleibt die Sprache generisch.',
      loesung: '2-3 konkrete Zielgruppen-Segmente oder Branchen im Content benennen, z.B. als Use-Case-Kacheln.',
      aufwand: 'gering',
    },
  ],

  // ── PERFORMANCE ─────────────────────────────────────────────────────────────
  performance_summary: 'Performance ist durchschnittlich auf Mobile, gut auf Desktop. Hauptursache: Ein Autoplay-Hero-Video und sein Thumbnail über externen Speicher dominieren das Transfergewicht und verlangsamen den mobilen Ladestart erheblich. Layout-Stabilität ist optimal, Server-Antwortzeit ausgezeichnet.',
  performance_desktop: 'Desktop-Performance ist gut. LCP und FCP sind schnell, Layout-Stabilität optimal, Server-Antwortzeit ausgezeichnet. Das Hero-Video ist der größte Einzelfaktor im Transfergewicht, ein fetchpriority-Attribut fehlt.',
  performance_mobile: 'Mobile Performance ist durchschnittlich. Kernmetriken deuten auf eine stark JavaScript-abhängige Renderingstrategie hin. Das Hero-Video wird als nativer Autoplay-Clip eingebunden und belastet den initialen Ladevorgang erheblich.',

  performance_opportunities: [
    {
      severity: 'high',
      problem: 'Hero-Video-Thumbnail über externen Speicher geladen – macht den Großteil des Transfergewichts aus, kritisch für den wahrgenommenen mobilen Ladestart.',
      loesung: 'Thumbnail komprimieren und direkt im eigenen Hosting oder CDN bereitstellen.',
      aufwand: 'mittel',
    },
    {
      severity: 'high',
      problem: 'Autoplay-Hero-Video erhöht das Transfergewicht erheblich, native MP4-Datei wird beim Seitenaufruf automatisch geladen.',
      loesung: 'Video-Datei in ein modernes Format (WebM/AV1) konvertieren und komprimieren, alternativ Lazy Loading implementieren.',
      aufwand: 'mittel',
    },
    {
      severity: 'medium',
      problem: 'Ungenutztes JavaScript vorhanden – verzögert Time to Interactive auf schwächeren Geräten.',
      loesung: 'Nicht genutzte Plugins deaktivieren, Code-Splitting und Tree Shaking implementieren.',
      aufwand: 'mittel',
    },
  ],

  // ── AI READINESS ────────────────────────────────────────────────────────────
  ai_bewertung: 'AI-Sichtbarkeit ist mittelmäßig. Non-Commodity-Gehalt ist gering – zentrale Claims sind generisch und könnten von jeder Wettbewerberseite stammen. Schema.org ist auf Basis-Typen beschränkt, FAQPage- und VideoObject-Schema fehlen trotz vorhandener FAQ-Sektion und Video. Die technische KI-Crawler-Sichtbarkeit ist mit einem Ratio von 0.92 gut.',

  ai_staerken: `<ul>
    <li><strong>KI-Crawler-Sichtbarkeit:</strong> Inhalt steht server-seitig bereit und ist für nicht-rendernde KI-Bots weitgehend erfassbar.</li>
    <li><strong>Schema.org Basiskonfiguration:</strong> Organization und SoftwareApplication sind implementiert.</li>
    <li><strong>FAQ-Sektion mit relevanten Entscheiderfragen:</strong> Deckt technische, datenschutzrechtliche und integrationsbezogene Sub-Intents ab.</li>
  </ul>`,

  ai_optimierungspotenziale: [
    {
      severity: 'critical',
      problem: 'Non-Commodity-Gehalt fehlt – alle zentralen Claims sind generisch, kein Claim ist mit eigenen Daten oder konkreten Kundenfällen belegt.',
      loesung: '2-3 konkrete Kundenfälle mit messbaren Ergebnissen ergänzen und generische Claims durch eigene Daten ersetzen.',
      aufwand: 'mittel',
    },
    {
      severity: 'high',
      problem: 'FAQPage-Schema fehlt trotz vorhandener FAQ-Sektion – AI-Systeme können die Antworten nicht als strukturierte Fakten extrahieren.',
      loesung: 'FAQPage-Schema via JSON-LD für alle Fragen und Antworten ergänzen.',
      aufwand: 'gering',
    },
    {
      severity: 'high',
      problem: 'Produktdefinitionssatz nicht vollständig standalone-zitierbar – kein Satz beschreibt Produkt, Zielgruppe und messbaren Nutzen vollständig.',
      loesung: 'Einen Definitionssatz ergänzen, der Produkt, Zielgruppe (Fachabteilungen ohne IT-Projekt) und Nutzen in einem Satz verbindet.',
      aufwand: 'gering',
    },
  ],

  // ── ROADMAP ───────────────────────────────────────────────────────────────
  priority_matrix: {
    sofort_umsetzen: [
      {
        category: 'Hero',
        issue: 'Primary Headline auf ein konkretes, messbares Ergebnis umschreiben statt einer abstrakten Richtungsangabe.',
        reasoning: 'Sachbearbeiter:innen und Teamleads müssen sofort verstehen, was sich für sie konkret ändert.',
        impact: 'SEHR_HOCH',
        effort: 'GERING',
      },
      {
        category: 'Zielgruppe',
        issue: 'Zielgruppe im Hero und in der Problem-Section explizit benennen (Abteilung, Unternehmensgröße).',
        reasoning: 'Ohne explizite Nennung erkennt die Kernpersona nicht, dass die Lösung für sie gemacht ist.',
        impact: 'SEHR_HOCH',
        effort: 'GERING',
      },
      {
        category: 'Content',
        issue: 'Mindestens eine Kundenstimme mit Name, Unternehmen und konkretem Ergebnis ergänzen.',
        reasoning: 'Social Proof ist für KMU-Entscheider ohne IT-Begleitung der wichtigste fehlende Vertrauensanker.',
        impact: 'SEHR_HOCH',
        effort: 'GERING',
      },
    ],
    als_naechstes: [
      {
        category: 'Hero + Conversion',
        issue: 'Risikoumkehr direkt unter dem primären CTA ergänzen (keine Kreditkarte, keine IT-Einrichtung).',
        reasoning: 'Entkräftet die größten Bedenken genau dort, wo die Entscheidung fällt.',
        impact: 'HOCH',
        effort: 'GERING',
      },
      {
        category: 'Content',
        issue: 'Eine einfache ROI-Beispielrechnung ergänzen (Zeitersparnis pro Woche/Monat).',
        reasoning: 'Teamleads müssen die Einführung intern rechtfertigen können.',
        impact: 'HOCH',
        effort: 'GERING',
      },
      {
        category: 'Zielgruppe',
        issue: '"Wie es funktioniert"-Section in eine nicht-technische und eine optionale technische Ebene aufteilen.',
        reasoning: 'Technische Begriffe widersprechen dem Versprechen "kein IT-Projekt" und schrecken die Kernzielgruppe ab.',
        impact: 'HOCH',
        effort: 'GERING',
      },
    ],
    quick_wins: [
      {
        category: 'Conversion',
        issue: 'Trust-Badges im Hero mit Icons oder leichter visueller Abgrenzung versehen.',
        reasoning: 'Ohne visuelle Hervorhebung werden Vertrauenssignale beim schnellen Scannen übersehen.',
        impact: 'MITTEL',
        effort: 'GERING',
      },
      {
        category: 'AI Sichtbarkeit',
        issue: 'FAQPage- und VideoObject-Schema via JSON-LD ergänzen.',
        reasoning: 'Erhöht die Chance auf direkte Zitation durch KI-Systeme und AI Overviews.',
        impact: 'MITTEL',
        effort: 'GERING',
      },
    ],
    spaeter: [
      {
        category: 'Zielgruppe',
        issue: 'Zwei bis drei Branchen-Beispiele als Use-Case-Karten ergänzen.',
        reasoning: 'Schafft Wiedererkennung für Sachbearbeiter:innen in spezifischen Branchen, ohne die Seite zu überladen.',
        impact: 'MITTEL',
        effort: 'MITTEL',
      },
      {
        category: 'Search Intent',
        issue: 'Einen niedrigschwelligen Content-Einstieg (Leitfaden oder Erklärvideo mit Transkript) ergänzen.',
        reasoning: 'Hält Awareness-Traffic auf der Seite und führt ihn schrittweise zur Conversion.',
        impact: 'MITTEL',
        effort: 'HOCH',
      },
    ],
  },

  };

  // ── DATA -> Feldnamen des echten Reports ────────────────────────────────────
  // Der Render-Code unten stammt 1:1 aus report.js und erwartet die Supabase-
  // Feldnamen. Damit er unverändert läuft, wird DATA hier umbenannt.
  function toAnalysis(d) {
    return {
      keyword: d.keyword, landing_page_url: d.url, target_audience: d.target_audience,
      conversion_goal: d.conversion_goal, analysis_industry: d.industry, business_type: d.business_type,
      search_intent_primary: d.search_intent,
      overall_score_weighted: d.overall_score,
      hero_score: d.hero_score, content_score: d.content_score, zielgruppe_score: d.zielgruppe_score,
      conversion_score: d.conversion_score, struktur_score: d.struktur_score,
      search_intent_score: d.search_intent_score, wettbewerb_score: d.wettbewerb_score,
      performance_score: d.performance_score, ai_readiness_score: d.ai_readiness_score,
      industry_fit_summary: d.industry_fit_summary, dach_cultural_fit_summary: d.dach_fit_summary,
      executive_summary_staerken: d.exec_staerken, executive_summary_hauptproblem: d.exec_schwaechen,
      hero_summary: d.hero_summary, hero_staerken_html: d.hero_staerken, hero_schwaechen_prioritized_html: d.hero_prioritized,
      content_summary: d.content_summary, content_staerken_html: d.content_staerken, content_schwaechen_prioritized_html: d.content_prioritized, content_gaps_html: d.content_gaps,
      zielgruppe_summary: d.zielgruppe_summary, zielgruppe_staerken_html: d.zielgruppe_staerken, zielgruppe_schwaechen_prioritized_html: d.zielgruppe_prioritized,
      conversion_summary: d.conversion_summary, conversion_staerken_html: d.conversion_staerken, conversion_schwaechen_prioritized_html: d.conversion_prioritized,
      struktur_summary: d.struktur_summary, struktur_staerken_html: d.struktur_staerken, struktur_schwaechen_prioritized_html: d.struktur_prioritized,
      search_intent_bewertung: d.search_intent_bewertung, search_intent_content_gaps: d.search_intent_prioritized,
      wettbewerb_summary: d.wettbewerb_summary, wettbewerb_staerken_html: d.wettbewerb_staerken, wettbewerb_schwaechen_prioritized_html: d.wettbewerb_prioritized,
      performance_summary: d.performance_summary, performance_desktop_zusammenfassung: d.performance_desktop,
      performance_mobile_zusammenfassung: d.performance_mobile, performance_opportunities_html: d.performance_opportunities,
      ai_readiness_bewertung: d.ai_bewertung, ai_readiness_staerken_html: d.ai_staerken, ai_readiness_optimierungspotenziale_html: d.ai_optimierungspotenziale,
      priority_matrix: d.priority_matrix,
    };
  }

  function injectStyles() {
    if (document.getElementById('cvz-bsp-styles')) return;
    const s = document.createElement('style');
    s.id = 'cvz-bsp-styles';
    s.textContent = `
      /* ── Design System ── */
      .cvz-section{
        max-width:1200px;margin:0 auto;padding:0 24px 32px;
        font-family:'Geist','DM Sans','Segoe UI',sans-serif;color:#e2e8f0;
      }

      /* Overflow-Schutz: nichts darf breiter als der Screen werden */
      .cvz-section,
      .cvz-section *,
      .cvz-section *::before,
      .cvz-section *::after{box-sizing:border-box;}
      .cvz-section{width:100%;min-width:0;}
      .cvz-exec-panel > *,
      .cvz-bars,
      .cvz-badge,
      .cvz-cards,
      .cvz-card,
      .cvz-card-body,
      .cvz-badge-tx{min-width:0;max-width:100%;}
      .cvz-card-body,
      .cvz-badge-tx,
      .cvz-card-body *{
        overflow-wrap:anywhere;word-break:normal;hyphens:auto;-webkit-hyphens:auto;
      }
      .cvz-card-body img,
      .cvz-card-body video,
      .cvz-card-body iframe,
      .cvz-card-body pre{max-width:100%;}
      .cvz-card-body pre{white-space:pre-wrap;}
      .cvz-card-body table{display:block;max-width:100%;overflow-x:auto;}

      /* Reduced motion */
      @media(prefers-reduced-motion:reduce){
        .cvz-fi{animation:none!important;opacity:1!important;transform:none!important;}
        .cvz-bf{animation:none!important;width:var(--bw)!important;}
        .cvz-ring{animation:none!important;opacity:1!important;transform:none!important;}
        *{transition:none!important;}
      }

      /* Fade-in */
      .cvz-fi{opacity:0;transform:translateY(14px);animation:cvzFI .55s ease forwards;}
      .cvz-fi-1{animation-delay:.05s}.cvz-fi-2{animation-delay:.15s}
      .cvz-fi-3{animation-delay:.25s}.cvz-fi-4{animation-delay:.35s}
      .cvz-fi-5{animation-delay:.45s}.cvz-fi-6{animation-delay:.55s}
      @keyframes cvzFI{to{opacity:1;transform:translateY(0)}}
      @keyframes cvzBar{from{width:0}to{width:var(--bw)}}
      @keyframes cvzRing{from{opacity:0;transform:scale(.82)}to{opacity:1;transform:scale(1)}}

      /* Anker-Navigation
         Bewusst KEIN position:sticky mehr. Sticky bricht auf Mobile, sobald
         GSAP ScrollTrigger.normalizeScroll() aktiv ist (transform-basiertes
         Scrollen statt nativem Browser-Scroll) oder irgendein Vorfahre
         overflow/transform gesetzt hat. Stattdessen: normaler Fluss per
         Default, .cvz-anchor-nav--fixed wird per IntersectionObserver auf
         einem Sentinel-Element getoggelt (siehe injectAnchorNav weiter unten).
         Der body.body-home-Fix bleibt als zusätzliches Sicherheitsnetz stehen,
         schadet nicht und hilft evtl. anderen Elementen auf der Seite. */
      body.body-home{
        overflow-y:visible!important;
      }

      .cvz-anchor-nav{
        background:#0d1117;
        border-top:1px solid rgba(255,255,255,.06);
        border-bottom:1px solid rgba(255,255,255,.06);
        position:relative;z-index:100;
        width:100%;overflow:hidden;
      }
      .cvz-anchor-nav.cvz-anchor-nav--fixed{
        position:fixed;left:0;right:0;
      }
      .cvz-anchor-nav-sentinel{
        width:100%;height:1px;pointer-events:none;visibility:hidden;
      }
      /* top wird per JS gesetzt sobald Nav-Höhe bekannt ist */
      .cvz-anchor-nav-inner{
        display:flex;align-items:center;justify-content:center;
        gap:0;width:100%;padding:0 24px;
        overflow-x:auto;scrollbar-width:none;-ms-overflow-style:none;
      }
      .cvz-anchor-nav-inner::-webkit-scrollbar{display:none;}
      .cvz-anchor-nav a{
        display:inline-flex;align-items:center;flex-shrink:0;
        padding:14px 22px;
        font-family:'Geist','DM Sans',sans-serif;font-size:13px;font-weight:500;
        color:#6e7681;text-decoration:none;white-space:nowrap;
        border-bottom:2px solid transparent;
        transition:color .15s ease,border-color .15s ease;
        position:relative;
      }
      .cvz-anchor-nav a:hover{color:#e6edf3;border-bottom-color:rgba(79,209,197,.4);}
      .cvz-anchor-nav a.cvz-nav-active{color:#6e7681;border-bottom-color:transparent;}
      .cvz-anchor-nav a+a::before{
        content:'';position:absolute;left:0;top:25%;
        height:50%;width:1px;background:rgba(255,255,255,.06);
      }
      .cvz-anchor-nav a:focus-visible{outline:2px solid #4fd1c5;outline-offset:2px;border-radius:0;}
      @media(max-width:600px){
        .cvz-anchor-nav-inner{justify-content:flex-start;padding:0;}
        .cvz-anchor-nav a{font-size:12px;padding:12px 16px;}
        .cvz-anchor-nav a:first-child{padding-left:16px;}
      }

      /* Kategorie-Header */
      .cvz-cat-header{
        display:flex;align-items:center;justify-content:space-between;
        padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:20px;
      }
      .cvz-cat-name{font-size:18px;font-weight:700;color:#f0f4f8;letter-spacing:-.01em;font-family:'Syne',sans-serif;}
      .cvz-cat-score{font-size:22px;font-weight:700;font-family:'DM Mono',monospace;color:#e8edf5!important;}

      /* Karten */
      .cvz-cards{display:flex;flex-direction:column;gap:12px;margin-bottom:8px;}
      .cvz-card{
        background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);
        border-radius:0;padding:18px 20px;transition:border-color .2s,background .2s;
      }
      .cvz-card:hover{border-color:rgba(79,209,197,.2);background:rgba(79,209,197,.02);}
      .cvz-card-label{
        font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;
        margin-bottom:10px;display:flex;align-items:center;gap:7px;
      }
      .cvz-card-label-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0;}
      .cvz-card-body{font-size:14px;color:#c4cdd6;line-height:1.65;}
      .cvz-card-empfehlungen .cvz-card-body{font-size:14px;color:#e8edf5;}
      .cvz-card-empfehlungen .cvz-card-body li{color:#e8edf5;font-size:14px;}
      .cvz-card-empfehlungen .cvz-card-body li li,
      .cvz-card-empfehlungen .cvz-card-body ul ul li,
      .cvz-card-empfehlungen .cvz-card-body ol ol li{color:#e8edf5!important;font-size:14px!important;}
      .cvz-card-body li{color:#e8edf5;font-size:14px;}
      .cvz-card-body *{color:inherit;}
      .cvz-card-empfehlungen .cvz-card-body,
      .cvz-card-empfehlungen .cvz-card-body *{color:#e8edf5!important;font-size:14px!important;}
      .cvz-card-empfehlungen .cvz-card-body strong{color:#ffffff!important;}
      .cvz-card-body p{margin:0 0 6px}.cvz-card-body p:last-child{margin-bottom:0}
      .cvz-card-body ul,.cvz-card-body ol{padding-left:18px;margin:0}
      .cvz-card-body li{margin-bottom:6px}
      .cvz-card-body strong{color:#e2e8f0}
      .cvz-card-summary    .cvz-card-label{color:#718096}
      .cvz-card-summary    .cvz-card-label-dot{background:#718096}
      .cvz-card-staerken   .cvz-card-label{color:#4fd1c5}
      .cvz-card-staerken   .cvz-card-label-dot{background:#4fd1c5}
      .cvz-card-schwaechen .cvz-card-label{color:#ef4444}
      .cvz-card-schwaechen .cvz-card-label-dot{background:#ef4444}
      .cvz-card-empfehlungen .cvz-card-label{color:#718096}
      .cvz-card-empfehlungen .cvz-card-label-dot{background:#718096}

      /* Executive Summary: Score Panel */
      .cvz-exec-panel{
        background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);
        border-radius:0;padding:24px 28px;
        display:flex;gap:28px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px;
      }
      .cvz-ring{flex-shrink:0;text-align:center;animation:cvzRing .75s cubic-bezier(.34,1.56,.64,1) .15s both;}
      .cvz-ring-c{
        width:96px;height:96px;border-radius:50%;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
      }
      .cvz-ring-n{font-size:30px;font-weight:700;line-height:1;}
      .cvz-ring-d{font-size:11px;color:#718096;margin-top:2px;}
      .cvz-ring-l{font-size:10px;color:#4a5568;margin-top:8px;letter-spacing:.08em;text-transform:uppercase;}
      .cvz-bars{flex:1;min-width:200px;}
      .cvz-br{display:flex;align-items:center;gap:8px;margin-bottom:7px;cursor:default;}
      .cvz-br:last-child{margin-bottom:0}
      .cvz-bl{font-size:13px;color:#718096;width:100px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .15s;}
      .cvz-br:hover .cvz-bl{color:#e2e8f0}
      .cvz-bt{flex:1;height:5px;background:rgba(255,255,255,.06);border-radius:0;overflow:hidden;}
      .cvz-bf{height:100%;border-radius:0;width:0;background:#4fd1c5;opacity:.75;
              animation:cvzBar 1s cubic-bezier(.4,0,.2,1) .65s forwards;transition:opacity .15s,filter .15s;}
      .cvz-br:hover .cvz-bf{opacity:1;filter:brightness(1.15)}
      .cvz-bv{font-size:14px;font-family:'DM Mono',monospace;width:32px;text-align:right;flex-shrink:0;color:#4fd1c5;}

      /* Kategorien außerhalb des Gesamt-Scores (Performance, AI Sichtbarkeit) */
      .cvz-bars-divider{
        display:flex;align-items:center;gap:10px;margin:14px 0 10px;
      }
      .cvz-bars-divider::before,
      .cvz-bars-divider::after{
        content:'';flex:1;height:1px;background:rgba(255,255,255,.08);
      }
      .cvz-bars-divider-t{
        font-size:9px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;
        color:#4a5568;white-space:nowrap;
      }
      .cvz-br-extra .cvz-bl{color:#5a6675;}
      .cvz-br-extra:hover .cvz-bl{color:#c4cdd6;}
      .cvz-br-extra .cvz-bf{background:#718096;opacity:.55;}
      .cvz-br-extra:hover .cvz-bf{opacity:.8;}
      .cvz-br-extra .cvz-bv{color:#8b98a8;}
      @media(max-width:768px){
        .cvz-bars-divider-t{font-size:8px;letter-spacing:.06em;}
      }

      /* Executive Summary: Badges */
      .cvz-badges{display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;}
      .cvz-badge{
        flex:1;min-width:150px;
        background:rgba(79,209,197,.05);border:1px solid rgba(79,209,197,.18);
        border-radius:0;padding:13px 15px;
        transition:border-color .2s,background .2s,transform .2s;cursor:default;
      }
      .cvz-badge:hover{border-color:rgba(79,209,197,.32);background:rgba(79,209,197,.08);transform:translateY(-1px)}
      .cvz-badge-h{display:flex;align-items:center;gap:7px;margin-bottom:7px;}
      .cvz-badge-dot{width:6px;height:6px;border-radius:50%;background:#4fd1c5;flex-shrink:0;}
      .cvz-badge-t{font-size:11px;font-weight:600;color:#4fd1c5;letter-spacing:.05em;text-transform:uppercase;}
      .cvz-badge-tx{font-size:14px;color:#718096;line-height:1.55;}

      /* Sektions-Überschriften */
      .cvz-heading-wrap{max-width:1200px;margin:0 auto;padding:56px 24px 24px;text-align:center;}
      .cvz-heading-wrap.cvz-heading-top{border-top:none!important;}
      .cvz-heading-title{
        font-family:'Syne',sans-serif;
        /* Schriftgröße so gewählt, dass das längste Wort (PERFORMANCE, ca. 13,5em
           breit in Syne 800) immer in eine Zeile passt: verfügbare Breite / 14.
           Auf Desktop greift weiterhin 6vw, weil das dort kleiner ist. */
        font-size:clamp(20px,min(6vw,calc((100vw - 48px) / 14)),80px);
        font-weight:800;letter-spacing:-.02em;overflow-wrap:anywhere;
        color:rgba(148,163,184,.25);text-transform:uppercase;line-height:1!important;margin-bottom:12px;
      }
      .cvz-heading-wrap,.cvz-heading-wrap *{line-height:1.2!important;}

      /* Webflow Section-Wrapper resetten */
      .section-hero-info,
      .section-executive-summary,
      .section-deep-dive-hero,
      .section-deep-dive-content,
      .section-deep-dive-zielgruppe,
      .section-deep-dive-conversion,
      .section-deep-dive-struktur,
      .section-deep-dive-searchintent,
      .section-deep-dive-differenzierung,
      .section-deep-dive-performance,
      .section-deep-dive-ai,
      .section-roadmap,
      .section-ki-agent-btn {
        padding: 0 !important;
        margin: 0 !important;
        display: block !important;
        width: 100% !important;
        flex-direction: unset !important;
        align-items: unset !important;
        justify-content: unset !important;
        gap: unset !important;
      }
      .cvz-heading-sub{font-size:14px;color:#718096;line-height:1.6;max-width:640px;margin:8px auto 0;}

      /* Info Grid (Hero Block) */
      .cvz-info-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;}
      .section-hero-info .cvz-card{border-bottom:none!important;}
      .section-hero-info .cvz-card{
        background:#0d1117!important;
        border:1px solid rgba(255,255,255,.07)!important;
        color:#e2e8f0!important;
      }
      .cvz-info-label{font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#4a5568!important;}
      .cvz-info-value{font-size:14px;color:#c4cdd6!important;line-height:1.5;word-break:break-all;}
      .cvz-info-row{
        padding:12px 0;border-bottom:1px solid rgba(255,255,255,.05);
        display:flex;flex-direction:column;gap:4px;padding-right:24px;
      }
      .cvz-info-row:nth-last-child(-n+2){border-bottom:none;}
      .cvz-info-row:last-child{border-bottom:none!important;}

      /* KI-Agent Button */
      .cvz-ki-btn-wrap{
        text-align:center;padding:32px 24px;max-width:1200px;margin:0 auto;
        display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;
      }
      .cvz-ki-btn{
        display:inline-flex;align-items:center;gap:8px;
        background:#4fd1c5;color:#0d1117;
        font-family:'Syne','Geist',sans-serif;
        font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
        text-decoration:none;padding:14px 32px;border-radius:0;
        transition:background .2s,transform .2s,box-shadow .2s;cursor:pointer;border:none;
      }
      .cvz-ki-btn:hover{background:#38b2ac;transform:translateY(-2px);box-shadow:0 8px 24px rgba(79,209,197,.25);}
      .cvz-pdf-btn{
        display:inline-flex;align-items:center;gap:8px;
        background:transparent;color:#e2e8f0;
        font-family:'Syne','Geist',sans-serif;
        font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
        text-decoration:none;padding:14px 32px;border-radius:0;
        border:1px solid rgba(255,255,255,.15);
        transition:border-color .2s,color .2s,transform .2s;cursor:pointer;
      }
      .cvz-pdf-btn:hover{border-color:rgba(255,255,255,.35);color:#fff;transform:translateY(-2px);}
      .cvz-pdf-btn:disabled,.cvz-pdf-btn.loading{opacity:.5;cursor:not-allowed;transform:none;}
      .cvz-pdf-btn svg{flex-shrink:0;}
      .cvz-click-hint{
        position:fixed;z-index:10000;max-width:220px;
        background:#161b22;border:1px solid rgba(255,255,255,.12);color:#e2e8f0;
        font-family:'Geist','DM Sans',sans-serif;font-size:12px;line-height:1.4;
        padding:8px 12px;border-radius:0;box-shadow:0 4px 16px rgba(0,0,0,.4);
        pointer-events:none;opacity:0;transform:translateY(4px);
        transition:opacity .15s ease,transform .15s ease;
      }
      .cvz-click-hint.cvz-click-hint-visible{opacity:1;transform:translateY(0);}
      .cvz-agent-hint{
        max-width:1200px;margin:0 auto;padding:0 24px 12px;text-align:center;
        font-size:12px;color:#4a5568;line-height:1.6;font-family:'Geist','DM Sans',sans-serif;
      }
      @media(max-width:480px){
        .cvz-ki-btn-wrap{flex-direction:column;}
        .cvz-ki-btn,.cvz-pdf-btn{width:100%;justify-content:center;}
      }

      /* === Roadmap aus priority_matrix-JSON === */
      .cvz-roadmap{display:flex;flex-direction:column;gap:16px;}
      .cvz-rm-group{
        background:rgba(255,255,255,.03);
        border:1px solid rgba(255,255,255,.07);
        border-radius:0;overflow:hidden;
      }
      .cvz-rm-head{
        padding:12px 18px;font-size:11px;font-weight:700;
        letter-spacing:.08em;text-transform:uppercase;
        border-bottom:1px solid rgba(255,255,255,.06);
      }
      .cvz-rm-sofort    .cvz-rm-head{color:#ef4444;background:rgba(239,68,68,.06);}
      .cvz-rm-naechstes .cvz-rm-head{color:#f59e0b;background:rgba(245,158,11,.06);}
      .cvz-rm-quickwins .cvz-rm-head{color:#10b981;background:rgba(16,185,129,.06);}
      .cvz-rm-spaeter   .cvz-rm-head{color:#718096;background:rgba(113,128,150,.06);}
      .cvz-rm-item{padding:14px 18px;border-bottom:1px solid rgba(255,255,255,.05);}
      .cvz-rm-item:last-child{border-bottom:none;}
      .cvz-rm-item-cat{
        font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
        color:#4a5568;margin-bottom:4px;
      }
      .cvz-rm-item-title{font-size:14px;font-weight:600;color:#e8edf5;line-height:1.5;font-family:'Syne',sans-serif;}
      .cvz-rm-rea{font-size:13px;color:#c4cdd6;line-height:1.6;margin-top:6px;}
      .cvz-rm-meta{
      font-size:11px;font-weight:600;color:#718096;
      margin-top:4px;letter-spacing:.02em;
      }
      .cvz-prio{display:flex;flex-direction:column;gap:14px;}
      .cvz-pr-item{padding-left:14px;border-left:3px solid #718096;}
      .cvz-pr-crit{border-left-color:#ef4444;}
      .cvz-pr-high{border-left-color:#f59e0b;}
      .cvz-pr-med{border-left-color:#10b981;}
      .cvz-pr-badge{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px;}
      .cvz-pr-item .cvz-pr-badge{color:#a3b5c4;}
      .cvz-pr-problem{font-size:14px;font-weight:600;color:#e8edf5;line-height:1.5;}
      .cvz-pr-loesung{font-size:13px;color:#c4cdd6;line-height:1.6;margin-top:6px;}
      .cvz-pr-aufwand{color:#718096;font-weight:600;}
      .cvz-pr-loesung-label{
        display:inline-block;margin-right:6px;font-size:10px;font-weight:700;
        letter-spacing:.1em;text-transform:uppercase;color:#4fd1c5;
      }

      /* === NEU: Cross-Reference-Verweis und Cross-Category-Badge === */
      .cvz-pr-crossref{
        display:flex;align-items:center;gap:8px;
        padding:10px 14px;font-size:13px;color:#718096;
        background:rgba(255,255,255,.02);border-radius:0;
      }
      .cvz-pr-crossref-icon{color:#4a5568;flex-shrink:0;}
      .cvz-pr-crossbadge{
        display:inline-block;margin-left:8px;
        font-size:10px;font-weight:600;letter-spacing:.02em;text-transform:none;
        color:#a78bfa;background:rgba(167,139,250,.1);
        padding:2px 8px;border-radius:0;vertical-align:middle;
      }

      /* Responsive */
      @media(max-width:768px){
        .cvz-section{padding:16px;}
        .cvz-exec-panel{flex-direction:column;align-items:stretch;padding:20px 16px;gap:20px;}
        .cvz-ring{width:100%;display:flex;flex-direction:column;align-items:center;}
        .cvz-bars{width:100%;}
        .cvz-badges{flex-direction:column;}
        .cvz-badge{min-width:0;flex:1 1 100%;}
        .cvz-bars{min-width:0;}
        .cvz-bl{width:76px;}
        .cvz-info-grid{grid-template-columns:1fr;}
        .cvz-info-row:nth-last-child(-n+2){border-bottom:1px solid rgba(255,255,255,.05);}
        .cvz-info-row:last-child{border-bottom:none;}
      }
      @media(max-width:480px){
        .cvz-heading-wrap{padding-left:16px;padding-right:16px;}
        .cvz-heading-title{font-size:clamp(20px,calc((100vw - 32px) / 14),36px);}
      }

      /* KI-Disclaimer */
      .cvz-ki-disclaimer{
        max-width:1200px;margin:0 auto;padding:20px 24px 40px;
        color:#4a5568;font-size:12px;line-height:1.6;text-align:center;
        border-top:1px solid rgba(255,255,255,.06);
      }
      @media(max-width:768px){
        .cvz-ki-disclaimer{padding:16px 16px 32px;}
      }

      /* ══════════════════════════════════════════════════════════════════════
         AUFKLAPPBARE BEREICHE (v9)
         Optik wie im Visibility Tracker: teal Pfeil (▸ zu, ▾ offen), Hover mit
         leichtem Teal-Hintergrund, Inhalt mit Linie am Rand.
         Alles basiert auf dem HTML-Element <details>/<summary>. Das ist
         tastaturbedienbar (Enter/Leertaste) und braucht kein eigenes JS fürs
         Auf- und Zuklappen.
         ══════════════════════════════════════════════════════════════════════ */
      .cvz-fold > summary{list-style:none;cursor:pointer;}
      .cvz-fold > summary::-webkit-details-marker{display:none;}
      .cvz-fold > summary::before{
        content:'▸';display:inline-block;width:16px;flex-shrink:0;
        color:#4fd1c5;font-size:14px;font-weight:700;line-height:1;
      }
      .cvz-fold[open] > summary::before{content:'▾';}
      .cvz-fold > summary:focus-visible{outline:2px solid #4fd1c5;outline-offset:2px;}

      /* Ebene 1: Kategorie */
      .cvz-acc{
        background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:0;
      }
      .cvz-acc > summary.cvz-acc-head{
        display:flex;align-items:center;gap:12px;flex-wrap:wrap;
        padding:16px 20px;border-left:3px solid rgba(255,255,255,.12);
        transition:background .15s;
      }
      .cvz-acc > summary.cvz-acc-head:hover{background:rgba(79,209,197,.06);}
      .cvz-acc[open] > summary.cvz-acc-head{border-bottom:1px solid rgba(255,255,255,.08);border-left-color:#4fd1c5;}
      .cvz-acc-teaser{
        order:3;flex:1 1 100%;padding-left:26px;font-size:13px;color:#a3b5c4;line-height:1.5;
        display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
      }
      .cvz-acc[open] .cvz-acc-teaser{display:none;}
      .cvz-acc-head .cvz-cat-name{flex:0 1 auto;min-width:0;overflow-wrap:anywhere;}
      .cvz-acc-meta{flex:1 1 auto;min-width:0;font-size:12px;color:#718096;}
      .cvz-acc-head .cvz-cat-score{margin-left:auto;flex-shrink:0;}
      .cvz-acc-body{padding:20px;}
      .cvz-acc-body .cvz-cards{margin-bottom:0;}

      /* Ebene 2a: Stärken (eingeklappte Karte) */
      details.cvz-fold-card > summary{display:flex;align-items:center;gap:8px;}
      details.cvz-fold-card > summary .cvz-card-label{margin-bottom:0;}
      details.cvz-fold-card[open] > summary .cvz-card-label{margin-bottom:10px;}
      details.cvz-fold-card > summary:hover .cvz-card-label{filter:brightness(1.2);}

      /* Ebene 2b: einzelne Handlungsempfehlung (Problem sichtbar, Lösung aufklappbar) */
      details.cvz-fold-item > summary{display:flex;align-items:flex-start;gap:8px;}
      details.cvz-fold-item > summary::before{margin-top:3px;}
      .cvz-pr-sumtext{flex:1 1 auto;min-width:0;}
      details.cvz-fold-item > summary .cvz-pr-badge{margin-bottom:2px;}
      details.cvz-fold-item > summary:hover .cvz-pr-problem{color:#ffffff;}
      .cvz-pr-body{padding-left:24px;}
      .cvz-pr-body .cvz-pr-loesung{margin-top:2px;}

      /* Roadmap-Gruppen */
      details.cvz-fold-rm > summary.cvz-rm-head{
        display:flex;align-items:center;gap:8px;border-bottom:none;
        transition:filter .15s;
      }
      details.cvz-fold-rm > summary.cvz-rm-head::before{color:currentColor;}
      details.cvz-fold-rm > summary.cvz-rm-head:hover{filter:brightness(1.2);}
      details.cvz-fold-rm[open] > summary.cvz-rm-head{border-bottom:1px solid rgba(255,255,255,.06);}

      /* Button "Alle aufklappen / zuklappen" */
      .cvz-expand-bar{
        max-width:1200px;margin:0 auto;padding:0 24px 12px;
        display:flex;justify-content:flex-end;
      }
      .cvz-expand-btn{
        font-family:'Geist','DM Sans',sans-serif;font-size:12px;padding:7px 14px;
        background:none;color:#4fd1c5;border:1px solid #4fd1c5;border-radius:0;cursor:pointer;
        transition:background .15s;
      }
      .cvz-expand-btn:hover{background:rgba(79,209,197,.1);}
      .cvz-expand-btn:focus-visible{outline:2px solid #4fd1c5;outline-offset:2px;}

      @media(max-width:768px){
        .cvz-acc > summary.cvz-acc-head{padding:14px 14px;gap:8px 10px;}
        .cvz-acc-meta{order:2;flex:1 1 100%;padding-left:26px;}
        .cvz-acc-body{padding:14px;}
        .cvz-expand-bar{padding:0 16px 12px;}
      }
    `;
    document.head.appendChild(s);
    if (!document.getElementById('cvz-bsp-fonts')) {
      const fl = document.createElement('link');
      fl.id = 'cvz-bsp-fonts';
      fl.rel = 'stylesheet';
      fl.href = 'https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Geist:wght@300..900&display=swap';
      document.head.appendChild(fl);
    }
  }

  // ── Design System Helpers ───────────────────────────────────────────────────
  function getRingColor(s) {
    if (s === null) return '#4a5568';
    if (s >= 8)    return '#10b981';
    if (s >= 6)    return '#3b82f6';
    if (s >= 4)    return '#f59e0b';
    return '#ef4444';
  }
  function getRingBg(s) {
    if (s === null) return 'rgba(74,85,104,0.08)';
    if (s >= 8)    return 'rgba(16,185,129,0.08)';
    if (s >= 6)    return 'rgba(59,130,246,0.08)';
    if (s >= 4)    return 'rgba(245,158,11,0.08)';
    return 'rgba(239,68,68,0.08)';
  }
  function sc(v) { const n = parseFloat(v); return isNaN(n) ? null : n; }

  // === robust gegen Objekt/Array/fehlend (gleiche Logik wie Agent-Fix) ===
  function toArray(v) {
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') return [v];
    return [];
  }

  function card(type, label, content) {
    if (!content) return '';
    const cls = {
      summary:      'cvz-card-summary',
      staerken:     'cvz-card-staerken',
      schwaechen:   'cvz-card-schwaechen',
      empfehlungen: 'cvz-card-empfehlungen',
    }[type] || '';
    const safeContent = sanitize(content);
    const safeLabel   = label.replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `
      <div class="cvz-card ${cls} cvz-fi cvz-fi-3">
        <div class="cvz-card-label">
          <div class="cvz-card-label-dot"></div>${safeLabel}
        </div>
        <div class="cvz-card-body">${safeContent}</div>
      </div>`;
  }

  function buildCatSection(name, scoreVal, cards) {
    const s = sc(scoreVal);
    const color = getRingColor(s);
    const scoreDisplay = s !== null ? s.toFixed(1) : '–';
    return `
      <div class="cvz-section cvz-fi cvz-fi-2">
        <div class="cvz-cat-header">
          <div class="cvz-cat-name">${name}</div>
          <div class="cvz-cat-score">${scoreDisplay}</div>
        </div>
        <div class="cvz-cards">${cards}</div>
      </div>`;
  }

  // === Defensiver Roadmap-Renderer ===
  // Nutzt priority_matrix (JSON) wenn befüllt, sonst Fallback auf priority_matrix_html.
  // Dadurch funktioniert der Report mit ALTEN (HTML) und NEUEN (JSON) Analysen.
  function buildRoadmap(analysis) {
    const pm = analysis.priority_matrix;
    const hasData = pm && typeof pm === 'object' &&
      (toArray(pm.sofort_umsetzen).length || toArray(pm.als_naechstes).length ||
       toArray(pm.quick_wins).length      || toArray(pm.spaeter).length);
    // FALLBACK: kein verwertbares JSON -> altes HTML-Feld
    if (!hasData) {
      return `
        <div class="cvz-section cvz-fi cvz-fi-2">
          <div class="cvz-cat-header"><div class="cvz-cat-name">Roadmap</div></div>
          <div class="cvz-cards">
            ${card('empfehlungen','Priorisierte Handlungsempfehlungen', analysis.priority_matrix_html)}
          </div>
        </div>`;
    }
    // NEU: aus JSON rendern
    const gruppen = [
      { key:'sofort_umsetzen', label:'Sofort umsetzen', cls:'sofort'    },
      { key:'als_naechstes',   label:'Als Nächstes',    cls:'naechstes' },
      { key:'quick_wins',      label:'Quick Wins',      cls:'quickwins' },
      { key:'spaeter',         label:'Später',          cls:'spaeter'   },
    ];
    // Impact/Effort lesbar machen (SEHR_HOCH -> Sehr hoch)
    const pretty = s => s.replace(/_/g,' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());
    let gruppenHtml = '';
    for (const g of gruppen) {
      const items = toArray(pm[g.key]);
      if (items.length === 0) continue;
      let itemsHtml = '';
      for (const it of items) {
        const cat    = sanitize(String(it.category || 'Optimierung'));
        const iss    = sanitize(String(it.issue || ''));
        const rea    = sanitize(String(it.reasoning || ''));
        const impact = sanitize(String(it.impact || ''));
        const effort = sanitize(String(it.effort || ''));
        const meta = (impact || effort)
          ? `<div class="cvz-rm-meta">${impact ? 'Impact: ' + pretty(impact) : ''}${impact && effort ? ' · ' : ''}${effort ? 'Aufwand: ' + pretty(effort) : ''}</div>`
          : '';
        itemsHtml += `
          <div class="cvz-rm-item">
            <div class="cvz-rm-item-cat">${cat}</div>
            <div class="cvz-rm-item-title">${iss}</div>
            ${meta}
            ${rea ? `<div class="cvz-rm-rea">${rea}</div>` : ''}
          </div>`;
      }
      gruppenHtml += `
        <div class="cvz-rm-group cvz-rm-${g.cls}">
          <div class="cvz-rm-head">${g.label}</div>
          <div class="cvz-rm-items">${itemsHtml}</div>
        </div>`;
    }
    return `
      <div class="cvz-section cvz-fi cvz-fi-2">
        <div class="cvz-cat-header"><div class="cvz-cat-name">Roadmap</div></div>
        <div class="cvz-roadmap">${gruppenHtml}</div>
      </div>`;
  }

  const CVZ_SEV = {
    critical: { label: 'Kritisch', cls: 'crit' },
    high:     { label: 'Hoch',     cls: 'high' },
    medium:   { label: 'Mittel',   cls: 'med'  },
  };
  function cvzAufwand(s) {
    const m = { gering:'Gering', mittel:'Mittel', hoch:'Hoch' };
    return m[String(s).toLowerCase()] || sanitize(String(s||''));
  }

  // ⚠️ Felder *_schwaechen_prioritized_html enthalten trotz "_html"-Suffix
  // JSON-DATEN (Array), KEIN HTML. Niemals direkt via innerHTML rendern —
  // immer über buildPrioCard() (Fallback für alte Analysen ohne dedup_findings)
  // oder buildPrioCardFromDedup() (neue Analysen mit deduplizierten Findings).
  function buildPrioCard(field) {
    let data = field;
    if (typeof field === 'string') {
      const t = field.trim();
      if (t.startsWith('[') || t.startsWith('{')) {
        try { data = JSON.parse(t); } catch (e) { data = null; }
      } else {
        // Alte Analyse: echtes HTML -> Fallback
        return t ? card('empfehlungen', 'Priorisierte Handlungsempfehlungen', field) : '';
      }
    }
    const items = toArray(data);
    if (items.length === 0) return '';
    let inner = '';
    for (const it of items) {
      const sevKey = String(it.severity || '').toLowerCase();
      const sev = CVZ_SEV[sevKey] || { label: String(it.severity||''), cls: 'med' };
      const problem = sanitize(String(it.problem || it.issue || ''));
      const loesung = sanitize(String(it.loesung || ''));
      const aufwand = it.aufwand ? cvzAufwand(it.aufwand) : '';
      inner += `<div class="cvz-pr-item cvz-pr-${sev.cls}">`
        + `<div class="cvz-pr-badge">${sev.label}</div>`
        + `<div class="cvz-pr-problem">${problem}</div>`
        + (loesung
            ? `<div class="cvz-pr-loesung"><span class="cvz-pr-loesung-label">Lösung</span> ${loesung}`
              + (aufwand ? ` <span class="cvz-pr-aufwand">Aufwand: ${aufwand}</span>` : '')
              + `</div>`
            : '')
        + `</div>`;
    }
    return `
      <div class="cvz-card cvz-card-empfehlungen cvz-fi cvz-fi-3">
        <div class="cvz-card-label"><div class="cvz-card-label-dot"></div>Priorisierte Handlungsempfehlungen</div>
        <div class="cvz-card-body"><div class="cvz-prio">${inner}</div></div>
      </div>`;
  }

  // === NEU: Liest deduplizierte Findings aus dedup_findings (Supabase jsonb) ===
  // dedup_findings enthält {category_findings: {...}, roadmap_matrix: {...}}.
  // Gibt null zurück, wenn die Analyse noch keine dedup_findings hat (alte
  // Analysen) - dann greift in den Sektions-Buildern der Fallback auf
  // buildPrioCard() mit dem alten *_schwaechen_prioritized_html-Feld.
  function getDedupCategory(analysis, label) {
    let dd = analysis.dedup_findings;
    if (!dd) return null;
    if (typeof dd === 'string') {
      try { dd = JSON.parse(dd); } catch (e) { return null; }
    }
    const cf = dd.category_findings || dd;
    if (!cf || typeof cf !== 'object') return null;
    const arr = cf[label];
    if (!Array.isArray(arr) || arr.length === 0) return null;
    // Erkennung ALTER, fehlerhafter Daten: das alte Modul D (vor v1.3) hat bei
    // nicht-primären Cluster-Mitgliedern problem/loesung durch einen Platzhalter
    // ("Verwandtes Thema bereits unter X beschrieben") ersetzt und dabei ein
    // cross_reference-Feld gesetzt, das die neue Modul-D-Version nicht mehr
    // kennt. Finden wir dieses Feld, stammt der Datensatz noch aus der alten
    // Logik - dann lieber auf die rohen, unbearbeiteten Kategorie-Felder
    // zurückfallen (vollständige Information) statt die kaputten
    // Platzhalter-Texte anzuzeigen.
    const hasOldFormatArtifact = arr.some(it => it && it.cross_reference === true);
    if (hasOldFormatArtifact) return null;
    return arr;
  }

  // === Anzeigenamen für Kategorien, die intern anders heißen als im UI ===
  // Wettbewerb ist der interne Pipeline-Name (Make.com/SP2/SP3-Feld), im
  // Frontend soll dem Nutzer aber immer "Differenzierung" angezeigt werden.
  const CVZ_CATEGORY_DISPLAY_NAMES = {
    'Wettbewerb': 'Differenzierung',
  };
  function displayCategoryName(cat) {
    return CVZ_CATEGORY_DISPLAY_NAMES[cat] || cat;
  }

  // === NEU: Rendert eine Kategorie-Karte aus deduplizierten Findings ===
  // Verhält sich analog zu buildPrioCard(), rendert aber zusätzlich:
  //   - cross_reference: true  -> kompakte Verweis-Zeile statt voller Karte
  //   - cross_category (Array) -> Badge "Betrifft auch: ..." an der Karte
  function buildPrioCardFromDedup(items, currentCategory) {
    if (!items || items.length === 0) return '';
    let inner = '';
    for (const it of items) {
      const sevKey = String(it.severity || '').toLowerCase();
      const sev = CVZ_SEV[sevKey] || { label: String(it.severity||''), cls: 'med' };
      const problem = sanitize(String(it.problem || ''));
      const loesung = sanitize(String(it.loesung || ''));
      const aufwand = it.aufwand ? cvzAufwand(it.aufwand) : '';
      let crossBadge = '';
      if (it.cross_category && Array.isArray(it.cross_category) && it.cross_category.length > 1) {
        const others = it.cross_category
          .filter(c => c !== currentCategory)
          .map(displayCategoryName);
        if (others.length > 0) {
          crossBadge = `<span class="cvz-pr-crossbadge">Betrifft auch: ${sanitize(others.join(', '))}</span>`;
        }
      }
      inner += `<div class="cvz-pr-item cvz-pr-${sev.cls}">`
        + `<div class="cvz-pr-badge">${sev.label}${crossBadge}</div>`
        + `<div class="cvz-pr-problem">${problem}</div>`
        + (loesung
            ? `<div class="cvz-pr-loesung"><span class="cvz-pr-loesung-label">Lösung</span> ${loesung}`
              + (aufwand ? ` <span class="cvz-pr-aufwand">Aufwand: ${aufwand}</span>` : '')
              + `</div>`
            : '')
        + `</div>`;
    }
    return `
      <div class="cvz-card cvz-card-empfehlungen cvz-fi cvz-fi-3">
        <div class="cvz-card-label"><div class="cvz-card-label-dot"></div>Priorisierte Handlungsempfehlungen</div>
        <div class="cvz-card-body"><div class="cvz-prio">${inner}</div></div>
      </div>`;
  }

  // ── XSS-Sanitization ──────────────────────────────────────────────────────
  // Erlaubt nur sichere HTML-Tags aus Claude-Output (Listen, Bold, Paragraphen)
  function sanitize(html) {
    if (!html) return '';
    const allowed = {
      'p':true,'br':true,'strong':true,'b':true,'em':true,'i':true,
      'ul':true,'ol':true,'li':true,'span':true,'small':true,
    };
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    // Entferne alle nicht erlaubten Tags und gefährliche Attribute
    tmp.querySelectorAll('*').forEach(el => {
      if (!allowed[el.tagName.toLowerCase()]) {
        el.replaceWith(document.createTextNode(el.textContent));
        return;
      }
      // Entferne alle Attribute außer class
      Array.from(el.attributes).forEach(attr => {
        if (attr.name !== 'class') el.removeAttribute(attr.name);
      });
    });
    return tmp.innerHTML;
  }

  function txt(v) { return v ? `<p>${sanitize(String(v))}</p>` : ''; }

  // ── Aufklappbare Bereiche (v9) ──────────────────────────────────────────────
  // WHY nachträglich per DOM statt in den Builder-Funktionen oben: buildCatSection,
  // buildPrioCard, buildPrioCardFromDedup und buildRoadmap bleiben unverändert,
  // damit an der Dedup-/Fallback-/Sanitizing-Logik nichts kaputtgehen kann. Wir
  // legen erst NACH dem Rendern <details>-Hüllen um die fertigen Teile. Jedes
  // Teil wird dabei nur verschoben, nie neu aus Text gebaut (XSS-sicher). Jede
  // Funktion prüft vorher, ob die erwartete Struktur da ist, und tut sonst
  // nichts. Dadurch kann ein unerwartetes Format den Report nie leer machen.

  const CVZ_CATEGORY_HOSTS = [
    '.section-deep-dive-hero',
    '.section-deep-dive-content',
    '.section-deep-dive-zielgruppe',
    '.section-deep-dive-conversion',
    '.section-deep-dive-struktur',
    '.section-deep-dive-searchintent',
    '.section-deep-dive-differenzierung',
    '.section-deep-dive-performance',
    '.section-deep-dive-ai',
  ];

  // Erzeugt ein <details>-Element. Alle Aufklapp-Elemente tragen die Klasse
  // "cvz-fold", darüber findet auch der Button "Alle aufklappen" sie wieder.
  function makeFold(extraClasses, open) {
    const d = document.createElement('details');
    d.className = 'cvz-fold ' + extraClasses;
    if (open) d.open = true;
    return d;
  }

  // Einzelne Handlungsempfehlung: Schweregrad + Problem sichtbar, Lösung klappt auf.
  // CRITICAL ist standardmäßig offen, damit die dringendsten Lösungen nie verborgen sind.
  function foldPrioItems() {
    document.querySelectorAll('.cvz-pr-item').forEach(item => {
      if (item.tagName === 'DETAILS') return;
      const badge   = item.querySelector('.cvz-pr-badge');
      const problem = item.querySelector('.cvz-pr-problem');
      const loesung = item.querySelector('.cvz-pr-loesung');
      if (!badge || !problem || !loesung) return; // ohne Lösung gibt es nichts zu verbergen

      const det = makeFold('cvz-fold-item ' + item.className, item.classList.contains('cvz-pr-crit'));
      const sum = document.createElement('summary');
      const sumText = document.createElement('div');
      sumText.className = 'cvz-pr-sumtext';
      sumText.appendChild(badge);
      sumText.appendChild(problem);
      sum.appendChild(sumText);

      const body = document.createElement('div');
      body.className = 'cvz-pr-body';
      body.appendChild(loesung);

      det.appendChild(sum);
      det.appendChild(body);
      item.replaceWith(det);
    });
  }

  // "Stärken"-Karten in den Kategorien einklappen (Executive Summary bleibt unberührt,
  // dort gibt es keine .cvz-card-label und die Funktion überspringt sie).
  function foldStrengths() {
    CVZ_CATEGORY_HOSTS.forEach(sel => {
      const host = document.querySelector(sel);
      if (!host) return;
      host.querySelectorAll('.cvz-card-staerken').forEach(cardEl => {
        if (cardEl.tagName === 'DETAILS') return;
        const label = cardEl.querySelector('.cvz-card-label');
        const body  = cardEl.querySelector('.cvz-card-body');
        if (!label || !body) return;

        const det = makeFold('cvz-fold-card ' + cardEl.className, false);
        const sum = document.createElement('summary');
        sum.appendChild(label);
        det.appendChild(sum);
        det.appendChild(body);
        cardEl.replaceWith(det);
      });
    });
  }

  // Ganze Kategorie: Kopfzeile (Name, Kurzinfo, Score) bleibt sichtbar, der Rest klappt auf.
  function foldCategories() {
    CVZ_CATEGORY_HOSTS.forEach(sel => {
      const host = document.querySelector(sel);
      if (!host) return;
      const section = host.querySelector('.cvz-section');
      if (!section || section.querySelector('details.cvz-acc')) return;

      const head   = section.querySelector('.cvz-cat-header');
      const cards  = section.querySelector('.cvz-cards');
      const nameEl = head && head.querySelector('.cvz-cat-name');
      const scoreEl = head && head.querySelector('.cvz-cat-score');
      if (!head || !cards || !nameEl || !scoreEl) return;

      // Kurzinfo für die zugeklappte Zeile: "3 Empfehlungen · 1 kritisch"
      const total = cards.querySelectorAll('.cvz-pr-item').length;
      const crit  = cards.querySelectorAll('.cvz-pr-crit').length;
      let metaText = '';
      if (total > 0) {
        metaText = total + (total === 1 ? ' Empfehlung' : ' Empfehlungen');
        if (crit > 0) metaText += ' · ' + crit + ' kritisch';
      }

      const det = makeFold('cvz-acc', false);
      const sum = document.createElement('summary');
      sum.className = 'cvz-acc-head';
      // Farbiger Balken links = Score auf einen Blick (gleiche Farben wie im Gesamt-Ring)
      sum.appendChild(nameEl);
      if (metaText) {
        const meta = document.createElement('span');
        meta.className = 'cvz-acc-meta';
        meta.textContent = metaText;
        sum.appendChild(meta);
      }
      sum.appendChild(scoreEl);
      // Einzeiler aus der Zusammenfassung, damit die zugeklappte Zeile eine Aussage hat
      const sumBody = cards.querySelector('.cvz-card-summary .cvz-card-body');
      const teaserTxt = sumBody ? sumBody.textContent.replace(/\s+/g, ' ').trim() : '';
      if (teaserTxt) {
        const teaser = document.createElement('div');
        teaser.className = 'cvz-acc-teaser';
        teaser.textContent = teaserTxt;
        sum.appendChild(teaser);
      }

      const body = document.createElement('div');
      body.className = 'cvz-acc-body';
      body.appendChild(cards);

      det.appendChild(sum);
      det.appendChild(body);
      section.textContent = '';
      section.appendChild(det);
    });
  }

  // Roadmap-Gruppen: "Sofort umsetzen" offen, der Rest zu (mit Anzahl im Titel).
  function foldRoadmapGroups() {
    document.querySelectorAll('.section-roadmap .cvz-rm-group').forEach(group => {
      if (group.tagName === 'DETAILS') return;
      const head  = group.querySelector('.cvz-rm-head');
      const items = group.querySelector('.cvz-rm-items');
      if (!head || !items) return;

      const det = makeFold('cvz-fold-rm ' + group.className, group.classList.contains('cvz-rm-sofort'));
      const sum = document.createElement('summary');
      sum.className = 'cvz-rm-head';
      sum.textContent = head.textContent + ' (' + items.children.length + ')';
      det.appendChild(sum);
      det.appendChild(items);
      group.replaceWith(det);
    });
  }

  // Button "Alle aufklappen / Alle zuklappen" direkt unter der Überschrift "Deep Dive".
  // WICHTIG: Muss VOR injectHeadings() laufen, damit die Überschrift danach OBERHALB
  // des Buttons eingefügt wird.
  function injectExpandToggle() {
    const host = document.querySelector('.section-deep-dive-hero');
    if (!host || document.querySelector('.cvz-expand-bar')) return;
    if (!document.querySelector('details.cvz-fold')) return; // nichts zum Aufklappen da

    const bar = document.createElement('div');
    bar.className = 'cvz-expand-bar';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cvz-expand-btn';
    bar.appendChild(btn);

    function allFolds() { return Array.from(document.querySelectorAll('details.cvz-fold')); }
    function refreshLabel() {
      btn.textContent = allFolds().some(d => !d.open) ? 'Alle aufklappen' : 'Alle zuklappen';
    }
    btn.addEventListener('click', () => {
      const shouldOpen = allFolds().some(d => !d.open);
      allFolds().forEach(d => { d.open = shouldOpen; });
      refreshLabel();
    });
    // Das "toggle"-Ereignis steigt nicht auf (bubbelt nicht), deshalb in der Capture-Phase lauschen.
    // So passt sich die Beschriftung an, wenn jemand einzelne Bereiche selbst auf- oder zuklappt.
    document.addEventListener('toggle', refreshLabel, true);

    host.insertBefore(bar, host.firstChild);
    refreshLabel();
  }

  // Öffnet die Kategorie, zu der ein Anker-Link springt (sonst landet man auf einer zugeklappten Zeile).
  function openFoldFor(target) {
    const acc = target && target.querySelector ? target.querySelector('details.cvz-acc') : null;
    if (acc) acc.open = true;
  }

  // Reihenfolge ist wichtig: erst die inneren Teile, dann die äußeren Hüllen.
  function enhanceCollapsibles() {
    try {
      foldStrengths();
      foldCategories();
      foldRoadmapGroups();
      injectExpandToggle();
    } catch (err) {
      // Aufklappen ist ein Komfort. Geht etwas schief, bleibt der Report voll sichtbar.
      console.error('[CVZ] Aufklappbare Bereiche konnten nicht gebaut werden:', err);
    }
  }

  // Beim Drucken (Strg+P) alles öffnen und danach den alten Zustand wiederherstellen.
  window.addEventListener('beforeprint', () => {
    document.querySelectorAll('details.cvz-fold').forEach(d => {
      d.dataset.cvzWasOpen = d.open ? '1' : '0';
      d.open = true;
    });
  });
  window.addEventListener('afterprint', () => {
    document.querySelectorAll('details.cvz-fold').forEach(d => {
      d.open = d.dataset.cvzWasOpen === '1';
    });
  });

  // ── Render: Executive Summary ───────────────────────────────────────────────
  function renderExecSummary(analysis) {
    const container = document.querySelector('.section-executive-summary');
    if (!container) { console.warn('⚠️ .section-executive-summary nicht gefunden'); return; }

    function parseItems(raw) {
      if (!raw) return [];
      if (/<li/i.test(raw)) {
        const tmp = document.createElement('div'); tmp.innerHTML = raw;
        const items = Array.from(tmp.querySelectorAll('li')).map(el => el.innerHTML.trim()).filter(t => t.length > 10);
        if (items.length > 0) return items.slice(0, 4);
      }
      if (/<p|<strong/i.test(raw)) {
        const tmp = document.createElement('div'); tmp.innerHTML = raw;
        const items = Array.from(tmp.querySelectorAll('p,strong')).map(el => el.innerHTML.trim()).filter(t => t.length > 10);
        if (items.length > 0) return items.slice(0, 4);
      }
      const lines = raw.split(/\n|•|·/).map(l => l.replace(/^\s*[\d\.\-\*•·–]+\s*/, '').trim()).filter(l => l.length > 15);
      return lines.length > 0 ? lines.slice(0, 4) : [raw.trim()];
    }

    const overall = sc(analysis.overall_score_weighted);

    // Kategorien, die in den gewichteten Gesamt-Score einfließen
    const categories = [
      { label: 'Hero',            score: sc(analysis.hero_score) },
      { label: 'Content',         score: sc(analysis.content_score) },
      { label: 'Zielgruppe',      score: sc(analysis.zielgruppe_score) },
      { label: 'Conversion',      score: sc(analysis.conversion_score) },
      { label: 'Struktur',        score: sc(analysis.struktur_score) },
      { label: 'Search Intent',   score: sc(analysis.search_intent_score) },
      { label: 'Differenzierung', score: sc(analysis.wettbewerb_score) },
    ];

    // Kategorien AUSSERHALB des Gesamt-Scores. Werden unterhalb einer
    // Trennlinie und visuell zurückgenommen (grau) gerendert, damit klar ist,
    // dass sie den Ring-Wert oben nicht beeinflussen.
    // Fehlender Score (z.B. PageSpeed-Timeout oder alte Analyse ohne
    // ai_readiness_score) -> Zeile wird komplett weggelassen.
    const extraCategories = [
      { label: 'Performance',     score: sc(analysis.performance_score) },
      { label: 'AI Sichtbarkeit', score: sc(analysis.ai_readiness_score) },
    ].filter(c => c.score !== null);

    function bar({ label, score }, extraCls) {
      const pct = score !== null ? ((score / 10) * 100).toFixed(1) : '0';
      const val = score !== null ? score.toFixed(1) : '–';
      return `<div class="cvz-br ${extraCls || ''}">
        <div class="cvz-bl" title="${label}">${label}</div>
        <div class="cvz-bt"><div class="cvz-bf" style="--bw:${pct}%;"></div></div>
        <div class="cvz-bv">${val}</div>
      </div>`;
    }

    const bars = categories.map(c => bar(c)).join('');

    // Trennlinie nur rendern, wenn darunter auch wirklich etwas steht
    const extraBars = extraCategories.length > 0
      ? `<div class="cvz-bars-divider">
           <span class="cvz-bars-divider-t">Nicht im Gesamt-Score</span>
         </div>` +
        extraCategories.map(c => bar(c, 'cvz-br-extra')).join('')
      : '';

    const rColor = getRingColor(overall);
    const rBg    = getRingBg(overall);
    const rVal   = overall !== null ? overall.toFixed(1) : '–';

    function badge(title, text) {
      return `<div class="cvz-badge">
        <div class="cvz-badge-h"><div class="cvz-badge-dot"></div><div class="cvz-badge-t">${title}</div></div>
        <div class="cvz-badge-tx">${text || 'Keine Daten verfügbar.'}</div>
      </div>`;
    }
    function execSection(type, items) {
      const isS     = type === 'staerken';
      const color   = isS ? '#4fd1c5' : '#ef4444';
      const iconBg  = isS ? 'rgba(79,209,197,.14)' : 'rgba(239,68,68,.14)';
      const icon    = isS ? '✓' : '▲';
      const title   = isS ? 'Stärken' : 'Größte Hebel';
      const cardCls = isS ? 'cvz-card-staerken' : 'cvz-card-schwaechen';
      const fadeCls = isS ? 'cvz-fi-4' : 'cvz-fi-5';
      const cards   = items.length > 0
        ? items.map(h => `<div class="cvz-card ${cardCls}"><div class="cvz-card-body">${h}</div></div>`).join('')
        : `<div style="font-size:12px;color:#4a5568;font-style:italic;">Keine Daten geladen.</div>`;
      return `<div class="cvz-fi ${fadeCls}" style="margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:11px;">
          <div style="width:22px;height:22px;border-radius:0;background:${iconBg};color:${color};display:flex;align-items:center;justify-content:center;font-size:11px;">${icon}</div>
          <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${color};">${title}</div>
        </div>
        <div class="cvz-cards">${cards}</div>
      </div>`;
    }

    container.innerHTML = `
      <div class="cvz-section" lang="de">
        <div class="cvz-exec-panel cvz-fi cvz-fi-2">
          <div class="cvz-ring">
            <div class="cvz-ring-c" style="border:3px solid ${rColor};background:${rBg};">
              <div class="cvz-ring-n" style="color:${rColor};">${rVal}</div>
              <div class="cvz-ring-d">/10</div>
            </div>
            <div class="cvz-ring-l">Gesamt</div>
          </div>
          <div class="cvz-bars">${bars}${extraBars}</div>
        </div>
        <div class="cvz-badges cvz-fi cvz-fi-3">
          ${badge('Industry Fit', analysis.industry_fit_summary)}
          ${badge('DACH Market Fit', analysis.dach_cultural_fit_summary)}
        </div>
        ${execSection('staerken',   parseItems(analysis.executive_summary_staerken))}
        ${execSection('schwaechen', parseItems(analysis.executive_summary_hauptproblem))}
      </div>`;

    console.log('✅ Executive Summary gerendert');
  }


  // ── Render ──────────────────────────────────────────────────────────────────
  function render() {
    injectStyles();
    var d = DATA;
    var analysis = toAnalysis(d);
    var analysisId = '';

    // Anker-Navigation einfügen
    (function injectAnchorNav() {
      // Webflow-Nav-Höhe messen (Selektor .w-nav statt .navbar-2-member:
      // .w-nav ist Webflows eigene, immer vorhandene Wrapper-Klasse,
      // unabhängig davon ob Gast- oder Member-Navbar aktiv ist)
      function getNavHeight() {
        const webflowNav = document.querySelector('.w-nav');
        return webflowNav ? webflowNav.offsetHeight : 0;
      }

      const nav = document.createElement('nav');
      nav.className = 'cvz-anchor-nav';
      nav.setAttribute('aria-label', 'Analyse-Navigation');
      const links = [
        {href:'#cvz-exec',    label:'Executive Summary'},
        {href:'#cvz-hero',    label:'Hero'},
        {href:'#cvz-content', label:'Content'},
        {href:'#cvz-zielgruppe', label:'Zielgruppe'},
        {href:'#cvz-conversion', label:'Conversion'},
        {href:'#cvz-struktur', label:'Struktur'},
        {href:'#cvz-search',  label:'Search Intent'},
        {href:'#cvz-diff',    label:'Differenzierung'},
        {href:'#cvz-perf',    label:'Performance & AI'},
        {href:'#cvz-roadmap', label:'Roadmap'},
      ];
      nav.innerHTML = '<div class="cvz-anchor-nav-inner">'+
        links.map(l => `<a href="${l.href}">${l.label}</a>`).join('')+
        '</div>';
      // Smooth scroll mit Nav-Offset
      nav.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', e => {
          const id = a.getAttribute('href').replace('#','');
          const target = document.getElementById(id);
          if (!target) return;
          e.preventDefault();
          // v9: Kategorie vor dem Scrollen öffnen, sonst landet man auf einer zugeklappten Zeile.
          // Erst öffnen, dann messen, denn das Öffnen verändert die Seitenhöhe.
          openFoldFor(target);
          const offset = nav.offsetHeight + getNavHeight() + 16;
          const top = target.getBoundingClientRect().top + window.scrollY - offset;
          window.scrollTo({top, behavior:'smooth'});
        });
      });

      // Sentinel: 1px-Element direkt VOR der Nav. Sobald es aus dem Viewport
      // (nach oben) verschwindet, hat die Nav ihre natürliche Position
      // verlassen und wird auf "fixed" umgeschaltet.
      const sentinel = document.createElement('div');
      sentinel.className = 'cvz-anchor-nav-sentinel';

      // Spacer: hält die Höhe der Nav im Layout frei, sobald sie auf
      // "fixed" umschaltet (fixed nimmt das Element aus dem normalen Fluss).
      const spacer = document.createElement('div');
      spacer.style.display = 'none';

      // Vor dem ersten Section-Wrapper einfügen
      const firstSection = document.querySelector('.section-hero-info') ||
                           document.querySelector('.section-executive-summary');
      if (firstSection) {
        firstSection.parentNode.insertBefore(sentinel, firstSection);
        firstSection.parentNode.insertBefore(nav, firstSection);
        firstSection.parentNode.insertBefore(spacer, firstSection);
      }

      function applyFixed(isFixed) {
        const navH = getNavHeight();
        if (isFixed) {
          spacer.style.height = nav.offsetHeight + 'px';
          spacer.style.display = 'block';
          nav.style.top = navH + 'px';
          nav.classList.add('cvz-anchor-nav--fixed');
          // WICHTIG: Nav an body hängen, NICHT an ihrer ursprünglichen Stelle
          // im DOM lassen. Falls irgendein Vorfahre (z.B. ein von GSAP
          // erzeugter Scroll-Wrapper) einen transform gesetzt hat, würde
          // position:fixed sich sonst relativ zu DIESEM Vorfahren verhalten
          // statt relativ zum Viewport, transform erzeugt einen eigenen
          // Containing Block, auch für fixed-Elemente, nicht nur für sticky.
          if (nav.parentNode !== document.body) {
            document.body.insertBefore(nav, document.body.firstChild);
          }
        } else {
          nav.classList.remove('cvz-anchor-nav--fixed');
          nav.style.top = '';
          spacer.style.display = 'none';
          // Zurück an die ursprüngliche Stelle im DOM (direkt vor dem Spacer).
          if (nav.parentNode !== spacer.parentNode || nav.nextSibling !== spacer) {
            spacer.parentNode.insertBefore(nav, spacer);
          }
        }
      }

      // IntersectionObserver statt scroll-Listener: läuft unabhängig davon,
      // ob GSAP/ScrollTrigger das native Scroll-Event überhaupt noch feuert.
      const stickyObserver = new IntersectionObserver(
        entries => { entries.forEach(entry => applyFixed(!entry.isIntersecting)); },
        { rootMargin: `-${getNavHeight()}px 0px 0px 0px`, threshold: 0 }
      );
      stickyObserver.observe(sentinel);

      // Bei Resize (z.B. mobiles Menü öffnet/schließt, Rotation) den
      // Observer mit aktualisiertem Offset neu aufsetzen und, falls die
      // Nav gerade fixed ist, deren top-Wert nachziehen.
      function refreshOnResize() {
        if (nav.classList.contains('cvz-anchor-nav--fixed')) {
          nav.style.top = getNavHeight() + 'px';
        }
        stickyObserver.disconnect();
        stickyObserver.observe(sentinel);
      }
      window.addEventListener('resize', refreshOnResize);

      const webflowNav = document.querySelector('.w-nav');
      if (webflowNav && window.ResizeObserver) {
        new ResizeObserver(refreshOnResize).observe(webflowNav);
      }

      // Active-State beim Scrollen
      const sectionIds = ['cvz-exec','cvz-hero','cvz-content','cvz-zielgruppe',
        'cvz-conversion','cvz-struktur','cvz-search','cvz-diff','cvz-perf','cvz-roadmap'];
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            nav.querySelectorAll('a').forEach(a => a.classList.remove('cvz-nav-active'));
            const activeLink = nav.querySelector(`a[href="#${entry.target.id}"]`);
            if (activeLink) {
              activeLink.classList.add('cvz-nav-active');
              // Nav horizontal zum aktiven Link scrollen
              activeLink.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
            }
          }
        });
      }, {rootMargin:'-20% 0px -70% 0px'});

      sectionIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) observer.observe(el);
      });
    })();


    // Hinweis-Box + Info-Block
    document.querySelectorAll('.section-hero-info').forEach(function (c) {
      c.innerHTML =
        '<div class="cvz-section cvz-fi cvz-fi-1">'+
        '<div style="background:rgba(79,209,197,.05);border:1px solid rgba(79,209,197,.15);padding:14px 18px;margin-bottom:12px;font-size:13px;color:#718096;line-height:1.65;">'+
        '<p style="margin:0 0 8px;"><strong style="color:#c4cdd6;">Dies ist eine echte Convertlyze-Analyse</strong>. Anonymisiert für diese Beispielseite. Alle Markennamen, Zitate und konkreten Kennzahlen wurden generalisiert, die Bewertungen und Empfehlungen stammen aus einem realen Analyselauf.</p>'+
        '<p style="margin:0;">Convertlyze bewertet jede Seite im Kontext ihrer <strong style="color:#c4cdd6;">Branche und ihres Angebotstyps</strong>: Eine Self-Service-SaaS-Seite wird nach anderen Kriterien beurteilt als eine Enterprise-Beratungs- oder E-Commerce-Seite, von der Erwartung an Proof Points über die CTA-Strategie bis zur Gewichtung einzelner Kategorien. Die folgende Analyse zeigt das vollständige Ausgabeformat am Beispiel eines DACH-Anbieters im Bereich Intelligente Dokumentenverarbeitung.</p>'+
        '</div>'+
        '<div class="cvz-card" style="padding:20px 24px;"><div class="cvz-info-grid">'+
        '<div class="cvz-info-row"><div class="cvz-info-label">Keyword</div><div class="cvz-info-value">'+d.keyword+'</div></div>'+
        '<div class="cvz-info-row"><div class="cvz-info-label">URL</div><div class="cvz-info-value">'+d.url+'</div></div>'+
        '<div class="cvz-info-row"><div class="cvz-info-label">Zielgruppe</div><div class="cvz-info-value">'+d.target_audience+'</div></div>'+
        '<div class="cvz-info-row"><div class="cvz-info-label">Conversion-Ziel</div><div class="cvz-info-value">'+d.conversion_goal+'</div></div>'+
        '<div class="cvz-info-row"><div class="cvz-info-label">Branche</div><div class="cvz-info-value">'+d.industry+'</div></div>'+
        '<div class="cvz-info-row"><div class="cvz-info-label">Angebotstyp</div><div class="cvz-info-value">'+d.business_type+'</div></div>'+
        '<div class="cvz-info-row"><div class="cvz-info-label">Search Intent</div><div class="cvz-info-value">'+d.search_intent+'</div></div>'+
        '<div class="cvz-info-row"><div class="cvz-info-label">Analyse vom</div><div class="cvz-info-value">'+d.created_at+'</div></div>'+
        '</div></div></div>';
    });

    renderExecSummary(analysis);

    // Deep Dive Kategorien
    // HINWEIS: Schwächen werden zuerst über dedup_findings (deduplizierte
    // Findings inkl. Cross-Reference/Cross-Category) gerendert, falls
    // vorhanden. Fallback: buildPrioCard() mit den rohen
    // *_schwaechen_prioritized_html-Feldern (alte Analysen ohne dedup_findings).
    const sections = {
      '.section-deep-dive-hero': () => {
        const dedupItems = getDedupCategory(analysis, 'Hero');
        const prio = dedupItems ? buildPrioCardFromDedup(dedupItems, 'Hero') : buildPrioCard(analysis.hero_schwaechen_prioritized_html);
        return buildCatSection('Hero', analysis.hero_score,
          card('summary','Zusammenfassung', txt(analysis.hero_summary)) +
          card('staerken','Stärken', analysis.hero_staerken_html) +
          prio);
      },

      '.section-deep-dive-content': () => {
        const dedupItems = getDedupCategory(analysis, 'Content');
        const prio = dedupItems ? buildPrioCardFromDedup(dedupItems, 'Content') : buildPrioCard(analysis.content_schwaechen_prioritized_html);
        return buildCatSection('Content', analysis.content_score,
          card('summary','Zusammenfassung', txt(analysis.content_summary)) +
          card('staerken','Stärken', analysis.content_staerken_html) +
          prio +
          buildPrioCard(analysis.content_gaps_html));
      },

      '.section-deep-dive-zielgruppe': () => {
        const dedupItems = getDedupCategory(analysis, 'Zielgruppe');
        const prio = dedupItems ? buildPrioCardFromDedup(dedupItems, 'Zielgruppe') : buildPrioCard(analysis.zielgruppe_schwaechen_prioritized_html);
        return buildCatSection('Zielgruppe', analysis.zielgruppe_score,
          card('summary','Zusammenfassung', txt(analysis.zielgruppe_summary)) +
          card('staerken','Stärken', analysis.zielgruppe_staerken_html) +
          prio);
      },

      '.section-deep-dive-conversion': () => {
        const dedupItems = getDedupCategory(analysis, 'Conversion');
        const prio = dedupItems ? buildPrioCardFromDedup(dedupItems, 'Conversion') : buildPrioCard(analysis.conversion_schwaechen_prioritized_html);
        return buildCatSection('Conversion', analysis.conversion_score,
          card('summary','Zusammenfassung', txt(analysis.conversion_summary)) +
          card('staerken','Stärken', analysis.conversion_staerken_html) +
          prio);
      },

      '.section-deep-dive-struktur': () => {
        const dedupItems = getDedupCategory(analysis, 'Struktur');
        const prio = dedupItems ? buildPrioCardFromDedup(dedupItems, 'Struktur') : buildPrioCard(analysis.struktur_schwaechen_prioritized_html);
        return buildCatSection('Struktur', analysis.struktur_score,
          card('summary','Zusammenfassung', txt(analysis.struktur_summary)) +
          card('staerken','Stärken', analysis.struktur_staerken_html) +
          prio);
      },

      '.section-deep-dive-searchintent': () => {
        const dedupItems = getDedupCategory(analysis, 'Search Intent');
        const prio = dedupItems ? buildPrioCardFromDedup(dedupItems, 'Search Intent') : buildPrioCard(analysis.search_intent_content_gaps);
        return buildCatSection('Search Intent', analysis.search_intent_score,
          card('summary','Bewertung', txt(analysis.search_intent_bewertung)) +
          prio);
      },

      '.section-deep-dive-differenzierung': () => {
        const dedupItems = getDedupCategory(analysis, 'Wettbewerb');
        const prio = dedupItems ? buildPrioCardFromDedup(dedupItems, 'Wettbewerb') : buildPrioCard(analysis.wettbewerb_schwaechen_prioritized_html);
        return buildCatSection('Differenzierung', analysis.wettbewerb_score,
          card('summary','Zusammenfassung', txt(analysis.wettbewerb_summary)) +
          card('staerken','Stärken', analysis.wettbewerb_staerken_html) +
          prio);
      },

      '.section-deep-dive-performance': () => {
        const dedupItems = getDedupCategory(analysis, 'Performance');
        const prio = dedupItems ? buildPrioCardFromDedup(dedupItems, 'Performance') : buildPrioCard(analysis.performance_opportunities_html);
        return buildCatSection('Performance', analysis.performance_score,
          card('summary','Zusammenfassung', txt(analysis.performance_summary)) +
          card('summary','Desktop', txt(analysis.performance_desktop_zusammenfassung)) +
          card('summary','Mobil', txt(analysis.performance_mobile_zusammenfassung)) +
          prio);
      },

      '.section-deep-dive-ai': () => {
        const dedupItems = getDedupCategory(analysis, 'AI Readiness');
        const prio = dedupItems ? buildPrioCardFromDedup(dedupItems, 'AI Readiness') : buildPrioCard(analysis.ai_readiness_optimierungspotenziale_html);
        return buildCatSection('AI Sichtbarkeit', analysis.ai_readiness_score,
          card('summary','Zusammenfassung', txt(analysis.ai_readiness_bewertung)) +
          card('staerken','Stärken', analysis.ai_readiness_staerken_html) +
          prio);
      },

      // === nutzt buildRoadmap (JSON mit HTML-Fallback) ===
      '.section-roadmap': () => buildRoadmap(analysis),
    };

    Object.entries(sections).forEach(([selector, builder]) => {
      const el = document.querySelector(selector);
      if (el) el.innerHTML = builder();
    });

    // v9: Aufklappbare Bereiche. Muss NACH dem Rendern der Sektionen und VOR
    // injectHeadings() laufen (siehe Kommentar an injectExpandToggle).
    enhanceCollapsibles();


    document.querySelectorAll('.section-ki-agent-btn').forEach(function (el) {
      el.innerHTML =
        '<div class="cvz-ki-btn-wrap">'+
        '<a href="https://www.convertlyze.com/register" class="cvz-ki-btn" aria-label="Eigene Landingpage analysieren">'+
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="6" y="8" width="12" height="10" rx="2" fill="currentColor" opacity=".9"/><circle cx="9" cy="12" r="1.5" fill="#0d1117"/><circle cx="15" cy="12" r="1.5" fill="#0d1117"/><rect x="10" y="15" width="4" height="1.5" rx=".75" fill="#0d1117"/><rect x="11" y="4" width="2" height="4" rx="1" fill="currentColor" opacity=".9"/><circle cx="12" cy="5" r="2" fill="currentColor" opacity=".9"/></svg>'+
        ' Eigene Landingpage analysieren</a>'+
        '</div>';
    });

    // Sektions-Überschriften – nach allen Renders einfügen
    (function injectHeadings() {
      function heading(selector, title, sub) {
        const el = document.querySelector(selector);
        if (!el) return;
        const wrap = document.createElement('div');
        wrap.className = 'cvz-heading-wrap';
        wrap.innerHTML = '<div class="cvz-heading-title">' + title + '</div>' +
          (sub ? '<div class="cvz-heading-sub">' + sub + '</div>' : '');
        el.insertBefore(wrap, el.firstChild);
      }
      heading('.section-hero-info',            'Beispielanalyse', '');
      heading('.section-executive-summary',    'Executive Summary', 'Die wichtigsten Erkenntnisse auf einen Blick');
      heading('.section-deep-dive-hero',       'Deep Dive', 'Detaillierte Analyse jeder Kategorie');
      heading('.section-deep-dive-performance','Performance &amp; AI Sichtbarkeit', 'Performance und AI Readiness fließen nicht in den Gesamt-Score ein. Performance-Optimierungen erfordern meist hauptsächlich technische Umsetzung. Bei AI Readiness ist es gemischt – strukturierte Daten brauchen Entwicklungs-Support, Inhaltsstruktur und Semantik kannst du direkt selbst angehen.');
      heading('.section-roadmap',              'Roadmap', 'Die wichtigsten Maßnahmen, sortiert nach Impact und Aufwand.');

      // Anker-IDs auf Section-Wrapper setzen
      const anchorMap = {
        '.section-executive-summary':     'cvz-exec',
        '.section-deep-dive-hero':        'cvz-hero',
        '.section-deep-dive-content':     'cvz-content',
        '.section-deep-dive-zielgruppe':  'cvz-zielgruppe',
        '.section-deep-dive-conversion':  'cvz-conversion',
        '.section-deep-dive-struktur':    'cvz-struktur',
        '.section-deep-dive-searchintent':'cvz-search',
        '.section-deep-dive-differenzierung':'cvz-diff',
        '.section-deep-dive-performance': 'cvz-perf',
        '.section-roadmap':               'cvz-roadmap',
      };
      Object.entries(anchorMap).forEach(([sel, id]) => {
        const el = document.querySelector(sel);
        if (el) el.id = id;
      });
    })();


    var kiBtn = document.querySelector('.section-ki-agent-btn');
    if (kiBtn && !document.querySelector('.cvz-ki-disclaimer')) {
      var aiNotice = document.createElement('div');
      aiNotice.className = 'cvz-ki-disclaimer';
      aiNotice.textContent = 'Diese Analyse wurde vollständig durch ein KI-System erstellt. Alle Empfehlungen sollten durch eine qualifizierte Fachperson geprüft werden. Alle Angaben ohne Gewähr.';
      kiBtn.parentNode.insertBefore(aiNotice, kiBtn.nextSibling);
    }

    document.body.classList.add('analysis-loaded');
    console.log('✅ Beispielanalyse gerendert (IDP, anonymisiert)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }

})();
