import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Plus, Trash2, Edit, Phone, Save, X, MessageCircle, Users, Link, RefreshCw, CheckCircle, AlertCircle, Lock, ShieldCheck } from 'lucide-react';
import { API } from '../config';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../hooks/useAuth';
import { PERMISSION_GROUPS, PRESETS, ALL_PERMISSIONS } from '../config/permissions';

const SettingsPage = ({ showNotification }) => {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingOp, setEditingOp] = useState(null);

  // Conturi CRM
  const [crmUsers, setCrmUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null); // null = adăugare nouă, obj = editare
  const [userForm, setUserForm] = useState({ email: '', password: '', role: 'operator', permissions: [] });
  const [userSaving, setUserSaving] = useState(false);

  // SmartBill state
  const [sbForm, setSbForm] = useState({ cif: "", email: "", token: "", series: "" });
  const [sbConfigured, setSbConfigured] = useState(false);
  const [sbTesting, setSbTesting] = useState(false);
  const [sbSyncing, setSbSyncing] = useState(false);
  const [sbSyncResult, setSbSyncResult] = useState(null);

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

  const fetchCrmUsers = useCallback(async () => {
    if (!isAdmin) return;
    setUsersLoading(true);
    try {
      const resp = await axios.get(`${API}/auth/users`);
      setCrmUsers(resp.data || []);
    } catch {
      setCrmUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, [isAdmin]);

  const openAddUser = () => {
    setEditingUser(null);
    setUserForm({ email: '', password: '', role: 'operator', permissions: [] });
    setShowUserModal(true);
  };

  const openEditUser = (u) => {
    setEditingUser(u);
    setUserForm({ email: u.email, password: '', role: u.role, permissions: u.permissions || [] });
    setShowUserModal(true);
  };

  const togglePermission = (perm) => {
    setUserForm(f => ({
      ...f,
      permissions: f.permissions.includes(perm)
        ? f.permissions.filter(p => p !== perm)
        : [...f.permissions, perm]
    }));
  };

  const applyPreset = (presetKey) => {
    const preset = PRESETS[presetKey];
    if (!preset) return;
    setUserForm(f => ({ ...f, permissions: [...preset.permissions] }));
  };

  const handleSaveUser = async () => {
    if (!userForm.email) { showNotification("Introduceți email-ul", "error"); return; }
    if (!editingUser && !userForm.password) { showNotification("Introduceți parola pentru contul nou", "error"); return; }
    setUserSaving(true);
    try {
      if (editingUser) {
        // Actualizare cont existent
        const payload = {};
        if (userForm.email !== editingUser.email) payload.email = userForm.email;
        if (userForm.password) payload.new_password = userForm.password;
        if (userForm.role !== editingUser.role) payload.role = userForm.role;
        payload.permissions = userForm.permissions; // întotdeauna trimitem permisiunile
        await axios.put(`${API}/auth/users/${editingUser.id}`, payload);
        showNotification("Cont actualizat!");
      } else {
        // Cont nou
        await axios.post(`${API}/auth/users`, userForm);
        showNotification("Cont creat!");
      }
      setShowUserModal(false);
      fetchCrmUsers();
    } catch (e) {
      showNotification(e.response?.data?.detail || "Eroare la salvare", "error");
    } finally {
      setUserSaving(false);
    }
  };

  const handleDeleteUser = async (u) => {
    if (!window.confirm(`Ștergeți contul ${u.email}?`)) return;
    try {
      await axios.delete(`${API}/auth/users/${u.id}`);
      showNotification("Cont șters!");
      fetchCrmUsers();
    } catch (e) {
      showNotification(e.response?.data?.detail || "Eroare la ștergere", "error");
    }
  };

  const openChangeOwnPassword = () => {
    setEditingUser(currentUser);
    setUserForm({ email: currentUser.email, password: '', role: currentUser.role, permissions: currentUser.permissions || [] });
    setShowUserModal(true);
  };

  useEffect(() => {
    fetchOperators();
    fetchCrmUsers();
    // Incarca configuratia SmartBill existenta
    axios.get(`${API}/integrations/smartbill`).then(r => {
      if (r.data?.configured) {
        setSbConfigured(true);
        setSbForm(f => ({ ...f, cif: r.data.cif || "", email: r.data.email || "", series: r.data.series || "" }));
      }
    }).catch(() => {});
  }, [fetchOperators, fetchCrmUsers]);

  const handleSaveSmartBill = async () => {
    if (!sbForm.cif || !sbForm.email || !sbForm.token) {
      showNotification("Completați CIF, email și token API", "error");
      return;
    }
    try {
      await axios.post(`${API}/integrations/smartbill`, sbForm);
      setSbConfigured(true);
      setSbForm(f => ({ ...f, token: "" })); // sterge tokenul din UI dupa salvare
      showNotification("Configurație SmartBill salvată!");
    } catch {
      showNotification("Eroare la salvarea configurației", "error");
    }
  };

  const handleTestSmartBill = async () => {
    setSbTesting(true);
    try {
      const r = await axios.post(`${API}/integrations/smartbill/test`);
      showNotification(r.data.message || "Conexiune reușită!", "success");
    } catch (e) {
      showNotification(e.response?.data?.detail || "Eroare conexiune SmartBill", "error");
    } finally {
      setSbTesting(false);
    }
  };

  const handleSyncSmartBill = async () => {
    setSbSyncing(true);
    setSbSyncResult(null);
    try {
      const r = await axios.post(`${API}/integrations/smartbill/sync`);
      setSbSyncResult(r.data);
      showNotification(r.data.message || `Importat ${r.data.added} facturi!`);
    } catch (e) {
      showNotification(e.response?.data?.detail || "Eroare sincronizare SmartBill", "error");
    } finally {
      setSbSyncing(false);
    }
  };

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
                  <th>Email</th>
                  <th>Rol</th>
                  <th>Status</th>
                  <th style={{textAlign:'center'}}>WhatsApp</th>
                  <th>Acțiuni</th>
                </tr>
              </thead>
              <tbody>
                {operators.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{textAlign:'center', padding:'40px', color:'var(--text-muted)'}}>
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
                    <td style={{fontSize:'0.85rem', color:'#3b82f6'}}>{op.email || <span style={{color:'#d1d5db'}}>—</span>}</td>
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

        {/* ===== CONTURI CRM ===== */}
        <div style={{marginTop:'28px', background:'var(--bg-card)', border:'1px solid var(--border-color)', borderRadius:'10px', padding:'20px'}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'14px'}}>
            <h3 style={{margin:0, fontSize:'1rem', fontWeight:700, display:'flex', alignItems:'center', gap:'8px'}}>
              <ShieldCheck size={18} style={{color:'#6366f1'}} /> Conturi de acces CRM
            </h3>
            <div style={{display:'flex', gap:'8px'}}>
              <button onClick={openChangeOwnPassword}
                style={{display:'flex', alignItems:'center', gap:'6px', padding:'6px 14px', background:'#f3f4f6', color:'#374151', border:'1px solid #e5e7eb', borderRadius:'7px', cursor:'pointer', fontWeight:600, fontSize:'0.82rem'}}>
                <Lock size={13}/> Schimbă-mi parola
              </button>
              {isAdmin && (
                <button onClick={openAddUser}
                  style={{display:'flex', alignItems:'center', gap:'6px', padding:'6px 14px', background:'#6366f1', color:'white', border:'none', borderRadius:'7px', cursor:'pointer', fontWeight:600, fontSize:'0.82rem'}}>
                  <Plus size={13}/> Utilizator Nou
                </button>
              )}
            </div>
          </div>

          <div style={{background:'#eef2ff', border:'1px solid #c7d2fe', borderRadius:'8px', padding:'10px 14px', fontSize:'0.8rem', color:'#3730a3', marginBottom:'14px'}}>
            <strong>ℹ️ Roluri:</strong>&nbsp;
            <span style={{background:'#dbeafe', borderRadius:'5px', padding:'1px 7px', marginRight:6, fontWeight:700}}>admin</span> — acces complet, poate adăuga/șterge utilizatori &nbsp;|&nbsp;
            <span style={{background:'#dcfce7', borderRadius:'5px', padding:'1px 7px', marginRight:6, fontWeight:700}}>operator</span> — acces standard la CRM
          </div>

          {!isAdmin ? (
            <div style={{padding:'20px', textAlign:'center', color:'var(--text-muted)', fontSize:'0.85rem'}}>
              🔒 Doar administratorii pot vedea lista completă de utilizatori.<br/>
              Poți folosi butonul <strong>"Schimbă-mi parola"</strong> de mai sus pentru contul tău.
            </div>
          ) : usersLoading ? <LoadingSpinner /> : (
            <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.85rem'}}>
              <thead style={{background:'var(--bg-secondary)'}}>
                <tr>
                  <th style={{padding:'9px 14px', textAlign:'left', borderBottom:'1px solid var(--border-color)'}}>Email</th>
                  <th style={{padding:'9px 14px', textAlign:'left', borderBottom:'1px solid var(--border-color)'}}>Rol</th>
                  <th style={{padding:'9px 14px', textAlign:'left', borderBottom:'1px solid var(--border-color)'}}>Permisiuni</th>
                  <th style={{padding:'9px 14px', textAlign:'left', borderBottom:'1px solid var(--border-color)'}}>Creat la</th>
                  <th style={{padding:'9px 14px', textAlign:'center', borderBottom:'1px solid var(--border-color)'}}>Acțiuni</th>
                </tr>
              </thead>
              <tbody>
                {crmUsers.length === 0 ? (
                  <tr><td colSpan={5} style={{padding:'30px', textAlign:'center', color:'var(--text-muted)'}}>Nu există utilizatori</td></tr>
                ) : crmUsers.map((u, idx) => (
                  <tr key={u.id} style={{borderBottom:'1px solid var(--border-color)', background: idx%2===0?'transparent':'var(--bg-secondary)'}}>
                    <td style={{padding:'9px 14px', fontWeight:600}}>
                      {u.email}
                      {u.id === currentUser?.id && <span style={{marginLeft:8, background:'#fef9c3', color:'#92400e', fontSize:'0.7rem', padding:'1px 7px', borderRadius:'10px', fontWeight:700}}>tu</span>}
                    </td>
                    <td style={{padding:'9px 14px'}}>
                      <span style={{padding:'2px 9px', borderRadius:'10px', fontSize:'0.75rem', fontWeight:700,
                        background: u.role==='admin'?'#fee2e2':'#f3f4f6',
                        color: u.role==='admin'?'#dc2626':'#374151'}}>
                        {u.role==='admin' ? '🔑 admin' : '👤 operator'}
                      </span>
                    </td>
                    <td style={{padding:'9px 14px', fontSize:'0.78rem', color:'#6b7280', maxWidth:'220px'}}>
                      {u.role === 'admin' ? (
                        <span style={{color:'#dc2626', fontWeight:600}}>Acces total</span>
                      ) : (u.permissions || []).length === 0 ? (
                        <span style={{color:'#f59e0b'}}>⚠️ Nicio permisiune</span>
                      ) : (
                        <span title={(u.permissions||[]).join(', ')}>
                          {(u.permissions||[]).length} permisiuni — {(u.permissions||[]).slice(0,3).map(p => p.replace('_read','').replace('_write','✎')).join(', ')}{(u.permissions||[]).length > 3 ? '...' : ''}
                        </span>
                      )}
                    </td>
                    <td style={{padding:'9px 14px', color:'var(--text-muted)', fontSize:'0.8rem'}}>
                      {u.created_at ? new Date(u.created_at).toLocaleDateString('ro-RO') : '—'}
                    </td>
                    <td style={{padding:'9px 14px', textAlign:'center'}}>
                      <div style={{display:'flex', gap:'6px', justifyContent:'center'}}>
                        <button onClick={() => openEditUser(u)} title="Editează / Schimbă parola / Permisiuni"
                          style={{background:'none', border:'1px solid #e5e7eb', borderRadius:'6px', cursor:'pointer', color:'#6366f1', padding:'4px 8px', fontSize:'0.78rem', display:'flex', alignItems:'center', gap:'4px'}}>
                          <Edit size={12}/> Editează
                        </button>
                        {u.id !== currentUser?.id && (
                          <button onClick={() => handleDeleteUser(u)} title="Șterge cont"
                            style={{background:'none', border:'1px solid #fecaca', borderRadius:'6px', cursor:'pointer', color:'#ef4444', padding:'4px 8px', fontSize:'0.78rem', display:'flex', alignItems:'center', gap:'4px'}}>
                            <Trash2 size={12}/> Șterge
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* SmartBill Integration */}
        <div style={{marginTop:'28px', background:'var(--bg-card)', border:'1px solid var(--border-color)', borderRadius:'10px', padding:'20px'}}>
          <h3 style={{margin:'0 0 4px', fontSize:'1rem', fontWeight:700, display:'flex', alignItems:'center', gap:'8px'}}>
            <Link size={18} style={{color:'#f59e0b'}} /> Integrare SmartBill
            {sbConfigured && <span style={{background:'#dcfce7', color:'#166534', fontSize:'0.72rem', padding:'2px 8px', borderRadius:'12px', fontWeight:600}}><CheckCircle size={11} style={{marginRight:3}}/>Configurat</span>}
          </h3>
          <p style={{margin:'0 0 16px', fontSize:'0.82rem', color:'var(--text-muted)'}}>
            Conectează SmartBill pentru a importa automat facturile emise în pagina Plăți din CRM.
          </p>

          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'12px'}}>
            <div>
              <label style={{display:'block', fontSize:'0.82rem', fontWeight:600, marginBottom:'4px'}}>CIF Firmă *</label>
              <input type="text" value={sbForm.cif} onChange={e => setSbForm(f=>({...f,cif:e.target.value}))}
                placeholder="ex: RO12345678"
                style={{width:'100%', padding:'8px 10px', border:'1px solid var(--border-color)', borderRadius:'7px', fontSize:'0.875rem', boxSizing:'border-box'}} />
            </div>
            <div>
              <label style={{display:'block', fontSize:'0.82rem', fontWeight:600, marginBottom:'4px'}}>Email cont SmartBill *</label>
              <input type="email" value={sbForm.email} onChange={e => setSbForm(f=>({...f,email:e.target.value}))}
                placeholder="ex: office@firma.ro"
                style={{width:'100%', padding:'8px 10px', border:'1px solid var(--border-color)', borderRadius:'7px', fontSize:'0.875rem', boxSizing:'border-box'}} />
            </div>
            <div>
              <label style={{display:'block', fontSize:'0.82rem', fontWeight:600, marginBottom:'4px'}}>Token API SmartBill *</label>
              <input type="password" value={sbForm.token} onChange={e => setSbForm(f=>({...f,token:e.target.value}))}
                placeholder={sbConfigured ? "••••••• (introdu din nou pentru a schimba)" : "Token din SmartBill → Setări → API"}
                style={{width:'100%', padding:'8px 10px', border:'1px solid var(--border-color)', borderRadius:'7px', fontSize:'0.875rem', boxSizing:'border-box'}} />
            </div>
            <div>
              <label style={{display:'block', fontSize:'0.82rem', fontWeight:600, marginBottom:'4px'}}>Serie facturi (opțional)</label>
              <input type="text" value={sbForm.series} onChange={e => setSbForm(f=>({...f,series:e.target.value}))}
                placeholder="ex: GJC (lasă gol pentru toate)"
                style={{width:'100%', padding:'8px 10px', border:'1px solid var(--border-color)', borderRadius:'7px', fontSize:'0.875rem', boxSizing:'border-box'}} />
            </div>
          </div>

          <div style={{background:'#fffbeb', border:'1px solid #fde68a', borderRadius:'8px', padding:'10px 14px', fontSize:'0.8rem', color:'#92400e', marginBottom:'14px'}}>
            <strong>Unde găsesc Token-ul API?</strong> SmartBill → Contul meu → Setări → Integrare API → Generează token
          </div>

          <div style={{display:'flex', gap:'10px', flexWrap:'wrap'}}>
            <button onClick={handleSaveSmartBill}
              style={{display:'flex', alignItems:'center', gap:'6px', padding:'8px 16px', background:'#f59e0b', color:'white', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:600, fontSize:'0.875rem'}}>
              <Save size={15}/> Salvează
            </button>
            {sbConfigured && (
              <>
                <button onClick={handleTestSmartBill} disabled={sbTesting}
                  style={{display:'flex', alignItems:'center', gap:'6px', padding:'8px 16px', background:'#6366f1', color:'white', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:600, fontSize:'0.875rem', opacity: sbTesting ? 0.7 : 1}}>
                  {sbTesting ? <><RefreshCw size={14} style={{animation:'spin 1s linear infinite'}}/> Se testează...</> : <><CheckCircle size={14}/> Testează conexiunea</>}
                </button>
                <button onClick={handleSyncSmartBill} disabled={sbSyncing}
                  style={{display:'flex', alignItems:'center', gap:'6px', padding:'8px 16px', background:'#10b981', color:'white', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:600, fontSize:'0.875rem', opacity: sbSyncing ? 0.7 : 1}}>
                  {sbSyncing ? <><RefreshCw size={14} style={{animation:'spin 1s linear infinite'}}/> Se sincronizează...</> : <><RefreshCw size={14}/> Sincronizare acum (30 zile)</>}
                </button>
              </>
            )}
          </div>

          {sbSyncResult && (
            <div style={{marginTop:'12px', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:'8px', padding:'12px 16px', fontSize:'0.85rem', color:'#166534'}}>
              <CheckCircle size={15} style={{marginRight:6, verticalAlign:'middle'}}/>
              <strong>Sincronizare completă:</strong> {sbSyncResult.added} facturi importate · {sbSyncResult.skipped} deja existente · {sbSyncResult.total} total în SmartBill
            </div>
          )}
        </div>
      </div>

      {/* Modal Utilizator CRM */}
      {showUserModal && (
        <div className="modal-overlay" onClick={() => setShowUserModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:'580px', width:'95vw'}}>
            <div className="modal-header">
              <h2>{editingUser ? (editingUser.id === currentUser?.id && !isAdmin ? '🔐 Schimbă parola' : '✏️ Editează cont') : '👤 Cont nou'}</h2>
              <button className="close-btn" onClick={() => setShowUserModal(false)}><X size={20}/></button>
            </div>
            <div className="modal-body" style={{maxHeight:'75vh', overflowY:'auto'}}>
              <div style={{display:'flex', flexDirection:'column', gap:'16px'}}>

                {/* Date de bază */}
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px'}}>
                  <div style={{gridColumn: isAdmin ? '1' : '1 / -1'}}>
                    <label style={{display:'block', fontWeight:600, fontSize:'0.85rem', marginBottom:4}}>📧 Email *</label>
                    <input type="email" value={userForm.email}
                      onChange={e => setUserForm(f => ({...f, email: e.target.value}))}
                      placeholder="ex: coleg@gjc.ro"
                      disabled={editingUser && !isAdmin}
                      style={{width:'100%', padding:'8px 11px', border:'1px solid var(--border-color)', borderRadius:'7px', fontSize:'0.875rem', boxSizing:'border-box', background: (editingUser && !isAdmin) ? '#f9fafb' : 'white'}} />
                  </div>
                  {isAdmin && (
                    <div>
                      <label style={{display:'block', fontWeight:600, fontSize:'0.85rem', marginBottom:4}}>🛡️ Rol sistem</label>
                      <select value={userForm.role} onChange={e => setUserForm(f => ({...f, role: e.target.value}))}
                        style={{width:'100%', padding:'8px 11px', border:'1px solid var(--border-color)', borderRadius:'7px', fontSize:'0.875rem', boxSizing:'border-box'}}>
                        <option value="operator">operator</option>
                        <option value="admin">admin (acces total)</option>
                      </select>
                    </div>
                  )}
                  <div style={{gridColumn:'1 / -1'}}>
                    <label style={{display:'block', fontWeight:600, fontSize:'0.85rem', marginBottom:4}}>
                      🔑 {editingUser ? 'Parolă nouă (lasă gol dacă nu schimbi)' : 'Parolă *'}
                    </label>
                    <input type="password" value={userForm.password}
                      onChange={e => setUserForm(f => ({...f, password: e.target.value}))}
                      placeholder={editingUser ? "lasă gol pentru a păstra parola curentă" : "Minim 6 caractere"}
                      style={{width:'100%', padding:'8px 11px', border:'1px solid var(--border-color)', borderRadius:'7px', fontSize:'0.875rem', boxSizing:'border-box'}} />
                  </div>
                </div>

                {/* Permisiuni — doar pentru admin și doar pentru conturi cu rol operator */}
                {isAdmin && userForm.role !== 'admin' && (
                  <div style={{border:'1px solid #e5e7eb', borderRadius:'10px', overflow:'hidden'}}>
                    <div style={{background:'#f8fafc', padding:'12px 16px', borderBottom:'1px solid #e5e7eb'}}>
                      <div style={{fontWeight:700, fontSize:'0.9rem', marginBottom:'8px'}}>🔐 Permisiuni acces</div>
                      {/* Butoane presetare */}
                      <div style={{display:'flex', gap:'6px', flexWrap:'wrap'}}>
                        {Object.entries(PRESETS).filter(([k]) => k !== 'admin').map(([key, preset]) => (
                          <button key={key} onClick={() => applyPreset(key)}
                            style={{padding:'4px 11px', border:`1px solid ${preset.color}`, borderRadius:'20px', background: preset.bg, color: preset.color, cursor:'pointer', fontSize:'0.78rem', fontWeight:600}}>
                            {preset.label}
                          </button>
                        ))}
                        <button onClick={() => setUserForm(f => ({...f, permissions: []}))}
                          style={{padding:'4px 11px', border:'1px solid #e5e7eb', borderRadius:'20px', background:'#f3f4f6', color:'#6b7280', cursor:'pointer', fontSize:'0.78rem', fontWeight:600}}>
                          ✕ Golește tot
                        </button>
                      </div>
                    </div>
                    <div style={{padding:'12px 16px'}}>
                      <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.83rem'}}>
                        <thead>
                          <tr style={{color:'#9ca3af', fontWeight:600}}>
                            <th style={{textAlign:'left', paddingBottom:'6px'}}>Modul</th>
                            <th style={{textAlign:'center', paddingBottom:'6px', width:'90px'}}>👁️ Vizualizare</th>
                            <th style={{textAlign:'center', paddingBottom:'6px', width:'90px'}}>✏️ Editare</th>
                          </tr>
                        </thead>
                        <tbody>
                          {PERMISSION_GROUPS.map((g, i) => (
                            <tr key={g.read} style={{borderTop: i > 0 ? '1px solid #f3f4f6' : 'none'}}>
                              <td style={{padding:'5px 0', fontWeight:500}}>{g.label}</td>
                              <td style={{textAlign:'center'}}>
                                <input type="checkbox"
                                  checked={userForm.permissions.includes(g.read)}
                                  onChange={() => togglePermission(g.read)}
                                  style={{width:'16px', height:'16px', cursor:'pointer', accentColor:'#6366f1'}} />
                              </td>
                              <td style={{textAlign:'center'}}>
                                {g.write ? (
                                  <input type="checkbox"
                                    checked={userForm.permissions.includes(g.write)}
                                    onChange={() => togglePermission(g.write)}
                                    disabled={!userForm.permissions.includes(g.read)}
                                    style={{width:'16px', height:'16px', cursor: userForm.permissions.includes(g.read) ? 'pointer' : 'not-allowed', accentColor:'#6366f1', opacity: userForm.permissions.includes(g.read) ? 1 : 0.3}} />
                                ) : (
                                  <span style={{color:'#d1d5db', fontSize:'0.75rem'}}>—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div style={{marginTop:'8px', fontSize:'0.75rem', color:'#9ca3af'}}>
                        ℹ️ Editarea se poate bifa doar dacă Vizualizarea este activată. Conturile <strong>admin</strong> au acces complet automat.
                      </div>
                    </div>
                  </div>
                )}

                {userForm.role === 'admin' && isAdmin && (
                  <div style={{background:'#fef2f2', border:'1px solid #fecaca', borderRadius:'8px', padding:'10px 14px', fontSize:'0.82rem', color:'#991b1b'}}>
                    🔑 Conturile <strong>admin</strong> au acces complet la toate modulele, fără restricții.
                  </div>
                )}

                {!editingUser && (
                  <div style={{background:'#fef3c7', border:'1px solid #fde68a', borderRadius:'8px', padding:'10px 14px', fontSize:'0.8rem', color:'#92400e'}}>
                    ⚠️ Comunicați parola verbal sau pe WhatsApp persoanei respective. CRM-ul nu trimite email automat la crearea contului.
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowUserModal(false)}>Anulează</button>
              <button className="btn btn-primary" onClick={handleSaveUser} disabled={userSaving}>
                <Save size={14}/> {userSaving ? 'Se salvează...' : 'Salvează'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Operator */}
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
                <div className="form-group" style={{gridColumn:'span 2'}}>
                  <label>📧 Email (pentru notificări sarcini)</label>
                  <input type="email" value={editingOp?.email || ""} onChange={e => setEditingOp({...editingOp, email: e.target.value})} placeholder="ex: coleg@gjc.ro" />
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
