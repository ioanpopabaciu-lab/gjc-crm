"""
GJC Legal AI Assistant — FastAPI Router
Toate endpoint-urile pentru modulul Legal AI (corpus, generare, documente).
"""

import os
import io
import hashlib
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Dict, Any

import jwt
import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from legal_rag import (
    chunk_legal_text,
    search_corpus,
    generate_legal_document,
    get_embedding,
)
from legal_docx import generate_docx, DOCX_AVAILABLE

logger = logging.getLogger(__name__)

# ── DB (conexiune independentă față de server.py) ─────────────────────────────
_mongo_url = os.environ.get("MONGO_URL", "")
_db_name   = os.environ.get("DB_NAME", "gjc_crm_db")
_client    = AsyncIOMotorClient(_mongo_url)
_db        = _client[_db_name]

# ── Auth ─────────────────────────────────────────────────────────────────────
JWT_SECRET    = os.environ.get("JWT_SECRET", "gjc-secret-key-2026-very-secure")
JWT_ALGORITHM = "HS256"
_security     = HTTPBearer(auto_error=False)

LEGAL_DIR = Path(__file__).parent / "uploads" / "legal"
LEGAL_DIR.mkdir(parents=True, exist_ok=True)


async def _require_legal_read(credentials: HTTPAuthorizationCredentials = Depends(_security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Autentificare necesară")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Token invalid")
        user = await _db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User negăsit")
        role        = user.get("role", "")
        permissions = user.get("permissions", [])
        if role != "admin" and "legal_read" not in permissions:
            raise HTTPException(status_code=403, detail="Acces interzis — necesită legal_read")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirat")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token invalid")


async def _require_legal_generate(credentials: HTTPAuthorizationCredentials = Depends(_security)):
    user = await _require_legal_read(credentials)
    role        = user.get("role", "")
    permissions = user.get("permissions", [])
    if role != "admin" and "legal_generate" not in permissions:
        raise HTTPException(status_code=403, detail="Acces interzis — necesită legal_generate")
    return user


# ── TEMPLATES definite în cod ────────────────────────────────────────────────

