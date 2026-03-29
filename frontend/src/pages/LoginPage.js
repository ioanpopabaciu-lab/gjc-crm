import React, { useState } from 'react';
import { Mail, Lock } from 'lucide-react';

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

export default LoginPage;
