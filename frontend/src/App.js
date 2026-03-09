import React, { useState, useEffect, useCallback, useRef } from "react";
import "@/App.css";
import axios from "axios";
import {
  Users, Building2, FileText, TrendingUp, Bell, BarChart3,
  Plus, Search, Filter, ChevronRight, AlertTriangle, CheckCircle,
  Clock, MapPin, Phone, Mail, Globe, Briefcase, Calendar,
  Edit, Trash2, Eye, RefreshCw, X, Menu, Home, Settings,
  ChevronDown, ArrowUpRight, ArrowDownRight, User, Upload, Download,
  LogOut, Lock, Paperclip
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// ===================== AUTH CONTEXT =====================
const useAuth = () => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('gjc_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const savedToken = localStorage.getItem('gjc_token');
      if (savedToken) {
        try {
          const response = await axios.get(`${API}/auth/me`, {
            headers: { Authorization: `Bearer ${savedToken}` }
          });
          setUser(response.data);
          setToken(savedToken);
          axios.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
        } catch (error) {
          localStorage.removeItem('gjc_token');
          setToken(null);
          setUser(null);
        }
      }
      setLoading(false);
    };
    checkAuth();
  }, []);

  const login = async (email, password) => {
    const response = await axios.post(`${API}/auth/login`, { email, password });
    const { access_token, user: userData } = response.data;
    localStorage.setItem('gjc_token', access_token);
    setToken(access_token);
    setUser(userData);
    axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
    return userData;
  };

  const logout = () => {
    localStorage.removeItem('gjc_token');
    setToken(null);
    setUser(null);
    delete axios.defaults.headers.common['Authorization'];
  };

  return { user, token, loading, login, logout, isAuthenticated: !!user };
};

// ===================== LOGIN PAGE =====================
const LoginPage = ({ onLogin, showNotification }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      showNotification("Completează toate câmpurile", "error");
      return;
    }

    setLoading(true);
    try {
      await onLogin(email, password);
      showNotification("Autentificare reușită!");
    } catch (error) {
      showNotification(error.response?.data?.detail || "Eroare la autentificare", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page" data-testid="login-page">
      <div className="login-container">
        <div className="login-header">
          <img src="/assets/gjc-logo.png" alt="GJC Logo" className="login-logo" />
          <h1>GJC AI-CRM</h1>
          <p>Global Jobs Consulting</p>
        </div>
        
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label><Mail size={16} /> Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@gjc.ro"
              data-testid="login-email"
            />
          </div>
          <div className="form-group">
            <label><Lock size={16} /> Parolă</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              data-testid="login-password"
            />
          </div>
          <button 
            type="submit" 
            className="btn btn-primary btn-block"
            disabled={loading}
            data-testid="login-submit"
          >
            {loading ? "Se autentifică..." : "Autentificare"}
          </button>
        </form>

        <div className="login-footer">
          <p>© 2026 Global Jobs Consulting. Toate drepturile rezervate.</p>
        </div>
      </div>
    </div>
  );
};