TEMPLATES: Dict[str, Dict] = {
    "DEMISIE_ART_81_8": {
        "id":          "DEMISIE_ART_81_8",
        "name":        "Demisie — Art. 81 alin. (8) Codul Muncii",
        "category":    "Raporturi de muncă",
        "description": "Demisie motivată prin neplata salariului. Conform art. 81 alin. (8) CM, salariatul poate demisiona fără preaviz (sau cu 48h) dacă angajatorul nu și-a îndeplinit obligațiile contractuale.",
        "emitent":     "candidat",
        "variables": [
            {"key": "candidat_name",       "label": "Numele complet candidat",       "required": True,  "source": "candidate", "type": "text"},
            {"key": "candidat_cnp",        "label": "CNP / serie pașaport",           "required": False, "source": "candidate", "type": "text"},
            {"key": "candidat_nationalitate","label": "Naționalitate",                "required": False, "source": "candidate", "type": "text"},
            {"key": "candidat_adresa",     "label": "Adresa candidat",               "required": False, "source": "manual",    "type": "text"},
            {"key": "angajator_name",      "label": "Denumire angajator",            "required": True,  "source": "company",   "type": "text"},
            {"key": "angajator_cui",       "label": "CUI angajator",                 "required": False, "source": "company",   "type": "text"},
            {"key": "angajator_adresa",    "label": "Adresa angajatorului",          "required": False, "source": "company",   "type": "text"},
            {"key": "angajator_reprezentant","label":"Reprezentant legal angajator",  "required": False, "source": "manual",    "type": "text"},
            {"key": "functia",             "label": "Funcția / postul ocupat",       "required": False, "source": "manual",    "type": "text"},
            {"key": "data_angajarii",      "label": "Data angajării (dd.mm.yyyy)",   "required": False, "source": "manual",    "type": "text"},
            {"key": "luna_neplatita",      "label": "Luna/lunile neplatite",         "required": True,  "source": "manual",    "type": "text"},
            {"key": "suma_neplatita",      "label": "Suma neplatită estimată (RON)", "required": False, "source": "manual",    "type": "text"},
            {"key": "data_ultimei_plati",  "label": "Data ultimei plăți salariu",    "required": False, "source": "manual",    "type": "text"},
            {"key": "data_demisiei",       "label": "Data demisiei (dd.mm.yyyy)",    "required": True,  "source": "manual",    "type": "text"},
            {"key": "motiv_suplimentar",   "label": "Motive suplimentare (opțional)","required": False, "source": "manual",    "type": "textarea"},
        ],
        "rag_queries": [
            "art 81 alin 8 cod muncă demisie fără preaviz neplata salariului",
            "art 171 codul muncii obligatia angajatorului plata salariului",
            "art 253 cod muncă răspunderea angajatorului daune",
            "art 39 drepturile salariatului salariu muncă",
        ],
        "min_citations": 2,
        "bulk_mode":     True,
        "bulk_key":      "candidat_name",
    },
    "PLANGERE_ITM": {
        "id":          "PLANGERE_ITM",
        "name":        "Sesizare / Plângere la Inspectoratul Teritorial de Muncă",
        "category":    "Relații cu autoritățile",
        "description": "Sesizare formală la ITM pentru încălcarea legislației muncii de către angajator (neplata salariilor, condiții de muncă, nerespectare CM).",
        "emitent":     "GJC",
        "variables": [
            {"key": "sesizant_name",       "label": "Numele sesizantului",           "required": True,  "source": "manual",    "type": "text"},
            {"key": "sesizant_calitate",   "label": "Calitate (salariat / GJC)",     "required": True,  "source": "manual",    "type": "text"},
            {"key": "angajator_name",      "label": "Denumire angajator reclamat",   "required": True,  "source": "company",   "type": "text"},
            {"key": "angajator_cui",       "label": "CUI angajator reclamat",        "required": False, "source": "company",   "type": "text"},
            {"key": "angajator_adresa",    "label": "Adresa angajatorului",          "required": False, "source": "company",   "type": "text"},
            {"key": "fapta_descriere",     "label": "Descrierea faptei / situației", "required": True,  "source": "manual",    "type": "textarea"},
            {"key": "perioada_faptei",     "label": "Perioada faptelor (ex: ian-mar 2026)","required": True,"source": "manual","type": "text"},
            {"key": "nr_salariati_afectati","label":"Nr. salariați afectați",        "required": False, "source": "manual",    "type": "text"},
            {"key": "probe_anexate",       "label": "Probe/documente anexate",       "required": False, "source": "manual",    "type": "textarea"},
            {"key": "itm_judet",           "label": "Județ ITM sesizat",             "required": True,  "source": "manual",    "type": "text"},
            {"key": "data_sesizarii",      "label": "Data sesizării (dd.mm.yyyy)",   "required": True,  "source": "manual",    "type": "text"},
            {"key": "nr_inregistrare_ref", "label": "Nr. înregistrare anterior (dacă există)","required": False,"source": "manual","type": "text"},
        ],
        "rag_queries": [
            "art 8 legea 108 1999 inspecția muncii atribuții sesizare",
            "art 171 codul muncii plata salariului obligație angajator",
            "art 260 cod muncă contravenții angajator sancțiuni",
            "art 7 legea 108 inspecția muncii contravenții amenzi",
        ],
        "min_citations": 3,
        "bulk_mode":     False,
    },
    "PROCURA_IGI": {
        "id":          "PROCURA_IGI",
        "name":        "Procură specială pentru reprezentare IGI",
        "category":    "Proceduri IGI",
        "description": "Procură autentificată prin care un cetățean străin împuternicește GJC să îl reprezinte în fața IGI pentru depunerea dosarului de viză/permis.",
        "emitent":     "candidat",
        "variables": [
            {"key": "mandant_name",        "label": "Numele mandantului (candidat)", "required": True,  "source": "candidate", "type": "text"},
            {"key": "mandant_nationalitate","label": "Naționalitate mandant",        "required": True,  "source": "candidate", "type": "text"},
            {"key": "mandant_pasaport",    "label": "Nr. pașaport mandant",          "required": True,  "source": "candidate", "type": "text"},
            {"key": "mandant_nascut",      "label": "Data nașterii mandant",         "required": False, "source": "candidate", "type": "text"},
            {"key": "mandatar_name",       "label": "Numele mandatarului (GJC rep.)","required": True,  "source": "manual",    "type": "text"},
            {"key": "mandatar_cnp",        "label": "CNP mandatar",                  "required": False, "source": "manual",    "type": "text"},
            {"key": "scopul_procurii",     "label": "Scopul procurii (depunere dosar, ridicare acte etc.)", "required": True, "source": "manual", "type": "textarea"},
            {"key": "data_procurii",       "label": "Data (dd.mm.yyyy)",             "required": True,  "source": "manual",    "type": "text"},
            {"key": "valabilitate",        "label": "Valabilitate (ex: 12 luni)",    "required": False, "source": "manual",    "type": "text"},
        ],
        "rag_queries": [
            "procura speciala reprezentare IGI inspectoratul general imigrari",
            "art 1294 cod civil contractul de mandat procura",
            "oug 194 2002 regimul strainilor procedura dosar",
        ],
        "min_citations": 1,
        "bulk_mode":     False,
    },
    "MEMORIU_CONTESTATIE": {
        "id":          "MEMORIU_CONTESTATIE",
        "name":        "Memoriu / Contestație administrativă",
        "category":    "Contestații",
        "description": "Memoriu sau contestație adresată unei autorități (ITM, ANOFM, IGI, Tribunal Muncii) împotriva unui act administrativ sau a unei decizii.",
        "emitent":     "GJC",
        "variables": [
            {"key": "contestatar_name",    "label": "Contestatar (persoana/firma)",  "required": True,  "source": "manual",    "type": "text"},
            {"key": "autoritate_name",     "label": "Autoritatea sesizată",          "required": True,  "source": "manual",    "type": "text"},
            {"key": "act_contestat",       "label": "Actul contestat (nr/data)",     "required": True,  "source": "manual",    "type": "text"},
            {"key": "motivare",            "label": "Motivarea contestației",        "required": True,  "source": "manual",    "type": "textarea"},
            {"key": "solicitare",          "label": "Ce solicitați (anulare, modificare etc.)", "required": True, "source": "manual", "type": "textarea"},
            {"key": "probe_anexate",       "label": "Probe/documente anexate",       "required": False, "source": "manual",    "type": "textarea"},
            {"key": "data_contestatiei",   "label": "Data (dd.mm.yyyy)",             "required": True,  "source": "manual",    "type": "text"},
        ],
        "rag_queries": [
            "art 7 legea 554 2004 contenciosul administrativ contestatie",
            "art 268 codul muncii contestatie decizie instanta",
            "termen contestatie 30 zile act administrativ",
        ],
        "min_citations": 2,
        "bulk_mode":     False,
    },
}


