import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../../config';

export default function ClientJobsPage({ showNotification }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/client/jobs`)
      .then(r => setJobs(r.data || []))
      .catch(() => showNotification('Eroare la încărcare', 'error'))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>⏳ Se încarcă...</div>;

  const activeJobs = jobs.filter(j => j.status !== 'inchis');
  const closedJobs = jobs.filter(j => j.status === 'inchis');

  const JobCard = ({ job }) => {
    const filled = job.candidates_count || 0;
    const total = job.headcount_needed || 1;
    const pct = Math.min(100, Math.round(filled / total * 100));
    const isFull = filled >= total;

    return (
      <div style={{ background: 'white', borderRadius: 14, padding: '20px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: `1px solid ${isFull ? '#bbf7d0' : '#f3f4f6'}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#1e3a5f' }}>{job.title}</h3>
            <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
              {job.location && <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>📍 {job.location}</span>}
              {job.cor_code && <span style={{ fontSize: '0.78rem', background: '#eef2ff', color: '#4f46e5', padding: '1px 7px', borderRadius: 5, fontWeight: 600 }}>COR {job.cor_code}</span>}
            </div>
          </div>
          <span style={{
            padding: '4px 12px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 700,
            background: isFull ? '#d1fae5' : job.status === 'activ' ? '#dbeafe' : job.status === 'pauza' ? '#fef3c7' : '#f3f4f6',
            color: isFull ? '#065f46' : job.status === 'activ' ? '#1d4ed8' : job.status === 'pauza' ? '#92400e' : '#374151',
          }}>
            {isFull ? '✅ Complet' : job.status === 'activ' ? '🟢 Activ' : job.status === 'pauza' ? '⏸️ Pauză' : job.status}
          </span>
        </div>

        {/* Progres ocupare */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>Locuri ocupate</span>
            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: isFull ? '#065f46' : '#1e3a5f' }}>{filled} / {total}</span>
          </div>
          <div style={{ background: '#f3f4f6', borderRadius: 8, height: 10 }}>
            <div style={{ width: `${pct}%`, background: isFull ? '#10b981' : '#6366f1', borderRadius: 8, height: 10, transition: 'width 0.6s' }} />
          </div>
        </div>

        {/* Salariu și beneficii */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid #f3f4f6' }}>
          {(job.salary_min || job.salary_max) && (
            <span style={{ fontSize: '0.82rem', color: '#374151' }}>
              💶 {job.salary_min || '?'} – {job.salary_max || '?'} {job.currency || 'EUR'}
            </span>
          )}
          {job.accommodation && <span style={{ fontSize: '0.78rem', background: '#f0fdf4', color: '#166534', padding: '2px 8px', borderRadius: 6 }}>🏠 Cazare</span>}
          {job.meals && <span style={{ fontSize: '0.78rem', background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 6 }}>🍽️ Masă</span>}
          {job.transport && <span style={{ fontSize: '0.78rem', background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: 6 }}>🚌 Transport</span>}
        </div>

        {job.description && (
          <div style={{ marginTop: 10, fontSize: '0.82rem', color: '#6b7280', background: '#f8fafc', borderRadius: 8, padding: '8px 12px' }}>
            {job.description}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: '1.3rem', fontWeight: 800, color: '#1e3a5f' }}>💼 Posturi Vacante</h1>
        <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>Situația posturilor disponibile și gradul de ocupare</p>
      </div>

      {jobs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af', background: 'white', borderRadius: 14 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>💼</div>
          Nu există posturi vacante înregistrate momentan.
        </div>
      ) : (
        <>
          {activeJobs.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ margin: '0 0 14px', fontSize: '0.9rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                🟢 Posturi active ({activeJobs.length})
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                {activeJobs.map(j => <JobCard key={j.id} job={j} />)}
              </div>
            </div>
          )}

          {closedJobs.length > 0 && (
            <div>
              <h2 style={{ margin: '0 0 14px', fontSize: '0.9rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                ⬛ Posturi închise ({closedJobs.length})
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, opacity: 0.6 }}>
                {closedJobs.map(j => <JobCard key={j.id} job={j} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
