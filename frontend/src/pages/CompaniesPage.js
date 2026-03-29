import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Search, Plus, Building2, Phone, Edit, Trash2, RefreshCw, X, CheckCircle, XCircle } from 'lucide-react';
import { API } from '../config';
import LoadingSpinner from '../components/LoadingSpinner';

const CompaniesPage = ({ showNotification }) => {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [cuiLookup, setCuiLookup] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [cuiValidation, setCuiValidation] = useState({ status: null, loading: false, message: "" }); // null, 'valid', 'invalid'

  const fetchCompanies = useCallback(async () => {
    try {
      setLoading(true);
      const params = search ? `?search=${encodeURIComponent(search)}` : "";
      const response = await axios.get(`${API}/companies${params}`);
      setCompanies(response.data);
    } catch (error) {
      showNotification("Eroare la încărcarea companiilor", "error");
    } finally {
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
  }, [API]);

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

  return (
    <div className="module-container" data-testid="companies-module">
      <div className="module-toolbar">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="Caută companie, CUI, oraș..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="company-search"
          />
        </div>
        <button
          className="btn btn-primary"
          onClick={() => { setEditingCompany({}); setShowModal(true); }}
          data-testid="add-company-btn"
        >
          <Plus size={16} /> Adaugă Companie
        </button>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="data-table-container">
          <table className="data-table" data-testid="companies-table">
            <thead>
              <tr>
                <th>Companie</th>
                <th>CUI</th>
                <th>Oraș</th>
                <th>Industrie</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Acțiuni</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => (
                <tr key={company.id}>
                  <td className="company-name-cell">
                    <Building2 size={16} />
                    {company.name}
                  </td>
                  <td>{company.cui || "-"}</td>
                  <td>{company.city || "-"}</td>
                  <td>{company.industry || "-"}</td>
                  <td>
                    <div className="contact-info">
                      <span>{company.contact_person || "-"}</span>
                      {company.phone && <small><Phone size={12} /> {company.phone}</small>}
                    </div>
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
