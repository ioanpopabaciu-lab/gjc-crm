from fastapi import FastAPI, APIRouter, HTTPException, Query, Depends, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse, StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import httpx
import shutil
from passlib.context import CryptContext
import jwt
from pdf_generator import generate_angajament_plata, generate_contract_mediere, generate_oferta_angajare

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'gjc-secret-key-2026-very-secure')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Security
security = HTTPBearer(auto_error=False)

# Upload directory
UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
ALLOWED_EXTENSIONS = {'.pdf', '.jpg', '.jpeg', '.png', '.gif'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

app = FastAPI(title="GJC AI-CRM API", version="2.0")
api_router = APIRouter(prefix="/api")

# ===================== AUTH MODELS =====================

class UserCreate(BaseModel):
    email: str
    password: str
    role: str = "operator"

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    role: str
    created_at: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# ===================== AUTH HELPERS =====================

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify JWT token and return current user"""
    if not credentials:
        return None
    
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            return None
        
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirat")
    except jwt.InvalidTokenError:
        return None

async def require_auth(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Require authentication - raises exception if not authenticated"""
    user = await get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Autentificare necesară")
    return user

async def require_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Require admin role"""
    user = await require_auth(credentials)
    if user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail="Acces interzis - necesită rol admin")
    return user

# ===================== MODELS =====================

class Company(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    cui: Optional[str] = None
    city: Optional[str] = None
    industry: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    status: str = "activ"
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CompanyCreate(BaseModel):
    name: str
    cui: Optional[str] = None
    city: Optional[str] = None
    industry: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    status: str = "activ"
    notes: Optional[str] = None

class Candidate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    first_name: str
    last_name: str
    nationality: Optional[str] = None
    passport_number: Optional[str] = None
    passport_expiry: Optional[str] = None
    permit_expiry: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    job_type: Optional[str] = None
    status: str = "activ"
    company_id: Optional[str] = None
    company_name: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CandidateCreate(BaseModel):
    first_name: str
    last_name: str
    nationality: Optional[str] = None
    passport_number: Optional[str] = None
    passport_expiry: Optional[str] = None
    permit_expiry: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    job_type: Optional[str] = None
    status: str = "activ"
    company_id: Optional[str] = None
    company_name: Optional[str] = None
    notes: Optional[str] = None

class ImmigrationDocument(BaseModel):
    """Document în dosarul de imigrare"""
    doc_id: str
    name: str
    category: str  # candidate, igi, visa, permit, employment, company
    required: bool = True
    status: str = "missing"  # missing, present, expiring, expired
    issue_date: Optional[str] = None
    expiry_date: Optional[str] = None
    notes: Optional[str] = None

class ImmigrationCase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    candidate_id: str
    candidate_name: Optional[str] = None
    company_id: Optional[str] = None
    company_name: Optional[str] = None
    case_type: str = "Permis de muncă"
    status: str = "în procesare"
    current_stage: int = 1
    current_stage_name: str = "Recrutat"
    # Statistici documente
    documents_total: int = 34
    documents_complete: int = 0
    # Date importante
    passport_expiry: Optional[str] = None
    permit_expiry: Optional[str] = None
    # Documente pe categorii
    documents: Optional[dict] = None
    # Istoric
    history: Optional[List[dict]] = None
    # Metadate
    submitted_date: Optional[str] = None
    deadline: Optional[str] = None
    assigned_to: str = "Ioan Baciu"
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ImmigrationCaseCreate(BaseModel):
    candidate_id: str
    candidate_name: Optional[str] = None
    company_id: Optional[str] = None
    company_name: Optional[str] = None
    case_type: str = "Permis de muncă"
    status: str = "în procesare"
    passport_expiry: Optional[str] = None
    permit_expiry: Optional[str] = None
    submitted_date: Optional[str] = None
    deadline: Optional[str] = None
    assigned_to: str = "Ioan Baciu"
    notes: Optional[str] = None

class PipelineOpportunity(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    company_id: Optional[str] = None
    company_name: Optional[str] = None
    stage: str = "lead"
    value: float = 0
    positions: int = 1
    filled: int = 0
    probability: int = 20
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Document(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    candidate_id: Optional[str] = None
    candidate_name: Optional[str] = None
    company_id: Optional[str] = None
    doc_type: str
    file_name: str
    expiry_date: Optional[str] = None
    status: str = "valid"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Alert(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    alert_type: str
    entity_type: str
    entity_id: str
    entity_name: str
    message: str
    expiry_date: str
    days_until_expiry: int
    priority: str
    is_read: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ===================== HELPER FUNCTIONS =====================

def serialize_doc(doc):
    """Serialize MongoDB document for JSON response"""
    if doc and isinstance(doc.get('created_at'), datetime):
        doc['created_at'] = doc['created_at'].isoformat()
    return doc

# ===================== AUTHENTICATION =====================

@api_router.post("/auth/register", response_model=TokenResponse)
async def register_user(user_data: UserCreate):
    """Register a new user"""
    # Check if email already exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email-ul este deja înregistrat")
    
    # Create user
    user_id = str(uuid.uuid4())
    hashed_password = get_password_hash(user_data.password)
    created_at = datetime.now(timezone.utc).isoformat()
    
    user_doc = {
        "id": user_id,
        "email": user_data.email,
        "password_hash": hashed_password,
        "role": user_data.role,
        "created_at": created_at
    }
    
    await db.users.insert_one(user_doc)
    
    # Create token
    access_token = create_access_token({"sub": user_id, "email": user_data.email, "role": user_data.role})
    
    return TokenResponse(
        access_token=access_token,
        user=UserResponse(
            id=user_id,
            email=user_data.email,
            role=user_data.role,
            created_at=created_at
        )
    )

@api_router.post("/auth/login", response_model=TokenResponse)
async def login_user(credentials: UserLogin):
    """Login user and return JWT token"""
    user = await db.users.find_one({"email": credentials.email})
    
    if not user or not verify_password(credentials.password, user['password_hash']):
        raise HTTPException(status_code=401, detail="Email sau parolă incorectă")
    
    # Create token
    access_token = create_access_token({
        "sub": user['id'],
        "email": user['email'],
        "role": user['role']
    })
    
    return TokenResponse(
        access_token=access_token,
        user=UserResponse(
            id=user['id'],
            email=user['email'],
            role=user['role'],
            created_at=user.get('created_at', '')
        )
    )

@api_router.get("/auth/me")
async def get_current_user_info(user = Depends(require_auth)):
    """Get current authenticated user info"""
    return UserResponse(
        id=user['id'],
        email=user['email'],
        role=user['role'],
        created_at=user.get('created_at', '')
    )

@api_router.get("/auth/users")
async def get_all_users(user = Depends(require_admin)):
    """Get all users (admin only)"""
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(100)
    return users

# ===================== FILE UPLOAD =====================

@api_router.post("/upload/document/{case_id}/{category}/{doc_id}")
async def upload_document(
    case_id: str,
    category: str,
    doc_id: str,
    file: UploadFile = File(...)
):
    """Upload a document file for an immigration case"""
    
    # Verify case exists
    case = await db.immigration_cases.find_one({"id": case_id})
    if not case:
        raise HTTPException(status_code=404, detail="Dosarul nu a fost găsit")
    
    # Validate file extension
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400, 
            detail=f"Tip fișier nepermis. Tipuri acceptate: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    # Validate file size
    file.file.seek(0, 2)  # Seek to end
    file_size = file.file.tell()
    file.file.seek(0)  # Seek back to start
    
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Fișierul este prea mare. Maxim 10MB.")
    
    # Generate unique filename
    unique_filename = f"{case_id}_{category}_{doc_id}_{uuid.uuid4().hex[:8]}{file_ext}"
    file_path = UPLOAD_DIR / unique_filename
    
    # Save file
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Update document in case
    documents = case.get('documents', {})
    if category in documents:
        for doc in documents[category].get('docs', []):
            if doc['id'] == doc_id:
                doc['status'] = 'present'
                doc['file_path'] = str(unique_filename)
                doc['file_name'] = file.filename
                doc['uploaded_at'] = datetime.now(timezone.utc).isoformat()
                break
    
    # Add to history
    history = case.get('history', [])
    doc_name = next(
        (d['name'] for d in documents.get(category, {}).get('docs', []) if d['id'] == doc_id),
        doc_id
    )
    history.insert(0, {
        'date': datetime.now(timezone.utc).strftime('%d.%m.%Y'),
        'action': f'{doc_name} — fișier încărcat ({file.filename})',
        'user': 'Operator',
        'icon': '📎'
    })
    
    await db.immigration_cases.update_one(
        {"id": case_id},
        {"$set": {"documents": documents, "history": history}}
    )
    
    return {
        "message": "Fișier încărcat cu succes",
        "filename": unique_filename,
        "original_name": file.filename
    }

@api_router.get("/upload/document/{filename}")
async def download_document(filename: str):
    """Download/view a document file"""
    file_path = UPLOAD_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Fișierul nu a fost găsit")
    
    return FileResponse(
        path=str(file_path),
        filename=filename,
        media_type="application/octet-stream"
    )

@api_router.delete("/upload/document/{case_id}/{category}/{doc_id}")
async def delete_document(case_id: str, category: str, doc_id: str):
    """Delete a document file"""
    
    case = await db.immigration_cases.find_one({"id": case_id})
    if not case:
        raise HTTPException(status_code=404, detail="Dosarul nu a fost găsit")
    
    documents = case.get('documents', {})
    file_path = None
    
    if category in documents:
        for doc in documents[category].get('docs', []):
            if doc['id'] == doc_id and doc.get('file_path'):
                file_path = UPLOAD_DIR / doc['file_path']
                doc['status'] = 'missing'
                doc['file_path'] = None
                doc['file_name'] = None
                doc['uploaded_at'] = None
                break
    
    if file_path and file_path.exists():
        file_path.unlink()
    
    await db.immigration_cases.update_one(
        {"id": case_id},
        {"$set": {"documents": documents}}
    )
    
    return {"message": "Fișier șters cu succes"}

# ===================== PDF GENERATION =====================

@api_router.get("/pdf/angajament-plata/{case_id}")
async def generate_angajament_pdf(case_id: str):
    """Generate Angajament de Plată PDF for a case"""
    
    # Get case data
    case = await db.immigration_cases.find_one({"id": case_id}, {"_id": 0})
    if not case:
        raise HTTPException(status_code=404, detail="Dosarul nu a fost găsit")
    
    # Get candidate data
    candidate = {}
    if case.get('candidate_id'):
        candidate = await db.candidates.find_one({"id": case['candidate_id']}, {"_id": 0}) or {}
    
    # Get company data
    company = {}
    if case.get('company_id'):
        company = await db.companies.find_one({"id": case['company_id']}, {"_id": 0}) or {}
    
    # Generate PDF
    pdf_buffer = generate_angajament_plata(candidate, company, case)
    
    candidate_name = f"{candidate.get('first_name', '')}_{candidate.get('last_name', '')}".strip('_')
    filename = f"Angajament_Plata_{candidate_name}_{datetime.now().strftime('%Y%m%d')}.pdf"
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@api_router.get("/pdf/contract-mediere/{case_id}")
async def generate_contract_pdf(case_id: str):
    """Generate Contract de Mediere PDF for a case"""
    
    # Get case data
    case = await db.immigration_cases.find_one({"id": case_id}, {"_id": 0})
    if not case:
        raise HTTPException(status_code=404, detail="Dosarul nu a fost găsit")
    
    # Get candidate data
    candidate = {}
    if case.get('candidate_id'):
        candidate = await db.candidates.find_one({"id": case['candidate_id']}, {"_id": 0}) or {}
    
    # Get company data
    company = {}
    if case.get('company_id'):
        company = await db.companies.find_one({"id": case['company_id']}, {"_id": 0}) or {}
    
    # Generate PDF
    pdf_buffer = generate_contract_mediere(candidate, company, case)
    
    candidate_name = f"{candidate.get('first_name', '')}_{candidate.get('last_name', '')}".strip('_')
    filename = f"Contract_Mediere_{candidate_name}_{datetime.now().strftime('%Y%m%d')}.pdf"
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@api_router.get("/pdf/oferta-angajare/{case_id}")
async def generate_oferta_pdf(case_id: str):
    """Generate Ofertă Fermă de Angajare PDF for a case"""
    
    # Get case data
    case = await db.immigration_cases.find_one({"id": case_id}, {"_id": 0})
    if not case:
        raise HTTPException(status_code=404, detail="Dosarul nu a fost găsit")
    
    # Get candidate data
    candidate = {}
    if case.get('candidate_id'):
        candidate = await db.candidates.find_one({"id": case['candidate_id']}, {"_id": 0}) or {}
    
    # Get company data
    company = {}
    if case.get('company_id'):
        company = await db.companies.find_one({"id": case['company_id']}, {"_id": 0}) or {}
    
    # Generate PDF
    pdf_buffer = generate_oferta_angajare(candidate, company, case)
    
    candidate_name = f"{candidate.get('first_name', '')}_{candidate.get('last_name', '')}".strip('_')
    filename = f"Oferta_Angajare_{candidate_name}_{datetime.now().strftime('%Y%m%d')}.pdf"
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# ===================== DASHBOARD =====================

@api_router.get("/dashboard")
async def get_dashboard():
    """Get complete dashboard KPIs"""
    total_candidates = await db.candidates.count_documents({})
    active_candidates = await db.candidates.count_documents({"status": "activ"})
    total_companies = await db.companies.count_documents({})
    active_companies = await db.companies.count_documents({"status": "activ"})
    total_cases = await db.immigration_cases.count_documents({})
    pending_cases = await db.immigration_cases.count_documents({"status": {"$nin": ["finalizat", "respins"]}})
    
    # Pipeline stats
    pipeline = await db.pipeline.find({}, {"_id": 0}).to_list(100)
    total_pipeline_value = sum(p.get('value', 0) * (p.get('probability', 0) / 100) for p in pipeline)
    
    # Alerts - documents/passports expiring in 90 days OR already expired
    today = datetime.now(timezone.utc).date()
    alert_date_future = (today + timedelta(days=90)).isoformat()
    
    # Count expiring/expired passports
    passport_alerts = 0
    permit_alerts = 0
    
    candidates_with_expiry = await db.candidates.find({
        "$or": [
            {"passport_expiry": {"$ne": None}},
            {"permit_expiry": {"$ne": None}}
        ]
    }, {"_id": 0, "passport_expiry": 1, "permit_expiry": 1}).to_list(1000)
    
    for c in candidates_with_expiry:
        if c.get('passport_expiry'):
            try:
                exp_date = datetime.fromisoformat(c['passport_expiry']).date()
                days = (exp_date - today).days
                if days <= 90 and days >= -365:
                    passport_alerts += 1
            except:
                pass
        if c.get('permit_expiry'):
            try:
                exp_date = datetime.fromisoformat(c['permit_expiry']).date()
                days = (exp_date - today).days
                if days <= 90 and days >= -365:
                    permit_alerts += 1
            except:
                pass
    
    # Nationality breakdown
    nationality_pipeline = [
        {"$group": {"_id": "$nationality", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 5}
    ]
    nationalities = await db.candidates.aggregate(nationality_pipeline).to_list(5)
    
    # Company placements
    company_pipeline = [
        {"$match": {"company_name": {"$ne": None}}},
        {"$group": {"_id": "$company_name", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 5}
    ]
    top_companies = await db.candidates.aggregate(company_pipeline).to_list(5)
    
    return {
        "kpis": {
            "total_candidates": total_candidates,
            "active_candidates": active_candidates,
            "total_companies": total_companies,
            "active_companies": active_companies,
            "total_cases": total_cases,
            "pending_cases": pending_cases,
            "pipeline_value": total_pipeline_value,
            "expiring_passports": passport_alerts,
            "expiring_permits": permit_alerts,
            "total_alerts": passport_alerts + permit_alerts
        },
        "nationalities": [{"nationality": n["_id"] or "Necunoscut", "count": n["count"]} for n in nationalities],
        "top_companies": [{"company": c["_id"], "placements": c["count"]} for c in top_companies]
    }

# ===================== COMPANIES =====================

@api_router.get("/companies", response_model=List[Company])
async def get_companies(status: Optional[str] = None, search: Optional[str] = None):
    query = {}
    if status:
        query["status"] = status
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"cui": {"$regex": search, "$options": "i"}},
            {"city": {"$regex": search, "$options": "i"}}
        ]
    companies = await db.companies.find(query, {"_id": 0}).to_list(1000)
    return [serialize_doc(c) for c in companies]

@api_router.get("/companies/{company_id}", response_model=Company)
async def get_company(company_id: str):
    company = await db.companies.find_one({"id": company_id}, {"_id": 0})
    if not company:
        raise HTTPException(status_code=404, detail="Compania nu a fost găsită")
    return serialize_doc(company)

@api_router.post("/companies", response_model=Company)
async def create_company(input: CompanyCreate):
    company = Company(**input.model_dump())
    doc = company.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.companies.insert_one(doc)
    return company

@api_router.put("/companies/{company_id}", response_model=Company)
async def update_company(company_id: str, input: CompanyCreate):
    existing = await db.companies.find_one({"id": company_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Compania nu a fost găsită")
    update_data = input.model_dump()
    await db.companies.update_one({"id": company_id}, {"$set": update_data})
    updated = await db.companies.find_one({"id": company_id}, {"_id": 0})
    return serialize_doc(updated)

@api_router.delete("/companies/{company_id}")
async def delete_company(company_id: str):
    result = await db.companies.delete_one({"id": company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Compania nu a fost găsită")
    return {"message": "Companie ștearsă cu succes"}

# ===================== CANDIDATES =====================

@api_router.get("/candidates", response_model=List[Candidate])
async def get_candidates(
    status: Optional[str] = None,
    nationality: Optional[str] = None,
    company_id: Optional[str] = None,
    search: Optional[str] = None
):
    query = {}
    if status:
        query["status"] = status
    if nationality:
        query["nationality"] = nationality
    if company_id:
        query["company_id"] = company_id
    if search:
        query["$or"] = [
            {"first_name": {"$regex": search, "$options": "i"}},
            {"last_name": {"$regex": search, "$options": "i"}},
            {"passport_number": {"$regex": search, "$options": "i"}}
        ]
    candidates = await db.candidates.find(query, {"_id": 0}).to_list(1000)
    return [serialize_doc(c) for c in candidates]

@api_router.get("/candidates/alerts")
async def get_candidate_alerts():
    """Get candidates with passports/permits expiring in 90 days"""
    today = datetime.now(timezone.utc).date()
    alert_date = (today + timedelta(days=90)).isoformat()
    
    expiring = await db.candidates.find({
        "$or": [
            {"passport_expiry": {"$lte": alert_date, "$gte": today.isoformat()}},
            {"permit_expiry": {"$lte": alert_date, "$gte": today.isoformat()}}
        ]
    }, {"_id": 0}).to_list(100)
    
    alerts = []
    for c in expiring:
        if c.get('passport_expiry') and c['passport_expiry'] <= alert_date:
            days = (datetime.fromisoformat(c['passport_expiry']).date() - today).days
            alerts.append({
                "type": "passport",
                "candidate_id": c['id'],
                "candidate_name": f"{c['first_name']} {c['last_name']}",
                "expiry_date": c['passport_expiry'],
                "days_until_expiry": days,
                "priority": "urgent" if days <= 30 else "warning"
            })
        if c.get('permit_expiry') and c['permit_expiry'] <= alert_date:
            days = (datetime.fromisoformat(c['permit_expiry']).date() - today).days
            alerts.append({
                "type": "permit",
                "candidate_id": c['id'],
                "candidate_name": f"{c['first_name']} {c['last_name']}",
                "expiry_date": c['permit_expiry'],
                "days_until_expiry": days,
                "priority": "urgent" if days <= 30 else "warning"
            })
    
    return sorted(alerts, key=lambda x: x['days_until_expiry'])

@api_router.get("/candidates/{candidate_id}", response_model=Candidate)
async def get_candidate(candidate_id: str):
    candidate = await db.candidates.find_one({"id": candidate_id}, {"_id": 0})
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidatul nu a fost găsit")
    return serialize_doc(candidate)

@api_router.post("/candidates", response_model=Candidate)
async def create_candidate(input: CandidateCreate):
    candidate = Candidate(**input.model_dump())
    doc = candidate.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.candidates.insert_one(doc)
    return candidate

@api_router.put("/candidates/{candidate_id}", response_model=Candidate)
async def update_candidate(candidate_id: str, input: CandidateCreate):
    existing = await db.candidates.find_one({"id": candidate_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Candidatul nu a fost găsit")
    update_data = input.model_dump()
    await db.candidates.update_one({"id": candidate_id}, {"$set": update_data})
    updated = await db.candidates.find_one({"id": candidate_id}, {"_id": 0})
    return serialize_doc(updated)

@api_router.delete("/candidates/{candidate_id}")
async def delete_candidate(candidate_id: str):
    result = await db.candidates.delete_one({"id": candidate_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Candidatul nu a fost găsit")
    return {"message": "Candidat șters cu succes"}

# ===================== IMMIGRATION CASES =====================

IMMIGRATION_STAGES = [
    "Recrutat",
    "Documente Pregătite",
    "Aviz Muncă Depus",
    "Aviz Muncă Aprobat",
    "Viză Depusă",
    "Viză Aprobată",
    "Sosit România",
    "Permis Ședere"
]

# Structura documentelor pentru dosarul de imigrare
IMMIGRATION_DOCUMENTS = {
    "candidate": {
        "title": "Documente Candidat",
        "icon": "👤",
        "docs": [
            {"id": "cv", "name": "CV", "required": True, "has_expiry": False},
            {"id": "acte_studii", "name": "Acte Studii", "required": True, "has_expiry": False},
            {"id": "poza_pasaport", "name": "Poză tip Pașaport", "required": True, "has_expiry": False},
            {"id": "pasaport", "name": "Pașaport", "required": True, "has_expiry": True},
            {"id": "cazier", "name": "Cazier Judiciar (țară origine + RO)", "required": True, "has_expiry": True},
            {"id": "adeverinta_medicala", "name": "Adeverință Medicală (apt de muncă)", "required": True, "has_expiry": True}
        ]
    },
    "igi": {
        "title": "Aviz de Muncă — IGI",
        "icon": "🏛",
        "docs": [
            {"id": "taxa_igi", "name": "Taxă IGI 100 EUR", "required": True, "has_expiry": False},
            {"id": "inregistrare_igi", "name": "Data Înregistrare Portal IGI", "required": True, "has_expiry": False},
            {"id": "programare_igi", "name": "Dată Programare Depunere IGI", "required": True, "has_expiry": False},
            {"id": "adeverinta_ajofm", "name": "Adeverință AJOFM", "required": True, "has_expiry": True},
            {"id": "permis_rezidenta", "name": "Permis Rezidență (dacă există)", "required": False, "has_expiry": True},
            {"id": "aviz_munca", "name": "Aviz de Muncă Eliberat (6 luni)", "required": True, "has_expiry": True},
            {"id": "serie_viza", "name": "Serie E Viză", "required": True, "has_expiry": False}
        ]
    },
    "visa": {
        "title": "Dosar Viză Consulat",
        "icon": "✈️",
        "docs": [
            {"id": "programare_consulat", "name": "Programare Interviu Consulat", "required": True, "has_expiry": False},
            {"id": "interviu_rezultat", "name": "Dată Interviu + Rezultat", "required": True, "has_expiry": False},
            {"id": "asigurare_calatorie", "name": "Asigurare Medicală Călătorie", "required": True, "has_expiry": True},
            {"id": "scrisoare_garantie", "name": "Scrisoare de Garanție", "required": True, "has_expiry": False},
            {"id": "contract_comodat_viza", "name": "Contract de Comodat", "required": True, "has_expiry": False},
            {"id": "draft_contract", "name": "Draft Contract de Muncă", "required": True, "has_expiry": False},
            {"id": "oferta_angajare", "name": "Ofertă Fermă de Angajare", "required": True, "has_expiry": False},
            {"id": "bilet_avion", "name": "Rezervare Bilet Avion", "required": True, "has_expiry": False}
        ]
    },
    "permit": {
        "title": "Permis de Ședere (Card)",
        "icon": "🪪",
        "docs": [
            {"id": "programare_sedere", "name": "Data Programare IGI (Permis Ședere)", "required": True, "has_expiry": False},
            {"id": "taxa_sedere", "name": "Taxă Emitere Permis Ședere (259 lei)", "required": True, "has_expiry": False},
            {"id": "copie_viza", "name": "Copie Viză + Ștampilă Intrare", "required": True, "has_expiry": False},
            {"id": "cim_sedere", "name": "Contract Individual de Muncă", "required": True, "has_expiry": False},
            {"id": "copie_aviz", "name": "Copie Aviz de Muncă", "required": True, "has_expiry": False},
            {"id": "revisal_copie", "name": "REVISAL (copie ștampilată)", "required": True, "has_expiry": False},
            {"id": "data_permis", "name": "Dată Eliberare Permis Ședere", "required": False, "has_expiry": True},
            {"id": "valabilitate_sedere", "name": "Valabilitate Permis Ședere (1–5 ani)", "required": True, "has_expiry": True}
        ]
    },
    "employment": {
        "title": "Angajare & Post-Sosire",
        "icon": "📝",
        "docs": [
            {"id": "cim_semnat", "name": "Contract Individual de Muncă (semnat)", "required": True, "has_expiry": True},
            {"id": "revisal", "name": "REVISAL (înregistrare)", "required": True, "has_expiry": False},
            {"id": "adeverinta_salariat", "name": "Adeverință Salariat", "required": True, "has_expiry": False},
            {"id": "contract_comodat", "name": "Contract de Comodat (cazare)", "required": True, "has_expiry": True},
            {"id": "adeverinta_med_post", "name": "Adeverință Medicală Post-Sosire", "required": True, "has_expiry": True}
        ]
    },
    "company": {
        "title": "Acte Companie",
        "icon": "🏢",
        "docs": [
            {"id": "cerere_igi", "name": "Cerere către IGI (Bifare)", "required": True, "has_expiry": False},
            {"id": "imputernicire", "name": "Împuternicire", "required": True, "has_expiry": False},
            {"id": "cui_doc", "name": "CUI (Cod Unic Înregistrare)", "required": True, "has_expiry": False},
            {"id": "onrc", "name": "Certificat ONRC (valabil 30 zile)", "required": True, "has_expiry": True},
            {"id": "anaf", "name": "Certificat Atestare Fiscală ANAF (30 zile)", "required": True, "has_expiry": True},
            {"id": "cazier_pj", "name": "Cazier Persoană Juridică (6 luni)", "required": True, "has_expiry": True},
            {"id": "organigrama", "name": "Organigramă", "required": True, "has_expiry": False},
            {"id": "fisa_post", "name": "Fișa Postului", "required": True, "has_expiry": False},
            {"id": "anunt_piata", "name": "Dovadă Publicare Anunț Piața Internă", "required": True, "has_expiry": False},
            {"id": "pv_selectie", "name": "Proces Verbal Selecție + Ofertă Fermă", "required": True, "has_expiry": False}
        ]
    }
}

@api_router.get("/immigration", response_model=List[ImmigrationCase])
async def get_immigration_cases(status: Optional[str] = None, candidate_id: Optional[str] = None):
    query = {}
    if status:
        query["status"] = status
    if candidate_id:
        query["candidate_id"] = candidate_id
    cases = await db.immigration_cases.find(query, {"_id": 0}).to_list(1000)
    return [serialize_doc(c) for c in cases]

@api_router.get("/immigration/stages")
async def get_immigration_stages():
    return {"stages": IMMIGRATION_STAGES}

@api_router.get("/immigration/documents-template")
async def get_documents_template():
    """Returnează structura documentelor pentru un dosar nou"""
    return IMMIGRATION_DOCUMENTS

@api_router.get("/immigration/{case_id}")
async def get_immigration_case(case_id: str):
    """Get detailed immigration case with all documents"""
    case = await db.immigration_cases.find_one({"id": case_id}, {"_id": 0})
    if not case:
        raise HTTPException(status_code=404, detail="Dosarul nu a fost găsit")
    
    # Get candidate info
    if case.get('candidate_id'):
        candidate = await db.candidates.find_one({"id": case['candidate_id']}, {"_id": 0})
        if candidate:
            case['candidate_details'] = {
                'first_name': candidate.get('first_name'),
                'last_name': candidate.get('last_name'),
                'nationality': candidate.get('nationality'),
                'passport_number': candidate.get('passport_number'),
                'passport_expiry': candidate.get('passport_expiry'),
                'job_type': candidate.get('job_type'),
                'phone': candidate.get('phone'),
                'email': candidate.get('email')
            }
    
    # Get company info
    if case.get('company_id'):
        company = await db.companies.find_one({"id": case['company_id']}, {"_id": 0})
        if company:
            case['company_details'] = {
                'name': company.get('name'),
                'cui': company.get('cui'),
                'city': company.get('city'),
                'industry': company.get('industry'),
                'contact_person': company.get('contact_person'),
                'phone': company.get('phone')
            }
    
    # Initialize documents if not present
    if not case.get('documents'):
        case['documents'] = {}
        for category, category_data in IMMIGRATION_DOCUMENTS.items():
            case['documents'][category] = {
                'title': category_data['title'],
                'icon': category_data['icon'],
                'docs': []
            }
            for doc in category_data['docs']:
                case['documents'][category]['docs'].append({
                    'id': doc['id'],
                    'name': doc['name'],
                    'required': doc['required'],
                    'has_expiry': doc['has_expiry'],
                    'status': 'missing',
                    'issue_date': None,
                    'expiry_date': None,
                    'notes': None
                })
    
    # Initialize history if not present
    if not case.get('history'):
        case['history'] = [{
            'date': case.get('created_at', datetime.now(timezone.utc).isoformat())[:10],
            'action': 'Dosar creat în sistem',
            'user': case.get('assigned_to', 'Sistem'),
            'icon': '⚪'
        }]
    
    # Calculate document stats
    total_docs = 0
    complete_docs = 0
    for category in case.get('documents', {}).values():
        for doc in category.get('docs', []):
            if doc.get('required', True):
                total_docs += 1
                if doc.get('status') in ['present', 'expiring']:
                    complete_docs += 1
    
    case['documents_total'] = total_docs
    case['documents_complete'] = complete_docs
    case['completion_percentage'] = round((complete_docs / total_docs * 100) if total_docs > 0 else 0)
    
    return serialize_doc(case)

@api_router.post("/immigration", response_model=ImmigrationCase)
async def create_immigration_case(input: ImmigrationCaseCreate):
    # Initialize documents structure
    documents = {}
    for category, category_data in IMMIGRATION_DOCUMENTS.items():
        documents[category] = {
            'title': category_data['title'],
            'icon': category_data['icon'],
            'docs': []
        }
        for doc in category_data['docs']:
            documents[category]['docs'].append({
                'id': doc['id'],
                'name': doc['name'],
                'required': doc['required'],
                'has_expiry': doc['has_expiry'],
                'status': 'missing',
                'issue_date': None,
                'expiry_date': None,
                'notes': None
            })
    
    # Initialize history
    history = [{
        'date': datetime.now(timezone.utc).strftime('%d.%m.%Y'),
        'action': 'Dosar creat în sistem GJC CRM',
        'user': input.assigned_to or 'Sistem',
        'icon': '⚪'
    }]
    
    case_data = input.model_dump()
    case_data['documents'] = documents
    case_data['history'] = history
    case_data['current_stage_name'] = IMMIGRATION_STAGES[0]
    
    case = ImmigrationCase(**case_data)
    doc = case.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.immigration_cases.insert_one(doc)
    return case

@api_router.patch("/immigration/{case_id}/advance")
async def advance_immigration_case(case_id: str):
    case = await db.immigration_cases.find_one({"id": case_id})
    if not case:
        raise HTTPException(status_code=404, detail="Dosarul nu a fost găsit")
    
    current_stage = case.get('current_stage', 1)
    if current_stage >= len(IMMIGRATION_STAGES):
        raise HTTPException(status_code=400, detail="Dosarul este deja la ultima etapă")
    
    new_stage = current_stage + 1
    new_status = "finalizat" if new_stage == len(IMMIGRATION_STAGES) else "în procesare"
    new_stage_name = IMMIGRATION_STAGES[new_stage - 1]
    
    # Add to history
    history = case.get('history', [])
    history.insert(0, {
        'date': datetime.now(timezone.utc).strftime('%d.%m.%Y'),
        'action': f'Dosar avansat la etapa: {new_stage_name}',
        'user': case.get('assigned_to', 'Sistem'),
        'icon': '🟢'
    })
    
    await db.immigration_cases.update_one(
        {"id": case_id},
        {"$set": {
            "current_stage": new_stage, 
            "status": new_status,
            "current_stage_name": new_stage_name,
            "history": history
        }}
    )
    
    return {
        "message": f"Dosar avansat la etapa {new_stage}: {new_stage_name}",
        "current_stage": new_stage,
        "stage_name": new_stage_name
    }

@api_router.patch("/immigration/{case_id}/document")
async def update_case_document(case_id: str, doc_update: dict):
    """Update a specific document in the case"""
    case = await db.immigration_cases.find_one({"id": case_id})
    if not case:
        raise HTTPException(status_code=404, detail="Dosarul nu a fost găsit")
    
    category = doc_update.get('category')
    doc_id = doc_update.get('doc_id')
    
    if not category or not doc_id:
        raise HTTPException(status_code=400, detail="Categoria și ID-ul documentului sunt obligatorii")
    
    documents = case.get('documents', {})
    if category not in documents:
        raise HTTPException(status_code=404, detail="Categoria nu a fost găsită")
    
    # Find and update the document
    doc_found = False
    for doc in documents[category].get('docs', []):
        if doc['id'] == doc_id:
            doc['status'] = doc_update.get('status', doc.get('status', 'missing'))
            doc['issue_date'] = doc_update.get('issue_date', doc.get('issue_date'))
            doc['expiry_date'] = doc_update.get('expiry_date', doc.get('expiry_date'))
            doc['notes'] = doc_update.get('notes', doc.get('notes'))
            doc_found = True
            break
    
    if not doc_found:
        raise HTTPException(status_code=404, detail="Documentul nu a fost găsit")
    
    # Add to history
    history = case.get('history', [])
    doc_name = next((d['name'] for d in documents[category]['docs'] if d['id'] == doc_id), doc_id)
    status_text = "adăugat la dosar" if doc_update.get('status') == 'present' else "actualizat"
    history.insert(0, {
        'date': datetime.now(timezone.utc).strftime('%d.%m.%Y'),
        'action': f'{doc_name} — {status_text}',
        'user': doc_update.get('user', 'Operator'),
        'icon': '🟢' if doc_update.get('status') == 'present' else '🔵'
    })
    
    await db.immigration_cases.update_one(
        {"id": case_id},
        {"$set": {"documents": documents, "history": history}}
    )
    
    return {"message": "Document actualizat cu succes"}

@api_router.delete("/immigration/{case_id}")
async def delete_immigration_case(case_id: str):
    result = await db.immigration_cases.delete_one({"id": case_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Dosarul nu a fost găsit")
    return {"message": "Dosar șters cu succes"}

# ===================== PIPELINE =====================

@api_router.get("/pipeline", response_model=List[PipelineOpportunity])
async def get_pipeline(stage: Optional[str] = None):
    query = {}
    if stage:
        query["stage"] = stage
    opportunities = await db.pipeline.find(query, {"_id": 0}).to_list(1000)
    return [serialize_doc(o) for o in opportunities]

@api_router.post("/pipeline", response_model=PipelineOpportunity)
async def create_opportunity(input: dict):
    opportunity = PipelineOpportunity(**input)
    doc = opportunity.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.pipeline.insert_one(doc)
    return opportunity

@api_router.put("/pipeline/{opp_id}")
async def update_opportunity(opp_id: str, input: dict):
    existing = await db.pipeline.find_one({"id": opp_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Oportunitatea nu a fost găsită")
    await db.pipeline.update_one({"id": opp_id}, {"$set": input})
    updated = await db.pipeline.find_one({"id": opp_id}, {"_id": 0})
    return serialize_doc(updated)

@api_router.delete("/pipeline/{opp_id}")
async def delete_opportunity(opp_id: str):
    result = await db.pipeline.delete_one({"id": opp_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Oportunitatea nu a fost găsită")
    return {"message": "Oportunitate ștearsă cu succes"}

# ===================== DOCUMENTS =====================

@api_router.get("/documents", response_model=List[Document])
async def get_documents(candidate_id: Optional[str] = None, doc_type: Optional[str] = None):
    query = {}
    if candidate_id:
        query["candidate_id"] = candidate_id
    if doc_type:
        query["doc_type"] = doc_type
    documents = await db.documents.find(query, {"_id": 0}).to_list(1000)
    return [serialize_doc(d) for d in documents]

@api_router.post("/documents", response_model=Document)
async def create_document(input: dict):
    document = Document(**input)
    doc = document.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.documents.insert_one(doc)
    return document

@api_router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str):
    result = await db.documents.delete_one({"id": doc_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Documentul nu a fost găsit")
    return {"message": "Document șters cu succes"}

# ===================== ALERTS =====================

@api_router.get("/alerts")
async def get_all_alerts():
    """Get all system alerts - documents expiring in 90 days or already expired"""
    alerts = []
    today = datetime.now(timezone.utc).date()
    alert_date_future = (today + timedelta(days=90)).isoformat()
    alert_date_past = (today - timedelta(days=365)).isoformat()  # Include ultimul an de expirări
    
    # Get all candidates with passport or permit expiry dates
    candidates = await db.candidates.find({
        "$or": [
            {"passport_expiry": {"$ne": None}},
            {"permit_expiry": {"$ne": None}}
        ]
    }, {"_id": 0}).to_list(1000)
    
    for c in candidates:
        # Passport alerts
        if c.get('passport_expiry'):
            try:
                exp_date = datetime.fromisoformat(c['passport_expiry']).date()
                days = (exp_date - today).days
                
                # Include if expiring within 90 days OR already expired (up to 1 year)
                if days <= 90 and days >= -365:
                    if days < 0:
                        priority = "urgent"  # Already expired
                        message = f"Pașaport EXPIRAT de {abs(days)} zile"
                    elif days <= 30:
                        priority = "urgent"  # Critical - under 30 days
                        message = f"Pașaport expiră în {days} zile"
                    elif days <= 60:
                        priority = "warning"  # Warning - 30-60 days
                        message = f"Pașaport expiră în {days} zile"
                    else:
                        priority = "info"  # Info - 60-90 days
                        message = f"Pașaport expiră în {days} zile"
                    
                    alerts.append({
                        "id": str(uuid.uuid4()),
                        "type": "passport_expiry",
                        "entity_type": "candidate",
                        "entity_id": c['id'],
                        "entity_name": f"{c['first_name']} {c['last_name']}",
                        "message": message,
                        "expiry_date": c['passport_expiry'],
                        "days_until_expiry": days,
                        "priority": priority,
                        "company_name": c.get('company_name', '')
                    })
            except:
                pass
        
        # Permit alerts
        if c.get('permit_expiry'):
            try:
                exp_date = datetime.fromisoformat(c['permit_expiry']).date()
                days = (exp_date - today).days
                
                # Include if expiring within 90 days OR already expired (up to 1 year)
                if days <= 90 and days >= -365:
                    if days < 0:
                        priority = "urgent"  # Already expired
                        message = f"Permis de muncă EXPIRAT de {abs(days)} zile"
                    elif days <= 30:
                        priority = "urgent"  # Critical - under 30 days
                        message = f"Permis de muncă expiră în {days} zile"
                    elif days <= 60:
                        priority = "warning"  # Warning - 30-60 days
                        message = f"Permis de muncă expiră în {days} zile"
                    else:
                        priority = "info"  # Info - 60-90 days
                        message = f"Permis de muncă expiră în {days} zile"
                    
                    alerts.append({
                        "id": str(uuid.uuid4()),
                        "type": "permit_expiry",
                        "entity_type": "candidate",
                        "entity_id": c['id'],
                        "entity_name": f"{c['first_name']} {c['last_name']}",
                        "message": message,
                        "expiry_date": c['permit_expiry'],
                        "days_until_expiry": days,
                        "priority": priority,
                        "company_name": c.get('company_name', '')
                    })
            except:
                pass
    
    # Sort by priority (urgent first) then by days until expiry
    priority_order = {"urgent": 0, "warning": 1, "info": 2}
    return sorted(alerts, key=lambda x: (priority_order.get(x['priority'], 3), x['days_until_expiry']))

# ===================== ANAF CUI LOOKUP =====================

@api_router.get("/anaf/{cui}")
async def lookup_anaf(cui: str):
    """Lookup company by CUI from ANAF API"""
    try:
        # Clean CUI - remove RO prefix and spaces
        clean_cui = cui.replace("RO", "").replace("ro", "").strip()
        
        if not clean_cui.isdigit():
            return {"success": False, "error": "CUI invalid - trebuie să conțină doar cifre"}
        
        today = datetime.now().strftime("%Y-%m-%d")
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Step 1: Submit async request to ANAF
            response = await client.post(
                "https://webservicesp.anaf.ro/AsynchWebService/api/v8/ws/tva",
                json=[{"cui": int(clean_cui), "data": today}],
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code != 200:
                return {"success": False, "error": f"Eroare ANAF: {response.status_code}"}
            
            data = response.json()
            correlation_id = data.get("correlationId")
            
            if not correlation_id:
                return {"success": False, "error": "Nu s-a putut inițializa cererea ANAF"}
            
            # Step 2: Wait for processing
            import asyncio
            await asyncio.sleep(3)
            
            # Step 3: Get results
            result_response = await client.get(
                f"https://webservicesp.anaf.ro/AsynchWebService/api/v8/ws/tva?id={correlation_id}"
            )
            
            if result_response.status_code != 200:
                return {"success": False, "error": "Nu s-a putut obține răspunsul de la ANAF"}
            
            result_data = result_response.json()
            
            # Check for found companies
            found_list = result_data.get("found", [])
            if found_list and len(found_list) > 0:
                company_data = found_list[0]
                
                # Get general data
                date_generale = company_data.get("date_generale", {})
                
                # Extract address and city
                adresa = date_generale.get("adresa", "") or ""
                city = ""
                if adresa:
                    # Romanian address format: JUD. X, SAT/ORAȘ Y, STRADA Z
                    parts = [p.strip() for p in adresa.split(",")]
                    for part in parts:
                        if "JUD." in part.upper():
                            city = part.replace("JUD.", "").replace("jud.", "").strip()
                            break
                        elif any(x in part.upper() for x in ["SAT ", "ORAȘ", "ORAȘ", "MUN.", "COM."]):
                            city = part.strip()
                            break
                    if not city and len(parts) > 1:
                        city = parts[1].strip()
                
                # Get TVA status
                inregistrare_tva = company_data.get("inregistrare_scop_Tva", {})
                is_tva_payer = inregistrare_tva.get("scpTVA", False) if inregistrare_tva else False
                
                return {
                    "success": True,
                    "data": {
                        "name": date_generale.get("denumire", ""),
                        "cui": f"RO{clean_cui}",
                        "address": adresa,
                        "city": city or "România",
                        "phone": date_generale.get("telefon", ""),
                        "nrRegCom": date_generale.get("nrRegCom", ""),
                        "status_tva": "Plătitor TVA" if is_tva_payer else "Neplătitor TVA",
                        "status": "activ" if "INREGISTRAT" in date_generale.get("stare_inregistrare", "").upper() else "inactiv",
                        "cod_CAEN": date_generale.get("cod_CAEN", ""),
                        "data_inregistrare": date_generale.get("data_inregistrare", "")
                    }
                }
            
            # Check for not found
            notfound_list = result_data.get("notfound", [])
            if notfound_list:
                return {"success": False, "error": "CUI nu a fost găsit în baza de date ANAF"}
            
            return {"success": False, "error": "Răspuns neașteptat de la ANAF"}
            
    except ValueError as e:
        return {"success": False, "error": "CUI invalid - trebuie să conțină doar cifre"}
    except httpx.TimeoutException:
        return {"success": False, "error": "Timeout la comunicarea cu ANAF. Încercați din nou."}
    except Exception as e:
        logger.error(f"ANAF lookup error: {type(e).__name__}: {e}")
        return {"success": False, "error": f"Eroare la comunicarea cu ANAF: {type(e).__name__}"}

# ===================== SEED DATA =====================

@api_router.post("/seed")
async def seed_database():
    """Seed database with demo data for GJC"""
    
    # Clear existing data
    await db.companies.delete_many({})
    await db.candidates.delete_many({})
    await db.immigration_cases.delete_many({})
    await db.pipeline.delete_many({})
    await db.documents.delete_many({})
    
    # Sample companies (46 as per document)
    companies_data = [
        {"id": "comp-1", "name": "Da Vinci Construct SRL", "cui": "RO12345678", "city": "București", "industry": "Construcții", "contact_person": "Mihai Popescu", "phone": "0721234567", "email": "contact@davinci.ro", "status": "activ"},
        {"id": "comp-2", "name": "Balearia Food SRL", "cui": "RO23456789", "city": "Constanța", "industry": "HoReCa", "contact_person": "Ana Ionescu", "phone": "0731234567", "email": "hr@balearia.ro", "status": "activ"},
        {"id": "comp-3", "name": "TechBuild Romania", "cui": "RO34567890", "city": "Cluj-Napoca", "industry": "Construcții", "contact_person": "Ion Georgescu", "phone": "0741234567", "email": "jobs@techbuild.ro", "status": "activ"},
        {"id": "comp-4", "name": "AgroFarm SRL", "cui": "RO45678901", "city": "Timișoara", "industry": "Agricultură", "contact_person": "Maria Dumitrescu", "phone": "0751234567", "email": "hr@agrofarm.ro", "status": "activ"},
        {"id": "comp-5", "name": "MetalWorks SA", "cui": "RO56789012", "city": "Oradea", "industry": "Industrie", "contact_person": "Vasile Marin", "phone": "0761234567", "email": "angajari@metalworks.ro", "status": "activ"},
        {"id": "comp-6", "name": "TransLog International", "cui": "RO67890123", "city": "Brașov", "industry": "Transport", "contact_person": "Elena Stan", "phone": "0771234567", "email": "hr@translog.ro", "status": "activ"},
        {"id": "comp-7", "name": "FoodService Plus", "cui": "RO78901234", "city": "Iași", "industry": "HoReCa", "contact_person": "Dan Vasilescu", "phone": "0781234567", "email": "jobs@foodservice.ro", "status": "activ"},
        {"id": "comp-8", "name": "BuildPro SRL", "cui": "RO89012345", "city": "Sibiu", "industry": "Construcții", "contact_person": "Andrei Popa", "phone": "0791234567", "email": "recrutare@buildpro.ro", "status": "activ"},
    ]
    
    for comp in companies_data:
        comp['created_at'] = datetime.now(timezone.utc).isoformat()
        await db.companies.insert_one(comp)
    
    # Sample candidates (234 as per document - we'll create representative sample)
    nationalities = ["Nepal"] * 20 + ["India"] * 3 + ["Filipine"] * 2 + ["Sri Lanka"] * 2 + ["Nigeria"] * 3
    job_types = ["Muncitor construcții", "Bucătar", "Ospătar", "Șofer", "Muncitor agricol", "Sudor", "Electrician"]
    statuses = ["activ", "în procesare", "plasat", "inactiv"]
    
    nepali_first_names = ["Ram", "Shyam", "Krishna", "Binod", "Suresh", "Rajesh", "Dipak", "Prakash", "Sanjay", "Bikash"]
    nepali_last_names = ["Sharma", "Thapa", "Gurung", "Tamang", "Rai", "Limbu", "Magar", "Sherpa", "Karki", "Basnet"]
    
    candidates_data = []
    today = datetime.now(timezone.utc).date()
    
    for i in range(30):  # Create 30 demo candidates
        nationality = nationalities[i % len(nationalities)]
        
        if nationality == "Nepal":
            first_name = nepali_first_names[i % len(nepali_first_names)]
            last_name = nepali_last_names[i % len(nepali_last_names)]
        elif nationality == "India":
            first_name = ["Raj", "Amit", "Vikram"][i % 3]
            last_name = ["Kumar", "Singh", "Patel"][i % 3]
        elif nationality == "Filipine":
            first_name = ["Juan", "Jose"][i % 2]
            last_name = ["Santos", "Garcia"][i % 2]
        elif nationality == "Nigeria":
            first_name = ["Emmanuel", "David", "John"][i % 3]
            last_name = ["Okonkwo", "Adeyemi", "Ibrahim"][i % 3]
        else:
            first_name = ["Chaminda", "Nuwan"][i % 2]
            last_name = ["Perera", "Silva"][i % 2]
        
        # Some with expiring documents for alerts
        passport_days = [20, 45, 75, 120, 200][i % 5]
        permit_days = [15, 35, 60, 100, 180][i % 5]
        
        candidate = {
            "id": f"cand-{i+1}",
            "first_name": first_name,
            "last_name": last_name,
            "nationality": nationality,
            "passport_number": f"P{nationality[:2].upper()}{100000 + i}",
            "passport_expiry": (today + timedelta(days=passport_days)).isoformat(),
            "permit_expiry": (today + timedelta(days=permit_days)).isoformat(),
            "phone": f"+40 7{i%10}0 {100+i} {200+i}",
            "email": f"{first_name.lower()}.{last_name.lower()}@email.com",
            "job_type": job_types[i % len(job_types)],
            "status": statuses[i % len(statuses)],
            "company_id": f"comp-{(i % 8) + 1}",
            "company_name": companies_data[i % 8]["name"],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        candidates_data.append(candidate)
        await db.candidates.insert_one(candidate)
    
    # Sample immigration cases
    case_types = ["Permis de muncă", "Viză de lungă ședere", "Reînnoire permis", "Reunificare familială"]
    
    for i in range(10):
        case = {
            "id": f"case-{i+1}",
            "candidate_id": f"cand-{i+1}",
            "candidate_name": f"{candidates_data[i]['first_name']} {candidates_data[i]['last_name']}",
            "company_id": candidates_data[i]["company_id"],
            "company_name": candidates_data[i]["company_name"],
            "case_type": case_types[i % len(case_types)],
            "status": ["initiat", "în procesare", "în procesare", "finalizat"][i % 4],
            "current_stage": (i % 8) + 1,
            "submitted_date": (today - timedelta(days=30 + i*5)).isoformat(),
            "deadline": (today + timedelta(days=60 - i*5)).isoformat(),
            "assigned_to": "Ioan Baciu",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.immigration_cases.insert_one(case)
    
    # Sample pipeline opportunities
    stages = ["lead", "contact", "negociere", "contract", "câștigat"]
    
    for i in range(8):
        opportunity = {
            "id": f"opp-{i+1}",
            "title": f"Plasare {[5, 10, 15, 20, 8, 12, 6, 25][i]} muncitori - {companies_data[i]['name']}",
            "company_id": f"comp-{i+1}",
            "company_name": companies_data[i]["name"],
            "stage": stages[i % len(stages)],
            "value": [25000, 50000, 75000, 100000, 40000, 60000, 30000, 125000][i],
            "positions": [5, 10, 15, 20, 8, 12, 6, 25][i],
            "filled": [3, 7, 10, 15, 5, 8, 4, 18][i],
            "probability": [20, 40, 60, 80, 30, 50, 25, 90][i],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.pipeline.insert_one(opportunity)
    
    return {
        "message": "Baza de date populată cu succes!",
        "seeded": {
            "companies": len(companies_data),
            "candidates": len(candidates_data),
            "immigration_cases": 10,
            "pipeline_opportunities": 8
        }
    }

# ===================== HEALTH & ROOT =====================

@api_router.get("/")
async def root():
    return {"message": "GJC AI-CRM API v2.0", "status": "operational"}

@api_router.get("/health")
async def health():
    return {"status": "healthy", "version": "2.0", "database": "connected"}

# Include router
app.include_router(api_router)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup_event():
    """Create default admin user on startup"""
    # Check if admin user exists
    admin_email = "ioan@gjc.ro"
    admin_exists = await db.users.find_one({"email": admin_email})
    
    if not admin_exists:
        admin_user = {
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "password_hash": get_password_hash("GJC2026admin"),
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(admin_user)
        logger.info(f"Admin user created: {admin_email}")
    else:
        logger.info(f"Admin user already exists: {admin_email}")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
