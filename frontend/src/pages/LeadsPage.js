import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Plus, X, Edit2, Trash2, Target } from 'lucide-react';
import { API } from '../config';
import LoadingSpinner from '../components/LoadingSpinner';

const LEAD_STAGES = [
  { value: "prospect",   label: "Prospect",         color: "#6b7280" },
  { value: "contactat",  label: "Contactat",        color: "#3b82f6" },
  { value: "intalnire",  label: "Întâlnire",        color: "#8b5cf6" },
  { value: "oferta",     label: "Ofertă Trimisă",   color: "#f59e0b" },
  { value: "negociere",  label: "Negociere",        color: "#f97316" },
  { value: "castigat",   label: "Câștigat",         color: "#10b981" },
  { value: "pierdut",    label: "Pierdut",          color: "#ef4444" },
];

const SOURCES = ["referral", "website", "linkedin", "facebook", "telefon", "email", "eveniment", "altele"];
const INDUSTRIES = ["Construcții", "HoReCa", "Agricultură", "Industrie", "Transport", "Curățenie", "Logistică", "Sănătate", "Servicii", "IT", "Retail", "Altele"];

const emptyForm = {
  company_name: "",
  contact_person: "",
  phone: "",
  email: "",
  city: "",
  source: "",
  responsible: "",
  industry: "",
  positions_needed: "",
  estimated_value: "",
  stage: "prospect",
  notes: "",
};

