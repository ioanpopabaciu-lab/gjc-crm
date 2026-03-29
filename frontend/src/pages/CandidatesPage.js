import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Search, Plus, User, Edit, Trash2, X, Users } from 'lucide-react';
import { API } from '../config';
import LoadingSpinner from '../components/LoadingSpinner';

const CandidatesPage = ({ showNotification }) => {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterNationality, setFilterNationality] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState(null);
  const [companies, setCompanies] = useState([]);

  const fetchCandidates = useCallback(async () => {
    try {
      setLoading(true);
      let params = [];
      if (search) params.push(`search=${encodeURIComponent(search)}`);
      if (filterNationality) params.push(`nationality=${encodeURIComponent(filterNationality)}`);
      const queryString = params.length > 0 ? `?${params.join("&")}` : "";
      const response = await axios.get(`${API}/candidates${queryString}`);
      setCandidates(response.data);
    } catch (error) {
      showNotification("Eroare la încărcarea candidaților", "error");
    } finally {
      setLoading(false);
    }
  }, [search, filterNationality, showNotification]);

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
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="Caută după nume, pașaport..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="candidate-search"
          />
        </div>
        <select
          className="filter-select"
          value={filterNationality}
          onChange={(e) => setFilterNationality(e.target.value)}
          data-testid="nationality-filter"
        >
          <option value="">Toate naționalitățile</option>
          <option value="Nepal">Nepal</option>
          <option value="India">India</option>
          <option value="Filipine">Filipine</option>
          <option value="Sri Lanka">Sri Lanka</option>
          <option value="Nigeria">Nigeria</option>
        </select>
        <button
          className="btn btn-primary"
          onClick={() => { setEditingCandidate({}); setShowModal(true); }}
          data-testid="add-candidate-btn"
        >
          <Plus size={16} /> Adaugă Candidat
        </button>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="data-table-container">
          <table className="data-table" data-testid="candidates-table">
            <thead>
              <tr>
                <th>Nume</th>
                <th>Naționalitate</th>
                <th>Pașaport</th>
                <th>Expirare Pașaport</th>
                <th>Expirare Permis</th>
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
                      <span className={`expiry-badge ${getExpiryClass(passportDays)}`}>
                        {candidate.passport_expiry || "-"}
                        {passportDays !== null && passportDays <= 90 && (
                          <small> ({passportDays} zile)</small>
                        )}
                      </span>
                    </td>
                    <td>
                      <span className={`expiry-badge ${getExpiryClass(permitDays)}`}>
                        {candidate.permit_expiry || "-"}
                        {permitDays !== null && permitDays <= 90 && (
                          <small> ({permitDays} zile)</small>
                        )}
                      </span>
                    </td>
                    <td>{candidate.job_type || "-"}</td>
                    <td>{candidate.company_name || "-"}</td>
                    <td>
                      <span className={`status-badge ${candidate.status}`}>{candidate.status}</span>
                    </td>
                    <td className="actions-cell">
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
              <p>Nu există candidați. Adăugați primul candidat!</p>
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
                  <select
                    value={editingCandidate?.nationality || ""}
                    onChange={(e) => setEditingCandidate({ ...editingCandidate, nationality: e.target.value })}
                  >
                    <option value="">Selectează...</option>
                    <option value="Nepal">Nepal</option>
                    <option value="India">India</option>
                    <option value="Filipine">Filipine</option>
                    <option value="Sri Lanka">Sri Lanka</option>
                    <option value="Nigeria">Nigeria</option>
                    <option value="Bangladesh">Bangladesh</option>
                    <option value="Pakistan">Pakistan</option>
                  </select>
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
                  <label>Tip Job</label>
                  <select
                    value={editingCandidate?.job_type || ""}
                    onChange={(e) => setEditingCandidate({ ...editingCandidate, job_type: e.target.value })}
                  >
                    <option value="">Selectează...</option>
                    <option value="Muncitor construcții">Muncitor construcții</option>
                    <option value="Bucătar">Bucătar</option>
                    <option value="Ospătar">Ospătar</option>
                    <option value="Șofer">Șofer</option>
                    <option value="Muncitor agricol">Muncitor agricol</option>
                    <option value="Sudor">Sudor</option>
                    <option value="Electrician">Electrician</option>
                    <option value="Instalator">Instalator</option>
                  </select>
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
