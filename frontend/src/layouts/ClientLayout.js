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
  const [menuOpen, setMenuOpen] = useState(window.innerWidth >= 768);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const navigate = useNavigate();
  const location = useLocation();

  React.useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setMenuOpen(false);
      else setMenuOpen(true);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleNavigate = (path) => {
    navigate(path);
    if (isMobile) setMenuOpen(false);
  };

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

      {/* Mobile backdrop */}
      {isMobile && menuOpen && (
        <div onClick={() => setMenuOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99
        }} />
      )}

      {/* Sidebar */}
      <aside style={{
        width: menuOpen ? 240 : (isMobile ? 0 : 64),
        transition: 'width 0.25s, left 0.25s',
        background: 'linear-gradient(180deg, #1e3a5f 0%, #0f2744 100%)',
        display: 'flex', flexDirection: 'column',
        position: 'fixed', top: 0, left: isMobile && !menuOpen ? -240 : 0, bottom: 0,
        zIndex: 100, overflowX: 'hidden',
        boxShadow: isMobile && menuOpen ? '4px 0 20px rgba(0,0,0,0.3)' : 'none'
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
              <button key={m.id} onClick={() => handleNavigate(m.path)}
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
      <main style={{ marginLeft: isMobile ? 0 : (menuOpen ? 240 : 64), transition: 'margin-left 0.25s', flex: 1, padding: isMobile ? '16px' : '24px', minHeight: '100vh' }}>
        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, background: 'white', borderRadius: 12, padding: '12px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isMobile && (
              <button onClick={() => setMenuOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1e3a5f', padding: 4 }}>
                <Menu size={22} />
              </button>
            )}
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e3a5f' }}>
              🏢 {user?.company_name || 'Portal Client'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', color: '#6b7280' }}>
            <Calendar size={13} />
            {isMobile
              ? new Date().toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' })
              : new Date().toLocaleDateString('ro-RO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>
        {children}
      </main>
    </div>
  );
};

export default ClientLayout;
