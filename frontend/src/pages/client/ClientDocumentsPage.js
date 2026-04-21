import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { API } from '../../config';
import { useAuth } from '../../hooks/useAuth';
import { Upload, Download, Trash2, FileText, Plus, X } from 'lucide-react';

const CATEGORIES = [
  { value: 'imputernicire',       label: '✍️ Împuternicire pentru agenție' },
  { value: 'contract_recrutare',  label: '📑 Contract Servicii Recrutare' },
  { value: 'conventie_mediere',   label: '🤝 Convenție mediere' },
  { value: 'cui_companie',        label: '🏢 CUI companie' },
  { value: 'cazier_judiciar',     label: '⚖️ Cazier judiciar companie' },
  { value: 'certificat_fiscal',   label: '🏛️ Certificat Fiscal ANAF' },
  { value: 'adeverinta_ajofm',    label: '📋 Adeverință AJOFM' },
  { value: 'oferta_angajare',     label: '💼 Ofertă de angajare' },
  { value: 'draft_cim',           label: '📝 Draft CIM' },
  { value: 'fisa_postului',       label: '📄 Fișa postului' },
  { value: 'organigrama',         label: '🗂️ Organigramă' },
  { value: 'proces_verbal',       label: '📋 Proces verbal de selecție' },
  { value: 'cerere_igi',          label: '🏛️ Cerere semnată către IGI' },
  { value: 'dovada_publicare',    label: '📢 Dovadă publicare post vacant' },
  { value: 'contract_comodat',    label: '🏠 Contract de comodat' },
  { value: 'scrisoare_garantie',  label: '🛡️ Scrisoare de garanție' },
  { value: 'taxa_aviz',           label: '💰 Copie taxă aviz' },
  { value: 'taxa_permis',         label: '💰 Copie taxă permis de ședere' },
  { value: 'taxa_consulara',      label: '💰 Copie taxă consulară' },
  { value: 'general',             label: '📎 Alte documente' },
];

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ClientDocumentsPage({ showNotification }) {
  const { user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filterCat, setFilterCat] = useState('');
  const [uploadForm, setUploadForm] = useState({ category: 'general', candidate_name: '', note: '' });
  const [selectedFile, setSelectedFile] = useState(null);
  const [downloading, setDownloading] = useState(null);
  const fileRef = useRef();

  const fetchDocs = async () => {
    try {
      const r = await axios.get(`${API}/client/documents`);
      setDocuments(r.data || []);
    } catch {
      showNotification('Eroare la încărcarea documentelor', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDocs(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpload = async () => {
    if (!selectedFile) { showNotification('Selectați un fișier', 'error'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      fd.append('company_id', user.company_id);
      fd.append('category', uploadForm.category);
      if (uploadForm.candidate_name) fd.append('candidate_name', uploadForm.candidate_name);
      if (uploadForm.note) fd.append('note', uploadForm.note);

      await axios.post(`${API}/client/documents/upload`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      showNotification('Document încărcat cu succes!');
      setShowUploadModal(false);
      setSelectedFile(null);
      setUploadForm({ category: 'general', candidate_name: '', note: '' });
      fetchDocs();
    } catch (e) {
      showNotification(e.response?.data?.detail || 'Eroare la upload', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc) => {
    setDownloading(doc.id);
    try {
      const resp = await axios.get(`${API}/client/documents/${doc.id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([resp.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      showNotification('Eroare la descărcare', 'error');
    } finally {
      setDownloading(null);
    }
  };

  const handleDelete = async (doc) => {
    if (!window.confirm(`Ștergeți documentul "${doc.filename}"?`)) return;
    try {
      await axios.delete(`${API}/client/documents/${doc.id}`);
      showNotification('Document șters!');
      fetchDocs();
    } catch (e) {
      showNotification(e.response?.data?.detail || 'Eroare la ștergere', 'error');
    }
  };

  const filtered = filterCat ? documents.filter(d => d.category === filterCat) : documents;

  // Grupăm pe categorie
  const grouped = {};
  filtered.forEach(d => {
    const cat = d.category || 'general';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(d);
  });

  const getCatLabel = (key) => CATEGORIES.find(c => c.value === key)?.label || key;

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>⏳ Se încarcă...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: '1.3rem', fontWeight: 800, color: '#1e3a5f' }}>📁 Documente</h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>Încărcați și descărcați documente legate de angajații dvs.</p>
        </div>
        <button onClick={() => setShowUploadModal(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: '#1e3a5f', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem' }}>
          <Upload size={16} /> Încarcă Document
        </button>
      </div>

      {/* Filtru categorie */}
      {documents.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          <button onClick={() => setFilterCat('')}
            style={{ padding: '6px 14px', border: `1px solid ${!filterCat ? '#1e3a5f' : '#e5e7eb'}`, background: !filterCat ? '#1e3a5f' : 'white', color: !filterCat ? 'white' : '#374151', borderRadius: 20, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
            Toate ({documents.length})
          </button>
          {CATEGORIES.filter(c => documents.some(d => d.category === c.value)).map(c => (
            <button key={c.value} onClick={() => setFilterCat(c.value)}
              style={{ padding: '6px 14px', border: `1px solid ${filterCat === c.value ? '#1e3a5f' : '#e5e7eb'}`, background: filterCat === c.value ? '#1e3a5f' : 'white', color: filterCat === c.value ? 'white' : '#374151', borderRadius: 20, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
              {c.label} ({documents.filter(d => d.category === c.value).length})
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, background: 'white', borderRadius: 14, color: '#9ca3af' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📁</div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Nu există documente</div>
          <div style={{ fontSize: '0.85rem' }}>Apăsați "Încarcă Document" pentru a adăuga primul document.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {Object.entries(grouped).map(([cat, docs]) => (
            <div key={cat}>
              <h3 style={{ margin: '0 0 10px', fontSize: '0.85rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {getCatLabel(cat)} ({docs.length})
              </h3>
              <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead style={{ background: '#f8fafc' }}>
                    <tr>
                      <th style={{ padding: '10px 16px', textAlign: 'left', borderBottom: '1px solid #f3f4f6', color: '#9ca3af', fontWeight: 600, fontSize: '0.78rem' }}>Fișier</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', borderBottom: '1px solid #f3f4f6', color: '#9ca3af', fontWeight: 600, fontSize: '0.78rem' }}>Candidat</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', borderBottom: '1px solid #f3f4f6', color: '#9ca3af', fontWeight: 600, fontSize: '0.78rem' }}>Notă</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', borderBottom: '1px solid #f3f4f6', color: '#9ca3af', fontWeight: 600, fontSize: '0.78rem' }}>Dimensiune</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', borderBottom: '1px solid #f3f4f6', color: '#9ca3af', fontWeight: 600, fontSize: '0.78rem' }}>Data</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', borderBottom: '1px solid #f3f4f6', color: '#9ca3af', fontWeight: 600, fontSize: '0.78rem' }}>Încărcat de</th>
                      <th style={{ padding: '10px 16px', textAlign: 'center', borderBottom: '1px solid #f3f4f6', color: '#9ca3af', fontWeight: 600, fontSize: '0.78rem' }}>Acțiuni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((doc, i) => (
                      <tr key={doc.id} style={{ borderBottom: i < docs.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <FileText size={16} color="#6366f1" />
                            <span style={{ fontWeight: 600, color: '#1e3a5f', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.filename}</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 16px', color: '#374151', fontSize: '0.82rem' }}>{doc.candidate_name || '—'}</td>
                        <td style={{ padding: '10px 16px', color: '#6b7280', fontSize: '0.8rem', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.note || '—'}</td>
                        <td style={{ padding: '10px 16px', color: '#6b7280', fontSize: '0.8rem' }}>{formatSize(doc.file_size)}</td>
                        <td style={{ padding: '10px 16px', color: '#6b7280', fontSize: '0.8rem' }}>{formatDate(doc.created_at)}</td>
                        <td style={{ padding: '10px 16px', fontSize: '0.78rem' }}>
                          <span style={{ background: doc.uploaded_by_role === 'admin' ? '#dbeafe' : '#d1fae5', color: doc.uploaded_by_role === 'admin' ? '#1d4ed8' : '#065f46', padding: '2px 8px', borderRadius: 8, fontWeight: 600 }}>
                            {doc.uploaded_by_role === 'admin' ? '🛠️ GJC' : '🏢 Client'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                            <button onClick={() => handleDownload(doc)} disabled={downloading === doc.id}
                              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 7, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>
                              <Download size={12} /> {downloading === doc.id ? '...' : 'Descarcă'}
                            </button>
                            {(doc.uploaded_by === user?.email || user?.role === 'admin') && (
                              <button onClick={() => handleDelete(doc)}
                                style={{ padding: '5px 8px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 7, cursor: 'pointer' }}>
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Upload */}
      {showUploadModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setShowUploadModal(false)}>
          <div style={{ background: 'white', borderRadius: 16, padding: 28, width: '95vw', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1e3a5f' }}>📤 Încarcă Document</h2>
              <button onClick={() => setShowUploadModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Fișier */}
              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: 6 }}>📎 Fișier *</label>
                <div onClick={() => fileRef.current?.click()}
                  style={{ border: `2px dashed ${selectedFile ? '#10b981' : '#e5e7eb'}`, borderRadius: 10, padding: '20px', textAlign: 'center', cursor: 'pointer', background: selectedFile ? '#f0fdf4' : '#f8fafc', transition: 'all 0.2s' }}>
                  {selectedFile ? (
                    <div style={{ color: '#065f46' }}>
                      <div style={{ fontWeight: 700 }}>✅ {selectedFile.name}</div>
                      <div style={{ fontSize: '0.78rem', marginTop: 4 }}>{formatSize(selectedFile.size)}</div>
                    </div>
                  ) : (
                    <div style={{ color: '#9ca3af' }}>
                      <Upload size={24} style={{ margin: '0 auto 8px', display: 'block' }} />
                      <div>Apasă pentru a selecta fișierul</div>
                      <div style={{ fontSize: '0.75rem', marginTop: 4 }}>PDF, JPG, PNG, DOC — max 15MB</div>
                    </div>
                  )}
                  <input ref={fileRef} type="file" style={{ display: 'none' }} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    onChange={e => setSelectedFile(e.target.files[0] || null)} />
                </div>
              </div>

              {/* Categorie */}
              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: 6 }}>🗂️ Categorie</label>
                <select value={uploadForm.category} onChange={e => setUploadForm(f => ({ ...f, category: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.875rem', background: 'white' }}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>

              {/* Candidat (opțional) */}
              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: 6 }}>👷 Candidat (opțional)</label>
                <input value={uploadForm.candidate_name} onChange={e => setUploadForm(f => ({ ...f, candidate_name: e.target.value }))}
                  placeholder="ex: Ion Moldovan"
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.875rem', boxSizing: 'border-box' }} />
              </div>

              {/* Notă */}
              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: 6 }}>📝 Notă (opțional)</label>
                <textarea value={uploadForm.note} onChange={e => setUploadForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Detalii suplimentare despre document..."
                  rows={2}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.875rem', boxSizing: 'border-box', resize: 'vertical' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowUploadModal(false)}
                style={{ flex: 1, padding: '10px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 9, cursor: 'pointer', fontWeight: 600 }}>
                Anulează
              </button>
              <button onClick={handleUpload} disabled={uploading || !selectedFile}
                style={{ flex: 2, padding: '10px', background: uploading ? '#9ca3af' : '#1e3a5f', color: 'white', border: 'none', borderRadius: 9, cursor: uploading ? 'not-allowed' : 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Upload size={16} /> {uploading ? 'Se încarcă...' : 'Încarcă Document'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