// ===================== MAIN APP =====================
function App() {
  const { user, loading: authLoading, login, logout, isAuthenticated } = useAuth();
  const [activeModule, setActiveModule] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notification, setNotification] = useState(null);

  const showNotification = (message, type = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner-large"></div>
        <p>Se încarcă...</p>
      </div>
    );
  }

  // Show login if not authenticated
  if (!isAuthenticated) {
    return (
      <>
        {notification && (
          <div className={`notification ${notification.type}`} data-testid="notification">
            {notification.type === "success" ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
            <span>{notification.message}</span>
          </div>
        )}
        <LoginPage onLogin={login} showNotification={showNotification} />
      </>
    );
  }

  const modules = [
    { id: "dashboard", name: "Dashboard", icon: Home },
    { id: "companies", name: "Clienți B2B", icon: Building2 },
    { id: "candidates", name: "Candidați B2C", icon: Users },
    { id: "immigration", name: "Dosare Imigrare", icon: FileText },
    { id: "pipeline", name: "Pipeline Vânzări", icon: TrendingUp },
    { id: "documents", name: "Documente", icon: FileText },
    { id: "reports", name: "Rapoarte AI", icon: BarChart3 },
    { id: "alerts", name: "Centru Alerte", icon: Bell },
  ];

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
              className={`nav-item ${activeModule === module.id ? "active" : ""}`}
              onClick={() => setActiveModule(module.id)}
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
          <h1>{modules.find(m => m.id === activeModule)?.name}</h1>
          <div className="header-actions">
            <span className="date-display">
              <Calendar size={16} />
              {new Date().toLocaleDateString("ro-RO", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </span>
          </div>
        </header>

        <div className="content-body">
          {activeModule === "dashboard" && <DashboardModule showNotification={showNotification} />}
          {activeModule === "companies" && <CompaniesModule showNotification={showNotification} />}
          {activeModule === "candidates" && <CandidatesModule showNotification={showNotification} />}
          {activeModule === "immigration" && <ImmigrationModule showNotification={showNotification} />}
          {activeModule === "pipeline" && <PipelineModule showNotification={showNotification} />}
          {activeModule === "documents" && <DocumentsModule showNotification={showNotification} />}
          {activeModule === "reports" && <ReportsModule showNotification={showNotification} />}
          {activeModule === "alerts" && <AlertsModule showNotification={showNotification} />}
        </div>
      </main>
    </div>
  );
}

// ===================== DASHBOARD MODULE =====================
const DashboardModule = ({ showNotification }) => {
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

// ===================== COMPANIES MODULE =====================
const CompaniesModule = ({ showNotification }) => {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [cuiLookup, setCuiLookup] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);

  const fetchCompanies = useCallback(async () => {
    try {
      setLoading(true);
      const params = search ? `?search=${encodeURIComponent(search)}` : "";
      const response = await axios.get(`${API}/companies${params}`);
      setCompanies(response.data);
    } catch (error) {
      showNotification("Eroare la încărcarea companiilor", "error");
    } finally {
      setLoading(false);
    }
  }, [search, showNotification]);

  useEffect(() => {
    const timer = setTimeout(fetchCompanies, 300);
    return () => clearTimeout(timer);
  }, [fetchCompanies]);

  const lookupCUI = async () => {
    if (!cuiLookup) return;
    setLookupLoading(true);
    try {
      const response = await axios.get(`${API}/anaf/${cuiLookup}`);
      if (response.data.success) {
        setEditingCompany(prev => ({
          ...prev,
          name: response.data.data.name,
          cui: response.data.data.cui,
          city: response.data.data.city
        }));
        showNotification("Date ANAF preluate cu succes!");
      } else {
        showNotification("CUI negăsit în baza ANAF", "error");
      }
    } catch (error) {
      showNotification("Eroare la interogarea ANAF", "error");
    } finally {
      setLookupLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      if (editingCompany?.id) {
        await axios.put(`${API}/companies/${editingCompany.id}`, editingCompany);
        showNotification("Companie actualizată!");
      } else {
        await axios.post(`${API}/companies`, editingCompany);
        showNotification("Companie adăugată!");
      }
      setShowModal(false);
      setEditingCompany(null);
      fetchCompanies();
    } catch (error) {
      showNotification("Eroare la salvare", "error");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Sigur doriți să ștergeți această companie?")) return;
    try {
      await axios.delete(`${API}/companies/${id}`);
      showNotification("Companie ștearsă!");
      fetchCompanies();
    } catch (error) {
      showNotification("Eroare la ștergere", "error");
    }
  };

  return (
    <div className="module-container" data-testid="companies-module">
      <div className="module-toolbar">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="Caută companie, CUI, oraș..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="company-search"
          />
        </div>
        <button
          className="btn btn-primary"
          onClick={() => { setEditingCompany({}); setShowModal(true); }}
          data-testid="add-company-btn"
        >
          <Plus size={16} /> Adaugă Companie
        </button>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="data-table-container">
          <table className="data-table" data-testid="companies-table">
            <thead>
              <tr>
                <th>Companie</th>
                <th>CUI</th>
                <th>Oraș</th>
                <th>Industrie</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Acțiuni</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => (
                <tr key={company.id}>
                  <td className="company-name-cell">
                    <Building2 size={16} />
                    {company.name}
                  </td>
                  <td>{company.cui || "-"}</td>
                  <td>{company.city || "-"}</td>
                  <td>{company.industry || "-"}</td>
                  <td>
                    <div className="contact-info">
                      <span>{company.contact_person || "-"}</span>
                      {company.phone && <small><Phone size={12} /> {company.phone}</small>}
                    </div>
                  </td>
                  <td>
                    <span className={`status-badge ${company.status}`}>{company.status}</span>
                  </td>
                  <td className="actions-cell">
                    <button className="icon-btn" onClick={() => { setEditingCompany(company); setShowModal(true); }} data-testid={`edit-company-${company.id}`}>
                      <Edit size={16} />
                    </button>
                    <button className="icon-btn danger" onClick={() => handleDelete(company.id)} data-testid={`delete-company-${company.id}`}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {companies.length === 0 && (
            <div className="empty-state">
              <Building2 size={48} />
              <p>Nu există companii. Adăugați prima companie!</p>
            </div>
          )}
        </div>
      )}

      {/* Company Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} data-testid="company-modal">
            <div className="modal-header">
              <h2>{editingCompany?.id ? "Editare Companie" : "Companie Nouă"}</h2>
              <button className="close-btn" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="cui-lookup">
                <input
                  type="text"
                  placeholder="Introdu CUI pentru lookup ANAF"
                  value={cuiLookup}
                  onChange={(e) => setCuiLookup(e.target.value)}
                  data-testid="cui-lookup-input"
                />
                <button className="btn btn-secondary" onClick={lookupCUI} disabled={lookupLoading} data-testid="cui-lookup-btn">
                  {lookupLoading ? <RefreshCw size={16} className="spin" /> : <Search size={16} />}
                  Caută ANAF
                </button>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label>Nume Companie *</label>
                  <input
                    type="text"
                    value={editingCompany?.name || ""}
                    onChange={(e) => setEditingCompany({ ...editingCompany, name: e.target.value })}
                    data-testid="company-name-input"
                  />
                </div>
                <div className="form-group">
                  <label>CUI</label>
                  <input
                    type="text"
                    value={editingCompany?.cui || ""}
                    onChange={(e) => setEditingCompany({ ...editingCompany, cui: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Oraș</label>
                  <input
                    type="text"
                    value={editingCompany?.city || ""}
                    onChange={(e) => setEditingCompany({ ...editingCompany, city: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Industrie</label>
                  <select
                    value={editingCompany?.industry || ""}
                    onChange={(e) => setEditingCompany({ ...editingCompany, industry: e.target.value })}
                  >
                    <option value="">Selectează...</option>
                    <option value="Construcții">Construcții</option>
                    <option value="HoReCa">HoReCa</option>
                    <option value="Agricultură">Agricultură</option>
                    <option value="Transport">Transport</option>
                    <option value="Industrie">Industrie</option>
                    <option value="IT">IT</option>
                    <option value="Altele">Altele</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Persoană Contact</label>
                  <input
                    type="text"
                    value={editingCompany?.contact_person || ""}
                    onChange={(e) => setEditingCompany({ ...editingCompany, contact_person: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Telefon</label>
                  <input
                    type="text"
                    value={editingCompany?.phone || ""}
                    onChange={(e) => setEditingCompany({ ...editingCompany, phone: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={editingCompany?.email || ""}
                    onChange={(e) => setEditingCompany({ ...editingCompany, email: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={editingCompany?.status || "activ"}
                    onChange={(e) => setEditingCompany({ ...editingCompany, status: e.target.value })}
                  >
                    <option value="activ">Activ</option>
                    <option value="inactiv">Inactiv</option>
                    <option value="prospect">Prospect</option>
                  </select>
                </div>
              </div>
              <div className="form-group full-width">
                <label>Note</label>
                <textarea
                  value={editingCompany?.notes || ""}
                  onChange={(e) => setEditingCompany({ ...editingCompany, notes: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Anulează</button>
              <button className="btn btn-primary" onClick={handleSave} data-testid="save-company-btn">Salvează</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ===================== CANDIDATES MODULE =====================
const CandidatesModule = ({ showNotification }) => {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterNationality, setFilterNationality] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState(null);
  const [companies, setCompanies] = useState([]);

  const fetchCandidates = useCallback(async () => {
    try {
      setLoading(true);
      let params = [];
      if (search) params.push(`search=${encodeURIComponent(search)}`);
      if (filterNationality) params.push(`nationality=${encodeURIComponent(filterNationality)}`);
      const queryString = params.length > 0 ? `?${params.join("&")}` : "";
      const response = await axios.get(`${API}/candidates${queryString}`);
      setCandidates(response.data);
    } catch (error) {
      showNotification("Eroare la încărcarea candidaților", "error");
    } finally {
      setLoading(false);
    }
  }, [search, filterNationality, showNotification]);

  const fetchCompanies = async () => {
    try {
      const response = await axios.get(`${API}/companies`);
      setCompanies(response.data);
    } catch (error) {
      console.error("Error fetching companies:", error);
    }
  };

  useEffect(() => {
    const timer = setTimeout(fetchCandidates, 300);
    return () => clearTimeout(timer);
  }, [fetchCandidates]);

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleSave = async () => {
    try {
      if (editingCandidate?.id) {
        await axios.put(`${API}/candidates/${editingCandidate.id}`, editingCandidate);
        showNotification("Candidat actualizat!");
      } else {
        await axios.post(`${API}/candidates`, editingCandidate);
        showNotification("Candidat adăugat!");
      }
      setShowModal(false);
      setEditingCandidate(null);
      fetchCandidates();
    } catch (error) {
      showNotification("Eroare la salvare", "error");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Sigur doriți să ștergeți acest candidat?")) return;
    try {
      await axios.delete(`${API}/candidates/${id}`);
      showNotification("Candidat șters!");
      fetchCandidates();
    } catch (error) {
      showNotification("Eroare la ștergere", "error");
    }
  };

  const getDaysUntilExpiry = (date) => {
    if (!date) return null;
    const today = new Date();
    const expiry = new Date(date);
    const diff = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const getExpiryClass = (days) => {
    if (days === null) return "";
    if (days <= 30) return "urgent";
    if (days <= 60) return "warning";
    if (days <= 90) return "info";
    return "";
  };

  return (
    <div className="module-container" data-testid="candidates-module">
      <div className="module-toolbar">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="Caută după nume, pașaport..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="candidate-search"
          />
        </div>
        <select
          className="filter-select"
          value={filterNationality}
          onChange={(e) => setFilterNationality(e.target.value)}
          data-testid="nationality-filter"
        >
          <option value="">Toate naționalitățile</option>
          <option value="Nepal">Nepal</option>
          <option value="India">India</option>
          <option value="Filipine">Filipine</option>
          <option value="Sri Lanka">Sri Lanka</option>
          <option value="Nigeria">Nigeria</option>
        </select>
        <button
          className="btn btn-primary"
          onClick={() => { setEditingCandidate({}); setShowModal(true); }}
          data-testid="add-candidate-btn"
        >
          <Plus size={16} /> Adaugă Candidat
        </button>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="data-table-container">
          <table className="data-table" data-testid="candidates-table">
            <thead>
              <tr>
                <th>Nume</th>
                <th>Naționalitate</th>
                <th>Pașaport</th>
                <th>Expirare Pașaport</th>
                <th>Expirare Permis</th>
                <th>Job</th>
                <th>Companie</th>
                <th>Status</th>
                <th>Acțiuni</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((candidate) => {
                const passportDays = getDaysUntilExpiry(candidate.passport_expiry);
                const permitDays = getDaysUntilExpiry(candidate.permit_expiry);
                return (
                  <tr key={candidate.id}>
                    <td className="candidate-name-cell">
                      <User size={16} />
                      {candidate.first_name} {candidate.last_name}
                    </td>
                    <td>
                      <span className="nationality-badge">{candidate.nationality || "-"}</span>
                    </td>
                    <td>{candidate.passport_number || "-"}</td>
                    <td>
                      <span className={`expiry-badge ${getExpiryClass(passportDays)}`}>
                        {candidate.passport_expiry || "-"}
                        {passportDays !== null && passportDays <= 90 && (
                          <small> ({passportDays} zile)</small>
                        )}
                      </span>
                    </td>
                    <td>
                      <span className={`expiry-badge ${getExpiryClass(permitDays)}`}>
                        {candidate.permit_expiry || "-"}
                        {permitDays !== null && permitDays <= 90 && (
                          <small> ({permitDays} zile)</small>
                        )}
                      </span>
                    </td>
                    <td>{candidate.job_type || "-"}</td>
                    <td>{candidate.company_name || "-"}</td>
                    <td>
                      <span className={`status-badge ${candidate.status}`}>{candidate.status}</span>
                    </td>
                    <td className="actions-cell">
                      <button className="icon-btn" onClick={() => { setEditingCandidate(candidate); setShowModal(true); }}>
                        <Edit size={16} />
                      </button>
                      <button className="icon-btn danger" onClick={() => handleDelete(candidate.id)}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {candidates.length === 0 && (
            <div className="empty-state">
              <Users size={48} />
              <p>Nu există candidați. Adăugați primul candidat!</p>
            </div>
          )}
        </div>
      )}

      {/* Candidate Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal large" onClick={e => e.stopPropagation()} data-testid="candidate-modal">
            <div className="modal-header">
              <h2>{editingCandidate?.id ? "Editare Candidat" : "Candidat Nou"}</h2>
              <button className="close-btn" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Prenume *</label>
                  <input
                    type="text"
                    value={editingCandidate?.first_name || ""}
                    onChange={(e) => setEditingCandidate({ ...editingCandidate, first_name: e.target.value })}
                    data-testid="candidate-firstname-input"
                  />
                </div>
                <div className="form-group">
                  <label>Nume *</label>
                  <input
                    type="text"
                    value={editingCandidate?.last_name || ""}
                    onChange={(e) => setEditingCandidate({ ...editingCandidate, last_name: e.target.value })}
                    data-testid="candidate-lastname-input"
                  />
                </div>
                <div className="form-group">
                  <label>Naționalitate</label>
                  <select
                    value={editingCandidate?.nationality || ""}
                    onChange={(e) => setEditingCandidate({ ...editingCandidate, nationality: e.target.value })}
                  >
                    <option value="">Selectează...</option>
                    <option value="Nepal">Nepal</option>
                    <option value="India">India</option>
                    <option value="Filipine">Filipine</option>
                    <option value="Sri Lanka">Sri Lanka</option>
                    <option value="Nigeria">Nigeria</option>
                    <option value="Bangladesh">Bangladesh</option>
                    <option value="Pakistan">Pakistan</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Nr. Pașaport</label>
                  <input
                    type="text"
                    value={editingCandidate?.passport_number || ""}
                    onChange={(e) => setEditingCandidate({ ...editingCandidate, passport_number: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Expirare Pașaport</label>
                  <input
                    type="date"
                    value={editingCandidate?.passport_expiry || ""}
                    onChange={(e) => setEditingCandidate({ ...editingCandidate, passport_expiry: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Expirare Permis Muncă</label>
                  <input
                    type="date"
                    value={editingCandidate?.permit_expiry || ""}
                    onChange={(e) => setEditingCandidate({ ...editingCandidate, permit_expiry: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Telefon</label>
                  <input
                    type="text"
                    value={editingCandidate?.phone || ""}
                    onChange={(e) => setEditingCandidate({ ...editingCandidate, phone: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={editingCandidate?.email || ""}
                    onChange={(e) => setEditingCandidate({ ...editingCandidate, email: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Tip Job</label>
                  <select
                    value={editingCandidate?.job_type || ""}
                    onChange={(e) => setEditingCandidate({ ...editingCandidate, job_type: e.target.value })}
                  >
                    <option value="">Selectează...</option>
                    <option value="Muncitor construcții">Muncitor construcții</option>
                    <option value="Bucătar">Bucătar</option>
                    <option value="Ospătar">Ospătar</option>
                    <option value="Șofer">Șofer</option>
                    <option value="Muncitor agricol">Muncitor agricol</option>
                    <option value="Sudor">Sudor</option>
                    <option value="Electrician">Electrician</option>
                    <option value="Instalator">Instalator</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Companie</label>
                  <select
                    value={editingCandidate?.company_id || ""}
                    onChange={(e) => {
                      const comp = companies.find(c => c.id === e.target.value);
                      setEditingCandidate({
                        ...editingCandidate,
                        company_id: e.target.value,
                        company_name: comp?.name || ""
                      });
                    }}
                  >
                    <option value="">Selectează...</option>
                    {companies.map(comp => (
                      <option key={comp.id} value={comp.id}>{comp.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={editingCandidate?.status || "activ"}
                    onChange={(e) => setEditingCandidate({ ...editingCandidate, status: e.target.value })}
                  >
                    <option value="activ">Activ</option>
                    <option value="în procesare">În procesare</option>
                    <option value="plasat">Plasat</option>
                    <option value="inactiv">Inactiv</option>
                  </select>
                </div>
              </div>
              <div className="form-group full-width">
                <label>Note</label>
                <textarea
                  value={editingCandidate?.notes || ""}
                  onChange={(e) => setEditingCandidate({ ...editingCandidate, notes: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Anulează</button>
              <button className="btn btn-primary" onClick={handleSave} data-testid="save-candidate-btn">Salvează</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ===================== IMMIGRATION MODULE =====================
const ImmigrationModule = ({ showNotification }) => {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stages, setStages] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [newCase, setNewCase] = useState({});
  const [candidates, setCandidates] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [activeTab, setActiveTab] = useState("documents");

  const fetchCases = useCallback(async () => {
    try {
      setLoading(true);
      const [casesRes, stagesRes, candidatesRes] = await Promise.all([
        axios.get(`${API}/immigration`),
        axios.get(`${API}/immigration/stages`),
        axios.get(`${API}/candidates`)
      ]);
      setCases(casesRes.data);
      setStages(stagesRes.data.stages);
      setCandidates(candidatesRes.data);
    } catch (error) {
      showNotification("Eroare la încărcarea dosarelor", "error");
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  const fetchCaseDetails = async (caseId) => {
    try {
      const response = await axios.get(`${API}/immigration/${caseId}`);
      setSelectedCase(response.data);
      setActiveTab("documents");
    } catch (error) {
      showNotification("Eroare la încărcarea detaliilor", "error");
    }
  };

  const advanceCase = async (caseId) => {
    try {
      const response = await axios.patch(`${API}/immigration/${caseId}/advance`);
      showNotification(response.data.message);
      fetchCases();
      if (selectedCase?.id === caseId) {
        fetchCaseDetails(caseId);
      }
    } catch (error) {
      showNotification(error.response?.data?.detail || "Eroare la avansare", "error");
    }
  };

  const updateDocument = async (category, docId, status, issueDate, expiryDate) => {
    if (!selectedCase) return;
    try {
      await axios.patch(`${API}/immigration/${selectedCase.id}/document`, {
        category,
        doc_id: docId,
        status,
        issue_date: issueDate,
        expiry_date: expiryDate
      });
      showNotification("Document actualizat!");
      fetchCaseDetails(selectedCase.id);
    } catch (error) {
      showNotification("Eroare la actualizare", "error");
    }
  };

  const handleSave = async () => {
    try {
      await axios.post(`${API}/immigration`, newCase);
      showNotification("Dosar creat!");
      setShowModal(false);
      setNewCase({});
      fetchCases();
    } catch (error) {
      showNotification("Eroare la salvare", "error");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Sigur doriți să ștergeți acest dosar?")) return;
    try {
      await axios.delete(`${API}/immigration/${id}`);
      showNotification("Dosar șters!");
      if (selectedCase?.id === id) setSelectedCase(null);
      fetchCases();
    } catch (error) {
      showNotification("Eroare la ștergere", "error");
    }
  };

  const getDocStatusIcon = (status) => {
    switch (status) {
      case 'present': return <span className="doc-check check-yes">✓</span>;
      case 'expiring': return <span className="doc-check check-alert">!</span>;
      case 'expired': return <span className="doc-check check-expired">✗</span>;
      default: return <span className="doc-check check-no">○</span>;
    }
  };

  const getDaysUntilExpiry = (dateStr) => {
    if (!dateStr) return null;
    const expiry = new Date(dateStr);
    const today = new Date();
    const diff = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const handleFileUpload = async (category, docId, file) => {
    if (!selectedCase || !file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      await axios.post(
        `${API}/upload/document/${selectedCase.id}/${category}/${docId}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      showNotification(`Fișier încărcat: ${file.name}`);
      fetchCaseDetails(selectedCase.id);
    } catch (error) {
      showNotification(error.response?.data?.detail || "Eroare la încărcare", "error");
    }
  };

  const downloadFile = (filename) => {
    window.open(`${API}/upload/document/${filename}`, '_blank');
  };

  const deleteFile = async (category, docId) => {
    if (!selectedCase) return;
    if (!window.confirm("Sigur doriți să ștergeți acest fișier?")) return;
    
    try {
      await axios.delete(`${API}/upload/document/${selectedCase.id}/${category}/${docId}`);
      showNotification("Fișier șters!");
      fetchCaseDetails(selectedCase.id);
    } catch (error) {
      showNotification("Eroare la ștergere", "error");
    }
  };

  // File upload input ref component
  const FileUploadButton = ({ category, docId, hasFile }) => {
    const fileInputRef = useRef(null);
    
    const handleClick = () => {
      if (hasFile) {
        // Show options - view/delete
        return;
      }
      fileInputRef.current?.click();
    };
    
    return (
      <>
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept=".pdf,.jpg,.jpeg,.png,.gif"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileUpload(category, docId, file);
            e.target.value = '';
          }}
        />
        <button 
          className={`icon-btn small ${hasFile ? 'has-file' : ''}`} 
          onClick={handleClick}
          title={hasFile ? "Fișier atașat" : "Încarcă fișier"}
        >
          {hasFile ? <Paperclip size={14} /> : <Upload size={14} />}
        </button>
      </>
    );
  };

  // Case List View
  if (!selectedCase) {
    return (
      <div className="module-container" data-testid="immigration-module">
        <div className="module-toolbar">
          <div className="stages-legend">
            {stages.slice(0, 4).map((stage, idx) => (
              <span key={idx} className="stage-chip">{idx + 1}. {stage}</span>
            ))}
            {stages.length > 4 && <span className="stage-chip more">+{stages.length - 4} etape</span>}
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)} data-testid="add-case-btn">
            <Plus size={16} /> Dosar Nou
          </button>
        </div>

        {loading ? <LoadingSpinner /> : (
          <div className="immigration-grid">
            {cases.map((caseItem) => (
              <div key={caseItem.id} className="case-card" data-testid={`case-${caseItem.id}`}>
                <div className="case-header">
                  <span className={`case-type ${caseItem.case_type?.toLowerCase().replace(/ /g, "-")}`}>
                    {caseItem.case_type}
                  </span>
                  <span className={`case-status ${caseItem.status}`}>{caseItem.status}</span>
                </div>
                <div className="case-body">
                  <h4>{caseItem.candidate_name}</h4>
                  <p className="company">{caseItem.company_name}</p>
                  <div className="stage-progress">
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${(caseItem.current_stage / stages.length) * 100}%` }} />
                    </div>
                    <span className="stage-text">
                      Etapa {caseItem.current_stage}/{stages.length}: {stages[caseItem.current_stage - 1] || caseItem.current_stage_name}
                    </span>
                  </div>
                </div>
                <div className="case-actions">
                  <button className="btn btn-secondary" onClick={() => fetchCaseDetails(caseItem.id)} data-testid={`view-case-${caseItem.id}`}>
                    <Eye size={16} /> Deschide
                  </button>
                  {caseItem.current_stage < stages.length && (
                    <button className="btn btn-success" onClick={() => advanceCase(caseItem.id)} data-testid={`advance-${caseItem.id}`}>
                      <ChevronRight size={16} /> Avansează
                    </button>
                  )}
                  <button className="icon-btn danger" onClick={() => handleDelete(caseItem.id)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
            {cases.length === 0 && (
              <div className="empty-state full-width">
                <FileText size={48} />
                <p>Nu există dosare de imigrare. Creați primul dosar!</p>
              </div>
            )}
          </div>
        )}

        {/* New Case Modal */}
        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} data-testid="immigration-modal">
              <div className="modal-header">
                <h2>Dosar Nou Imigrare</h2>
                <button className="close-btn" onClick={() => setShowModal(false)}><X size={20} /></button>
              </div>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label>Candidat *</label>
                    <select
                      value={newCase.candidate_id || ""}
                      onChange={(e) => {
                        const cand = candidates.find(c => c.id === e.target.value);
                        setNewCase({
                          ...newCase,
                          candidate_id: e.target.value,
                          candidate_name: cand ? `${cand.first_name} ${cand.last_name}` : "",
                          company_id: cand?.company_id,
                          company_name: cand?.company_name,
                          passport_expiry: cand?.passport_expiry,
                          permit_expiry: cand?.permit_expiry
                        });
                      }}
                      data-testid="case-candidate-select"
                    >
                      <option value="">Selectează candidat...</option>
                      {candidates.map(cand => (
                        <option key={cand.id} value={cand.id}>{cand.first_name} {cand.last_name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Tip Dosar *</label>
                    <select
                      value={newCase.case_type || "Permis de muncă"}
                      onChange={(e) => setNewCase({ ...newCase, case_type: e.target.value })}
                      data-testid="case-type-select"
                    >
                      <option value="Permis de muncă">Permis de muncă</option>
                      <option value="Viză de lungă ședere">Viză de lungă ședere</option>
                      <option value="Reînnoire permis">Reînnoire permis</option>
                      <option value="Reunificare familială">Reunificare familială</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Data Depunere</label>
                    <input type="date" value={newCase.submitted_date || ""} onChange={(e) => setNewCase({ ...newCase, submitted_date: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Responsabil</label>
                    <input type="text" value={newCase.assigned_to || "Ioan Baciu"} onChange={(e) => setNewCase({ ...newCase, assigned_to: e.target.value })} />
                  </div>
                </div>
                <div className="form-group full-width">
                  <label>Note</label>
                  <textarea value={newCase.notes || ""} onChange={(e) => setNewCase({ ...newCase, notes: e.target.value })} rows={3} />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Anulează</button>
                <button className="btn btn-primary" onClick={handleSave} data-testid="save-case-btn">Creează Dosar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Case Detail View (Tracker Style)
  const caseData = selectedCase;
  const candidateDetails = caseData.candidate_details || {};
  const companyDetails = caseData.company_details || {};
  const passportDays = getDaysUntilExpiry(candidateDetails.passport_expiry || caseData.passport_expiry);
  const permitDays = getDaysUntilExpiry(caseData.permit_expiry);

  return (
    <div className="module-container case-tracker" data-testid="case-tracker">
      {/* Alert Bar */}
      {passportDays !== null && passportDays <= 90 && (
        <div className={`alert-bar ${passportDays <= 30 ? 'critical' : 'warning'}`}>
          <span className="alert-icon">🚨</span>
          <div className="alert-text">
            <strong>ATENȚIE:</strong> Pașaportul candidatului <strong>{caseData.candidate_name}</strong> 
            {passportDays <= 0 ? ` a expirat de ${Math.abs(passportDays)} zile` : ` expiră în ${passportDays} zile`}.
            {passportDays <= 30 && " Inițiați procedura de reînnoire imediat."}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="tracker-header">
        <button className="btn btn-ghost back-btn" onClick={() => setSelectedCase(null)} data-testid="back-to-list">
          <ChevronRight size={16} style={{ transform: 'rotate(180deg)' }} /> Înapoi la listă
        </button>
        
        <div className="candidate-header">
          <div className="big-avatar" data-testid="candidate-avatar">
            {(candidateDetails.first_name?.[0] || caseData.candidate_name?.[0] || 'C').toUpperCase()}
            {(candidateDetails.last_name?.[0] || caseData.candidate_name?.split(' ')[1]?.[0] || '').toUpperCase()}
          </div>
          <div className="candidate-info">
            <h2>{caseData.candidate_name}</h2>
            <div className="candidate-meta">
              <span className="meta-item"><Globe size={14} /> {candidateDetails.nationality || 'Nepal'}</span>
              <span className="meta-item"><Building2 size={14} /> {caseData.company_name}</span>
              <span className="meta-item"><Briefcase size={14} /> {candidateDetails.job_type || 'Muncitor'}</span>
              <span className="meta-item"><FileText size={14} /> {candidateDetails.passport_number || '-'}</span>
              {passportDays !== null && passportDays <= 90 && (
                <span className={`meta-item ${passportDays <= 30 ? 'urgent' : 'warning'}`}>
                  <AlertTriangle size={14} /> Pașaport {passportDays <= 0 ? 'expirat' : `expiră ${candidateDetails.passport_expiry || caseData.passport_expiry}`}
                </span>
              )}
            </div>
          </div>
          <div className="candidate-actions">
            <button className="btn btn-outline"><FileText size={16} /> Export PDF</button>
            <button className="btn btn-outline"><Mail size={16} /> Trimite Email</button>
            {caseData.current_stage < stages.length && (
              <button className="btn btn-primary" onClick={() => advanceCase(caseData.id)}>
                <ChevronRight size={16} /> Avansează Etapa
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Documente Bifate</div>
          <div className="stat-value green">{caseData.documents_complete || 0}<span className="stat-sub-value">/{caseData.documents_total || 34}</span></div>
          <div className="stat-sub">{caseData.completion_percentage || 0}% complet</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Etapă Curentă</div>
          <div className="stat-value blue" style={{ fontSize: '16px' }}>{caseData.current_stage_name || stages[caseData.current_stage - 1]}</div>
          <div className="stat-sub">Etapa {caseData.current_stage} din {stages.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Zile până Exp. Pașaport</div>
          <div className={`stat-value ${passportDays <= 30 ? 'red' : passportDays <= 90 ? 'orange' : 'green'}`}>
            {passportDays !== null ? (passportDays <= 0 ? 'EXPIRAT' : passportDays) : '-'}
          </div>
          <div className="stat-sub">{candidateDetails.passport_expiry || caseData.passport_expiry || '-'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Permis Ședere</div>
          <div className={`stat-value ${permitDays && permitDays <= 90 ? 'orange' : 'green'}`}>
            {permitDays !== null ? (permitDays <= 0 ? 'EXPIRAT' : permitDays) : '-'}
          </div>
          <div className="stat-sub">{caseData.permit_expiry || 'Nedefinit'}</div>
        </div>
      </div>

      {/* Pipeline Progress */}
      <div className="pipeline-card">
        <div className="section-title">Progres Dosar Imigrare</div>
        <div className="immigration-pipeline">
          {stages.map((stage, idx) => {
            const stageNum = idx + 1;
            const isDone = caseData.current_stage > stageNum;
            const isActive = caseData.current_stage === stageNum;
            return (
              <div key={idx} className={`pipe-step ${isDone ? 'done' : isActive ? 'active' : 'pending'}`}>
                <div className="pipe-dot">{isDone ? '✓' : stageNum}</div>
                <div className="pipe-label">{stage.replace(' ', '\n')}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <div className="tracker-tabs">
        <button className={`tab ${activeTab === 'documents' ? 'active' : ''}`} onClick={() => setActiveTab('documents')}>
          📋 Documente Dosar
        </button>
        <button className={`tab ${activeTab === 'company' ? 'active' : ''}`} onClick={() => setActiveTab('company')}>
          🏢 Acte Companie
        </button>
        <button className={`tab ${activeTab === 'personal' ? 'active' : ''}`} onClick={() => setActiveTab('personal')}>
          👤 Date Personale
        </button>
        <button className={`tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
          📜 Istoric
        </button>
      </div>

      {/* Tab Content: Documents */}
      {activeTab === 'documents' && (
        <div className="tab-content" data-testid="documents-tab">
          <div className="legend">
            <div className="legend-item"><div className="legend-dot green"></div> Document la dosar</div>
            <div className="legend-item"><div className="legend-dot gray"></div> Lipsă / neobținut</div>
            <div className="legend-item"><div className="legend-dot orange"></div> Expiră în 90 zile</div>
            <div className="legend-item"><div className="legend-dot red"></div> Expirat / Critic</div>
            <div className="legend-note">* = Obligatoriu</div>
          </div>

          <div className="doc-grid">
            {caseData.documents && Object.entries(caseData.documents)
              .filter(([key]) => key !== 'company')
              .map(([category, catData]) => {
                const completeDocs = catData.docs?.filter(d => d.status === 'present' || d.status === 'expiring').length || 0;
                const totalDocs = catData.docs?.filter(d => d.required).length || 0;
                
                return (
                  <div key={category} className="doc-section" data-testid={`doc-section-${category}`}>
                    <div className="doc-section-header">
                      <div className="doc-section-title">
                        <span className="section-icon">{catData.icon}</span> {catData.title}
                      </div>
                      <span className={`section-badge ${completeDocs === totalDocs ? 'green' : completeDocs > 0 ? 'orange' : 'gray'}`}>
                        {completeDocs}/{totalDocs}
                      </span>
                    </div>
                    <div className="doc-list">
                      {catData.docs?.map((doc) => {
                        const expiryDays = getDaysUntilExpiry(doc.expiry_date);
                        const hasFile = !!doc.file_path;
                        return (
                          <div key={doc.id} className={`doc-row ${hasFile ? 'has-attachment' : ''}`} data-testid={`doc-${doc.id}`}>
                            <div 
                              className="doc-check-wrapper"
                              onClick={() => updateDocument(category, doc.id, doc.status === 'present' ? 'missing' : 'present', doc.issue_date, doc.expiry_date)}
                              style={{ cursor: 'pointer' }}
                            >
                              {getDocStatusIcon(doc.status)}
                            </div>
                            <div className="doc-name">
                              {doc.name}
                              {doc.required && <span className="required">*</span>}
                              {hasFile && (
                                <span className="file-indicator" title={doc.file_name}>
                                  <Paperclip size={12} />
                                </span>
                              )}
                            </div>
                            <div className="doc-date">
                              {doc.issue_date || (doc.has_expiry ? <input type="date" className="date-input" placeholder="dată emitere" onChange={(e) => updateDocument(category, doc.id, 'present', e.target.value, doc.expiry_date)} /> : '—')}
                            </div>
                            <div className={`doc-date ${expiryDays && expiryDays <= 30 ? 'date-expired' : expiryDays && expiryDays <= 90 ? 'date-warning' : 'date-ok'}`}>
                              {doc.expiry_date ? (
                                <>
                                  {doc.expiry_date} 
                                  {expiryDays <= 0 ? ' ✗' : expiryDays <= 90 ? ' ⚠' : ' ✓'}
                                </>
                              ) : (doc.has_expiry ? <input type="date" className="date-input" placeholder="dată expirare" onChange={(e) => updateDocument(category, doc.id, 'present', doc.issue_date, e.target.value)} /> : 'fără expirare')}
                            </div>
                            <div className="doc-actions">
                              {hasFile ? (
                                <>
                                  <button className="icon-btn small success" onClick={() => downloadFile(doc.file_path)} title="Descarcă fișier">
                                    <Download size={14} />
                                  </button>
                                  <button className="icon-btn small danger" onClick={() => deleteFile(category, doc.id)} title="Șterge fișier">
                                    <Trash2 size={14} />
                                  </button>
                                </>
                              ) : (
                                <FileUploadButton category={category} docId={doc.id} hasFile={hasFile} />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Tab Content: Company Documents */}
      {activeTab === 'company' && (
        <div className="tab-content" data-testid="company-tab">
          {caseData.documents?.company && (
            <div className="doc-section full-width">
              <div className="doc-section-header">
                <div className="doc-section-title">
                  <span className="section-icon">{caseData.documents.company.icon}</span> 
                  {caseData.documents.company.title} — {companyDetails.name || caseData.company_name}
                  {companyDetails.cui && <span className="cui-badge">CUI: {companyDetails.cui}</span>}
                </div>
              </div>
              <div className="doc-list two-columns">
                {caseData.documents.company.docs?.map((doc) => {
                  const expiryDays = getDaysUntilExpiry(doc.expiry_date);
                  return (
                    <div key={doc.id} className="doc-row" data-testid={`doc-${doc.id}`}>
                      <div 
                        className="doc-check-wrapper"
                        onClick={() => updateDocument('company', doc.id, doc.status === 'present' ? 'missing' : 'present', doc.issue_date, doc.expiry_date)}
                        style={{ cursor: 'pointer' }}
                      >
                        {getDocStatusIcon(doc.status)}
                      </div>
                      <div className="doc-name">
                        {doc.name}
                        {doc.required && <span className="required">*</span>}
                      </div>
                      <div className="doc-date">{doc.issue_date || '—'}</div>
                      <div className={`doc-date ${expiryDays && expiryDays <= 0 ? 'date-expired' : expiryDays && expiryDays <= 30 ? 'date-warning' : ''}`}>
                        {doc.expiry_date || (doc.has_expiry ? 'necesită dată' : '—')}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Personal Info */}
      {activeTab === 'personal' && (
        <div className="tab-content" data-testid="personal-tab">
          <div className="personal-info-section">
            <div className="section-header">
              <h3>👤 Date Personale Candidat</h3>
            </div>
            <div className="info-grid">
              <div className="info-item">
                <label>Nume</label>
                <input type="text" value={candidateDetails.first_name || caseData.candidate_name?.split(' ')[0] || ''} readOnly />
              </div>
              <div className="info-item">
                <label>Prenume</label>
                <input type="text" value={candidateDetails.last_name || caseData.candidate_name?.split(' ').slice(1).join(' ') || ''} readOnly />
              </div>
              <div className="info-item">
                <label>Naționalitate</label>
                <input type="text" value={candidateDetails.nationality || 'Nepal'} readOnly />
              </div>
              <div className="info-item">
                <label>Ocupație / Meserie</label>
                <input type="text" value={candidateDetails.job_type || '-'} readOnly />
              </div>
              <div className="info-item">
                <label>Nr. Pașaport</label>
                <input type="text" value={candidateDetails.passport_number || '-'} readOnly />
              </div>
              <div className="info-item">
                <label>Pașaport Expiră</label>
                <input type="text" value={candidateDetails.passport_expiry || caseData.passport_expiry || '-'} readOnly className={passportDays && passportDays <= 90 ? 'warning' : ''} />
              </div>
              <div className="info-item">
                <label>Telefon</label>
                <input type="text" value={candidateDetails.phone || '-'} readOnly />
              </div>
              <div className="info-item">
                <label>Email</label>
                <input type="text" value={candidateDetails.email || '-'} readOnly />
              </div>
              <div className="info-item full-width">
                <label>Companie Angajatoare</label>
                <input type="text" value={`${companyDetails.name || caseData.company_name} ${companyDetails.cui ? `— CUI ${companyDetails.cui}` : ''}`} readOnly />
              </div>
              <div className="info-item full-width">
                <label>Note dosar</label>
                <textarea rows={3} value={caseData.notes || ''} readOnly placeholder="Observații, note speciale..." />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content: History */}
      {activeTab === 'history' && (
        <div className="tab-content" data-testid="history-tab">
          <div className="history-section">
            <div className="section-header">
              <h3>📜 Istoric Acțiuni Dosar</h3>
            </div>
            <div className="history-list">
              {(caseData.history || []).map((item, idx) => (
                <div key={idx} className="history-item">
                  <span className="history-icon">{item.icon || '⚪'}</span>
                  <span className="history-date">{item.date}</span>
                  <span className="history-action">{item.action}</span>
                  <span className="history-user">{item.user}</span>
                </div>
              ))}
              {(!caseData.history || caseData.history.length === 0) && (
                <div className="empty-state">
                  <p>Nu există istoric pentru acest dosar.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ===================== PIPELINE MODULE =====================
const PipelineModule = ({ showNotification }) => {
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(true);

  const pipelineStages = [
    { id: "lead", name: "Lead", color: "#6b7280" },
    { id: "contact", name: "Contact", color: "#3b82f6" },
    { id: "negociere", name: "Negociere", color: "#f59e0b" },
    { id: "contract", name: "Contract", color: "#8b5cf6" },
    { id: "câștigat", name: "Câștigat", color: "#10b981" }
  ];

  const fetchPipeline = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/pipeline`);
      setOpportunities(response.data);
    } catch (error) {
      showNotification("Eroare la încărcarea pipeline-ului", "error");
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    fetchPipeline();
  }, [fetchPipeline]);

  const moveOpportunity = async (oppId, newStage) => {
    try {
      await axios.put(`${API}/pipeline/${oppId}`, { stage: newStage });
      showNotification("Oportunitate actualizată!");
      fetchPipeline();
    } catch (error) {
      showNotification("Eroare la actualizare", "error");
    }
  };

  const getStageTotal = (stageId) => {
    return opportunities
      .filter(o => o.stage === stageId)
      .reduce((sum, o) => sum + (o.value * (o.probability / 100)), 0);
  };

  return (
    <div className="module-container pipeline-module" data-testid="pipeline-module">
      {loading ? <LoadingSpinner /> : (
        <div className="pipeline-board">
          {pipelineStages.map((stage) => (
            <div key={stage.id} className="pipeline-column" data-testid={`stage-${stage.id}`}>
              <div className="column-header" style={{ borderColor: stage.color }}>
                <h3>{stage.name}</h3>
                <span className="column-total">€{getStageTotal(stage.id).toLocaleString()}</span>
              </div>
              <div className="column-body">
                {opportunities
                  .filter(o => o.stage === stage.id)
                  .map((opp) => (
                    <div key={opp.id} className="opportunity-card">
                      <h4>{opp.title}</h4>
                      <p className="company">{opp.company_name}</p>
                      <div className="opp-details">
                        <span className="value">€{opp.value.toLocaleString()}</span>
                        <span className="probability">{opp.probability}%</span>
                      </div>
                      <div className="positions-bar">
                        <div className="filled" style={{ width: `${(opp.filled / opp.positions) * 100}%` }} />
                        <span>{opp.filled}/{opp.positions} poziții</span>
                      </div>
                      <div className="opp-actions">
                        {pipelineStages.map((s, idx) => (
                          s.id !== stage.id && (
                            <button
                              key={s.id}
                              className="move-btn"
                              onClick={() => moveOpportunity(opp.id, s.id)}
                              title={`Mută la ${s.name}`}
                            >
                              {idx > pipelineStages.findIndex(ps => ps.id === stage.id) ? (
                                <ArrowUpRight size={14} />
                              ) : (
                                <ArrowDownRight size={14} />
                              )}
                            </button>
                          )
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ===================== DOCUMENTS MODULE =====================
const DocumentsModule = ({ showNotification }) => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/documents`);
      setDocuments(response.data);
    } catch (error) {
      showNotification("Eroare la încărcarea documentelor", "error");
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  return (
    <div className="module-container" data-testid="documents-module">
      <div className="module-toolbar">
        <h3>Gestionare Documente</h3>
        <button className="btn btn-primary" data-testid="upload-doc-btn">
          <Plus size={16} /> Upload Document
        </button>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="documents-grid">
          {documents.length === 0 ? (
            <div className="empty-state">
              <FileText size={48} />
              <p>Nu există documente încărcate.</p>
              <small>Modulul de upload va fi disponibil în versiunea completă.</small>
            </div>
          ) : (
            documents.map(doc => (
              <div key={doc.id} className="document-card">
                <FileText size={32} />
                <h4>{doc.file_name}</h4>
                <span className="doc-type">{doc.doc_type}</span>
                <span className="doc-expiry">{doc.expiry_date || "N/A"}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

// ===================== REPORTS MODULE =====================
const ReportsModule = ({ showNotification }) => {
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

// ===================== ALERTS MODULE =====================
const AlertsModule = ({ showNotification }) => {
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

// ===================== SHARED COMPONENTS =====================
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

const LoadingSpinner = () => (
  <div className="loading-spinner" data-testid="loading-spinner">
    <RefreshCw className="spin" size={32} />
    <span>Se încarcă...</span>
  </div>
);

export default App;
