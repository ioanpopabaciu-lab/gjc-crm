import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Plus, X, Edit2, Trash2, UserCheck } from 'lucide-react';
import { API } from '../config';
import LoadingSpinner from '../components/LoadingSpinner';

const STATUS_OPTIONS = [
  { value: "activ",     label: "Activ",     color: "#10b981" },
  { value: "finalizat", label: "Finalizat", color: "#3b82f6" },
  { value: "renuntat",  label: "Renunțat",  color: "#ef4444" },
];

const CURRENCIES = ["EUR", "RON", "USD"];

const emptyForm = {
  candidate_id: "", candidate_name: "",
  company_id: "", company_name: "",
  job_title: "", start_date: "", end_date: "",
  monthly_fee: "", fee_currency: "EUR",
  total_months: "", fees_collected: "",
  status: "activ", assigned_to: "", notes: "",
};

const PlacementsPage = ({ showNotification }) => {
  const [placements, setPlacements] = useState([]);
  const [stats, setStats] = useState({ total: 0, active: 0, fees_collected: 0 });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [filterStatus, setFilterStatus] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [operators, setOperators] = useState([]);

  const fetchPlacements = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filterStatus) params.status = filterStatus;
      const [res, statsRes] = await Promise.all([
        axios.get(`${API}/placements`, { params }),
        axios.get(`${API}/placements/stats`).catch(() => ({ data: {} })),
      ]);
      setPlacements(res.data);
      setStats(statsRes.data || {});
    } catch { showNotification("Eroare la încărcare", "error"); }
    finally { setLoading(false); }
  }, [filterStatus, showNotification]);

  useEffect(() => {
    fetchPlacements();
    axios.get(`${API}/candidates`).then(r => setCandidates(r.data)).catch(() => {});
    axios.get(`${API}/companies`).then(r => setCompanies(r.data)).catch(() => {});
    axios.get(`${API}/operators`).then(r => setOperators(r.data)).catch(() => {});
  }, [fetchPlacements]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (item) => { setEditing(item); setForm({ ...emptyForm, ...item, monthly_fee: item.monthly_fee || "", fees_collected: item.fees_collected || "", total_months: item.total_months || "" }); setShowModal(true); };

  const handleCandidateChange = (id) => {
    const c = candidates.find(x => x.id === id);
    setForm(f => ({ ...f, candidate_id: id, candidate_name: c ? `${c.first_name} ${c.last_name}` : "" }));
  };
  const handleCompanyChange = (id) => {
    const c = companies.find(x => x.id === id);
    setForm(f => ({ ...f, company_id: id, company_name: c ? c.name : "" }));
  };

  const handleSave = async () => {
    if (!form.candidate_id) return showNotification("Selectează candidatul", "error");
    try {
      const payload = {
        ...form,
        monthly_fee: form.monthly_fee ? parseFloat(form.monthly_fee) : null,
        fees_collected: form.fees_collected ? parseFloat(form.fees_collected) : null,
        total_months: form.total_months ? parseInt(form.total_months) : null,
      };
      if (editing) {
        await axios.put(`${API}/placements/${editing.id}`, payload);
        showNotification("Plasament actualizat!");
      } else {
        await axios.post(`${API}/placements`, payload);
        showNotification("Plasament înregistrat!");
      }
      setShowModal(false);
      fetchPlacements();
    } catch { showNotification("Eroare la salvare", "error"); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Ștergi plasamentul?")) return;
    try { await axios.delete(`${API}/placements/${id}`); showNotification("Șters!"); fetchPlacements(); }
    catch { showNotification("Eroare", "error"); }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="page-container">
      {/* Stats */}
      <div style={{ display: "flex", gap: "14px", marginBottom: "20px", flexWrap: "wrap" }}>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "14px 22px", minWidth: "140px" }}>
          <div style={{ fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase" }}>Total Plasamente</div>
          <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "#1f2937" }}>{stats.total || 0}</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "14px 22px", minWidth: "140px" }}>
          <div style={{ fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase" }}>Active</div>
          <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "#10b981" }}>{stats.active || 0}</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "14px 22px", minWidth: "200px" }}>
          <div style={{ fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase" }}>Onorarii Colectate</div>
          <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "#3b82f6" }}>€{(stats.fees_collected || 0).toLocaleString("ro-RO")}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
        {STATUS_OPTIONS.map(s => (
          <button key={s.value} onClick={() => setFilterStatus(filterStatus === s.value ? "" : s.value)}
            style={{ padding: "6px 14px", borderRadius: "20px", border: `2px solid ${filterStatus === s.value ? s.color : "#e5e7eb"}`, background: filterStatus === s.value ? s.color : "#fff", color: filterStatus === s.value ? "#fff" : "#374151", cursor: "pointer", fontSize: "0.8rem", fontWeight: "600" }}>
            {s.label} ({placements.filter(p => p.status === s.value).length})
          </button>
        ))}
        <button onClick={openCreate} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", background: "#10b981", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" }}>
          <Plus size={16} /> Plasament Nou
        </button>
      </div>

      {/* Table */}
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Candidat</th>
              <th>Companie</th>
              <th>Post</th>
              <th>Data Start</th>
              <th>Data Final</th>
              <th>Onorariu Lunar</th>
              <th>Onorarii Colectate</th>
              <th>Status</th>
              <th>Responsabil</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {placements.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: "center", color: "#9ca3af", padding: "40px" }}>Niciun plasament înregistrat.</td></tr>
            ) : placements.map(item => {
              const st = STATUS_OPTIONS.find(s => s.value === item.status);
              return (
                <tr key={item.id}>
                  <td style={{ fontWeight: "600" }}>{item.candidate_name || "—"}</td>
                  <td>{item.company_name || "—"}</td>
                  <td>{item.job_title || "—"}</td>
                  <td>{item.start_date || "—"}</td>
                  <td>{item.end_date || "—"}</td>
                  <td style={{ fontWeight: "600" }}>
                    {item.monthly_fee ? `${item.monthly_fee} ${item.fee_currency}` : "—"}
                  </td>
                  <td style={{ fontWeight: "700", color: "#10b981" }}>
                    {item.fees_collected ? `€${Number(item.fees_collected).toLocaleString("ro-RO")}` : "—"}
                  </td>
                  <td>
                    <span style={{ padding: "2px 10px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: "600", background: st?.color, color: "#fff" }}>
                      {st?.label || item.status}
                    </span>
                  </td>
                  <td>{item.assigned_to || "—"}</td>
                  <td>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button onClick={() => openEdit(item)} style={{ background: "none", border: "none", cursor: "pointer", color: "#3b82f6" }}><Edit2 size={16} /></button>
                      <button onClick={() => handleDelete(item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444" }}><Trash2 size={16} /></button>
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
          <div style={{ background: "#fff", borderRadius: "12px", padding: "28px", width: "100%", maxWidth: "560px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: "700" }}>{editing ? "Editează Plasament" : "Plasament Nou"}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} /></button>
            </div>
            <div style={{ display: "grid", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Candidat *</label>
                <select value={form.candidate_id} onChange={e => handleCandidateChange(e.target.value)} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                  <option value="">— Selectează —</option>
                  {candidates.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Companie</label>
                <select value={form.company_id} onChange={e => handleCompanyChange(e.target.value)} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                  <option value="">— Selectează —</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Post / Funcție</label>
                <input type="text" value={form.job_title} onChange={e => setForm(f => ({ ...f, job_title: e.target.value }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", boxSizing: "border-box" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Data Start</label>
                  <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Data Final Contract</label>
                  <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", boxSizing: "border-box" }} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Onorariu/Lună</label>
                  <input type="number" value={form.monthly_fee} onChange={e => setForm(f => ({ ...f, monthly_fee: e.target.value }))} placeholder="ex: 200" style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Monedă</label>
                  <select value={form.fee_currency} onChange={e => setForm(f => ({ ...f, fee_currency: e.target.value }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Luni Totale</label>
                  <input type="number" value={form.total_months} onChange={e => setForm(f => ({ ...f, total_months: e.target.value }))} placeholder="ex: 12" style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", boxSizing: "border-box" }} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Onorarii Colectate (€)</label>
                  <input type="number" value={form.fees_collected} onChange={e => setForm(f => ({ ...f, fees_collected: e.target.value }))} placeholder="ex: 600" style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                    {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Responsabil</label>
                <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                  <option value="">— Selectează —</option>
                  <option value="Ioan Baciu">Ioan Baciu</option>
                  {operators.filter(op => op.active !== false).map(op => <option key={op.id} value={op.name}>{op.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Note</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", resize: "vertical", boxSizing: "border-box" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: "12px", marginTop: "20px", justifyContent: "flex-end" }}>
              <button onClick={() => setShowModal(false)} style={{ padding: "8px 20px", border: "1px solid #e5e7eb", borderRadius: "8px", background: "#fff", cursor: "pointer" }}>Anulează</button>
              <button onClick={handleSave} style={{ padding: "8px 20px", background: "#10b981", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" }}>
                {editing ? "Salvează" : "Înregistrează"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlacementsPage;
