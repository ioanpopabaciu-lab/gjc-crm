import { useState, useEffect } from 'react';
import axios from 'axios';
import { API } from '../config';

export const useAuth = () => {
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

  /**
   * Verifică dacă utilizatorul curent are o anumită permisiune.
   * Admin-ul are întotdeauna acces la tot, indiferent de lista de permisiuni.
   * @param {string} perm - ex: 'candidati_read', 'imigrare_write'
   */
  const hasPermission = (perm) => {
    if (!user) return false;
    if (user.role === 'admin') return true;       // admin = acces total
    if (!perm) return true;                        // null = mereu accesibil
    return (user.permissions || []).includes(perm);
  };

  return { user, token, loading, login, logout, isAuthenticated: !!user, hasPermission };
};