# ── Pydantic models ───────────────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    template_id:    str
    variables:      Dict[str, Any]
    extra_context:  str  = ""
    bulk_candidates: Optional[List[Dict[str, Any]]] = None   # pentru bulk mode


class ValidateDocRequest(BaseModel):
    notes: str = ""


class ScrapeJobCreate(BaseModel):
    url:      str
    act_type: str = "lege"
    title:    str = ""
    notes:    str = ""


# ── Router ────────────────────────────────────────────────────────────────────
legal_router = APIRouter(prefix="/legal", tags=["Legal AI"])


# ═══════════════════════════════════════════════════════════════════════════════
#  SETUP — creare indexuri MongoDB la pornire
# ═══════════════════════════════════════════════════════════════════════════════

async def setup_legal_indexes():
    """Creează indexurile MongoDB necesare (apelat din server.py la startup)."""
    try:
        # Index full-text pe legal_chunks cu suport română
        await _db.legal_chunks.create_index(
            [("text", "text"), ("act_title", "text"), ("section_path", "text")],
            default_language="romanian",
            name="legal_chunks_text_idx",
        )
        # Unique pe content_hash (idempotent ingest)
        await _db.legal_chunks.create_index("content_hash", unique=True, sparse=True,
                                            name="legal_chunks_hash_idx")
        await _db.legal_chunks.create_index("act_id", name="legal_chunks_act_idx")

        # Index pe legal_acts
        await _db.legal_acts.create_index("content_hash", unique=True, sparse=True,
                                          name="legal_acts_hash_idx")
        await _db.legal_acts.create_index([("act_type", 1), ("act_year", -1)],
                                          name="legal_acts_type_year_idx")

        # Index pe generated_documents
        await _db.generated_documents.create_index("created_by",
                                                   name="gendocs_created_by_idx")
        await _db.generated_documents.create_index([("created_at", -1)],
                                                   name="gendocs_date_idx")

        logger.info("Legal AI: indexuri MongoDB create cu succes")
    except Exception as e:
        logger.warning(f"Legal AI: eroare la creare indexuri (pot exista deja): {e}")