const LeadsPage = ({ showNotification }) => {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingLead, setEditingLead] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [filterStage, setFilterStage] = useState("");
  const [operators, setOperators] = useState([]);

  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filterStage) params.stage = filterStage;
      const res = await axios.get(`${API}/leads`, { params });
      setLeads(res.data);
    } catch {
      showNotification("Eroare la încărcarea lead-urilor", "error");
    } finally {
      setLoading(false);
    }
  }, [filterStage, showNotification]);

  useEffect(() => {
    fetchLeads();
    axios.get(`${API}/operators`).then(r => setOperators(r.data)).catch(() => {});
  }, [fetchLeads]);

  const openCreate = () => {
    setEditingLead(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (lead) => {
    setEditingLead(lead);
    setForm({
      company_name: lead.company_name || "",
      contact_person: lead.contact_person || "",
      phone: lead.phone || "",
      email: lead.email || "",
      city: lead.city || "",
      source: lead.source || "",
      responsible: lead.responsible || "",
      industry: lead.industry || "",
      positions_needed: lead.positions_needed || "",
      estimated_value: lead.estimated_value || "",
      stage: lead.stage || "prospect",
      notes: lead.notes || "",
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.company_name) return showNotification("Introdu numele companiei", "error");
    try {
      const payload = {
        ...form,
        positions_needed: form.positions_needed ? parseInt(form.positions_needed) : null,
        estimated_value: form.estimated_value ? parseFloat(form.estimated_value) : null,
      };
      if (editingLead) {
        await axios.put(`${API}/leads/${editingLead.id}`, payload);
        showNotification("Lead actualizat!");
      } else {
        await axios.post(`${API}/leads`, payload);
        showNotification("Lead adăugat!");
      }
      setShowModal(false);
      fetchLeads();
    } catch {
      showNotification("Eroare la salvare", "error");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Ștergi lead-ul?")) return;
    try {
      await axios.delete(`${API}/leads/${id}`);
      showNotification("Lead șters!");
      fetchLeads();
    } catch {
      showNotification("Eroare la ștergere", "error");
    }
  };

  const stageStats = LEAD_STAGES.map(s => ({
    ...s,
    count: leads.filter(l => l.stage === s.value).length,
  }));

  if (loading) return <LoadingSpinner />;

  return (
    <div className="page-container">
      {/* Stage pills summary */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
        {stageStats.map(s => (
          <button
            key={s.value}
            onClick={() => setFilterStage(filterStage === s.value ? "" : s.value)}
            style={{
              padding: "6px 14px",
              borderRadius: "20px",
              border: `2px solid ${filterStage === s.value ? s.color : "#e5e7eb"}`,
              background: filterStage === s.value ? s.color : "#fff",
              color: filterStage === s.value ? "#fff" : "#374151",
              cursor: "pointer",
              fontSize: "0.8rem",
              fontWeight: "600",
              transition: "all 0.15s",
            }}
          >
            {s.label} <span style={{ marginLeft: "4px", opacity: 0.85 }}>({s.count})</span>
          </button>
        ))}
        {filterStage && (
          <button onClick={() => setFilterStage("")} style={{ padding: "6px 12px", borderRadius: "20px", border: "1px solid #e5e7eb", background: "#f9fafb", cursor: "pointer", fontSize: "0.8rem", color: "#6b7280" }}>
            × Resetează
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "16px", alignItems: "center" }}>
        <span style={{ color: "#6b7280", fontSize: "0.875rem" }}>{leads.length} lead-uri</span>
        <button onClick={openCreate} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", background: "#f97316", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" }}>
          <Plus size={16} /> Lead Nou
        </button>
      </div>

      {/* Table */}
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Companie</th>
              <th>Contact</th>
              <th>Telefon</th>
              <th>Industrie</th>
              <th>Posturi</th>
              <th>Valoare Est.</th>
              <th>Sursa</th>
              <th>Responsabil</th>
              <th>Stadiu</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: "center", color: "#9ca3af", padding: "40px" }}>Niciun lead. Adaugă primul prospect.</td></tr>
            ) : leads.map(lead => {
              const stage = LEAD_STAGES.find(s => s.value === lead.stage);
              return (
                <tr key={lead.id}>
                  <td style={{ fontWeight: "600" }}>{lead.company_name}</td>
                  <td>{lead.contact_person || "—"}</td>
                  <td>{lead.phone || "—"}</td>
                  <td>{lead.industry || "—"}</td>
                  <td>{lead.positions_needed || "—"}</td>
                  <td style={{ fontWeight: "600", color: "#10b981" }}>
                    {lead.estimated_value ? `€${Number(lead.estimated_value).toLocaleString("ro-RO")}` : "—"}
                  </td>
                  <td style={{ textTransform: "capitalize" }}>{lead.source || "—"}</td>
                  <td>{lead.responsible || "—"}</td>
                  <td>
                    <span style={{ padding: "2px 10px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: "600", background: stage?.color || "#6b7280", color: "#fff" }}>
                      {stage?.label || lead.stage}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button onClick={() => openEdit(lead)} style={{ background: "none", border: "none", cursor: "pointer", color: "#3b82f6" }} title="Editează"><Edit2 size={16} /></button>
                      <button onClick={() => handleDelete(lead.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444" }} title="Șterge"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", borderRadius: "12px", padding: "28px", width: "100%", maxWidth: "580px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: "700", margin: 0 }}>
                {editingLead ? "Editează Lead" : "Lead Nou"}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} /></button>
            </div>

            <div style={{ display: "grid", gap: "14px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Companie *</label>
                  <input type="text" value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} placeholder="Numele companiei" style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Persoană Contact</label>
                  <input type="text" value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", boxSizing: "border-box" }} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Telefon</label>
                  <input type="text" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Email</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", boxSizing: "border-box" }} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Oraș</label>
                  <input type="text" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Industrie</label>
                  <select value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                    <option value="">— Selectează —</option>
                    {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Nr. Posturi</label>
                  <input type="number" value={form.positions_needed} onChange={e => setForm(f => ({ ...f, positions_needed: e.target.value }))} placeholder="ex: 10" style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Valoare Estimată (€)</label>
                  <input type="number" value={form.estimated_value} onChange={e => setForm(f => ({ ...f, estimated_value: e.target.value }))} placeholder="ex: 5000" style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", boxSizing: "border-box" }} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Sursa Lead</label>
                  <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                    <option value="">— Selectează —</option>
                    {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Responsabil</label>
                  <select value={form.responsible} onChange={e => setForm(f => ({ ...f, responsible: e.target.value }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                    <option value="">— Selectează —</option>
                    <option value="Ioan Baciu">Ioan Baciu</option>
                    {operators.filter(op => op.active !== false).map(op => (
                      <option key={op.id} value={op.name}>{op.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Stadiu Negociere</label>
                <select value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                  {LEAD_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Note</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", resize: "vertical", boxSizing: "border-box" }} />
              </div>
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "20px", justifyContent: "flex-end" }}>
              <button onClick={() => setShowModal(false)} style={{ padding: "8px 20px", border: "1px solid #e5e7eb", borderRadius: "8px", background: "#fff", cursor: "pointer" }}>Anulează</button>
              <button onClick={handleSave} style={{ padding: "8px 20px", background: "#f97316", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" }}>
                {editingLead ? "Salvează" : "Adaugă Lead"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeadsPage;
