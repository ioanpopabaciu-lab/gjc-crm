import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FileText, Download, Copy, X, Eye } from 'lucide-react';
import { API } from '../config';

const TEMPLATES = [
  {
    id: "invitatie_angajare",
    name: "Invitație Angajare",
    category: "Angajare",
    description: "Scrisoare de invitație pentru candidat în vederea angajării",
    fields: ["candidate_name", "company_name", "job_title", "start_date", "contact_person", "contact_phone"],
    body: `Stimate/Stimată {candidate_name},

Vă informăm cu plăcere că în urma procesului de selecție, compania {company_name} vă invită să vă alăturați echipei noastre în funcția de {job_title}.

Data estimată de începere a activității: {start_date}.

Vă rugăm să contactați persoana de contact {contact_person} la numărul {contact_phone} pentru a confirma disponibilitatea și a discuta detaliile contractuale.

Cu stimă,
Global Jobs Consulting
Tel: 0740 000 000
Email: office@gjc.ro`,
  },
  {
    id: "scrisoare_intentie",
    name: "Scrisoare de Intenție GJC",
    category: "Recrutare",
    description: "Scrisoare standard de prezentare a candidatului către angajator",
    fields: ["candidate_name", "candidate_nationality", "job_title", "company_name", "experience", "contact_person"],
    body: `Stimate/Stimată {contact_person},

Vă prezentăm candidatura dlui/dnei {candidate_name}, cetățean {candidate_nationality}, pentru postul de {job_title} în cadrul companiei {company_name}.

Candidatul deține experiență în domeniu ({experience}) și este disponibil pentru angajare imediată.

Documentele necesare pentru angajare sunt în curs de pregătire prin intermediul Global Jobs Consulting.

Suntem la dispoziția dumneavoastră pentru orice informații suplimentare.

Cu stimă,
Global Jobs Consulting`,
  },
  {
    id: "notificare_dosar",
    name: "Notificare Stadiu Dosar",
    category: "Imigrare",
    description: "Informare candidat despre stadiul dosarului de imigrare",
    fields: ["candidate_name", "stage_name", "deadline", "missing_docs", "assigned_to"],
    body: `Stimate/Stimată {candidate_name},

Vă informăm că dosarul dumneavoastră de imigrare se află în prezent în etapa: {stage_name}.

Termen estimat: {deadline}

Documente lipsă / necesare: {missing_docs}

Consilierul dumneavoastră este {assigned_to}. Vă rugăm să îl/o contactați pentru orice clarificare.

Vă mulțumim pentru colaborare.

Cu stimă,
Global Jobs Consulting`,
  },
  {
    id: "confirmare_plasament",
    name: "Confirmare Plasament",
    category: "Post-Plasare",
    description: "Confirmare oficială a plasamentului candidatului",
    fields: ["candidate_name", "company_name", "job_title", "start_date", "monthly_fee", "contact_person"],
    body: `Stimate/Stimată {candidate_name},

Prin prezenta vă confirmăm plasamentul dumneavoastră la compania {company_name}, în funcția de {job_title}, începând cu data de {start_date}.

Tariful lunar de mediere este de {monthly_fee} EUR, conform contractului semnat.

Persoana de contact la angajator este {contact_person}.

Vă urăm mult succes în noul loc de muncă!

Cu stimă,
Global Jobs Consulting`,
  },
  {
    id: "solicitare_documente",
    name: "Solicitare Documente",
    category: "Imigrare",
    description: "Solicitare formală pentru depunerea documentelor lipsă",
    fields: ["candidate_name", "doc_list", "deadline", "assigned_to", "contact_phone"],
    body: `Stimate/Stimată {candidate_name},

Vă solicităm să transmiteți cât mai urgent următoarele documente necesare dosarului dumneavoastră de imigrare:

{doc_list}

Termen limită: {deadline}

Vă rugăm să contactați consilierul {assigned_to} la numărul {contact_phone} sau să transmiteți documentele scanate pe email.

Nerespectarea termenului poate duce la întârzierea sau respingerea dosarului.

Cu stimă,
Global Jobs Consulting`,
  },
  {
    id: "oferta_colaborare_b2b",
    name: "Ofertă Colaborare B2B",
    category: "Vânzări",
    description: "Ofertă de servicii de recrutare/imigrare pentru companie",
    fields: ["company_name", "contact_person", "positions_needed", "nationality", "commission"],
    body: `Stimate/Stimată {contact_person},

Global Jobs Consulting vă oferă servicii complete de recrutare și mediere forță de muncă pentru compania {company_name}.

Solicitare înțeleasă: {positions_needed} posturi, cetățeni {nationality}.

Serviciile noastre includ:
• Selecție și intervievare candidați
• Pregătire documentație imigrare completă
• Suport administrativ post-angajare

Comision servicii: {commission}% din salariul brut lunar, timp de 12 luni.

Suntem la dispoziția dumneavoastră pentru negocieri și detalii suplimentare.

Cu stimă,
Ioan Baciu — Global Jobs Consulting
Tel: 0740 000 000 | Email: office@gjc.ro`,
  },
];

const CATEGORIES = ["Toate", ...new Set(TEMPLATES.map(t => t.category))];
const FIELD_LABELS = {
  candidate_name: "Nume Candidat",
  company_name: "Companie",
  job_title: "Funcție / Post",
  start_date: "Data Start",
  contact_person: "Persoană Contact",
  contact_phone: "Telefon Contact",
  candidate_nationality: "Naționalitate",
  experience: "Experiență",
  stage_name: "Etapă Dosar",
  deadline: "Termen Limită",
  missing_docs: "Documente Lipsă",
  assigned_to: "Consilier",
  monthly_fee: "Onorariu Lunar",
  doc_list: "Lista Documente",
  positions_needed: "Nr. Posturi",
  nationality: "Naționalitate Solicitată",
  commission: "Comision (%)",
};

