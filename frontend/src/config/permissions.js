// ============================================================
// SISTEM PERMISIUNI GJC CRM
// Orice modificare aici se reflectă automat în Setări + sidebar + protecție rute
// ============================================================

export const ALL_PERMISSIONS = [
  'candidati_read', 'candidati_write',
  'companii_read', 'companii_write',
  'imigrare_read', 'imigrare_write',
  'recrutare_read', 'recrutare_write',
  'sarcini_read', 'sarcini_write',
  'plati_read', 'plati_write',
  'contracte_read', 'contracte_write',
  'documente_read', 'documente_write',
  'parteneri_read', 'parteneri_write',
  'leads_read', 'leads_write',
  'pipeline_read', 'pipeline_write',
  'rapoarte_read',
  'alerte_read',
  'setari_read',
];

// Grupuri afișate în UI (checkbox-uri per modul)
export const PERMISSION_GROUPS = [
  { label: '📋 Candidați',           read: 'candidati_read',  write: 'candidati_write'  },
  { label: '🏢 Companii (B2B)',       read: 'companii_read',   write: 'companii_write'   },
  { label: '🛂 Imigrare / IGI',       read: 'imigrare_read',   write: 'imigrare_write'   },
  { label: '💼 Recrutare & Plasare',  read: 'recrutare_read',  write: 'recrutare_write'  },
  { label: '📅 Sarcini',             read: 'sarcini_read',    write: 'sarcini_write'    },
  { label: '💰 Plăți',               read: 'plati_read',      write: 'plati_write'      },
  { label: '📑 Contracte',           read: 'contracte_read',  write: 'contracte_write'  },
  { label: '📁 Documente',           read: 'documente_read',  write: 'documente_write'  },
  { label: '🌐 Parteneri',           read: 'parteneri_read',  write: 'parteneri_write'  },
  { label: '🎯 Leads B2B',           read: 'leads_read',      write: 'leads_write'      },
  { label: '📈 Pipeline Vânzări',    read: 'pipeline_read',   write: 'pipeline_write'   },
  { label: '📊 Rapoarte AI',         read: 'rapoarte_read',   write: null               },
  { label: '🔔 Centru Alerte',       read: 'alerte_read',     write: null               },
  { label: '⚙️ Setări & Operatori',  read: 'setari_read',     write: null               },
];

// Presetări rapide
export const PRESETS = {
  recrutor: {
    label: '👷 Recrutor',
    color: '#3b82f6',
    bg: '#dbeafe',
    permissions: [
      'candidati_read', 'candidati_write',
      'companii_read',
      'recrutare_read', 'recrutare_write',
      'sarcini_read', 'sarcini_write',
      'alerte_read',
    ],
  },
  asistent_igi: {
    label: '🛂 Asistent IGI',
    color: '#7c3aed',
    bg: '#ede9fe',
    permissions: [
      'imigrare_read', 'imigrare_write',
      'candidati_read',
      'sarcini_read', 'sarcini_write',
      'documente_read', 'documente_write',
      'alerte_read',
    ],
  },
  operator_plasare: {
    label: '💼 Operator Plasare',
    color: '#d97706',
    bg: '#fef3c7',
    permissions: [
      'companii_read', 'companii_write',
      'recrutare_read', 'recrutare_write',
      'candidati_read',
      'sarcini_read', 'sarcini_write',
      'contracte_read',
      'alerte_read',
    ],
  },
  admin: {
    label: '🔑 Admin (Toate)',
    color: '#dc2626',
    bg: '#fee2e2',
    permissions: ALL_PERMISSIONS,
  },
};

// Ce permisiune trebuie pentru a vedea fiecare modul din sidebar
// null = mereu vizibil (Dashboard)
export const MODULE_PERMISSION = {
  dashboard:   null,
  companies:   'companii_read',
  b2c:         'companii_read',
  candidates:  'candidati_read',
  immigration: 'imigrare_read',
  'aviz-import': 'imigrare_read',
  partners:    'parteneri_read',
  leads:       'leads_read',
  pipeline:    'pipeline_read',
  recrutare:   'recrutare_read',
  tasks:       'sarcini_read',
  contracts:   'contracte_read',
  payments:    'plati_read',
  documents:   'documente_read',
  reports:     'rapoarte_read',
  templates:   'documente_read',
  alerts:      'alerte_read',
  settings:    'setari_read',
};
