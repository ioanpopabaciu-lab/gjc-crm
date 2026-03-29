import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Users, Building2, FileText, TrendingUp, Bell, RefreshCw } from 'lucide-react';
import { API } from '../config';
import KPICard from '../components/KPICard';
import LoadingSpinner from '../components/LoadingSpinner';

const DashboardPage = ({ showNotification }) => {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/dashboard`);
      setDashboard(response.data);
    } catch (error) {
      console.error("Error fetching dashboard:", error);
      showNotification("Eroare la încărcarea dashboard-ului", "error");
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  const seedData = async () => {
    try {
      await axios.post(`${API}/seed`);
      showNotification("Date demo încărcate cu succes!");
      fetchDashboard();
    } catch (error) {
      showNotification("Eroare la încărcarea datelor demo", "error");
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading) return <LoadingSpinner />;

  const kpis = dashboard?.kpis || {};

  return (
    <div className="dashboard-module" data-testid="dashboard-module">
      <div className="dashboard-actions">
        <button className="btn btn-primary" onClick={seedData} data-testid="seed-data-btn">
          <RefreshCw size={16} /> Încarcă Date Demo
        </button>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <KPICard
          title="Total Candidați"
          value={kpis.total_candidates || 0}
          subtitle={`${kpis.active_candidates || 0} activi`}
          icon={Users}
          color="blue"
        />
        <KPICard
          title="Companii Partenere"
          value={kpis.total_companies || 0}
          subtitle={`${kpis.active_companies || 0} active`}
          icon={Building2}
          color="green"
        />
        <KPICard
          title="Dosare Imigrare"
          value={kpis.total_cases || 0}
          subtitle={`${kpis.pending_cases || 0} în procesare`}
          icon={FileText}
          color="purple"
        />
        <KPICard
          title="Valoare Pipeline"
          value={`€${(kpis.pipeline_value || 0).toLocaleString()}`}
          subtitle="Valoare ponderată"
          icon={TrendingUp}
          color="orange"
        />
        <KPICard
          title="Alerte Active"
          value={kpis.total_alerts || 0}
          subtitle={`${kpis.expiring_passports || 0} pașapoarte, ${kpis.expiring_permits || 0} permise`}
          icon={Bell}
          color="red"
          highlight={kpis.total_alerts > 0}
        />
      </div>

      {/* Charts Row */}
      <div className="charts-row">
        <div className="chart-card">
          <h3>Top Naționalități</h3>
          <div className="nationality-list">
            {(dashboard?.nationalities || []).map((nat, idx) => (
              <div key={idx} className="nationality-item">
                <span className="nat-name">{nat.nationality}</span>
                <div className="nat-bar-container">
                  <div
                    className="nat-bar"
                    style={{ width: `${(nat.count / (dashboard?.kpis?.total_candidates || 1)) * 100}%` }}
                  />
                </div>
                <span className="nat-count">{nat.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="chart-card">
          <h3>Top Companii (Plasări)</h3>
          <div className="company-list">
            {(dashboard?.top_companies || []).map((comp, idx) => (
              <div key={idx} className="company-item">
                <span className="rank">#{idx + 1}</span>
                <span className="comp-name">{comp.company}</span>
                <span className="comp-count">{comp.placements} plasări</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