# ═══════════════════════════════════════════════════════════════════════════════
#  CORPUS — Acte normative
# ═══════════════════════════════════════════════════════════════════════════════

@legal_router.get("/acts")
async def list_acts(user: dict = Depends(_require_legal_read)):
    """Listează toate actele normative din corpus."""
    acts = await _db.legal_acts.find({}, {"_id": 0}).sort("ingested_at", -1).to_list(200)
    return acts


@legal_router.post("/acts/upload")
async def upload_act(
    file:       UploadFile = File(...),
    title:      str = Form(...),
    act_type:   str = Form("lege"),        # lege, oug, hg, ordin, cod
    act_number: str = Form(""),
    act_year:   str = Form(""),
    source_url: str = Form(""),
    user: dict = Depends(_require_legal_generate),
):
    """
    Încarcă un act normativ (.docx / .pdf / .txt) și îl ingerează în corpus.
    Idempotent: dacă hash-ul e același, nu duplicăm.
    """
    content_bytes = await file.read()
    content_hash  = hashlib.sha256(content_bytes).hexdigest()

    # Verifică duplicat
    existing = await _db.legal_acts.find_one({"content_hash": content_hash})
    if existing:
        return {
            "status":  "skipped",
            "message": "Act deja ingerat (hash identic)",
            "act_id":  existing["id"],
        }

    # Extrage text
    text = _extract_text(content_bytes, file.filename or "")
    if not text or len(text.strip()) < 100:
        raise HTTPException(status_code=400, detail="Fișierul nu conține text suficient sau nu poate fi citit")

    # Crează actul
    act_id = str(uuid.uuid4())
    act_doc = {
        "id":           act_id,
        "title":        title,
        "act_type":     act_type,
        "act_number":   act_number,
        "act_year":     int(act_year) if act_year.isdigit() else None,
        "source_url":   source_url,
        "filename":     file.filename,
        "content_hash": content_hash,
        "status":       "active",
        "ingested_at":  datetime.now(timezone.utc).isoformat(),
        "created_by":   user.get("email", ""),
    }

    # Chunking
    raw_chunks = chunk_legal_text(text, act_title=title, act_id=act_id)

    # Inserare chunks
    inserted = 0
    skipped  = 0
    for idx, chunk_data in enumerate(raw_chunks):
        chunk_text = chunk_data["text"]
        c_hash = hashlib.md5(chunk_text.encode()).hexdigest()
        # Embedding opțional
        embedding = await get_embedding(chunk_text)
        chunk_doc = {
            "id":             str(uuid.uuid4()),
            "act_id":         act_id,
            "act_title":      title,
            "chunk_index":    idx,
            "section_path":   chunk_data["section_path"],
            "article_number": chunk_data.get("article_number"),
            "text":           chunk_text,
            "chunk_type":     chunk_data.get("chunk_type", "paragraph"),
            "token_count":    len(chunk_text.split()),
            "content_hash":   c_hash,
            "embedding":      embedding,
            "created_at":     datetime.now(timezone.utc).isoformat(),
        }
        try:
            await _db.legal_chunks.insert_one(chunk_doc)
            inserted += 1
        except Exception:
            skipped += 1

    act_doc["total_chunks"] = inserted
    try:
        await _db.legal_acts.insert_one(act_doc)
    except Exception as e:
        logger.error(f"Eroare inserare act: {e}")
        raise HTTPException(status_code=500, detail=f"Eroare la salvarea actului: {e}")

    return {
        "status":      "ok",
        "act_id":      act_id,
        "title":       title,
        "chunks":      inserted,
        "skipped":     skipped,
        "message":     f"Act ingerat: {inserted} fragmente indexate",
        "has_embeddings": embedding is not None,
    }


@legal_router.delete("/acts/{act_id}")
async def delete_act(act_id: str, user: dict = Depends(_require_legal_generate)):
    """Șterge un act normativ și toate fragmentele lui."""
    act = await _db.legal_acts.find_one({"id": act_id})
    if not act:
        raise HTTPException(status_code=404, detail="Act negăsit")
    await _db.legal_chunks.delete_many({"act_id": act_id})
    await _db.legal_acts.delete_one({"id": act_id})
    return {"status": "ok", "message": f"Act '{act['title']}' și fragmentele lui au fost șterse"}


