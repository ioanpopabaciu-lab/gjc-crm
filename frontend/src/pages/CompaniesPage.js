import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Search, Plus, Building2, Phone, Edit, Trash2, RefreshCw, X, CheckCircle, XCircle, Download, Users, FileText, Award, MapPin } from 'lucide-react';
import { API } from '../config';
import LoadingSpinner from '../components/LoadingSpinner';

const CompaniesPage = ({ showNotification }) => {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [cuiLookup, setCuiLookup] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [cuiValidation, setCuiValidation] = useState({ status: null, loading: false, message: "" }); // null, 'valid', 'invalid'

  const fetchCompanies = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(false);
      const params = new URLSearchParams();
      if (search) params.set("search", search);

      // Pasul 1: Încarcă companiile instant (fără statistici)
      const response = await axios.get(`${API}/companies?${params.toString()}`, { timeout: 15000 });
      setCompanies(response.data);
      setLoading(false);

      // Pasul 2: Încarcă statisticile în fundal
      setStatsLoading(true);
      try {
        params.set("with_stats", "true");
        const statsResp = await axios.get(`${API}/companies?${params.toString()}`, { timeout: 30000 });
        setCompanies(statsResp.data);
      } catch (statsError) {
        // Statisticile nu s-au putut încărca, afișăm companiile fără ele
      } finally {
        setStatsLoading(false);
      }
    } catch (error) {
      setLoadError(true);
      showNotification("Eroare la încărcarea companiilor. Încearcă din nou.", "error");
      setLoading(false);
    }
  }, [search, showNotification]);

  useEffect(() => {
    const timer = setTimeout(fetchCompanies, 300);
    return () => clearTimeout(timer);
  }, [fetchCompanies]);

  const lookupCUI = async () => {
    if (!cuiLookup) return;
    setLookupLoading(true);
    try {
      const response = await axios.get(`${API}/anaf/${cuiLookup}`);
      if (response.data.success) {
        setEditingCompany(prev => ({
          ...prev,
          name: response.data.data.name,
          cui: response.data.data.cui,
          city: response.data.data.city
        }));
        showNotification("Date ANAF preluate cu succes!");
      } else {
        showNotification("CUI negăsit în baza ANAF", "error");
      }
    } catch (error) {
      showNotification("Eroare la interogarea ANAF", "error");
    } finally {
      setLookupLoading(false);
    }
  };

  // Validare automată CUI cu debounce
  const validateCUI = useCallback(async (cui) => {
    if (!cui) {
      setCuiValidation({ status: null, loading: false, message: "" });
      return;
    }
    
    // Curăță CUI-ul
    const cleanCui = cui.replace(/RO/gi, "").replace(/\s/g, "").trim();
    
    // Verifică dacă e format valid (doar cifre, min 2)
    if (!cleanCui || cleanCui.length < 2 || !/^\d+$/.test(cleanCui)) {
      setCuiValidation({ status: null, loading: false, message: "" });
      return;
    }
    
    setCuiValidation({ status: null, loading: true, message: "Se verifică..." });
    
    try {
      const response = await axios.get(`${API}/anaf/${cleanCui}`);
      if (response.data.success) {
        setCuiValidation({ 
          status: 'valid', 
          loading: false, 
          message: `✓ ${response.data.data.name}`,
          data: response.data.data
        });
      } else {
        setCuiValidation({ 
          status: 'invalid', 
          loading: false, 
          message: response.data.error || "CUI negăsit în ANAF"
        });
      }
    } catch (error) {
      setCuiValidation({ status: 'invalid', loading: false, message: "Eroare verificare" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce pentru validare CUI (800ms după ce utilizatorul termină de scris)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (editingCompany?.cui && showModal) {
        validateCUI(editingCompany.cui);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [editingCompany?.cui, showModal, validateCUI]);

  // Resetare validare când se deschide/închide modalul
  useEffect(() => {
    if (!showModal) {
      setCuiValidation({ status: null, loading: false, message: "" });
    }
  }, [showModal]);

  const handleSave = async () => {
    try {
      if (editingCompany?.id) {
        await axios.put(`${API}/companies/${editingCompany.id}`, editingCompany);
        showNotification("Companie actualizată!");
      } else {
        await axios.post(`${API}/companies`, editingCompany);
        showNotification("Companie adăugată!");
      }
      setShowModal(false);
      setEditingCompany(null);
      fetchCompanies();
    } catch (error) {
      showNotification("Eroare la salvare", "error");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Sigur doriți să ștergeți această companie?")) return;
    try {
      await axios.delete(`${API}/companies/${id}`);
      showNotification("Companie ștearsă!");
      fetchCompanies();
    } catch (error) {
      showNotification("Eroare la ștergere", "error");
    }
  };

  const exportCSV = () => {
    const headers = ["Companie", "CUI", "Oraș", "Industrie", "Contact", "Telefon", "Email", "Status", "Candidați", "Dosare Active"];
    const rows = companies.map(c => [
      c.name || "", c.cui || "", c.city || "", c.industry || "",
      c.contact_person || "", c.phone || "", c.email || "", c.status || "",
      c.candidates_count || 0, c.active_cases || 0
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `companii_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="module-container" data-testid="companies-module">
      <div className="module-toolbar">
        <div className="toolbar-left">
          <div className="search-box">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Caută companie, CUI, oraș..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="company-search"
            />
            {search && <button className="clear-search" onClick={() => setSearch("")}><X size={14}/></button>}
          </div>
        </div>
        <div className="toolbar-right">
          <span className="records-count">
            {companies.length} companii
            {statsLoading && <span style={{marginLeft:8, fontSize:'11px', color:'#6366f1', fontWeight:400}}>⟳ statistici...</span>}
          </span>
          {loadError && (
            <button className="btn btn-secondary" onClick={fetchCompanies}>
              <RefreshCw size={14}/> Reîncarcă
            </button>
          )}
          <button className="btn btn-secondary" onClick={exportCSV}>
            <Download size={16} /> Export CSV
          </button>
          <button
            className="btn btn-primary"
            onClick={() => { setEditingCompany({}); setShowModal(true); }}
            data-testid="add-company-btn"
          >
            <Plus size={16} /> Adaugă Companie
          </button>
        </div>
      </div>

      {loading ? <LoadingSpinner /> : loadError ? (
        <div style={{textAlign:'center', padding:'60px', color:'#ef4444'}}>
          <div style={{fontSize:'48px', marginBottom:'12px'}}>⚠️</div>
          <div style={{fontSize:'16px', fontWeight:600, marginBottom:'8px'}}>Nu s-au putut încărca companiile</div>
          <div style={{fontSize:'13px', color:'#9ca3af', marginBottom:'20px'}}>Verifică conexiunea la internet și încearcă din nou</div>
          <button className="btn btn-primary" onClick={fetchCompanies}><RefreshCw size={14}/> Reîncarcă</button>
        </div>
      ) : (
        <div className="data-table-container">
          <table className="data-table" data-testid="companies-table">
            <thead>
              <tr>
                <th>Companie</th>
                <th>CUI</th>
                <th>Județ</th>
                <th>Nr. Reg. Com.</th>
                <th>Contact</th>
                <th title="Total candidați angajați la această companie">Candidați</th>
                <th title="Candidați cu status Plasat">Plasați</th>
                <th title="Avize de muncă emise">Avize</th>
                <th title="Dosare imigrare active">Dosare Active</th>
                <th>Status</th>
                <th>Acțiuni</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => (
                <tr key={company.id}>
                  <td className="company-name-cell">
                    <Building2 size={16} />
                    <div>
                      <div>{company.name}</div>
                      {company.industry && <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{company.industry}</small>}
                    </div>
                  </td>
                  <td>{company.cui || "-"}</td>
                  <td>
                    {company.county ? (
                      <span className="county-badge"><MapPin size={11}/> {company.county}</span>
                    ) : (company.city || "-")}
                  </td>
                  <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {company.reg_commerce || company.city || "-"}
                  </td>
                  <td>
                    <div className="contact-info">
                      <span>{company.contact_person || "-"}</span>
                      {company.phone && <small><Phone size={12} /> {company.phone}</small>}
                    </div>
                  </td>
                  <td>
                    {company.candidates_count > 0 ? (
                      <span className="stat-badge blue"><Users size={12}/> {company.candidates_count}</span>
                    ) : <span style={{ color: 'var(--text-muted)' }}>0</span>}
                  </td>
                  <td>
                    {company.placed_count > 0 ? (
                      <span className="placed-badge">✓ {company.placed_count}</span>
                    ) : <span style={{ color: 'var(--text-muted)' }}>0</span>}
                  </td>
                  <td>
                    {company.avize_count > 0 ? (
                      <span className="aviz-count-badge"><Award size={11}/> {company.avize_count}</span>
                    ) : <span style={{ color: 'var(--text-muted)' }}>0</span>}
                  </td>
                  <td>
                    {company.active_cases > 0 ? (
                      <span className="stat-badge green"><FileText size={12}/> {company.active_cases}</span>
                    ) : company.approved_cases > 0 ? (
                      <span className="stat-badge gray">{company.approved_cases} ap.</span>
                    ) : <span style={{ color: 'var(--text-muted)' }}>0</span>}
                  </td>
                  <td>
                    <span className={`status-badge ${company.status}`}>{company.status}</span>
                  </td>
                  <td className="actions-cell">
                    <button className="icon-btn" onClick={() => { setEditingCompany(company); setShowModal(true); }} data-testid={`edit-company-${company.id}`}>
                      <Edit size={16} />
                    </button>
                    <button className="icon-btn danger" onClick={() => handleDelete(company.id)} data-testid={`delete-company-${company.id}`}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {companies.length === 0 && (
            <div className="empty-state">
              <Building2 size={48} />
              <p>Nu există companii. Adăugați prima companie!</p>
            </div>
          )}
        </div>
      )}

      {/* Company Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} data-testid="company-modal">
            <div className="modal-header">
              <h2>{editingCompany?.id ? "Editare Companie" : "Companie Nouă"}</h2>
              <button className="close-btn" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="cui-lookup">
                <input
                  type="text"
                  placeholder="Introdu CUI pentru lookup ANAF"
                  value={cuiLookup}
                  onChange={(e) => setCuiLookup(e.target.value)}
                  data-testid="cui-lookup-input"
                />
                <button className="btn btn-secondary" onClick={lookupCUI} disabled={lookupLoading} data-testid="cui-lookup-btn">
                  {lookupLoading ? <RefreshCw size={16} className="spin" /> : <Search size={16} />}
                  Caută ANAF
                </button>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label>Nume Companie *</label>
                  <input
                    type="text"
                    value={editingCompany?.name || ""}
                    onChange={(e) => setEditingCompany({ ...editingCompany, name: e.target.value })}
                    data-testid="company-name-input"
                  />
                </div>
                <div className="form-group">
                  <label>CUI</label>
                  <div className="cui-input-wrapper">
                    <input
                      type="text"
                      value={editingCompany?.cui || ""}
                      onChange={(e) => setEditingCompany({ ...editingCompany, cui: e.target.value })}
                      className={cuiValidation.status === 'valid' ? 'cui-valid' : cuiValidation.status === 'invalid' ? 'cui-invalid' : ''}
                      data-testid="company-cui-input"
                    />
                    {cuiValidation.loading && (
                      <span className="cui-validation-indicator loading">
                        <RefreshCw size={14} className="spin" />
                      </span>
                    )}
                    {cuiValidation.status === 'valid' && (
                      <span className="cui-validation-indicator valid" title={cuiValidation.message}>
                        <CheckCircle size={14} />
                      </span>
                    )}
                    {cuiValidation.status === 'invalid' && (
                      <span className="cui-validation-indicator invalid" title={cuiValidation.message}>
                        <XCircle size={14} />
                      </span>
                    )}
                  </div>
                  {cuiValidation.message && (
                    <small className={`cui-validation-message ${cuiValidation.status}`}>
                      {cuiValidation.message}
                    </small>
                  )}
                </div>
                <div className="form-group">
                  <label>Oraș</label>
                  <input
                    type="text"
                    value={editingCompany?.city || ""}
                    onChange={(e) => setEditingCompany({ ...editingCompany, city: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Industrie</label>
                  <select
                    value={editingCompany?.industry || ""}
                    onChange={(e) => setEditingCompany({ ...editingCompany, industry: e.target.value })}
                  >
                    <option value="">Selectează...</option>
                    <option value="Construcții">Construcții</option>
                    <option value="HoReCa">HoReCa</option>
                    <option value="Agricultură">Agricultură</option>
                    <option value="Transport">Transport</option>
                    <option value="Industrie">Industrie</option>
                    <option value="IT">IT</option>
                    <option value="Altele">Altele</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Persoană Contact</label>
                  <input
                    type="text"
                    value={editingCompany?.contact_person || ""}
                    onChange={(e) => setEditingCompany({ ...editingCompany, contact_person: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Telefon</label>
                  <input
                    type="text"
                    value={editingCompany?.phone || ""}
                    onChange={(e) => setEditingCompany({ ...editingCompany, phone: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={editingCompany?.email || ""}
                    onChange={(e) => setEditingCompany({ ...editingCompany, email: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={editingCompany?.status || "activ"}
                    onChange={(e) => setEditingCompany({ ...editingCompany, status: e.target.value })}
                  >
                    <option value="activ">Activ</option>
                    <option value="inactiv">Inactiv</option>
                    <option value="prospect">Prospect</option>
                  </select>
                </div>
              </div>
              <div className="form-group full-width">
                <label>Note</label>
                <textarea
                  value={editingCompany?.notes || ""}
                  onChange={(e) => setEditingCompany({ ...editingCompany, notes: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Anulează</button>
              <button className="btn btn-primary" onClick={handleSave} data-testid="save-company-btn">Salvează</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompaniesPage;
