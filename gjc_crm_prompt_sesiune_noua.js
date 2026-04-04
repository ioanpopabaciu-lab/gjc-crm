const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
        PageNumber, Header, Footer, ExternalHyperlink, LevelFormat, PageBreak } = require('docx');
const fs = require('fs');

// ─── HELPERS ────────────────────────────────────────────────────────────────

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const thickBorder = { style: BorderStyle.SINGLE, size: 2, color: "1e40af" };
const thickBorders = { top: thickBorder, bottom: thickBorder, left: thickBorder, right: thickBorder };

const cell = (text, opts = {}) => new TableCell({
  borders: opts.borders || borders,
  width: { size: opts.width || 4680, type: WidthType.DXA },
  shading: opts.bg ? { fill: opts.bg, type: ShadingType.CLEAR } : undefined,
  margins: { top: 80, bottom: 80, left: 140, right: 140 },
  verticalAlign: "center",
  children: [new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    children: [new TextRun({
      text,
      bold: opts.bold || false,
      size: opts.size || 20,
      color: opts.color || "000000",
      font: "Arial",
    })]
  })]
});

const hcell = (text, w) => cell(text, { bold: true, bg: "1e40af", color: "FFFFFF", width: w, borders: thickBorders });

const row = (cells) => new TableRow({ children: cells });

const h1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 360, after: 200 },
  children: [new TextRun({ text, bold: true, size: 36, color: "1e40af", font: "Arial" })]
});

const h2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 280, after: 140 },
  children: [new TextRun({ text, bold: true, size: 28, color: "1e3a8a", font: "Arial" })]
});

const h3 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_3,
  spacing: { before: 200, after: 100 },
  children: [new TextRun({ text, bold: true, size: 24, color: "374151", font: "Arial" })]
});

const p = (text, opts = {}) => new Paragraph({
  spacing: { before: 60, after: 80 },
  children: [new TextRun({ text, size: opts.size || 22, color: opts.color || "1f2937", font: "Arial", bold: opts.bold || false })]
});

const bullet = (text) => new Paragraph({
  numbering: { reference: "bullets", level: 0 },
  spacing: { before: 40, after: 40 },
  children: [new TextRun({ text, size: 20, font: "Arial", color: "1f2937" })]
});

const spacer = () => new Paragraph({ spacing: { before: 80, after: 80 }, children: [new TextRun("")] });

const infoBox = (title, text, bg = "eff6ff", borderColor = "3b82f6") => new Table({
  width: { size: 9200, type: WidthType.DXA },
  columnWidths: [9200],
  rows: [row([new TableCell({
    borders: { top: { style: BorderStyle.SINGLE, size: 4, color: borderColor },
               bottom: { style: BorderStyle.SINGLE, size: 4, color: borderColor },
               left: { style: BorderStyle.SINGLE, size: 8, color: borderColor },
               right: { style: BorderStyle.SINGLE, size: 1, color: borderColor } },
    width: { size: 9200, type: WidthType.DXA },
    shading: { fill: bg, type: ShadingType.CLEAR },
    margins: { top: 160, bottom: 160, left: 240, right: 240 },
    children: [
      new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 22, font: "Arial", color: "1e40af" })] }),
      new Paragraph({ spacing: { before: 60 }, children: [new TextRun({ text, size: 20, font: "Arial", color: "374151" })] }),
    ]
  })])]
});

// ─── DOCUMENT ────────────────────────────────────────────────────────────────

