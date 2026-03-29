import React from 'react';

const KPICard = ({ title, value, subtitle, icon: Icon, color, highlight }) => (
  <div className={`kpi-card ${color} ${highlight ? "highlight" : ""}`} data-testid={`kpi-${title.toLowerCase().replace(/ /g, "-")}`}>
    <div className="kpi-icon">
      <Icon size={24} />
    </div>
    <div className="kpi-content">
      <span className="kpi-value">{value}</span>
      <span className="kpi-title">{title}</span>
      <span className="kpi-subtitle">{subtitle}</span>
    </div>
  </div>
);

export default KPICard;
