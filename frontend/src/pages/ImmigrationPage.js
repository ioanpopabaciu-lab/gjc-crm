import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { FileText, Plus, ChevronRight, Eye, Trash2, X, AlertTriangle, Paperclip, Upload, Download, Globe, Building2, Briefcase, Mail, ChevronDown, Search, Filter, Calendar, Award, Clock } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { API } from '../config';
import LoadingSpinner from '../components/LoadingSpinner';
import { COR_CODES } from '../data/corCodes';

const ImmigrationPage = ({ showNotification }) => {
  // Make COR codes available globally for datalist
  window._corCodes = COR_CODES;

  const [searchParams] = useSearchParams();

  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stages, setStages] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [newCase, setNewCase] = useState({});
  const [candidates, setCandidates] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [activeTab, setActiveTab] = useState("documents");
  // Filtre — inițializate din URL dacă venind din Clienți B2B
  const [search, setSearch] = useState("");
  const [filterStage, setFilterStage] = useState("");
  const [filterCompany, setFilterCompany] = useState(() => searchParams.get("company_id") || "");
  const [filterCompanyName, setFilterCompanyName] = useState(() => searchParams.get("company_name") || "");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterTipProcedura, setFilterTipProcedura] = useState("");
  const [showFilters, setShowFilters] = useState(true);
  const [operators, setOperators] = useState([]);
  // Email modal
  const [emailModal, setEmailModal] = useState({ open: false, caseData: null });
  const [emailForm, setEmailForm] = useState({ to: "", cc: "", subject: "", body: "" });
  const [emailSending, setEmailSending] = useState(false);
  // Tab vizualizare principală
  const [pageView, setPageView] = useState("dosare"); // "dosare" | "avize"
  const [avizSearch, setAvizSearch] = useState("");
  const [avizEditModal, setAvizEditModal] = useState(null); // case object sau null
  const [avizEditForm, setAvizEditForm] = useState({});

  const fetchCases = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (filterStage) params.append("stage", filterStage);
      if (filterCompany) params.append("company_id", filterCompany);
      if (filterStatus) params.append("status", filterStatus);
      if (filterDateFrom) params.append("date_from", filterDateFrom);
      if (filterDateTo) params.append("date_to", filterDateTo);
      if (filterTipProcedura) params.append("tip_procedura", filterTipProcedura);
      const [casesRes, stagesRes, candidatesRes, companiesRes, operatorsRes] = await Promise.all([
        axios.get(`${API}/immigration?${params.toString()}`),
        axios.get(`${API}/immigration/stages`),
        axios.get(`${API}/candidates`),
        axios.get(`${API}/companies`),
        axios.get(`${API}/operators`).catch(() => ({ data: [] }))
      ]);
      setCases(casesRes.data);
      setStages(stagesRes.data.stages);
      setCandidates(candidatesRes.data);
      setCompanies(companiesRes.data);
      setOperators(operatorsRes.data || []);
    } catch (error) {
      showNotification("Eroare la încărcarea dosarelor", "error");
    } finally {
      setLoading(false);
    }
  }, [search, filterStage, filterCompany, filterStatus, filterDateFrom, filterDateTo, filterTipProcedura, showNotification]);

  const exportCSV = () => {
    const headers = ["Candidat", "Companie", "Tip", "Etapa", "Status", "Nr IGI", "Nr Aviz", "Data Aviz", "Programare", "Data Depunere"];
    const rows = cases.map(c => [
      c.candidate_name || "",
      c.company_name || "",
      c.case_type || "",
      c.current_stage_name || "",
      c.status || "",
      c.igi_number || "",
      c.aviz_number || "",
      c.aviz_date || "",
      c.appointment_date ? `${c.appointment_date} ${c.appointment_time || ""}` : "",
      c.submitted_date || ""
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `dosare_imigrare_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const exportXLS = () => {
    const headers = ["Candidat", "Companie", "Tip", "Etapa", "Status", "Nr IGI", "Nr Aviz", "Data Aviz", "Programare", "Data Depunere"];
    const rows = cases.map(c => [
      c.candidate_name || "", c.company_name || "", c.case_type || "",
      c.current_stage_name || "", c.status || "", c.igi_number || "",
      c.aviz_number || "", c.aviz_date || "",
      c.appointment_date ? `${c.appointment_date} ${c.appointment_time || ""}` : "",
      c.submitted_date || ""
    ]);
    const esc = v => String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    let html = `<table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>`;
    rows.forEach(r => { html += `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`; });
    html += '</tbody></table>';
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `dosare_imigrare_${new Date().toISOString().slice(0,10)}.xls`;
    a.click(); URL.revokeObjectURL(url);
  };

  const exportAvizeXLS = (avize) => {
    const headers = ["Nr. Aviz", "Candidat", "Companie", "Funcție", "Cod COR", "Data Aviz", "Nr. IGI", "Etapă", "Status"];
    const rows = avize.map(c => [
      c.aviz_number || "", c.candidate_name || "", c.company_name || "",
      c.job_function || "", c.cor_code || "", c.aviz_date || "",
      c.igi_number || "", c.current_stage_name || "", c.status || ""
    ]);
    const esc = v => String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    let html = `<table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>`;
    rows.forEach(r => { html += `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`; });
    html += '</tbody></table>';
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `avize_munca_${new Date().toISOString().slice(0,10)}.xls`;
    a.click(); URL.revokeObjectURL(url);
  };

  const openAvizEdit = (caseItem) => {
    setAvizEditForm({
      aviz_number: caseItem.aviz_number || "",
      aviz_date: caseItem.aviz_date || "",
      igi_number: caseItem.igi_number || "",
      job_function: caseItem.job_function || "",
      cor_code: caseItem.cor_code || "",
      appointment_date: caseItem.appointment_date || "",
      appointment_time: caseItem.appointment_time || "",
    });
    setAvizEditModal(caseItem);
  };

  const handleSaveAviz = async () => {
    if (!avizEditModal) return;
    try {
      await axios.put(`${API}/immigration/${avizEditModal.id}`, {
        ...avizEditModal,
        ...avizEditForm,
      });
      showNotification("Aviz actualizat!");
      setAvizEditModal(null);
      fetchCases();
    } catch (err) {
      showNotification("Eroare la salvare aviz", "error");
    }
  };

  const clearFilters = () => {
    setSearch(""); setFilterStage(""); setFilterCompany("");
    setFilterStatus(""); setFilterDateFrom(""); setFilterDateTo(""); setFilterTipProcedura("");
  };
  const hasActiveFilters = search || filterStage || filterCompany || filterStatus || filterDateFrom || filterDateTo || filterTipProcedura;

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  const fetchCaseDetails = async (caseId) => {
    try {
      const response = await axios.get(`${API}/immigration/${caseId}`);
      setSelectedCase(response.data);
      setActiveTab("documents");
    } catch (error) {
      showNotification("Eroare la încărcarea detaliilor", "error");
    }
  };

  const openEmailModal = (caseData) => {
    const candidateName = caseData.candidate_name || "";
    const companyName = caseData.company_name || "";
    setEmailForm({
      to: "",
      cc: "",
      subject: `Dosar imigrare — ${candidateName}${companyName ? " / " + companyName : ""}`,
      body: `Bună ziua,\n\nVă contactăm în legătură cu dosarul de imigrare al candidatului ${candidateName}${companyName ? " pentru compania " + companyName : ""}.\n\nEtapa curentă: ${caseData.current_stage_name || ""}\n\n\n\nCu stimă,\nGlobal Jobs Consulting`,
    });
    setEmailModal({ open: true, caseData });
  };

  const handleSendEmail = async () => {
    if (!emailForm.to || !emailForm.subject) return showNotification("Completează destinatarul și subiectul", "error");
    setEmailSending(true);
    try {
      await axios.post(`${API}/send-email`, {
        ...emailForm,
        case_id: emailModal.caseData?.id,
        candidate_name: emailModal.caseData?.candidate_name,
      });
      showNotification("Email trimis cu succes!");
      setEmailModal({ open: false, caseData: null });
    } catch (err) {
      showNotification(err.response?.data?.detail || "Eroare la trimitere email", "error");
    } finally {
      setEmailSending(false);
    }
  };

  const advanceCase = async (caseId) => {
    try {
      const response = await axios.patch(`${API}/immigration/${caseId}/advance`);
      showNotification(response.data.message);
      fetchCases();
      if (selectedCase?.id === caseId) {
        fetchCaseDetails(caseId);
      }
    } catch (error) {
      showNotification(error.response?.data?.detail || "Eroare la avansare", "error");
    }
  };

  const updateDocument = async (category, docId, status, issueDate, expiryDate) => {
    if (!selectedCase) return;
    try {
      await axios.patch(`${API}/immigration/${selectedCase.id}/document`, {
        category,
        doc_id: docId,
        status,
        issue_date: issueDate,
        expiry_date: expiryDate
      });
      showNotification("Document actualizat!");
      fetchCaseDetails(selectedCase.id);
    } catch (error) {
      showNotification("Eroare la actualizare", "error");
    }
  };

  const handleSave = async () => {
    try {
      await axios.post(`${API}/immigration`, newCase);
      showNotification("Dosar creat!");
      setShowModal(false);
      setNewCase({});
      fetchCases();
    } catch (error) {
      showNotification("Eroare la salvare", "error");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Sigur doriți să ștergeți acest dosar?")) return;
    try {
      await axios.delete(`${API}/immigration/${id}`);
      showNotification("Dosar șters!");
      if (selectedCase?.id === id) setSelectedCase(null);
      fetchCases();
    } catch (error) {
      showNotification("Eroare la ștergere", "error");
    }
  };

  const getDocStatusIcon = (status) => {
    switch (status) {
      case 'present': return <span className="doc-check check-yes">✓</span>;
      case 'expiring': return <span className="doc-check check-alert">!</span>;
      case 'expired': return <span className="doc-check check-expired">✗</span>;
      default: return <span className="doc-check check-no">○</span>;
    }
  };

  const getDaysUntilExpiry = (dateStr) => {
    if (!dateStr) return null;
    const expiry = new Date(dateStr);
    const today = new Date();
    const diff = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const handleFileUpload = async (category, docId, file) => {
    if (!selectedCase || !file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      await axios.post(
        `${API}/upload/document/${selectedCase.id}/${category}/${docId}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      showNotification(`Fișier încărcat: ${file.name}`);
      fetchCaseDetails(selectedCase.id);
    } catch (error) {
      showNotification(error.response?.data?.detail || "Eroare la încărcare", "error");
    }
  };

  const downloadFile = (filename) => {
    window.open(`${API}/upload/document/${filename}`, '_blank');
  };

  const deleteFile = async (category, docId) => {
    if (!selectedCase) return;
    if (!window.confirm("Sigur doriți să ștergeți acest fișier?")) return;
    
    try {
      await axios.delete(`${API}/upload/document/${selectedCase.id}/${category}/${docId}`);
      showNotification("Fișier șters!");
      fetchCaseDetails(selectedCase.id);
    } catch (error) {
      showNotification("Eroare la ștergere", "error");
    }
  };

  // File upload input ref component
  const FileUploadButton = ({ category, docId, hasFile }) => {
    const fileInputRef = useRef(null);
    
    const handleClick = () => {
      if (hasFile) {
        // Show options - view/delete
        return;
      }
      fileInputRef.current?.click();
    };
    
    return (
      <>
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept=".pdf,.jpg,.jpeg,.png,.gif"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileUpload(category, docId, file);
            e.target.value = '';
          }}
        />
        <button 
          className={`icon-btn small ${hasFile ? 'has-file' : ''}`} 
          onClick={handleClick}
          title={hasFile ? "Fișier atașat" : "Încarcă fișier"}
        >
          {hasFile ? <Paperclip size={14} /> : <Upload size={14} />}
        </button>
      </>
    );
  };

  // Case List View
  if (!selectedCase) {
    return (
      <div className="module-container" data-testid="immigration-module">
        {/* Toolbar principal */}
        <div className="module-toolbar">
          <div className="toolbar-left">
            <div className="search-box">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Caută candidat, companie, nr. IGI..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="search-input"
              />
              {search && <button className="clear-search" onClick={() => setSearch("")}><X size={14}/></button>}
            </div>
            <button
              className={`btn btn-secondary filter-toggle ${showFilters ? 'active' : ''}`}
              onClick={() => setShowFilters(f => !f)}
            >
              <Filter size={16} />
              Filtre
              {hasActiveFilters && <span className="filter-badge">●</span>}
            </button>
            {hasActiveFilters && (
              <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
                <X size={14} /> Resetează
              </button>
            )}
          </div>
          <div className="toolbar-right">
            <span className="records-count">{cases.length} dosare</span>
            <button className="btn btn-secondary" onClick={exportCSV} title="Exportă CSV">
              <Download size={16} /> Export CSV
            </button>
            <button className="btn btn-secondary" onClick={exportXLS} style={{ background: '#16a34a', color: '#fff', borderColor: '#16a34a' }} title="Exportă XLS">
              <Download size={16} /> Export XLS
            </button>
            <button className="btn btn-primary" onClick={() => setShowModal(true)} data-testid="add-case-btn">
              <Plus size={16} /> Dosar Nou
            </button>
          </div>
        </div>

        {/* Filtre extinse */}
        {showFilters && (
          <div className="filter-bar">
            <div className="filter-group">
              <label>Etapă</label>
              <select value={filterStage} onChange={e => setFilterStage(e.target.value)}>
                <option value="">Toate etapele</option>
                {stages.map((s, i) => (
                  <option key={i} value={s}>{i+1}. {s}</option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label>Companie</label>
              <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}>
                <option value="">Toate companiile</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label>Status</label>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="">Toate statusurile</option>
                <option value="activ">Activ</option>
                <option value="aprobat">Aprobat</option>
                <option value="respins">Respins</option>
                <option value="suspendat">Suspendat</option>
              </select>
            </div>
            <div className="filter-group">
              <label><Calendar size={14}/> De la</label>
              <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
            </div>
            <div className="filter-group">
              <label><Calendar size={14}/> Până la</label>
              <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
            </div>
            <div className="filter-group">
              <label>Tip Procedură</label>
              <select value={filterTipProcedura} onChange={e => setFilterTipProcedura(e.target.value)}>
                <option value="">Toate tipurile</option>
                <option value="angajare_initiala">🌍 Angajare inițială</option>
                <option value="schimbare_angajator">🔄 Schimbare angajator</option>
                <option value="prelungire_permis">📅 Prelungire permis</option>
              </select>
            </div>
          </div>
        )}

        {/* Tab switcher: Dosare / Avize de Muncă */}
        <div style={{ display:'flex', gap:8, margin:'12px 0 4px', borderBottom:'2px solid var(--border-color)' }}>
          <button
            onClick={() => setPageView("dosare")}
            style={{
              padding:'8px 20px', border:'none', background:'none', cursor:'pointer', fontWeight:600,
              borderBottom: pageView==="dosare" ? '3px solid var(--primary)' : '3px solid transparent',
              color: pageView==="dosare" ? 'var(--primary)' : 'var(--text-muted)',
              marginBottom:'-2px'
            }}
          >
            📁 Dosare ({cases.length})
          </button>
          <button
            onClick={() => setPageView("avize")}
            style={{
              padding:'8px 20px', border:'none', background:'none', cursor:'pointer', fontWeight:600,
              borderBottom: pageView==="avize" ? '3px solid #7c3aed' : '3px solid transparent',
              color: pageView==="avize" ? '#7c3aed' : 'var(--text-muted)',
              marginBottom:'-2px'
            }}
          >
            🏅 Avize de Muncă ({cases.filter(c => c.aviz_number).length})
          </button>
        </div>

        {/* ======= TAB AVIZE ======= */}
        {pageView === "avize" && (() => {
          const avize = cases.filter(c => c.aviz_number).filter(c => {
            if (!avizSearch) return true;
            const s = avizSearch.toLowerCase();
            return (c.aviz_number||"").toLowerCase().includes(s)
              || (c.candidate_name||"").toLowerCase().includes(s)
              || (c.company_name||"").toLowerCase().includes(s)
              || (c.igi_number||"").toLowerCase().includes(s);
          });
          return (
            <div>
              <div style={{ display:'flex', gap:8, alignItems:'center', margin:'12px 0' }}>
                <div className="search-box" style={{ flex:1, maxWidth:320 }}>
                  <Search size={16} className="search-icon" />
                  <input
                    type="text"
                    placeholder="Caută după nr. aviz, candidat, companie..."
                    value={avizSearch}
                    onChange={e => setAvizSearch(e.target.value)}
                    className="search-input"
                  />
                  {avizSearch && <button className="clear-search" onClick={() => setAvizSearch("")}><X size={14}/></button>}
                </div>
                <span className="records-count">{avize.length} avize</span>
                <button className="btn btn-secondary" style={{ background:'#7c3aed', color:'#fff', borderColor:'#7c3aed' }} onClick={() => exportAvizeXLS(avize)}>
                  <Download size={16} /> Export XLS
                </button>
              </div>
              {loading ? <LoadingSpinner /> : (
                <div className="data-table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Nr. Aviz</th>
                        <th>Candidat</th>
                        <th>Companie</th>
                        <th>Funcție</th>
                        <th>Cod COR</th>
                        <th>Data Aviz</th>
                        <th>Nr. IGI</th>
                        <th>Programare IGI</th>
                        <th>Etapă</th>
                        <th>Status</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {avize.map(c => (
                        <tr key={c.id}>
                          <td><strong style={{ color:'#7c3aed' }}>{c.aviz_number}</strong></td>
                          <td>{c.candidate_name}</td>
                          <td style={{ color:'var(--text-muted)' }}>{c.company_name}</td>
                          <td>{c.job_function || <span style={{color:'var(--text-muted)'}}>—</span>}</td>
                          <td>{c.cor_code || <span style={{color:'var(--text-muted)'}}>—</span>}</td>
                          <td>{c.aviz_date || <span style={{color:'var(--text-muted)'}}>—</span>}</td>
                          <td>{c.igi_number || <span style={{color:'var(--text-muted)'}}>—</span>}</td>
                          <td>{c.appointment_date ? `${c.appointment_date}${c.appointment_time ? ' '+c.appointment_time : ''}` : <span style={{color:'var(--text-muted)'}}>—</span>}</td>
                          <td><span className="stage-chip" style={{fontSize:'0.7rem'}}>{c.current_stage_name}</span></td>
                          <td><span className={`case-status ${c.status}`}>{c.status}</span></td>
                          <td>
                            <button className="btn btn-secondary btn-sm" style={{padding:'4px 10px', fontSize:'0.78rem'}} onClick={() => openAvizEdit(c)}>
                              ✏️ Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                      {avize.length === 0 && (
                        <tr><td colSpan={11} style={{textAlign:'center', padding:'32px', color:'var(--text-muted)'}}>
                          Niciun aviz găsit{avizSearch ? ` pentru "${avizSearch}"` : ""}
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Modal Edit Aviz */}
              {avizEditModal && (
                <div className="modal-overlay" onClick={() => setAvizEditModal(null)}>
                  <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth:520 }}>
                    <div className="modal-header">
                      <h2>✏️ Editează Aviz — {avizEditModal.candidate_name}</h2>
                      <button className="close-btn" onClick={() => setAvizEditModal(null)}><X size={20}/></button>
                    </div>
                    <div className="modal-body">
                      <div className="form-grid">
                        <div className="form-group">
                          <label>Nr. Aviz *</label>
                          <input type="text" value={avizEditForm.aviz_number}
                            onChange={e => setAvizEditForm({...avizEditForm, aviz_number: e.target.value})}
                            placeholder="ex: 12345" />
                        </div>
                        <div className="form-group">
                          <label>Data Aviz</label>
                          <input type="date" value={avizEditForm.aviz_date}
                            onChange={e => setAvizEditForm({...avizEditForm, aviz_date: e.target.value})} />
                        </div>
                        <div className="form-group">
                          <label>Nr. IGI</label>
                          <input type="text" value={avizEditForm.igi_number}
                            onChange={e => setAvizEditForm({...avizEditForm, igi_number: e.target.value})}
                            placeholder="ex: IGI/2024/..." />
                        </div>
                        <div className="form-group">
                          <label>Programare IGI (data)</label>
                          <input type="date" value={avizEditForm.appointment_date}
                            onChange={e => setAvizEditForm({...avizEditForm, appointment_date: e.target.value})} />
                        </div>
                        <div className="form-group">
                          <label>Programare IGI (ora)</label>
                          <input type="time" value={avizEditForm.appointment_time}
                            onChange={e => setAvizEditForm({...avizEditForm, appointment_time: e.target.value})} />
                        </div>
                        <div className="form-group">
                          <label>Cod COR</label>
                          <input type="text" value={avizEditForm.cor_code}
                            onChange={e => setAvizEditForm({...avizEditForm, cor_code: e.target.value})}
                            placeholder="ex: 711101" />
                        </div>
                        <div className="form-group full-width">
                          <label>Funcție (meserie)</label>
                          <input list="cor-aviz-edit-list" value={avizEditForm.job_function}
                            onChange={e => {
                              const match = (window._corCodes||[]).find(c => c.name === e.target.value);
                              setAvizEditForm({...avizEditForm, job_function: e.target.value, cor_code: match?.code || avizEditForm.cor_code});
                            }}
                            placeholder="Caută meserie din lista COR..." />
                          <datalist id="cor-aviz-edit-list">
                            {(window._corCodes||[]).map(c => <option key={c.code} value={c.name}>{c.code} — {c.name}</option>)}
                          </datalist>
                        </div>
                      </div>
                    </div>
                    <div className="modal-footer">
                      <button className="btn btn-secondary" onClick={() => setAvizEditModal(null)}>Anulează</button>
                      <button className="btn btn-primary" onClick={handleSaveAviz}>Salvează Aviz</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ======= TAB DOSARE (existent) ======= */}
        {pageView === "dosare" && (
        <div>
        {/* Legenda etape */}
        <div className="stages-legend-bar">
          {stages.slice(0, 5).map((stage, idx) => (
            <span
              key={idx}
              className={`stage-chip ${filterStage === stage ? 'active' : ''}`}
              onClick={() => setFilterStage(filterStage === stage ? "" : stage)}
            >
              {idx + 1}. {stage}
            </span>
          ))}
          {stages.length > 5 && <span className="stage-chip more">+{stages.length - 5} etape</span>}
        </div>

        {loading ? <LoadingSpinner /> : (
          <div className="immigration-grid">
            {cases.map((caseItem) => (
              <div key={caseItem.id} className="case-card" data-testid={`case-${caseItem.id}`}>
                <div className="case-header">
                  <span className={`case-type ${caseItem.case_type?.toLowerCase().replace(/ /g, "-")}`}>
                    {caseItem.case_type}
                  </span>
                  <span className={`case-status ${caseItem.status}`}>{caseItem.status}</span>
                </div>
                {caseItem.tip_procedura && (
                  <div style={{padding:'2px 10px 6px'}}>
                    <span style={{
                      fontSize:'0.72rem', fontWeight:700, padding:'2px 8px', borderRadius:4,
                      background: caseItem.tip_procedura === 'schimbare_angajator' ? '#fef3c7' : caseItem.tip_procedura === 'prelungire_permis' ? '#ede9fe' : '#dbeafe',
                      color: caseItem.tip_procedura === 'schimbare_angajator' ? '#92400e' : caseItem.tip_procedura === 'prelungire_permis' ? '#6d28d9' : '#1d4ed8',
                    }}>
                      {caseItem.tip_procedura === 'angajare_initiala' ? '🌍 Angajare inițială' : caseItem.tip_procedura === 'schimbare_angajator' ? '🔄 Schimbare angajator' : '📅 Prelungire permis'}
                    </span>
                  </div>
                )}
                <div className="case-body">
                  <h4>{caseItem.candidate_name}</h4>
                  <p className="company">{caseItem.company_name}</p>
                  <div className="stage-progress">
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${(caseItem.current_stage / stages.length) * 100}%` }} />
                    </div>
                    <span className="stage-text">
                      Etapa {caseItem.current_stage}/{stages.length}: {stages[caseItem.current_stage - 1] || caseItem.current_stage_name}
                    </span>
                  </div>
                  {/* Date IGI din PDF */}
                  <div className="case-igi-info">
                    {caseItem.aviz_number && (
                      <span className="igi-badge"><Award size={12}/> Aviz #{caseItem.aviz_number}</span>
                    )}
                    {caseItem.igi_number && (
                      <span className="igi-badge"><FileText size={12}/> IGI: {caseItem.igi_number}</span>
                    )}
                    {caseItem.job_function && (
                      <span className="cor-badge">
                        {caseItem.cor_code ? `COR ${caseItem.cor_code}: ` : ""}{caseItem.job_function}
                      </span>
                    )}
                    {caseItem.appointment_date && (
                      <span className="igi-badge appointment"><Clock size={12}/> Prog: {caseItem.appointment_date} {caseItem.appointment_time || ""}</span>
                    )}
                  </div>
                </div>
                <div className="case-actions">
                  <button className="btn btn-secondary" onClick={() => fetchCaseDetails(caseItem.id)} data-testid={`view-case-${caseItem.id}`}>
                    <Eye size={16} /> Deschide
                  </button>
                  {caseItem.current_stage < stages.length && (
                    <button className="btn btn-success" onClick={() => advanceCase(caseItem.id)} data-testid={`advance-${caseItem.id}`}>
                      <ChevronRight size={16} /> Avansează
                    </button>
                  )}
                  <button className="icon-btn danger" onClick={() => handleDelete(caseItem.id)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
            {cases.length === 0 && (
              <div className="empty-state full-width">
                <FileText size={48} />
                <p>Nu există dosare{hasActiveFilters ? " pentru filtrele selectate" : ""}. {!hasActiveFilters && "Creați primul dosar!"}</p>
              </div>
            )}
          </div>
        )}
        </div>
        )}

        {/* New Case Modal */}
        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} data-testid="immigration-modal">
              <div className="modal-header">
                <h2>Dosar Nou Imigrare</h2>
                <button className="close-btn" onClick={() => setShowModal(false)}><X size={20} /></button>
              </div>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label>Candidat *</label>
                    <select
                      value={newCase.candidate_id || ""}
                      onChange={(e) => {
                        const cand = candidates.find(c => c.id === e.target.value);
                        setNewCase({
                          ...newCase,
                          candidate_id: e.target.value,
                          candidate_name: cand ? `${cand.first_name} ${cand.last_name}` : "",
                          company_id: cand?.company_id,
                          company_name: cand?.company_name,
                          passport_expiry: cand?.passport_expiry,
                          permit_expiry: cand?.permit_expiry
                        });
                      }}
                      data-testid="case-candidate-select"
                    >
                      <option value="">Selectează candidat...</option>
                      {candidates.map(cand => (
                        <option key={cand.id} value={cand.id}>{cand.first_name} {cand.last_name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Tip Dosar *</label>
                    <select
                      value={newCase.case_type || "Permis de muncă"}
                      onChange={(e) => setNewCase({ ...newCase, case_type: e.target.value })}
                      data-testid="case-type-select"
                    >
                      <option value="Permis de muncă">Permis de muncă</option>
                      <option value="Viză de lungă ședere">Viză de lungă ședere</option>
                      <option value="Reînnoire permis">Reînnoire permis</option>
                      <option value="Reunificare familială">Reunificare familială</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Tip Procedură</label>
                    <select
                      value={newCase.tip_procedura || ""}
                      onChange={(e) => setNewCase({ ...newCase, tip_procedura: e.target.value })}
                    >
                      <option value="">Selectează...</option>
                      <option value="angajare_initiala">🌍 Angajare inițială</option>
                      <option value="schimbare_angajator">🔄 Schimbare angajator (deja în RO)</option>
                      <option value="prelungire_permis">📅 Prelungire permis</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Meserie / Cod COR</label>
                    <input
                      list="cor-immigration-list"
                      value={newCase.job_function || ""}
                      onChange={(e) => {
                        const matches = (window._corCodes || []).find(c => c.name === e.target.value);
                        setNewCase({ ...newCase, job_function: e.target.value, cor_code: matches?.code || newCase.cor_code });
                      }}
                      placeholder="Caută meserie..."
                      style={{width:'100%', padding:'8px 12px', border:'1px solid var(--border-color)', borderRadius:'var(--radius-sm)'}}
                    />
                    <datalist id="cor-immigration-list">
                      {(window._corCodes || []).map(c => <option key={c.code} value={c.name}>{c.code} — {c.name}</option>)}
                    </datalist>
                    {newCase.cor_code && <small style={{color:'#6366f1'}}>COR: {newCase.cor_code}</small>}
                  </div>
                  <div className="form-group">
                    <label>Data Depunere</label>
                    <input type="date" value={newCase.submitted_date || ""} onChange={(e) => setNewCase({ ...newCase, submitted_date: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Responsabil</label>
                    <select value={newCase.assigned_to || "Ioan Baciu"} onChange={(e) => setNewCase({ ...newCase, assigned_to: e.target.value })}>
                      <option value="Ioan Baciu">Ioan Baciu</option>
                      {operators.filter(op => op.active !== false).map(op => (
                        <option key={op.id} value={op.name}>{op.name}{op.role ? ` (${op.role})` : ""}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group full-width">
                  <label>Note</label>
                  <textarea value={newCase.notes || ""} onChange={(e) => setNewCase({ ...newCase, notes: e.target.value })} rows={3} />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Anulează</button>
                <button className="btn btn-primary" onClick={handleSave} data-testid="save-case-btn">Creează Dosar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Case Detail View (Tracker Style)
  const caseData = selectedCase;
  const candidateDetails = caseData.candidate_details || {};
  const companyDetails = caseData.company_details || {};
  const passportDays = getDaysUntilExpiry(candidateDetails.passport_expiry || caseData.passport_expiry);
  const permitDays = getDaysUntilExpiry(caseData.permit_expiry);

  return (
    <div className="module-container case-tracker" data-testid="case-tracker">
      {/* Alert Bar */}
      {passportDays !== null && passportDays <= 90 && (
        <div className={`alert-bar ${passportDays <= 30 ? 'critical' : 'warning'}`}>
          <span className="alert-icon">🚨</span>
          <div className="alert-text">
            <strong>ATENȚIE:</strong> Pașaportul candidatului <strong>{caseData.candidate_name}</strong> 
            {passportDays <= 0 ? ` a expirat de ${Math.abs(passportDays)} zile` : ` expiră în ${passportDays} zile`}.
            {passportDays <= 30 && " Inițiați procedura de reînnoire imediat."}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="tracker-header">
        <button className="btn btn-ghost back-btn" onClick={() => setSelectedCase(null)} data-testid="back-to-list">
          <ChevronRight size={16} style={{ transform: 'rotate(180deg)' }} /> Înapoi la listă
        </button>
        
        <div className="candidate-header">
          <div className="big-avatar" data-testid="candidate-avatar">
            {(candidateDetails.first_name?.[0] || caseData.candidate_name?.[0] || 'C').toUpperCase()}
            {(candidateDetails.last_name?.[0] || caseData.candidate_name?.split(' ')[1]?.[0] || '').toUpperCase()}
          </div>
          <div className="candidate-info">
            <h2>{caseData.candidate_name}</h2>
            <div className="candidate-meta">
              <span className="meta-item"><Globe size={14} /> {candidateDetails.nationality || 'Nepal'}</span>
              <span className="meta-item"><Building2 size={14} /> {caseData.company_name}</span>
              <span className="meta-item"><Briefcase size={14} /> {candidateDetails.job_type || 'Muncitor'}</span>
              <span className="meta-item"><FileText size={14} /> {candidateDetails.passport_number || '-'}</span>
              {passportDays !== null && passportDays <= 90 && (
                <span className={`meta-item ${passportDays <= 30 ? 'urgent' : 'warning'}`}>
                  <AlertTriangle size={14} /> Pașaport {passportDays <= 0 ? 'expirat' : `expiră ${candidateDetails.passport_expiry || caseData.passport_expiry}`}
                </span>
              )}
            </div>
          </div>
          <div className="candidate-actions">
            <div className="dropdown-container">
              <button className="btn btn-outline dropdown-trigger" data-testid="pdf-dropdown-btn">
                <FileText size={16} /> Generează PDF <ChevronDown size={14} />
              </button>
              <div className="dropdown-menu">
                <a 
                  href={`${API}/pdf/angajament-plata/${caseData.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dropdown-item"
                  data-testid="pdf-angajament"
                >
                  📄 Angajament de Plată
                </a>
                <a 
                  href={`${API}/pdf/contract-mediere/${caseData.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dropdown-item"
                  data-testid="pdf-contract"
                >
                  📋 Contract de Mediere
                </a>
                <a 
                  href={`${API}/pdf/oferta-angajare/${caseData.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dropdown-item"
                  data-testid="pdf-oferta"
                >
                  📝 Ofertă Fermă de Angajare
                </a>
              </div>
            </div>
            <button className="btn btn-outline" onClick={() => openEmailModal(caseData)}><Mail size={16} /> Trimite Email</button>
            {caseData.current_stage < stages.length && (
              <button className="btn btn-primary" onClick={() => advanceCase(caseData.id)}>
                <ChevronRight size={16} /> Avansează Etapa
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Documente Bifate</div>
          <div className="stat-value green">{caseData.documents_complete || 0}<span className="stat-sub-value">/{caseData.documents_total || 34}</span></div>
          <div className="stat-sub">{caseData.completion_percentage || 0}% complet</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Etapă Curentă</div>
          <div className="stat-value blue" style={{ fontSize: '16px' }}>{caseData.current_stage_name || stages[caseData.current_stage - 1]}</div>
          <div className="stat-sub">Etapa {caseData.current_stage} din {stages.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Zile până Exp. Pașaport</div>
          <div className={`stat-value ${passportDays <= 30 ? 'red' : passportDays <= 90 ? 'orange' : 'green'}`}>
            {passportDays !== null ? (passportDays <= 0 ? 'EXPIRAT' : passportDays) : '-'}
          </div>
          <div className="stat-sub">{candidateDetails.passport_expiry || caseData.passport_expiry || '-'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Permis Ședere</div>
          <div className={`stat-value ${permitDays && permitDays <= 90 ? 'orange' : 'green'}`}>
            {permitDays !== null ? (permitDays <= 0 ? 'EXPIRAT' : permitDays) : '-'}
          </div>
          <div className="stat-sub">{caseData.permit_expiry || 'Nedefinit'}</div>
        </div>
      </div>

      {/* Pipeline Progress */}
      <div className="pipeline-card">
        <div className="section-title">Progres Dosar Imigrare</div>
        <div className="immigration-pipeline">
          {stages.map((stage, idx) => {
            const stageNum = idx + 1;
            const isDone = caseData.current_stage > stageNum;
            const isActive = caseData.current_stage === stageNum;
            return (
              <div key={idx} className={`pipe-step ${isDone ? 'done' : isActive ? 'active' : 'pending'}`}>
                <div className="pipe-dot">{isDone ? '✓' : stageNum}</div>
                <div className="pipe-label">{stage.replace(' ', '\n')}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <div className="tracker-tabs">
        <button className={`tab ${activeTab === 'documents' ? 'active' : ''}`} onClick={() => setActiveTab('documents')}>
          📋 Documente Dosar
        </button>
        <button className={`tab ${activeTab === 'company' ? 'active' : ''}`} onClick={() => setActiveTab('company')}>
          🏢 Acte Companie
        </button>
        <button className={`tab ${activeTab === 'personal' ? 'active' : ''}`} onClick={() => setActiveTab('personal')}>
          👤 Date Personale
        </button>
        <button className={`tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
          📜 Istoric
        </button>
      </div>

      {/* Tab Content: Documents */}
      {activeTab === 'documents' && (
        <div className="tab-content" data-testid="documents-tab">
          <div className="legend">
            <div className="legend-item"><div className="legend-dot green"></div> Document la dosar</div>
            <div className="legend-item"><div className="legend-dot gray"></div> Lipsă / neobținut</div>
            <div className="legend-item"><div className="legend-dot orange"></div> Expiră în 90 zile</div>
            <div className="legend-item"><div className="legend-dot red"></div> Expirat / Critic</div>
            <div className="legend-note">* = Obligatoriu</div>
          </div>

          <div className="doc-grid">
            {caseData.documents && Object.entries(caseData.documents)
              .filter(([key]) => key !== 'company')
              .map(([category, catData]) => {
                const completeDocs = catData.docs?.filter(d => d.status === 'present' || d.status === 'expiring').length || 0;
                const totalDocs = catData.docs?.filter(d => d.required).length || 0;
                
                return (
                  <div key={category} className="doc-section" data-testid={`doc-section-${category}`}>
                    <div className="doc-section-header">
                      <div className="doc-section-title">
                        <span className="section-icon">{catData.icon}</span> {catData.title}
                      </div>
                      <span className={`section-badge ${completeDocs === totalDocs ? 'green' : completeDocs > 0 ? 'orange' : 'gray'}`}>
                        {completeDocs}/{totalDocs}
                      </span>
                    </div>
                    <div className="doc-list">
                      {catData.docs?.map((doc) => {
                        const expiryDays = getDaysUntilExpiry(doc.expiry_date);
                        const hasFile = !!doc.file_path;
                        return (
                          <div key={doc.id} className={`doc-row ${hasFile ? 'has-attachment' : ''}`} data-testid={`doc-${doc.id}`}>
                            <div 
                              className="doc-check-wrapper"
                              onClick={() => updateDocument(category, doc.id, doc.status === 'present' ? 'missing' : 'present', doc.issue_date, doc.expiry_date)}
                              style={{ cursor: 'pointer' }}
                            >
                              {getDocStatusIcon(doc.status)}
                            </div>
                            <div className="doc-name">
                              {doc.name}
                              {doc.required && <span className="required">*</span>}
                              {hasFile && (
                                <span className="file-indicator" title={doc.file_name}>
                                  <Paperclip size={12} />
                                </span>
                              )}
                            </div>
                            <div className="doc-date">
                              {doc.issue_date || (doc.has_expiry ? <input type="date" className="date-input" placeholder="dată emitere" onChange={(e) => updateDocument(category, doc.id, 'present', e.target.value, doc.expiry_date)} /> : '—')}
                            </div>
                            <div className={`doc-date ${expiryDays && expiryDays <= 30 ? 'date-expired' : expiryDays && expiryDays <= 90 ? 'date-warning' : 'date-ok'}`}>
                              {doc.expiry_date ? (
                                <>
                                  {doc.expiry_date} 
                                  {expiryDays <= 0 ? ' ✗' : expiryDays <= 90 ? ' ⚠' : ' ✓'}
                                </>
                              ) : (doc.has_expiry ? <input type="date" className="date-input" placeholder="dată expirare" onChange={(e) => updateDocument(category, doc.id, 'present', doc.issue_date, e.target.value)} /> : 'fără expirare')}
                            </div>
                            <div className="doc-actions">
                              {hasFile ? (
                                <>
                                  <button className="icon-btn small success" onClick={() => downloadFile(doc.file_path)} title="Descarcă fișier">
                                    <Download size={14} />
                                  </button>
                                  <button className="icon-btn small danger" onClick={() => deleteFile(category, doc.id)} title="Șterge fișier">
                                    <Trash2 size={14} />
                                  </button>
                                </>
                              ) : (
                                <FileUploadButton category={category} docId={doc.id} hasFile={hasFile} />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Tab Content: Company Documents */}
      {activeTab === 'company' && (
        <div className="tab-content" data-testid="company-tab">
          {caseData.documents?.company && (
            <div className="doc-section full-width">
              <div className="doc-section-header">
                <div className="doc-section-title">
                  <span className="section-icon">{caseData.documents.company.icon}</span> 
                  {caseData.documents.company.title} — {companyDetails.name || caseData.company_name}
                  {companyDetails.cui && <span className="cui-badge">CUI: {companyDetails.cui}</span>}
                </div>
              </div>
              <div className="doc-list two-columns">
                {caseData.documents.company.docs?.map((doc) => {
                  const expiryDays = getDaysUntilExpiry(doc.expiry_date);
                  const hasFile = !!doc.file_path;
                  return (
                    <div key={doc.id} className={`doc-row ${hasFile ? 'has-attachment' : ''}`} data-testid={`doc-${doc.id}`}>
                      <div 
                        className="doc-check-wrapper"
                        onClick={() => updateDocument('company', doc.id, doc.status === 'present' ? 'missing' : 'present', doc.issue_date, doc.expiry_date)}
                        style={{ cursor: 'pointer' }}
                      >
                        {getDocStatusIcon(doc.status)}
                      </div>
                      <div className="doc-name">
                        {doc.name}
                        {doc.required && <span className="required">*</span>}
                        {hasFile && (
                          <span className="file-indicator" title={doc.file_name}>
                            <Paperclip size={12} />
                          </span>
                        )}
                      </div>
                      <div className="doc-date">{doc.issue_date || '—'}</div>
                      <div className={`doc-date ${expiryDays && expiryDays <= 0 ? 'date-expired' : expiryDays && expiryDays <= 30 ? 'date-warning' : ''}`}>
                        {doc.expiry_date || (doc.has_expiry ? 'necesită dată' : '—')}
                      </div>
                      <div className="doc-actions">
                        {hasFile ? (
                          <>
                            <button className="icon-btn small success" onClick={() => downloadFile(doc.file_path)} title="Descarcă fișier">
                              <Download size={14} />
                            </button>
                            <button className="icon-btn small danger" onClick={() => deleteFile('company', doc.id)} title="Șterge fișier">
                              <Trash2 size={14} />
                            </button>
                          </>
                        ) : (
                          <FileUploadButton category="company" docId={doc.id} hasFile={hasFile} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Personal Info */}
      {activeTab === 'personal' && (
        <div className="tab-content" data-testid="personal-tab">
          <div className="personal-info-section">
            <div className="section-header">
              <h3>👤 Date Personale Candidat</h3>
            </div>
            <div className="info-grid">
              <div className="info-item">
                <label>Nume</label>
                <input type="text" value={candidateDetails.first_name || caseData.candidate_name?.split(' ')[0] || ''} readOnly />
              </div>
              <div className="info-item">
                <label>Prenume</label>
                <input type="text" value={candidateDetails.last_name || caseData.candidate_name?.split(' ').slice(1).join(' ') || ''} readOnly />
              </div>
              <div className="info-item">
                <label>Naționalitate</label>
                <input type="text" value={candidateDetails.nationality || 'Nepal'} readOnly />
              </div>
              <div className="info-item">
                <label>Ocupație / Meserie</label>
                <input type="text" value={candidateDetails.job_type || '-'} readOnly />
              </div>
              <div className="info-item">
                <label>Nr. Pașaport</label>
                <input type="text" value={candidateDetails.passport_number || '-'} readOnly />
              </div>
              <div className="info-item">
                <label>Pașaport Expiră</label>
                <input type="text" value={candidateDetails.passport_expiry || caseData.passport_expiry || '-'} readOnly className={passportDays && passportDays <= 90 ? 'warning' : ''} />
              </div>
              <div className="info-item">
                <label>Telefon</label>
                <input type="text" value={candidateDetails.phone || '-'} readOnly />
              </div>
              <div className="info-item">
                <label>Email</label>
                <input type="text" value={candidateDetails.email || '-'} readOnly />
              </div>
              <div className="info-item full-width">
                <label>Companie Angajatoare</label>
                <input type="text" value={`${companyDetails.name || caseData.company_name} ${companyDetails.cui ? `— CUI ${companyDetails.cui}` : ''}`} readOnly />
              </div>
              <div className="info-item full-width">
                <label>Note dosar</label>
                <textarea rows={3} value={caseData.notes || ''} readOnly placeholder="Observații, note speciale..." />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content: History */}
      {activeTab === 'history' && (
        <div className="tab-content" data-testid="history-tab">
          <div className="history-section">
            <div className="section-header">
              <h3>📜 Istoric Acțiuni Dosar</h3>
            </div>
            <div className="history-list">
              {(caseData.history || []).map((item, idx) => (
                <div key={idx} className="history-item">
                  <span className="history-icon">{item.icon || '⚪'}</span>
                  <span className="history-date">{item.date}</span>
                  <span className="history-action">{item.action}</span>
                  <span className="history-user">{item.user}</span>
                </div>
              ))}
              {(!caseData.history || caseData.history.length === 0) && (
                <div className="empty-state">
                  <p>Nu există istoric pentru acest dosar.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ====== EMAIL MODAL ====== */}
      {emailModal.open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }}>
          <div style={{ background: "#fff", borderRadius: "14px", padding: "28px", width: "100%", maxWidth: "560px", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: "700", display: "flex", alignItems: "center", gap: "8px" }}>
                <Mail size={20} color="#3b82f6" /> Trimite Email
              </h2>
              <button onClick={() => setEmailModal({ open: false, caseData: null })} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} /></button>
            </div>
            <div style={{ display: "grid", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Destinatar (To) *</label>
                <input type="email" value={emailForm.to} onChange={e => setEmailForm(f => ({ ...f, to: e.target.value }))} placeholder="email@exemplu.com" style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>CC</label>
                <input type="email" value={emailForm.cc} onChange={e => setEmailForm(f => ({ ...f, cc: e.target.value }))} placeholder="cc@exemplu.com (opțional)" style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Subiect *</label>
                <input type="text" value={emailForm.subject} onChange={e => setEmailForm(f => ({ ...f, subject: e.target.value }))} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "600", marginBottom: "4px" }}>Mesaj</label>
                <textarea value={emailForm.body} onChange={e => setEmailForm(f => ({ ...f, body: e.target.value }))} rows={8} style={{ width: "100%", padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: "8px", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", fontSize: "0.875rem" }} />
              </div>
              <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: "8px", padding: "10px 14px", fontSize: "0.8rem", color: "#92400e" }}>
                ⚠️ Necesită configurare SMTP în backend (.env): SMTP_USER, SMTP_PASS, SMTP_HOST
              </div>
            </div>
            <div style={{ display: "flex", gap: "12px", marginTop: "20px", justifyContent: "flex-end" }}>
              <button onClick={() => setEmailModal({ open: false, caseData: null })} style={{ padding: "8px 20px", border: "1px solid #e5e7eb", borderRadius: "8px", background: "#fff", cursor: "pointer" }}>Anulează</button>
              <button onClick={handleSendEmail} disabled={emailSending} style={{ padding: "8px 20px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600", opacity: emailSending ? 0.7 : 1 }}>
                {emailSending ? "Se trimite..." : "Trimite Email"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImmigrationPage;
