import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Users, Building2, FileText, TrendingUp, Bell, RefreshCw,
  DollarSign, CheckSquare, Calendar, UserCheck, CreditCard, Award
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { API } from '../config';
import KPICard from '../components/KPICard';
import LoadingSpinner from '../components/LoadingSpinner';

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#f97316"];

const DashboardPage = ({ showNotification }) => {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/dashboard`, { timeout: 30000 });
      setDashboard(response.data);
    } catch (error) {
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
    } catch {
      showNotification("Eroare la încărcarea datelor demo", "error");
    }
  };

  useEffect(() => {
    axios.get(`${API}/health`, { timeout: 60000 }).catch(() => {});
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px', gap: '16px' }}>
      <div style={{ fontSize: '40px' }}>🔄</div>
      <div style={{ fontSize: '16px', fontWeight: 600, color: '#374151' }}>Se conectează la server...</div>
      <div style={{ fontSize: '13px', color: '#9ca3af' }}>Prima conectare poate dura 10-30 secunde</div>
      <LoadingSpinner />
    </div>
  );

  const kpis = dashboard?.kpis || {};

  // Chart data
  const nationalityData = (dashboard?.nationalities || []).map(n => ({ name: n.nationality, value: n.count }));
  const companyData = (dashboard?.top_companies || []).map(c => ({ name: c.company?.substring(0, 18), plasari: c.placements }));

  return (
    <div className="dashboard-module" data-testid="dashboard-module">
      <div className="dashboard-actions">
        <button className="btn btn-primary" onClick={seedData} data-testid="seed-data-btn">
          <RefreshCw size={16} /> Încarcă Date Demo
        </button>
      </div>

      {/* ====== ROW 1: OPERATIVE KPIs ====== */}
      <div style={{ marginBottom: "8px", fontSize: "0.75rem", fontWeight: "700", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Operative
      </div>
      <div className="kpi-grid" style={{ marginBottom: "24px" }}>
        <KPICard title="Total Candidați" value={kpis.total_candidates || 0} subtitle={`${kpis.active_candidates || 0} activi`} icon={Users} color="blue" />
        <KPICard title="Companii Partenere" value={kpis.total_companies || 0} subtitle={`${kpis.active_companies || 0} active`} icon={Building2} color="green" />
        <KPICard title="Dosare Imigrare" value={kpis.total_cases || 0} subtitle={`${kpis.pending_cases || 0} în procesare`} icon={FileText} color="purple" />
        <KPICard title="Plasamente Active" value={kpis.active_placements || 0} subtitle="post-plasare activ" icon={UserCheck} color="green" />
        <KPICard title="Alerte Active" value={kpis.total_alerts || 0} subtitle={`${kpis.expiring_passports || 0} pașapoarte, ${kpis.expiring_permits || 0} permise`} icon={Bell} color="red" highlight={kpis.total_alerts > 0} />
      </div>

      {/* ====== ROW 2: FINANCIAL KPIs ====== */}
      <div style={{ marginBottom: "8px", fontSize: "0.75rem", fontWeight: "700", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Financiar
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "24px" }}>
        {[
          { label: "Încasat (Plăți)", value: `€${(kpis.total_collected || 0).toLocaleString("ro-RO")}`, color: "#10b981", icon: CreditCard, bg: "#d1fae5" },
          { label: "De Încasat", value: `€${(kpis.total_pending_payment || 0).toLocaleString("ro-RO")}`, color: "#f59e0b", icon: DollarSign, bg: "#fef3c7" },
          { label: "Valoare Contracte", value: `€${(kpis.total_contracts_value || 0).toLocaleString("ro-RO")}`, color: "#3b82f6", icon: FileText, bg: "#dbeafe" },
          { label: "Valoare Pipeline", value: `€${(kpis.pipeline_value || 0).toLocaleString()}`, color: "#8b5cf6", icon: TrendingUp, bg: "#ede9fe" },
        ].map(item => {
          const Icon = item.icon;
          return (
            <div key={item.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "18px 20px", display: "flex", alignItems: "center", gap: "14px" }}>
              <div style={{ background: item.bg, borderRadius: "10px", padding: "10px", flexShrink: 0 }}>
                <Icon size={20} color={item.color} />
              </div>
              <div>
                <div style={{ fontSize: "0.75rem", color: "#6b7280", fontWeight: "600" }}>{item.label}</div>
                <div style={{ fontSize: "1.4rem", fontWeight: "700", color: item.color }}>{item.value}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ====== ROW 3: Quick stats ====== */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "24px", flexWrap: "wrap" }}>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "12px 18px", display: "flex", alignItems: "center", gap: "10px" }}>
          <CheckSquare size={18} color="#8b5cf6" />
          <span style={{ fontSize: "0.875rem", color: "#374151" }}><strong style={{ color: "#8b5cf6" }}>{kpis.pending_tasks || 0}</strong> sarcini în așteptare</span>
        </div>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "12px 18px", display: "flex", alignItems: "center", gap: "10px" }}>
          <Calendar size={18} color="#6366f1" />
          <span style={{ fontSize: "0.875rem", color: "#374151" }}><strong style={{ color: "#6366f1" }}>{kpis.upcoming_interviews || 0}</strong> interviuri programate</span>
        </div>
      </div>

      {/* ====== ROW 4: Charts ====== */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        {/* Nationality pie */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "20px" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "1rem", fontWeight: "700", color: "#1f2937" }}>Top Naționalități</h3>
          {nationalityData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={nationalityData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {nationalityData.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: "220px", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af" }}>Fără date</div>
          )}
        </div>

        {/* Top companies bar */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "20px" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "1rem", fontWeight: "700", color: "#1f2937" }}>Top Companii (Plasări)</h3>
          {companyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={companyData} layout="vertical" margin={{ left: 10 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} />
                <Tooltip />
                <Bar dataKey="plasari" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: "220px", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af" }}>Fără date</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
