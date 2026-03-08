from fastapi import FastAPI, APIRouter, HTTPException, Query
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

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="GJC AI-CRM API", version="2.0")
api_router = APIRouter(prefix="/api")

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

class ImmigrationCase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    candidate_id: str
    candidate_name: Optional[str] = None
    company_id: Optional[str] = None
    company_name: Optional[str] = None
    case_type: str
    status: str = "initiat"
    current_stage: int = 1
    submitted_date: Optional[str] = None
    deadline: Optional[str] = None
    assigned_to: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ImmigrationCaseCreate(BaseModel):
    candidate_id: str
    candidate_name: Optional[str] = None
    company_id: Optional[str] = None
    company_name: Optional[str] = None
    case_type: str
    status: str = "initiat"
    submitted_date: Optional[str] = None
    deadline: Optional[str] = None
    assigned_to: Optional[str] = None
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
    "Documente Pregatite",
    "Permis Munca Depus",
    "Permis Munca Aprobat",
    "Viza Depusa",
    "Viza Aprobata",
    "Sosit Romania",
    "Permis Sedere"
]

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

@api_router.post("/immigration", response_model=ImmigrationCase)
async def create_immigration_case(input: ImmigrationCaseCreate):
    case = ImmigrationCase(**input.model_dump())
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
    
    await db.immigration_cases.update_one(
        {"id": case_id},
        {"$set": {"current_stage": new_stage, "status": new_status}}
    )
    
    return {
        "message": f"Dosar avansat la etapa {new_stage}: {IMMIGRATION_STAGES[new_stage - 1]}",
        "current_stage": new_stage,
        "stage_name": IMMIGRATION_STAGES[new_stage - 1]
    }

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
        today = datetime.now().strftime("%Y-%m-%d")
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                "https://webservicesp.anaf.ro/PlatitorTvaRest/api/v8/ws/tva",
                json=[{"cui": int(cui.replace("RO", "").strip()), "data": today}]
            )
            if response.status_code == 200:
                data = response.json()
                if data.get("found") and len(data["found"]) > 0:
                    company = data["found"][0]
                    return {
                        "success": True,
                        "data": {
                            "name": company.get("denumire", ""),
                            "cui": cui,
                            "address": company.get("adresa", ""),
                            "city": company.get("adresa", "").split(",")[-1].strip() if company.get("adresa") else "",
                            "status_tva": "Platitor TVA" if company.get("scpTVA") else "Neplatitor TVA"
                        }
                    }
            return {"success": False, "error": "CUI nu a fost găsit"}
    except Exception as e:
        return {"success": False, "error": str(e)}

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

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
