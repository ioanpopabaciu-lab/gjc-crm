import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { API } from '../config';
import {
  Upload, FileText, CheckCircle, AlertTriangle, Loader,
  Trash2, Download, Save, RefreshCw, Filter, Search, X
} from 'lucide-react';

const STATUS_COLORS = {
  nou:       { bg: '#fef3c7', color: '#d97706', label: 'Nou' },
  importat:  { bg: '#d1fae5', color: '#059669', label: 'Importat în CRM' },
  eroare:    { bg: '#fee2e2', color: '#dc2626', label: 'Eroare' },
};

export default function AvizImportPage({ showNotification }) {
  const [avize, setAvize] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState([]);
  const [filterStatus, setFilterStatus] = useState('toate');
  const [search, setSearch] = useState('');
  const [editingCell, setEditingCell] = useState(null); // {id, field}
  const [importingId, setImportingId] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [emailImporting, setEmailImporting] = useState(false);
  const fileInputRef = useRef();

  // ─── Incarca avizele din baza de date ─────────────────────────
  const loadAvize = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filterStatus !== 'toate') params.status = filterStatus;
      if (search.trim().length >= 2) params.search = search.trim();
      const res = await axios.get(`${API}/avize`, { params });
      setAvize(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, search]);

  useEffect(() => { loadAvize(); }, [loadAvize]);

  // ─── Upload + OCR fisiere PDF ──────────────────────────────────
  const processFiles = async (files) => {
    const pdfs = Array.from(files).filter(f =>
      f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (!pdfs.length) {
      showNotification?.('Selectează fișiere PDF (avize IGI)', 'error');
      return;
    }

    setUploading(true);
    const progress = pdfs.map(f => ({ name: f.name, status: 'processing' }));
    setUploadProgress(progress);

    for (let i = 0; i < pdfs.length; i++) {
      const f = pdfs[i];
      try {
        const formData = new FormData();
        formData.append('file', f);
        await axios.post(`${API}/import/aviz`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 90000,
        });
        setUploadProgress(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'done' } : p));
      } catch (err) {
        const msg = err.response?.data?.detail || err.message;
        setUploadProgress(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'error', error: msg } : p));
      }
    }

    setUploading(false);
    setTimeout(() => setUploadProgress([]), 3000);
    await loadAvize();
    showNotification?.(`${pdfs.length} avize procesate!`);
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    processFiles(e.dataTransfer.files);
  }, []);

  // ─── Import din Email ──────────────────────────────────────────
  const importFromEmail = async () => {
    setEmailImporting(true);
    try {
      const res = await axios.post(`${API}/import/avize-email`, {}, { timeout: 120000 });
      const { imported, skipped, errors } = res.data;
      let msg = `${imported} avize noi importate din email`;
      if (skipped > 0) msg += ` · ${skipped} duplicate omise`;
      if (errors && errors.length > 0) msg += ` · ${errors.length} erori`;
      showNotification?.(msg, imported > 0 ? 'success' : 'info');
      if (imported > 0) await loadAvize();
    } catch (err) {
      if (err.response?.status === 503) {
        showNotification?.(
          'IMAP neconfigurat. Adaugă IMAP_USER (sau SMTP_USER) și IMAP_PASS (sau SMTP_PASS) în fișierul .env de pe server.',
          'error'
        );
      } else {
        const msg = err.response?.data?.detail || err.message;
        showNotification?.(msg, 'error');
      }
    } finally {
      setEmailImporting(false);
    }
  };

  // ─── Editare inline ────────────────────────────────────────────
  const handleCellEdit = async (id, field, value) => {
    setAvize(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a));
    setEditingCell(null);
    try {
      await axios.put(`${API}/avize/${id}`, { [field]: value });
    } catch (err) {
      showNotification?.('Eroare la salvare', 'error');
    }
  };

  // ─── Import in CRM ─────────────────────────────────────────────
  const importToCRM = async (id) => {
    setImportingId(id);
    try {
      const res = await axios.post(`${API}/avize/${id}/import`);
      showNotification?.(res.data.message || 'Importat cu succes!');
      await loadAvize();
    } catch (err) {
      const msg = err.response?.data?.detail || err.message;
      showNotification?.(msg, 'error');
    } finally {
      setImportingId(null);
    }
  };

  const importAllNew = async () => {
    const newAvize = avize.filter(a => a.import_status === 'nou');
    for (const a of newAvize) {
      await importToCRM(a.id);
    }
  };

  // ─── Stergere ──────────────────────────────────────────────────
  const deleteAviz = async (id) => {
    if (!window.confirm('Ștergi acest aviz din tabel?')) return;
    try {
      await axios.delete(`${API}/avize/${id}`);
      setAvize(prev => prev.filter(a => a.id !== id));
      showNotification?.('Aviz șters');
    } catch (err) {
      showNotification?.('Eroare la ștergere', 'error');
    }
  };

  // ─── Export CSV ────────────────────────────────────────────────
  const exportCSV = () => {
    if (!avize.length) return;
    const headers = ['Candidat','CNP','Data nașterii','Loc naștere','Naționalitate','Pașaport','Companie','CUI','J','Meserie','COR','Nr. Aviz','Data Aviz','Tip','Status'];
    const rows = avize.map(a => [
      a.candidate_name, a.cnp, a.birth_date, a.birth_place, a.nationality,
      a.passport_number, a.company_name, a.company_cui, a.company_j,
      a.job_title, a.cor_code, a.permit_number, a.permit_date, a.work_type,
      STATUS_COLORS[a.import_status]?.label || a.import_status
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'avize_munca_igi.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Stats ─────────────────────────────────────────────────────
  const noi = avize.filter(a => a.import_status === 'nou').length;
  const importate = avize.filter(a => a.import_status === 'importat').length;

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Avize de Muncă IGI</h2>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
            {avize.length} avize în tabel · {noi} noi · {importate} importate în CRM
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {noi > 0 && (
            <button onClick={importAllNew} style={btnStyle('#10b981')}>
              <Save size={15}/> Importă toate în CRM ({noi})
            </button>
          )}
          <button onClick={exportCSV} disabled={!avize.length} style={btnStyle('#6b7280', true)}>
            <Download size={15}/> Export CSV
          </button>
          <button
            onClick={importFromEmail}
            disabled={emailImporting || uploading}
            style={btnStyle('#8b5cf6')}
          >
            {emailImporting ? <Loader size={15} className="spin"/> : <span style={{fontSize:'15px'}}>📧</span>}
            {emailImporting ? 'Se caută în email...' : 'Import din Email'}
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={btnStyle('#3b82f6')}
          >
            {uploading ? <Loader size={15} className="spin"/> : <Upload size={15}/>}
            {uploading ? 'Se procesează...' : 'Adaugă avize PDF'}
          </button>
          <input
            ref={fileInputRef} type="file" multiple accept=".pdf,application/pdf"
            style={{ display: 'none' }}
            onChange={e => processFiles(e.target.files)}
          />
        </div>
      </div>

      {/* ── Progress upload ── */}
      {uploadProgress.length > 0 && (
        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
          <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '8px', color: '#0369a1' }}>
            Se procesează cu AI...
          </div>
          {uploadProgress.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', marginBottom: '4px' }}>
              {p.status === 'processing' && <Loader size={12} className="spin" color="#3b82f6"/>}
              {p.status === 'done' && <CheckCircle size={12} color="#10b981"/>}
              {p.status === 'error' && <AlertTriangle size={12} color="#ef4444"/>}
              <span style={{ color: p.status === 'error' ? '#ef4444' : '#374151' }}>{p.name}</span>
              {p.error && <span style={{ color: '#ef4444' }}>— {p.error.slice(0, 60)}</span>}
            </div>
          ))}
        </div>
      )}

      {/* ── Drop zone (compact) ── */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{
          border: `2px dashed ${dragging ? '#3b82f6' : '#d1d5db'}`,
          borderRadius: '10px', padding: '20px', textAlign: 'center',
          background: dragging ? '#eff6ff' : '#f9fafb', cursor: 'pointer',
          marginBottom: '20px', transition: 'all 0.2s',
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload size={24} color={dragging ? '#3b82f6' : '#9ca3af'} style={{ marginBottom: '6px' }}/>
        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          <strong style={{ color: '#374151' }}>Trage PDF-urile avizelor IGI aici</strong> sau click pentru selectare
        </div>
      </div>

      {/* ── Filtre ── */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '200px' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}/>
          <input
            type="text" placeholder="Caută candidat, companie, nr. aviz..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '8px 8px 8px 32px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '0.875rem', boxSizing: 'border-box' }}
          />
          {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer' }}><X size={14} color="#9ca3af"/></button>}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {['toate', 'nou', 'importat'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} style={{
              padding: '7px 14px', borderRadius: '8px', border: '1px solid',
              borderColor: filterStatus === s ? '#3b82f6' : '#e5e7eb',
              background: filterStatus === s ? '#eff6ff' : 'white',
              color: filterStatus === s ? '#3b82f6' : '#6b7280',
              cursor: 'pointer', fontSize: '0.8rem', fontWeight: filterStatus === s ? 600 : 400,
            }}>
              {s === 'toate' ? 'Toate' : STATUS_COLORS[s]?.label || s}
            </button>
          ))}
        </div>
        <button onClick={loadAvize} style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer' }}>
          <RefreshCw size={14} color="#6b7280"/>
        </button>
      </div>

      {/* ── Tabel ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af' }}>
          <Loader size={32} className="spin" style={{ marginBottom: '12px' }}/><br/>Se încarcă avizele...
        </div>
      ) : avize.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af', background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
          <FileText size={48} style={{ marginBottom: '16px', opacity: 0.3 }}/>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '8px' }}>Niciun aviz în tabel</div>
          <div style={{ fontSize: '0.875rem' }}>
            Adaugă PDF-urile avizelor IGI primite pe email — AI extrage automat toate datele
          </div>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e5e7eb' }}>
                  {[
                    'Candidat', 'CNP', 'Naționalitate', 'Pașaport',
                    'Data nașterii', 'Loc naștere',
                    'Companie', 'CUI', 'Meserie', 'COR',
                    'Nr. Aviz', 'Data Aviz', 'Tip', 'Status', 'Acțiuni'
                  ].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#6b7280', fontSize: '0.73rem', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {avize.map((a, idx) => (
                  <tr key={a.id} style={{ borderBottom: '1px solid #f3f4f6', background: idx % 2 === 0 ? 'white' : '#fafafa' }}>
                    {/* Celule editabile */}
                    {[
                      ['candidate_name', a.candidate_name],
                      ['cnp', a.cnp],
                      ['nationality', a.nationality],
                      ['passport_number', a.passport_number],
                      ['birth_date', a.birth_date],
                      ['birth_place', a.birth_place],
                      ['company_name', a.company_name],
                      ['company_cui', a.company_cui],
                      ['job_title', a.job_title],
                      ['cor_code', a.cor_code],
                      ['permit_number', a.permit_number],
                      ['permit_date', a.permit_date],
                      ['work_type', a.work_type],
                    ].map(([field, value]) => (
                      <td key={field} style={{ padding: '6px 12px', verticalAlign: 'middle' }}>
                        <EditableCell
                          value={value}
                          editing={editingCell?.id === a.id && editingCell?.field === field}
                          disabled={a.import_status === 'importat'}
                          onStartEdit={() => a.import_status !== 'importat' && setEditingCell({ id: a.id, field })}
                          onSave={v => handleCellEdit(a.id, field, v)}
                          onCancel={() => setEditingCell(null)}
                          wide={field === 'candidate_name' || field === 'company_name'}
                        />
                      </td>
                    ))}

                    {/* Status */}
                    <td style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}>
                      <span style={{
                        display: 'inline-block', padding: '3px 10px', borderRadius: '12px', fontSize: '0.73rem', fontWeight: 600,
                        background: STATUS_COLORS[a.import_status]?.bg || '#f3f4f6',
                        color: STATUS_COLORS[a.import_status]?.color || '#6b7280',
                      }}>
                        {STATUS_COLORS[a.import_status]?.label || a.import_status}
                      </span>
                    </td>

                    {/* Acțiuni */}
                    <td style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}>
                      {a.import_status === 'nou' && (
                        <button
                          onClick={() => importToCRM(a.id)}
                          disabled={importingId === a.id}
                          style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: '#dcfce7', color: '#15803d', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600, marginRight: '4px' }}
                        >
                          {importingId === a.id ? <Loader size={11} className="spin"/> : <Save size={11}/>}
                          CRM
                        </button>
                      )}
                      {a.import_status === 'importat' && (
                        <span style={{ color: '#10b981', fontSize: '0.75rem', fontWeight: 600, marginRight: '8px' }}>✓</span>
                      )}
                      <button
                        onClick={() => deleteAviz(a.id)}
                        style={{ padding: '4px 8px', borderRadius: '6px', border: 'none', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                      >
                        <Trash2 size={11}/>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}

// ─── Celulă editabilă inline ─────────────────────────────────────
function EditableCell({ value, editing, disabled, onStartEdit, onSave, onCancel, wide }) {
  const [val, setVal] = useState(value || '');
  const ref = useRef();

  useEffect(() => { if (editing && ref.current) ref.current.focus(); }, [editing]);
  useEffect(() => { setVal(value || ''); }, [value]);

  if (editing) {
    return (
      <input
        ref={ref}
        type="text"
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={() => onSave(val)}
        onKeyDown={e => {
          if (e.key === 'Enter') onSave(val);
          if (e.key === 'Escape') { setVal(value || ''); onCancel(); }
        }}
        style={{
          width: wide ? '160px' : '100px', padding: '3px 6px', borderRadius: '4px',
          border: '2px solid #3b82f6', fontSize: '0.78rem', outline: 'none',
        }}
      />
    );
  }

  return (
    <span
      onClick={onStartEdit}
      title={disabled ? '' : 'Click pentru editare'}
      style={{
        display: 'inline-block', minWidth: '60px', maxWidth: wide ? '160px' : '110px',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        cursor: disabled ? 'default' : 'pointer',
        padding: '2px 4px', borderRadius: '4px',
        color: value ? '#374151' : '#d1d5db',
        background: disabled ? 'transparent' : 'transparent',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { if (!disabled) e.target.style.background = '#eff6ff'; }}
      onMouseLeave={e => { e.target.style.background = 'transparent'; }}
    >
      {value || '—'}
    </span>
  );
}

const btnStyle = (color, outline) => ({
  padding: '8px 16px', borderRadius: '8px',
  border: outline ? `1px solid ${color}` : 'none',
  background: outline ? 'white' : color,
  color: outline ? color : 'white',
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px',
  fontSize: '0.875rem', fontWeight: 600,
});
