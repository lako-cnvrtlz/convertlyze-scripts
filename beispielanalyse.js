/**
 * Convertlyze – Statische Beispielanalyse (echte Analyse, anonymisiert)
 * Grundlage: realer Analyselauf, Document-Intelligence/IDP-Anbieter (DACH, SaaS Self-Service)
 * Anonymisiert: Produktname, Wettbewerber-Referenz und identifizierende Badges entfernt/generalisiert.
 * Struktur 1:1 kompatibel zum bestehenden beispielanalyse.js-Rendering (nur DATA-Objekt ausgetauscht).
 */

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
