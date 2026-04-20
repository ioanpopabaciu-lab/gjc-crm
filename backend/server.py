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
import smtplib
import asyncio
import imaplib
import email as email_lib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from apscheduler.schedulers.asyncio import AsyncIOScheduler

scheduler = AsyncIOScheduler()
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
    model_config = ConfigDict(extra="allow")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    cui: Optional[str] = None
    city: Optional[str] = None
    county: Optional[str] = None
    reg_commerce: Optional[str] = None
    industry: Optional[str] = None
    industry_category: Optional[str] = None  # Construcții, HoReCa, Agricultură, etc.
    positions_needed: Optional[int] = None  # Nr. posturi cerute
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    status: str = "activ"
    notes: Optional[str] = None
    # Stats (calculate la cerere)
    candidates_count: Optional[int] = None
    placed_count: Optional[int] = None
    avize_count: Optional[int] = None
    active_cases: Optional[int] = None
    approved_cases: Optional[int] = None
    programari_count: Optional[int] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CompanyCreate(BaseModel):
    name: str
    cui: Optional[str] = None
    city: Optional[str] = None
    county: Optional[str] = None
    reg_commerce: Optional[str] = None
    industry: Optional[str] = None
    industry_category: Optional[str] = None
    positions_needed: Optional[int] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    status: str = "activ"
    notes: Optional[str] = None

