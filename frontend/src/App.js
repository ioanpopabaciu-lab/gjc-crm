import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import '@/App.css';

import { useAuth } from './hooks/useAuth';
import MainLayout from './layouts/MainLayout';
import LoadingSpinner from './components/LoadingSpinner';

// Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CompaniesPage from './pages/CompaniesPage';
import CandidatesPage from './pages/CandidatesPage';
import ImmigrationPage from './pages/ImmigrationPage';
import PipelinePage from './pages/PipelinePage';
import DocumentsPage from './pages/DocumentsPage';
import ReportsPage from './pages/ReportsPage';
import AlertsPage from './pages/AlertsPage';
import SettingsPage from './pages/SettingsPage';
import PartnersPage from './pages/PartnersPage';
import ContractsPage from './pages/ContractsPage';
import PaymentsPage from './pages/PaymentsPage';
import LeadsPage from './pages/LeadsPage';

function App() {
  const { loading: authLoading, login, isAuthenticated } = useAuth();
  const [notification, setNotification] = useState(null);

  const showNotification = (message, type = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="loading-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <Router>
      {!isAuthenticated ? (
        <Routes>
          <Route 
            path="*" 
            element={<LoginPage onLogin={login} showNotification={showNotification} />} 
          />
        </Routes>
      ) : (
        <MainLayout notification={notification}>
          <Routes>
            <Route path="/" element={<DashboardPage showNotification={showNotification} />} />
            <Route path="/companies" element={<CompaniesPage showNotification={showNotification} />} />
            <Route path="/candidates" element={<CandidatesPage showNotification={showNotification} />} />
            <Route path="/immigration" element={<ImmigrationPage showNotification={showNotification} />} />
            <Route path="/partners" element={<PartnersPage showNotification={showNotification} />} />
            <Route path="/pipeline" element={<PipelinePage showNotification={showNotification} />} />
            <Route path="/documents" element={<DocumentsPage showNotification={showNotification} />} />
            <Route path="/reports" element={<ReportsPage showNotification={showNotification} />} />
            <Route path="/alerts" element={<AlertsPage showNotification={showNotification} />} />
            <Route path="/settings" element={<SettingsPage showNotification={showNotification} />} />
            <Route path="/contracts" element={<ContractsPage showNotification={showNotification} />} />
            <Route path="/payments" element={<PaymentsPage showNotification={showNotification} />} />
            <Route path="/leads" element={<LeadsPage showNotification={showNotification} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </MainLayout>
      )}
    </Router>
  );
}

export default App;
