import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';

import { useAuth } from './hooks/useAuth';
import { MODULE_PERMISSION } from './config/permissions';
import MainLayout from './layouts/MainLayout';
import ClientLayout from './layouts/ClientLayout';
import LoadingSpinner from './components/LoadingSpinner';

// Client portal pages
import ClientDashboardPage from './pages/client/ClientDashboardPage';
import ClientJobsPage from './pages/client/ClientJobsPage';
import ClientCandidatesPage from './pages/client/ClientCandidatesPage';
import ClientDocumentsPage from './pages/client/ClientDocumentsPage';

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
import InterviewsPage from './pages/InterviewsPage';
import JobsPage from './pages/JobsPage';
import TasksPage from './pages/TasksPage';
import PlacementsPage from './pages/PlacementsPage';
import RecruitmentPage from './pages/RecruitmentPage';
import TemplatesPage from './pages/TemplatesPage';
import PassportImportPage from './pages/PassportImportPage';
import AvizImportPage from './pages/AvizImportPage';
import B2CPage from './pages/B2CPage';
import LegalPage from './pages/LegalPage';

// Component afișat când utilizatorul nu are acces la o pagină
const AccessDenied = () => (
  <div style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'60vh', gap:'16px', color:'#6b7280'}}>
    <div style={{fontSize:'4rem'}}>🔒</div>
    <h2 style={{margin:0, color:'#374151', fontSize:'1.3rem'}}>Acces restricționat</h2>
    <p style={{margin:0, fontSize:'0.95rem', textAlign:'center', maxWidth:'380px'}}>
      Nu ai permisiunea să accesezi această secțiune.<br/>
      Contactează administratorul pentru a-ți acorda accesul necesar.
    </p>
  </div>
);

// Wrapper care verifică permisiunea înainte de a randa pagina
const ProtectedPage = ({ moduleId, children }) => {
  const { hasPermission } = useAuth();
  const requiredPerm = MODULE_PERMISSION[moduleId];
  return hasPermission(requiredPerm) ? children : <AccessDenied />;
};

function App() {
  const { loading: authLoading, login, isAuthenticated, user } = useAuth();
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
      ) : user?.role === 'client' ? (
        // ===== PORTAL CLIENT =====
        <ClientLayout notification={notification}>
          <Routes>
            <Route path="/portal"            element={<ClientDashboardPage showNotification={showNotification} />} />
            <Route path="/portal/posturi"    element={<ClientJobsPage showNotification={showNotification} />} />
            <Route path="/portal/candidati"  element={<ClientCandidatesPage showNotification={showNotification} />} />
            <Route path="/portal/documente"  element={<ClientDocumentsPage showNotification={showNotification} />} />
            <Route path="*"                  element={<Navigate to="/portal" replace />} />
          </Routes>
        </ClientLayout>
      ) : (
        <MainLayout notification={notification}>
          <Routes>
            <Route path="/" element={<DashboardPage showNotification={showNotification} />} />
            <Route path="/companies"      element={<ProtectedPage moduleId="companies">   <CompaniesPage   showNotification={showNotification} /></ProtectedPage>} />
            <Route path="/candidates"     element={<ProtectedPage moduleId="candidates">  <CandidatesPage  showNotification={showNotification} /></ProtectedPage>} />
            <Route path="/immigration"    element={<ProtectedPage moduleId="immigration"> <ImmigrationPage showNotification={showNotification} /></ProtectedPage>} />
            <Route path="/import-avize"   element={<ProtectedPage moduleId="aviz-import"> <AvizImportPage  showNotification={showNotification} /></ProtectedPage>} />
            <Route path="/partners"       element={<ProtectedPage moduleId="partners">    <PartnersPage    showNotification={showNotification} /></ProtectedPage>} />
            <Route path="/pipeline"       element={<ProtectedPage moduleId="pipeline">    <PipelinePage    showNotification={showNotification} /></ProtectedPage>} />
            <Route path="/documents"      element={<ProtectedPage moduleId="documents">   <DocumentsPage   showNotification={showNotification} /></ProtectedPage>} />
            <Route path="/reports"        element={<ProtectedPage moduleId="reports">     <ReportsPage     showNotification={showNotification} /></ProtectedPage>} />
            <Route path="/alerts"         element={<ProtectedPage moduleId="alerts">      <AlertsPage      showNotification={showNotification} /></ProtectedPage>} />
            <Route path="/settings"       element={<ProtectedPage moduleId="settings">    <SettingsPage    showNotification={showNotification} /></ProtectedPage>} />
            <Route path="/contracts"      element={<ProtectedPage moduleId="contracts">   <ContractsPage   showNotification={showNotification} /></ProtectedPage>} />
            <Route path="/payments"       element={<ProtectedPage moduleId="payments">    <PaymentsPage    showNotification={showNotification} /></ProtectedPage>} />
            <Route path="/leads"          element={<ProtectedPage moduleId="leads">       <LeadsPage       showNotification={showNotification} /></ProtectedPage>} />
            <Route path="/recrutare"      element={<ProtectedPage moduleId="recrutare">   <RecruitmentPage showNotification={showNotification} /></ProtectedPage>} />
            <Route path="/tasks"          element={<ProtectedPage moduleId="tasks">       <TasksPage       showNotification={showNotification} /></ProtectedPage>} />
            <Route path="/templates"      element={<ProtectedPage moduleId="templates">   <TemplatesPage   showNotification={showNotification} /></ProtectedPage>} />
            <Route path="/import-pasapoarte" element={<ProtectedPage moduleId="imigrare_read"><PassportImportPage showNotification={showNotification} /></ProtectedPage>} />
            <Route path="/b2c"            element={<ProtectedPage moduleId="b2c">          <B2CPage         showNotification={showNotification} /></ProtectedPage>} />
            <Route path="/legal"          element={<ProtectedPage moduleId="legal">        <LegalPage       showNotification={showNotification} /></ProtectedPage>} />
            <Route path="/interviews"     element={<Navigate to="/recrutare" replace />} />
            <Route path="/jobs"           element={<Navigate to="/recrutare" replace />} />
            <Route path="/placements"     element={<Navigate to="/recrutare" replace />} />
            <Route path="*"              element={<Navigate to="/" replace />} />
          </Routes>
        </MainLayout>
      )}
    </Router>
  );
}

export default App;
