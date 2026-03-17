# GJC AI-CRM - Ghid Instalare Locală (Windows)

## 📋 Cerințe Sistem

| Component | Versiune Minimă | Descărcare |
|-----------|-----------------|------------|
| **Python** | 3.11+ | [python.org](https://www.python.org/downloads/) |
| **Node.js** | 18+ | [nodejs.org](https://nodejs.org/) |
| **MongoDB** | 6.0+ | [mongodb.com](https://www.mongodb.com/try/download/community) |

---

## 🚀 Instalare Rapidă (Windows)

### Metoda 1: Script Automat
```batch
# Dublu-click pe start.bat
# SAU din Command Prompt:
start.bat
```

### Metoda 2: Manual (pas cu pas)

---

## 📁 Structura Proiect

```
gjc-crm/
├── backend/
│   ├── server.py              # API FastAPI
│   ├── pdf_generator.py       # Generare PDF
│   ├── requirements.txt       # Dependențe Python
│   └── .env.example           # Template configurare
├── frontend/
│   ├── src/
│   │   ├── App.js             # Aplicație React
│   │   └── App.css            # Stiluri
│   ├── package.json           # Dependențe Node.js
│   └── .env.example           # Template configurare
├── database_export/           # Date sample pentru import
│   ├── users.json
│   ├── companies.json
│   ├── candidates.json
│   ├── immigration_cases.json
│   └── jobs.json
├── scripts/
│   ├── import_database.bat    # Import date Windows
│   └── import_database.sh     # Import date Linux/Mac
├── start.bat                  # Script pornire Windows
└── README.md                  # Acest fișier
```

---

## ⚙️ Instalare Manuală

### Pas 1: Configurare Backend

```batch
cd backend

# Creare virtual environment
python -m venv venv

# Activare virtual environment
venv\Scripts\activate

# Instalare dependențe
pip install -r requirements.txt

# Copiere și configurare .env
copy .env.example .env
# Editează .env cu valorile tale
```

### Pas 2: Configurare Frontend

```batch
cd frontend

# Instalare dependențe (cu flag pentru compatibilitate)
npm install --legacy-peer-deps

# Copiere și configurare .env
copy .env.example .env
```

### Pas 3: Pornire MongoDB

**Opțiunea A: MongoDB Local**
1. Descarcă și instalează MongoDB Community Server
2. Pornește serviciul MongoDB
3. MongoDB va rula pe `mongodb://localhost:27017`

**Opțiunea B: MongoDB Atlas (Cloud)**
1. Creează cont gratuit pe [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Creează un cluster
3. Copiază connection string-ul în `.env`

### Pas 4: Import Date Inițiale

```batch
cd scripts
import_database.bat
```

### Pas 5: Pornire Aplicație

**Terminal 1 - Backend:**
```batch
cd backend
venv\Scripts\activate
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

**Terminal 2 - Frontend:**
```batch
cd frontend
npm start
```

---

## 🔗 Accesare Aplicație

| Component | URL |
|-----------|-----|
| **Frontend** | http://localhost:3000 |
| **Backend API** | http://localhost:8001 |
| **API Docs** | http://localhost:8001/docs |

---

## 🔐 Credențiale Test

| Rol | Email | Parolă |
|-----|-------|--------|
| Admin | ioan@gjc.ro | GJC2026admin |

---

## 📊 Verificare Funcționare

### Test Backend:
```batch
curl http://localhost:8001/api/stats
```

Răspuns așteptat:
```json
{"total_candidates": 315, "total_companies": 37, ...}
```

### Test Frontend:
1. Deschide http://localhost:3000
2. Login cu credențialele de mai sus
3. Verifică dashboard-ul

---

## 🛠️ Troubleshooting

### Eroare: "python not found"
- Adaugă Python în PATH la instalare
- Sau folosește: `py -m venv venv`

### Eroare: "npm install fails"
```batch
npm cache clean --force
npm install --legacy-peer-deps
```

### Eroare: "MongoDB connection failed"
- Verifică că MongoDB rulează: `net start MongoDB`
- Sau pornește manual: `mongod`

### Eroare: "Port already in use"
```batch
# Găsește procesul pe port 8001
netstat -ano | findstr :8001
# Oprește procesul (înlocuiește PID)
taskkill /PID <PID> /F
```

### Eroare: "WeasyPrint/reportlab fails"
```batch
pip install --upgrade weasyprint reportlab
```

---

## 📝 Note Dezvoltare

- **Hot Reload**: Ambele servere au hot reload activat
- **CORS**: Configurat pentru localhost în development
- **JWT**: Token-ul expiră în 24 ore

---

## 📄 Licență

Proprietate privată - Global Jobs Consulting © 2025
