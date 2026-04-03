import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  BarChart3, Globe, TrendingUp, AlertTriangle, FileText,
  Calendar, Download, RefreshCw, Award, Users, Building2, MapPin, Briefcase
} from 'lucide-react';
import { API } from '../config';
import LoadingSpinner from '../components/LoadingSpinner';

const StatBar = ({ label, count, max, color = "#6366f1" }) => (
  <div className="nat-bar-item">
    <span className="nat-label" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{label}</span>
    <div className="nat-bar-wrapper">
      <div className="nat-bar-fill" style={{ width: `${Math.min((count / (max || 1)) * 100, 100)}%`, backgroundColor: color }} />
    </div>
    <span className="nat-value" style={{ fontWeight: 700, minWidth: 28 }}>{count}</span>
  </div>
);

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#84cc16", "#f97316", "#ec4899", "#14b8a6"];

const ReportsPage = ({ showNotification }) => {
  const [activeTab, setActiveTab] = useState("general");
  const [dashboard, setDashboard] = useState(null);
  const [igiStats, setIgiStats] = useState(null);
  const [avizeStats, setAvizeStats] = useState(null);
  const [candidatsStats, setCandidatsStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const [dashRes, igiRes, avizeRes, candRes] = await Promise.all([
        axios.get(`${API}/dashboard`),
        axios.get(`${API}/immigration-stats?${params.toString()}`),
        axios.get(`${API}/stats/avize`),
        axios.get(`${API}/stats/candidates`)
      ]);
      setDashboard(dashRes.data);
      setIgiStats(igiRes.data);
      setAvizeStats(avizeRes.data);
      setCandidatsStats(candRes.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const exportCSV = () => {
    const kpis = dashboard?.kpis || {};
    const igi = igiStats || {};
    const av = avizeStats || {};
    const lines = [
      ["Indicator", "Valoare"],
      ["Total candidați", kpis.total_candidates || 0],
      ["Candidați activi", kpis.active_candidates || 0],
      ["Candidați plasați", (candidatsStats?.by_status?.find(s => s.status === "plasat")?.count) || 0],
      ["Companii partenere", kpis.total_companies || 0],
      ["Total dosare imigrare", igi.total_cases || 0],
      ["Dosare active", igi.active_cases || 0],
      ["Dosare aprobate", igi.approved_cases || 0],
      ["Total avize de muncă", av.total_avize || 0],
      ["Pașapoarte expirând", kpis.expiring_passports || 0],
      ["Permise expirând", kpis.expiring_permits || 0],
      [],
      ["Top Funcții COR", "Nr. candidați"],
      ...(av.by_function || []).map(f => [f.function, f.count]),
      [],
      ["Top Companii (avize)", "Nr. avize"],
      ...(av.by_company || []).map(c => [c.company, c.count]),
    ];
    const csv = lines.map(r => r.map(v => `"${String(v || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `raport_complet_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (loading) return <LoadingSpinner />;

  const kpis = dashboard?.kpis || {};
  const igi = igiStats || {};
  const av = avizeStats || {};
  const cs = candidatsStats || {};

  const tabs = [
    { id: "general", label: "General", icon: BarChart3 },
    { id: "avize", label: "Avize Muncă", icon: Award },
    { id: "candidati", label: "Candidați", icon: Users },
    { id: "companii", label: "Companii", icon: Building2 },
  ];

  return (
    <div className="module-container" data-testid="reports-module">
      {/* Toolbar */}
      <div className="module-toolbar">
        <div className="toolbar-left">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`btn ${activeTab === tab.id ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                onClick={() => setActiveTab(tab.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <tab.icon size={14} /> {tab.label}
              </button>
            ))}
          </div>
          {(activeTab === "general" || activeTab === "avize") && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 12 }}>
              <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.82rem' }} />
              <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>—</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.82rem' }} />
              {(dateFrom || dateTo) && (
                <button className="btn btn-ghost btn-sm" onClick={() => { setDateFrom(""); setDateTo(""); }}>✕</button>
              )}
            </div>
          )}
        </div>
        <div className="toolbar-right">
          <button className="btn btn-secondary btn-sm" onClick={fetchData}><RefreshCw size={14}/></button>
          <button className="btn btn-secondary" onClick={exportCSV}><Download size={16}/> Export CSV</button>
        </div>
      </div>

      {/* KPI summary bar */}
      <div className="kpi-summary-bar">
        <div className="kpi-pill"><Users size={14}/> <strong>{kpis.total_candidates || 0}</strong> candidați</div>
        <div className="kpi-pill plasat"><span>✓</span> <strong>{cs.by_status?.find(s => s.status === "plasat")?.count || 0}</strong> plasați</div>
        <div className="kpi-pill"><Award size={14}/> <strong>{av.total_avize || 0}</strong> avize muncă</div>
        <div className="kpi-pill"><FileText size={14}/> <strong>{igi.total_cases || 0}</strong> dosare</div>
        <div className="kpi-pill aprobat"><span>✓</span> <strong>{igi.approved_cases || 0}</strong> aprobate</div>
        <div className="kpi-pill"><Building2 size={14}/> <strong>{kpis.total_companies || 0}</strong> companii</div>
      </div>

      {/* ===== TAB: GENERAL ===== */}
      {activeTab === "general" && (
        <div className="reports-grid">
          <div className="report-card">
            <h3><BarChart3 size={18}/> Statistici Generale</h3>
            <div className="stats-list">
              <div className="stat-item"><span>Total Candidați</span><strong>{kpis.total_candidates || 0}</strong></div>
              <div className="stat-item"><span>Candidați Activi</span><strong style={{color:'var(--primary)'}}>{kpis.active_candidates || 0}</strong></div>
              <div className="stat-item"><span>Candidați Plasați</span><strong style={{color:'var(--success)'}}>
                {cs.by_status?.find(s => s.status === "plasat")?.count || 0}
              </strong></div>
              <div className="stat-item"><span>Companii Partenere</span><strong>{kpis.total_companies || 0}</strong></div>
              <div className="stat-item"><span>Dosare în Procesare</span><strong style={{color:'var(--primary)'}}>{igi.active_cases || 0}</strong></div>
              <div className="stat-item"><span>Dosare Aprobate</span><strong style={{color:'var(--success)'}}>{igi.approved_cases || 0}</strong></div>
              <div className="stat-item"><span>Total Avize Muncă</span><strong style={{color:'#6d28d9'}}>{av.total_avize || 0}</strong></div>
            </div>
          </div>

          <div className="report-card">
            <h3><TrendingUp size={18}/> Dosare pe Etapă</h3>
            <div className="nationality-chart">
              {Object.entries(igi.by_stage || {}).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([stage, count], idx) => (
                <StatBar key={stage} label={stage} count={count} max={igi.total_cases||1} color={COLORS[idx%COLORS.length]} />
              ))}
            </div>
          </div>

          <div className="report-card">
            <h3><AlertTriangle size={18}/> Alerte Active</h3>
            <div className="alerts-summary">
              <div className="alert-stat urgent"><span>{kpis.expiring_passports || 0}</span><small>Pașapoarte exp.</small></div>
              <div className="alert-stat warning"><span>{kpis.expiring_permits || 0}</span><small>Permise exp.</small></div>
            </div>
          </div>

          <div className="report-card">
            <h3><Globe size={18}/> Naționalități Candidați</h3>
            <div className="nationality-chart">
              {(dashboard?.nationalities || []).map((nat, idx) => (
                <StatBar key={idx} label={nat.nationality} count={nat.count} max={kpis.total_candidates||1} color={COLORS[idx%COLORS.length]} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== TAB: AVIZE ===== */}
      {activeTab === "avize" && (
        <div className="reports-grid">
          {/* KPIs avize */}
          <div className="report-card" style={{ gridColumn: '1 / -1' }}>
            <h3><Award size={18}/> Avize de Muncă — Sinteză</h3>
            <div className="stats-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 12 }}>
              <div className="kpi-card"><span className="kpi-label">Total Avize Emise</span><strong className="kpi-value" style={{color:'#6d28d9'}}>{av.total_avize || 0}</strong></div>
              <div className="kpi-card"><span className="kpi-label">Funcții COR distincte</span><strong className="kpi-value">{av.by_function?.length || 0}</strong></div>
              <div className="kpi-card"><span className="kpi-label">Companii cu avize</span><strong className="kpi-value">{av.by_company?.length || 0}</strong></div>
              <div className="kpi-card"><span className="kpi-label">Județe reprezentate</span><strong className="kpi-value">{av.by_county?.length || 0}</strong></div>
            </div>
          </div>

          {/* Funcții COR */}
          <div className="report-card">
            <h3><Briefcase size={18}/> Funcții COR (nr. candidați per funcție)</h3>
            <div className="nationality-chart">
              {(av.by_function || []).map((f, idx) => (
                <StatBar key={idx} label={f.function} count={f.count} max={av.by_function[0]?.count||1} color={COLORS[idx%COLORS.length]} />
              ))}
            </div>
          </div>

          {/* Top companii */}
          <div className="report-card">
            <h3><Building2 size={18}/> Top Companii (avize emise)</h3>
            <div className="nationality-chart">
              {(av.by_company || []).map((c, idx) => (
                <StatBar key={idx} label={c.company} count={c.count} max={av.by_company[0]?.count||1} color={COLORS[idx%COLORS.length]} />
              ))}
            </div>
          </div>

          {/* Județe */}
          {av.by_county?.length > 0 && (
            <div className="report-card">
              <h3><MapPin size={18}/> Județe Sediu Companie</h3>
              <div className="nationality-chart">
                {av.by_county.map((c, idx) => (
                  <StatBar key={idx} label={c.county} count={c.count} max={av.by_county[0]?.count||1} color={COLORS[idx%COLORS.length]} />
                ))}
              </div>
            </div>
          )}

          {/* Pe lună */}
          {av.by_month?.length > 0 && (
            <div className="report-card">
              <h3><Calendar size={18}/> Avize pe Lună</h3>
              <div className="nationality-chart">
                {av.by_month.map((m, idx) => (
                  <StatBar key={idx} label={m.month || "-"} count={m.count} max={Math.max(...av.by_month.map(x=>x.count))||1} color="#6366f1" />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== TAB: CANDIDATI ===== */}
      {activeTab === "candidati" && (
        <div className="reports-grid">
          <div className="report-card">
            <h3><Users size={18}/> Status Candidați</h3>
            <div className="stats-list">
              {(cs.by_status || []).map((s, idx) => (
                <div key={idx} className="stat-item">
                  <span>{s.status || "nespecificat"}</span>
                  <strong style={{ color: s.status === "plasat" ? 'var(--success)' : s.status === "în procesare" ? 'var(--primary)' : undefined }}>
                    {s.count}
                  </strong>
                </div>
              ))}
              <div className="stat-item" style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
                <span><strong>TOTAL</strong></span><strong>{cs.total || 0}</strong>
              </div>
            </div>
          </div>

          <div className="report-card">
            <h3><Globe size={18}/> Naționalitate</h3>
            <div className="nationality-chart">
              {(cs.by_nationality || []).map((n, idx) => (
                <StatBar key={idx} label={n.nationality} count={n.count} max={cs.by_nationality[0]?.count||1} color={COLORS[idx%COLORS.length]} />
              ))}
            </div>
          </div>

          <div className="report-card">
            <h3><MapPin size={18}/> Țara Naștere</h3>
            <div className="nationality-chart">
              {(cs.by_birth_country || []).map((c, idx) => (
                <StatBar key={idx} label={c.country} count={c.count} max={cs.by_birth_country[0]?.count||1} color={COLORS[idx%COLORS.length]} />
              ))}
            </div>
          </div>

          <div className="report-card">
            <h3><Briefcase size={18}/> Tip Job</h3>
            <div className="nationality-chart">
              {(cs.by_job || []).map((j, idx) => (
                <StatBar key={idx} label={j.job} count={j.count} max={cs.by_job[0]?.count||1} color={COLORS[idx%COLORS.length]} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== TAB: COMPANII ===== */}
      {activeTab === "companii" && (
        <div className="reports-grid">
          <div className="report-card">
            <h3><Building2 size={18}/> Top Companii după Avize</h3>
            <div className="nationality-chart">
              {(av.by_company || []).map((c, idx) => (
                <StatBar key={idx} label={c.company} count={c.count} max={av.by_company[0]?.count||1} color={COLORS[idx%COLORS.length]} />
              ))}
            </div>
          </div>
          <div className="report-card">
            <h3><MapPin size={18}/> Județe Companii</h3>
            <div className="nationality-chart">
              {(av.by_county || []).map((c, idx) => (
                <StatBar key={idx} label={c.county} count={c.count} max={av.by_county[0]?.count||1} color={COLORS[idx%COLORS.length]} />
              ))}
            </div>
          </div>
          <div className="report-card">
            <h3><Award size={18}/> Funcții COR per Companie</h3>
            <div className="nationality-chart">
              {(av.by_function || []).map((f, idx) => (
                <StatBar key={idx} label={f.function} count={f.count} max={av.by_function[0]?.count||1} color={COLORS[idx%COLORS.length]} />
              ))}
            </div>
          </div>
          <div className="report-card">
            <h3><Globe size={18}/> Țări de Origine Muncitori</h3>
            <div className="nationality-chart">
              {(av.by_birth_country || []).map((c, idx) => (
                <StatBar key={idx} label={c.country} count={c.count} max={av.by_birth_country[0]?.count||1} color={COLORS[idx%COLORS.length]} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsPage;
