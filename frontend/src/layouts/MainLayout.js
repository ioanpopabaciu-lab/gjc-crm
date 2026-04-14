import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Users, Building2, FileText, TrendingUp, Bell, BarChart3,
  Menu, Home, Calendar, User, LogOut, CheckCircle, AlertTriangle,
  Search, X, Settings, Globe, CreditCard, Receipt, Target,
  CheckSquare, UserCheck, FileEdit, FilePlus2, Briefcase
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import axios from 'axios';
import { API } from '../config';

const modules = [
  { id: "dashboard", path: "/", name: "Dashboard", icon: Home },
  { id: "companies", path: "/companies", name: "Clienți B2B", icon: Building2 },
  { id: "candidates", path: "/candidates", name: "Candidați B2C", icon: Users },
  { id: "immigration", path: "/immigration", name: "Dosare Imigrare", icon: FileText },
  { id: "aviz-import", path: "/import-avize", name: "Import Avize IGI", icon: FilePlus2 },
  { id: "partners", path: "/partners", name: "Parteneri", icon: Globe },
  { id: "leads", path: "/leads", name: "Leads B2B", icon: Target },
  { id: "pipeline", path: "/pipeline", name: "Pipeline Vânzări", icon: TrendingUp },
  { id: "recrutare", path: "/recrutare", name: "Recrutare & Plasare", icon: Briefcase },
  { id: "tasks", path: "/tasks", name: "Sarcini", icon: CheckSquare },
  { id: "contracts", path: "/contracts", name: "Contracte", icon: Receipt },
  { id: "payments", path: "/payments", name: "Plăți", icon: CreditCard },
  { id: "documents", path: "/documents", name: "Documente", icon: FileText },
  { id: "reports", path: "/reports", name: "Rapoarte AI", icon: BarChart3 },
  { id: "templates", path: "/templates", name: "Template-uri Doc.", icon: FileEdit },
  { id: "alerts", path: "/alerts", name: "Centru Alerte", icon: Bell },
  { id: "settings", path: "/settings", name: "Operatori & WA", icon: Settings },
];

const GlobalSearch = () => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  const doSearch = useCallback(async (q) => {
    if (!q || q.length < 2) { setResults(null); return; }
    setLoading(true);
    try {
      const res = await axios.get(`${API}/search?q=${encodeURIComponent(q)}`);
      setResults(res.data);
    } catch { setResults(null); }
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => doSearch(query), 400);
    return () => clearTimeout(t);
  }, [query, doSearch]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const total = results ? (results.candidates?.length || 0) + (results.companies?.length || 0) + (results.cases?.length || 0) : 0;

  return (
    <div className="global-search" ref={ref}>
      <div className="search-box">
        <Search size={16} className="search-icon" />
        <input
          type="text"
          placeholder="Caută global..."
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="search-input"
        />
        {query && <button className="clear-search" onClick={() => { setQuery(""); setResults(null); }}><X size={14}/></button>}
      </div>
      {open && query.length >= 2 && (
        <div className="search-dropdown">
          {loading && <div className="search-loading">Se caută...</div>}
          {!loading && results && total === 0 && <div className="search-empty">Niciun rezultat pentru „{query}"</div>}
          {!loading && results?.candidates?.length > 0 && (
            <div className="search-section">
              <div className="search-section-title">Candidați ({results.candidates.length})</div>
              {results.candidates.slice(0, 5).map(c => (
                <button key={c.id} className="search-result-item" onClick={() => { navigate("/candidates"); setOpen(false); setQuery(""); }}>
                  <Users size={14}/> {c.first_name} {c.last_name} <small>{c.nationality}</small>
                </button>
              ))}
            </div>
          )}
          {!loading && results?.companies?.length > 0 && (
            <div className="search-section">
              <div className="search-section-title">Companii ({results.companies.length})</div>
              {results.companies.slice(0, 5).map(c => (
                <button key={c.id} className="search-result-item" onClick={() => { navigate("/companies"); setOpen(false); setQuery(""); }}>
                  <Building2 size={14}/> {c.name} <small>{c.cui}</small>
                </button>
              ))}
            </div>
          )}
          {!loading && results?.cases?.length > 0 && (
            <div className="search-section">
              <div className="search-section-title">Dosare ({results.cases.length})</div>
              {results.cases.slice(0, 5).map(c => (
                <button key={c.id} className="search-result-item" onClick={() => { navigate("/immigration"); setOpen(false); setQuery(""); }}>
                  <FileText size={14}/> {c.candidate_name} — {c.company_name} <small>{c.igi_number}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const MainLayout = ({ children, notification }) => {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  const activeModulePath = location.pathname;
  const activeModule = modules.find(m => {
    if (m.path === "/") return activeModulePath === "/";
    return activeModulePath === m.path || activeModulePath.startsWith(m.path + "/");
  }) || modules[0];

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
        {sidebarOpen && (
          <div style={{ marginTop: '16px', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            Made by Global Jobs Consulting
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="main-content" data-testid="main-content">
        <header className="content-header">
          <h1>{activeModule.name}</h1>
          <div className="header-actions">
            <GlobalSearch />
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
