import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../../config';
import { Search } from 'lucide-react';

const STATUS_STEPS = [
  { key: 'interviu',       label: 'Interviu',           icon: '📋' },
  { key: 'documente',      label: 'Documente',          icon: '📁' },
  { key: 'dosar_depus',    label: 'Dosar IGI depus',    icon: '🏛️' },
  { key: 'aviz_aprobat',   label: 'Aviz aprobat',       icon: '✅' },
  { key: 'viza_obtinuta',  label: 'Viză obținută',      icon: '🛂' },
  { key: 'in_drum',        label: 'În drum spre RO',    icon: '✈️' },
  { key: 'plasat',         label: 'La locul de muncă',  icon: '🏢' },
];

const STATUS_CONFIG = {
  'in_asteptare': { label: 'În așteptare',      color: '#f59e0b', bg: '#fef3c7' },
  'interviu':     { label: 'Interviu',           color: '#3b82f6', bg: '#dbeafe' },
  'activ':        { label: 'Activ',              color: '#10b981', bg: '#d1fae5' },
  'plasat':       { label: 'Plasat ✅',           color: '#065f46', bg: '#d1fae5' },
  'respins':      { label: 'Respins',            color: '#ef4444', bg: '#fee2e2' },
  'retras':       { label: 'Retras',             color: '#6b7280', bg: '#f3f4f6' },
};

const IMIGR_STATUS = {
  'dosar_depus':    { label: 'Dosar depus',          color: '#8b5cf6', step: 2 },
  'aviz_aprobat':   { label: 'Aviz IGI aprobat ✅',   color: '#10b981', step: 3 },
  'viza_obtinuta':  { label: 'Viză obținută ✅',       color: '#10b981', step: 4 },
  'permis_obtinut': { label: 'Permis obținut ✅',      color: '#065f46', step: 6 },
  'in_procesare':   { label: 'În procesare',          color: '#3b82f6', step: 2 },
  'activ':          { label: 'Dosar activ',           color: '#6366f1', step: 1 },
};

function CandidateTimeline({ candidate }) {
  const imigr = candidate.immigration_case;
  let currentStep = 0;
  if (candidate.status === 'interviu') currentStep = 0;
  else if (imigr?.status === 'dosar_depus' || imigr?.status === 'in_procesare') currentStep = 2;
  else if (imigr?.status === 'aviz_aprobat') currentStep = 3;
  else if (imigr?.status === 'viza_obtinuta') currentStep = 4;
  else if (imigr?.status === 'permis_obtinut') currentStep = 5;
  else if (candidate.status === 'plasat') currentStep = 6;
  else if (candidate.status === 'activ') currentStep = 1;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
      {STATUS_STEPS.map((step, i) => {
        const done = i < currentStep;
        const active = i === currentStep;
        return (
          <React.Fragment key={step.key}>
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              opacity: done || active ? 1 : 0.3
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: done ? '#d1fae5' : active ? '#dbeafe' : '#f3f4f6',
                border: `2px solid ${done ? '#10b981' : active ? '#3b82f6' : '#e5e7eb'}`,
                fontSize: '0.9rem'
              }}>
                {done ? '✓' : step.icon}
              </div>
              <span style={{ fontSize: '0.6rem', color: active ? '#1d4ed8' : '#6b7280', fontWeight: active ? 700 : 400, textAlign: 'center', maxWidth: 55 }}>
                {step.label}
              </span>
            </div>
            {i < STATUS_STEPS.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done ? '#10b981' : '#e5e7eb', minWidth: 12, maxWidth: 30, borderRadius: 1 }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function ClientCandidatesPage({ showNotification }) {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    axios.get(`${API}/client/candidates`)
      .then(r => setCandidates(r.data || []))
      .catch(() => showNotification('Eroare la încărcare', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = candidates.filter(c => {
    const name = `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase()) || (c.job_type || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || c.status === filterStatus;
    return matchSearch && matchStatus;
  });

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>⏳ Se încarcă...</div>;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: '1.3rem', fontWeight: 800, color: '#1e3a5f' }}>👷 Candidații Mei</h1>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>Urmărește parcursul fiecărui angajat, de la interviu până la integrare</p>
      </div>

      {/* Filtre */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Caută după nume sau post..."
            style={{ width: '100%', paddingLeft: 34, paddingRight: 12, paddingTop: 9, paddingBottom: 9, border: '1px solid #e5e7eb', borderRadius: 9, fontSize: '0.875rem', boxSizing: 'border-box', background: 'white' }} />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 9, fontSize: '0.875rem', background: 'white', minWidth: 160 }}>
          <option value="">Toate statusurile</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 14px', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 9, fontSize: '0.82rem', color: '#6b7280' }}>
          {filtered.length} candidați
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af', background: 'white', borderRadius: 14 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>👷</div>
          Nu există candidați pentru criteriile selectate.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filtered.map(c => {
            const st = STATUS_CONFIG[c.status] || { label: c.status, color: '#6b7280', bg: '#f3f4f6' };
            const imigr = c.immigration_case;
            return (
              <div key={c.id} style={{ background: 'white', borderRadius: 14, padding: '18px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f3f4f6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e3a5f' }}>
                      {c.first_name} {c.last_name}
                      {c.nationality && <span style={{ marginLeft: 8, fontSize: '0.75rem', color: '#9ca3af', fontWeight: 400 }}>🌍 {c.nationality}</span>}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#6b7280', marginTop: 2 }}>
                      {c.job_type && <span>💼 {c.job_type}</span>}
                      {c.passport_number && <span style={{ marginLeft: 12 }}>🪪 {c.passport_number}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ background: st.bg, color: st.color, padding: '4px 12px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 700 }}>
                      {st.label}
                    </span>
                    {imigr && (
                      <span style={{ background: '#ede9fe', color: '#7c3aed', padding: '4px 12px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 700 }}>
                        🛂 {IMIGR_STATUS[imigr.status]?.label || imigr.status}
                      </span>
                    )}
                  </div>
                </div>

                {/* Timeline */}
                <CandidateTimeline candidate={c} />

                {/* Detalii imigrare */}
                {imigr && (
                  <div style={{ marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap', paddingTop: 12, borderTop: '1px solid #f3f4f6' }}>
                    {imigr.igi_number && <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>📋 IGI: <strong>{imigr.igi_number}</strong></span>}
                    {imigr.visa_status && <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>🛂 Viză: <strong>{imigr.visa_status}</strong></span>}
                    {imigr.permit_status && <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>📄 Permis: <strong>{imigr.permit_status}</strong></span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
