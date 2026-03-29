import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Bell, Clock, AlertTriangle, RefreshCw, Eye, CheckCircle } from 'lucide-react';
import { API } from '../config';
import LoadingSpinner from '../components/LoadingSpinner';

const AlertsPage = ({ showNotification }) => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/alerts`);
      setAlerts(response.data);
    } catch (error) {
      showNotification("Eroare la încărcarea alertelor", "error");
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const getPriorityIcon = (priority) => {
    switch (priority) {
      case "urgent": return <AlertTriangle className="urgent" size={20} />;
      case "warning": return <Clock className="warning" size={20} />;
      default: return <Bell className="info" size={20} />;
    }
  };

  // Group alerts by priority
  const urgentAlerts = alerts.filter(a => a.priority === "urgent");
  const warningAlerts = alerts.filter(a => a.priority === "warning");
  const infoAlerts = alerts.filter(a => a.priority === "info");

  const AlertCard = ({ alert }) => (
    <div className={`alert-item ${alert.priority}`} data-testid={`alert-${alert.id}`}>
      <div className="alert-icon">
        {getPriorityIcon(alert.priority)}
      </div>
      <div className="alert-content">
        <h4>{alert.entity_name}</h4>
        <p>{alert.message}</p>
        <div className="alert-meta">
          <span className="alert-type">
            {alert.type === "passport_expiry" ? "Pașaport" : "Permis de muncă"}
          </span>
          {alert.company_name && (
            <span className="alert-company">{alert.company_name}</span>
          )}
          <span className="alert-date">
            {alert.days_until_expiry < 0 
              ? `Expirat: ${alert.expiry_date}`
              : `Expiră: ${alert.expiry_date}`
            }
          </span>
          <span className={`days-badge ${alert.priority}`}>
            {alert.days_until_expiry < 0 
              ? `EXPIRAT`
              : `${alert.days_until_expiry} zile`
            }
          </span>
        </div>
      </div>
      <div className="alert-actions">
        <button 
          className="btn btn-sm btn-secondary"
          onClick={() => window.location.hash = `#candidate-${alert.entity_id}`}
          data-testid={`view-candidate-${alert.entity_id}`}
        >
          <Eye size={14} /> Vezi Dosar
        </button>
      </div>
    </div>
  );

  return (
    <div className="module-container" data-testid="alerts-module">
      <div className="module-toolbar">
        <div className="alerts-summary-bar">
          <span className="alert-count urgent">{urgentAlerts.length} Critice</span>
          <span className="alert-count warning">{warningAlerts.length} Urgente</span>
          <span className="alert-count info">{infoAlerts.length} Atenție</span>
        </div>
        <button className="btn btn-secondary" onClick={fetchAlerts} data-testid="refresh-alerts">
          <RefreshCw size={16} /> Reîmprospătează
        </button>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="alerts-grouped">
          {/* Critical Alerts (< 30 days or expired) */}
          {urgentAlerts.length > 0 && (
            <div className="alert-group urgent">
              <h3 className="group-header urgent">
                <AlertTriangle size={18} />
                Alerte Critice ({urgentAlerts.length})
                <small>Expirate sau sub 30 de zile</small>
              </h3>
              <div className="alerts-list">
                {urgentAlerts.map((alert) => (
                  <AlertCard key={alert.id} alert={alert} />
                ))}
              </div>
            </div>
          )}

          {/* Warning Alerts (30-60 days) */}
          {warningAlerts.length > 0 && (
            <div className="alert-group warning">
              <h3 className="group-header warning">
                <Clock size={18} />
                Alerte Urgente ({warningAlerts.length})
                <small>30 - 60 de zile</small>
              </h3>
              <div className="alerts-list">
                {warningAlerts.map((alert) => (
                  <AlertCard key={alert.id} alert={alert} />
                ))}
              </div>
            </div>
          )}

          {/* Info Alerts (60-90 days) */}
          {infoAlerts.length > 0 && (
            <div className="alert-group info">
              <h3 className="group-header info">
                <Bell size={18} />
                Alerte de Atenție ({infoAlerts.length})
                <small>60 - 90 de zile</small>
              </h3>
              <div className="alerts-list">
                {infoAlerts.map((alert) => (
                  <AlertCard key={alert.id} alert={alert} />
                ))}
              </div>
            </div>
          )}

          {alerts.length === 0 && (
            <div className="empty-state">
              <CheckCircle size={48} />
              <p>Nu există alerte active!</p>
              <small>Toate documentele sunt în regulă.</small>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AlertsPage;
