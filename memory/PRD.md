# GJC AI-CRM - Product Requirements Document

## Overview
**Project Name:** GJC AI-CRM (Global Jobs Consulting CRM)
**Purpose:** CRM system for a Romanian recruitment and immigration agency
**Tech Stack:** React (Frontend) + FastAPI (Backend) + MongoDB (Database)
**Last Updated:** 2025-03-08

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
- Top nationalities chart (Nepal, Nigeria, India, Filipine)
- Top companies by placements

### 2. B2B Companies Module
- CRUD operations for companies
- ANAF CUI lookup integration
- Search and filter functionality

### 3. B2C Candidates Module
- CRUD operations for candidates
- Nationality, passport, permit tracking
- Company assignment
- Expiry date tracking with alerts

### 4. Immigration Cases Module
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

### 5. Document Alerts
- Automatic alerts for expiring/expired documents
- Grouped by priority:
  - **Critical:** Expired or <30 days
  - **Urgent:** 30-60 days
  - **Attention:** 60-90 days
- Quick link to candidate profile ("Vezi Dosar" button)

### 6. Sales Pipeline
- Kanban-style pipeline board
- 5 stages: Lead, Contact, Negociere, Contract, Câștigat
- Opportunity value tracking

### 7. Reports Module
- Statistics overview
- Nationality distribution
- Pipeline performance

### 8. Data Import (Completed 2025-03-08)
- Imported from `Baza de date_Ioan Baciu_07 04 2025.xlsx` (27 sheets)
- Imported from `Baza de date noua, 18-Feb-2026.xlsx` (2 sheets)
- Results: 315 candidates, 37 companies, 75 immigration cases
- Company name normalization and deduplication

---

## Pending Tasks

### P0 - High Priority
- [ ] **JWT Authentication**
  - User registration/login
  - Role-based access (admin, operator)
  - Protected API endpoints

### P1 - Medium Priority  
- [ ] **Resend Email Integration** - Notifications for status changes
- [ ] **ANAF CUI Enhancement** - Auto-populate company fields

### P2 - Lower Priority
- [ ] **Document Generation** - Angajament de plată, Contract de mediere
- [ ] **Automated Stage Advancement**

### P3 - Future
- [ ] Document upload
- [ ] PDF report export
- [ ] SMS notifications

---

## Test Results (2025-03-08)
- Backend: 100% (28/28 tests passed)
- Frontend: 100% (all 8 modules working)
- Report: `/app/test_reports/iteration_1.json`
