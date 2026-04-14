import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Plus, X, Edit2, Trash2, Users, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { API } from '../config';
import LoadingSpinner from '../components/LoadingSpinner';
import { COR_CODES } from '../data/corCodes';

const CONTRACT_TYPES = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "sezonier",  label: "Sezonier" },
  { value: "proiect",   label: "Proiect" },
];

const STATUS_OPTIONS = [
  { value: "activ",   label: "Activ",   color: "#10b981" },
  { value: "pauza",   label: "Pauză",   color: "#f59e0b" },
  { value: "inchis",  label: "Închis",  color: "#6b7280" },
];

const CURRENCIES = ["EUR", "RON", "USD"];

const emptyForm = {
  company_id: "", company_name: "", title: "", description: "",
  requirements: "", required_skills: [], required_experience_years: 0,
  required_nationality: [], location: "", salary_min: "", salary_max: "",
  currency: "EUR", headcount_needed: 1, start_date: "", status: "activ",
  contract_type: "full_time", accommodation: false, meals: false,
  transport: false, notes: "", contact_person: "", contact_phone: "",
  cor_code: "", cor_name: "",
};

// ─── COR Selector Component ────────────────────────────────────────────────
const CORSelector = ({ value, valueName, onChange }) => {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = search.trim().length >= 2
    ? COR_CODES.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.code.includes(search) ||
        c.group.toLowerCase().includes(search.toLowerCase())
      ).slice(0, 40)
    : [];

  const handleSelect = (cor) => {
    onChange(cor.code, cor.name);
    setSearch("");
    setOpen(false);
  };

  const handleClear = () => { onChange("", ""); setSearch(""); };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {value ? (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", border: "1px solid #6366f1", borderRadius: "8px", background: "#eef2ff" }}>
          <span style={{ fontWeight: "700", color: "#4338ca", fontSize: "0.875rem" }}>{value}</span>
          <span style={{ color: "#374151", fontSize: "0.875rem" }}>{valueName}</span>
          <button onClick={handleClear} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 0 }}><X size={14}/></button>
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }}/>
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Caută meserie sau cod COR..."
            style={{ width: "100%", padding: "8px 12px 8px 32px", border: "1px solid #e5e7eb", borderRadius: "8px", boxSizing: "border-box", fontSize: "0.875rem" }}
          />
        </div>
      )}
      {open && filtered.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 999, background: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", maxHeight: "240px", overflowY: "auto", marginTop: "4px" }}>
          {filtered.map(cor => (
            <div key={cor.code}
              onMouseDown={e => { e.preventDefault(); handleSelect(cor); }}
              style={{ padding: "8px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f3f4f6", fontSize: "0.875rem" }}
              onMouseEnter={e => e.currentTarget.style.background = "#f5f3ff"}
              onMouseLeave={e => e.currentTarget.style.background = ""}
            >
              <div>
                <span style={{ fontWeight: "600", color: "#1f2937" }}>{cor.name}</span>
                <span style={{ fontSize: "0.75rem", color: "#9ca3af", marginLeft: "8px" }}>{cor.group}</span>
              </div>
              <span style={{ fontWeight: "700", color: "#6366f1", fontSize: "0.8rem", marginLeft: "12px", whiteSpace: "nowrap" }}>{cor.code}</span>
            </div>
          ))}
        </div>
      )}
      {open && search.trim().length >= 2 && filtered.length === 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 999, background: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "12px 14px", color: "#9ca3af", fontSize: "0.875rem", marginTop: "4px" }}>
          Niciun rezultat pentru "{search}"
        </div>
      )}
    </div>
  );
};

