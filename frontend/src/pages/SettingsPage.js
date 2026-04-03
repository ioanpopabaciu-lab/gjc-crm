import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Plus, Trash2, Edit, Phone, Save, X, MessageCircle, Users } from 'lucide-react';
import { API } from '../config';
import LoadingSpinner from '../components/LoadingSpinner';

const SettingsPage = ({ showNotification }) => {
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingOp, setEditingOp] = useState(null);

  const fetchOperators = useCallback(async () => {
    try {
      setLoading(true);
      const resp = await axios.get(`${API}/operators`);
      setOperators(resp.data || []);
    } catch {
      // No operators yet
      setOperators([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOperators(); }, [fetchOperators]);

  const handleSave = async () => {
    if (!editingOp?.name || !editingOp?.phone) {
      showNotification("Completați numele și telefonul", "error");
      return;
    }
    try {
      if (editingOp.id) {
        await axios.put(`${API}/operators/${editingOp.id}`, editingOp);
        showNotification("Operator actualizat!");
      } else {
        await axios.post(`${API}/operators`, editingOp);
        showNotification("Operator adăugat!");
      }
      setShowModal(false);
      setEditingOp(null);
      fetchOperators();
    } catch {
      showNotification("Eroare la salvare", "error");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Ștergeți operatorul?")) return;
    try {
      await axios.delete(`${API}/operators/${id}`);
      showNotification("Operator șters!");
      fetchOperators();
    } catch {
      showNotification("Eroare la ștergere", "error");
    }
  };

  const openWhatsApp = (op, message = "") => {
    const phone = op.phone.replace(/[^0-9]/g, '');
    const text = message || `Bună ziua! Vă contactăm din sistemul GJC CRM.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="module-container">
      <div className="module-toolbar">
        <div className="toolbar-left">
          <h2 style={{margin:0, fontSize:'1.1rem', fontWeight:700}}>
            <Users size={20} style={{marginRight:8, verticalAlign:'middle'}} />
            Operatori & WhatsApp
          </h2>
        </div>
        <div className="toolbar-right">
          <button className="btn btn-primary" onClick={() => { setEditingOp({}); setShowModal(true); }}>
            <Plus size={16} /> Adaugă Operator
          </button>
        </div>
      </div>

      <div style={{padding:'16px 0', maxWidth:'700px'}}>
        <div style={{background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:'10px', padding:'14px 18px', marginBottom:'20px', fontSize:'0.88rem', color:'#166534'}}>
          <strong>💬 Cum funcționează WhatsApp:</strong> Adaugă numerele de telefon ale operatorilor tăi (cu prefix internațional, ex: +40722000000).
          Din pagina Candidați poți trimite mesaje direct pe WhatsApp.
        </div>

        {loading ? <LoadingSpinner /> : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Operator</th>
                  <th>Telefon WhatsApp</th>
                  <th>Rol</th>
                  <th>Status</th>
                  <th style={{textAlign:'center'}}>WhatsApp</th>
                  <th>Acțiuni</th>
                </tr>
              </thead>
              <tbody>
                {operators.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{textAlign:'center', padding:'40px', color:'var(--text-muted)'}}>
                      Nu există operatori. Adaugă primul operator!
                    </td>
                  </tr>
                ) : operators.map(op => (
                  <tr key={op.id}>
                    <td style={{fontWeight:600}}>{op.name}</td>
                    <td>
                      <span style={{fontFamily:'monospace', fontSize:'0.9rem'}}>
                        <Phone size={13} style={{marginRight:4, color:'#6b7280'}} />
                        {op.phone}
                      </span>
                    </td>
                    <td style={{color:'var(--text-muted)'}}>{op.role || "-"}</td>
                    <td>
                      <span className={`status-badge ${op.active ? 'activ' : 'inactiv'}`}>
                        {op.active ? 'Activ' : 'Inactiv'}
                      </span>
                    </td>
                    <td style={{textAlign:'center'}}>
                      <button
                        className="btn btn-secondary"
                        style={{background:'#25D366', color:'white', border:'none', fontSize:'0.8rem', padding:'5px 12px'}}
                        onClick={() => openWhatsApp(op)}
                      >
                        <MessageCircle size={14} /> Deschide
                      </button>
                    </td>
                    <td className="actions-cell">
                      <button className="icon-btn" onClick={() => { setEditingOp(op); setShowModal(true); }}>
                        <Edit size={14} />
                      </button>
                      <button className="icon-btn danger" onClick={() => handleDelete(op.id)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* WhatsApp Templates */}
        <div style={{marginTop:'24px', background:'var(--bg-card)', border:'1px solid var(--border-color)', borderRadius:'10px', padding:'18px'}}>
          <h3 style={{margin:'0 0 12px', fontSize:'0.95rem', fontWeight:700}}>📋 Mesaje Rapide WhatsApp</h3>
          <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
            {[
              { label: "Confirmare interviu", text: "Bună ziua! Vă confirmăm interviul programat pentru recrutarea în România. Vă rugăm să ne contactați pentru detalii." },
              { label: "Documente necesare", text: "Bună ziua! Vă rugăm să pregătiți documentele necesare: pașaport valid, CV, diplome. Vă așteptăm cu noutăți." },
              { label: "Aviz aprobat", text: "Bună ziua! Avizul de muncă a fost aprobat. Vă felicităm și vă vom contacta pentru pașii următori." },
              { label: "Actualizare dosar", text: "Bună ziua! Dosarul dumneavoastră de imigrare a fost actualizat. Vă rugăm să verificați statusul." },
            ].map((tmpl, idx) => (
              <div key={idx} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:'var(--bg-secondary, #f8fafc)', borderRadius:'8px', border:'1px solid var(--border-light)'}}>
                <div>
                  <div style={{fontWeight:600, fontSize:'0.85rem'}}>{tmpl.label}</div>
                  <div style={{fontSize:'0.78rem', color:'var(--text-muted)', marginTop:'2px'}}>{tmpl.text.substring(0, 80)}...</div>
                </div>
                <div style={{display:'flex', gap:'6px'}}>
                  {operators.map(op => (
                    <button key={op.id} className="btn btn-secondary" style={{fontSize:'0.72rem', padding:'4px 8px', whiteSpace:'nowrap'}}
                      onClick={() => openWhatsApp(op, tmpl.text)}>
                      💬 {op.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:'480px'}}>
            <div className="modal-header">
              <h2>{editingOp?.id ? "Editare Operator" : "Operator Nou"}</h2>
              <button className="close-btn" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Nume Complet *</label>
                  <input type="text" value={editingOp?.name || ""} onChange={e => setEditingOp({...editingOp, name: e.target.value})} placeholder="Ex: Mihai Popescu" />
                </div>
                <div className="form-group">
                  <label>Telefon WhatsApp * (cu prefix)</label>
                  <input type="text" value={editingOp?.phone || ""} onChange={e => setEditingOp({...editingOp, phone: e.target.value})} placeholder="+40722000000" />
                </div>
                <div className="form-group">
                  <label>Rol</label>
                  <select value={editingOp?.role || ""} onChange={e => setEditingOp({...editingOp, role: e.target.value})}>
                    <option value="">Selectează...</option>
                    <option value="Recrutor">Recrutor</option>
                    <option value="Manager">Manager</option>
                    <option value="Consultant imigrare">Consultant imigrare</option>
                    <option value="Asistent">Asistent</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select value={editingOp?.active !== false ? "true" : "false"} onChange={e => setEditingOp({...editingOp, active: e.target.value === "true"})}>
                    <option value="true">Activ</option>
                    <option value="false">Inactiv</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Anulează</button>
              <button className="btn btn-primary" onClick={handleSave}><Save size={14}/> Salvează</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
