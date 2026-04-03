import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';
import { Search, Plus, User, Edit, Trash2, X, Users, Download, Filter, MessageCircle } from 'lucide-react';
import { API } from '../config';
import LoadingSpinner from '../components/LoadingSpinner';
import COUNTRIES from '../data/countries';
import { COR_CODES } from '../data/corCodes';

const CandidatesPage = ({ showNotification }) => {
  const [searchParams] = useSearchParams();
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterNationality, setFilterNationality] = useState("");
  const [filterCompany, setFilterCompany] = useState(() => searchParams.get("company_id") || "");
  const [filterCompanyName, setFilterCompanyName] = useState(() => searchParams.get("company_name") || "");
  const [filterStatus, setFilterStatus] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [showFilters, setShowFilters] = useState(() => !!searchParams.get("company_id"));

  const fetchCandidates = useCallback(async () => {
    try {
      setLoading(true);
      let params = [];
      if (search) params.push(`search=${encodeURIComponent(search)}`);
      if (filterNationality) params.push(`nationality=${encodeURIComponent(filterNationality)}`);
      if (filterCompany) params.push(`company_id=${encodeURIComponent(filterCompany)}`);
      if (filterStatus) params.push(`status=${encodeURIComponent(filterStatus)}`);
      const queryString = params.length > 0 ? `?${params.join("&")}` : "";
      const response = await axios.get(`${API}/candidates${queryString}`, { timeout: 20000 });
      setCandidates(response.data);
    } catch (error) {
      showNotification("Eroare la încărcarea candidaților. Încearcă din nou.", "error");
    } finally {
      setLoading(false);
    }
  }, [search, filterNationality, filterCompany, filterStatus, showNotification]);

  const fetchCompanies = async () => {
    try {
      const response = await axios.get(`${API}/companies`);
      setCompanies(response.data);
    } catch (error) {
      console.error("Error fetching companies:", error);
    }
  };

  useEffect(() => {
    const timer = setTimeout(fetchCandidates, 300);
    return () => clearTimeout(timer);
  }, [fetchCandidates]);

  useEffect(() => {
    fetchCompanies();
  }, []);

  const hasActiveFilters = filterNationality || filterCompany || filterStatus;

  const clearFilters = () => {
    setSearch(""); setFilterNationality(""); setFilterCompany(""); setFilterStatus(""); setFilterCompanyName("");
  };

  const exportCSV = () => {
    const headers = ["Prenume", "Nume", "Naționalitate", "Nr. Pașaport", "Exp. Pașaport", "Data Nașterii", "Tip Job", "Companie", "Status", "Email", "Telefon"];
    const rows = candidates.map(c => [
      c.first_name || "", c.last_name || "", c.nationality || "",
      c.passport_number || "", c.passport_expiry || "", c.birth_date || "",
      c.job_type || "", c.company_name || "", c.status || "",
      c.email || "", c.phone || ""
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `candidati_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const handleSave = async () => {
    try {
      if (editingCandidate?.id) {
        await axios.put(`${API}/candidates/${editingCandidate.id}`, editingCandidate);
        showNotification("Candidat actualizat!");
      } else {
        await axios.post(`${API}/candidates`, editingCandidate);
        showNotification("Candidat adăugat!");
      }
      setShowModal(false);
      setEditingCandidate(null);
      fetchCandidates();
    } catch (error) {
      showNotification("Eroare la salvare", "error");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Sigur doriți să ștergeți acest candidat?")) return;
    try {
      await axios.delete(`${API}/candidates/${id}`);
      showNotification("Candidat șters!");
      fetchCandidates();
    } catch (error) {
      showNotification("Eroare la ștergere", "error");
    }
  };

  const getDaysUntilExpiry = (date) => {
    if (!date) return null;
    const today = new Date();
    const expiry = new Date(date);
    const diff = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const getExpiryClass = (days) => {
    if (days === null) return "";
    if (days <= 30) return "urgent";
    if (days <= 60) return "warning";
    if (days <= 90) return "info";
    return "";
  };

  return (
    <div className="module-container" data-testid="candidates-module">
      <div className="module-toolbar">
        <div className="toolbar-left">
          <div className="search-box">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Caută după nume, pașaport, companie..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="candidate-search"
            />
            {search && <button className="clear-search" onClick={() => setSearch("")}><X size={14}/></button>}
          </div>
          <button
            className={`btn btn-secondary filter-toggle ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(f => !f)}
          >
            <Filter size={16} /> Filtre
            {hasActiveFilters && <span className="filter-badge">●</span>}
          </button>
          {hasActiveFilters && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}><X size={14}/> Resetează</button>
          )}
        </div>
        <div className="toolbar-right">
          {filterCompanyName && (
            <span className="filter-active-label">
              🏢 {filterCompanyName}
              <button onClick={clearFilters} style={{background:'none', border:'none', cursor:'pointer', padding:'0 2px', color:'#2563eb'}}>✕</button>
            </span>
          )}
          <span className="records-count">{candidates.length} candidați</span>
          <button className="btn btn-secondary" onClick={exportCSV}>
            <Download size={16} /> Export CSV
          </button>
          <button
            className="btn btn-primary"
            onClick={() => { setEditingCandidate({}); setShowModal(true); }}
            data-testid="add-candidate-btn"
          >
            <Plus size={16} /> Adaugă Candidat
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="filter-bar">
          <div className="filter-group">
            <label>Naționalitate</label>
            <input
              list="countries-filter-list"
              value={filterNationality}
              onChange={e => setFilterNationality(e.target.value)}
              placeholder="Orice țară..."
              style={{padding:'6px 10px', border:'1px solid var(--border-color)', borderRadius:'6px', width:'180px'}}
            />
            <datalist id="countries-filter-list">
              <option value="">Toate</option>
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </datalist>
          </div>
          <div className="filter-group">
            <label>Companie</label>
            <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}>
              <option value="">Toate companiile</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>Status</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">Toate statusurile</option>
              <option value="activ">Activ</option>
              <option value="în procesare">În procesare</option>
              <option value="plasat">Plasat</option>
              <option value="inactiv">Inactiv</option>
            </select>
          </div>
        </div>
      )}

      {loading ? <LoadingSpinner /> : (
        <div className="data-table-container">
          <table className="data-table" data-testid="candidates-table">
            <thead>
              <tr>
                <th>Nume</th>
                <th>Naționalitate</th>
                <th>Pașaport</th>
                <th>Data Nașterii</th>
                <th>Exp. Pașaport</th>
                <th>Exp. Permis</th>
                <th>Job</th>
                <th>Companie</th>
                <th>Status</th>
                <th>Acțiuni</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((candidate) => {
                const passportDays = getDaysUntilExpiry(candidate.passport_expiry);
                const permitDays = getDaysUntilExpiry(candidate.permit_expiry);
                return (
                  <tr key={candidate.id}>
                    <td className="candidate-name-cell">
                      <User size={16} />
                      {candidate.first_name} {candidate.last_name}
                    </td>
                    <td>
                      <span className="nationality-badge">{candidate.nationality || "-"}</span>
                    </td>
                    <td>{candidate.passport_number || "-"}</td>
                    <td>
                      {candidate.birth_date || "-"}
                      {candidate.birth_country && (
                        <span className="birth-country-badge">({candidate.birth_country})</span>
                      )}
                    </td>
                    <td>
                      <span className={`expiry-badge ${getExpiryClass(passportDays)}`}>
                        {candidate.passport_expiry || "-"}
                        {passportDays !== null && passportDays <= 90 && (
                          <small> ({passportDays}z)</small>
                        )}
                      </span>
                    </td>
                    <td>
                      <span className={`expiry-badge ${getExpiryClass(permitDays)}`}>
                        {candidate.permit_expiry || "-"}
                        {permitDays !== null && permitDays <= 90 && (
                          <small> ({permitDays}z)</small>
                        )}
                      </span>
                    </td>
                    <td>{candidate.job_type || "-"}</td>
                    <td>{candidate.company_name || "-"}</td>
                    <td>
                      <span className={`status-badge ${candidate.status}`}>{candidate.status}</span>
                    </td>
                    <td className="actions-cell">
                      {candidate.phone && (
                        <a
                          href={`https://wa.me/${candidate.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Bună ziua! Vă contactăm în legătură cu candidatura dumneavoastră.`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="icon-btn"
                          title="WhatsApp"
                          style={{color:'#25D366', textDecoration:'none'}}
                        >
                          💬
                        </a>
                      )}
                      <button className="icon-btn" onClick={() => { setEditingCandidate(candidate); setShowModal(true); }}>
                        <Edit size={16} />
                      </button>
                      <button className="icon-btn danger" onClick={() => handleDelete(candidate.id)}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {candidates.length === 0 && (
            <div className="empty-state">
              <Users size={48} />
              <p>Nu există candidați{hasActiveFilters || search ? " pentru filtrele selectate" : ""}. {!hasActiveFilters && !search && "Adăugați primul candidat!"}</p>
            </div>
          )}
        </div>
      )}

      {/* Candidate Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal large" onClick={e => e.stopPropagation()} data-testid="candidate-modal">
            <div className="modal-header">
              <h2>{editingCandidate?.id ? "Editare Candidat" : "Candidat Nou"}</h2>
              <button className="close-btn" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Prenume *</label>
                  <input
                    type="text"
                    value={editingCandidate?.first_name || ""}
                    onChange={(e) => setEditingCandidate({ ...editingCandidate, first_name: e.target.value })}
                    data-testid="candidate-firstname-input"
                  />
                </div>
                <div className="form-group">
                  <label>Nume *</label>
                  <input
                    type="text"
                    value={editingCandidate?.last_name || ""}
                    onChange={(e) => setEditingCandidate({ ...editingCandidate, last_name: e.target.value })}
                    data-testid="candidate-lastname-input"
                  />
                </div>
                <div className="form-group">
                  <label>Naționalitate</label>
                  <input
                    list="countries-modal-list"
                    value={editingCandidate?.nationality || ""}
                    onChange={(e) => setEditingCandidate({ ...editingCandidate, nationality: e.target.value })}
                    placeholder="Caută țara..."
                    className="form-input"
                  />
                  <datalist id="countries-modal-list">
                    {COUNTRIES.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div className="form-group">
                  <label>Nr. Pașaport</label>
                  <input
                    type="text"
                    value={editingCandidate?.passport_number || ""}
                    onChange={(e) => setEditingCandidate({ ...editingCandidate, passport_number: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Expirare Pașaport</label>
                  <input
                    type="date"
                    value={editingCandidate?.passport_expiry || ""}
                    onChange={(e) => setEditingCandidate({ ...editingCandidate, passport_expiry: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Expirare Permis Muncă</label>
                  <input
                    type="date"
                    value={editingCandidate?.permit_expiry || ""}
                    onChange={(e) => setEditingCandidate({ ...editingCandidate, permit_expiry: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Telefon</label>
                  <input
                    type="text"
                    value={editingCandidate?.phone || ""}
                    onChange={(e) => setEditingCandidate({ ...editingCandidate, phone: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={editingCandidate?.email || ""}
                    onChange={(e) => setEditingCandidate({ ...editingCandidate, email: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Meserie / COR</label>
                  <input
                    list="cor-codes-list"
                    value={editingCandidate?.job_type || ""}
                    onChange={(e) => {
                      const selected = COR_CODES.find(c => `${c.code} - ${c.name}` === e.target.value || c.name === e.target.value);
                      setEditingCandidate({ ...editingCandidate, job_type: selected ? selected.name : e.target.value, cor_code: selected?.code || editingCandidate?.cor_code });
                    }}
                    placeholder="Caută meserie sau cod COR..."
                    className="form-input"
                  />
                  <datalist id="cor-codes-list">
                    {COR_CODES.map(c => <option key={c.code} value={`${c.name}`}>{c.code} — {c.name} ({c.group})</option>)}
                  </datalist>
                  {editingCandidate?.cor_code && (
                    <small style={{color:'#6366f1', fontSize:'0.75rem'}}>COR: {editingCandidate.cor_code}</small>
                  )}
                </div>
                <div className="form-group">
                  <label>Companie</label>
                  <select
                    value={editingCandidate?.company_id || ""}
                    onChange={(e) => {
                      const comp = companies.find(c => c.id === e.target.value);
                      setEditingCandidate({
                        ...editingCandidate,
                        company_id: e.target.value,
                        company_name: comp?.name || ""
                      });
                    }}
                  >
                    <option value="">Selectează...</option>
                    {companies.map(comp => (
                      <option key={comp.id} value={comp.id}>{comp.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={editingCandidate?.status || "activ"}
                    onChange={(e) => setEditingCandidate({ ...editingCandidate, status: e.target.value })}
                  >
                    <option value="activ">Activ</option>
                    <option value="în procesare">În procesare</option>
                    <option value="plasat">Plasat</option>
                    <option value="inactiv">Inactiv</option>
                  </select>
                </div>
              </div>
              <div className="form-group full-width">
                <label>Note</label>
                <textarea
                  value={editingCandidate?.notes || ""}
                  onChange={(e) => setEditingCandidate({ ...editingCandidate, notes: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Anulează</button>
              <button className="btn btn-primary" onClick={handleSave} data-testid="save-candidate-btn">Salvează</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CandidatesPage;
