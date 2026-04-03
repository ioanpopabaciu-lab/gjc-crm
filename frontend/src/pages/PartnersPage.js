import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Search, Plus, Edit, Trash2, X, Globe, Users, Download, Phone, Mail } from 'lucide-react';
import { API } from '../config';
import LoadingSpinner from '../components/LoadingSpinner';
import COUNTRIES from '../data/countries';

const SPECIALIZATIONS = [
  "Construcții", "HoReCa", "Agricultură", "Transport", "Industrie",
  "Servicii", "Curățenie", "Logistică", "IT", "Sănătate", "Altele"
];

const PartnersPage = ({ showNotification }) => {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const fetchPartners = useCallback(async () => {
    try {
      setLoading(true);
      const resp = await axios.get(`${API}/partners`);
      setPartners(resp.data || []);
    } catch {
      setPartners([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPartners(); }, [fetchPartners]);

  const handleSave = async () => {
    if (!editing?.name || !editing?.country) {
      showNotification("Completați numele și țara", "error");
      return;
    }
    try {
      if (editing?.id) {
        await axios.put(`${API}/partners/${editing.id}`, editing);
        showNotification("Partener actualizat!");
      } else {
        await axios.post(`${API}/partners`, editing);
        showNotification("Partener adăugat!");
      }
      setShowModal(false);
      setEditing(null);
      fetchPartners();
    } catch {
      showNotification("Eroare la salvare", "error");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Sigur doriți să ștergeți acest partener?")) return;
    try {
      await axios.delete(`${API}/partners/${id}`);
      showNotification("Partener șters!");
      fetchPartners();
    } catch {
      showNotification("Eroare la ștergere", "error");
    }
  };

  const filtered = partners.filter(p => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (p.name || "").toLowerCase().includes(s) ||
           (p.country || "").toLowerCase().includes(s) ||
           (p.contact_person || "").toLowerCase().includes(s) ||
           (p.specialization || "").toLowerCase().includes(s);
  });

  return (
    <div className="module-container">
      <div className="module-toolbar">
        <div className="toolbar-left">
          <div className="search-box">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Caută partener..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && <button className="clear-search" onClick={() => setSearch("")}><X size={14}/></button>}
          </div>
        </div>
        <div className="toolbar-right">
          <span className="records-count">{filtered.length} parteneri</span>
          <button
            className="btn btn-primary"
            onClick={() => { setEditing({}); setShowModal(true); }}
          >
            <Plus size={16} /> Adaugă Partener
          </button>
        </div>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>AGENȚIE</th>
                <th>ȚARA</th>
                <th>CONTACT</th>
                <th>TELEFON</th>
                <th>COMISION %</th>
                <th>SPECIALIZARE</th>
                <th>CANDIDAȚI TRIMIȘI</th>
                <th>PLASAȚI</th>
                <th>STATUS</th>
                <th style={{textAlign:'right'}}>ACȚIUNI</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id}>
                  <td>
                    <div className="company-name-cell">
                      <Globe size={16} style={{color: '#6366f1', flexShrink: 0}} />
                      <span style={{fontWeight: 600}}>{p.name}</span>
                    </div>
                  </td>
                  <td>{p.country || "–"}</td>
                  <td>{p.contact_person || "–"}</td>
                  <td>
                    {p.phone ? (
                      <a href={`tel:${p.phone}`} style={{color: '#2563eb', textDecoration:'none'}}>
                        {p.phone}
                      </a>
                    ) : "–"}
                  </td>
                  <td>{p.commission_pct != null ? `${p.commission_pct}%` : "–"}</td>
                  <td>{p.specialization || "–"}</td>
                  <td style={{textAlign:'center'}}>
                    <span className="badge" style={{background:'#dbeafe', color:'#1d4ed8'}}>
                      <Users size={12}/> {p.candidates_sent || 0}
                    </span>
                  </td>
                  <td style={{textAlign:'center'}}>
                    <span className="badge" style={{background:'#dcfce7', color:'#166534'}}>
                      {p.candidates_placed || 0}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge ${p.status === 'activ' ? 'active' : 'inactive'}`}>
                      {p.status || "activ"}
                    </span>
                  </td>
                  <td style={{textAlign:'right'}}>
                    <button className="icon-btn" title="Editare" onClick={() => { setEditing({...p}); setShowModal(true); }}>
                      <Edit size={16} />
                    </button>
                    <button className="icon-btn danger" title="Ștergere" onClick={() => handleDelete(p.id)}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="empty-state">
              <Globe size={48} />
              <p>Nu există parteneri. Adăugați prima agenție parteneră!</p>
            </div>
          )}
        </div>
      )}

      {/* Partner Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editing?.id ? "Editare Partener" : "Partener Nou"}</h2>
              <button className="close-btn" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Nume Agenție *</label>
                  <input
                    type="text"
                    value={editing?.name || ""}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="Ex: Kiran Manpower Nepal"
                  />
                </div>
                <div className="form-group">
                  <label>Țara *</label>
                  <input
                    list="partner-countries"
                    value={editing?.country || ""}
                    onChange={(e) => setEditing({ ...editing, country: e.target.value })}
                    placeholder="Selectează țara..."
                  />
                  <datalist id="partner-countries">
                    {COUNTRIES.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div className="form-group">
                  <label>Oraș</label>
                  <input
                    type="text"
                    value={editing?.city || ""}
                    onChange={(e) => setEditing({ ...editing, city: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Persoană de Contact</label>
                  <input
                    type="text"
                    value={editing?.contact_person || ""}
                    onChange={(e) => setEditing({ ...editing, contact_person: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Telefon</label>
                  <input
                    type="text"
                    value={editing?.phone || ""}
                    onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                    placeholder="+977..."
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={editing?.email || ""}
                    onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Comision %</label>
                  <input
                    type="number"
                    min="0" max="100" step="0.5"
                    value={editing?.commission_pct || ""}
                    onChange={(e) => setEditing({ ...editing, commission_pct: parseFloat(e.target.value) || null })}
                    placeholder="Ex: 10"
                  />
                </div>
                <div className="form-group">
                  <label>Specializare</label>
                  <select
                    value={editing?.specialization || ""}
                    onChange={(e) => setEditing({ ...editing, specialization: e.target.value })}
                  >
                    <option value="">Selectează...</option>
                    {SPECIALIZATIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={editing?.status || "activ"}
                    onChange={(e) => setEditing({ ...editing, status: e.target.value })}
                  >
                    <option value="activ">Activ</option>
                    <option value="inactiv">Inactiv</option>
                    <option value="suspendat">Suspendat</option>
                  </select>
                </div>
              </div>
              <div className="form-group full-width">
                <label>Note</label>
                <textarea
                  value={editing?.notes || ""}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Anulează</button>
              <button className="btn btn-primary" onClick={handleSave}>Salvează</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PartnersPage;
