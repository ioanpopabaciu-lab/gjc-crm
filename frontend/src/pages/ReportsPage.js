import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { BarChart3, Globe, TrendingUp, AlertTriangle, FileText, Calendar, Download, RefreshCw, Award, Users, Building2 } from 'lucide-react';
import { API } from '../config';
import LoadingSpinner from '../components/LoadingSpinner';

const ReportsPage = ({ showNotification }) => {
  const [dashboard, setDashboard] = useState(null);
  const [igiStats, setIgiStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const [dashRes, igiRes] = await Promise.all([
        axios.get(`${API}/dashboard`),
        axios.get(`${API}/immigration-stats?${params.toString()}`)
      ]);
      setDashboard(dashRes.data);
      setIgiStats(igiRes.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const exportCSV = () => {
    if (!igiStats) return;
    const lines = [
      ["Indicator", "Valoare"],
      ["Total dosare", igiStats.total_cases || 0],
      ["Dosare active", igiStats.active_cases || 0],
      ["Dosare aprobate", igiStats.approved_cases || 0],
      ["Dosare respinse", igiStats.rejected_cases || 0],
      ["Total candidați", dashboard?.kpis?.total_candidates || 0],
      ["Candidați activi", dashboard?.kpis?.active_candidates || 0],
      ["Companii partenere", dashboard?.kpis?.total_companies || 0],
      ["Pașapoarte expirând", dashboard?.kpis?.expiring_passports || 0],
      ["Permise expirând", dashboard?.kpis?.expiring_permits || 0],
    ];
    const csv = lines.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `raport_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (loading) return <LoadingSpinner />;

  const igi = igiStats || {};
  const kpis = dashboard?.kpis || {};

  return (
    <div className="module-container" data-testid="reports-module">
      {/* Filtru perioadă */}
      <div className="module-toolbar">
        <div className="toolbar-left">
          <div className="filter-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Calendar size={16} style={{ color: 'var(--text-muted)' }} />
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.85rem' }}
              placeholder="De la"
            />
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>—</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.85rem' }}
              placeholder="Până la"
            />
            {(dateFrom || dateTo) && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setDateFrom(""); setDateTo(""); }}>
                Resetează
              </button>
            )}
          </div>
        </div>
        <div className="toolbar-right">
          <button className="btn btn-secondary" onClick={fetchData}><RefreshCw size={16}/> Actualizează</button>
          <button className="btn btn-secondary" onClick={exportCSV}><Download size={16}/> Export CSV</button>
        </div>
      </div>

      <div className="reports-grid">
        {/* Statistici Generale */}
        <div className="report-card">
          <h3><BarChart3 size={20} /> Statistici Generale</h3>
          <div className="stats-list">
            <div className="stat-item">
              <span><Users size={14}/> Total Candidați</span>
              <strong>{kpis.total_candidates || 0}</strong>
            </div>
            <div className="stat-item">
              <span>Candidați Activi</span>
              <strong style={{ color: 'var(--success)' }}>{kpis.active_candidates || 0}</strong>
            </div>
            <div className="stat-item">
              <span><Building2 size={14}/> Companii Partenere</span>
              <strong>{kpis.total_companies || 0}</strong>
            </div>
            <div className="stat-item">
              <span>Dosare în Procesare</span>
              <strong style={{ color: 'var(--primary)' }}>{kpis.pending_cases || 0}</strong>
            </div>
          </div>
        </div>

        {/* Statistici IGI */}
        <div className="report-card">
          <h3><Award size={20} /> Dosare Imigrare{dateFrom || dateTo ? " (filtrate)" : ""}</h3>
          <div className="stats-list">
            <div className="stat-item">
              <span>Total Dosare</span>
              <strong>{igi.total_cases || 0}</strong>
            </div>
            <div className="stat-item">
              <span>Active</span>
              <strong style={{ color: 'var(--primary)' }}>{igi.active_cases || 0}</strong>
            </div>
            <div className="stat-item">
              <span>Aprobate</span>
              <strong style={{ color: 'var(--success)' }}>{igi.approved_cases || 0}</strong>
            </div>
            <div className="stat-item">
              <span>Respinse</span>
              <strong style={{ color: 'var(--danger)' }}>{igi.rejected_cases || 0}</strong>
            </div>
            {igi.avg_processing_days > 0 && (
              <div className="stat-item">
                <span>Durata medie procesare</span>
                <strong>{Math.round(igi.avg_processing_days)} zile</strong>
              </div>
            )}
          </div>
        </div>

        {/* Etape dosar */}
        {igi.by_stage && Object.keys(igi.by_stage).length > 0 && (
          <div className="report-card">
            <h3><TrendingUp size={20} /> Dosare pe Etapă</h3>
            <div className="nationality-chart">
              {Object.entries(igi.by_stage).sort((a,b) => b[1]-a[1]).slice(0, 8).map(([stage, count], idx) => (
                <div key={idx} className="nat-bar-item">
                  <span className="nat-label" style={{ fontSize: '0.75rem', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stage}</span>
                  <div className="nat-bar-wrapper">
                    <div
                      className="nat-bar-fill"
                      style={{
                        width: `${(count / (igi.total_cases || 1)) * 100}%`,
                        backgroundColor: ["#6366f1","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#84cc16","#f97316"][idx % 8]
                      }}
                    />
                  </div>
                  <span className="nat-value">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Naționalități */}
        <div className="report-card">
          <h3><Globe size={20} /> Distribuție Naționalități</h3>
          <div className="nationality-chart">
            {(dashboard?.nationalities || []).map((nat, idx) => (
              <div key={idx} className="nat-bar-item">
                <span className="nat-label">{nat.nationality}</span>
                <div className="nat-bar-wrapper">
                  <div
                    className="nat-bar-fill"
                    style={{
                      width: `${(nat.count / (kpis.total_candidates || 1)) * 100}%`,
                      backgroundColor: ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"][idx % 5]
                    }}
                  />
                </div>
                <span className="nat-value">{nat.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Companii top */}
        {igi.top_companies && igi.top_companies.length > 0 && (
          <div className="report-card">
            <h3><Building2 size={20} /> Top Companii (dosare)</h3>
            <div className="stats-list">
              {igi.top_companies.slice(0, 8).map((c, idx) => (
                <div key={idx} className="stat-item">
                  <span>{c.name}</span>
                  <strong>{c.cases} dosare</strong>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Alerte */}
        <div className="report-card">
          <h3><AlertTriangle size={20} /> Alerte Active</h3>
          <div className="alerts-summary">
            <div className="alert-stat urgent">
              <span>{kpis.expiring_passports || 0}</span>
              <small>Pașapoarte exp.</small>
            </div>
            <div className="alert-stat warning">
              <span>{kpis.expiring_permits || 0}</span>
              <small>Permise exp.</small>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;
