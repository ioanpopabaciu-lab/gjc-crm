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
- Immigration cases with stage tracking
- Document management with expiry alerts
- Sales pipeline

## User Language
**Romanian** - All UI elements and communications in Romanian.

---

## Implemented Features ✅

### 1. Dashboard
- KPIs: Total candidates (315), companies (37), immigration cases (75), pipeline value (€312,000), alerts (1)
- Top nationalities chart (Nepal 299, Nigeria 7, India 3, Filipine 3)
- Top companies by placements (Da Vinci 128, Balearia 39, Danessa 26)

### 2. B2B Companies Module
- CRUD operations for companies
- Complete data: CUI, City, Industry, Contact, Phone
- ANAF CUI lookup integration

### 3. B2C Candidates Module
- CRUD operations for 315 candidates
- Nationality, passport, permit tracking
- Company assignment
- Expiry date tracking with alerts

### 4. Immigration Cases Module (NEW - Detailed Tracker) ✅
- **8-stage workflow with visual pipeline:**
  1. Recrutat
  2. Documente Pregătite
  3. Aviz Muncă Depus
  4. Aviz Muncă Aprobat
  5. Viză Depusă
  6. Viză Aprobată
  7. Sosit România
  8. Permis Ședere
  
- **Case Tracker View:**
  - Alert bar for expiring documents
  - Candidate header with avatar, nationality, company, passport info
  - Stats: Documents complete, Current stage, Days until expiry
  - Visual progress pipeline
  
- **4 Tabs per case:**
  - 📋 Documente Dosar (34 documents grouped by category)
  - 🏢 Acte Companie (10 company documents)
  - 👤 Date Personale (editable candidate info)
  - 📜 Istoric (action history timeline)

- **6 Document Categories:**
  - Documente Candidat (CV, Acte Studii, Pașaport, Cazier, Adeverință Medicală)
  - Aviz de Muncă — IGI (Taxă IGI, Portal IGI, AJOFM, Aviz Muncă)
  - Dosar Viză Consulat (Programare Consulat, Asigurare, Contract Comodat)
  - Permis de Ședere (Programare IGI, Taxă, REVISAL)
  - Angajare & Post-Sosire (CIM, Adeverință Salariat)
  - Acte Companie (CUI, ONRC, ANAF, Cazier PJ)

### 5. Document Alerts
- Automatic alerts for expiring/expired documents
- Grouped by priority: Critical (<30 days), Urgent (30-60), Attention (60-90)
- Quick link to candidate profile

### 6. Sales Pipeline
- Kanban board with 5 stages
- Opportunity value tracking

### 7. UI/Branding
- GJC Logo integrated in sidebar
- Light theme with professional design

### 8. Data Import (Completed)
- 315 candidates from 2 Excel files
- 37 companies with normalized names
- 75 immigration cases with status tracking

---

## API Endpoints

### Immigration (Enhanced)
- `GET /api/immigration` - List all cases
- `GET /api/immigration/{id}` - Get detailed case with documents
- `POST /api/immigration` - Create case with document structure
- `PATCH /api/immigration/{id}/advance` - Advance stage with history
- `PATCH /api/immigration/{id}/document` - Update document status
- `DELETE /api/immigration/{id}` - Delete case
- `GET /api/immigration/stages` - Get stage list
- `GET /api/immigration/documents-template` - Get document structure

---

## Pending Tasks

### P0 - High Priority
- [ ] **JWT Authentication**
  - User registration/login
  - Role-based access (admin, operator)
  - Protected API endpoints

### P1 - Medium Priority  
- [ ] **Resend Email Integration** - Notifications for status changes
- [ ] **Document Upload** - Ability to upload actual documents

### P2 - Lower Priority
- [ ] **Document Generation** - Angajament de plată, Contract de mediere (PDF)
- [ ] **Automated Stage Advancement** - Rules based on documents

### P3 - Future
- [ ] PDF report export
- [ ] SMS notifications (Twilio)
- [ ] Calendar integration

---

## Test Results (2025-03-09)
- Backend: All endpoints working
- Frontend: All 8 modules functional
- Immigration tracker: New feature implemented and tested

## File Structure
```
/app/
├── backend/
│   ├── server.py          # FastAPI with enhanced immigration endpoints
│   ├── import_data.py     # Excel import script
│   ├── update_companies.py # Company data update script
│   ├── data/              # Excel files
│   └── .env
├── frontend/
│   ├── public/assets/     # GJC Logo
│   └── src/
│       ├── App.js         # React with detailed immigration tracker
│       └── App.css        # Light theme + tracker styles
└── memory/
    └── PRD.md
```
