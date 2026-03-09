# GJC AI-CRM - Product Requirements Document

## Overview
**Project Name:** GJC AI-CRM (Global Jobs Consulting CRM)
**Purpose:** CRM system for a Romanian recruitment and immigration agency
**Tech Stack:** React (Frontend) + FastAPI (Backend) + MongoDB (Database)
**Last Updated:** 2025-03-09

## Original Problem Statement
Build a CRM application for Global Jobs Consulting (GJC), a recruitment and immigration agency. The system manages:
- B2B clients (partner companies)
- B2C candidates (foreign workers, primarily from Nepal, Nigeria, India, Philippines)
- Immigration cases with detailed document tracking
- Document management with file uploads and expiry alerts
- PDF document generation
- Sales pipeline

## User Language
**Romanian** - All UI elements and communications in Romanian.

---

## Implemented Features ✅

### 1. Authentication (JWT) ✅
- Login page with email/password
- JWT tokens with 24h expiration
- Role-based access (admin/operator)
- Default admin: `ioan@gjc.ro` / `GJC2026admin`
- Logout functionality in sidebar

### 2. Document Upload ✅
- Upload PDF, JPG, PNG, GIF files (max 10MB)
- File storage in /backend/uploads/
- Attachment indicator (📎) on documents
- Download and delete functionality

### 3. PDF Generation ✅ NEW
- **Angajament de Plată** - Payment commitment document
- **Contract de Mediere** - Mediation contract between parties
- **Ofertă Fermă de Angajare** - Firm job offer from employer
- All documents auto-populated with candidate/company data
- Professional layout with GJC branding
- Dropdown menu in case tracker for easy access

### 4. Immigration Cases Tracker ✅
- 8-stage visual pipeline (Recrutat → Permis Ședere)
- 4 Tabs: Documente Dosar, Acte Companie, Date Personale, Istoric
- 34+ documents organized in 6 categories
- File upload per document
- PDF generation buttons

### 5. Dashboard, Companies, Candidates, Alerts ✅
- All modules fully functional
- 315 candidates, 37 companies imported

---

## API Endpoints

### PDF Generation (NEW)
- `GET /api/pdf/angajament-plata/{case_id}` - Generate payment commitment PDF
- `GET /api/pdf/contract-mediere/{case_id}` - Generate mediation contract PDF
- `GET /api/pdf/oferta-angajare/{case_id}` - Generate job offer PDF

### Authentication
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### File Upload
- `POST /api/upload/document/{case_id}/{category}/{doc_id}` - Upload
- `GET /api/upload/document/{filename}` - Download
- `DELETE /api/upload/document/{case_id}/{category}/{doc_id}` - Delete

---

## Default Credentials
- **Admin:** `ioan@gjc.ro` / `GJC2026admin`

---

## Recently Fixed ✅

### ANAF CUI Lookup (Fixed 2025-03-09) ✅
- Fixed async/sync compatibility issue
- Now uses `requests` library with `ThreadPoolExecutor` instead of `httpx`
- Successfully fetches company data from Romanian ANAF API
- Auto-fills company form fields (name, CUI, address, city, TVA status)

### CUI Auto-Validation (Added 2025-03-09) ✅
- Automatic CUI validation when typing in company form
- Uses debounce (800ms) to avoid excessive API calls
- Visual indicators:
  - ✅ Green border + checkmark + company name for valid CUIs
  - ❌ Red border + X icon + error message for invalid CUIs
  - 🔄 Loading spinner while validating

---

## Pending Tasks

### P1 - Medium Priority  
- [ ] **Resend Email Integration** - Notifications when case status changes

### P2 - Lower Priority
- [ ] **Refactoring** - Break down monolithic `server.py` and `App.js`

### P3 - Future
- [ ] Export reports to Excel
- [ ] SMS notifications (Twilio)
- [ ] Automated stage advancement

---

## Files Created
```
/app/backend/
├── server.py          # FastAPI with auth, upload, PDF endpoints
├── pdf_generator.py   # PDF generation (3 document types)
├── uploads/           # Uploaded documents
└── .env

/app/frontend/src/
├── App.js             # React with login, upload, PDF dropdown
└── App.css            # Styles including dropdown menu
```

## Test Results (2025-03-09)
- Authentication: ✅ Working
- File Upload: ✅ Working  
- PDF Generation: ✅ Working (3 document types)
- All modules: ✅ Functional