const TemplatesPage = ({ showNotification }) => {
  const [filterCat, setFilterCat] = useState("Toate");
  const [selected, setSelected] = useState(null);
  const [fieldValues, setFieldValues] = useState({});
  const [preview, setPreview] = useState("");

  const filtered = TEMPLATES.filter(t => filterCat === "Toate" || t.category === filterCat);

  const openTemplate = (tpl) => {
    setSelected(tpl);
    const initial = {};
    tpl.fields.forEach(f => { initial[f] = ""; });
    setFieldValues(initial);
    setPreview(tpl.body);
  };

  const updatePreview = (values, body) => {
    let text = body;
    Object.entries(values).forEach(([key, val]) => {
      text = text.replaceAll(`{${key}}`, val || `[${FIELD_LABELS[key] || key}]`);
    });
    setPreview(text);
  };

  const handleFieldChange = (key, val) => {
    const newValues = { ...fieldValues, [key]: val };
    setFieldValues(newValues);
    updatePreview(newValues, selected.body);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(preview).then(() => {
      showNotification("Text copiat în clipboard!");
    }).catch(() => {
      showNotification("Eroare la copiere", "error");
    });
  };

  const downloadTxt = () => {
    const blob = new Blob([preview], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selected.name.replace(/\s+/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: "flex", gap: "20px", height: "calc(100vh - 140px)", minHeight: "500px" }}>
      {/* Left panel: template list */}
      <div style={{ width: "320px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Category filter */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setFilterCat(cat)}
              style={{ padding: "4px 12px", borderRadius: "14px", border: "1px solid #e5e7eb", background: filterCat === cat ? "#3b82f6" : "#fff", color: filterCat === cat ? "#fff" : "#374151", cursor: "pointer", fontSize: "0.78rem", fontWeight: "600" }}>
              {cat}
            </button>
          ))}
        </div>

        {/* Template cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto" }}>
          {filtered.map(tpl => (
            <button key={tpl.id} onClick={() => openTemplate(tpl)}
              style={{ textAlign: "left", background: selected?.id === tpl.id ? "#eff6ff" : "#fff", border: `2px solid ${selected?.id === tpl.id ? "#3b82f6" : "#e5e7eb"}`, borderRadius: "10px", padding: "12px 14px", cursor: "pointer", transition: "all 0.15s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <FileText size={15} color={selected?.id === tpl.id ? "#3b82f6" : "#6b7280"} />
                <span style={{ fontWeight: "600", fontSize: "0.875rem", color: "#1f2937" }}>{tpl.name}</span>
              </div>
              <span style={{ fontSize: "0.7rem", color: "#fff", background: "#6366f1", padding: "1px 7px", borderRadius: "8px" }}>{tpl.category}</span>
              <p style={{ fontSize: "0.75rem", color: "#6b7280", margin: "6px 0 0" }}>{tpl.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Right panel: editor + preview */}
      {selected ? (
        <div style={{ flex: 1, display: "flex", gap: "16px", minWidth: 0, overflow: "hidden" }}>
          {/* Fields */}
          <div style={{ width: "220px", flexShrink: 0, background: "#fff", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "16px", overflowY: "auto" }}>
            <h3 style={{ margin: "0 0 12px", fontSize: "0.875rem", fontWeight: "700", color: "#374151" }}>Completează câmpurile</h3>
            {selected.fields.map(field => (
              <div key={field} style={{ marginBottom: "10px" }}>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "600", color: "#6b7280", marginBottom: "3px" }}>{FIELD_LABELS[field] || field}</label>
                <input type="text" value={fieldValues[field] || ""} onChange={e => handleFieldChange(field, e.target.value)}
                  placeholder={`[${FIELD_LABELS[field] || field}]`}
                  style={{ width: "100%", padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "0.8rem", boxSizing: "border-box" }} />
              </div>
            ))}
          </div>

          {/* Preview */}
          <div style={{ flex: 1, background: "#fff", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "20px", display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: "700", color: "#1f2937" }}>
                <Eye size={16} style={{ verticalAlign: "middle", marginRight: "6px" }} />
                {selected.name}
              </h3>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={copyToClipboard} style={{ display: "flex", alignItems: "center", gap: "5px", padding: "6px 12px", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: "7px", cursor: "pointer", fontSize: "0.8rem", fontWeight: "600" }}>
                  <Copy size={14} /> Copiază
                </button>
                <button onClick={downloadTxt} style={{ display: "flex", alignItems: "center", gap: "5px", padding: "6px 12px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: "7px", cursor: "pointer", fontSize: "0.8rem", fontWeight: "600" }}>
                  <Download size={14} /> Descarcă .txt
                </button>
              </div>
            </div>
            <textarea
              value={preview}
              onChange={e => setPreview(e.target.value)}
              style={{ flex: 1, padding: "14px", border: "1px solid #e5e7eb", borderRadius: "8px", fontFamily: "Georgia, serif", fontSize: "0.9rem", lineHeight: "1.7", resize: "none", color: "#1f2937", background: "#fafafa" }}
            />
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", borderRadius: "12px", border: "1px solid #e5e7eb" }}>
          <div style={{ textAlign: "center", color: "#9ca3af" }}>
            <FileText size={48} style={{ marginBottom: "12px", opacity: 0.4 }} />
            <p style={{ fontSize: "1rem", fontWeight: "600" }}>Selectează un template din stânga</p>
            <p style={{ fontSize: "0.875rem" }}>Completează câmpurile și generează documentul</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default TemplatesPage;
