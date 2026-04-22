import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../../config';
import { useAuth } from '../../hooks/useAuth';
import { Briefcase, Users, FileText, CheckCircle, Clock, AlertCircle, TrendingUp, CreditCard } from 'lucide-react';

const STATUS_LABELS = {
  'in_asteptare': { label: 'În așteptare', color: '#f59e0b', bg: '#fef3c7' },
  'interviu': { label: 'Interviu programat', color: '#3b82f6', bg: '#dbeafe' },
  'activ': { label: 'Activ', color: '#10b981', bg: '#d1fae5' },
  'plasat': { label: 'Plasat ✅', color: '#065f46', bg: '#d1fae5' },
  'respins': { label: 'Respins', color: '#ef4444', bg: '#fee2e2' },
  'retras': { label: 'Retras', color: '#6b7280', bg: '#f3f4f6' },
};

const IMIGR_STATUS = {
  'dosar_depus': { label: 'Dosar depus', color: '#8b5cf6' },
  'aviz_aprobat': { label: 'Aviz aprobat ✅', color: '#10b981' },
  'viza_obtinuta': { label: 'Viză obținută ✅', color: '#10b981' },
  'permis_obtinut': { label: 'Permis obținut ✅', color: '#10b981' },
  'in_procesare': { label: 'În procesare', color: '#3b82f6' },
};