const inputStyle = { width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", boxSizing: "border-box", fontSize: "0.875rem" };
const labelStyle = { display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px", color: "#374151" };
const sectionTitleStyle = { fontSize: "0.75rem", fontWeight: "700", textTransform: "uppercase", color: "#6b7280", letterSpacing: "0.05em", margin: "16px 0 8px 0", borderBottom: "1px solid #f3f4f6", paddingBottom: "4px" };

const JobsPage = ({ showNotification }) => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [filterStatus, setFilterStatus] = useState("");
  const [companies, setCompanies] = useState([]);
  const [showCandidatesModal, setShowCandidatesModal] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [matches, setMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [nationalitiesInput, setNationalitiesInput] = useState("");
  const navigate = useNavigate();

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filterStatus) params.status = filterStatus;
      const res = await axios.get(`${API}/jobs`, { params });
      setJobs(res.data);
    } catch { showNotification("Eroare la încărcare", "error"); }
    finally { setLoading(false); }
  }, [filterStatus, showNotification]);

  useEffect(() => {
    fetchJobs();
    axios.get(`${API}/companies`).then(r => setCompanies(r.data)).catch(() => {});
  }, [fetchJobs]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setNationalitiesInput("");
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      ...emptyForm,
      ...item,
      salary_min: item.salary_min != null ? String(item.salary_min) : "",
      salary_max: item.salary_max != null ? String(item.salary_max) : "",
      cor_code: item.cor_code || "",
      cor_name: item.cor_name || "",
    });
    setNationalitiesInput(Array.isArray(item.required_nationality) ? item.required_nationality.join(", ") : "");
    setShowModal(true);
  };

  const handleCompanyChange = (id) => {
    const c = companies.find(x => x.id === id);
    setForm(f => ({ ...f, company_id: id, company_name: c ? c.name : "" }));
  };

  const handleSave = async () => {
    if (!form.company_id) return showNotification("Selectează compania", "error");
    if (!form.title) return showNotification("Completează titlul postului", "error");
    const payload = {
      ...form,
      required_nationality: nationalitiesInput
        ? nationalitiesInput.split(",").map(s => s.trim()).filter(Boolean)
        : [],
      salary_min: form.salary_min !== "" ? parseFloat(form.salary_min) : null,
      salary_max: form.salary_max !== "" ? parseFloat(form.salary_max) : null,
      required_experience_years: parseInt(form.required_experience_years, 10) || 0,
      headcount_needed: parseInt(form.headcount_needed, 10) || 1,
    };
    try {
      if (editing) {
        await axios.put(`${API}/jobs/${editing.id}`, payload);
        showNotification("Poziție actualizată!");
      } else {
        await axios.post(`${API}/jobs`, payload);
        showNotification("Poziție creată!");
      }
      setShowModal(false);
      fetchJobs();
    } catch { showNotification("Eroare la salvare", "error"); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Ștergi poziția vacantă?")) return;
    try { await axios.delete(`${API}/jobs/${id}`); showNotification("Șters!"); fetchJobs(); }
    catch { showNotification("Eroare", "error"); }
  };

  const openCandidatesModal = async (job) => {
    setSelectedJob(job);
    setMatches([]);
    setMatchesLoading(true);
    setShowCandidatesModal(true);
    try {
      const res = await axios.get(`${API}/jobs/${job.id}/matches`);
      setMatches(res.data);
    } catch { setMatches([]); }
    finally { setMatchesLoading(false); }
  };

  const totalLocuri = jobs.reduce((acc, j) => acc + ((j.headcount_needed || 1) - (j.positions_filled || 0)), 0);
  const stats = {
    total: jobs.length,
    active: jobs.filter(j => j.status === "activ").length,
    libere: Math.max(0, totalLocuri),
    completate: jobs.filter(j => j.status === "inchis").length,
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="page-container">
      {/* Stats */}
      <div style={{ display: "flex", gap: "14px", marginBottom: "20px", flexWrap: "wrap" }}>
        {[
          { label: "Total Poziții", value: stats.total, color: "#6366f1" },
          { label: "Active", value: stats.active, color: "#10b981" },
          { label: "Locuri Libere", value: stats.libere, color: "#3b82f6" },
          { label: "Completate", value: stats.completate, color: "#6b7280" },
        ].map(s => (
          <div key={s.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "14px 22px", minWidth: "140px" }}>
            <div style={{ fontSize: "0.75rem", color: "#6b7280", textTransform: "uppercase" }}>{s.label}</div>
            <div style={{ fontSize: "1.8rem", fontWeight: "700", color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filtre + Buton Nou */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
        <button
          onClick={() => setFilterStatus("")}
          style={{ padding: "6px 14px", borderRadius: "20px", border: `2px solid ${filterStatus === "" ? "#6366f1" : "#e5e7eb"}`, background: filterStatus === "" ? "#6366f1" : "#fff", color: filterStatus === "" ? "#fff" : "#374151", cursor: "pointer", fontSize: "0.8rem", fontWeight: "600" }}>
          Toate
        </button>
        {STATUS_OPTIONS.map(s => (
          <button key={s.value} onClick={() => setFilterStatus(filterStatus === s.value ? "" : s.value)}
            style={{ padding: "6px 14px", borderRadius: "20px", border: `2px solid ${filterStatus === s.value ? s.color : "#e5e7eb"}`, background: filterStatus === s.value ? s.color : "#fff", color: filterStatus === s.value ? "#fff" : "#374151", cursor: "pointer", fontSize: "0.8rem", fontWeight: "600" }}>
            {s.label}
          </button>
        ))}
        <button onClick={openCreate} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px", padding: "8px 16px", background: "#6366f1", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" }}>
          <Plus size={16} /> Poziție Nouă
        </button>
      </div>

      {/* Tabel */}
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Companie</th>
              <th>Titlu Post</th>
              <th>Cod COR</th>
              <th>Locație</th>
              <th>Tip Contract</th>
              <th>Experiență</th>
              <th>Salariu</th>
              <th>Locuri</th>
              <th>Beneficii</th>
              <th>Status</th>
              <th>Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: "center", color: "#9ca3af", padding: "40px" }}>Nicio poziție vacantă.</td></tr>
            ) : jobs.map(job => {
              const st = STATUS_OPTIONS.find(s => s.value === job.status);
              const ct = CONTRACT_TYPES.find(c => c.value === job.contract_type);
              const filled = job.positions_filled || 0;
              const needed = job.headcount_needed || 1;
              const progress = Math.min(100, Math.round((filled / needed) * 100));
              const salaryText = job.salary_min || job.salary_max
                ? `${job.salary_min || "—"} - ${job.salary_max || "—"} ${job.currency || "EUR"}`
                : "—";
              return (
                <tr key={job.id}>
                  <td style={{ fontWeight: "600" }}>{job.company_name || "—"}</td>
                  <td>{job.title}</td>
                  <td>
                    {job.cor_code ? (
                      <span title={job.cor_name || ""} style={{ fontFamily: "monospace", fontWeight: "600", color: "#6366f1", fontSize: "0.8rem", background: "#eef2ff", padding: "2px 7px", borderRadius: "6px" }}>
                        {job.cor_code}
                      </span>
                    ) : "—"}
                  </td>
                  <td>{job.location || "—"}</td>
                  <td>{ct?.label || job.contract_type || "—"}</td>
                  <td>{job.required_experience_years ? `${job.required_experience_years} ani` : "—"}</td>
                  <td style={{ whiteSpace: "nowrap", fontSize: "0.85rem" }}>{salaryText}</td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: "60px" }}>
                      <span style={{ fontSize: "0.8rem", fontWeight: "600" }}>{filled}/{needed}</span>
                      <div style={{ background: "#e5e7eb", borderRadius: "4px", height: "5px" }}>
                        <div style={{ background: progress >= 100 ? "#10b981" : "#3b82f6", borderRadius: "4px", height: "5px", width: `${progress}%` }} />
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "4px", fontSize: "1rem" }}>
                      {job.accommodation && <span title="Cazare inclusă">🏠</span>}
                      {job.meals && <span title="Masă inclusă">🍽️</span>}
                      {job.transport && <span title="Transport inclus">🚌</span>}
                      {!job.accommodation && !job.meals && !job.transport && <span style={{ color: "#9ca3af", fontSize: "0.75rem" }}>—</span>}
                    </div>
                  </td>
                  <td>
                    <span style={{ padding: "2px 10px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: "600", background: st?.color || "#6b7280", color: "#fff" }}>
                      {st?.label || job.status}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <button onClick={() => openEdit(job)} style={{ background: "none", border: "none", cursor: "pointer", color: "#3b82f6" }} title="Editează"><Edit2 size={15} /></button>
                      <button onClick={() => handleDelete(job.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444" }} title="Șterge"><Trash2 size={15} /></button>
                      <button onClick={() => openCandidatesModal(job)} style={{ display: "flex", alignItems: "center", gap: "3px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "6px", cursor: "pointer", color: "#3b82f6", padding: "3px 8px", fontSize: "0.75rem", fontWeight: "600" }} title="Candidați potriviți">
                        <Users size={13} /> Candidați
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal Formular */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", borderRadius: "12px", padding: "28px", width: "100%", maxWidth: "700px", maxHeight: "92vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: "700" }}>{editing ? "Editează Poziție" : "Poziție Vacantă Nouă"}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} /></button>
            </div>

            {/* Secțiunea 1: Companie & Post */}
            <div style={sectionTitleStyle}>Companie & Post</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={labelStyle}>Companie *</label>
                <select value={form.company_id} onChange={e => handleCompanyChange(e.target.value)} style={inputStyle}>
                  <option value="">— Selectează —</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Titlu Post *</label>
                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="ex: Ospătar, Bucătar" style={inputStyle} />
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <label style={labelStyle}>Cod COR <span style={{ fontWeight: 400, color: "#9ca3af" }}>(Clasificarea Ocupațiilor din România)</span></label>
                <CORSelector
                  value={form.cor_code}
                  valueName={form.cor_name}
                  onChange={(code, name) => setForm(f => ({ ...f, cor_code: code, cor_name: name }))}
                />
              </div>
              <div>
                <label style={labelStyle}>Locație</label>
                <input type="text" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Oraș, țară" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Data Start</label>
                <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} style={inputStyle} />
              </div>
            </div>

            {/* Secțiunea 2: Cerințe */}
            <div style={sectionTitleStyle}>Cerințe</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={labelStyle}>Experiență (ani)</label>
                <input type="number" min="0" value={form.required_experience_years} onChange={e => setForm(f => ({ ...f, required_experience_years: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Tip Contract</label>
                <select value={form.contract_type} onChange={e => setForm(f => ({ ...f, contract_type: e.target.value }))} style={inputStyle}>
                  {CONTRACT_TYPES.map(ct => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <label style={labelStyle}>Naționalități Acceptate <span style={{ color: "#9ca3af", fontWeight: 400 }}>(separate prin virgulă)</span></label>
                <input type="text" value={nationalitiesInput} onChange={e => setNationalitiesInput(e.target.value)} placeholder="ex: Română, Vietnameză, Nepaleză" style={inputStyle} />
              </div>
            </div>

            {/* Secțiunea 3: Salariu & Locuri */}
            <div style={sectionTitleStyle}>Salariu & Locuri</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px" }}>
              <div>
                <label style={labelStyle}>Salariu Minim</label>
                <input type="number" min="0" value={form.salary_min} onChange={e => setForm(f => ({ ...f, salary_min: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Salariu Maxim</label>
                <input type="number" min="0" value={form.salary_max} onChange={e => setForm(f => ({ ...f, salary_max: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Valută</label>
                <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} style={inputStyle}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Nr. Locuri</label>
                <input type="number" min="1" value={form.headcount_needed} onChange={e => setForm(f => ({ ...f, headcount_needed: e.target.value }))} style={inputStyle} />
              </div>
            </div>
            <div style={{ marginTop: "12px" }}>
              <label style={labelStyle}>Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={{ ...inputStyle, maxWidth: "200px" }}>
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            {/* Secțiunea 4: Beneficii */}
            <div style={sectionTitleStyle}>Beneficii</div>
            <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
              {[
                { key: "accommodation", label: "🏠 Cazare inclusă" },
                { key: "meals", label: "🍽️ Masă inclusă" },
                { key: "transport", label: "🚌 Transport inclus" },
              ].map(b => (
                <label key={b.key} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.875rem", fontWeight: "500" }}>
                  <input type="checkbox" checked={form[b.key]} onChange={e => setForm(f => ({ ...f, [b.key]: e.target.checked }))} style={{ width: "16px", height: "16px", cursor: "pointer" }} />
                  {b.label}
                </label>
              ))}
            </div>

            {/* Secțiunea 5: Descriere & Contact */}
            <div style={sectionTitleStyle}>Descriere & Contact</div>
            <div style={{ display: "grid", gap: "12px" }}>
              <div>
                <label style={labelStyle}>Descriere Post</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} style={{ ...inputStyle, resize: "vertical" }} placeholder="Descriere generală a postului..." />
              </div>
              <div>
                <label style={labelStyle}>Cerințe Specifice</label>
                <textarea value={form.requirements} onChange={e => setForm(f => ({ ...f, requirements: e.target.value }))} rows={3} style={{ ...inputStyle, resize: "vertical" }} placeholder="Detalii despre cerințele postului..." />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={labelStyle}>Persoană Contact</label>
                  <input type="text" value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Telefon Contact</label>
                  <input type="text" value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Note</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
              </div>
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "20px", justifyContent: "flex-end" }}>
              <button onClick={() => setShowModal(false)} style={{ padding: "8px 20px", border: "1px solid #e5e7eb", borderRadius: "8px", background: "#fff", cursor: "pointer" }}>Anulează</button>
              <button onClick={handleSave} style={{ padding: "8px 20px", background: "#6366f1", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" }}>
                {editing ? "Salvează" : "Creează"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Candidați Potriviți */}
      {showCandidatesModal && selectedJob && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", borderRadius: "12px", padding: "28px", width: "100%", maxWidth: "640px", maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: "700" }}>Candidați Potriviți</h2>
                <div style={{ fontSize: "0.85rem", color: "#6b7280", marginTop: "2px" }}>{selectedJob.title} — {selectedJob.company_name}</div>
              </div>
              <button onClick={() => setShowCandidatesModal(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} /></button>
            </div>

            {matchesLoading ? (
              <div style={{ textAlign: "center", padding: "30px", color: "#6b7280" }}>Se caută candidați potriviți...</div>
            ) : matches.length === 0 ? (
              <div style={{ textAlign: "center", padding: "30px", color: "#9ca3af" }}>Niciun candidat potrivit găsit.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    <th style={{ padding: "8px 12px", textAlign: "left", borderBottom: "1px solid #e5e7eb", fontWeight: "600" }}>Candidat</th>
                    <th style={{ padding: "8px 12px", textAlign: "left", borderBottom: "1px solid #e5e7eb", fontWeight: "600" }}>Naționalitate</th>
                    <th style={{ padding: "8px 12px", textAlign: "left", borderBottom: "1px solid #e5e7eb", fontWeight: "600" }}>Experiență</th>
                    <th style={{ padding: "8px 12px", textAlign: "left", borderBottom: "1px solid #e5e7eb", fontWeight: "600" }}>Status</th>
                    <th style={{ padding: "8px 12px", textAlign: "left", borderBottom: "1px solid #e5e7eb", fontWeight: "600" }}>Acțiuni</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((c, i) => (
                    <tr key={c.id || i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "8px 12px", fontWeight: "600" }}>{c.first_name} {c.last_name}</td>
                      <td style={{ padding: "8px 12px" }}>{c.nationality || "—"}</td>
                      <td style={{ padding: "8px 12px" }}>{c.experience_years != null ? `${c.experience_years} ani` : "—"}</td>
                      <td style={{ padding: "8px 12px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: "10px", fontSize: "0.75rem", fontWeight: "600", background: "#eff6ff", color: "#3b82f6" }}>
                          {c.status || "—"}
                        </span>
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        <button
                          onClick={() => { setShowCandidatesModal(false); navigate("/interviews"); }}
                          style={{ display: "flex", alignItems: "center", gap: "4px", background: "#10b981", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", padding: "4px 10px", fontSize: "0.75rem", fontWeight: "600" }}>
                          <span>📅</span> Interviu
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setShowCandidatesModal(false)} style={{ padding: "8px 20px", border: "1px solid #e5e7eb", borderRadius: "8px", background: "#fff", cursor: "pointer" }}>Închide</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JobsPage;
