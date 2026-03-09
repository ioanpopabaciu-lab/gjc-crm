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
- Sales pipeline

## User Language
**Romanian** - All UI elements and communications in Romanian.

---

## Implemented Features ✅

### 1. Authentication (JWT) ✅ NEW
- Login page with email/password
- JWT tokens with 24h expiration
- Role-based access (admin/operator)
- Default admin: ioan@gjc.ro / GJC2026admin
- Logout functionality
- Protected API endpoints

### 2. Document Upload ✅ NEW
- Upload PDF, JPG, PNG, GIF files (max 10MB)
- File storage in /backend/uploads/
- Attachment indicator (📎) on documents
- Download and delete functionality
- Automatic status update on upload
- History tracking for uploads

### 3. Dashboard
- KPIs: 315 candidates, 37 companies, 75 cases, €312,000 pipeline, 1 alert
- Top nationalities chart (Nepal 299, Nigeria 7, India 3, Filipine 3)
- Top companies by placements

### 4. Immigration Cases Tracker
- **8-stage visual pipeline:**
  1. Recrutat → 2. Documente Pregătite → 3. Aviz Muncă Depus → 4. Aviz Muncă Aprobat
  5. Viză Depusă → 6. Viză Aprobată → 7. Sosit România → 8. Permis Ședere
  
- **4 Tabs per case:**
  - 📋 Documente Dosar (34 documents with upload)
  - 🏢 Acte Companie (10 documents)
  - 👤 Date Personale
  - 📜 Istoric

- **6 Document Categories with upload:**
  - Documente Candidat (CV, Acte Studii, Pașaport, Cazier, Adeverință)
  - Aviz de Muncă — IGI (Taxă, Portal, AJOFM, Aviz)
  - Dosar Viză Consulat (Programare, Asigurare, Contract)
  - Permis de Ședere (Programare, Taxă, REVISAL)
  - Angajare & Post-Sosire (CIM, Adeverință)
  - Acte Companie (CUI, ONRC, ANAF, Cazier PJ)

### 5. Document Alerts
- Expiring/expired document detection
- Grouped by priority: Critical (<30 days), Urgent (30-60), Attention (60-90)

### 6. B2B Companies & B2C Candidates
- Full CRUD operations
- Search and filter functionality

### 7. UI/Branding
- GJC Logo in sidebar and login page
- Light professional theme
- Romanian interface

---

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register user
- `POST /api/auth/login` - Login and get JWT token
- `GET /api/auth/me` - Get current user info
- `GET /api/auth/users` - Get all users (admin only)

### File Upload
- `POST /api/upload/document/{case_id}/{category}/{doc_id}` - Upload file
- `GET /api/upload/document/{filename}` - Download file
- `DELETE /api/upload/document/{case_id}/{category}/{doc_id}` - Delete file

### Immigration (Enhanced)
- `GET /api/immigration/{id}` - Get detailed case with documents
- `PATCH /api/immigration/{id}/document` - Update document status

---

## Default Credentials
- **Admin:** ioan@gjc.ro / GJC2026admin

---

## Pending Tasks

### P1 - Medium Priority  
- [ ] **Resend Email Integration** - Notifications for status changes (waiting for API key)

### P2 - Lower Priority
- [ ] **PDF Document Generation** - Angajament de plată, Contract de mediere
- [ ] **Automated Stage Advancement** - Rules based on documents

### P3 - Future
- [ ] Export reports to PDF/Excel
- [ ] SMS notifications (Twilio)
- [ ] Calendar integration

---

## Test Results (2025-03-09)
- Authentication: Working ✅
- File Upload: Working ✅
- All modules: Functional ✅

## File Structure
```
/app/
├── backend/
│   ├── server.py          # FastAPI with auth + upload endpoints
│   ├── uploads/           # Uploaded documents
│   ├── import_data.py
│   └── .env
├── frontend/
│   ├── public/assets/     # GJC Logo
│   └── src/
│       ├── App.js         # React with login + upload
│       └── App.css        # Light theme + login styles
└── memory/
    └── PRD.md
```