export default function ClientDashboardPage({ showNotification }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [dashResp, payResp] = await Promise.allSettled([
          axios.get(`${API}/client/dashboard`),
          axios.get(`${API}/client/payments`),
        ]);
        if (dashResp.status === 'fulfilled') setData(dashResp.value.data);
        else showNotification('Eroare la încărcarea datelor', 'error');
        if (payResp.status === 'fulfilled') setPayments(payResp.value.data || []);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>
      <div style={{ fontSize: '2rem', marginBottom: 12 }}>⏳</div>
      Se încarcă datele...
    </div>
  );

  if (!data) return null;
  const { stats, recent_candidates, jobs } = data;

  const statCards = [
    { icon: Briefcase, label: 'Locuri disponibile', value: stats.total_locuri, color: '#6366f1', bg: '#eef2ff' },
    { icon: Users,     label: 'Locuri ocupate',     value: stats.ocupate,      color: '#10b981', bg: '#d1fae5' },
    { icon: TrendingUp,label: 'Locuri libere',      value: stats.libere,       color: '#f59e0b', bg: '#fef3c7' },
    { icon: FileText,  label: 'Documente',          value: stats.documente,    color: '#3b82f6', bg: '#dbeafe' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Titlu */}
      <div>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#1e3a5f' }}>
          Bun venit, {user?.company_name || 'Client'} 👋
        </h1>
        <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '0.9rem' }}>
          Situația curentă a forței de muncă și proceselor de recrutare
        </p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
        {statCards.map((s, i) => (
          <div key={i} style={{ background: 'white', borderRadius: 14, padding: '20px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ background: s.bg, borderRadius: 12, padding: 12 }}>
              <s.icon size={22} color={s.color} />
            </div>
            <div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: 2 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Posturi active */}
        <div style={{ background: 'white', borderRadius: 14, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700, color: '#1e3a5f' }}>💼 Posturi Vacante</h3>
          {jobs.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Nu există posturi active.</p>
          ) : jobs.map(j => {
            const filled = j.candidates_count || 0;
            const total = j.headcount_needed || 1;
            const pct = Math.min(100, Math.round(filled / total * 100));
            return (
              <div key={j.id} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{j.title}</span>
                  <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>{filled}/{total} ocupate</span>
                </div>
                <div style={{ background: '#f3f4f6', borderRadius: 6, height: 8 }}>
                  <div style={{ width: `${pct}%`, background: pct >= 100 ? '#10b981' : '#6366f1', borderRadius: 6, height: 8, transition: 'width 0.5s' }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Candidați recenți */}
        <div style={{ background: 'white', borderRadius: 14, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700, color: '#1e3a5f' }}>👷 Candidați Recenți</h3>
          {recent_candidates.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Nu există candidați.</p>
          ) : recent_candidates.map(c => {
            const st = STATUS_LABELS[c.status] || { label: c.status, color: '#6b7280', bg: '#f3f4f6' };
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{c.first_name} {c.last_name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{c.job_type || '—'}</div>
                </div>
                <span style={{ background: st.bg, color: st.color, padding: '2px 9px', borderRadius: 10, fontSize: '0.72rem', fontWeight: 700 }}>
                  {st.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Secțiune Plăți — vizibilă doar clientului ── */}
      {payments.length > 0 && (
        <div style={{ background: 'white', borderRadius: 14, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700, color: '#1e3a5f', display: 'flex', alignItems: 'center', gap: 8 }}>
            <CreditCard size={18} color="#059669" /> Situația Plăților
          </h3>
          {/* Sumar */}
          {(() => {
            const total   = payments.reduce((s, p) => s + (p.amount || 0), 0);
            const platit  = payments.filter(p => p.status === 'platit').reduce((s, p) => s + (p.amount || 0), 0);
            const partial = payments.filter(p => p.status === 'partial').reduce((s, p) => s + (p.amount || 0), 0);
            const restant = payments.filter(p => p.status === 'neplatit').reduce((s, p) => s + (p.amount || 0), 0);
            const currency = payments[0]?.currency || 'EUR';
            const pct = total > 0 ? Math.round((platit / total) * 100) : 0;
            return (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                  {[
                    { label: 'Total facturat', value: `${total.toFixed(2)} ${currency}`, color: '#374151', bg: '#f9fafb' },
                    { label: 'Plătit',          value: `${platit.toFixed(2)} ${currency}`, color: '#065f46', bg: '#d1fae5' },
                    { label: 'Restant',         value: `${restant.toFixed(2)} ${currency}`, color: restant > 0 ? '#991b1b' : '#6b7280', bg: restant > 0 ? '#fee2e2' : '#f3f4f6' },
                  ].map(s => (
                    <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: 4 }}>{s.label}</div>
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: s.color }}>{s.value}</div>
                    </div>
                  ))}
                </div>
                {/* Bară progres */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#6b7280', marginBottom: 4 }}>
                    <span>Progres achitare</span>
                    <span style={{ fontWeight: 700, color: pct >= 100 ? '#059669' : '#374151' }}>{pct}%</span>
                  </div>
                  <div style={{ background: '#f3f4f6', borderRadius: 8, height: 10 }}>
                    <div style={{ width: `${pct}%`, background: pct >= 100 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444', borderRadius: 8, height: 10, transition: 'width 0.6s' }} />
                  </div>
                </div>
              </div>
            );
          })()}
          {/* Tabel detaliu plăți */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #f3f4f6' }}>
                {['Data', 'Sumă', 'Nr. Factură', 'Metodă', 'Status'].map(h => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: '#6b7280', fontSize: '0.75rem' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                  <td style={{ padding: '7px 8px', color: '#374151' }}>{p.date_received || '—'}</td>
                  <td style={{ padding: '7px 8px', fontWeight: 600, color: '#059669' }}>{p.amount} {p.currency}</td>
                  <td style={{ padding: '7px 8px', color: '#6b7280' }}>{p.invoice_number || '—'}</td>
                  <td style={{ padding: '7px 8px', color: '#6b7280' }}>{p.method || '—'}</td>
                  <td style={{ padding: '7px 8px' }}>
                    <span style={{
                      fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                      background: p.status === 'platit' ? '#d1fae5' : p.status === 'partial' ? '#fef3c7' : '#fee2e2',
                      color:      p.status === 'platit' ? '#065f46' : p.status === 'partial' ? '#92400e' : '#991b1b',
                    }}>
                      {p.status === 'platit' ? '✓ Plătit' : p.status === 'partial' ? '½ Parțial' : '✗ Restant'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {payments.length === 0 && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '14px 18px', fontSize: '0.85rem', color: '#166534', display: 'flex', alignItems: 'center', gap: 10 }}>
          <CheckCircle size={18} /> <span><strong>Plăți la zi.</strong> Nu există plăți restante înregistrate.</span>
        </div>
      )}

      {/* Info box */}
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '14px 18px', fontSize: '0.85rem', color: '#1e40af' }}>
        <strong>ℹ️ Cum funcționează portalul:</strong> Accesați <em>Candidații Mei</em> pentru a vedea parcursul fiecărui angajat.
        Puteți încărca și descărca documente din secțiunea <em>Documente</em>. Echipa GJC actualizează statusurile în timp real.
      </div>
    </div>
  );
}
