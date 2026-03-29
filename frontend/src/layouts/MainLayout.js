import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Users, Building2, FileText, TrendingUp, Bell, BarChart3,
  Menu, Home, Calendar, User, LogOut, CheckCircle, AlertTriangle
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

const modules = [
  { id: "dashboard", path: "/", name: "Dashboard", icon: Home },
  { id: "companies", path: "/companies", name: "Clienți B2B", icon: Building2 },
  { id: "candidates", path: "/candidates", name: "Candidați B2C", icon: Users },
  { id: "immigration", path: "/immigration", name: "Dosare Imigrare", icon: FileText },
  { id: "pipeline", path: "/pipeline", name: "Pipeline Vânzări", icon: TrendingUp },
  { id: "documents", path: "/documents", name: "Documente", icon: FileText },
  { id: "reports", path: "/reports", name: "Rapoarte AI", icon: BarChart3 },
  { id: "alerts", path: "/alerts", name: "Centru Alerte", icon: Bell },
];

const MainLayout = ({ children, notification }) => {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  const activeModulePath = location.pathname;
  const activeModule = modules.find(m => activeModulePath === m.path || (m.path !== "/" && activeModulePath.startsWith(m.path))) || modules[0];

  return (
    <div className="app-container" data-testid="gjc-crm-app">
      {/* Notification */}
      {notification && (
        <div className={`notification ${notification.type}`} data-testid="notification">
          {notification.type === "success" ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? "open" : "collapsed"}`} data-testid="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <img src="/assets/gjc-logo.png" alt="GJC Logo" className="logo-img" />
            {sidebarOpen && <span>GJC AI-CRM</span>}
          </div>
          <button className="toggle-btn" onClick={() => setSidebarOpen(!sidebarOpen)} data-testid="toggle-sidebar">
            <Menu size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {modules.map((module) => (
            <button
              key={module.id}
              className={`nav-item ${activeModulePath === module.path ? "active" : ""}`}
              onClick={() => navigate(module.path)}
              data-testid={`nav-${module.id}`}
            >
              <module.icon size={20} />
              {sidebarOpen && <span>{module.name}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          {sidebarOpen && (
            <div className="user-info">
              <div className="user-avatar">
                <User size={20} />
              </div>
              <div className="user-details">
                <span className="user-name">{user?.email?.split('@')[0] || 'Utilizator'}</span>
                <span className="user-role">{user?.role === 'admin' ? 'Administrator' : 'Operator'}</span>
              </div>
              <button className="logout-btn" onClick={logout} title="Deconectare" data-testid="logout-btn">
                <LogOut size={18} />
              </button>
            </div>
          )}
          {!sidebarOpen && (
            <button className="logout-btn centered" onClick={logout} title="Deconectare" data-testid="logout-btn-small">
              <LogOut size={18} />
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content" data-testid="main-content">
        <header className="content-header">
          <h1>{activeModule.name}</h1>
          <div className="header-actions">
            <span className="date-display">
              <Calendar size={16} />
              {new Date().toLocaleDateString("ro-RO", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </span>
          </div>
        </header>

        <div className="content-body">
          {children}
        </div>
      </main>
    </div>
  );
};

export default MainLayout;
