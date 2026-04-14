import React, { useState } from 'react';
import JobsPage from './JobsPage';
import InterviewsPage from './InterviewsPage';
import PlacementsPage from './PlacementsPage';

const tabs = [
  { id: 'jobs', label: 'Poziții Vacante' },
  { id: 'interviews', label: 'Interviuri' },
  { id: 'placements', label: 'Post-Plasare' },
];

const RecruitmentPage = ({ showNotification }) => {
  const [activeTab, setActiveTab] = useState('jobs');

  return (
    <div>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '2px solid var(--border-color)' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 24px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontWeight: activeTab === tab.id ? '600' : '400',
              color: activeTab === tab.id ? 'var(--primary-color, #2563eb)' : 'var(--text-secondary, #6b7280)',
              borderBottom: activeTab === tab.id ? '2px solid var(--primary-color, #2563eb)' : '2px solid transparent',
              marginBottom: '-2px',
              transition: 'all 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'jobs' && <JobsPage showNotification={showNotification} />}
      {activeTab === 'interviews' && <InterviewsPage showNotification={showNotification} />}
      {activeTab === 'placements' && <PlacementsPage showNotification={showNotification} />}
    </div>
  );
};

export default RecruitmentPage;
