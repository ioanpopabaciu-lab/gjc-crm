import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Plus, X, Edit2, Trash2, FileText, DollarSign } from 'lucide-react';
import { API } from '../config';
import LoadingSpinner from '../components/LoadingSpinner';

const CONTRACT_TYPES = [
  { value: "contract_mediere", label: "Contract Mediere" },
  { value: "contract_prestari", label: "Contract Prestări Servicii" },
];

const STATUS_OPTIONS = ["activ", "expirat", "reziliat"];

const STATUS_COLORS = {
  activ: "#10b981",
  expirat: "#f59e0b",
  reziliat: "#ef4444",
};

const CURRENCIES = ["EUR", "RON", "USD"];

const emptyForm = {
  type: "contract_mediere",
  candidate_id: "",
  candidate_name: "",
  company_id: "",
  company_name: "",
  value: "",
  currency: "EUR",
  date_signed: "",
  validity_months: "",
  status: "activ",
  notes: "",
};

const ContractsPage = ({ showNotification }) => {
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingContract, setEditingContract] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [companies, setCompanies] = useState([]);

  const fetchContracts = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filterType) params.type = filterType;
      if (filterStatus) params.status = filterStatus;
      const res = await axios.get(`${API}/contracts`, { params });
      setContracts(res.data);
    } catch {
      showNotification("Eroare la încărcarea contractelor", "error");
    } finally {
      setLoading(false);
    }
  }, [filterType, filterStatus, showNotification]);

  useEffect(() => {
    fetchContracts();
    axios.get(`${API}/candidates`).then(r => setCandidates(r.data)).catch(() => {});
    axios.get(`${API}/companies`).then(r => setCompanies(r.data)).catch(() => {});
  }, [fetchContracts]);

  const openCreate = () => {
    setEditingContract(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (contract) => {
    setEditingContract(contract);
    setForm({
      type: contract.type || "contract_mediere",
      candidate_id: contract.candidate_id || "",
      candidate_name: contract.candidate_name || "",
      company_id: contract.company_id || "",
      company_name: contract.company_name || "",
      value: contract.value || "",
      currency: contract.currency || "EUR",
      date_signed: contract.date_signed || "",
      validity_months: contract.validity_months || "",
      status: contract.status || "activ",
      notes: contract.notes || "",
    });
    setShowModal(true);
  };

  const handleCandidateChange = (id) => {
    const cand = candidates.find(c => c.id === id);
    setForm(f => ({
      ...f,
      candidate_id: id,
      candidate_name: cand ? `${cand.first_name} ${cand.last_name}` : "",
    }));
  };

  const handleCompanyChange = (id) => {
    const comp = companies.find(c => c.id === id);
    setForm(f => ({
      ...f,
      company_id: id,
      company_name: comp ? comp.name : "",
    }));
  };

  const handleSave = async () => {
    if (!form.type) return showNotification("Selectează tipul contractului", "error");
    try {
      const payload = {
        ...form,
        value: form.value ? parseFloat(form.value) : null,
        validity_months: form.validity_months ? parseInt(form.validity_months) : null,
      };
      if (editingContract) {
        await axios.put(`${API}/contracts/${editingContract.id}`, payload);
        showNotification("Contract actualizat!");
      } else {
        const newContractRes = await axios.post(`${API}/contracts`, payload);
        const newContract = newContractRes.data;
        // Creare automată înregistrare plată "neplatit" în Plăți
        if (payload.value && payload.value > 0) {
          await axios.post(`${API}/payments`, {
            type: payload.company_id ? "firma" : "candidat",
            entity_id: payload.company_id || payload.candidate_id || "",
            entity_name: payload.company_name || payload.candidate_name || "",
            amount: payload.value,
            currency: payload.currency || "EUR",
            status: "neplatit",
            contract_id: newContract.id,
            notes: `Creat automat din contract ${payload.type === "contract_mediere" ? "mediere" : "prestări servicii"}`,
          }).catch(() => {}); // nu blocam daca plata nu se poate crea
        }
        showNotification("Contract creat! Plata apare automat în Plăți → Neîncasat.");
      }
      setShowModal(false);
      fetchContracts();
    } catch {
      showNotification("Eroare la salvare", "error");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Ștergi contractul?")) return;
    try {
      await axios.delete(`${API}/contracts/${id}`);
      showNotification("Contract șters!");
      fetchContracts();
    } catch {
      showNotification("Eroare la ștergere", "error");
    }
  };

  // Totaluri grupate pe valută
  const byCurrency = contracts.reduce((acc, c) => {
    if (c.value) {
      const cur = c.currency || "EUR";
      acc[cur] = (acc[cur] || 0) + c.value;
    }
    return acc;
  }, {});
  const totalDisplay = Object.entries(byCurrency)
    .map(([cur, val]) => `${val.toLocaleString("ro-RO", { minimumFractionDigits: 0 })} ${cur}`)
    .join(" · ") || "0";
  const activeCount = contracts.filter(c => c.status === "activ").length;

  if (loading) return <LoadingSpinner />;

  return (
    <div className="page-container">
      {/* Stats */}
      <div className="stats-grid" style={{ display: "flex", gap: "16px", marginBottom: "20px", flexWrap: "wrap" }}>
        <div className="stat-card" style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "16px 24px", minWidth: "160px" }}>
          <div style={{ fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase" }}>Total Contracte</div>
          <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "#1f2937" }}>{contracts.length}</div>
        </div>
        <div className="stat-card" style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "16px 24px", minWidth: "160px" }}>
          <div style={{ fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase" }}>Active</div>
          <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "#10b981" }}>{activeCount}</div>
        </div>
        <div className="stat-card" style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "16px 24px", minWidth: "200px" }}>
          <div style={{ fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase" }}>Valoare Totală</div>
          <div style={{ fontSize: "1.4rem", fontWeight: "700", color: "#3b82f6", lineHeight: 1.3 }}>
            {totalDisplay}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar" style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="filter-select" style={{ padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "0.875rem" }}>
          <option value="">Toate tipurile</option>
          {CONTRACT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="filter-select" style={{ padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "0.875rem" }}>
          <option value="">Toate statusurile</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        <button className="btn-primary" onClick={openCreate} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" }}>
          <Plus size={16} /> Contract Nou
        </button>
      </div>

      {/* Table */}
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Tip Contract</th>
              <th>Candidat</th>
              <th>Companie</th>
              <th>Valoare</th>
              <th>Data Semnare</th>
              <th>Valabilitate</th>
              <th>Status</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {contracts.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: "center", color: "#9ca3af", padding: "40px" }}>Niciun contract. Adaugă primul contract.</td></tr>
            ) : contracts.map(contract => (
              <tr key={contract.id}>
                <td>
                  <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <FileText size={14} />
                    {CONTRACT_TYPES.find(t => t.value === contract.type)?.label || contract.type}
                  </span>
                </td>
                <td>{contract.candidate_name || "—"}</td>
                <td>{contract.company_name || "—"}</td>
                <td style={{ fontWeight: "600" }}>
                  {contract.value ? `${contract.value.toLocaleString("ro-RO")} ${contract.currency}` : "—"}
                </td>
                <td>{contract.date_signed || "—"}</td>
                <td>{contract.validity_months ? `${contract.validity_months} luni` : "—"}</td>
                <td>
                  <span className="badge" style={{ background: STATUS_COLORS[contract.status] || "#6b7280", color: "#fff", padding: "2px 10px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: "600" }}>
                    {contract.status}
                  </span>
                </td>
                <td>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button onClick={() => openEdit(contract)} style={{ background: "none", border: "none", cursor: "pointer", color: "#3b82f6" }} title="Editează"><Edit2 size={16} /></button>
                    <button onClick={() => handleDelete(contract.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444" }} title="Șterge"><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div className="modal-content" style={{ background: "#fff", borderRadius: "12px", padding: "28px", width: "100%", maxWidth: "560px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: "700", margin: 0 }}>
                {editingContract ? "Editează Contract" : "Contract Nou"}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} /></button>
            </div>

            <div style={{ display: "grid", gap: "14px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Tip Contract *</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                  {CONTRACT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              {form.type === "contract_mediere" && (
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Candidat</label>
                  <select value={form.candidate_id} onChange={e => handleCandidateChange(e.target.value)} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                    <option value="">— Selectează candidat —</option>
                    {candidates.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name} ({c.nationality})</option>)}
                  </select>
                </div>
              )}

              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Companie</label>
                <select value={form.company_id} onChange={e => handleCompanyChange(e.target.value)} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                  <option value="">— Selectează companie —</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Valoare</label>
                  <input type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="ex: 500" style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Monedă</label>
                  <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Data Semnare</label>
                  <input type="date" value={form.date_signed} onChange={e => setForm(f => ({ ...f, date_signed: e.target.value }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Valabilitate (luni)</label>
                  <input type="number" value={form.validity_months} onChange={e => setForm(f => ({ ...f, validity_months: e.target.value }))} placeholder="ex: 12" style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", boxSizing: "border-box" }} />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Note</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", resize: "vertical", boxSizing: "border-box" }} />
              </div>
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "20px", justifyContent: "flex-end" }}>
              <button onClick={() => setShowModal(false)} style={{ padding: "8px 20px", border: "1px solid #e5e7eb", borderRadius: "8px", background: "#fff", cursor: "pointer" }}>Anulează</button>
              <button onClick={handleSave} style={{ padding: "8px 20px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" }}>
                {editingContract ? "Salvează" : "Creează Contract"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContractsPage;
