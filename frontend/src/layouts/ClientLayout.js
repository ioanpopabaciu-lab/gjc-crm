import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Briefcase, Users, FileText, LogOut, Menu, X, Building2, Calendar } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

const clientModules = [
  { id: 'dashboard', path: '/portal',           name: 'Panou Principal',   icon: Home },
  { id: 'jobs',      path: '/portal/posturi',    name: 'Posturi Vacante',   icon: Briefcase },
  { id: 'candidates',path: '/portal/candidati',  name: 'Candidații Mei',    icon: Users },
  { id: 'documents', path: '/portal/documente',  name: 'Documente',         icon: FileText },
];

const ClientLayout = ({ children, notification }) => {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc', fontFamily: 'Inter, sans-serif' }}>
      {/* Notification */}
      {notification && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: notification.type === 'error' ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${notification.type === 'error' ? '#fecaca' : '#bbf7d0'}`,
          color: notification.type === 'error' ? '#dc2626' : '#166534',
          padding: '12px 20px', borderRadius: 10, fontWeight: 600, fontSize: '0.9rem',
          boxShadow: '0 4px 20px rgba(0,0,0,0.12)', maxWidth: 380
        }}>
          {notification.message}
        </div>
      )}

      {/* Sidebar */}
      <aside style={{
        width: menuOpen ? 240 : 64, transition: 'width 0.2s',
        background: 'linear-gradient(180deg, #1e3a5f 0%, #0f2744 100%)',
        display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 100,
        overflowX: 'hidden'
      }}>
        {/* Header sidebar */}
        <div style={{ padding: '20px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ background: '#3b82f6', borderRadius: 10, padding: '8px 10px', flexShrink: 0 }}>
            <Building2 size={20} color="white" />
          </div>
          {menuOpen && (
            <div>
              <div style={{ color: 'white', fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.2 }}>
                {user?.company_name || 'Portal Client'}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem' }}>Portal Client GJC</div>
            </div>
          )}
          <button onClick={() => setMenuOpen(!menuOpen)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', padding: 4, flexShrink: 0 }}>
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {clientModules.map(m => {
            const isActive = location.pathname === m.path || (m.path !== '/portal' && location.pathname.startsWith(m.path));
            return (
              <button key={m.id} onClick={() => navigate(m.path)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: menuOpen ? '10px 14px' : '10px', borderRadius: 9,
                  background: isActive ? 'rgba(59,130,246,0.3)' : 'transparent',
                  border: isActive ? '1px solid rgba(59,130,246,0.5)' : '1px solid transparent',
                  color: isActive ? 'white' : 'rgba(255,255,255,0.65)',
                  cursor: 'pointer', textAlign: 'left', fontSize: '0.875rem', fontWeight: isActive ? 600 : 400,
                  transition: 'all 0.15s', whiteSpace: 'nowrap', overflow: 'hidden'
                }}>
                <m.icon size={18} style={{ flexShrink: 0 }} />
                {menuOpen && <span>{m.name}</span>}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 8px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          {menuOpen && (
            <div style={{ padding: '8px 14px', marginBottom: 8 }}>
              <div style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600, fontSize: '0.82rem' }}>
                {user?.email}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.72rem' }}>Client GJC</div>
            </div>
          )}
          <button onClick={logout}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: menuOpen ? '9px 14px' : '9px',
              background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 9, color: '#fca5a5', cursor: 'pointer', width: '100%',
              fontSize: '0.82rem', fontWeight: 600
            }}>
            <LogOut size={16} />
            {menuOpen && 'Deconectare'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ marginLeft: menuOpen ? 240 : 64, transition: 'margin-left 0.2s', flex: 1, padding: '24px', minHeight: '100vh' }}>
        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, background: 'white', borderRadius: 12, padding: '14px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e3a5f' }}>
            🏢 {user?.company_name || 'Portal Client'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#6b7280' }}>
            <Calendar size={14} />
            {new Date().toLocaleDateString('ro-RO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>
        {children}
      </main>
    </div>
  );
};

export default ClientLayout;
