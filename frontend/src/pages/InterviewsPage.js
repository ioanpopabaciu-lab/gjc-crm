import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Plus, X, Edit2, Trash2, Calendar, CheckCircle, Clock, XCircle } from 'lucide-react';
import { API } from '../config';
import LoadingSpinner from '../components/LoadingSpinner';

const INTERVIEW_TYPES = [
  { value: "tehnic",   label: "Tehnic" },
  { value: "hr",       label: "HR" },
  { value: "online",   label: "Online / Video" },
  { value: "telefon",  label: "Telefonic" },
  { value: "final",    label: "Final / Decizie" },
];

const STATUS_OPTIONS = [
  { value: "programat",    label: "Programat",    color: "#3b82f6" },
  { value: "realizat",     label: "Realizat",     color: "#10b981" },
  { value: "reprogramat",  label: "Reprogramat",  color: "#f59e0b" },
  { value: "anulat",       label: "Anulat",       color: "#ef4444" },
];

const RESULT_OPTIONS = [
  { value: "",             label: "— Fără rezultat —" },
  { value: "admis",        label: "Admis" },
  { value: "respins",      label: "Respins" },
  { value: "in_asteptare", label: "În Așteptare" },
];

const RESULT_COLORS = { admis: "#10b981", respins: "#ef4444", in_asteptare: "#f59e0b" };

const emptyForm = {
  candidate_id: "", candidate_name: "",
  company_id: "", company_name: "",
  job_title: "", case_id: "",
  scheduled_date: "", scheduled_time: "",
  interview_type: "tehnic", status: "programat",
  result: "", assigned_to: "", notes: "",
  interview_location: "",
  interviewer_name: "",
  interviewer_contact: "",
  candidate_experience: "",
  job_id: "",
  feedback: "",
  interview_link: "",
};

