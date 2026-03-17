# GJC AI-CRM - Immigration & Recruitment Management System

## 📋 Descriere Proiect

**GJC AI-CRM** este un sistem CRM complet pentru agenția de recrutare și imigrare **Global Jobs Consulting**. Aplicația gestionează:
- Clienți B2B (companii partenere)
- Candidați B2C (muncitori străini)
- Dosare de imigrare cu tracking detaliat
- Generare automată documente PDF
- Alerte pentru documente care expiră
- Validare automată CUI prin API-ul ANAF

---

## 🏗️ Arhitectura Tehnică

### Stack Tehnologic
| Component | Tehnologie | Versiune |
|-----------|------------|----------|
| **Frontend** | React.js | 18.x |
| **Backend** | FastAPI (Python) | 0.100+ |
| **Database** | MongoDB | 6.x |
| **Auth** | JWT (python-jose) | - |
| **PDF Gen** | WeasyPrint, ReportLab | - |
| **UI Components** | Lucide React, Shadcn/UI | - |
| **Styling** | CSS Custom (Light Theme) | - |

### Structura Directoare
```
/app/
├── backend/
│   ├── server.py              # API principal FastAPI (monolitic)
│   ├── pdf_generator.py       # Generare PDF-uri
│   ├── import_data.py         # Script import date Excel
│   ├── update_companies.py    # Script actualizare companii
│   ├── requirements.txt       # Dependențe Python
│   ├── uploads/               # Fișiere încărcate
│   └── .env                   # Configurare mediu
│
├── frontend/
│   ├── src/
│   │   ├── App.js             # Aplicație React principală (monolitic)
│   │   ├── App.css            # Stiluri globale
│   │   ├── index.js           # Entry point
│   │   └── components/ui/     # Componente Shadcn/UI
│   ├── package.json           # Dependențe Node.js
│   └── .env                   # Configurare mediu frontend
│
└── memory/
    └── PRD.md                 # Product Requirements Document
```

---

## 🔌 API Endpoints

### Autentificare
| Metodă | Endpoint | Descriere |
|--------|----------|-----------|
| POST | `/api/auth/login` | Login cu email/parolă, returnează JWT |
| POST | `/api/auth/register` | Înregistrare utilizator nou |
| GET | `/api/auth/me` | Obține utilizatorul curent |

### Companii (B2B Clients)
| Metodă | Endpoint | Descriere |
|--------|----------|-----------|
| GET | `/api/b2b-clients` | Lista tuturor companiilor |
| GET | `/api/companies/{id}` | Detalii companie |
| POST | `/api/companies` | Creare companie nouă |
| PUT | `/api/companies/{id}` | Actualizare companie |
| DELETE | `/api/companies/{id}` | Ștergere companie |

### Candidați (B2C)
| Metodă | Endpoint | Descriere |
|--------|----------|-----------|
| GET | `/api/b2c-candidates` | Lista tuturor candidaților |
| GET | `/api/candidates/{id}` | Detalii candidat |
| POST | `/api/candidates` | Creare candidat nou |
| PUT | `/api/candidates/{id}` | Actualizare candidat |
| DELETE | `/api/candidates/{id}` | Ștergere candidat |

### Dosare Imigrare
| Metodă | Endpoint | Descriere |
|--------|----------|-----------|
| GET | `/api/immigration-cases` | Lista tuturor dosarelor |
| GET | `/api/immigration-cases/{id}` | Detalii dosar cu documente |
| POST | `/api/immigration-cases` | Creare dosar nou |
| PUT | `/api/immigration-cases/{id}` | Actualizare dosar |
| PUT | `/api/immigration-cases/{id}/stage` | Schimbare etapă |
| PUT | `/api/immigration-cases/{id}/documents` | Actualizare documente |

### Upload Fișiere
| Metodă | Endpoint | Descriere |
|--------|----------|-----------|
| POST | `/api/immigration-cases/{case_id}/documents/{doc_key}/upload` | Upload fișier |
| GET | `/api/uploads/{filename}` | Descărcare fișier |
| DELETE | `/api/immigration-cases/{case_id}/documents/{doc_key}/file` | Ștergere fișier |

### Generare PDF
| Metodă | Endpoint | Descriere |
|--------|----------|-----------|
| GET | `/api/immigration-cases/{id}/generate-pdf/angajament` | PDF Angajament de Plată |
| GET | `/api/immigration-cases/{id}/generate-pdf/contract` | PDF Contract de Mediere |
| GET | `/api/immigration-cases/{id}/generate-pdf/oferta` | PDF Ofertă Fermă de Angajare |

### Utilități
| Metodă | Endpoint | Descriere |
|--------|----------|-----------|
| GET | `/api/stats` | Statistici dashboard |
| GET | `/api/alerts` | Alerte documente expirând |
| GET | `/api/anaf/{cui}` | Lookup CUI la ANAF |
| GET | `/api/pipeline` | Date pipeline vânzări |

---

## ⚙️ Variabile de Mediu

### Backend (.env)
```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=gjc_crm
JWT_SECRET=your-secret-key-here
CORS_ORIGINS=*
```

### Frontend (.env)
```env
REACT_APP_BACKEND_URL=http://localhost:8001
```

---

## 🚀 Instalare și Pornire Locală

### Prerequisites
- Python 3.11+
- Node.js 18+
- MongoDB 6+
- WeasyPrint dependencies (pentru PDF)

