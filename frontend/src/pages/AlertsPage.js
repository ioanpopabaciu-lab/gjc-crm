import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Bell, Clock, AlertTriangle, RefreshCw, Eye, CheckCircle, Calendar, MessageCircle, Phone } from 'lucide-react';
import { API } from '../config';
import LoadingSpinner from '../components/LoadingSpinner';

const AlertsPage = ({ showNotification }) => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState([]);
  const [apptLoading, setApptLoading] = useState(true);
  const [operators, setOperators] = useState([]);
  const [daysFilter, setDaysFilter] = useState(14);

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

  const fetchAppointments = useCallback(async (days) => {
    try {
      setApptLoading(true);
      const [apptResp, opsResp] = await Promise.all([
        axios.get(`${API}/alerts/igi-appointments?days=${days}`),
        axios.get(`${API}/operators`).catch(() => ({ data: [] }))
      ]);
      setAppointments(apptResp.data || []);
      setOperators(opsResp.data || []);
    } catch {
      setAppointments([]);
    } finally {
      setApptLoading(false);
    }
  }, []);

  const sendWhatsApp = (operator, appointment) => {
    const phone = operator.phone.replace(/[^0-9]/g, '');
    const msg = `Bună ziua ${operator.name}! 📅 Programare IGI:\n👤 Candidat: ${appointment.candidate_name}\n🏢 Firmă: ${appointment.company_name}\n📆 Data: ${appointment.appointment_date}${appointment.appointment_time ? ` ora ${appointment.appointment_time}` : ''}\n${appointment.igi_number ? `📋 Nr. IGI: ${appointment.igi_number}` : ''}\nVă rugăm să pregătiți dosarul. Mulțumim!`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  useEffect(() => {
    fetchAlerts();
    fetchAppointments(daysFilter);
  }, [fetchAlerts, fetchAppointments, daysFilter]);

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

  const urgencyColor = { azi: '#dc2626', urgent: '#ea580c', curand: '#d97706', planificat: '#2563eb', trecut: '#6b7280' };
  const urgencyLabel = { azi: '🔴 AZI', urgent: '🟠 Urgent', curand: '🟡 Curând', planificat: '🔵 Planificat', trecut: '⚫ Trecut' };

  return (
    <div className="module-container" data-testid="alerts-module">
      <div className="module-toolbar">
        <div className="alerts-summary-bar">
          <span className="alert-count urgent">{urgentAlerts.length} Critice</span>
          <span className="alert-count warning">{warningAlerts.length} Urgente</span>
          <span className="alert-count info">{infoAlerts.length} Atenție</span>
        </div>
        <button className="btn btn-secondary" onClick={() => { fetchAlerts(); fetchAppointments(daysFilter); }} data-testid="refresh-alerts">
          <RefreshCw size={16} /> Reîmprospătează
        </button>
      </div>

      {/* ===== SECTIUNEA PROGRAMARI IGI ===== */}
      <div style={{background:'white', border:'2px solid #3b82f6', borderRadius:'12px', padding:'20px', marginBottom:'24px'}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px', flexWrap:'wrap', gap:'12px'}}>
          <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
            <Calendar size={22} color="#2563eb" />
            <div>
              <h3 style={{margin:0, fontSize:'1rem', fontWeight:700, color:'#1e40af'}}>
                Programări IGI — următoarele {daysFilter} zile
              </h3>
              <small style={{color:'#6b7280'}}>{appointments.length} programări găsite</small>
            </div>
          </div>
          <div style={{display:'flex', gap:'8px', alignItems:'center'}}>
            <span style={{fontSize:'0.82rem', color:'#6b7280'}}>Arată:</span>
            {[7, 14, 30].map(d => (
              <button key={d} onClick={() => setDaysFilter(d)}
                className={`btn ${daysFilter === d ? 'btn-primary' : 'btn-secondary'}`}
                style={{padding:'4px 12px', fontSize:'0.8rem'}}>
                {d} zile
              </button>
            ))}
          </div>
        </div>

        {apptLoading ? <LoadingSpinner /> : appointments.length === 0 ? (
          <div style={{textAlign:'center', padding:'30px', color:'#9ca3af'}}>
            <Calendar size={36} style={{marginBottom:'8px', opacity:0.4}} />
            <div>Nicio programare IGI în această perioadă</div>
          </div>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.88rem'}}>
              <thead>
                <tr style={{background:'#eff6ff', borderBottom:'2px solid #bfdbfe'}}>
                  <th style={{padding:'10px 14px', textAlign:'left', fontWeight:600, color:'#1e40af'}}>Candidat</th>
                  <th style={{padding:'10px 14px', textAlign:'left', fontWeight:600, color:'#1e40af'}}>Firmă</th>
                  <th style={{padding:'10px 14px', textAlign:'left', fontWeight:600, color:'#1e40af'}}>Data & Ora</th>
                  <th style={{padding:'10px 14px', textAlign:'left', fontWeight:600, color:'#1e40af'}}>Nr. IGI</th>
                  <th style={{padding:'10px 14px', textAlign:'center', fontWeight:600, color:'#1e40af'}}>Status</th>
                  <th style={{padding:'10px 14px', textAlign:'center', fontWeight:600, color:'#1e40af'}}>
                    <MessageCircle size={14} style={{marginRight:4}} />Notifică pe WhatsApp
                  </th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((appt, idx) => (
                  <tr key={appt.case_id} style={{borderBottom:'1px solid #e2e8f0', background: idx % 2 === 0 ? 'white' : '#f8fafc'}}>
                    <td style={{padding:'10px 14px', fontWeight:600}}>{appt.candidate_name}</td>
                    <td style={{padding:'10px 14px', color:'#475569'}}>{appt.company_name}</td>
                    <td style={{padding:'10px 14px'}}>
                      <span style={{fontWeight:600}}>{appt.appointment_date}</span>
                      {appt.appointment_time && <span style={{marginLeft:6, color:'#6b7280'}}>ora {appt.appointment_time}</span>}
                    </td>
                    <td style={{padding:'10px 14px', color:'#6b7280', fontFamily:'monospace'}}>{appt.igi_number || '—'}</td>
                    <td style={{padding:'10px 14px', textAlign:'center'}}>
                      <span style={{background: urgencyColor[appt.urgency] + '18', color: urgencyColor[appt.urgency], padding:'3px 10px', borderRadius:'20px', fontSize:'0.78rem', fontWeight:600, border:`1px solid ${urgencyColor[appt.urgency]}40`}}>
                        {urgencyLabel[appt.urgency]}
                        {appt.days_until >= 0 && <span style={{marginLeft:4}}>({appt.days_until}z)</span>}
                      </span>
                    </td>
                    <td style={{padding:'10px 14px', textAlign:'center'}}>
                      {operators.length === 0 ? (
                        <span style={{fontSize:'0.75rem', color:'#9ca3af'}}>
                          Adaugă operatori în<br/>Setări → Operatori & WA
                        </span>
                      ) : (
                        <div style={{display:'flex', gap:'6px', justifyContent:'center', flexWrap:'wrap'}}>
                          {operators.filter(o => o.active !== false).map(op => (
                            <button key={op.id}
                              onClick={() => sendWhatsApp(op, appt)}
                              style={{background:'#25D366', color:'white', border:'none', borderRadius:'8px', padding:'5px 10px', fontSize:'0.75rem', cursor:'pointer', display:'flex', alignItems:'center', gap:'4px', fontWeight:600}}>
                              <Phone size={11} /> {op.name.split(' ')[0]}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