const inputStyle = { width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", boxSizing: "border-box", fontSize: "0.875rem" };
const labelStyle = { display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px", color: "#374151" };
const sectionTitleStyle = { fontSize: "0.75rem", fontWeight: "700", textTransform: "uppercase", color: "#6b7280", letterSpacing: "0.05em", margin: "16px 0 8px 0", borderBottom: "1px solid #f3f4f6", paddingBottom: "4px" };

const InterviewsPage = ({ showNotification }) => {
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [filterStatus, setFilterStatus] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [operators, setOperators] = useState([]);

  const fetchInterviews = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filterStatus) params.status = filterStatus;
      const res = await axios.get(`${API}/interviews`, { params });
      setInterviews(res.data);
    } catch { showNotification("Eroare la încărcare", "error"); }
    finally { setLoading(false); }
  }, [filterStatus, showNotification]);

  useEffect(() => {
    fetchInterviews();
    axios.get(`${API}/candidates`).then(r => setCandidates(r.data)).catch(() => {});
    axios.get(`${API}/companies`).then(r => setCompanies(r.data)).catch(() => {});
    axios.get(`${API}/operators`).then(r => setOperators(r.data)).catch(() => {});
  }, [fetchInterviews]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (item) => {
    setEditing(item);
    setForm({ ...emptyForm, ...item, result: item.result || "" });
    setShowModal(true);
  };

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
      if (editing) {
        await axios.put(`${API}/interviews/${editing.id}`, form);
        showNotification("Interviu actualizat!");
      } else {
        await axios.post(`${API}/interviews`, form);
        showNotification("Interviu planificat!");
      }
      setShowModal(false);
      fetchInterviews();
    } catch { showNotification("Eroare la salvare", "error"); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Ștergi interviul?")) return;
    try { await axios.delete(`${API}/interviews/${id}`); showNotification("Șters!"); fetchInterviews(); }
    catch { showNotification("Eroare", "error"); }
  };

  const stats = {
    programat: interviews.filter(i => i.status === "programat").length,
    realizat:  interviews.filter(i => i.status === "realizat").length,
    admis:     interviews.filter(i => i.result === "admis").length,
    respins:   interviews.filter(i => i.result === "respins").length,
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="page-container">
      {/* Stats */}
      <div style={{ display: "flex", gap: "14px", marginBottom: "20px", flexWrap: "wrap" }}>
        {[
          { label: "Programate", value: stats.programat, color: "#3b82f6" },
          { label: "Realizate", value: stats.realizat, color: "#10b981" },
          { label: "Admisi", value: stats.admis, color: "#22c55e" },
          { label: "Respinși", value: stats.respins, color: "#ef4444" },
        ].map(s => (
          <div key={s.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "14px 22px", minWidth: "140px" }}>
            <div style={{ fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase" }}>{s.label}</div>
            <div style={{ fontSize: "1.8rem", fontWeight: "700", color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
        {STATUS_OPTIONS.map(s => (
          <button key={s.value} onClick={() => setFilterStatus(filterStatus === s.value ? "" : s.value)}
            style={{ padding: "6px 14px", borderRadius: "20px", border: `2px solid ${filterStatus === s.value ? s.color : "#e5e7eb"}`, background: filterStatus === s.value ? s.color : "#fff", color: filterStatus === s.value ? "#fff" : "#374151", cursor: "pointer", fontSize: "0.8rem", fontWeight: "600" }}>
            {s.label}
          </button>
        ))}
        <button onClick={openCreate} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", background: "#6366f1", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" }}>
          <Plus size={16} /> Interviu Nou
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
              <th>Tip</th>
              <th>Data</th>
              <th>Oră</th>
              <th>Locație</th>
              <th>Status</th>
              <th>Rezultat</th>
              <th>Feedback</th>
              <th>Responsabil</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {interviews.length === 0 ? (
              <tr><td colSpan={12} style={{ textAlign: "center", color: "#9ca3af", padding: "40px" }}>Niciun interviu înregistrat.</td></tr>
            ) : interviews.map(item => {
              const st = STATUS_OPTIONS.find(s => s.value === item.status);
              const feedbackText = item.feedback ? (item.feedback.length > 30 ? item.feedback.slice(0, 30) + "…" : item.feedback) : "—";
              const locationText = item.interview_location || (item.interview_link && item.interview_type === "online" ? "Online" : "—");
              return (
                <tr key={item.id}>
                  <td style={{ fontWeight: "600" }}>{item.candidate_name || "—"}</td>
                  <td>{item.company_name || "—"}</td>
                  <td>{item.job_title || "—"}</td>
                  <td>{INTERVIEW_TYPES.find(t => t.value === item.interview_type)?.label || item.interview_type}</td>
                  <td>{item.scheduled_date || "—"}</td>
                  <td>{item.scheduled_time || "—"}</td>
                  <td style={{ maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.interview_location || ""}>{locationText}</td>
                  <td>
                    <span style={{ padding: "2px 10px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: "600", background: st?.color || "#6b7280", color: "#fff" }}>
                      {st?.label || item.status}
                    </span>
                  </td>
                  <td>
                    {item.result ? (
                      <span style={{ fontWeight: "600", color: RESULT_COLORS[item.result] || "#374151" }}>
                        {RESULT_OPTIONS.find(r => r.value === item.result)?.label || item.result}
                      </span>
                    ) : "—"}
                  </td>
                  <td style={{ color: "#6b7280", fontSize: "0.8rem", maxWidth: "150px" }} title={item.feedback || ""}>{feedbackText}</td>
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
          <div style={{ background: "#fff", borderRadius: "12px", padding: "28px", width: "100%", maxWidth: "620px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: "700" }}>{editing ? "Editează Interviu" : "Interviu Nou"}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} /></button>
            </div>

            {/* Secțiunea 1: Candidat & Post */}
            <div style={sectionTitleStyle}>Candidat & Post</div>
            <div style={{ display: "grid", gap: "12px" }}>
              <div>
                <label style={labelStyle}>Candidat *</label>
                <select value={form.candidate_id} onChange={e => handleCandidateChange(e.target.value)} style={inputStyle}>
                  <option value="">— Selectează —</option>
                  {candidates.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Companie</label>
                <select value={form.company_id} onChange={e => handleCompanyChange(e.target.value)} style={inputStyle}>
                  <option value="">— Selectează —</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Post / Funcție</label>
                <input type="text" value={form.job_title} onChange={e => setForm(f => ({ ...f, job_title: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Experiența Candidatului</label>
                <input type="text" value={form.candidate_experience} onChange={e => setForm(f => ({ ...f, candidate_experience: e.target.value }))} placeholder="ex: 2 ani ospătar, fără experiență" style={inputStyle} />
              </div>
            </div>

            {/* Secțiunea 2: Programare */}
            <div style={sectionTitleStyle}>Programare</div>
            <div style={{ display: "grid", gap: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={labelStyle}>Data</label>
                  <input type="date" value={form.scheduled_date} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Ora</label>
                  <input type="time" value={form.scheduled_time} onChange={e => setForm(f => ({ ...f, scheduled_time: e.target.value }))} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={labelStyle}>Tip Interviu</label>
                  <select value={form.interview_type} onChange={e => setForm(f => ({ ...f, interview_type: e.target.value }))} style={inputStyle}>
                    {INTERVIEW_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Locație</label>
                  <input type="text" value={form.interview_location} onChange={e => setForm(f => ({ ...f, interview_location: e.target.value }))} placeholder="Adresă sau locație" style={inputStyle} />
                </div>
              </div>
              {form.interview_type === "online" && (
                <div>
                  <label style={labelStyle}>Link Video</label>
                  <input type="text" value={form.interview_link} onChange={e => setForm(f => ({ ...f, interview_link: e.target.value }))} placeholder="https://zoom.us/..." style={inputStyle} />
                </div>
              )}
            </div>

            {/* Secțiunea 3: Persoană de Contact */}
            <div style={sectionTitleStyle}>Persoană Contact (la Companie)</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={labelStyle}>Numele Intervievatorului</label>
                <input type="text" value={form.interviewer_name} onChange={e => setForm(f => ({ ...f, interviewer_name: e.target.value }))} placeholder="Cine face interviul" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Contact Intervievator</label>
                <input type="text" value={form.interviewer_contact} onChange={e => setForm(f => ({ ...f, interviewer_contact: e.target.value }))} placeholder="Telefon / email" style={inputStyle} />
              </div>
            </div>

            {/* Secțiunea 4: Evaluare */}
            <div style={sectionTitleStyle}>Evaluare</div>
            <div style={{ display: "grid", gap: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={labelStyle}>Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={inputStyle}>
                    {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Rezultat</label>
                  <select value={form.result} onChange={e => setForm(f => ({ ...f, result: e.target.value }))} style={inputStyle}>
                    {RESULT_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Responsabil</label>
                <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} style={inputStyle}>
                  <option value="">— Selectează —</option>
                  <option value="Ioan Baciu">Ioan Baciu</option>
                  {operators.filter(op => op.active !== false).map(op => <option key={op.id} value={op.name}>{op.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Feedback după Interviu</label>
                <textarea value={form.feedback} onChange={e => setForm(f => ({ ...f, feedback: e.target.value }))} rows={4} placeholder="Impresii, observații detaliate după interviu..." style={{ ...inputStyle, resize: "vertical" }} />
              </div>
            </div>

            {/* Secțiunea 5: Note */}
            <div style={sectionTitleStyle}>Note</div>
            <div>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Note scurte..." style={{ ...inputStyle, resize: "vertical" }} />
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "20px", justifyContent: "flex-end" }}>
              <button onClick={() => setShowModal(false)} style={{ padding: "8px 20px", border: "1px solid #e5e7eb", borderRadius: "8px", background: "#fff", cursor: "pointer" }}>Anulează</button>
              <button onClick={handleSave} style={{ padding: "8px 20px", background: "#6366f1", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" }}>
                {editing ? "Salvează" : "Planifică"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InterviewsPage;
