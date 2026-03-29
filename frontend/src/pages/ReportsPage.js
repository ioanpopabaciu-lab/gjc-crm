import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BarChart3, Globe, TrendingUp, AlertTriangle, FileText } from 'lucide-react';
import { API } from '../config';
import LoadingSpinner from '../components/LoadingSpinner';

const ReportsPage = ({ showNotification }) => {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get(`${API}/dashboard`);
        setDashboard(response.data);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="module-container" data-testid="reports-module">
      <div className="reports-grid">
        <div className="report-card">
          <h3><BarChart3 size={20} /> Statistici Generale</h3>
          <div className="stats-list">
            <div className="stat-item">
              <span>Total Candidați</span>
              <strong>{dashboard?.kpis?.total_candidates || 0}</strong>
            </div>
            <div className="stat-item">
              <span>Candidați Activi</span>
              <strong>{dashboard?.kpis?.active_candidates || 0}</strong>
            </div>
            <div className="stat-item">
              <span>Companii Partenere</span>
              <strong>{dashboard?.kpis?.total_companies || 0}</strong>
            </div>
            <div className="stat-item">
              <span>Dosare în Procesare</span>
              <strong>{dashboard?.kpis?.pending_cases || 0}</strong>
            </div>
          </div>
        </div>

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
                      width: `${(nat.count / (dashboard?.kpis?.total_candidates || 1)) * 100}%`,
                      backgroundColor: ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"][idx % 5]
                    }}
                  />
                </div>
                <span className="nat-value">{nat.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="report-card">
          <h3><TrendingUp size={20} /> Performanță Pipeline</h3>
          <div className="pipeline-stats">
            <div className="big-stat">
              <span className="label">Valoare Totală Ponderată</span>
              <span className="value">€{(dashboard?.kpis?.pipeline_value || 0).toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="report-card">
          <h3><AlertTriangle size={20} /> Alerte Active</h3>
          <div className="alerts-summary">
            <div className="alert-stat urgent">
              <span>{dashboard?.kpis?.expiring_passports || 0}</span>
              <small>Pașapoarte</small>
            </div>
            <div className="alert-stat warning">
              <span>{dashboard?.kpis?.expiring_permits || 0}</span>
              <small>Permise</small>
            </div>
          </div>
        </div>
      </div>

      <div className="export-section">
        <h3>Export Rapoarte</h3>
        <p>Funcționalitatea de export PDF va fi disponibilă în versiunea completă.</p>
        <button className="btn btn-secondary" disabled>
          <FileText size={16} /> Export PDF
        </button>
      </div>
    </div>
  );
};

export default ReportsPage;