class Candidate(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    nationality: Optional[str] = None
    passport_number: Optional[str] = None
    passport_expiry: Optional[str] = None
    permit_expiry: Optional[str] = None
    birth_date: Optional[str] = None
    birth_country: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    job_type: Optional[str] = None
    status: str = "activ"
    company_id: Optional[str] = None
    company_name: Optional[str] = None
    # ETAPA 1 — campuri noi
    service_type: Optional[str] = None  # "recrutare" | "imigrare_directa"
    source_partner_id: Optional[str] = None
    source_partner_name: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CandidateCreate(BaseModel):
    first_name: str
    last_name: str
    nationality: Optional[str] = None
    passport_number: Optional[str] = None
    passport_expiry: Optional[str] = None
    permit_expiry: Optional[str] = None
    birth_date: Optional[str] = None
    birth_country: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    job_type: Optional[str] = None
    status: str = "activ"
    company_id: Optional[str] = None
    company_name: Optional[str] = None
    service_type: Optional[str] = None
    source_partner_id: Optional[str] = None
    source_partner_name: Optional[str] = None
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
    model_config = ConfigDict(extra="allow")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    candidate_id: str
    candidate_name: Optional[str] = None
    company_id: Optional[str] = None
    company_name: Optional[str] = None
    # NEW: Link to application (shadow structure)
    application_id: Optional[str] = None
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
    application_id: Optional[str] = None  # NEW: optional link
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

class Operator(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    phone: str
    email: Optional[str] = None
    role: Optional[str] = None
    active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Partner(BaseModel):
    """Agenție externă parteneră (sursă candidați)"""
    model_config = ConfigDict(extra="allow")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    country: str
    city: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    commission_pct: Optional[float] = None
    specialization: Optional[str] = None  # ex: "Construcții, HoReCa"
    candidates_sent: int = 0
    candidates_placed: int = 0
    status: str = "activ"
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PartnerCreate(BaseModel):
    name: str
    country: str
    city: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    commission_pct: Optional[float] = None
    specialization: Optional[str] = None
    status: str = "activ"
    notes: Optional[str] = None

class Contract(BaseModel):
    """Contract de mediere sau prestări servicii"""
    model_config = ConfigDict(extra="allow")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str = "contract_mediere"  # contract_mediere | contract_prestari
    candidate_id: Optional[str] = None
    candidate_name: Optional[str] = None
    company_id: Optional[str] = None
    company_name: Optional[str] = None
    value: Optional[float] = None
    currency: str = "EUR"
    date_signed: Optional[str] = None
    validity_months: Optional[int] = None
    status: str = "activ"  # activ, expirat, reziliat
    pdf_file: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ContractCreate(BaseModel):
    type: str = "contract_mediere"
    candidate_id: Optional[str] = None
    candidate_name: Optional[str] = None
    company_id: Optional[str] = None
    company_name: Optional[str] = None
    value: Optional[float] = None
    currency: str = "EUR"
    date_signed: Optional[str] = None
    validity_months: Optional[int] = None
    status: str = "activ"
    notes: Optional[str] = None

class Payment(BaseModel):
    """Plată primită de la candidat sau firmă"""
    model_config = ConfigDict(extra="allow")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str = "candidat"  # candidat | firma
    entity_id: Optional[str] = None
    entity_name: Optional[str] = None
    amount: float = 0
    currency: str = "EUR"
    date_received: Optional[str] = None
    invoice_number: Optional[str] = None
    status: str = "platit"  # platit, partial, neplatit
    method: Optional[str] = None  # transfer, cash, card
    contract_id: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PaymentCreate(BaseModel):
    type: str = "candidat"
    entity_id: Optional[str] = None
    entity_name: Optional[str] = None
    amount: float = 0
    currency: str = "EUR"
    date_received: Optional[str] = None
    invoice_number: Optional[str] = None
    status: str = "platit"
    method: Optional[str] = None
    contract_id: Optional[str] = None
    notes: Optional[str] = None

class Lead(BaseModel):
    """Lead B2B — companie prospect pentru servicii GJC"""
    model_config = ConfigDict(extra="allow")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    city: Optional[str] = None
    source: Optional[str] = None  # referral, website, linkedin, telefon, etc.
    responsible: Optional[str] = None
    industry: Optional[str] = None
    positions_needed: Optional[int] = None
    estimated_value: Optional[float] = None
    stage: str = "prospect"  # prospect, contactat, intalnire, oferta, negociere, castigat, pierdut
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class LeadCreate(BaseModel):
    company_name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    city: Optional[str] = None
    source: Optional[str] = None
    responsible: Optional[str] = None
    industry: Optional[str] = None
    positions_needed: Optional[int] = None
    estimated_value: Optional[float] = None
    stage: str = "prospect"
    notes: Optional[str] = None

class Interview(BaseModel):
    """Interviu planificat sau realizat"""
    model_config = ConfigDict(extra="allow")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    candidate_id: str
    candidate_name: Optional[str] = None
    company_id: Optional[str] = None
    company_name: Optional[str] = None
    job_title: Optional[str] = None
    case_id: Optional[str] = None
    scheduled_date: Optional[str] = None
    scheduled_time: Optional[str] = None
    interview_type: str = "tehnic"  # tehnic, hr, online, telefon, final
    status: str = "programat"  # programat, realizat, anulat, reprogramat
    result: Optional[str] = None  # admis, respins, in_asteptare
    assigned_to: Optional[str] = None
    notes: Optional[str] = None
    interview_location: Optional[str] = None
    interviewer_name: Optional[str] = None
    interviewer_contact: Optional[str] = None
    candidate_experience: Optional[str] = None
    job_id: Optional[str] = None
    feedback: Optional[str] = None
    interview_link: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class InterviewCreate(BaseModel):
    candidate_id: str
    candidate_name: Optional[str] = None
    company_id: Optional[str] = None
    company_name: Optional[str] = None
    job_title: Optional[str] = None
    case_id: Optional[str] = None
    scheduled_date: Optional[str] = None
    scheduled_time: Optional[str] = None
    interview_type: str = "tehnic"
    status: str = "programat"
    result: Optional[str] = None
    assigned_to: Optional[str] = None
    notes: Optional[str] = None
    interview_location: Optional[str] = None
    interviewer_name: Optional[str] = None
    interviewer_contact: Optional[str] = None
    candidate_experience: Optional[str] = None
    job_id: Optional[str] = None
    feedback: Optional[str] = None
    interview_link: Optional[str] = None

class Task(BaseModel):
    """Sarcină / reminder intern"""
    model_config = ConfigDict(extra="allow")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: Optional[str] = None
    entity_type: Optional[str] = None  # candidate, company, case, general, lead
    entity_id: Optional[str] = None
    entity_name: Optional[str] = None
    due_date: Optional[str] = None
    due_time: Optional[str] = "09:00"
    priority: str = "normal"  # urgent, high, normal, low
    status: str = "pending"  # pending, in_progress, done
    assigned_to: Optional[str] = None
    assigned_email: Optional[str] = None
    notify_24h: bool = True
    notify_3h: bool = True
    notify_sent_24h: bool = False
    notify_sent_3h: bool = False
    # Tip acțiune
    action_type: Optional[str] = "general"  # general, sunat, email, whatsapp, intalnire
    # Persoana de contactat
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    # Lead info
    lead_company: Optional[str] = None
    lead_contact_person: Optional[str] = None
    # Coleg colaborator
    collaborator: Optional[str] = None
    collaborator_email: Optional[str] = None
    # Creat de
    created_by_email: Optional[str] = None
    # Întâlnire
    meeting_scheduled: bool = False
    meeting_with: Optional[str] = None
    meeting_contact: Optional[str] = None
    meeting_materials: Optional[str] = None
    meeting_datetime: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    entity_name: Optional[str] = None
    due_date: Optional[str] = None
    due_time: Optional[str] = "09:00"
    priority: str = "normal"
    status: str = "pending"
    assigned_to: Optional[str] = None
    assigned_email: Optional[str] = None
    notify_24h: bool = True
    notify_3h: bool = True
    # Tip acțiune
    action_type: Optional[str] = "general"
    # Persoana de contactat
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    # Lead info
    lead_company: Optional[str] = None
    lead_contact_person: Optional[str] = None
    # Coleg colaborator
    collaborator: Optional[str] = None
    collaborator_email: Optional[str] = None
    # Creat de
    created_by_email: Optional[str] = None
    # Întâlnire
    meeting_scheduled: bool = False
    meeting_with: Optional[str] = None
    meeting_contact: Optional[str] = None
    meeting_materials: Optional[str] = None
    meeting_datetime: Optional[str] = None

class Placement(BaseModel):
    """Plasament finalizat — tracking post-plasare"""
    model_config = ConfigDict(extra="allow")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    candidate_id: str
    candidate_name: Optional[str] = None
    company_id: Optional[str] = None
    company_name: Optional[str] = None
    job_title: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    monthly_fee: Optional[float] = None
    fee_currency: str = "EUR"
    total_months: Optional[int] = None
    fees_collected: Optional[float] = None
    status: str = "activ"  # activ, finalizat, renuntat
    assigned_to: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PlacementCreate(BaseModel):
    candidate_id: str
    candidate_name: Optional[str] = None
    company_id: Optional[str] = None
    company_name: Optional[str] = None
    job_title: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    monthly_fee: Optional[float] = None
    fee_currency: str = "EUR"
    total_months: Optional[int] = None
    fees_collected: Optional[float] = None
    status: str = "activ"
    assigned_to: Optional[str] = None
    notes: Optional[str] = None

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

# ===================== JOB MODELS =====================

class Job(BaseModel):
    """Job position offered by a company"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str
    company_name: Optional[str] = None
    title: str
    description: Optional[str] = None
    requirements: Optional[str] = None  # Text description of requirements
    required_skills: List[str] = []
    required_experience_years: int = 0
    required_nationality: Optional[List[str]] = None
    # Job details
    location: Optional[str] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    currency: str = "EUR"
    headcount_needed: int = 1  # Renamed from positions_available
    positions_filled: int = 0
    # Status
    status: str = "activ"  # activ, pauza, inchis
    start_date: Optional[str] = None
    # Extra fields
    contract_type: Optional[str] = "full_time"  # full_time, part_time, sezonier, proiect
    accommodation: bool = False  # cazare inclusă
    meals: bool = False  # masă inclusă
    transport: bool = False  # transport inclus
    notes: Optional[str] = None
    contact_person: Optional[str] = None
    contact_phone: Optional[str] = None
    cor_code: Optional[str] = None
    cor_name: Optional[str] = None
    # Metadata
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class JobCreate(BaseModel):
    company_id: str
    company_name: Optional[str] = None
    title: str
    description: Optional[str] = None
    requirements: Optional[str] = None
    required_skills: List[str] = []
    required_experience_years: int = 0
    required_nationality: Optional[List[str]] = None
    location: Optional[str] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    currency: str = "EUR"
    headcount_needed: int = 1
    start_date: Optional[str] = None
    contract_type: Optional[str] = "full_time"
    accommodation: bool = False
    meals: bool = False
    transport: bool = False
    notes: Optional[str] = None
    contact_person: Optional[str] = None
    contact_phone: Optional[str] = None
    cor_code: Optional[str] = None
    cor_name: Optional[str] = None

class Application(BaseModel):
    """Application linking candidate to job"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    candidate_id: str
    candidate_name: Optional[str] = None
    job_id: str
    job_title: Optional[str] = None
    company_id: Optional[str] = None
    company_name: Optional[str] = None
    # Status: applied, shortlisted, hired, rejected
    status: str = "applied"
    # AI Matching scores (optional, for compatibility)
    ai_match_score: float = 0.0  # 0-100
    skills_match: float = 0.0
    experience_match: float = 0.0
    availability_match: float = 0.0
    ai_reasoning: Optional[str] = None
    # Metadata
    applied_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None

class ImmigrationStageHistory(BaseModel):
    """Track history of immigration case stage transitions"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    case_id: str
    stage_name: str
    stage_number: int
    entered_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    exited_at: Optional[datetime] = None
    duration_days: Optional[int] = None
    notes: Optional[str] = None

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
    
    # Financial KPIs
    payments_agg = await db.payments.aggregate([
        {"$group": {"_id": "$status", "total": {"$sum": "$amount"}}}
    ]).to_list(10)
    total_collected = sum(p["total"] for p in payments_agg if p["_id"] == "platit")
    total_pending = sum(p["total"] for p in payments_agg if p["_id"] in ["partial", "neplatit"])

    contracts_agg = await db.contracts.aggregate([
        {"$group": {"_id": None, "total": {"$sum": "$value"}, "count": {"$sum": 1}}}
    ]).to_list(1)
    total_contracts_value = contracts_agg[0]["total"] if contracts_agg else 0

    active_placements = await db.placements.count_documents({"status": "activ"})
    pending_tasks = await db.tasks.count_documents({"status": {"$ne": "done"}})
    upcoming_interviews = await db.interviews.count_documents({"status": "programat"})

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
            "total_alerts": passport_alerts + permit_alerts,
            "total_collected": total_collected,
            "total_pending_payment": total_pending,
            "total_contracts_value": total_contracts_value,
            "active_placements": active_placements,
            "pending_tasks": pending_tasks,
            "upcoming_interviews": upcoming_interviews,
        },
        "nationalities": [{"nationality": n["_id"] or "Necunoscut", "count": n["count"]} for n in nationalities],
        "top_companies": [{"company": c["_id"], "placements": c["count"]} for c in top_companies]
    }

# ===================== COMPANIES =====================

@api_router.get("/companies", response_model=List[Company])
async def get_companies(status: Optional[str] = None, search: Optional[str] = None, with_stats: Optional[bool] = False):
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
    result = [serialize_doc(c) for c in companies]
    if with_stats:
        # Aggregation pe candidați - o singură interogare pentru toate companiile
        cand_stats = await db.candidates.aggregate([
            {"$match": {"company_id": {"$nin": [None, ""]}}},
            {"$group": {
                "_id": "$company_id",
                "total": {"$sum": 1},
                "plasat": {"$sum": {"$cond": [{"$eq": ["$status", "plasat"]}, 1, 0]}}
            }}
        ]).to_list(None)
        cand_map = {r["_id"]: r for r in cand_stats}

        # Aggregation pe dosare - o singură interogare pentru toate companiile
        case_stats = await db.immigration_cases.aggregate([
            {"$match": {"company_id": {"$nin": [None, ""]}}},
            {"$group": {
                "_id": "$company_id",
                "active": {"$sum": {"$cond": [{"$eq": ["$status", "activ"]}, 1, 0]}},
                "approved": {"$sum": {"$cond": [{"$eq": ["$status", "aprobat"]}, 1, 0]}},
                "avize": {"$sum": {"$cond": [{"$and": [{"$ne": ["$aviz_number", None]}, {"$ne": ["$aviz_number", ""]}]}, 1, 0]}}
            }}
        ]).to_list(None)
        case_map = {r["_id"]: r for r in case_stats}

        # Aggregation programari viitoare (appointment_date >= azi)
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        prog_stats = await db.candidates.aggregate([
            {"$match": {"company_id": {"$nin": [None, ""]}, "appointment_date": {"$gte": today_str}}},
            {"$group": {"_id": "$company_id", "total": {"$sum": 1}}}
        ]).to_list(None)
        prog_map = {r["_id"]: r["total"] for r in prog_stats}

        # Aggregation posturi vacante per companie
        jobs_stats = await db.jobs.aggregate([
            {"$match": {"company_id": {"$nin": [None, ""]}}},
            {"$group": {"_id": "$company_id", "total": {"$sum": 1}}}
        ]).to_list(None)
        jobs_map = {r["_id"]: r["total"] for r in jobs_stats}

        for comp in result:
            cid = comp.get("id")
            c = cand_map.get(cid, {})
            ic = case_map.get(cid, {})
            comp["candidates_count"] = c.get("total", 0)
            comp["placed_count"] = c.get("plasat", 0)
            comp["active_cases"] = ic.get("active", 0)
            comp["approved_cases"] = ic.get("approved", 0)
            comp["avize_count"] = ic.get("avize", 0)
            comp["programari_count"] = prog_map.get(cid, 0)
            comp["jobs_count"] = jobs_map.get(cid, 0)
    return result

@api_router.get("/companies/{company_id}/programari")
async def get_company_programari(company_id: str):
    """Returneaza candidatii cu programare viitoare pentru o companie"""
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    candidates = await db.candidates.find(
        {"company_id": company_id, "appointment_date": {"$gte": today_str}},
        {"_id": 0}
    ).sort("appointment_date", 1).to_list(None)
    return [serialize_doc(c) for c in candidates]

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
    
    # SHADOW ARCHITECTURE: Auto-create Job + Application when candidate is assigned to company
    old_company_id = existing.get("company_id")
    new_company_id = update_data.get("company_id")
    
    # If company assignment changed (new assignment or different company)
    if new_company_id and new_company_id != old_company_id:
        candidate_name = f"{update_data.get('first_name', existing.get('first_name', ''))} {update_data.get('last_name', existing.get('last_name', ''))}"
        company_name = update_data.get("company_name", "")
        job_type = update_data.get("job_type", existing.get("job_type"))
        
        # Auto-create job and application
        await auto_create_job_and_application(
            candidate_id=candidate_id,
            company_id=new_company_id,
            company_name=company_name,
            candidate_name=candidate_name,
            job_type=job_type
        )
    
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
async def get_immigration_cases(
    status: Optional[str] = None,
    candidate_id: Optional[str] = None,
    search: Optional[str] = None,
    company_id: Optional[str] = None,
    stage: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    query = {}
    if status:
        query["status"] = status
    if candidate_id:
        query["candidate_id"] = candidate_id
    if company_id:
        query["company_id"] = company_id
    if stage:
        try:
            query["current_stage"] = int(stage)
        except:
            query["current_stage_name"] = {"$regex": stage, "$options": "i"}
    if search:
        query["$or"] = [
            {"candidate_name": {"$regex": search, "$options": "i"}},
            {"company_name": {"$regex": search, "$options": "i"}},
            {"igi_number": {"$regex": search, "$options": "i"}},
            {"aviz_number": {"$regex": search, "$options": "i"}},
        ]
    if date_from:
        query.setdefault("submitted_date", {})["$gte"] = date_from
    if date_to:
        query.setdefault("submitted_date", {})["$lte"] = date_to
    cases = await db.immigration_cases.find(query, {"_id": 0}).sort("updated_at", -1).to_list(1000)
    return [serialize_doc(c) for c in cases]


@api_router.get("/immigration-stats")
async def get_immigration_stats(date_from: Optional[str] = None, date_to: Optional[str] = None):
    """Statistici dosare imigrare pentru rapoarte"""
    # Filtru opțional pe perioadă
    date_query = {}
    if date_from:
        date_query["$gte"] = date_from
    if date_to:
        date_query["$lte"] = date_to
    base_filter = {"submitted_date": date_query} if date_query else {}

    by_stage_agg = await db.immigration_cases.aggregate([
        {"$match": base_filter},
        {"$group": {"_id": "$current_stage_name", "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}}
    ]).to_list(100)
    by_company = await db.immigration_cases.aggregate([
        {"$match": base_filter},
        {"$group": {"_id": "$company_name", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ]).to_list(10)
    by_month = await db.immigration_cases.aggregate([
        {"$match": base_filter},
        {"$group": {"_id": {"$substr": ["$submitted_date", 0, 7]}, "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
        {"$limit": 24}
    ]).to_list(24)
    total = await db.immigration_cases.count_documents(base_filter)
    active_q = {**base_filter, "status": "activ"}
    approved_q = {**base_filter, "status": "aprobat"}
    rejected_q = {**base_filter, "status": "respins"}
    active_cases = await db.immigration_cases.count_documents(active_q)
    approved_cases = await db.immigration_cases.count_documents(approved_q)
    rejected_cases = await db.immigration_cases.count_documents(rejected_q)
    # by_stage as dict for easy frontend use
    stage_dict = {s["_id"] or "Necunoscut": s["count"] for s in by_stage_agg}
    return {
        "total_cases": total,
        "active_cases": active_cases,
        "approved_cases": approved_cases,
        "rejected_cases": rejected_cases,
        "by_stage": stage_dict,
        "by_stage_list": [{"stage": s["_id"], "count": s["count"]} for s in by_stage_agg],
        "top_companies": [{"name": c["_id"] or "Necunoscut", "cases": c["count"]} for c in by_company],
        "by_month": [{"month": m["_id"], "count": m["count"]} for m in by_month],
        "rata_aprobare": round((approved_cases / total * 100) if total else 0, 1),
    }

@api_router.get("/stats/cor")
async def get_cor_stats():
    """Statistici pe cod COR / funcție — câți candidați per funcție"""
    pipeline = [
        {"$match": {"cor_code": {"$nin": [None, ""]}}},
        {"$group": {
            "_id": {
                "cor_code": "$cor_code",
                "job_function": "$current_stage_name"
            },
            "count": {"$sum": 1}
        }},
        {"$sort": {"count": -1}}
    ]
    # Preferăm câmpul job_function din immigration_cases
    cor_agg = await db.immigration_cases.aggregate([
        {"$match": {"cor_code": {"$nin": [None, ""]}}},
        {"$group": {
            "_id": {
                "cor_code": "$cor_code",
                "job_function": "$job_function"
            },
            "count": {"$sum": 1}
        }},
        {"$sort": {"count": -1}},
        {"$limit": 50}
    ]).to_list(50)
    result = [
        {
            "cor_code": item["_id"]["cor_code"],
            "job_function": item["_id"]["job_function"] or "Necunoscut",
            "count": item["count"]
        }
        for item in cor_agg
    ]
    total_cu_cor = await db.immigration_cases.count_documents({"cor_code": {"$nin": [None, ""]}})
    return {"by_cor": result, "total_with_cor": total_cu_cor}

@api_router.get("/stats/avize")
async def get_avize_stats():
    """Statistici avize de muncă — total, pe companie, pe județ, pe funcție"""
    # Total avize emise (dosare cu aviz_number)
    total_avize = await db.immigration_cases.count_documents({"aviz_number": {"$nin": [None, ""]}})

    # Pe județ (county din companies)
    county_pipeline = [
        {"$match": {"county": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$county", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 20}
    ]
    by_county = await db.companies.aggregate(county_pipeline).to_list(20)

    # Top companii după număr avize
    company_pipeline = [
        {"$match": {"aviz_number": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$company_name", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 15}
    ]
    by_company = await db.immigration_cases.aggregate(company_pipeline).to_list(15)

    # Pe funcție COR
    cor_pipeline = [
        {"$match": {"job_function": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$job_function", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 15}
    ]
    by_function = await db.immigration_cases.aggregate(cor_pipeline).to_list(15)

    # Pe țară naștere (candidați)
    country_pipeline = [
        {"$match": {"birth_country": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$birth_country", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ]
    by_country = await db.candidates.aggregate(country_pipeline).to_list(10)

    # Avize pe lună
    month_pipeline = [
        {"$match": {"aviz_date": {"$nin": [None, ""]}}},
        {"$group": {"_id": {"$substr": ["$aviz_date", 0, 7]}, "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
        {"$limit": 24}
    ]
    by_month = await db.immigration_cases.aggregate(month_pipeline).to_list(24)

    return {
        "total_avize": total_avize,
        "by_county": [{"county": x["_id"], "count": x["count"]} for x in by_county],
        "by_company": [{"company": x["_id"] or "Necunoscut", "count": x["count"]} for x in by_company],
        "by_function": [{"function": x["_id"], "count": x["count"]} for x in by_function],
        "by_birth_country": [{"country": x["_id"], "count": x["count"]} for x in by_country],
        "by_month": [{"month": x["_id"], "count": x["count"]} for x in by_month]
    }

@api_router.get("/stats/candidates")
async def get_candidates_stats():
    """Statistici candidați — total per status, naționalitate, companie, funcție"""
    total = await db.candidates.count_documents({})
    by_status = await db.candidates.aggregate([
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]).to_list(20)
    by_nationality = await db.candidates.aggregate([
        {"$match": {"nationality": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$nationality", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 15}
    ]).to_list(15)
    by_birth_country = await db.candidates.aggregate([
        {"$match": {"birth_country": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$birth_country", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 15}
    ]).to_list(15)
    by_job = await db.candidates.aggregate([
        {"$match": {"job_type": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$job_type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 15}
    ]).to_list(15)
    return {
        "total": total,
        "by_status": [{"status": x["_id"] or "nespecificat", "count": x["count"]} for x in by_status],
        "by_nationality": [{"nationality": x["_id"], "count": x["count"]} for x in by_nationality],
        "by_birth_country": [{"country": x["_id"], "count": x["count"]} for x in by_birth_country],
        "by_job": [{"job": x["_id"], "count": x["count"]} for x in by_job]
    }

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

@api_router.get("/immigration/{case_id}/aviz-pdf")
async def get_aviz_pdf(case_id: str):
    """Descarcă PDF-ul avizului de muncă din Gmail"""
    case = await db.immigration_cases.find_one({"id": case_id}, {"_id": 0, "igi_email_id": 1, "aviz_number": 1, "candidate_name": 1})
    if not case:
        raise HTTPException(status_code=404, detail="Dosarul nu a fost găsit")

    igi_email_id = case.get("igi_email_id")
    if not igi_email_id:
        raise HTTPException(status_code=404, detail="Nu există email IGI asociat acestui dosar")

    # Caută emailul în colecția igi_emails
    from bson import ObjectId
    try:
        email_doc = await db.igi_emails.find_one({"_id": ObjectId(igi_email_id)}, {"_id": 0, "gmail_id": 1})
    except Exception:
        raise HTTPException(status_code=404, detail="ID email invalid")

    if not email_doc or not email_doc.get("gmail_id"):
        raise HTTPException(status_code=404, detail="Email negăsit în baza de date")

    gmail_id = email_doc["gmail_id"]

    # Descarcă PDF din Gmail
    try:
        TOKEN_FILE = Path(__file__).parent / "gmail_token.json"
        if not TOKEN_FILE.exists():
            raise HTTPException(status_code=503, detail="Gmail token lipsă — autentificare necesară")

        SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
        from googleapiclient.discovery import build
        import base64

        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
        service = build("gmail", "v1", credentials=creds)

        msg = service.users().messages().get(userId="me", id=gmail_id, format="full").execute()
        parts = msg.get("payload", {}).get("parts", [])

        pdf_bytes = None
        for part in parts:
            mime = part.get("mimeType", "")
            fname = part.get("filename", "")
            if mime in ("application/pdf", "application/octet-stream") or fname.lower().endswith(".pdf"):
                att_id = part.get("body", {}).get("attachmentId")
                if att_id:
                    att = service.users().messages().attachments().get(
                        userId="me", messageId=gmail_id, id=att_id
                    ).execute()
                    pdf_bytes = base64.urlsafe_b64decode(att["data"])
                    break

        if not pdf_bytes:
            raise HTTPException(status_code=404, detail="PDF negăsit în emailul IGI")

        aviz_nr = case.get("aviz_number", "aviz")
        candidate = case.get("candidate_name", "candidat").replace(" ", "_")
        filename = f"Aviz_{aviz_nr}_{candidate}.pdf"

        from fastapi.responses import Response
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="{filename}"'}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Eroare la descărcarea PDF-ului: {str(e)}")

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
    current_stage_name = case.get('current_stage_name', IMMIGRATION_STAGES[0])
    
    if current_stage >= len(IMMIGRATION_STAGES):
        raise HTTPException(status_code=400, detail="Dosarul este deja la ultima etapă")
    
    new_stage = current_stage + 1
    new_status = "finalizat" if new_stage == len(IMMIGRATION_STAGES) else "în procesare"
    new_stage_name = IMMIGRATION_STAGES[new_stage - 1]
    
    # SHADOW ARCHITECTURE: Record stage transition in new history collection
    await record_stage_transition(
        case_id=case_id,
        old_stage=current_stage,
        old_stage_name=current_stage_name,
        new_stage=new_stage,
        new_stage_name=new_stage_name
    )
    
    # Add to existing history (backward compatibility)
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

@api_router.get("/alerts/igi-appointments")
async def get_igi_appointments(days: int = 14):
    """Programari IGI in urmatoarele N zile"""
    today = datetime.now(timezone.utc).date()
    results = []

    cases = await db.immigration_cases.find(
        {"appointment_date": {"$nin": [None, ""]}},
        {"_id": 0, "id": 1, "candidate_name": 1, "company_name": 1,
         "appointment_date": 1, "appointment_time": 1, "igi_number": 1}
    ).to_list(5000)

    for c in cases:
        apd = c.get("appointment_date", "")
        if not apd:
            continue
        # Incearca mai multe formate de date
        apt_date = None
        for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d.%m.%Y"):
            try:
                apt_date = datetime.strptime(apd.strip(), fmt).date()
                break
            except:
                pass
        if not apt_date:
            continue

        days_until = (apt_date - today).days
        if -1 <= days_until <= days:  # include azi si urmatoarele N zile
            if days_until < 0:
                urgency = "trecut"
            elif days_until == 0:
                urgency = "azi"
            elif days_until <= 3:
                urgency = "urgent"
            elif days_until <= 7:
                urgency = "curand"
            else:
                urgency = "planificat"

            results.append({
                "case_id": c["id"],
                "candidate_name": c.get("candidate_name", "—"),
                "company_name": c.get("company_name", "—"),
                "appointment_date": apd,
                "appointment_time": c.get("appointment_time", ""),
                "igi_number": c.get("igi_number", ""),
                "days_until": days_until,
                "urgency": urgency,
            })

    return sorted(results, key=lambda x: x["days_until"])

# ===================== JOBS MANAGEMENT =====================

@api_router.get("/jobs")
async def get_jobs(
    status: Optional[str] = None,
    company_id: Optional[str] = None,
    search: Optional[str] = None
):
    """Get all jobs with optional filters"""
    query = {}
    if status:
        query["status"] = status
    if company_id:
        query["company_id"] = company_id
    if search:
        query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"company_name": {"$regex": search, "$options": "i"}},
            {"location": {"$regex": search, "$options": "i"}}
        ]
    
    jobs = await db.jobs.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return jobs

@api_router.get("/jobs/{job_id}")
async def get_job(job_id: str):
    """Get a single job by ID"""
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Jobul nu a fost găsit")
    return job

@api_router.post("/jobs")
async def create_job(job: JobCreate):
    """Create a new job"""
    # Get company name if not provided
    if job.company_id and not job.company_name:
        company = await db.companies.find_one({"id": job.company_id}, {"_id": 0, "name": 1})
        if company:
            job.company_name = company.get("name")
    
    job_data = Job(**job.model_dump())
    await db.jobs.insert_one(job_data.model_dump())
    return {"message": "Job creat cu succes", "job": job_data.model_dump()}

@api_router.put("/jobs/{job_id}")
async def update_job(job_id: str, job_update: dict):
    """Update a job"""
    existing = await db.jobs.find_one({"id": job_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Jobul nu a fost găsit")
    
    await db.jobs.update_one({"id": job_id}, {"$set": job_update})
    updated = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    return updated

@api_router.delete("/jobs/{job_id}")
async def delete_job(job_id: str):
    """Delete a job"""
    result = await db.jobs.delete_one({"id": job_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Jobul nu a fost găsit")
    return {"message": "Job șters cu succes"}

# ===================== AI MATCHING SYSTEM =====================

def calculate_skills_match(candidate_skills: List[str], job_skills: List[str]) -> float:
    """Calculate skills match percentage"""
    if not job_skills:
        return 100.0
    if not candidate_skills:
        return 0.0
    
    # Normalize skills (lowercase)
    candidate_skills_lower = [s.lower().strip() for s in candidate_skills]
    job_skills_lower = [s.lower().strip() for s in job_skills]
    
    matches = sum(1 for skill in job_skills_lower if any(skill in cs or cs in skill for cs in candidate_skills_lower))
    return (matches / len(job_skills_lower)) * 100

def calculate_experience_match(candidate_exp: int, required_exp: int) -> float:
    """Calculate experience match percentage"""
    if required_exp == 0:
        return 100.0
    if candidate_exp >= required_exp:
        return 100.0
    return (candidate_exp / required_exp) * 100

def calculate_availability_match(candidate_status: str, candidate_company_id: Optional[str]) -> float:
    """Calculate availability score based on candidate status"""
    if candidate_status == "activ" and not candidate_company_id:
        return 100.0  # Available and not assigned
    elif candidate_status == "activ":
        return 70.0   # Active but already assigned
    elif candidate_status == "plasat":
        return 30.0   # Already placed
    return 0.0        # Inactive

@api_router.get("/jobs/{job_id}/matches")
async def get_job_matches(job_id: str, limit: int = 10):
    """AI Matching: Get top candidate matches for a job"""
    
    # Get job details
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Jobul nu a fost găsit")
    
    # Get all active candidates
    candidates = await db.candidates.find(
        {"status": {"$in": ["activ", "plasat"]}},
        {"_id": 0}
    ).to_list(500)
    
    matches = []
    
    for candidate in candidates:
        # Extract candidate skills from job_type field (simplified)
        candidate_skills = [candidate.get("job_type", "")] if candidate.get("job_type") else []
        
        # Calculate match scores
        skills_score = calculate_skills_match(candidate_skills, job.get("required_skills", []))
        
        # Estimate experience from notes or default
        candidate_exp = 2  # Default assumption
        exp_score = calculate_experience_match(candidate_exp, job.get("required_experience_years", 0))
        
        # Availability
        avail_score = calculate_availability_match(
            candidate.get("status", "activ"),
            candidate.get("company_id")
        )
        
        # Check nationality requirement
        nationality_ok = True
        if job.get("required_nationality"):
            nationality_ok = candidate.get("nationality") in job.get("required_nationality", [])
        
        if not nationality_ok:
            continue  # Skip candidates that don't meet nationality requirement
        
        # Calculate overall compatibility score (weighted average)
        compatibility = (skills_score * 0.4) + (exp_score * 0.3) + (avail_score * 0.3)
        
        matches.append({
            "candidate_id": candidate.get("id"),
            "candidate_name": f"{candidate.get('first_name', '')} {candidate.get('last_name', '')}",
            "nationality": candidate.get("nationality"),
            "job_type": candidate.get("job_type"),
            "current_status": candidate.get("status"),
            "compatibility_score": round(compatibility, 1),
            "skills_match": round(skills_score, 1),
            "experience_match": round(exp_score, 1),
            "availability_match": round(avail_score, 1)
        })
    
    # Sort by compatibility score (highest first)
    matches.sort(key=lambda x: x["compatibility_score"], reverse=True)
    
    return {
        "job": {
            "id": job.get("id"),
            "title": job.get("title"),
            "company_name": job.get("company_name"),
            "required_skills": job.get("required_skills", []),
            "positions_available": job.get("positions_available", 1)
        },
        "matches": matches[:limit],
        "total_candidates_evaluated": len(candidates)
    }

@api_router.post("/jobs/{job_id}/apply/{candidate_id}")
async def apply_candidate_to_job(job_id: str, candidate_id: str):
    """Create a job application (match candidate to job)"""
    
    # Verify job exists
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Jobul nu a fost găsit")
    
    # Verify candidate exists
    candidate = await db.candidates.find_one({"id": candidate_id}, {"_id": 0})
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidatul nu a fost găsit")
    
    # Check if application already exists
    existing = await db.applications.find_one({
        "job_id": job_id,
        "candidate_id": candidate_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="Candidatul este deja aplicat la acest job")
    
    # Calculate match scores
    candidate_skills = [candidate.get("job_type", "")] if candidate.get("job_type") else []
    skills_score = calculate_skills_match(candidate_skills, job.get("required_skills", []))
    exp_score = calculate_experience_match(2, job.get("required_experience_years", 0))
    avail_score = calculate_availability_match(candidate.get("status"), candidate.get("company_id"))
    compatibility = (skills_score * 0.4) + (exp_score * 0.3) + (avail_score * 0.3)
    
    # Create application using new Application model
    application = Application(
        candidate_id=candidate_id,
        candidate_name=f"{candidate.get('first_name', '')} {candidate.get('last_name', '')}",
        job_id=job_id,
        job_title=job.get("title"),
        company_id=job.get("company_id"),
        company_name=job.get("company_name"),
        status="applied",
        ai_match_score=round(compatibility, 1),
        skills_match=round(skills_score, 1),
        experience_match=round(exp_score, 1),
        availability_match=round(avail_score, 1)
    )
    
    await db.applications.insert_one(application.model_dump())
    
    return {"message": "Candidat aplicat cu succes", "application": application.model_dump()}

@api_router.get("/applications")
async def get_applications(
    job_id: Optional[str] = None,
    candidate_id: Optional[str] = None,
    status: Optional[str] = None
):
    """Get applications with optional filters"""
    query = {}
    if job_id:
        query["job_id"] = job_id
    if candidate_id:
        query["candidate_id"] = candidate_id
    if status:
        query["status"] = status
    
    applications = await db.applications.find(query, {"_id": 0}).sort("ai_match_score", -1).to_list(100)
    return applications

@api_router.put("/applications/{application_id}/status")
async def update_application_status(application_id: str, status_update: dict):
    """Update application status"""
    new_status = status_update.get("status")
    valid_statuses = ["applied", "shortlisted", "hired", "rejected"]
    if new_status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Status invalid. Valori acceptate: {valid_statuses}")
    
    result = await db.applications.update_one(
        {"id": application_id},
        {"$set": {"status": new_status, "updated_at": datetime.now(timezone.utc)}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Aplicația nu a fost găsită")
    
    # If status is "hired", update candidate and job
    if new_status == "hired":
        app = await db.applications.find_one({"id": application_id}, {"_id": 0})
        if app:
            # Update candidate status
            await db.candidates.update_one(
                {"id": app["candidate_id"]},
                {"$set": {"status": "plasat", "company_id": app["company_id"], "company_name": app["company_name"]}}
            )
            # Update job positions filled
            await db.jobs.update_one(
                {"id": app["job_id"]},
                {"$inc": {"positions_filled": 1}}
            )
    
    return {"message": f"Status actualizat la {new_status}"}

# ===================== AUTO JOB & APPLICATION CREATION =====================

async def auto_create_job_and_application(candidate_id: str, company_id: str, company_name: str, candidate_name: str, job_type: str = None):
    """
    Automatically create a Job (if not exists) and Application when candidate is assigned to company.
    This is part of the shadow architecture - non-breaking extension.
    """
    # Check if a generic job exists for this company
    existing_job = await db.jobs.find_one({
        "company_id": company_id,
        "status": "activ"
    }, {"_id": 0})
    
    if not existing_job:
        # Create a generic job for the company
        job = Job(
            company_id=company_id,
            company_name=company_name,
            title=job_type or "Poziție Generală",
            description=f"Poziție pentru {company_name}",
            requirements=job_type,
            headcount_needed=10,  # Default headcount
            status="activ"
        )
        await db.jobs.insert_one(job.model_dump())
        job_id = job.id
        job_title = job.title
    else:
        job_id = existing_job["id"]
        job_title = existing_job.get("title", "Poziție")
    
    # Check if application already exists
    existing_app = await db.applications.find_one({
        "candidate_id": candidate_id,
        "job_id": job_id
    })
    
    if not existing_app:
        # Create application
        application = Application(
            candidate_id=candidate_id,
            candidate_name=candidate_name,
            job_id=job_id,
            job_title=job_title,
            company_id=company_id,
            company_name=company_name,
            status="applied",
            ai_match_score=75.0  # Default score for manual assignment
        )
        await db.applications.insert_one(application.model_dump())
        return application.id
    
    return existing_app.get("id")

# ===================== IMMIGRATION STAGE HISTORY =====================

@api_router.get("/immigration-stage-history/{case_id}")
async def get_immigration_stage_history(case_id: str):
    """Get stage history for an immigration case"""
    history = await db.immigration_stage_history.find(
        {"case_id": case_id},
        {"_id": 0}
    ).sort("entered_at", 1).to_list(50)
    return history

async def record_stage_transition(case_id: str, old_stage: int, old_stage_name: str, new_stage: int, new_stage_name: str):
    """Record a stage transition in the history collection"""
    now = datetime.now(timezone.utc)
    
    # Close the previous stage entry
    await db.immigration_stage_history.update_one(
        {"case_id": case_id, "stage_number": old_stage, "exited_at": None},
        {"$set": {"exited_at": now}}
    )
    
    # Calculate duration for the closed stage
    prev_entry = await db.immigration_stage_history.find_one(
        {"case_id": case_id, "stage_number": old_stage}
    )
    if prev_entry and prev_entry.get("entered_at"):
        duration = (now - prev_entry["entered_at"]).days
        await db.immigration_stage_history.update_one(
            {"case_id": case_id, "stage_number": old_stage},
            {"$set": {"duration_days": duration}}
        )
    
    # Create new stage entry
    new_entry = ImmigrationStageHistory(
        case_id=case_id,
        stage_name=new_stage_name,
        stage_number=new_stage,
        entered_at=now
    )
    await db.immigration_stage_history.insert_one(new_entry.model_dump())

# ===================== ANAF CUI LOOKUP =====================

@api_router.get("/anaf/{cui}")
async def lookup_anaf(cui: str):
    """Lookup company by CUI from ANAF API"""
    import requests
    import asyncio
    from concurrent.futures import ThreadPoolExecutor
    
    def sync_anaf_lookup(clean_cui: str, today: str):
        """Synchronous ANAF lookup using requests library"""
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "ro-RO,ro;q=0.9,en;q=0.8",
            "Origin": "https://www.anaf.ro",
            "Referer": "https://www.anaf.ro/",
        }
        payload = [{"cui": int(clean_cui), "data": today}]

        # Try sync endpoint first
        endpoints = [
            "https://webservicesp.anaf.ro/PlatitorTvaRest/api/v8/ws/tva",
            "https://webservicesp.anaf.ro/PlatitorTvaRest/api/v7/ws/tva",
        ]
        response = None
        last_error = ""
        for url in endpoints:
            try:
                r = requests.post(url, json=payload, headers=headers, timeout=20)
                if r.status_code == 200:
                    response = r
                    break
                last_error = f"HTTP {r.status_code}"
            except Exception as e:
                last_error = str(e)
                continue

        if response is None:
            return {"success": False, "error": f"ANAF indisponibil momentan ({last_error}). Completează manual datele."}

        result_data = response.json()
        
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
                parts = [p.strip() for p in adresa.split(",")]
                for part in parts:
                    if "JUD." in part.upper():
                        city = part.replace("JUD.", "").replace("jud.", "").strip()
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
    
    try:
        # Clean CUI - remove RO prefix and spaces
        clean_cui = cui.replace("RO", "").replace("ro", "").strip()
        
        if not clean_cui.isdigit():
            return {"success": False, "error": "CUI invalid - trebuie să conțină doar cifre"}
        
        today = datetime.now().strftime("%Y-%m-%d")
        
        # Run synchronous request in thread pool
        loop = asyncio.get_event_loop()
        with ThreadPoolExecutor() as executor:
            result = await loop.run_in_executor(executor, sync_anaf_lookup, clean_cui, today)
        
        return result
            
    except ValueError as e:
        return {"success": False, "error": "CUI invalid - trebuie să conțină doar cifre"}
    except Exception as e:
        logger.error(f"ANAF lookup error: {type(e).__name__}: {e}")
        return {"success": False, "error": f"Eroare la comunicarea cu ANAF: {type(e).__name__}"}

# ==================== OPERATORS ====================
@api_router.get("/operators")
async def get_operators():
    ops = await db.operators.find({}, {"_id": 0}).sort("created_at", 1).to_list(100)
    return [serialize_doc(o) for o in ops]

@api_router.post("/operators")
async def create_operator(op: Operator):
    doc = op.model_dump()
    if hasattr(doc.get("created_at"), "isoformat"):
        doc["created_at"] = doc["created_at"].isoformat()
    await db.operators.insert_one(doc)
    doc.pop("_id", None)
    return serialize_doc(doc)

@api_router.put("/operators/{op_id}")
async def update_operator(op_id: str, op: Operator):
    data = {k: v for k, v in op.model_dump().items() if k not in ("id", "created_at")}
    if hasattr(data.get("updated_at"), "isoformat"):
        data["updated_at"] = data["updated_at"].isoformat()
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.operators.update_one({"id": op_id}, {"$set": data})
    updated = await db.operators.find_one({"id": op_id}, {"_id": 0})
    return serialize_doc(updated)

@api_router.delete("/operators/{op_id}")
async def delete_operator(op_id: str):
    await db.operators.delete_one({"id": op_id})
    return {"message": "deleted"}

# ===================== PARTENERI (AGENȚII EXTERNE) =====================

@api_router.get("/partners")
async def get_partners():
    partners = await db.partners.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
    # Calculeaza statistici live
    for p in partners:
        p["candidates_sent"] = await db.candidates.count_documents({"source_partner_id": p["id"]})
        p["candidates_placed"] = await db.candidates.count_documents({"source_partner_id": p["id"], "status": "plasat"})
    return partners

@api_router.get("/partners/{partner_id}")
async def get_partner(partner_id: str):
    partner = await db.partners.find_one({"id": partner_id}, {"_id": 0})
    if not partner:
        raise HTTPException(status_code=404, detail="Partener negăsit")
    partner["candidates_sent"] = await db.candidates.count_documents({"source_partner_id": partner_id})
    partner["candidates_placed"] = await db.candidates.count_documents({"source_partner_id": partner_id, "status": "plasat"})
    # Lista candidati sursa
    candidates = await db.candidates.find(
        {"source_partner_id": partner_id}, {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "status": 1, "company_name": 1}
    ).to_list(500)
    partner["candidates"] = candidates
    return partner

@api_router.post("/partners")
async def create_partner(partner: PartnerCreate):
    doc = Partner(**partner.model_dump()).model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.partners.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/partners/{partner_id}")
async def update_partner(partner_id: str, partner: PartnerCreate):
    update_data = partner.model_dump(exclude_unset=True)
    await db.partners.update_one({"id": partner_id}, {"$set": update_data})
    updated = await db.partners.find_one({"id": partner_id}, {"_id": 0})
    return updated

@api_router.delete("/partners/{partner_id}")
async def delete_partner(partner_id: str):
    await db.partners.delete_one({"id": partner_id})
    return {"message": "deleted"}

# ===================== CONTRACTS =====================

@api_router.get("/contracts")
async def get_contracts(type: Optional[str] = None, status: Optional[str] = None):
    query = {}
    if type:
        query["type"] = type
    if status:
        query["status"] = status
    contracts = await db.contracts.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [serialize_doc(c) for c in contracts]

@api_router.get("/contracts/{contract_id}")
async def get_contract(contract_id: str):
    contract = await db.contracts.find_one({"id": contract_id}, {"_id": 0})
    if not contract:
        raise HTTPException(status_code=404, detail="Contract negăsit")
    return serialize_doc(contract)

@api_router.post("/contracts")
async def create_contract(contract: ContractCreate):
    doc = Contract(**contract.model_dump()).model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.contracts.insert_one(doc)
    return serialize_doc(doc)

@api_router.put("/contracts/{contract_id}")
async def update_contract(contract_id: str, contract: ContractCreate):
    update_data = contract.model_dump(exclude_unset=True)
    await db.contracts.update_one({"id": contract_id}, {"$set": update_data})
    updated = await db.contracts.find_one({"id": contract_id}, {"_id": 0})
    return serialize_doc(updated)

@api_router.delete("/contracts/{contract_id}")
async def delete_contract(contract_id: str):
    await db.contracts.delete_one({"id": contract_id})
    return {"message": "deleted"}

# ===================== PAYMENTS =====================

@api_router.get("/payments")
async def get_payments(type: Optional[str] = None, status: Optional[str] = None):
    query = {}
    if type:
        query["type"] = type
    if status:
        query["status"] = status
    payments = await db.payments.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [serialize_doc(p) for p in payments]

@api_router.get("/payments/stats")
async def get_payment_stats():
    pipeline = [
        {"$group": {"_id": "$status", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    result = await db.payments.aggregate(pipeline).to_list(100)
    stats = {"platit": 0, "partial": 0, "neplatit": 0, "total": 0, "count": 0}
    for r in result:
        key = r["_id"]
        if key in stats:
            stats[key] = r["total"]
        stats["total"] += r["total"]
        stats["count"] += r["count"]
    return stats

@api_router.post("/payments")
async def create_payment(payment: PaymentCreate):
    doc = Payment(**payment.model_dump()).model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.payments.insert_one(doc)
    return serialize_doc(doc)

@api_router.put("/payments/{payment_id}")
async def update_payment(payment_id: str, payment: PaymentCreate):
    update_data = payment.model_dump(exclude_unset=True)
    await db.payments.update_one({"id": payment_id}, {"$set": update_data})
    updated = await db.payments.find_one({"id": payment_id}, {"_id": 0})
    return serialize_doc(updated)

@api_router.delete("/payments/{payment_id}")
async def delete_payment(payment_id: str):
    await db.payments.delete_one({"id": payment_id})
    return {"message": "deleted"}

# ===================== LEADS B2B =====================

@api_router.get("/leads")
async def get_leads(stage: Optional[str] = None):
    query = {}
    if stage:
        query["stage"] = stage
    leads = await db.leads.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [serialize_doc(l) for l in leads]

@api_router.post("/leads")
async def create_lead(lead: LeadCreate):
    doc = Lead(**lead.model_dump()).model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.leads.insert_one(doc)
    return serialize_doc(doc)

@api_router.put("/leads/{lead_id}")
async def update_lead(lead_id: str, lead: LeadCreate):
    update_data = lead.model_dump(exclude_unset=True)
    await db.leads.update_one({"id": lead_id}, {"$set": update_data})
    updated = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    return serialize_doc(updated)

@api_router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str):
    await db.leads.delete_one({"id": lead_id})
    return {"message": "deleted"}

# ===================== EMAIL =====================

class EmailRequest(BaseModel):
    to: str
    cc: Optional[str] = None
    subject: str
    body: str
    case_id: Optional[str] = None
    candidate_name: Optional[str] = None

@api_router.post("/send-email")
async def send_email(email_req: EmailRequest):
    """Trimite email via SMTP configurat în .env"""
    smtp_host = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
    smtp_port = int(os.environ.get('SMTP_PORT', '587'))
    smtp_user = os.environ.get('SMTP_USER', '')
    smtp_pass = os.environ.get('SMTP_PASS', '')

    if not smtp_user or not smtp_pass:
        raise HTTPException(status_code=503, detail="Email neconfigurat. Adaugă SMTP_USER și SMTP_PASS în .env")

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = email_req.subject
        msg["From"] = smtp_user
        msg["To"] = email_req.to
        if email_req.cc:
            msg["Cc"] = email_req.cc

        html_body = email_req.body.replace("\n", "<br>")
        msg.attach(MIMEText(email_req.body, "plain", "utf-8"))
        msg.attach(MIMEText(f"<html><body style='font-family:Arial,sans-serif;'>{html_body}</body></html>", "html", "utf-8"))

        def _send():
            with smtplib.SMTP(smtp_host, smtp_port) as server:
                server.ehlo()
                server.starttls()
                server.login(smtp_user, smtp_pass)
                recipients = [email_req.to]
                if email_req.cc:
                    recipients.append(email_req.cc)
                server.sendmail(smtp_user, recipients, msg.as_string())

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _send)

        # Log in case history if case_id provided
        if email_req.case_id:
            history_entry = {
                "date": datetime.now(timezone.utc).isoformat(),
                "action": f"Email trimis către {email_req.to}: {email_req.subject}",
                "user": "sistem"
            }
            await db.immigration_cases.update_one(
                {"id": email_req.case_id},
                {"$push": {"history": history_entry}}
            )

        return {"success": True, "message": f"Email trimis către {email_req.to}"}
    except smtplib.SMTPAuthenticationError:
        raise HTTPException(status_code=401, detail="Autentificare SMTP eșuată. Verifică credențialele.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Eroare la trimitere email: {str(e)}")

@api_router.get("/email/config")
async def get_email_config():
    """Verifică dacă email-ul e configurat"""
    smtp_user = os.environ.get('SMTP_USER', '')
    return {
        "configured": bool(smtp_user),
        "smtp_user": smtp_user if smtp_user else None,
        "smtp_host": os.environ.get('SMTP_HOST', 'smtp.gmail.com'),
    }

# ===================== INTERVIEWS =====================

@api_router.get("/interviews")
async def get_interviews(status: Optional[str] = None, candidate_id: Optional[str] = None):
    query = {}
    if status:
        query["status"] = status
    if candidate_id:
        query["candidate_id"] = candidate_id
    items = await db.interviews.find(query, {"_id": 0}).sort("scheduled_date", 1).to_list(1000)
    return [serialize_doc(i) for i in items]

@api_router.post("/interviews")
async def create_interview(interview: InterviewCreate):
    doc = Interview(**interview.model_dump()).model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.interviews.insert_one(doc)
    return serialize_doc(doc)

@api_router.put("/interviews/{interview_id}")
async def update_interview(interview_id: str, interview: InterviewCreate):
    update_data = interview.model_dump(exclude_unset=True)
    await db.interviews.update_one({"id": interview_id}, {"$set": update_data})
    updated = await db.interviews.find_one({"id": interview_id}, {"_id": 0})
    return serialize_doc(updated)

@api_router.delete("/interviews/{interview_id}")
async def delete_interview(interview_id: str):
    await db.interviews.delete_one({"id": interview_id})
    return {"message": "deleted"}

# ===================== TASKS =====================

@api_router.get("/tasks")
async def get_tasks(status: Optional[str] = None, assigned_to: Optional[str] = None, priority: Optional[str] = None):
    query = {}
    if status:
        query["status"] = status
    if assigned_to:
        query["assigned_to"] = assigned_to
    if priority:
        query["priority"] = priority
    items = await db.tasks.find(query, {"_id": 0}).sort("due_date", 1).to_list(1000)
    return [serialize_doc(t) for t in items]

async def send_task_notification(task_doc: dict):
    """Trimite email de notificare imediat la crearea unei sarcini"""
    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_pass = os.environ.get("SMTP_PASS", "")
    if not smtp_user or not smtp_pass:
        return  # SMTP neconfigurat, ignorăm silențios

    # Construim lista de destinatari (fără duplicate)
    recipients = set()
    if task_doc.get("created_by_email"):
        recipients.add(task_doc["created_by_email"])
    if task_doc.get("collaborator_email"):
        recipients.add(task_doc["collaborator_email"])
    if not recipients:
        return  # Nu avem destinatari

    action_labels = {
        "general": "General", "sunat": "De sunat",
        "email": "De trimis mail", "whatsapp": "WhatsApp", "intalnire": "Întâlnire"
    }
    priority_labels = {"urgent": "Urgent", "high": "Ridicat", "normal": "Normal", "low": "Scăzut"}

    action = action_labels.get(task_doc.get("action_type", "general"), "General")
    priority = priority_labels.get(task_doc.get("priority", "normal"), "Normal")

    html = f"""
    <html><body style="font-family:Arial,sans-serif;max-width:580px;margin:auto;padding:24px">
    <div style="background:#8b5cf6;color:#fff;padding:18px 24px;border-radius:10px 10px 0 0">
      <h2 style="margin:0;font-size:1.2rem">📋 Sarcină nouă adăugată în GJC CRM</h2>
    </div>
    <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:20px 24px;border-radius:0 0 10px 10px">
      <h3 style="margin:0 0 16px;color:#1f2937;font-size:1.05rem">{task_doc.get('title','')}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:0.875rem">
        <tr><td style="padding:6px 0;color:#6b7280;width:140px">Tip acțiune</td>
            <td style="padding:6px 0;font-weight:600">{action}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Prioritate</td>
            <td style="padding:6px 0;font-weight:600">{priority}</td></tr>
        {'<tr><td style="padding:6px 0;color:#6b7280">Termen</td><td style="padding:6px 0;font-weight:600">' + task_doc.get('due_date','') + (' ' + task_doc.get('due_time','') if task_doc.get('due_time') else '') + '</td></tr>' if task_doc.get('due_date') else ''}
        {'<tr><td style="padding:6px 0;color:#6b7280">Atribuit</td><td style="padding:6px 0">' + task_doc.get('assigned_to','') + '</td></tr>' if task_doc.get('assigned_to') else ''}
        {'<tr><td style="padding:6px 0;color:#6b7280">Colaborator</td><td style="padding:6px 0">' + task_doc.get('collaborator','') + '</td></tr>' if task_doc.get('collaborator') else ''}
        {'<tr><td style="padding:6px 0;color:#6b7280">Persoana de contactat</td><td style="padding:6px 0">' + task_doc.get('contact_name','') + '</td></tr>' if task_doc.get('contact_name') else ''}
        {'<tr><td style="padding:6px 0;color:#6b7280">Telefon</td><td style="padding:6px 0">' + task_doc.get('contact_phone','') + '</td></tr>' if task_doc.get('contact_phone') else ''}
        {'<tr><td style="padding:6px 0;color:#6b7280">Email contact</td><td style="padding:6px 0">' + task_doc.get('contact_email','') + '</td></tr>' if task_doc.get('contact_email') else ''}
        {'<tr><td style="padding:6px 0;color:#6b7280">Companie Lead</td><td style="padding:6px 0;font-weight:600">' + task_doc.get('lead_company','') + '</td></tr>' if task_doc.get('lead_company') else ''}
        {'<tr><td style="padding:6px 0;color:#6b7280">Descriere</td><td style="padding:6px 0">' + task_doc.get('description','') + '</td></tr>' if task_doc.get('description') else ''}
      </table>
    </div>
    <p style="font-size:0.75rem;color:#9ca3af;margin-top:16px;text-align:center">GJC CRM — notificare automată</p>
    </body></html>
    """

    def _send():
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"📋 Sarcină nouă: {task_doc.get('title','')}"
        msg["From"] = smtp_user
        msg["To"] = ", ".join(recipients)
        msg.attach(MIMEText(html, "html", "utf-8"))
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.ehlo(); server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, list(recipients), msg.as_string())

    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _send)
    except Exception as e:
        logger.warning(f"Eroare notificare task: {e}")


@api_router.post("/tasks")
async def create_task(task: TaskCreate):
    doc = Task(**task.model_dump()).model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.tasks.insert_one(doc)
    # Trimite notificare email async
    asyncio.create_task(send_task_notification(doc))
    return serialize_doc(doc)

@api_router.put("/tasks/{task_id}")
async def update_task(task_id: str, task: TaskCreate):
    update_data = task.model_dump(exclude_unset=True)
    await db.tasks.update_one({"id": task_id}, {"$set": update_data})
    updated = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    return serialize_doc(updated)

@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str):
    await db.tasks.delete_one({"id": task_id})
    return {"message": "deleted"}

# ===================== PLACEMENTS (POST-PLASARE) =====================

@api_router.get("/placements")
async def get_placements(status: Optional[str] = None):
    query = {}
    if status:
        query["status"] = status
    items = await db.placements.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [serialize_doc(p) for p in items]

@api_router.get("/placements/stats")
async def get_placement_stats():
    total = await db.placements.count_documents({})
    active = await db.placements.count_documents({"status": "activ"})
    pipeline = [{"$group": {"_id": None, "total_fees": {"$sum": "$fees_collected"}, "total_monthly": {"$sum": "$monthly_fee"}}}]
    agg = await db.placements.aggregate(pipeline).to_list(1)
    fees = agg[0]["total_fees"] if agg else 0
    return {"total": total, "active": active, "fees_collected": fees or 0}

@api_router.post("/placements")
async def create_placement(placement: PlacementCreate):
    doc = Placement(**placement.model_dump()).model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.placements.insert_one(doc)
    return serialize_doc(doc)

@api_router.put("/placements/{placement_id}")
async def update_placement(placement_id: str, placement: PlacementCreate):
    update_data = placement.model_dump(exclude_unset=True)
    await db.placements.update_one({"id": placement_id}, {"$set": update_data})
    updated = await db.placements.find_one({"id": placement_id}, {"_id": 0})
    return serialize_doc(updated)

@api_router.delete("/placements/{placement_id}")
async def delete_placement(placement_id: str):
    await db.placements.delete_one({"id": placement_id})
    return {"message": "deleted"}

# ===================== KPI PER OPERATOR =====================

@api_router.get("/reports/kpi")
async def get_kpi_report():
    """KPI per operator + financiar"""
    # Cases per operator
    cases_pipeline = [
        {"$group": {"_id": "$assigned_to", "total_cases": {"$sum": 1},
                    "active": {"$sum": {"$cond": [{"$ne": ["$status", "finalizat"]}, 1, 0]}},
                    "finalized": {"$sum": {"$cond": [{"$eq": ["$status", "finalizat"]}, 1, 0]}}}}
    ]
    cases_by_op = await db.immigration_cases.aggregate(cases_pipeline).to_list(50)

    # Payments per type and total
    payments_pipeline = [
        {"$group": {"_id": "$status", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}}
    ]
    payments_by_status = await db.payments.aggregate(payments_pipeline).to_list(10)
    pay_stats = {"platit": 0, "partial": 0, "neplatit": 0}
    for p in payments_by_status:
        if p["_id"] in pay_stats:
            pay_stats[p["_id"]] = p["total"]

    # Contracts value
    contracts_pipeline = [
        {"$group": {"_id": "$status", "total": {"$sum": "$value"}, "count": {"$sum": 1}}}
    ]
    contracts_by_status = await db.contracts.aggregate(contracts_pipeline).to_list(10)
    contract_stats = {}
    for c in contracts_by_status:
        contract_stats[c["_id"]] = {"total": c["total"] or 0, "count": c["count"]}

    # Placements per operator
    placements_pipeline = [
        {"$group": {"_id": "$assigned_to", "count": {"$sum": 1}, "fees": {"$sum": "$fees_collected"}}}
    ]
    placements_by_op = await db.placements.aggregate(placements_pipeline).to_list(50)

    # Candidates per service_type
    service_pipeline = [
        {"$group": {"_id": "$service_type", "count": {"$sum": 1}}}
    ]
    service_breakdown = await db.candidates.aggregate(service_pipeline).to_list(10)

    # Monthly payments trend (last 6 months)
    six_months_ago = (datetime.now(timezone.utc) - timedelta(days=180)).isoformat()
    monthly_pipeline = [
        {"$match": {"date_received": {"$gte": six_months_ago[:7]}}},
        {"$group": {"_id": {"$substr": ["$date_received", 0, 7]}, "total": {"$sum": "$amount"}}},
        {"$sort": {"_id": 1}},
        {"$limit": 6}
    ]
    monthly_payments = await db.payments.aggregate(monthly_pipeline).to_list(6)

    return {
        "cases_by_operator": [{"operator": r["_id"] or "Neatribuit", "total": r["total_cases"], "active": r["active"], "finalized": r["finalized"]} for r in cases_by_op],
        "placements_by_operator": [{"operator": r["_id"] or "Neatribuit", "count": r["count"], "fees": r["fees"] or 0} for r in placements_by_op],
        "payments": pay_stats,
        "contracts": contract_stats,
        "service_breakdown": [{"type": r["_id"] or "necunoscut", "count": r["count"]} for r in service_breakdown],
        "monthly_payments": [{"month": r["_id"], "total": r["total"]} for r in monthly_payments],
    }

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

# ===================== SMARTBILL INTEGRATION =====================

class SmartBillConfig(BaseModel):
    cif: str
    email: str
    token: str
    series: Optional[str] = None  # serie factura (ex: "GJC")

@api_router.get("/integrations/smartbill")
async def get_smartbill_config():
    """Returneaza configuratia SmartBill (fara token din motive de securitate)"""
    config = await db.integrations.find_one({"type": "smartbill"}, {"_id": 0})
    if config:
        safe = {k: v for k, v in config.items() if k != "token"}
        safe["configured"] = True
        return safe
    return {"configured": False}

@api_router.post("/integrations/smartbill")
async def save_smartbill_config(config: SmartBillConfig):
    """Salveaza credentialele SmartBill in baza de date"""
    await db.integrations.update_one(
        {"type": "smartbill"},
        {"$set": {"type": "smartbill", **config.model_dump()}},
        upsert=True
    )
    return {"message": "Configuratie SmartBill salvata!"}

@api_router.post("/integrations/smartbill/test")
async def test_smartbill_connection():
    """Testeaza conexiunea cu API-ul SmartBill"""
    config = await db.integrations.find_one({"type": "smartbill"})
    if not config:
        raise HTTPException(status_code=400, detail="SmartBill nu este configurat. Salvati credentialele mai intai.")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://ws.smartbill.ro/SBORO/api/series",
                params={"cif": config["cif"], "type": "f"},
                auth=(config["email"], config["token"]),
                timeout=15
            )
        if resp.status_code == 200:
            data = resp.json()
            series_list = data.get("list", [])
            series_names = [s.get("name", "") for s in series_list] if series_list else []
            return {
                "ok": True,
                "message": f"Conexiune reusita cu SmartBill! Serii gasite: {', '.join(series_names) if series_names else 'niciuna'}"
            }
        elif resp.status_code == 401:
            body = resp.json() if resp.headers.get("content-type","").startswith("application/json") else {}
            err = body.get("errorText", "")
            if "Nu aveti acces" in err or "cloud@smartbill.ro" in err:
                raise HTTPException(status_code=400, detail="Acces API neactivat — contacteaza cloud@smartbill.ro sa activeze accesul API pentru contul tau SmartBill Silver")
            raise HTTPException(status_code=400, detail="Credentiale incorecte — verifica email si token SmartBill")
        else:
            raise HTTPException(status_code=400, detail=f"SmartBill raspuns: {resp.status_code} — {resp.text[:200]}")
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Timeout — SmartBill nu raspunde")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Eroare conexiune: {str(e)}")

@api_router.post("/integrations/smartbill/sync")
async def sync_smartbill_invoices():
    """
    Importa facturile din SmartBill ca inregistrari de plati in CRM.
    Strategie:
    1. GET /series?cif=...&type=f  — obtine seriile de facturi si urmatorul numar
    2. Pentru fiecare serie, itereaza ultimele N numere si apeleaza
       GET /invoice/paymentstatus?cif=...&seriesname=...&number=...
    3. Importa facturile gasite ca plati in CRM (fara duplicate)
    """
    config = await db.integrations.find_one({"type": "smartbill"})
    if not config:
        raise HTTPException(status_code=400, detail="SmartBill nu este configurat")

    cif = config["cif"]
    email = config["email"]
    token = config["token"]
    series_filter = config.get("series", "").strip()  # serie preferata (optional)
    base_url = "https://ws.smartbill.ro/SBORO/api"

    added = 0
    skipped = 0
    errors = 0
    checked = 0

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            # Pasul 1: obtine seriile de facturi
            series_resp = await client.get(
                f"{base_url}/series",
                params={"cif": cif, "type": "f"},
                auth=(email, token)
            )
            if series_resp.status_code != 200:
                raise HTTPException(
                    status_code=400,
                    detail=f"Nu am putut obtine seriile SmartBill: {series_resp.status_code} — {series_resp.text[:200]}"
                )
            series_data = series_resp.json()
            all_series = series_data.get("list", [])

            # Filtreaza dupa seria configurata (daca exista)
            if series_filter:
                all_series = [s for s in all_series if s.get("name", "") == series_filter]
            if not all_series:
                return {"added": 0, "skipped": 0, "checked": 0, "message": "Nu s-au gasit serii de facturi in SmartBill."}

            # Pasul 2: pentru fiecare serie, itereaza ultimele 50 numere
            for serie in all_series:
                series_name = serie.get("name", "")
                next_number = int(serie.get("nextNumber", 1))
                # Itereaza de la (nextNumber-1) in jos, max 50 facturi per serie
                start_num = max(1, next_number - 50)

                for num in range(next_number - 1, start_num - 1, -1):
                    checked += 1
                    inv_number = f"{series_name}{num}"

                    # Nu importa duplicate
                    existing = await db.payments.find_one({"invoice_number": inv_number})
                    if existing:
                        skipped += 1
                        continue

                    # Obtine statusul platii pentru aceasta factura
                    pay_resp = await client.get(
                        f"{base_url}/invoice/paymentstatus",
                        params={"cif": cif, "seriesname": series_name, "number": str(num)},
                        auth=(email, token)
                    )
                    if pay_resp.status_code == 404:
                        # Factura nu exista (posibil numar lipsa din secventa)
                        continue
                    if pay_resp.status_code != 200:
                        errors += 1
                        continue

                    inv_data = pay_resp.json()
                    if inv_data.get("errorText"):
                        # Factura nu exista sau eroare
                        continue

                    total_amount = float(inv_data.get("totalAmount", 0) or 0)
                    unpaid_amount = float(inv_data.get("unpaidAmount", 0) or 0)
                    currency = inv_data.get("currency", "RON") or "RON"
                    issue_date = inv_data.get("invoiceDate", "") or ""
                    client_name = inv_data.get("clientName", "") or ""

                    if total_amount <= 0:
                        continue  # factura fara valoare, skip

                    paid_amount = total_amount - unpaid_amount
                    if unpaid_amount <= 0:
                        pay_status = "platit"
                    elif paid_amount > 0:
                        pay_status = "partial"
                    else:
                        pay_status = "neplatit"

                    payment_doc = {
                        "id": str(uuid.uuid4()),
                        "type": "firma",
                        "entity_id": "",
                        "entity_name": client_name,
                        "amount": total_amount,
                        "currency": currency,
                        "date_received": issue_date,
                        "invoice_number": inv_number,
                        "status": pay_status,
                        "method": "transfer",
                        "contract_id": "",
                        "notes": f"Importat din SmartBill — Serie: {series_name}, Nr: {num}",
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    }
                    await db.payments.insert_one(payment_doc)
                    added += 1

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Timeout — SmartBill nu raspunde")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Eroare sincronizare SmartBill: {str(e)}")

    return {
        "added": added,
        "skipped": skipped,
        "checked": checked,
        "errors": errors,
        "message": f"Importat {added} facturi noi din SmartBill. {skipped} deja existente în CRM."
    }

# ===================== IMPORT SMARTBILL EXCEL =====================

@api_router.post("/payments/import-smartbill")
async def import_smartbill_excel(file: UploadFile = File(...)):
    """
    Importa facturile dintr-un fisier Excel/CSV exportat din SmartBill.
    Accepta orice format de export SmartBill (detecteaza coloanele automat).
    """
    import io
    import pandas as pd

    # Validare fisier
    fname = file.filename or ""
    if not (fname.endswith(".xlsx") or fname.endswith(".xls") or fname.endswith(".csv")):
        raise HTTPException(status_code=400, detail="Fisier invalid. Acceptam: .xlsx, .xls, .csv")

    content = await file.read()

    try:
        if fname.endswith(".csv"):
            # Incearca mai multe encodinguri
            for enc in ["utf-8-sig", "utf-8", "latin-1", "cp1250"]:
                try:
                    df = pd.read_csv(io.BytesIO(content), encoding=enc, sep=None, engine="python")
                    break
                except Exception:
                    continue
            else:
                raise HTTPException(status_code=400, detail="Nu am putut citi fisierul CSV. Incearca sa il salvezi ca Excel (.xlsx) din SmartBill.")
        else:
            df = pd.read_excel(io.BytesIO(content))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Nu am putut citi fisierul: {str(e)[:200]}")

    if df.empty:
        raise HTTPException(status_code=400, detail="Fisierul este gol sau nu contine date.")

    # Normalizam coloanele (lowercase, fara spatii, fara diacritice)
    import unicodedata
    def normalize_col(s):
        s = str(s).lower().strip()
        s = unicodedata.normalize('NFD', s)
        s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
        return s.replace(" ", "_").replace(".", "").replace("/", "_").replace("-", "_")

    col_map = {normalize_col(c): c for c in df.columns}

    # Detectie coloana client (denumire client / cumparator)
    client_col = next((col_map[k] for k in col_map if any(x in k for x in ["client", "cumparator", "denumire_client", "beneficiar", "partener"])), None)
    # Detectie suma / total
    total_col = next((col_map[k] for k in col_map if any(x in k for x in ["total", "valoare_totala", "suma", "total_cu_tva", "valoare"])), None)
    # Detectie numar factura
    nr_col = next((col_map[k] for k in col_map if any(x in k for x in ["numar", "nr_", "serie_si_numar", "factura_nr", "document_nr", "numar_factura"])), None)
    # Detectie serie
    serie_col = next((col_map[k] for k in col_map if any(x in k for x in ["serie", "seria"])), None)
    # Detectie data
    data_col = next((col_map[k] for k in col_map if any(x in k for x in ["data_emitere", "data_factura", "data_doc", "data_document", "data"])), None)
    # Detectie moneda
    moneda_col = next((col_map[k] for k in col_map if any(x in k for x in ["moneda", "valuta", "currency"])), None)
    # Detectie status / achitat
    status_col = next((col_map[k] for k in col_map if any(x in k for x in ["status", "achitat", "platit", "stare"])), None)
    # Detectie rest de plata
    rest_col = next((col_map[k] for k in col_map if any(x in k for x in ["rest", "neachitat", "neplatit", "sold"])), None)
    # Detectie CIF client
    cif_col = next((col_map[k] for k in col_map if any(x in k for x in ["cif", "cui", "cod_fiscal"])), None)

    added = 0
    skipped = 0
    errors = 0
    error_details = []

    for _, row in df.iterrows():
        try:
            # Numar factura
            nr = str(row[nr_col]).strip() if nr_col and pd.notna(row.get(nr_col)) else ""
            serie = str(row[serie_col]).strip() if serie_col and pd.notna(row.get(serie_col)) else ""
            inv_number = f"{serie}{nr}".strip() if (serie or nr) else ""

            # Skip randuri goale sau header duplicat
            if not inv_number or inv_number.lower() in ["nan", "none", ""]:
                continue

            # Nu dubla importul
            existing = await db.payments.find_one({"invoice_number": inv_number})
            if existing:
                skipped += 1
                continue

            # Client
            entity_name = str(row[client_col]).strip() if client_col and pd.notna(row.get(client_col)) else ""
            if entity_name.lower() in ["nan", "none", ""]:
                entity_name = ""

            # Suma
            amount = 0.0
            if total_col and pd.notna(row.get(total_col)):
                try:
                    val = str(row[total_col]).replace(",", ".").replace(" ", "").replace("\xa0", "")
                    amount = float(val)
                except Exception:
                    amount = 0.0

            # Data
            issue_date = ""
            if data_col and pd.notna(row.get(data_col)):
                try:
                    d = pd.to_datetime(row[data_col], dayfirst=True, errors="coerce")
                    issue_date = d.strftime("%Y-%m-%d") if pd.notna(d) else str(row[data_col])
                except Exception:
                    issue_date = str(row[data_col])

            # Moneda
            currency = "RON"
            if moneda_col and pd.notna(row.get(moneda_col)):
                cur_raw = str(row[moneda_col]).strip().upper()
                if cur_raw in ["EUR", "USD", "RON", "GBP"]:
                    currency = cur_raw

            # Status plata
            pay_status = "neplatit"
            if rest_col and pd.notna(row.get(rest_col)):
                try:
                    rest = float(str(row[rest_col]).replace(",", ".").replace(" ", ""))
                    if rest <= 0:
                        pay_status = "platit"
                    elif rest < amount:
                        pay_status = "partial"
                    else:
                        pay_status = "neplatit"
                except Exception:
                    pass
            elif status_col and pd.notna(row.get(status_col)):
                st_raw = str(row[status_col]).lower().strip()
                if any(x in st_raw for x in ["platit", "achitat", "incasat"]):
                    pay_status = "platit"
                elif any(x in st_raw for x in ["partial", "partial"]):
                    pay_status = "partial"

            payment_doc = {
                "id": str(uuid.uuid4()),
                "type": "firma",
                "entity_id": "",
                "entity_name": entity_name,
                "amount": amount,
                "currency": currency,
                "date_received": issue_date,
                "invoice_number": inv_number,
                "status": pay_status,
                "method": "transfer",
                "contract_id": "",
                "notes": f"Importat din SmartBill Excel — {inv_number}",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.payments.insert_one(payment_doc)
            added += 1

        except Exception as e:
            errors += 1
            error_details.append(str(e)[:100])

    return {
        "added": added,
        "skipped": skipped,
        "errors": errors,
        "total_rows": len(df),
        "message": f"Importat {added} facturi noi din SmartBill. {skipped} deja existente in CRM.",
        "columns_detected": {
            "client": client_col,
            "total": total_col,
            "numar": nr_col,
            "data": data_col,
            "moneda": moneda_col,
        }
    }


# ===================== IMPORT PASAPOARTE (OCR AI) =====================

@api_router.post("/import/passport")
async def ocr_passport(file: UploadFile = File(...)):
    """Citeste datele dintr-o fotografie de pasaport folosind Claude AI Vision"""
    import base64
    import json

    # Validare tip fisier
    allowed_types = {"image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Fisier invalid. Acceptam: JPG, PNG, WEBP, GIF")

    # Verificam ca avem API key
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY nu este configurat. Adauga cheia API Anthropic in variabilele de mediu ale serverului."
        )

    # Citim imaginea si o convertim la base64
    image_bytes = await file.read()
    base64_image = base64.standard_b64encode(image_bytes).decode("utf-8")

    try:
        import anthropic as anthropic_sdk
        client_ai = anthropic_sdk.Anthropic(api_key=api_key)

        message = client_ai.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=1024,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": file.content_type,
                            "data": base64_image,
                        }
                    },
                    {
                        "type": "text",
                        "text": """Analizezi o fotografie de pasaport. Extrage EXACT aceste informatii si returneaza DOAR un JSON valid, fara alt text:
{
  "first_name": "prenumele (GIVEN NAMES din pasaport)",
  "last_name": "numele de familie (SURNAME din pasaport)",
  "passport_number": "numarul pasaportului exact cum apare",
  "nationality": "nationalitatea in limba romana (ex: Nepaleза, Indiana, Sri Lankeza, Filipineza, Vietnameza)",
  "date_of_birth": "data nasterii in format YYYY-MM-DD",
  "passport_expiry": "data expirarii in format YYYY-MM-DD",
  "gender": "M sau F",
  "issuing_country": "tara emitenta (codul de 3 litere sau numele tarii)"
}
Daca un camp nu este vizibil sau nu il poti citi cu certitudine, pune null.
Returneaza DOAR JSON-ul, fara markdown, fara explicatii."""
                    }
                ]
            }]
        )

        # Parsam raspunsul JSON
        raw_text = message.content[0].text.strip()
        # Curatam markdown daca exista
        if raw_text.startswith("```"):
            raw_text = raw_text.split("```")[1]
            if raw_text.startswith("json"):
                raw_text = raw_text[4:]
            raw_text = raw_text.strip()

        extracted = json.loads(raw_text)

    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="AI-ul nu a putut extrage datele din imagine. Asigura-te ca poza este clara si pasaportul este vizibil.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Eroare la procesarea imaginii: {str(e)[:200]}")

    # Cautam daca exista deja un candidat cu acelasi numar de pasaport
    existing_candidate = None
    passport_num = extracted.get("passport_number")
    if passport_num:
        found = await db.candidates.find_one(
            {"passport_number": {"$regex": passport_num.replace(" ", ""), "$options": "i"}},
            {"_id": 0, "id": 1, "first_name": 1, "last_name": 1}
        )
        if found:
            existing_candidate = {
                "id": found.get("id"),
                "name": f"{found.get('first_name', '')} {found.get('last_name', '')}".strip()
            }

    return {
        "extracted": extracted,
        "existing_candidate": existing_candidate
    }


@api_router.post("/import/passport/confirm")
async def confirm_passport_import(body: dict):
    """Salveaza datele extrase din pasaport ca candidat in CRM"""
    data = body.get("data", {})
    update_existing = body.get("update_existing", False)
    candidate_id = body.get("candidate_id")

    if not data:
        raise HTTPException(status_code=400, detail="Nu exista date de salvat")

    if update_existing and candidate_id:
        # Actualizam candidatul existent
        update_fields = {}
        if data.get("passport_number"):
            update_fields["passport_number"] = data["passport_number"]
        if data.get("passport_expiry"):
            update_fields["passport_expiry"] = data["passport_expiry"]
        if data.get("nationality"):
            update_fields["nationality"] = data["nationality"]
        if data.get("date_of_birth"):
            update_fields["date_of_birth"] = data["date_of_birth"]
        if data.get("gender"):
            update_fields["gender"] = data["gender"]

        await db.candidates.update_one(
            {"id": candidate_id},
            {"$set": update_fields}
        )
        return {"saved": True, "candidate_id": candidate_id, "message": "Candidat actualizat cu datele din pasaport!"}
    else:
        # Cream candidat nou
        new_candidate = {
            "id": str(uuid.uuid4()),
            "first_name": data.get("first_name") or "",
            "last_name": data.get("last_name") or "",
            "passport_number": data.get("passport_number") or "",
            "passport_expiry": data.get("passport_expiry") or "",
            "nationality": data.get("nationality") or "",
            "date_of_birth": data.get("date_of_birth") or "",
            "gender": data.get("gender") or "",
            "phone": "",
            "email": "",
            "job_type": "",
            "status": "activ",
            "company_id": "",
            "company_name": "",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "source": "import_pasaport",
        }
        await db.candidates.insert_one(new_candidate)
        new_candidate.pop("_id", None)
        return {"saved": True, "candidate_id": new_candidate["id"], "message": f"Candidat nou creat: {new_candidate['first_name']} {new_candidate['last_name']}"}


# ===================== IMPORT AVIZE DE MUNCA IGI =====================

@api_router.get("/avize")
async def get_avize(status: Optional[str] = None, search: Optional[str] = None):
    """Lista tuturor avizelor de munca importate (staging)"""
    query = {}
    if status and status != "toate":
        query["import_status"] = status
    if search:
        regex = {"$regex": search, "$options": "i"}
        query["$or"] = [
            {"candidate_name": regex},
            {"company_name": regex},
            {"permit_number": regex},
            {"passport_number": regex},
            {"cnp": regex},
        ]
    docs = await db.avize_munca.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [serialize_doc(d) for d in docs]


async def ocr_aviz_bytes(file_bytes: bytes, filename: str) -> dict:
    """Helper: rulează OCR Claude pe bytes-urile unui aviz PDF și returnează datele extrase"""
    import base64, json, re

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY nu este configurat")

    is_pdf = filename.lower().endswith(".pdf")
    extracted_text = ""

    if is_pdf:
        try:
            import pypdf
            import io
            reader = pypdf.PdfReader(io.BytesIO(file_bytes))
            for page in reader.pages:
                extracted_text += page.extract_text() or ""
        except Exception:
            extracted_text = ""

    try:
        import anthropic as anthropic_sdk
        client_ai = anthropic_sdk.Anthropic(api_key=api_key)

        if len(extracted_text.strip()) > 100:
            prompt_content = [{"type": "text", "text": f"""Esti un expert in citirea avizelor de munca din Romania emise de IGI (Inspectoratul General pentru Imigrari).
Analizeaza urmatorul text extras dintr-un aviz de munca si extrage EXACT aceste informatii in format JSON:

{{
  "candidate_name": "numele complet al candidatului (SURNAME GIVEN_NAME asa cum apare in aviz)",
  "cnp": "codul numeric personal al candidatului",
  "birth_date": "data nasterii in format YYYY-MM-DD",
  "birth_place": "tara sau locul nasterii",
  "nationality": "nationalitatea candidatului (tara de origine)",
  "passport_number": "numarul pasaportului",
  "company_name": "denumirea companiei angajatoare",
  "company_cui": "codul fiscal/CUI al companiei (fara RO prefix)",
  "company_j": "numarul de inregistrare la Registrul Comertului (J.../...)",
  "job_title": "functia/ocupatia (ex: barman, ospatar, bucatar)",
  "cor_code": "codul COR al functiei",
  "permit_number": "numarul avizului de munca",
  "permit_date": "data emiterii avizului in format YYYY-MM-DD",
  "work_type": "tipul muncii: PERMANENT sau SEZONIER"
}}

Reguli:
- Extrage DOAR ce este explicit in text, nu inventa
- Pentru date foloseste formatul YYYY-MM-DD
- CUI fara prefix RO (ex: 31555494 nu RO31555494)
- Daca un camp lipseste pune string gol ""

TEXT AVIZ:
{extracted_text[:4000]}

Returneaza DOAR JSON-ul valid, fara alt text."""}]
        else:
            base64_data = base64.standard_b64encode(file_bytes).decode("utf-8")
            if is_pdf:
                media_type = "application/pdf"
            elif filename.lower().endswith(".png"):
                media_type = "image/png"
            else:
                media_type = "image/jpeg"

            prompt_content = [
                {
                    "type": "document",
                    "source": {
                        "type": "base64",
                        "media_type": "application/pdf",
                        "data": base64_data,
                    }
                } if is_pdf else {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": base64_data,
                    }
                },
                {"type": "text", "text": """Esti un expert in citirea avizelor de munca din Romania emise de IGI.
Extrage datele din acest aviz si returneaza DOAR un JSON cu:
{
  "candidate_name": "numele complet",
  "cnp": "CNP-ul",
  "birth_date": "YYYY-MM-DD",
  "birth_place": "tara nasterii",
  "nationality": "nationalitatea",
  "passport_number": "nr pasaport",
  "company_name": "denumire companie",
  "company_cui": "CUI fara RO",
  "company_j": "nr J",
  "job_title": "functia",
  "cor_code": "cod COR",
  "permit_number": "nr aviz",
  "permit_date": "YYYY-MM-DD",
  "work_type": "PERMANENT sau SEZONIER"
}
Returneaza DOAR JSON valid."""}
            ]

        message = client_ai.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=1000,
            messages=[{"role": "user", "content": prompt_content}]
        )

        raw = message.content[0].text.strip()
        if "```" in raw:
            m = re.search(r'\{.*\}', raw, re.DOTALL)
            raw = m.group() if m else "{}"

        return json.loads(raw)

    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="AI-ul nu a putut extrage datele. Verifica ca fisierul este un aviz IGI valid.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Eroare procesare: {str(e)[:300]}")


@api_router.post("/import/aviz")
async def ocr_aviz(file: UploadFile = File(...)):
    """OCR pe un aviz de munca PDF folosind Claude AI — extrage toate datele si le salveaza in staging"""
    file_bytes = await file.read()
    filename = file.filename or "aviz.pdf"

    extracted = await ocr_aviz_bytes(file_bytes, filename)

    aviz_doc = {
        "id": str(uuid.uuid4()),
        "filename": filename,
        "import_status": "nou",
        "created_at": datetime.now(timezone.utc).isoformat(),
        **{k: (v or "") for k, v in extracted.items()},
    }
    await db.avize_munca.insert_one(aviz_doc)
    aviz_doc.pop("_id", None)

    return {"id": aviz_doc["id"], "extracted": extracted, "doc": serialize_doc(aviz_doc)}


@api_router.post("/import/avize-email")
async def import_avize_from_email(current_user=Depends(get_current_user)):
    """Importă avize IGI din emailuri IMAP — caută PDF-uri cu 'aviz' în subiect sau în numele fișierului"""
    imap_host = os.environ.get("IMAP_HOST", "imap.gmail.com")
    imap_user = os.environ.get("IMAP_USER") or os.environ.get("SMTP_USER", "")
    imap_pass = os.environ.get("IMAP_PASS") or os.environ.get("SMTP_PASS", "")

    if not imap_user or not imap_pass:
        raise HTTPException(
            status_code=503,
            detail=(
                "IMAP neconfigurat. Adaugă în fișierul .env variabilele: "
                "IMAP_USER (sau SMTP_USER) și IMAP_PASS (sau SMTP_PASS). "
                "Pentru Gmail activează 'Acces aplicații mai puțin sigure' sau folosește o parolă de aplicație."
            )
        )

    imported_count = 0
    skipped_count = 0
    errors = []

    def _fetch_emails():
        """Funcție sincronă pentru conexiunea IMAP"""
        results = []
        try:
            mail = imaplib.IMAP4_SSL(imap_host)
            mail.login(imap_user, imap_pass)
            mail.select("INBOX")

            # Data de acum 90 zile
            since_date = (datetime.now() - timedelta(days=90)).strftime("%d-%b-%Y")

            # Caută emailuri cu "aviz" în subiect
            _, msg_ids_subj = mail.search(None, f'(SINCE {since_date} SUBJECT "aviz")')
            # Caută toate emailurile din ultimele 90 zile (pentru a verifica attachment-uri)
            _, msg_ids_all = mail.search(None, f'(SINCE {since_date})')

            all_ids = set()
            if msg_ids_subj[0]:
                all_ids.update(msg_ids_subj[0].split())
            if msg_ids_all[0]:
                all_ids.update(msg_ids_all[0].split())

            for msg_id in all_ids:
                try:
                    _, msg_data = mail.fetch(msg_id, "(RFC822)")
                    raw_email = msg_data[0][1]
                    msg = email_lib.message_from_bytes(raw_email)

                    subject = msg.get("Subject", "")
                    has_aviz_subject = "aviz" in subject.lower()

                    for part in msg.walk():
                        content_disposition = part.get("Content-Disposition", "")
                        filename_part = part.get_filename()
                        if not filename_part:
                            continue
                        # Decodează filename dacă e encoded
                        decoded_parts = email_lib.header.decode_header(filename_part)
                        filename_part = "".join(
                            p.decode(enc or "utf-8") if isinstance(p, bytes) else p
                            for p, enc in decoded_parts
                        )
                        is_pdf = filename_part.lower().endswith(".pdf")
                        has_aviz_in_name = "aviz" in filename_part.lower()

                        if is_pdf and (has_aviz_subject or has_aviz_in_name):
                            pdf_bytes = part.get_payload(decode=True)
                            if pdf_bytes:
                                results.append((pdf_bytes, filename_part))
                except Exception as e:
                    errors.append(f"Eroare citire email {msg_id}: {str(e)[:100]}")

            mail.logout()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Eroare conexiune IMAP: {str(e)[:200]}")
        return results

    loop = asyncio.get_event_loop()
    try:
        pdf_attachments = await loop.run_in_executor(None, _fetch_emails)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Eroare IMAP: {str(e)[:200]}")

    for pdf_bytes, pdf_filename in pdf_attachments:
        try:
            extracted = await ocr_aviz_bytes(pdf_bytes, pdf_filename)
            permit_number = extracted.get("permit_number", "").strip()

            # Skip dacă permit_number există deja
            if permit_number:
                existing = await db.avize_munca.find_one({"permit_number": permit_number})
                if existing:
                    skipped_count += 1
                    continue

            aviz_doc = {
                "id": str(uuid.uuid4()),
                "filename": pdf_filename,
                "import_status": "nou",
                "source": "email",
                "created_at": datetime.now(timezone.utc).isoformat(),
                **{k: (v or "") for k, v in extracted.items()},
            }
            await db.avize_munca.insert_one(aviz_doc)
            imported_count += 1
        except Exception as e:
            errors.append(f"{pdf_filename}: {str(e)[:150]}")

    return {"imported": imported_count, "skipped": skipped_count, "errors": errors}


@api_router.put("/avize/{aviz_id}")
async def update_aviz(aviz_id: str, body: dict):
    """Actualizeaza datele unui aviz din staging (editare manuala)"""
    allowed = {"candidate_name","cnp","birth_date","birth_place","nationality","passport_number",
               "company_name","company_cui","company_j","job_title","cor_code","permit_number","permit_date","work_type"}
    update = {k: v for k, v in body.items() if k in allowed}
    if not update:
        raise HTTPException(status_code=400, detail="Niciun camp de actualizat")
    await db.avize_munca.update_one({"id": aviz_id}, {"$set": update})
    return {"updated": True}


@api_router.post("/avize/{aviz_id}/import")
async def import_aviz_to_crm(aviz_id: str):
    """Importa un aviz din staging in CRM: actualizeaza/creeaza candidat si dosar imigrare"""
    aviz = await db.avize_munca.find_one({"id": aviz_id})
    if not aviz:
        raise HTTPException(status_code=404, detail="Aviz negasit")

    candidate_name = aviz.get("candidate_name", "")
    passport_number = aviz.get("passport_number", "")
    cnp = aviz.get("cnp", "")

    # 1. Gaseste sau creeaza candidatul
    candidate = None
    if passport_number:
        candidate = await db.candidates.find_one({"passport_number": {"$regex": passport_number.strip(), "$options": "i"}})
    if not candidate and cnp:
        candidate = await db.candidates.find_one({"personal_number": cnp})
    if not candidate and candidate_name:
        parts = candidate_name.strip().split()
        if len(parts) >= 2:
            candidate = await db.candidates.find_one({"last_name": {"$regex": parts[0], "$options": "i"}})

    # Split nume pentru candidat
    parts = candidate_name.strip().split()
    last_name = parts[0] if parts else candidate_name
    first_name = " ".join(parts[1:]) if len(parts) > 1 else ""

    if candidate:
        # Actualizeaza candidatul existent
        update_fields = {}
        if passport_number and not candidate.get("passport_number"):
            update_fields["passport_number"] = passport_number
        if cnp and not candidate.get("personal_number"):
            update_fields["personal_number"] = cnp
        if aviz.get("birth_date") and not candidate.get("birth_date"):
            update_fields["birth_date"] = aviz["birth_date"]
        if aviz.get("nationality") and not candidate.get("nationality"):
            update_fields["nationality"] = aviz["nationality"]
        if aviz.get("birth_place") and not candidate.get("birth_country"):
            update_fields["birth_country"] = aviz["birth_place"]
        if aviz.get("job_title") and not candidate.get("job_type"):
            update_fields["job_type"] = aviz["job_title"]
        if aviz.get("company_name") and not candidate.get("company_name"):
            update_fields["company_name"] = aviz["company_name"]
        if update_fields:
            await db.candidates.update_one({"id": candidate["id"]}, {"$set": update_fields})
        candidate_id = candidate["id"]
    else:
        # Creeaza candidat nou
        new_candidate = {
            "id": str(uuid.uuid4()),
            "first_name": first_name,
            "last_name": last_name,
            "passport_number": passport_number,
            "personal_number": cnp,
            "birth_date": aviz.get("birth_date", ""),
            "birth_country": aviz.get("birth_place", ""),
            "nationality": aviz.get("nationality", ""),
            "job_type": aviz.get("job_title", ""),
            "company_name": aviz.get("company_name", ""),
            "status": "plasat",
            "phone": "", "email": "",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "source": "import_aviz",
        }
        await db.candidates.insert_one(new_candidate)
        candidate_id = new_candidate["id"]

    # 2. Gaseste sau creeaza compania
    company_id = ""
    company_name = aviz.get("company_name", "")
    company_cui = aviz.get("company_cui", "")
    if company_cui:
        company = await db.companies.find_one({"cui": {"$regex": company_cui, "$options": "i"}})
        if not company and company_name:
            company = await db.companies.find_one({"name": {"$regex": company_name[:15], "$options": "i"}})
        if company:
            company_id = company.get("id", "")

    # 3. Actualizeaza dosarul de imigrare existent sau creeaza unul nou
    existing_case = None
    if candidate_id:
        existing_case = await db.immigration_cases.find_one({"candidate_id": candidate_id})
    if not existing_case and aviz.get("permit_number"):
        existing_case = await db.immigration_cases.find_one({"aviz_number": aviz["permit_number"]})

    aviz_update = {
        "aviz_number": aviz.get("permit_number", ""),
        "aviz_date": aviz.get("permit_date", ""),
        "cor_code": aviz.get("cor_code", ""),
        "job_title": aviz.get("job_title", ""),
    }

    if existing_case:
        await db.immigration_cases.update_one(
            {"id": existing_case["id"]},
            {"$set": {k: v for k, v in aviz_update.items() if v}}
        )
    else:
        new_case = {
            "id": str(uuid.uuid4()),
            "candidate_id": candidate_id,
            "candidate_name": candidate_name,
            "company_id": company_id,
            "company_name": company_name,
            "case_type": "angajare",
            "current_stage_name": "Aviz obtinut",
            "status": "activ",
            **aviz_update,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.immigration_cases.insert_one(new_case)

    # 4. Marcheaza avizul ca importat
    await db.avize_munca.update_one(
        {"id": aviz_id},
        {"$set": {"import_status": "importat", "candidate_id": candidate_id, "imported_at": datetime.now(timezone.utc).isoformat()}}
    )

    return {"imported": True, "candidate_id": candidate_id, "message": f"Aviz importat cu succes pentru {candidate_name}"}


@api_router.delete("/avize/{aviz_id}")
async def delete_aviz(aviz_id: str):
    """Sterge un aviz din staging"""
    result = await db.avize_munca.delete_one({"id": aviz_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Aviz negasit")
    return {"deleted": True}


# ===================== GLOBAL SEARCH =====================

@api_router.get("/search")
async def global_search(q: str = ""):
    if not q or len(q) < 2:
        return {"candidates": [], "companies": [], "cases": []}
    regex = {"$regex": q, "$options": "i"}
    candidates = await db.candidates.find(
        {"$or": [{"first_name": regex}, {"last_name": regex}, {"passport_number": regex}]},
        {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "nationality": 1, "passport_number": 1, "company_name": 1}
    ).limit(5).to_list(5)
    companies = await db.companies.find(
        {"$or": [{"name": regex}, {"cui": regex}]},
        {"_id": 0, "id": 1, "name": 1, "cui": 1, "city": 1}
    ).limit(5).to_list(5)
    cases = await db.immigration_cases.find(
        {"$or": [{"candidate_name": regex}, {"company_name": regex}, {"igi_number": regex}, {"aviz_number": regex}]},
        {"_id": 0, "id": 1, "candidate_name": 1, "company_name": 1, "current_stage_name": 1, "igi_number": 1}
    ).limit(5).to_list(5)
    return {
        "candidates": [serialize_doc(c) for c in candidates],
        "companies": [serialize_doc(c) for c in companies],
        "cases": [serialize_doc(c) for c in cases],
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

async def send_task_reminders():
    """Trimite email remindere pentru sarcinile cu termen apropiat (24h și 3h)"""
    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_pass = os.environ.get("SMTP_PASS", "")

    if not smtp_user or not smtp_pass:
        return {"sent_24h": 0, "sent_3h": 0}

    sent_24h = 0
    sent_3h = 0
    now = datetime.now(timezone.utc)

    tasks_cursor = db.tasks.find({"status": {"$ne": "done"}}, {"_id": 0})
    tasks_list = await tasks_cursor.to_list(1000)

    for task in tasks_list:
        due_date = task.get("due_date")
        if not due_date:
            continue

        due_time = task.get("due_time") or "09:00"
        try:
            due_dt = datetime.fromisoformat(f"{due_date}T{due_time}:00").replace(tzinfo=timezone.utc)
        except Exception:
            continue

        diff_hours = (due_dt - now).total_seconds() / 3600

        def _build_body(label):
            body = f"Reminder sarcină — {label}\n\n"
            body += f"Titlu: {task.get('title', '')}\n"
            body += f"Termen: {due_date} {due_time}\n"
            body += f"Prioritate: {task.get('priority', 'normal')}\n"
            if task.get("description"):
                body += f"Descriere: {task['description']}\n"
            if task.get("assigned_to"):
                body += f"Atribuit: {task['assigned_to']}\n"
            if task.get("meeting_scheduled"):
                body += "\n📅 ÎNTÂLNIRE PROGRAMATĂ\n"
                if task.get("meeting_with"):
                    body += f"  Cu cine: {task['meeting_with']}\n"
                if task.get("meeting_contact"):
                    body += f"  Contact: {task['meeting_contact']}\n"
                if task.get("meeting_datetime"):
                    body += f"  Data/ora: {task['meeting_datetime']}\n"
                if task.get("meeting_materials"):
                    body += f"  Materiale: {task['meeting_materials']}\n"
            return body

        def _send_reminder(subject, body, recipients):
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = smtp_user
            msg["To"] = recipients[0]
            if len(recipients) > 1:
                msg["Cc"] = ", ".join(recipients[1:])
            msg.attach(MIMEText(body, "plain", "utf-8"))
            html_body = body.replace("\n", "<br>")
            msg.attach(MIMEText(f"<html><body style='font-family:Arial,sans-serif;'>{html_body}</body></html>", "html", "utf-8"))
            with smtplib.SMTP(smtp_host, smtp_port) as server:
                server.ehlo()
                server.starttls()
                server.login(smtp_user, smtp_pass)
                server.sendmail(smtp_user, recipients, msg.as_string())

        try:
            if task.get("notify_24h") and not task.get("notify_sent_24h") and 23 <= diff_hours <= 25:
                label = "24h înainte de termen"
                subject = f"⏰ Reminder 24h: {task.get('title', '')}"
                body = _build_body(label)
                recipients = [smtp_user]
                if task.get("assigned_email"):
                    recipients.append(task["assigned_email"])
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, _send_reminder, subject, body, recipients)
                await db.tasks.update_one({"id": task["id"]}, {"$set": {"notify_sent_24h": True}})
                sent_24h += 1

            elif task.get("notify_3h") and not task.get("notify_sent_3h") and 2 <= diff_hours <= 4:
                label = "3h înainte de termen"
                subject = f"⏰ Reminder 3h: {task.get('title', '')}"
                body = _build_body(label)
                recipients = [smtp_user]
                if task.get("assigned_email"):
                    recipients.append(task["assigned_email"])
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(None, _send_reminder, subject, body, recipients)
                await db.tasks.update_one({"id": task["id"]}, {"$set": {"notify_sent_3h": True}})
                sent_3h += 1
        except Exception as e:
            logger.warning(f"Eroare trimitere reminder task {task.get('id')}: {e}")

    return {"sent_24h": sent_24h, "sent_3h": sent_3h}


@api_router.post("/tasks/send-reminders")
async def manual_send_reminders(current_user=Depends(get_current_user)):
    """Trimite manual remindere pentru sarcinile cu termen apropiat"""
    result = await send_task_reminders()
    return result


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

    # Pornește scheduler pentru remindere sarcini
    scheduler.add_job(send_task_reminders, 'interval', hours=1, id='task_reminders', replace_existing=True)
    scheduler.start()
    logger.info("Scheduler pornit: remindere sarcini la fiecare oră")

@app.on_event("shutdown")
async def shutdown_db_client():
    scheduler.shutdown(wait=False)
    client.close()

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=False)