@legal_router.get("/acts/{act_id}/chunks")
async def get_act_chunks(act_id: str, user: dict = Depends(_require_legal_read)):
    """Returnează fragmentele unui act (fără embedding pentru performanță)."""
    chunks = await _db.legal_chunks.find(
        {"act_id": act_id}, {"_id": 0, "embedding": 0}
    ).sort("chunk_index", 1).to_list(500)
    return chunks


# ═══════════════════════════════════════════════════════════════════════════════
#  CĂUTARE
# ═══════════════════════════════════════════════════════════════════════════════

@legal_router.get("/search")
async def search_legal(
    q:      str = Query(..., min_length=3),
    top_k:  int = Query(10, ge=1, le=30),
    act_id: Optional[str] = None,
    user:   dict = Depends(_require_legal_read),
):
    """Căutare semantică/full-text în corpus."""
    chunks = await search_corpus(_db, q, top_k=top_k, act_id=act_id)
    return {
        "query":   q,
        "results": chunks,
        "count":   len(chunks),
        "has_semantic": bool(os.environ.get("VOYAGE_API_KEY") or os.environ.get("COHERE_API_KEY")),
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  TEMPLATES
# ═══════════════════════════════════════════════════════════════════════════════

@legal_router.get("/templates")
async def list_templates(user: dict = Depends(_require_legal_read)):
    """Listează toate template-urile disponibile."""
    result = []
    for t in TEMPLATES.values():
        result.append({
            "id":          t["id"],
            "name":        t["name"],
            "category":    t["category"],
            "description": t["description"],
            "variables":   t["variables"],
            "bulk_mode":   t.get("bulk_mode", False),
            "emitent":     t.get("emitent", "GJC"),
        })
    return result


# ═══════════════════════════════════════════════════════════════════════════════
#  GENERARE DOCUMENTE
# ═══════════════════════════════════════════════════════════════════════════════

@legal_router.post("/generate")
async def generate_document(
    req:  GenerateRequest,
    user: dict = Depends(_require_legal_generate),
):
    """
    Generează un document juridic din template.
    Suportă bulk mode (array de candidați pentru demisii individuale).
    """
    template_def = TEMPLATES.get(req.template_id)
    if not template_def:
        raise HTTPException(status_code=404, detail=f"Template '{req.template_id}' negăsit")

    # ── Verifică corpus ───────────────────────────────────────────────────────
    corpus_count = await _db.legal_chunks.count_documents({})

    # ── Bulk mode ─────────────────────────────────────────────────────────────
    if template_def.get("bulk_mode") and req.bulk_candidates:
        docs = []
        for candidate_vars in req.bulk_candidates:
            merged_vars = {**req.variables, **candidate_vars}
            result = await _generate_single(
                template_def, merged_vars, req.extra_context, user, corpus_count
            )
            docs.append(result)
        return {"bulk": True, "count": len(docs), "documents": docs}

    # ── Document individual ───────────────────────────────────────────────────
    doc_result = await _generate_single(
        template_def, req.variables, req.extra_context, user, corpus_count
    )
    return doc_result


async def _generate_single(
    template_def: Dict,
    variables:    Dict,
    extra_context: str,
    user:         Dict,
    corpus_count: int,
) -> Dict:
    """Generare internă pentru un singur document."""
    doc_id = str(uuid.uuid4())

    # Avertisment dacă corpusul e gol
    warning = None
    if corpus_count == 0:
        warning = "⚠️ Corpusul legislativ este gol! Documentul va fi generat fără bază legală verificată. Încarcă acte normative din tab-ul 'Corpus Legislativ'."

    # Generare RAG + Claude
    result = await generate_legal_document(_db, template_def, variables, extra_context)

    # Generare .docx
    docx_filename = None
    docx_error    = None
    if DOCX_AVAILABLE:
        try:
            candidat_name = variables.get("candidat_name", variables.get("mandant_name", ""))
            docx_filename = generate_docx(
                title      = template_def["name"],
                body_text  = result["text"],
                template_id= template_def["id"],
                variables  = variables,
                doc_id     = doc_id,
                emitent    = template_def.get("emitent", "GJC"),
                candidat_name = candidat_name,
            )
        except Exception as e:
            docx_error = str(e)
            logger.error(f"DOCX generation error: {e}")
    else:
        docx_error = "python-docx nu e instalat"

    # Salvare în MongoDB
    validation  = result["citations_validation"]
    status      = "draft"   # Rămâne draft până la validare manuală
    doc_record  = {
        "id":               doc_id,
        "template_id":      template_def["id"],
        "template_name":    template_def["name"],
        "title":            f"{template_def['name']} — {variables.get('candidat_name') or variables.get('sesizant_name') or ''}",
        "variables":        variables,
        "generated_text":   result["text"],
        "citations":        validation.get("valid_citations", []),
        "invalid_citations":validation.get("invalid_citations", []),
        "confidence_score": validation.get("confidence", 0.0),
        "status":           status,
        "chunks_used":      result.get("chunks_used", []),
        "model":            result.get("model", ""),
        "tokens_used":      result.get("tokens_used", 0),
        "docx_filename":    docx_filename,
        "docx_error":       docx_error,
        "corpus_size":      corpus_count,
        "warning":          warning,
        "created_by":       user.get("email", ""),
        "created_at":       datetime.now(timezone.utc).isoformat(),
    }
    await _db.generated_documents.insert_one(doc_record)

    return {k: v for k, v in doc_record.items() if k != "_id"}


# ═══════════════════════════════════════════════════════════════════════════════
#  DOCUMENTE GENERATE
# ═══════════════════════════════════════════════════════════════════════════════

@legal_router.get("/documents")
async def list_documents(
    template_id: Optional[str] = None,
    status:      Optional[str] = None,
    limit:       int = Query(50, ge=1, le=200),
    user:        dict = Depends(_require_legal_read),
):
    """Listează documentele generate."""
    filter_q: Dict = {}
    if template_id: filter_q["template_id"] = template_id
    if status:      filter_q["status"]      = status

    docs = await _db.generated_documents.find(
        filter_q,
        {"_id": 0, "generated_text": 0, "chunks_used": 0},
    ).sort("created_at", -1).to_list(limit)
    return docs


@legal_router.get("/documents/{doc_id}")
async def get_document(doc_id: str, user: dict = Depends(_require_legal_read)):
    """Returnează documentul complet (inclusiv text generat și citări)."""
    doc = await _db.generated_documents.find_one({"id": doc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document negăsit")
    return doc


@legal_router.put("/documents/{doc_id}/validate")
async def validate_document(
    doc_id: str,
    req:    ValidateDocRequest,
    user:   dict = Depends(_require_legal_generate),
):
    """Marchează documentul ca validat manual."""
    doc = await _db.generated_documents.find_one({"id": doc_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Document negăsit")
    await _db.generated_documents.update_one(
        {"id": doc_id},
        {"$set": {
            "status":       "validated",
            "validated_by": user.get("email", ""),
            "validated_at": datetime.now(timezone.utc).isoformat(),
            "validation_notes": req.notes,
        }},
    )
    return {"status": "ok", "message": "Document validat"}


@legal_router.put("/documents/{doc_id}/text")
async def update_document_text(
    doc_id:   str,
    body:     Dict[str, str],
    user:     dict = Depends(_require_legal_generate),
):
    """Actualizează textul documentului (editare manuală) și regenerează .docx."""
    doc = await _db.generated_documents.find_one({"id": doc_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Document negăsit")

    new_text = body.get("text", "")
    if not new_text.strip():
        raise HTTPException(status_code=400, detail="Textul nu poate fi gol")

    # Regenerează .docx cu textul actualizat
    docx_filename = doc.get("docx_filename")
    docx_error    = None
    if DOCX_AVAILABLE:
        try:
            template_def  = TEMPLATES.get(doc["template_id"], {})
            candidat_name = doc.get("variables", {}).get("candidat_name", "")
            docx_filename = generate_docx(
                title      = doc.get("template_name", "Document"),
                body_text  = new_text,
                template_id= doc.get("template_id", ""),
                variables  = doc.get("variables", {}),
                doc_id     = doc_id,
                emitent    = template_def.get("emitent", "GJC"),
                candidat_name = candidat_name,
            )
        except Exception as e:
            docx_error = str(e)

    await _db.generated_documents.update_one(
        {"id": doc_id},
        {"$set": {
            "generated_text": new_text,
            "status":         "draft",
            "docx_filename":  docx_filename,
            "docx_error":     docx_error,
            "edited_by":      user.get("email", ""),
            "edited_at":      datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"status": "ok", "docx_filename": docx_filename}


@legal_router.get("/documents/{doc_id}/download")
async def download_document(doc_id: str, user: dict = Depends(_require_legal_read)):
    """Descarcă documentul .docx generat."""
    doc = await _db.generated_documents.find_one({"id": doc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document negăsit")

    filename = doc.get("docx_filename")
    if not filename:
        raise HTTPException(status_code=404, detail="Fișierul .docx nu a fost generat")

    filepath = LEGAL_DIR / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Fișierul nu mai există pe server")

    return FileResponse(
        path        = str(filepath),
        filename    = filename,
        media_type  = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@legal_router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, user: dict = Depends(_require_legal_generate)):
    """Șterge un document generat (și fișierul .docx dacă există)."""
    doc = await _db.generated_documents.find_one({"id": doc_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Document negăsit")

    # Șterge fișierul
    fname = doc.get("docx_filename")
    if fname:
        fpath = LEGAL_DIR / fname
        if fpath.exists():
            fpath.unlink()

    await _db.generated_documents.delete_one({"id": doc_id})
    return {"status": "ok"}


# ═══════════════════════════════════════════════════════════════════════════════
#  SCRAPE JOBS (aprobare manuală legislație de pe site-uri oficiale)
# ═══════════════════════════════════════════════════════════════════════════════

@legal_router.post("/scrape-jobs")
async def create_scrape_job(req: ScrapeJobCreate, user: dict = Depends(_require_legal_generate)):
    """Adaugă un URL pentru scraping manual (nu ingerează automat, necesită aprobare)."""
    job = {
        "id":         str(uuid.uuid4()),
        "url":        req.url,
        "act_type":   req.act_type,
        "title":      req.title,
        "notes":      req.notes,
        "status":     "pending",
        "created_by": user.get("email", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await _db.legal_scrape_jobs.insert_one(job)
    return {k: v for k, v in job.items() if k != "_id"}


@legal_router.get("/scrape-jobs")
async def list_scrape_jobs(
    status: str = "pending",
    user:   dict = Depends(_require_legal_read),
):
    jobs = await _db.legal_scrape_jobs.find(
        {"status": status}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return jobs


@legal_router.post("/scrape-jobs/{job_id}/approve")
async def approve_scrape_job(job_id: str, user: dict = Depends(_require_legal_generate)):
    """
    Aprobă și execută job-ul de scraping.
    Descarcă URL-ul, extrage textul, ingerează în corpus.
    """
    job = await _db.legal_scrape_jobs.find_one({"id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job negăsit")
    if job.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Job-ul nu e în stare pending")

    url = job["url"]
    await _db.legal_scrape_jobs.update_one({"id": job_id}, {"$set": {"status": "running"}})

    try:
        async with httpx.AsyncClient(
            timeout=30,
            headers={"User-Agent": "GJC-Legal-AI/1.0 (contact@gjc.ro)"},
            follow_redirects=True,
        ) as client:
            r = await client.get(url)
            r.raise_for_status()

        # Extrage text din HTML
        html = r.text
        text = _extract_text_from_html(html)

        if len(text.strip()) < 200:
            raise ValueError("Text insuficient extras din URL")

        title    = job.get("title") or _extract_title_from_html(html) or url
        act_type = job.get("act_type", "lege")

        # Ingestie
        act_id     = str(uuid.uuid4())
        c_hash_act = hashlib.sha256(text.encode()).hexdigest()

        existing = await _db.legal_acts.find_one({"content_hash": c_hash_act})
        if existing:
            await _db.legal_scrape_jobs.update_one({"id": job_id}, {"$set": {
                "status": "skipped", "message": "Act deja în corpus",
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }})
            return {"status": "skipped", "message": "Act deja în corpus"}

        raw_chunks = chunk_legal_text(text, act_title=title, act_id=act_id)
        inserted   = 0
        for idx, chunk_data in enumerate(raw_chunks):
            chunk_text = chunk_data["text"]
            c_hash     = hashlib.md5(chunk_text.encode()).hexdigest()
            embedding  = await get_embedding(chunk_text)
            chunk_doc  = {
                "id":             str(uuid.uuid4()),
                "act_id":         act_id,
                "act_title":      title,
                "chunk_index":    idx,
                "section_path":   chunk_data["section_path"],
                "article_number": chunk_data.get("article_number"),
                "text":           chunk_text,
                "chunk_type":     chunk_data.get("chunk_type", "paragraph"),
                "token_count":    len(chunk_text.split()),
                "content_hash":   c_hash,
                "embedding":      embedding,
                "created_at":     datetime.now(timezone.utc).isoformat(),
            }
            try:
                await _db.legal_chunks.insert_one(chunk_doc)
                inserted += 1
            except Exception:
                pass

        act_doc = {
            "id":           act_id,
            "title":        title,
            "act_type":     act_type,
            "source_url":   url,
            "content_hash": c_hash_act,
            "total_chunks": inserted,
            "status":       "active",
            "ingested_at":  datetime.now(timezone.utc).isoformat(),
            "created_by":   user.get("email", ""),
        }
        await _db.legal_acts.insert_one(act_doc)

        await _db.legal_scrape_jobs.update_one({"id": job_id}, {"$set": {
            "status": "done",
            "act_id": act_id,
            "chunks": inserted,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }})
        return {"status": "ok", "act_id": act_id, "chunks": inserted, "title": title}

    except Exception as e:
        await _db.legal_scrape_jobs.update_one({"id": job_id}, {"$set": {
            "status": "error", "error": str(e),
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }})
        raise HTTPException(status_code=500, detail=f"Eroare scraping: {e}")


# ═══════════════════════════════════════════════════════════════════════════════
#  STATISTICI
# ═══════════════════════════════════════════════════════════════════════════════

@legal_router.get("/stats")
async def legal_stats(user: dict = Depends(_require_legal_read)):
    """Statistici generale modul legal."""
    acts_count   = await _db.legal_acts.count_documents({"status": "active"})
    chunks_count = await _db.legal_chunks.count_documents({})
    docs_count   = await _db.generated_documents.count_documents({})
    validated    = await _db.generated_documents.count_documents({"status": "validated"})
    pending_jobs = await _db.legal_scrape_jobs.count_documents({"status": "pending"})

    has_embeddings = bool(os.environ.get("VOYAGE_API_KEY") or os.environ.get("COHERE_API_KEY"))

    return {
        "acts":          acts_count,
        "chunks":        chunks_count,
        "documents":     docs_count,
        "validated":     validated,
        "pending_scrape_jobs": pending_jobs,
        "has_embeddings": has_embeddings,
        "embedding_provider": (
            "voyage-law-2" if os.environ.get("VOYAGE_API_KEY")
            else "cohere-multilingual" if os.environ.get("COHERE_API_KEY")
            else "none (BM25 only)"
        ),
        "templates_available": len(TEMPLATES),
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  HELPER: extracție text
# ═══════════════════════════════════════════════════════════════════════════════

def _extract_text(content_bytes: bytes, filename: str) -> str:
    """Extrage text din bytes în funcție de extensia fișierului."""
    ext = Path(filename).suffix.lower()

    if ext == ".txt":
        for enc in ("utf-8", "latin-1", "cp1250"):
            try:
                return content_bytes.decode(enc)
            except Exception:
                pass
        return content_bytes.decode("utf-8", errors="ignore")

    if ext == ".docx":
        try:
            from docx import Document as DocxDoc
            doc = DocxDoc(io.BytesIO(content_bytes))
            paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
            return "\n\n".join(paragraphs)
        except Exception as e:
            logger.warning(f"docx parse error: {e}")
            return ""

    if ext == ".pdf":
        try:
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(content_bytes))
            pages  = []
            for page in reader.pages:
                text = page.extract_text()
                if text:
                    pages.append(text)
            return "\n\n".join(pages)
        except Exception as e:
            logger.warning(f"pdf parse error: {e}")
            return ""

    # Fallback: încearcă ca text
    return content_bytes.decode("utf-8", errors="ignore")


def _extract_text_from_html(html: str) -> str:
    """Extrage text simplu din HTML (fără BeautifulSoup)."""
    import re
    # Elimină script/style
    html = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html, flags=re.DOTALL | re.IGNORECASE)
    # Înlocuiește taguri block cu newline
    html = re.sub(r"<(br|p|div|h[1-6]|li|tr)[^>]*>", "\n", html, flags=re.IGNORECASE)
    # Elimină toate tagurile rămase
    html = re.sub(r"<[^>]+>", " ", html)
    # Decodează entități HTML simple
    html = html.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    # Normalizare spații
    html = re.sub(r" {2,}", " ", html)
    html = re.sub(r"\n{3,}", "\n\n", html)
    return html.strip()


def _extract_title_from_html(html: str) -> str:
    """Extrage titlul din HTML."""
    import re
    m = re.search(r"<title[^>]*>([^<]+)</title>", html, re.IGNORECASE)
    return m.group(1).strip() if m else ""
