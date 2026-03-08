# GJC AI-CRM - Product Requirements Document

## Overview
**Project Name:** GJC AI-CRM (Global Jobs Consulting CRM)
**Purpose:** CRM system for a Romanian recruitment and immigration agency
**Tech Stack:** React (Frontend) + FastAPI (Backend) + MongoDB (Database)

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

## Core Features

### 1. Dashboard (IMPLEMENTED ✅)
- KPIs: Total candidates, companies, immigration cases, pipeline value, alerts
- Top nationalities chart
- Top companies by placements

### 2. B2B Companies Module (IMPLEMENTED ✅)
- CRUD operations for companies
- ANAF CUI lookup integration
- Search and filter functionality

### 3. B2C Candidates Module (IMPLEMENTED ✅)
- CRUD operations for candidates
- Nationality, passport, permit tracking
- Company assignment
- Expiry date tracking with alerts

### 4. Immigration Cases Module (IMPLEMENTED ✅)
- Case creation and management
- 8-stage workflow:
  1. Recrutat
  2. Documente Pregatite
  3. Permis Munca Depus
  4. Permis Munca Aprobat
  5. Viza Depusa
  6. Viza Aprobata
  7. Sosit Romania
  8. Permis Sedere
- Stage advancement functionality

### 5. Document Alerts (IMPLEMENTED ✅)
- Automatic alerts for expiring/expired documents
- Grouped by priority:
  - **Critical:** Expired or <30 days
  - **Urgent:** 30-60 days
  - **Attention:** 60-90 days
- Quick link to candidate profile

### 6. Sales Pipeline (IMPLEMENTED ✅)
- Kanban-style pipeline board
- 5 stages: Lead, Contact, Negociere, Contract, Câștigat
- Opportunity value tracking

### 7. Reports Module (IMPLEMENTED ✅)
- Statistics overview
- Nationality distribution
- Pipeline performance

---

## Data Import (COMPLETED ✅)
**Date:** 2025-03-08

### Imported Data
- **Source Files:**
  - `Baza de date_Ioan Baciu_07 04 2025.xlsx` (27 sheets, company-specific data)
  - `Baza de date noua, 18-Feb-2026.xlsx` (2 sheets, immigration status)

- **Results:**
  - 315 candidates imported (deduplicated)
  - 37 companies imported (normalized, no duplicates)
  - 75 immigration cases created

- **Nationality Distribution:**
  - Nepal: 299
  - Nigeria: 7
  - India: 3
  - Filipine: 3
  - Sri Lanka: 1
  - Others: 2

---

## API Endpoints

### Dashboard
- `GET /api/dashboard` - Complete dashboard KPIs

### Companies
- `GET /api/companies` - List companies
- `POST /api/companies` - Create company
- `PUT /api/companies/{id}` - Update company
- `DELETE /api/companies/{id}` - Delete company
- `GET /api/anaf/{cui}` - ANAF CUI lookup

### Candidates
- `GET /api/candidates` - List candidates
- `POST /api/candidates` - Create candidate
- `PUT /api/candidates/{id}` - Update candidate
- `DELETE /api/candidates/{id}` - Delete candidate

### Immigration
- `GET /api/immigration` - List cases
- `POST /api/immigration` - Create case
- `PATCH /api/immigration/{id}/advance` - Advance stage
- `DELETE /api/immigration/{id}` - Delete case
- `GET /api/immigration/stages` - Get stage list

### Alerts
- `GET /api/alerts` - Get all document expiry alerts

### Pipeline
- `GET /api/pipeline` - List opportunities
- `POST /api/pipeline` - Create opportunity
- `PUT /api/pipeline/{id}` - Update opportunity
- `DELETE /api/pipeline/{id}` - Delete opportunity

---

## Completed Tasks

### Phase 1 - Foundation (DONE ✅)
- [x] FastAPI backend setup
- [x] MongoDB integration
- [x] React frontend with light theme
- [x] 8-module navigation
- [x] Basic CRUD for all entities

### Phase 2 - Data Import (DONE ✅)
- [x] Excel file parsing (Apr 2025 file)
- [x] Excel file parsing (Feb 2026 file)
- [x] Company name normalization
- [x] Candidate deduplication
- [x] Immigration case creation from status

### Phase 3 - Alerts System (DONE ✅)
- [x] Document expiry detection
- [x] Alert priority grouping
- [x] Dashboard KPI integration
- [x] Quick navigation to candidate

---

## Pending Tasks

### P0 - High Priority
- [ ] **JWT Authentication**
  - User registration/login
  - Role-based access (admin, operator)
  - Protected API endpoints
  - Token refresh

### P1 - Medium Priority
- [ ] **Resend Email Integration**
  - Email notifications for status changes
  - Template system for Romanian emails
  - Configurable triggers

- [ ] **ANAF CUI Enhancement**
  - Auto-populate company fields
  - VAT status verification

### P2 - Lower Priority
- [ ] **Document Generation**
  - Angajament de plată (Payment Commitment)
  - Contract de mediere (Mediation Contract)
  - PDF export

- [ ] **Automated Stage Advancement**
  - Rule-based progression
  - Deadline tracking
  - Automatic notifications

### P3 - Future Enhancements
- [ ] Document upload functionality
- [ ] PDF report export
- [ ] Audit logging
- [ ] SMS notifications (Twilio)
- [ ] Calendar integration

---

## File Structure

```
/app/
├── backend/
│   ├── server.py          # FastAPI application (736 lines)
│   ├── import_data.py     # Excel import script
│   ├── requirements.txt
│   ├── data/              # Excel files
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── App.js         # Main React component
│   │   └── App.css        # Light theme styles
│   └── package.json
└── memory/
    └── PRD.md             # This file
```

---

## Configuration

### Environment Variables
**Backend (.env):**
- `MONGO_URL` - MongoDB connection string
- `DB_NAME` - Database name

**Frontend (.env):**
- `REACT_APP_BACKEND_URL` - API base URL

---

## Known Issues
- None currently reported

## Notes
- UI language: Romanian
- Default user displayed: Ioan Baciu (Administrator)
- Pipeline values in EUR (€)
