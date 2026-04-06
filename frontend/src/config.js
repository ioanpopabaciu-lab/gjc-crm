const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost';
export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL ||
  (isLocalhost ? 'http://localhost:8001' : 'https://global-jobs-platform-production.up.railway.app');
export const API = `${BACKEND_URL}/api`;
