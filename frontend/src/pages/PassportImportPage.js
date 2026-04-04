import React, { useState, useRef, useCallback } from 'react';
import { Upload, ScanLine, CheckCircle, XCircle, AlertCircle, User, RefreshCw, Trash2, Save } from 'lucide-react';
import axios from 'axios';
import { API } from '../config';

const STATUS = {
  WAITING: 'waiting',
  PROCESSING: 'processing',
  DONE: 'done',
  ERROR: 'error',
  SAVED: 'saved',
};

const statusColor = {
  [STATUS.WAITING]: '#6b7280',
  [STATUS.PROCESSING]: '#2563eb',
  [STATUS.DONE]: '#16a34a',
  [STATUS.ERROR]: '#dc2626',
  [STATUS.SAVED]: '#7c3aed',
};

const statusLabel = {
  [STATUS.WAITING]: 'În așteptare',
  [STATUS.PROCESSING]: 'Se procesează...',
  [STATUS.DONE]: 'Date extrase',
  [STATUS.ERROR]: 'Eroare',
  [STATUS.SAVED]: 'Salvat în CRM',
};

export default function PassportImportPage({ showNotification }) {
  const [items, setItems] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [processingAll, setProcessingAll] = useState(false);
  const fileInputRef = useRef();

  const addFiles = useCallback((files) => {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!imageFiles.length) return;
    const newItems = imageFiles.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      preview: URL.createObjectURL(file),
      status: STATUS.WAITING,
      extracted: null,
      existingCandidate: null,
      error: null,
      saveMode: 'new', // 'new' sau 'update'
    }));
    setItems(prev => [...prev, ...newItems]);
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  const removeItem = (id) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const processOne = async (item) => {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: STATUS.PROCESSING, error: null } : i));
    try {
      const formData = new FormData();
      formData.append('file', item.file);
      const res = await axios.post(`${API}/import/passport`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setItems(prev => prev.map(i => i.id === item.id ? {
        ...i,
        status: STATUS.DONE,
        extracted: res.data.extracted,
        existingCandidate: res.data.existing_candidate,
        saveMode: res.data.existing_candidate ? 'update' : 'new',
      } : i));
    } catch (err) {
      const msg = err.response?.data?.detail || 'Eroare la procesare';
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: STATUS.ERROR, error: msg } : i));
    }
  };

  const processAll = async () => {
    setProcessingAll(true);
    const waiting = items.filter(i => i.status === STATUS.WAITING);
    for (const item of waiting) {
      await processOne(item);
    }
    setProcessingAll(false);
  };

  const updateField = (id, field, value) => {
    setItems(prev => prev.map(i => i.id === id ? {
      ...i, extracted: { ...i.extracted, [field]: value }
    } : i));
  };

  const saveOne = async (item) => {
    try {
      const payload = {
        data: item.extracted,
        update_existing: item.saveMode === 'update' && !!item.existingCandidate,
        candidate_id: item.saveMode === 'update' ? item.existingCandidate?.id : null,
      };
      const res = await axios.post(`${API}/import/passport/confirm`, payload);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: STATUS.SAVED } : i));
      if (showNotification) showNotification(res.data.message || 'Candidat salvat!', 'success');
    } catch (err) {
      const msg = err.response?.data?.detail || 'Eroare la salvare';
      if (showNotification) showNotification(msg, 'error');
    }
  };

  const stats = {
    total: items.length,
    processed: items.filter(i => [STATUS.DONE, STATUS.SAVED].includes(i.status)).length,
    saved: items.filter(i => i.status === STATUS.SAVED).length,
    errors: items.filter(i => i.status === STATUS.ERROR).length,
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <ScanLine size={28} color="#2563eb" />
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1e293b', margin: 0 }}>
            Import Pașapoarte cu AI
          </h1>
        </div>
        <p style={{ color: '#64748b', margin: 0 }}>
          Încarcă fotografii de pașapoarte (din WhatsApp sau altă sursă) — AI-ul extrage automat datele și le salvează în CRM.
        </p>
      </div>

      {/* Stats bar */}
      {items.length > 0 && (
        <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {[
            { label: 'Total încărcate', value: stats.total, color: '#2563eb' },
            { label: 'Date extrase', value: stats.processed, color: '#16a34a' },
            { label: 'Salvate în CRM', value: stats.saved, color: '#7c3aed' },
            { label: 'Erori', value: stats.errors, color: '#dc2626' },
          ].map(s => (
            <div key={s.label} style={{
              background: 'white', border: `2px solid ${s.color}20`,
              borderRadius: '10px', padding: '12px 20px', textAlign: 'center', minWidth: '120px'
            }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? '#2563eb' : '#cbd5e1'}`,
          borderRadius: '12px',
          padding: '40px',
          textAlign: 'center',
          cursor: 'pointer',
          background: isDragging ? '#eff6ff' : '#f8fafc',
          transition: 'all 0.2s',
          marginBottom: '20px',
        }}
      >
        <Upload size={40} color={isDragging ? '#2563eb' : '#94a3b8'} style={{ margin: '0 auto 12px' }} />
        <p style={{ fontSize: '16px', fontWeight: 600, color: isDragging ? '#2563eb' : '#475569', margin: '0 0 4px' }}>
          {isDragging ? 'Eliberează pentru a încărca' : 'Trage pozele pașapoartelor aici'}
        </p>
        <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
          sau click pentru a selecta fișiere · JPG, PNG, JPEG · multiple fișiere simultan
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={e => addFiles(e.target.files)}
        />
      </div>

      {/* Action buttons */}
      {items.length > 0 && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
          <button
            onClick={processAll}
            disabled={processingAll || !items.some(i => i.status === STATUS.WAITING)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: '#2563eb', color: 'white', border: 'none',
              padding: '10px 20px', borderRadius: '8px', cursor: 'pointer',
              fontWeight: 600, fontSize: '14px',
              opacity: (processingAll || !items.some(i => i.status === STATUS.WAITING)) ? 0.6 : 1,
            }}
          >
            {processingAll ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <ScanLine size={16} />}
            {processingAll ? 'Se procesează...' : `Extrage date cu AI (${items.filter(i => i.status === STATUS.WAITING).length} poze)`}
          </button>
          <button
            onClick={() => {
              items.filter(i => i.status === STATUS.DONE).forEach(saveOne);
            }}
            disabled={!items.some(i => i.status === STATUS.DONE)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: '#16a34a', color: 'white', border: 'none',
              padding: '10px 20px', borderRadius: '8px', cursor: 'pointer',
              fontWeight: 600, fontSize: '14px',
              opacity: !items.some(i => i.status === STATUS.DONE) ? 0.6 : 1,
            }}
          >
            <Save size={16} />
            Salvează toate în CRM
          </button>
        </div>
      )}

      {/* Items grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(500px, 1fr))', gap: '16px' }}>
        {items.map(item => (
          <div key={item.id} style={{
            background: 'white', borderRadius: '12px',
            border: `2px solid ${statusColor[item.status]}30`,
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            overflow: 'hidden',
          }}>
            {/* Card header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', background: `${statusColor[item.status]}10`,
              borderBottom: `1px solid ${statusColor[item.status]}20`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {item.status === STATUS.WAITING && <AlertCircle size={16} color={statusColor[item.status]} />}
                {item.status === STATUS.PROCESSING && <RefreshCw size={16} color={statusColor[item.status]} style={{ animation: 'spin 1s linear infinite' }} />}
                {item.status === STATUS.DONE && <CheckCircle size={16} color={statusColor[item.status]} />}
                {item.status === STATUS.ERROR && <XCircle size={16} color={statusColor[item.status]} />}
                {item.status === STATUS.SAVED && <CheckCircle size={16} color={statusColor[item.status]} />}
                <span style={{ fontSize: '13px', fontWeight: 600, color: statusColor[item.status] }}>
                  {statusLabel[item.status]}
                </span>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>{item.file.name}</span>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {item.status === STATUS.WAITING && (
                  <button onClick={() => processOne(item)} style={{
                    background: '#2563eb', color: 'white', border: 'none',
                    padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px'
                  }}>Procesează</button>
                )}
                {item.status === STATUS.ERROR && (
                  <button onClick={() => processOne(item)} style={{
                    background: '#dc2626', color: 'white', border: 'none',
                    padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px'
                  }}>Reîncearcă</button>
                )}
                <button onClick={() => removeItem(item.id)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px'
                }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Card body */}
            <div style={{ display: 'flex', gap: '0' }}>
              {/* Image preview */}
              <div style={{ width: '140px', minWidth: '140px', padding: '12px' }}>
                <img
                  src={item.preview}
                  alt="Pașaport"
                  style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                />
              </div>

              {/* Extracted data or status */}
              <div style={{ flex: 1, padding: '12px 16px 12px 0' }}>
                {item.status === STATUS.WAITING && (
                  <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>
                    Apasă "Procesează" sau "Extrage date cu AI" pentru a citi datele din pașaport.
                  </p>
                )}
                {item.status === STATUS.PROCESSING && (
                  <p style={{ color: '#2563eb', fontSize: '13px', margin: 0 }}>
                    Claude AI citește pașaportul...
                  </p>
                )}
                {item.status === STATUS.ERROR && (
                  <div>
                    <p style={{ color: '#dc2626', fontSize: '13px', margin: '0 0 8px' }}>{item.error}</p>
                    {item.error?.includes('ANTHROPIC_API_KEY') && (
                      <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                        ⚙️ Setarea cheii API este necesară — contactează administratorul CRM.
                      </p>
                    )}
                  </div>
                )}
                {(item.status === STATUS.DONE || item.status === STATUS.SAVED) && item.extracted && (
                  <div>
                    {item.existingCandidate && (
                      <div style={{
                        background: '#fef3c7', border: '1px solid #fbbf24',
                        borderRadius: '6px', padding: '6px 10px', marginBottom: '8px', fontSize: '12px', color: '#92400e'
                      }}>
                        <User size={12} style={{ marginRight: '4px' }} />
                        Candidat existent găsit: <strong>{item.existingCandidate.name}</strong>
                        <select
                          value={item.saveMode}
                          onChange={e => setItems(prev => prev.map(i => i.id === item.id ? { ...i, saveMode: e.target.value } : i))}
                          style={{ marginLeft: '8px', fontSize: '11px', padding: '2px 4px', borderRadius: '4px' }}
                        >
                          <option value="update">Actualizează</option>
                          <option value="new">Creează nou</option>
                        </select>
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                      {[
                        { key: 'first_name', label: 'Prenume' },
                        { key: 'last_name', label: 'Nume' },
                        { key: 'passport_number', label: 'Nr. Pașaport' },
                        { key: 'nationality', label: 'Naționalitate' },
                        { key: 'date_of_birth', label: 'Data nașterii' },
                        { key: 'passport_expiry', label: 'Expiră la' },
                      ].map(({ key, label }) => (
                        <div key={key}>
                          <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>{label}</label>
                          <input
                            value={item.extracted[key] || ''}
                            onChange={e => updateField(item.id, key, e.target.value)}
                            disabled={item.status === STATUS.SAVED}
                            style={{
                              width: '100%', padding: '4px 6px', fontSize: '12px',
                              border: '1px solid #e2e8f0', borderRadius: '4px',
                              background: item.status === STATUS.SAVED ? '#f8fafc' : 'white',
                              boxSizing: 'border-box',
                            }}
                          />
                        </div>
                      ))}
                    </div>
                    {item.status === STATUS.DONE && (
                      <button
                        onClick={() => saveOne(item)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '6px',
                          marginTop: '8px', background: '#16a34a', color: 'white',
                          border: 'none', padding: '6px 14px', borderRadius: '6px',
                          cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                        }}
                      >
                        <Save size={12} />
                        {item.saveMode === 'update' ? 'Actualizează candidatul' : 'Creează candidat nou'}
                      </button>
                    )}
                    {item.status === STATUS.SAVED && (
                      <p style={{ color: '#7c3aed', fontSize: '12px', margin: '8px 0 0', fontWeight: 600 }}>
                        ✓ Salvat cu succes în CRM
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
          <ScanLine size={48} style={{ margin: '0 auto 16px', opacity: 0.4 }} />
          <p style={{ fontSize: '16px', margin: 0 }}>Nicio imagine încărcată încă</p>
          <p style={{ fontSize: '13px', margin: '4px 0 0' }}>
            Salvează pozele din WhatsApp pe computer, apoi trage-le aici
          </p>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