const doc = new Document({
  numbering: {
    config: [{
      reference: "bullets",
      levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022",
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 560, hanging: 280 } } } }]
    }, {
      reference: "numbers",
      levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.",
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 560, hanging: 280 } } } }]
    }]
  },
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: "1e40af" },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: "1e3a8a" },
        paragraph: { spacing: { before: 280, after: 140 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: "374151" },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 } },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 1200, right: 1200, bottom: 1200, left: 1200 }
      }
    },
    headers: {
      default: new Header({ children: [
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "1e40af" } },
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: "GJC CRM — Prompt Sesiune Noua & Audit Complet | Aprilie 2026", size: 18, color: "6b7280", font: "Arial" })]
        })
      ]})
    },
    footers: {
      default: new Footer({ children: [
        new Paragraph({
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: "e2e8f0" } },
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Pagina ", size: 18, color: "9ca3af", font: "Arial" }),
            new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "9ca3af", font: "Arial" }),
            new TextRun({ text: " | GJC Global Jobs Consulting | Confidential", size: 18, color: "9ca3af", font: "Arial" }),
          ]
        })
      ]})
    },
    children: [

      // ═══════════════════════════════════════════════════
      // COVER
      // ═══════════════════════════════════════════════════
      new Paragraph({ spacing: { before: 800, after: 200 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "GJC AI-CRM", bold: true, size: 72, color: "1e40af", font: "Arial" })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 },
        children: [new TextRun({ text: "PROMPT SESIUNE NOUA + AUDIT COMPLET", bold: true, size: 32, color: "374151", font: "Arial" })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 800 },
        children: [new TextRun({ text: "Aprilie 2026  |  Global Jobs Consulting  |  Versiunea 2.0", size: 22, color: "9ca3af", font: "Arial" })] }),

      // ─── SEPARATOR ───
      new Table({ width: { size: 9200, type: WidthType.DXA }, columnWidths: [9200],
        rows: [row([new TableCell({ borders: { top: { style: BorderStyle.SINGLE, size: 12, color: "1e40af" }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
          width: { size: 9200, type: WidthType.DXA }, children: [new Paragraph("")] })])] }),

      spacer(),

      // ═══════════════════════════════════════════════════
      // SECTIUNEA A — PROMPTUL PENTRU SESIUNEA NOUA
      // ═══════════════════════════════════════════════════
      h1("A. PROMPT — Copiaza in sesiunea noua Claude Code"),
      spacer(),

      infoBox(
        "Cum se foloseste acest document",
        "Copiaza textul din caseta galbena de mai jos si lipeste-l ca PRIMUL mesaj intr-o sesiune noua Claude Code. Acesta contine tot contextul necesar pentru ca AI-ul sa stie exact unde am ramas si ce urmeaza.",
        "fefce8", "eab308"
      ),

      spacer(),

      new Table({
        width: { size: 9200, type: WidthType.DXA },
        columnWidths: [9200],
        rows: [row([new TableCell({
          borders: { top: { style: BorderStyle.SINGLE, size: 6, color: "eab308" },
                     bottom: { style: BorderStyle.SINGLE, size: 6, color: "eab308" },
                     left: { style: BorderStyle.SINGLE, size: 16, color: "eab308" },
                     right: { style: BorderStyle.SINGLE, size: 6, color: "eab308" } },
          width: { size: 9200, type: WidthType.DXA },
          shading: { fill: "fefce8", type: ShadingType.CLEAR },
          margins: { top: 200, bottom: 200, left: 280, right: 280 },
          children: [
            new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: "PROMPT DE LIPIT IN SESIUNEA NOUA:", bold: true, size: 22, color: "92400e", font: "Arial" })] }),
            new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "Esti asistentul tehnic al companiei GJC (Global Jobs Consulting), o agentie de recrutare internationala din Romania. Lucrezi la sistemul GJC AI-CRM — un CRM complet construit cu React (frontend) + FastAPI + MongoDB (backend), deploy pe Railway.", size: 20, font: "Arial", color: "1f2937" })] }),
            new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "STACK TEHNIC:", bold: true, size: 20, font: "Arial", color: "374151" })] }),
            new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "- Frontend: React, React Router v6, Axios, Lucide React, CSS variables", size: 20, font: "Arial", color: "374151" })] }),
            new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "- Backend: FastAPI (Python), Motor (async MongoDB), Pydantic v2, JWT auth", size: 20, font: "Arial", color: "374151" })] }),
            new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "- DB: MongoDB Atlas (gjc_crm_db) — 423 candidati, 60 companii, 386 dosare imigrare, 2417 emailuri IGI", size: 20, font: "Arial", color: "374151" })] }),
            new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "- Repo GitHub: ioanpopabaciu-lab/gjc-crm (push automat dupa fiecare task)", size: 20, font: "Arial", color: "374151" })] }),
            new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "- Local path: C:\\Users\\ioanp\\OneDrive\\Desktop\\GJC CRM\\", size: 20, font: "Arial", color: "374151" })] }),
            new Paragraph({ spacing: { before: 120, after: 100 }, children: [new TextRun({ text: "CE S-A IMPLEMENTAT PANA ACUM (sesiunile anterioare):", bold: true, size: 20, font: "Arial", color: "374151" })] }),
            new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "- 9 module: Dashboard, Candidati, Companii, Dosare Imigrare, Pipeline, Documente, Rapoarte, Alerte, Operatori&WA", size: 20, font: "Arial", color: "374151" })] }),
            new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "- Integrare Gmail API (2417 emailuri IGI importate automat)", size: 20, font: "Arial", color: "374151" })] }),
            new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "- Verificare CUI la ANAF in timp real", size: 20, font: "Arial", color: "374151" })] }),
            new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "- 195 tari + 100+ coduri COR oficiale Romania cu autocomplete", size: 20, font: "Arial", color: "374151" })] }),
            new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "- Alerte programari IGI cu buton WhatsApp catre operatori (wa.me link)", size: 20, font: "Arial", color: "374151" })] }),
            new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "- 63 candidati duplicati eliminati (acelasi nr. pasaport)", size: 20, font: "Arial", color: "374151" })] }),
            new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "- Fix ImmigrationCase extra=allow (avize modal functional dupa redeploy)", size: 20, font: "Arial", color: "374151" })] }),
            new Paragraph({ spacing: { before: 120, after: 100 }, children: [new TextRun({ text: "CE URMEAZA — ORDINEA DE PRIORITATI (vezi documentul complet atasat):", bold: true, size: 20, font: "Arial", color: "374151" })] }),
            new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "ETAPA 0 (urgent, 1-2 zile): Import telefoane + expirare pasaport candidati din Excel; completare date contact companii", size: 20, font: "Arial", color: "dc2626" })] }),
            new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "ETAPA 1 (P0 Blockers, 1-2 saptamani): Campuri service_type, source_partner, modul Parteneri, assigned_to real", size: 20, font: "Arial", color: "ea580c" })] }),
            new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "ETAPA 2 (P1 Business, 3-4 saptamani): Module Contracte, Plati, Leads B2B, integrare email, Pipeline 10 etape", size: 20, font: "Arial", color: "d97706" })] }),
            new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "ETAPA 3 (P2 Operational, 4-5 saptamani): Post-plasare, Interviuri, Task-uri, Audit Log, Notificari automate", size: 20, font: "Arial", color: "059669" })] }),
            new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "ETAPA 4 (P3 Rapoarte, 4-5 saptamani): Dashboard financiar, KPI per operator, Export Excel, Portal candidat", size: 20, font: "Arial", color: "2563eb" })] }),
            new Paragraph({ spacing: { before: 120, after: 60 }, children: [new TextRun({ text: "REGULI IMPORTANTE:", bold: true, size: 20, font: "Arial", color: "374151" })] }),
            new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "- Dupa fiecare task reusit: git add + git commit + git push automat pe main", size: 20, font: "Arial", color: "374151" })] }),
            new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "- Comunicare simpla, fara jargon tehnic — user este om de business, nu programator", size: 20, font: "Arial", color: "374151" })] }),
            new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "- Iau decizii tehnice singur, nu intreb despre implementare — intreb doar despre business logic", size: 20, font: "Arial", color: "374151" })] }),
            new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "- MongoDB Atlas: mongodb+srv://gjc_admin:GJC2026admin@cluster0.4l9rft3.mongodb.net/gjc_crm_db", size: 20, font: "Arial", color: "374151" })] }),
            new Paragraph({ spacing: { before: 120 }, children: [new TextRun({ text: "Te rog sa incepi cu ETAPA 0 — importul datelor lipsa (telefoane candidati + expirare pasaport din fisierele Excel disponibile in folderul proiectului).", bold: true, size: 20, font: "Arial", color: "1e40af" })] }),
          ]
        })])]
      }),

      spacer(),
      spacer(),

      // ═══════════════════════════════════════════════════
      // SECTIUNEA B — AUDIT COMPLET
      // ═══════════════════════════════════════════════════
      new Paragraph({ children: [new PageBreak()] }),
      h1("B. AUDIT COMPLET — Starea Sistemului GJC CRM"),

      p("Data audit: Aprilie 2026  |  Versiune sistem: 2.0  |  Realizat cu: Claude Sonnet 4.6"),
      spacer(),

      // ─── B1 CE FUNCTIONEAZA ───
      h2("B1. Ce functioneaza acum — Module implementate"),
      spacer(),

      new Table({
        width: { size: 9200, type: WidthType.DXA },
        columnWidths: [3200, 2500, 3500],
        rows: [
          row([hcell("Modul / Ruta", 3200), hcell("Status", 2500), hcell("Functionalitati cheie", 3500)]),
          row([cell("Dashboard  /", {width:3200}), cell("Functional", {width:2500, bg:"dcfce7", color:"166534", bold:true}), cell("KPI-uri, top nationalitati, top companii", {width:3500})]),
          row([cell("Candidati  /candidates", {width:3200}), cell("Functional", {width:2500, bg:"dcfce7", color:"166534", bold:true}), cell("CRUD, 195 tari, COR autocomplete, WhatsApp, export CSV", {width:3500})]),
          row([cell("Companii  /companies", {width:3200}), cell("Functional", {width:2500, bg:"dcfce7", color:"166534", bold:true}), cell("CRUD, verificare ANAF, modal avize, statistici fundal", {width:3500})]),
          row([cell("Dosare Imigrare  /immigration", {width:3200}), cell("Partial", {width:2500, bg:"fef9c3", color:"92400e", bold:true}), cell("CRUD, flux 8 etape, 34 documente, PDF, upload", {width:3500})]),
          row([cell("Pipeline Vanzari  /pipeline", {width:3200}), cell("Partial", {width:2500, bg:"fef9c3", color:"92400e", bold:true}), cell("Kanban 5 etape, valoare ponderata — lipseste drag&drop", {width:3500})]),
          row([cell("Documente  /documents", {width:3200}), cell("Baza minima", {width:2500, bg:"fef9c3", color:"92400e", bold:true}), cell("Upload/download fisiere", {width:3500})]),
          row([cell("Rapoarte  /reports", {width:3200}), cell("Functional", {width:2500, bg:"dcfce7", color:"166534", bold:true}), cell("4 tab-uri: General, Avize, Candidati, Companii", {width:3500})]),
          row([cell("Alerte  /alerts", {width:3200}), cell("Functional", {width:2500, bg:"dcfce7", color:"166534", bold:true}), cell("Programari IGI + WhatsApp, alerte expirare documente", {width:3500})]),
          row([cell("Operatori & WA  /settings", {width:3200}), cell("Functional", {width:2500, bg:"dcfce7", color:"166534", bold:true}), cell("CRUD operatori, numere telefon, mesaje rapide", {width:3500})]),
        ]
      }),

      spacer(),
      spacer(),

      // ─── B2 STAREA DATELOR ───
      h2("B2. Starea datelor in MongoDB"),
      spacer(),
      h3("Candidati — 423 inregistrari"),

      new Table({
        width: { size: 9200, type: WidthType.DXA },
        columnWidths: [3000, 2000, 2000, 2200],
        rows: [
          row([hcell("Camp", 3000), hcell("Completat", 2000), hcell("Gol", 2000), hcell("Observatie", 2200)]),
          row([cell("Nationalitate", {width:3000}), cell("277 / 65%", {width:2000, bg:"fef9c3"}), cell("146", {width:2000}), cell("35% fara nationalitate", {width:2200})]),
          row([cell("Nr. Pasaport", {width:3000}), cell("255 / 60%", {width:2000, bg:"fef9c3"}), cell("168", {width:2000}), cell("40% fara pasaport", {width:2200})]),
          row([cell("Expirare Pasaport", {width:3000, bold:true}), cell("3 / 1%", {width:2000, bg:"fee2e2"}), cell("420", {width:2000, bold:true}), cell("CRITIC — alertele nu functioneaza", {width:2200, color:"dc2626", bold:true})]),
          row([cell("Meserie / Job COR", {width:3000}), cell("163 / 39%", {width:2000, bg:"fef9c3"}), cell("260", {width:2000}), cell("61% fara meserie", {width:2200})]),
          row([cell("Legat de firma", {width:3000}), cell("368 / 87%", {width:2000, bg:"dcfce7"}), cell("55", {width:2000}), cell("OK", {width:2200, color:"166534"})]),
          row([cell("Telefon", {width:3000, bold:true}), cell("0 / 0%", {width:2000, bg:"fee2e2"}), cell("423", {width:2000, bold:true}), cell("CRITIC — WhatsApp pe candidati blocat", {width:2200, color:"dc2626", bold:true})]),
          row([cell("Email", {width:3000, bold:true}), cell("0 / 0%", {width:2000, bg:"fee2e2"}), cell("423", {width:2000, bold:true}), cell("CRITIC — nicio comunicare email posibila", {width:2200, color:"dc2626", bold:true})]),
          row([cell("Status Plasat", {width:3000}), cell("25 candidati", {width:2000, bg:"dcfce7"}), cell("—", {width:2000}), cell("25 plasati inregistrati", {width:2200})]),
        ]
      }),

      spacer(),
      h3("Companii — 60 inregistrari"),

      new Table({
        width: { size: 9200, type: WidthType.DXA },
        columnWidths: [3000, 2000, 2000, 2200],
        rows: [
          row([hcell("Camp", 3000), hcell("Completat", 2000), hcell("Gol", 2000), hcell("Status", 2200)]),
          row([cell("CUI", {width:3000}), cell("34 / 57%", {width:2000, bg:"fef9c3"}), cell("26", {width:2000}), cell("Partial", {width:2200})]),
          row([cell("Nr. Reg. Comert", {width:3000}), cell("26 / 43%", {width:2000, bg:"fef9c3"}), cell("34", {width:2000}), cell("Partial", {width:2200})]),
          row([cell("Judet", {width:3000}), cell("22 / 37%", {width:2000, bg:"fef9c3"}), cell("38", {width:2000}), cell("Partial", {width:2200})]),
          row([cell("Contact / Telefon / Email", {width:3000, bold:true}), cell("0 / 0%", {width:2000, bg:"fee2e2"}), cell("60", {width:2000, bold:true}), cell("CRITIC — date B2B goale", {width:2200, color:"dc2626", bold:true})]),
        ]
      }),

      spacer(),
      h3("Dosare Imigrare — 386 inregistrari"),

      new Table({
        width: { size: 9200, type: WidthType.DXA },
        columnWidths: [3000, 2000, 2000, 2200],
        rows: [
          row([hcell("Camp", 3000), hcell("Completat", 2000), hcell("Lipsa", 2000), hcell("Observatie", 2200)]),
          row([cell("Cu aviz de munca", {width:3000}), cell("158 / 41%", {width:2000, bg:"fef9c3"}), cell("228", {width:2000}), cell("Unele nu au aviz inca", {width:2200})]),
          row([cell("Cu PDF din Gmail (igi_email_id)", {width:3000}), cell("66 / 17%", {width:2000, bg:"fef9c3"}), cell("320", {width:2000}), cell("Doar 66 legate de email", {width:2200})]),
          row([cell("Cu cod COR", {width:3000}), cell("158 / 41%", {width:2000, bg:"fef9c3"}), cell("228", {width:2000}), cell("Corespunde cu avizele", {width:2200})]),
          row([cell("Cu programare IGI", {width:3000}), cell("180 / 47%", {width:2000, bg:"fef9c3"}), cell("206", {width:2000}), cell("Vizibile in pagina Alerte", {width:2200})]),
          row([cell("Legate de firma", {width:3000}), cell("331 / 86%", {width:2000, bg:"dcfce7"}), cell("55", {width:2000}), cell("OK", {width:2200, color:"166534"})]),
          row([cell("Aprobate", {width:3000}), cell("209", {width:2000, bg:"dcfce7"}), cell("—", {width:2000}), cell("209 dosare finalizate", {width:2200})]),
          row([cell("In procesare activ", {width:3000}), cell("82", {width:2000, bg:"fef9c3"}), cell("—", {width:2000}), cell("82 dosare in lucru", {width:2200})]),
        ]
      }),

      spacer(),
      h3("Email-uri IGI — 2.417 importate din Gmail"),

      new Table({
        width: { size: 9200, type: WidthType.DXA },
        columnWidths: [4600, 2300, 2300],
        rows: [
          row([hcell("Categorie email", 4600), hcell("Numar", 2300), hcell("Observatie", 2300)]),
          row([cell("Necategorizate", {width:4600}), cell("1.301", {width:2300}), cell("De clasificat", {width:2300})]),
          row([cell("Inregistrare profil", {width:4600}), cell("433", {width:2300}), cell("OK", {width:2300})]),
          row([cell("Programare IGI", {width:4600}), cell("218", {width:2300}), cell("Vizibile in Alerte", {width:2300})]),
          row([cell("Solutionata", {width:4600}), cell("204", {width:2300}), cell("OK", {width:2300})]),
          row([cell("Aviz emis (PDF aviz)", {width:4600, bold:true}), cell("173", {width:2300, bold:true}), cell("107 nelegate de dosar!", {width:2300, color:"dc2626", bold:true})]),
          row([cell("Document ghiseu", {width:4600}), cell("38", {width:2300}), cell("OK", {width:2300})]),
        ]
      }),

      spacer(),
      spacer(),

      // ─── B3 CE LIPSESTE ───
      new Paragraph({ children: [new PageBreak()] }),
      h2("B3. Ce lipseste — Module de implementat"),
      spacer(),

      h3("Module lipsa complet din CRM"),

      new Table({
        width: { size: 9200, type: WidthType.DXA },
        columnWidths: [2200, 4000, 3000],
        rows: [
          row([hcell("Modul", 2200), hcell("Ce face", 4000), hcell("Impact business", 3000)]),
          row([cell("Contracte", {width:2200, bold:true}), cell("Contracte mediere, contracte munca, termene, clauze", {width:4000}), cell("Nu stii ce ai semnat cu cine", {width:3000, color:"dc2626"})]),
          row([cell("Plati", {width:2200, bold:true}), cell("Evid. plati candidati si firme, facturi, restante", {width:4000}), cell("Nu stii cat ai incasat", {width:3000, color:"dc2626"})]),
          row([cell("Parteneri", {width:2200, bold:true}), cell("Agentii externe: Kiran/Nepal, Jesa/Filipine, etc.", {width:4000}), cell("Nu stii comisioanele datorate", {width:3000, color:"dc2626"})]),
          row([cell("Interviuri", {width:2200, bold:true}), cell("Programare interviuri, rezultate, feedback", {width:4000}), cell("Flux recrutat→plasat incomplet", {width:3000, color:"d97706"})]),
          row([cell("Post-plasare", {width:2200, bold:true}), cell("Garantie 3 luni, abandon, reinnoire permis", {width:4000}), cell("Clienti pierduti nedetectati", {width:3000, color:"dc2626"})]),
          row([cell("Task-uri", {width:2200, bold:true}), cell("To-do per dosar, asignare operator, deadline", {width:4000}), cell("Nimic nu 'cade prin crapaturi'", {width:3000, color:"d97706"})]),
          row([cell("Leads B2B", {width:2200, bold:true}), cell("Urmarire companii noi inainte de contract", {width:4000}), cell("Pipeline vanzari incomplet", {width:3000, color:"d97706"})]),
          row([cell("Audit Log", {width:2200, bold:true}), cell("Cine a schimbat ce si cand", {width:4000}), cell("GDPR compliance, trasabilitate", {width:3000, color:"d97706"})]),
          row([cell("Notificari auto", {width:2200, bold:true}), cell("Email automat la schimbare status dosar", {width:4000}), cell("Operatorii scapa evenimente", {width:3000, color:"d97706"})]),
        ]
      }),

      spacer(),
      h3("Module existente dar incomplete"),

      new Table({
        width: { size: 9200, type: WidthType.DXA },
        columnWidths: [2200, 7000],
        rows: [
          row([hcell("Modul", 2200), hcell("Ce lipseste", 7000)]),
          row([cell("Pipeline", {width:2200}), cell("Doar 5 etape (GJC are 10 etape reale); fara drag & drop; fara legatura la candidati", {width:7000})]),
          row([cell("Dosare Imigrare", {width:2200}), cell("Butonul 'Trimite Email' nu functioneaza; fara Service 1 vs Service 2; fara partener sursa", {width:7000})]),
          row([cell("Rapoarte", {width:2200}), cell("Fara raport financiar; fara KPI per operator; fara export Excel (doar CSV)", {width:7000})]),
          row([cell("Candidati", {width:2200}), cell("Fara camp service_type (recrutare vs imigrare), fara partener sursa, fara telefon", {width:7000})]),
          row([cell("Dashboard", {width:2200}), cell("Fara grafic venituri/cheltuieli; fara alerte urgente proeminente; fara calendar activitati", {width:7000})]),
        ]
      }),

      spacer(),
      spacer(),

      // ─── B4 PLAN IMPLEMENTARE ───
      h2("B4. Plan de implementare — Etape si pasi concret"),
      spacer(),

      // ETAPA 0
      new Table({ width: { size: 9200, type: WidthType.DXA }, columnWidths: [9200],
        rows: [row([new TableCell({ borders: { top:{style:BorderStyle.SINGLE,size:8,color:"dc2626"}, bottom:{style:BorderStyle.SINGLE,size:4,color:"dc2626"}, left:{style:BorderStyle.SINGLE,size:8,color:"dc2626"}, right:{style:BorderStyle.SINGLE,size:4,color:"dc2626"} },
          width:{size:9200,type:WidthType.DXA}, shading:{fill:"fee2e2",type:ShadingType.CLEAR}, margins:{top:160,bottom:160,left:240,right:240},
          children:[new Paragraph({children:[new TextRun({text:"ETAPA 0 — URGENT | 1-2 zile | Date critice lipsa", bold:true, size:26, color:"991b1b", font:"Arial"})]})]
        })])] }),

      spacer(),
      new Table({
        width: { size: 9200, type: WidthType.DXA },
        columnWidths: [400, 3800, 2500, 2500],
        rows: [
          row([hcell("#", 400), hcell("Task", 3800), hcell("Fisier/Locatie", 2500), hcell("Efect", 2500)]),
          row([cell("1", {width:400}), cell("Import telefoane candidati din Excel — scripte Python pentru a citi si actualiza campul phone", {width:3800}), cell("backend/import_phones.py + MongoDB", {width:2500}), cell("Deblocheaza WhatsApp pe 423 candidati", {width:2500, color:"166534"})]),
          row([cell("2", {width:400}), cell("Import expirare pasaport din Excel — campul passport_expiry la toti candidatii", {width:3800}), cell("backend/import_passport_expiry.py", {width:2500}), cell("Activeaza alertele de expirare", {width:2500, color:"166634"})]),
          row([cell("3", {width:400}), cell("Completare date contact companii — contact_person, phone, email pentru cele 60 companii", {width:3800}), cell("Editare manuala sau import Excel", {width:2500}), cell("Date B2B complete", {width:2500, color:"166534"})]),
          row([cell("4", {width:400}), cell("Leaga cele 107 avize Gmail nelegate de dosarele de imigrare corespunzatoare", {width:3800}), cell("backend/link_avize_emails.py", {width:2500}), cell("PDF-uri avize accesibile din dosar", {width:2500, color:"166534"})]),
        ]
      }),

      spacer(),
      spacer(),

      // ETAPA 1
      new Table({ width:{size:9200,type:WidthType.DXA}, columnWidths:[9200],
        rows:[row([new TableCell({ borders:{top:{style:BorderStyle.SINGLE,size:8,color:"ea580c"},bottom:{style:BorderStyle.SINGLE,size:4,color:"ea580c"},left:{style:BorderStyle.SINGLE,size:8,color:"ea580c"},right:{style:BorderStyle.SINGLE,size:4,color:"ea580c"}},
          width:{size:9200,type:WidthType.DXA}, shading:{fill:"fff7ed",type:ShadingType.CLEAR}, margins:{top:160,bottom:160,left:240,right:240},
          children:[new Paragraph({children:[new TextRun({text:"ETAPA 1 — P0 Blockers | 1-2 saptamani | Date si structura de baza", bold:true, size:26, color:"9a3412", font:"Arial"})]})]
        })])] }),

      spacer(),
      new Table({
        width:{size:9200,type:WidthType.DXA}, columnWidths:[400,3800,2500,2500],
        rows:[
          row([hcell("#",400), hcell("Task",3800), hcell("Fisier/Locatie",2500), hcell("Efect",2500)]),
          row([cell("5",{width:400}), cell("Camp service_type pe candidat: Serviciu 1 (recrutare) vs Serviciu 2 (imigrare directa)", {width:3800}), cell("CandidatesPage.js + server.py Candidate model", {width:2500}), cell("Diferentiezi tipul de business", {width:2500})]),
          row([cell("6",{width:400}), cell("Camp source_partner pe candidat: agentia externa sursa (Nepal/Kiran, Filipine/Jesa etc.)", {width:3800}), cell("CandidatesPage.js + Candidate model", {width:2500}), cell("Stii comisioanele datorate", {width:2500})]),
          row([cell("7",{width:400}), cell("Modul Parteneri nou (CRUD): Agentii externe, tara, contact, comision%, nr. candidati trimisi", {width:3800}), cell("PartnersPage.js (nou) + server.py endpoints + MainLayout.js", {width:2500}), cell("Gestionezi agentiile externe", {width:2500})]),
          row([cell("8",{width:400}), cell("Camp assigned_to real: select din lista operatori (nu text liber), legat la colectia operators", {width:3800}), cell("ImmigrationPage.js + CandidatesPage.js", {width:2500}), cell("Stii cine raspunde de fiecare dosar", {width:2500})]),
          row([cell("9",{width:400}), cell("Categorii industrie extinse pe companii + camp numar_posturi_cerute per companie", {width:3800}), cell("CompaniesPage.js + Company model", {width:2500}), cell("Profilul B2B complet", {width:2500})]),
        ]
      }),

      spacer(),
      spacer(),

      // ETAPA 2
      new Paragraph({ children: [new PageBreak()] }),
      new Table({ width:{size:9200,type:WidthType.DXA}, columnWidths:[9200],
        rows:[row([new TableCell({ borders:{top:{style:BorderStyle.SINGLE,size:8,color:"d97706"},bottom:{style:BorderStyle.SINGLE,size:4,color:"d97706"},left:{style:BorderStyle.SINGLE,size:8,color:"d97706"},right:{style:BorderStyle.SINGLE,size:4,color:"d97706"}},
          width:{size:9200,type:WidthType.DXA}, shading:{fill:"fefce8",type:ShadingType.CLEAR}, margins:{top:160,bottom:160,left:240,right:240},
          children:[new Paragraph({children:[new TextRun({text:"ETAPA 2 — P1 Business | 3-4 saptamani | Module financiare si comerciale", bold:true, size:26, color:"92400e", font:"Arial"})]})]
        })])] }),

      spacer(),
      new Table({
        width:{size:9200,type:WidthType.DXA}, columnWidths:[400,3800,2500,2500],
        rows:[
          row([hcell("#",400), hcell("Task",3800), hcell("Fisier/Locatie",2500), hcell("Efect",2500)]),
          row([cell("10",{width:400}), cell("Modul Contracte: contract mediere (GJC-candidat), contract prestari (GJC-firma). Camp: valoare, data, semnat da/nu, PDF semnat", {width:3800}), cell("ContractsPage.js (nou) + /contracts endpoints", {width:2500}), cell("Evidenta juridica completa", {width:2500})]),
          row([cell("11",{width:400}), cell("Modul Plati: plati primite de la candidati si firme. Camp: suma, data, tip (candidat/firma), status (platit/partial/neplatit), factura nr.", {width:3800}), cell("PaymentsPage.js (nou) + /payments endpoints", {width:2500}), cell("Stii cat ai incasat si ce ai de primit", {width:2500})]),
          row([cell("12",{width:400}), cell("Pipeline vanzari extins la 10 etape reale GJC + drag & drop kanban + legatura la candidati", {width:3800}), cell("PipelinePage.js refactor complet", {width:2500}), cell("Urmarire vanzari reala", {width:2500})]),
          row([cell("13",{width:400}), cell("Modul Leads B2B: urmarire companii prospect inainte de contract. Camp: sursa lead, responsabil, stadiu negociere, data follow-up", {width:3800}), cell("Extindere PipelinePage sau pagina separata", {width:2500}), cell("Zero clienti pierduti in etapa de vanzare", {width:2500})]),
          row([cell("14",{width:400}), cell("Integrare email: trimitere email direct din dosarul de imigrare (butonul 'Trimite Email' sa functioneze)", {width:3800}), cell("server.py + SendGrid sau Gmail API", {width:2500}), cell("Comunicare centralizata in CRM", {width:2500})]),
          row([cell("15",{width:400}), cell("Template-uri documente suplimentare: scrisoare invitatie, declaratie proprie raspundere, adeverinta angajare", {width:3800}), cell("pdf_generator.py extins", {width:2500}), cell("-50% timp generare documente", {width:2500})]),
        ]
      }),

      spacer(),
      spacer(),

      // ETAPA 3
      new Table({ width:{size:9200,type:WidthType.DXA}, columnWidths:[9200],
        rows:[row([new TableCell({ borders:{top:{style:BorderStyle.SINGLE,size:8,color:"059669"},bottom:{style:BorderStyle.SINGLE,size:4,color:"059669"},left:{style:BorderStyle.SINGLE,size:8,color:"059669"},right:{style:BorderStyle.SINGLE,size:4,color:"059669"}},
          width:{size:9200,type:WidthType.DXA}, shading:{fill:"f0fdf4",type:ShadingType.CLEAR}, margins:{top:160,bottom:160,left:240,right:240},
          children:[new Paragraph({children:[new TextRun({text:"ETAPA 3 — P2 Operational | 4-5 saptamani | Module operationale si automatizari", bold:true, size:26, color:"065f46", font:"Arial"})]})]
        })])] }),

      spacer(),
      new Table({
        width:{size:9200,type:WidthType.DXA}, columnWidths:[400,3800,2500,2500],
        rows:[
          row([hcell("#",400), hcell("Task",3800), hcell("Fisier/Locatie",2500), hcell("Efect",2500)]),
          row([cell("16",{width:400}), cell("Modul Post-plasare: tracking garantie 3 luni, abandon (candidat pleaca inainte de termen), reinnoire permis muncii", {width:3800}), cell("PostPlacementPage.js (nou) + endpoints", {width:2500}), cell("Zero clienti pierduti dupa plasare", {width:2500})]),
          row([cell("17",{width:400}), cell("Modul Interviuri: programare interviuri (data, ora, tip: online/fizic), rezultat, feedback firma, urmatorul pas", {width:3800}), cell("InterviewsPage.js (nou) sau tab in ImmigrationPage", {width:2500}), cell("Flux complet recrutat→plasat", {width:2500})]),
          row([cell("18",{width:400}), cell("Sistem Task-uri per dosar: to-do list, asignare operator, deadline, status (deschis/in lucru/finalizat)", {width:3800}), cell("TasksPage.js sau sidebar in ImmigrationPage", {width:2500}), cell("Nimic nu se uita", {width:2500})]),
          row([cell("19",{width:400}), cell("Audit Log: inregistrare automata a tuturor modificarilor — cine a schimbat ce si cand, pe toate entitatile", {width:3800}), cell("server.py middleware + AuditPage.js", {width:2500}), cell("GDPR compliance, trasabilitate completa", {width:2500})]),
          row([cell("20",{width:400}), cell("Notificari automate: email catre candidat si firma la schimbare status dosar (aviz aprobat, programare IGI, etc.)", {width:3800}), cell("server.py + SendGrid/Gmail + scheduler", {width:2500}), cell("Operatorii nu mai trimit manual", {width:2500})]),
          row([cell("21",{width:400}), cell("Control acces pe roluri: Admin vede tot, Operator vede doar dosarele lui, Manager vede rapoarte financiare", {width:3800}), cell("server.py middleware + frontend route guards", {width:2500}), cell("Securitate si confidentialitate date", {width:2500})]),
        ]
      }),

      spacer(),
      spacer(),

      // ETAPA 4
      new Table({ width:{size:9200,type:WidthType.DXA}, columnWidths:[9200],
        rows:[row([new TableCell({ borders:{top:{style:BorderStyle.SINGLE,size:8,color:"2563eb"},bottom:{style:BorderStyle.SINGLE,size:4,color:"2563eb"},left:{style:BorderStyle.SINGLE,size:8,color:"2563eb"},right:{style:BorderStyle.SINGLE,size:4,color:"2563eb"}},
          width:{size:9200,type:WidthType.DXA}, shading:{fill:"eff6ff",type:ShadingType.CLEAR}, margins:{top:160,bottom:160,left:240,right:240},
          children:[new Paragraph({children:[new TextRun({text:"ETAPA 4 — P3 Rapoarte & Financiar | 4-5 saptamani | Business intelligence complet", bold:true, size:26, color:"1e3a8a", font:"Arial"})]})]
        })])] }),

      spacer(),
      new Table({
        width:{size:9200,type:WidthType.DXA}, columnWidths:[400,3800,2500,2500],
        rows:[
          row([hcell("#",400), hcell("Task",3800), hcell("Fisier/Locatie",2500), hcell("Efect",2500)]),
          row([cell("22",{width:400}), cell("Dashboard financiar: venituri lunare, cheltuieli, profit per dosar, per companie, per partener", {width:3800}), cell("DashboardPage.js extins + /dashboard/financial endpoint", {width:2500}), cell("Stii exact profitabilitatea", {width:2500})]),
          row([cell("23",{width:400}), cell("KPI per operator: nr. dosare, nr. plasari, rata succes, timp mediu procesare dosar", {width:3800}), cell("ReportsPage.js tab nou + /reports/operators", {width:2500}), cell("Management performanta echipa", {width:2500})]),
          row([cell("24",{width:400}), cell("Export Excel (nu doar CSV): rapoarte cu formatare, grafice, multiple sheet-uri", {width:3800}), cell("server.py + openpyxl library", {width:2500}), cell("Compatibil cu contabilitatea", {width:2500})]),
          row([cell("25",{width:400}), cell("Raport parteneri: candidati trimisi per agentie, comisioane calculate, comisioane platite/restante", {width:3800}), cell("ReportsPage.js tab Parteneri + /reports/partners", {width:2500}), cell("Relatii externe clare si corecte", {width:2500})]),
          row([cell("26",{width:400}), cell("Portal candidat (optional): mini-site unde candidatul isi uploadeaza singur documentele si vede statusul dosarului", {width:3800}), cell("Subdomeniu nou sau sectiune separata", {width:2500}), cell("-50% munca manuala operatori", {width:2500})]),
        ]
      }),

      spacer(),
      spacer(),

      // ─── B5 CONCLUZIE ───
      new Paragraph({ children: [new PageBreak()] }),
      h2("B5. Concluzie si prioritizare"),
      spacer(),

      new Table({
        width:{size:9200,type:WidthType.DXA}, columnWidths:[2000,3200,4000],
        rows:[
          row([hcell("Etapa",2000), hcell("Timp estimat",3200), hcell("Valoare adaugata",4000)]),
          row([cell("Etapa 0",{width:2000,bold:true,color:"dc2626"}), cell("1-2 zile",{width:3200}), cell("Deblocheaza WhatsApp, alertele si avizele PDF",{width:4000,color:"166534"})]),
          row([cell("Etapa 1 — P0",{width:2000,bold:true,color:"ea580c"}), cell("1-2 saptamani",{width:3200}), cell("Structura completa: parteneri, tipuri servicii, responsabili reali",{width:4000})]),
          row([cell("Etapa 2 — P1",{width:2000,bold:true,color:"d97706"}), cell("3-4 saptamani",{width:3200}), cell("Financiar + vanzari + email — CRM devine instrument business real",{width:4000})]),
          row([cell("Etapa 3 — P2",{width:2000,bold:true,color:"059669"}), cell("4-5 saptamani",{width:3200}), cell("Automatizari + post-plasare + audit — zero lucruri scapate",{width:4000})]),
          row([cell("Etapa 4 — P3",{width:2000,bold:true,color:"2563eb"}), cell("4-5 saptamani",{width:3200}), cell("Business intelligence complet — decizii pe date reale",{width:4000})]),
          row([cell("TOTAL",{width:2000,bold:true,bg:"1e40af",color:"FFFFFF"}), cell("~14-16 saptamani",{width:3200,bold:true}), cell("CRM enterprise complet pentru GJC",{width:4000,bold:true})]),
        ]
      }),

      spacer(),
      infoBox(
        "Starea actuala a sistemului",
        "GJC CRM acopera aproximativ 40% din nevoile operationale complete ale companiei. Este functional si gata de productie pentru managementul candidatilor, dosarelor de imigrare si alertelor. Lipsesc modulele financiare, post-plasare si raportarea avansata pentru a deveni un CRM enterprise complet.",
        "f0f9ff", "0ea5e9"
      ),

      spacer(),
      p("Document generat automat de Claude AI — GJC CRM Audit System — Aprilie 2026", {size:18, color:"9ca3af"}),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("C:\\Users\\ioanp\\OneDrive\\Desktop\\GJC_CRM_Prompt_Sesiune_Noua.docx", buffer);
  console.log("DONE: GJC_CRM_Prompt_Sesiune_Noua.docx creat pe Desktop");
}).catch(err => console.error("ERROR:", err));