### Backend
```bash
cd backend

# Creare virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# sau: venv\Scripts\activate  # Windows

# Instalare dependențe
pip install -r requirements.txt

# Pornire server
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

### Frontend
```bash
cd frontend

# Instalare dependențe
yarn install

# Pornire development server
yarn start
```

### Import Date Inițiale
```bash
cd backend
python import_data.py
python update_companies.py
```

---

## 📊 Schema Bază de Date (MongoDB)

### Collection: `users`
```javascript
{
  "id": "uuid",
  "email": "string",
  "password_hash": "string (bcrypt)",
  "role": "admin | operator",
  "created_at": "datetime"
}
```

### Collection: `companies`
```javascript
{
  "id": "uuid",
  "name": "string",
  "cui": "string (RO12345678)",
  "city": "string",
  "industry": "string",
  "contact_person": "string",
  "phone": "string",
  "email": "string",
  "status": "activ | inactiv",
  "notes": "string",
  "created_at": "datetime"
}
```

### Collection: `candidates`
```javascript
{
  "id": "uuid",
  "first_name": "string",
  "last_name": "string",
  "nationality": "string",
  "passport_number": "string",
  "passport_expiry": "date",
  "permit_expiry": "date",
  "phone": "string",
  "email": "string",
  "job_type": "string",
  "status": "activ | plasat | inactiv",
  "company_id": "uuid (ref companies)",
  "company_name": "string",
  "notes": "string",
  "created_at": "datetime"
}
```

### Collection: `immigration_cases`
```javascript
{
  "id": "uuid",
  "candidate_id": "uuid",
  "candidate_name": "string",
  "company_id": "uuid",
  "company_name": "string",
  "case_type": "permis_munca | rezidenta | reinnoire",
  "status": "in_progress | completed | rejected",
  "current_stage": "number (1-8)",
  "current_stage_name": "string",
  "documents": {
    "candidate_docs": { /* ... */ },
    "igi_docs": { /* ... */ },
    "employer_docs": { /* ... */ },
    "itm_docs": { /* ... */ },
    "contract_docs": { /* ... */ },
    "final_docs": { /* ... */ }
  },
  "history": [
    {
      "action": "string",
      "timestamp": "datetime",
      "user": "string"
    }
  ],
  "created_at": "datetime"
}
```

### Collection: `pipeline`
```javascript
{
  "id": "uuid",
  "title": "string",
  "company_id": "uuid",
  "company_name": "string",
  "stage": "prospectare | negociere | propunere | contract | finalizat",
  "value": "number",
  "positions": "number",
  "filled": "number",
  "probability": "number (0-100)",
  "created_at": "datetime"
}
```

---

## ✅ Starea Actuală a Proiectului

### Module 100% Funcționale
- ✅ **Autentificare JWT** - Login, logout, protecție rute
- ✅ **Dashboard** - Statistici, grafice, overview
- ✅ **Clienți B2B** - CRUD complet, căutare, filtrare
- ✅ **Candidați B2C** - CRUD complet, căutare, filtrare după naționalitate
- ✅ **ANAF CUI Lookup** - Verificare și auto-completare date companie
- ✅ **Validare Automată CUI** - În timp real când se introduce CUI
- ✅ **Dosare Imigrare** - Tracker cu 8 etape, documente, statusuri
- ✅ **Upload Fișiere** - PDF, JPG, PNG pentru documente
- ✅ **Generare PDF** - 3 tipuri documente (Angajament, Contract, Ofertă)
- ✅ **Alerte Documente** - Notificări pentru pașapoarte/permise care expiră
- ✅ **Import Date Excel** - Script pentru import date reale

### Module Parțial Implementate
- 🟡 **Pipeline Vânzări** - Funcțional dar fără drag & drop
- 🟡 **Rapoarte AI** - Interfață prezentă dar fără integrare AI reală

### Module Neimplementate
- ❌ **Notificări Email** - Integrare Resend planificată
- ❌ **Export Excel** - Nu este implementat
- ❌ **SMS Notifications** - Nu este implementat
- ❌ **Automatizare Etape** - Avansare automată dosare

### Date în Baza de Date
- **315 candidați** - Date reale importate din Excel
- **37 companii** - Date reale cu CUI-uri valide
- **75 dosare imigrare** - Create pentru candidați
- **1 utilizator admin** - `ioan@gjc.ro` / `GJC2026admin`

---

## 🔐 Credențiale Test

| Rol | Email | Parolă |
|-----|-------|--------|
| Admin | ioan@gjc.ro | GJC2026admin |

---

## 📝 Note pentru Echipa de Dezvoltare

### Probleme Cunoscute
1. **Cod Monolitic**: `server.py` (1600+ linii) și `App.js` (2200+ linii) necesită refactorizare
2. **ANAF API**: Folosește `requests` sincron cu ThreadPoolExecutor (nu httpx async)

### Recomandări Refactorizare
```
backend/
├── routes/
│   ├── auth.py
│   ├── companies.py
│   ├── candidates.py
│   ├── immigration.py
│   └── uploads.py
├── models/
│   ├── user.py
│   ├── company.py
│   └── candidate.py
├── services/
│   ├── anaf_service.py
│   └── pdf_service.py
└── core/
    ├── config.py
    └── security.py

frontend/
├── pages/
│   ├── Dashboard/
│   ├── Companies/
│   ├── Candidates/
│   └── Immigration/
├── components/
│   ├── Layout/
│   ├── Forms/
│   └── Tables/
└── services/
    └── api.js
```

---

## 📄 Licență

Proprietate privată - Global Jobs Consulting © 2025
