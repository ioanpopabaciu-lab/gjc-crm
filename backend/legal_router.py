"""
GJC Legal AI Assistant — FastAPI Router
Toate endpoint-urile pentru modulul Legal AI (corpus, generare, documente).
"""

import asyncio
import os
import io
import hashlib
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Dict, Any

import anthropic as anthropic_sdk

import jwt
import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File, Form, Query
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

def _v(key, label, required=True, source="manual", typ="text"):
    return {"key": key, "label": label, "required": required, "source": source, "type": typ}

TEMPLATES: Dict[str, Dict] = {

    # ════════════════════════════════════════════════════════════════
    # CATEGORIE: Raporturi de Muncă
    # ════════════════════════════════════════════════════════════════

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
        "preview_text": """DEMISIE

Subsemnatul/a {candidat_name}, cetățean {candidat_nationalitate},
posesor/posesoare al/a actului de identitate/pașaportului nr. {candidat_cnp},
cu domiciliul/reședința în {candidat_adresa},
angajat/ă la {angajator_name} (CUI: {angajator_cui}), cu sediul în {angajator_adresa},
în funcția de {functia}, începând cu data de {data_angajarii},

în temeiul art. 81 alin. (8) din Legea nr. 53/2003 — Codul Muncii, republicat,
care prevede dreptul salariatului de a demisiona fără preaviz atunci când angajatorul
nu își îndeplinește obligațiile asumate prin contractul individual de muncă,

NOTIFIC prin prezenta demisia mea imediată din funcția deținută,

MOTIVAT de faptul că {angajator_name} nu mi-a achitat drepturile salariale
aferente lunii/lunilor {luna_neplatita}, reprezentând suma estimată de {suma_neplatita} RON,
deși ultima plată a fost efectuată la data de {data_ultimei_plati}.

Prezenta demisie produce efecte începând cu data de {data_demisiei}.

{motiv_suplimentar}

Data: {data_demisiei}
Semnătura: ___________________________
{candidat_name}""",
    },
    "DEMISIE_STANDARD": {
        "id":          "DEMISIE_STANDARD",
        "name":        "Demisie standard cu preaviz",
        "category":    "Raporturi de muncă",
        "description": "Demisie cu respectarea termenului legal de preaviz (20 zile lucrătoare pentru funcții de execuție, 45 pentru funcții de conducere). Fără motiv obligatoriu.",
        "emitent":     "candidat",
        "variables": [
            _v("candidat_name",       "Numele complet candidat",         True,  "candidate"),
            _v("candidat_cnp",        "CNP / serie pașaport",            False, "candidate"),
            _v("candidat_nationalitate","Naționalitate",                  False, "candidate"),
            _v("angajator_name",      "Denumire angajator",              True,  "company"),
            _v("angajator_cui",       "CUI angajator",                   False, "company"),
            _v("functia",             "Funcția / postul",                False, "manual"),
            _v("durata_preaviz",      "Durata preaviz (ex: 20 zile lucrătoare)", True, "manual"),
            _v("data_notificarii",    "Data notificării (dd.mm.yyyy)",   True,  "manual"),
            _v("data_incetarii",      "Data ultimei zile de muncă",      False, "manual"),
            _v("motiv",               "Motiv (opțional)",                False, "manual", "textarea"),
        ],
        "rag_queries": [
            "art 81 alin 1 codul muncii demisie preaviz 20 zile",
            "art 75 codul muncii termenul de preaviz",
            "art 55 litera b codul muncii incetare CIM salariat",
        ],
        "min_citations": 2,
        "bulk_mode":     False,
        "preview_text": """DEMISIE

Subsemnatul/a {candidat_name}, cetățean {candidat_nationalitate},
posesor/posesoare al/a actului nr. {candidat_cnp},
angajat/ă la {angajator_name} (CUI: {angajator_cui}),
în funcția de {functia},

în temeiul art. 81 alin. (1) din Legea nr. 53/2003 — Codul Muncii,
prin prezenta formulez DEMISIA din funcția deținută,
cu respectarea termenului de preaviz de {durata_preaviz}.

Prezenta demisie se notifică la data de {data_notificarii},
ultima zi de muncă fiind {data_incetarii}.

{motiv}

Data: {data_notificarii}
Semnătura: ___________________________
{candidat_name}""",
    },
    "CONTESTATIE_CONCEDIERE": {
        "id":          "CONTESTATIE_CONCEDIERE",
        "name":        "Contestație decizie de concediere",
        "category":    "Raporturi de muncă",
        "description": "Contestație la Tribunalul Muncii împotriva deciziei de concediere. Termen: 30 zile calendaristice de la comunicare.",
        "emitent":     "candidat",
        "variables": [
            _v("contestatar_name",    "Numele contestatarului",          True,  "candidate"),
            _v("contestatar_cnp",     "CNP contestatar",                 False, "candidate"),
            _v("contestatar_adresa",  "Domiciliu/reședință contestatar", False, "manual"),
            _v("angajator_name",      "Denumire angajator intimat",      True,  "company"),
            _v("angajator_cui",       "CUI angajator",                   False, "company"),
            _v("angajator_adresa",    "Sediu angajator",                 False, "company"),
            _v("nr_decizie",          "Nr. deciziei de concediere",      True,  "manual"),
            _v("data_decizie",        "Data deciziei de concediere",     True,  "manual"),
            _v("data_comunicare",     "Data comunicării deciziei",       True,  "manual"),
            _v("motiv_concediere",    "Motivul invocat de angajator",    True,  "manual"),
            _v("motivare_contestatie","Motivele contestației",           True,  "manual", "textarea"),
            _v("probe_anexate",       "Probe/înscrisuri anexate",        False, "manual", "textarea"),
            _v("tribunal_judet",      "Tribunalul sesizat (județ)",      True,  "manual"),
            _v("data_contestatiei",   "Data contestației (dd.mm.yyyy)",  True,  "manual"),
        ],
        "rag_queries": [
            "art 268 codul muncii contestatie concediere tribunal 30 zile",
            "art 252 codul muncii decizia de concediere conditii forma",
            "art 248 art 249 codul muncii concediere disciplinara",
            "art 65 codul muncii concediere motive neimputabile salariatul",
        ],
        "min_citations": 3,
        "bulk_mode":     False,
        "preview_text": """Către,
TRIBUNALUL {tribunal_judet}
Secția Conflicte de Muncă și Asigurări Sociale

CONTESTAȚIE
împotriva Deciziei de concediere nr. {nr_decizie} din {data_decizie}

Contestatar: {contestatar_name}, domiciliat în {contestatar_adresa}, CNP {contestatar_cnp}
Intimat:     {angajator_name}, CUI {angajator_cui}, cu sediul în {angajator_adresa}

Subsemnatul/a {contestatar_name}, în temeiul art. 268 din Legea nr. 53/2003 — Codul Muncii,
formulez prezenta CONTESTAȚIE împotriva Deciziei de concediere nr. {nr_decizie}/{data_decizie},
comunicată la data de {data_comunicare}.

MOTIVUL INVOCAT DE ANGAJATOR: {motiv_concediere}

MOTIVELE CONTESTAȚIEI:
{motivare_contestatie}

PROBE ANEXATE: {probe_anexate}

Solicit admiterea contestației, anularea deciziei de concediere,
reintegrarea în funcție și plata drepturilor salariale pe perioada nelegalei concedieri.

Data: {data_contestatiei}                    Semnătura: ___________________
{contestatar_name}""",
    },
    "NOTIFICARE_RECUPERARE_SALARII": {
        "id":          "NOTIFICARE_RECUPERARE_SALARII",
        "name":        "Notificare somare recuperare drepturi salariale",
        "category":    "Raporturi de muncă",
        "description": "Notificare/somare trimisă angajatorului înainte de acțiunea în instanță, prin care se solicită plata salariilor restante. Pasul premergător acțiunii la Tribunalul Muncii.",
        "emitent":     "GJC",
        "variables": [
            _v("salariat_name",       "Numele salariatului",             True,  "candidate"),
            _v("angajator_name",      "Denumire angajator",              True,  "company"),
            _v("angajator_cui",       "CUI angajator",                   False, "company"),
            _v("angajator_adresa",    "Adresa angajatorului",            False, "company"),
            _v("angajator_reprezentant","Reprezentant legal",            False, "manual"),
            _v("suma_solicitata",     "Suma solicitată (RON)",           True,  "manual"),
            _v("perioada_neplatita",  "Perioada neplatită",              True,  "manual"),
            _v("termen_plata",        "Termen acordat pentru plată (ex: 5 zile)", True, "manual"),
            _v("data_notificarii",    "Data notificării",                True,  "manual"),
        ],
        "rag_queries": [
            "art 171 codul muncii plata salariului data scadenta",
            "art 166 codul muncii salariul confidentialitate plata",
            "art 253 codul muncii raspunderea patrimoniala angajator daune",
            "art 1516 cod civil obligatia de plata somatia",
        ],
        "min_citations": 2,
        "bulk_mode":     True,
        "bulk_key":      "salariat_name",
        "preview_text": """NOTIFICARE / SOMARE

Către: {angajator_name} (CUI: {angajator_cui})
Adresa: {angajator_adresa}
În atenția: {angajator_reprezentant}

Referitor la: Recuperare drepturi salariale — {salariat_name}

Prin prezenta, în calitate de reprezentant al d-lui/d-nei {salariat_name},
angajat/ă în cadrul societății dumneavoastră,
vă notificăm că drepturile salariale aferente perioadei {perioada_neplatita},
în valoare totală de {suma_solicitata} RON, nu au fost achitate până la data prezentei.

Această situație contravine dispozițiilor art. 171 din Legea nr. 53/2003 — Codul Muncii.

Vă somăm să procedați la plata integrală a sumei de {suma_solicitata} RON
în termen de {termen_plata} de la primirea prezentei notificări.

În lipsa achitării, vom proceda la sesizarea Inspecției Muncii și introducerea
unei acțiuni în pretenții la Tribunalul Muncii, cu solicitarea de daune-interese.

Data: {data_notificarii}
Global Jobs Consulting SRL""",
    },

    # ════════════════════════════════════════════════════════════════
    # CATEGORIE: Sesizări Instituții de Control
    # ════════════════════════════════════════════════════════════════

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
        "preview_text": """Către,
INSPECTORATUL TERITORIAL DE MUNCĂ {itm_judet}

SESIZARE / PLÂNGERE

Sesizant: {sesizant_name}, în calitate de {sesizant_calitate}
Angajator reclamat: {angajator_name}, CUI {angajator_cui}, sediu: {angajator_adresa}

Stimate doamne/Stimați domni,

Prin prezenta, subsemnatul/a {sesizant_name}, formulez prezenta SESIZARE
împotriva {angajator_name}, pentru săvârșirea următoarelor încălcări ale legislației muncii:

DESCRIEREA FAPTELOR:
{fapta_descriere}

PERIOADA: {perioada_faptei}
Nr. salariați afectați: {nr_salariati_afectati}

Faptele sus-menționate constituie contravenții/încălcări ale:
— art. 171 din Legea nr. 53/2003 (Codul Muncii) privind obligația de plată a salariului
— Legea nr. 108/1999 privind Inspecția Muncii

PROBE ANEXATE: {probe_anexate}

Solicităm efectuarea unui control și aplicarea sancțiunilor legale.

Data sesizării: {data_sesizarii}          Nr. ref. anterior: {nr_inregistrare_ref}
Global Jobs Consulting SRL
(în reprezentarea salariaților afectați)""",
    },
    "SESIZARE_ITM_CONDITII": {
        "id":          "SESIZARE_ITM_CONDITII",
        "name":        "Sesizare ITM — condiții de muncă necorespunzătoare",
        "category":    "Sesizări instituții control",
        "description": "Sesizare la ITM pentru condiții de muncă improprii: cazare, echipament protecție, ore suplimentare neplătite, discriminare.",
        "emitent":     "GJC",
        "variables": [
            _v("sesizant_name",       "Sesizant",                        True,  "manual"),
            _v("angajator_name",      "Angajatorul reclamat",            True,  "company"),
            _v("angajator_cui",       "CUI",                             False, "company"),
            _v("angajator_adresa",    "Adresa punct de lucru",           False, "company"),
            _v("conditii_descrise",   "Descrierea condițiilor necorespunzătoare", True, "manual", "textarea"),
            _v("nr_persoane_afectate","Nr. persoane afectate",           False, "manual"),
            _v("probe_foto",          "Probe fotografice/documente",     False, "manual", "textarea"),
            _v("itm_judet",           "Județ ITM",                       True,  "manual"),
            _v("data_sesizarii",      "Data sesizării",                  True,  "manual"),
        ],
        "rag_queries": [
            "legea 319 2006 securitate sanatate munca obligatii angajator",
            "art 175 codul muncii securitate munca echipament protectie",
            "legea 108 1999 inspectia muncii control conditii munca",
        ],
        "min_citations": 2,
        "bulk_mode":     False,
        "preview_text": """Către,
INSPECTORATUL TERITORIAL DE MUNCĂ {itm_judet}

SESIZARE — CONDIȚII DE MUNCĂ NECORESPUNZĂTOARE

Sesizant: {sesizant_name}
Angajator reclamat: {angajator_name} (CUI: {angajator_cui})
Punct de lucru: {angajator_adresa}

Prin prezenta sesizare aducem la cunoștința ITM {itm_judet} că angajatorul
{angajator_name} nu respectă normele legale privind securitatea și sănătatea
în muncă, în condițiile prevăzute de Legea nr. 319/2006.

SITUAȚIA CONSTATATĂ:
{conditii_descrise}

Nr. persoane afectate: {nr_persoane_afectate}
Probe: {probe_foto}

Solicităm efectuarea unui control inopinant și aplicarea măsurilor legale.

Data: {data_sesizarii}
Global Jobs Consulting SRL""",
    },
    "SESIZARE_ANOFM": {
        "id":          "SESIZARE_ANOFM",
        "name":        "Sesizare ANOFM / AJOFM",
        "category":    "Sesizări instituții control",
        "description": "Sesizare la Agenția Județeană pentru Ocuparea Forței de Muncă privind nereguli în plasarea forței de muncă, avize ilegale sau condiții contractuale abuzive.",
        "emitent":     "GJC",
        "variables": [
            _v("sesizant_name",    "Sesizant",                           True,  "manual"),
            _v("angajator_name",   "Angajatorul vizat",                  True,  "company"),
            _v("angajator_cui",    "CUI",                                False, "company"),
            _v("fapta_descriere",  "Descrierea situației sesizate",      True,  "manual", "textarea"),
            _v("ajofm_judet",      "Județ AJOFM",                        True,  "manual"),
            _v("data_sesizarii",   "Data sesizării",                     True,  "manual"),
        ],
        "rag_queries": [
            "legea 76 2002 sistemul asigurarilor somaj forta munca",
            "oug 56 2007 incadrarea strainilor munca aviz angajare",
            "legea 156 2000 protectia cetatenilor romani plasare munca",
        ],
        "min_citations": 2,
        "bulk_mode":     False,
        "preview_text": """Către,
AGENȚIA JUDEȚEANĂ PENTRU OCUPAREA FORȚEI DE MUNCĂ {ajofm_judet}

SESIZARE

Sesizant: {sesizant_name}
Angajator vizat: {angajator_name} (CUI: {angajator_cui})

Vă sesizăm cu privire la următoarea situație:

{fapta_descriere}

Solicitam verificarea legalității și luarea măsurilor ce se impun.

Data: {data_sesizarii}
Global Jobs Consulting SRL""",
    },
    "SESIZARE_ANAF": {
        "id":          "SESIZARE_ANAF",
        "name":        "Sesizare ANAF — neachitare obligații fiscale",
        "category":    "Sesizări instituții control",
        "description": "Sesizare la Agenția Națională de Administrare Fiscală privind neplata contribuțiilor sociale, CAS, CASS pentru salariați sau alte obligații fiscale.",
        "emitent":     "GJC",
        "variables": [
            _v("sesizant_name",    "Sesizant",                           True,  "manual"),
            _v("angajator_name",   "Angajatorul reclamat",               True,  "company"),
            _v("angajator_cui",    "CUI",                                False, "company"),
            _v("fapta_descriere",  "Descrierea neregulilor fiscale",     True,  "manual", "textarea"),
            _v("perioada",         "Perioada vizată",                    True,  "manual"),
            _v("data_sesizarii",   "Data sesizării",                     True,  "manual"),
        ],
        "rag_queries": [
            "legea 227 2015 codul fiscal obligatii angajator CAS CASS",
            "art 6 codul fiscal contribuabil obligatii plata taxe",
            "art 219 codul fiscal contraventii sanctiuni neachitare",
        ],
        "min_citations": 2,
        "bulk_mode":     False,
        "preview_text": """Către,
AGENȚIA NAȚIONALĂ DE ADMINISTRARE FISCALĂ
(prin Administrația Județeană a Finanțelor Publice)

SESIZARE

Sesizant: {sesizant_name}
Angajator reclamat: {angajator_name} (CUI: {angajator_cui})

Vă sesizăm că angajatorul {angajator_name} nu și-a îndeplinit obligațiile
fiscale privind declararea și virarea contribuțiilor sociale (CAS/CASS/impozit pe venit)
pentru salariații săi, în perioada {perioada}.

SITUAȚIA CONSTATATĂ:
{fapta_descriere}

Solicităm verificarea și aplicarea măsurilor fiscale legale.

Data: {data_sesizarii}
Global Jobs Consulting SRL""",
    },

    # ════════════════════════════════════════════════════════════════
    # CATEGORIE: Proceduri IGI / Imigrare
    # ════════════════════════════════════════════════════════════════

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
        "preview_text": """PROCURĂ SPECIALĂ

Subsemnatul/a {mandant_name}, cetățean/cetățeancă {mandant_nationalitate},
născut/ă la data de {mandant_nascut},
posesor/posesoare al/a pașaportului nr. {mandant_pasaport},

ÎMPUTERNICESC prin prezenta pe d-l/d-na {mandatar_name}, CNP {mandatar_cnp},
reprezentant al Global Jobs Consulting SRL,

să mă reprezinte în fața Inspectoratului General pentru Imigrări
și a oricăror alte instituții competente, pentru:

{scopul_procurii}

Mandatarul este autorizat să depună, ridice și semneze orice acte și documente
necesare îndeplinirii mandatului, pe o perioadă de {valabilitate}.

Prezenta procură a fost redactată în {nr_exemplare} exemplare originale.

Data: {data_procurii}

Mandant: {mandant_name}                    Mandatar: {mandatar_name}
Semnătura: ___________________             Semnătura: ___________________""",
    },
    "CERERE_PRELUNGIRE_SEDERE": {
        "id":          "CERERE_PRELUNGIRE_SEDERE",
        "name":        "Cerere prelungire drept de ședere în scop de muncă",
        "category":    "Proceduri IGI / Imigrare",
        "description": "Cerere adresată IGI pentru prelungirea dreptului de ședere temporară în scop de muncă, conform OUG 194/2002 și OUG 56/2007.",
        "emitent":     "candidat",
        "variables": [
            _v("candidat_name",       "Numele complet",                  True,  "candidate"),
            _v("candidat_nationalitate","Naționalitate",                  True,  "candidate"),
            _v("candidat_pasaport",   "Nr. pașaport",                    True,  "candidate"),
            _v("candidat_cnp",        "CNP (dacă există)",               False, "candidate"),
            _v("data_nasterii",       "Data nașterii",                   False, "candidate"),
            _v("permis_actual_nr",    "Nr. permis de ședere actual",     True,  "manual"),
            _v("permis_expira",       "Data expirării permisului actual", True,  "manual"),
            _v("angajator_name",      "Angajatorul actual",              True,  "company"),
            _v("angajator_cui",       "CUI angajator",                   False, "company"),
            _v("aviz_munca_nr",       "Nr. aviz de muncă",               False, "manual"),
            _v("functia",             "Funcția / COR",                   False, "manual"),
            _v("data_cererii",        "Data cererii",                    True,  "manual"),
        ],
        "rag_queries": [
            "oug 194 2002 prelungire drept sedere temporara scop munca",
            "oug 56 2007 aviz munca strain angajare",
            "art 54 oug 194 2002 documente prelungire sedere",
        ],
        "min_citations": 2,
        "bulk_mode":     False,
        "preview_text": """Către,
INSPECTORATUL GENERAL PENTRU IMIGRĂRI
(prin Serviciul pentru Imigrări al județului _____)

CERERE DE PRELUNGIRE A DREPTULUI DE ȘEDERE TEMPORARĂ
în scop de muncă

Subsemnatul/a {candidat_name}, cetățean/cetățeancă {candidat_nationalitate},
născut/ă la {data_nasterii}, posesor/posesoare al/a pașaportului nr. {candidat_pasaport}
(CNP: {candidat_cnp}), titular/ă al/a permisului de ședere nr. {permis_actual_nr},
valabil până la {permis_expira},

angajat/ă la {angajator_name} (CUI: {angajator_cui}),
în funcția de {functia}, în baza avizului de muncă nr. {aviz_munca_nr},

solicit PRELUNGIREA DREPTULUI DE ȘEDERE TEMPORARĂ în scop de muncă
pe teritoriul României, în conformitate cu OUG nr. 194/2002 și OUG nr. 56/2007.

Anexez documentele prevăzute de lege (pașaport, contract muncă, aviz, dovadă cazare, asigurare medicală).

Data: {data_cererii}
Semnătura: ___________________________
{candidat_name}""",
    },
    "NOTIFICARE_SCHIMBARE_ANGAJATOR": {
        "id":          "NOTIFICARE_SCHIMBARE_ANGAJATOR",
        "name":        "Notificare IGI — schimbare angajator",
        "category":    "Proceduri IGI / Imigrare",
        "description": "Notificare obligatorie la IGI în cazul schimbării angajatorului de către un cetățean non-UE cu permis de muncă activ.",
        "emitent":     "GJC",
        "variables": [
            _v("candidat_name",       "Numele lucrătorului",             True,  "candidate"),
            _v("candidat_pasaport",   "Nr. pașaport",                    True,  "candidate"),
            _v("angajator_vechi",     "Angajatorul anterior",            True,  "manual"),
            _v("angajator_nou",       "Noul angajator",                  True,  "company"),
            _v("angajator_nou_cui",   "CUI noul angajator",              False, "company"),
            _v("data_schimbarii",     "Data schimbării angajatorului",   True,  "manual"),
            _v("aviz_munca_nr",       "Nr. aviz de muncă",               False, "manual"),
            _v("data_notificarii",    "Data notificării",                True,  "manual"),
        ],
        "rag_queries": [
            "oug 56 2007 schimbare angajator notificare igi strain",
            "art 44 oug 194 2002 schimbare angajator permis sedere",
        ],
        "min_citations": 1,
        "bulk_mode":     False,
        "preview_text": """Către,
INSPECTORATUL GENERAL PENTRU IMIGRĂRI

NOTIFICARE — SCHIMBARE ANGAJATOR

Referitor la: {candidat_name}, pașaport nr. {candidat_pasaport}

Prin prezenta notificăm că lucrătorul {candidat_name},
titular al avizului de muncă nr. {aviz_munca_nr},
a încetat raportul de muncă cu {angajator_vechi}
și a încheiat contract de muncă cu {angajator_nou} (CUI: {angajator_nou_cui}),
începând cu data de {data_schimbarii}.

Solicităm luarea de act a acestei modificări.

Data: {data_notificarii}
Global Jobs Consulting SRL (în reprezentarea lucrătorului)""",
    },
    "CONTESTATIE_DECIZIE_IGI": {
        "id":          "CONTESTATIE_DECIZIE_IGI",
        "name":        "Contestație decizie IGI (respingere/revocare)",
        "category":    "Proceduri IGI / Imigrare",
        "description": "Contestație administrativă împotriva unei decizii IGI de respingere/revocare a dreptului de ședere sau a avizului de muncă.",
        "emitent":     "GJC",
        "variables": [
            _v("candidat_name",       "Numele candidatului",             True,  "candidate"),
            _v("candidat_pasaport",   "Nr. pașaport",                    True,  "candidate"),
            _v("candidat_nationalitate","Naționalitate",                  False, "candidate"),
            _v("nr_decizie_igi",      "Nr. deciziei IGI contestate",     True,  "manual"),
            _v("data_decizie",        "Data deciziei IGI",               True,  "manual"),
            _v("motivul_respingerii", "Motivul invocat de IGI",          True,  "manual"),
            _v("motivare_contestatie","Motivarea contestației noastre",  True,  "manual", "textarea"),
            _v("probe_anexate",       "Documente anexate",               False, "manual", "textarea"),
            _v("data_contestatiei",   "Data contestației",               True,  "manual"),
        ],
        "rag_queries": [
            "art 86 oug 194 2002 contestatie decizie imigrari termen",
            "legea 554 2004 contencios administrativ contestatie",
            "oug 56 2007 contestatie respingere aviz munca",
        ],
        "min_citations": 2,
        "bulk_mode":     False,
        "preview_text": """Către,
INSPECTORATUL GENERAL PENTRU IMIGRĂRI
(Directorul General)

CONTESTAȚIE
împotriva Deciziei nr. {nr_decizie_igi} din {data_decizie}

Contestatar: {candidat_name}, cetățean {candidat_nationalitate}, pașaport {candidat_pasaport}
Reprezentat prin: Global Jobs Consulting SRL

Prin prezenta contestăm Decizia IGI nr. {nr_decizie_igi}/{data_decizie},
prin care s-a dispus {motivul_respingerii},
considerând-o netemeinică și nelegală pentru următoarele motive:

{motivare_contestatie}

DOCUMENTE ANEXATE: {probe_anexate}

Solicităm revocarea deciziei contestate și admiterea cererii inițiale.

Data: {data_contestatiei}
Global Jobs Consulting SRL""",
    },

    # ════════════════════════════════════════════════════════════════
    # CATEGORIE: Instanțe Judecătorești
    # ════════════════════════════════════════════════════════════════

    "ACTIUNE_PRETENTII_SALARIALE": {
        "id":          "ACTIUNE_PRETENTII_SALARIALE",
        "name":        "Acțiune în pretenții salariale — Tribunal Muncii",
        "category":    "Instanțe judecătorești",
        "description": "Cerere de chemare în judecată la Tribunalul Muncii pentru recuperarea drepturilor salariale neachitate. Scutită de taxă de timbru.",
        "emitent":     "candidat",
        "variables": [
            _v("reclamant_name",      "Reclamant (salariat)",            True,  "candidate"),
            _v("reclamant_cnp",       "CNP reclamant",                   False, "candidate"),
            _v("reclamant_adresa",    "Domiciliu reclamant",             False, "manual"),
            _v("parat_name",          "Pârât (angajator)",               True,  "company"),
            _v("parat_cui",           "CUI pârât",                       False, "company"),
            _v("parat_adresa",        "Sediu pârât",                     False, "company"),
            _v("suma_solicitata",     "Suma solicitată (RON)",           True,  "manual"),
            _v("perioada_neplatita",  "Perioada salariilor neachitate",  True,  "manual"),
            _v("data_angajarii",      "Data angajării",                  False, "manual"),
            _v("functia",             "Funcția",                         False, "manual"),
            _v("probe_descrise",      "Descrierea probelor",             False, "manual", "textarea"),
            _v("tribunal_judet",      "Tribunalul sesizat",              True,  "manual"),
            _v("data_cererii",        "Data cererii",                    True,  "manual"),
        ],
        "rag_queries": [
            "art 171 codul muncii plata salariului data scadenta",
            "art 266 codul muncii competenta tribunalul muncii drepturi salariale",
            "art 272 codul muncii sarcina probei in litigii munca",
            "art 253 codul muncii raspundere patrimoniala angajator",
        ],
        "min_citations": 3,
        "bulk_mode":     True,
        "bulk_key":      "reclamant_name",
        "preview_text": """Către,
TRIBUNALUL {tribunal_judet}
Secția I Civilă — Conflicte de Muncă

CERERE DE CHEMARE ÎN JUDECATĂ
(Acțiune în pretenții — drepturi salariale)

Reclamant: {reclamant_name}, domiciliat în {reclamant_adresa}, CNP {reclamant_cnp}
Pârât:     {parat_name}, CUI {parat_cui}, sediu: {parat_adresa}

Obiect: Obligarea pârâtului la plata sumei de {suma_solicitata} RON
        reprezentând drepturi salariale neachitate aferente perioadei {perioada_neplatita}

Valoare litigiu: {suma_solicitata} RON (scutit de taxă de timbru — art. 270 CM)

ÎN FAPT:
Reclamantul este angajat al pârâtului din data de {data_angajarii}, în funcția de {functia}.
Pârâtul nu și-a îndeplinit obligația de plată a salariului pentru perioada {perioada_neplatita},
contrar dispozițiilor art. 171 din Legea nr. 53/2003 — Codul Muncii.

ÎN DREPT: art. 171, art. 253, art. 266 din Legea nr. 53/2003 (Codul Muncii)

PROBE: {probe_descrise}

Solicităm: obligarea pârâtului la plata sumei de {suma_solicitata} RON + dobânda legală.

Data: {data_cererii}                        Reclamant: {reclamant_name}
                                             Semnătura: ___________________""",
    },
    "INTAMPINARE": {
        "id":          "INTAMPINARE",
        "name":        "Întâmpinare la acțiune civilă / muncă",
        "category":    "Instanțe judecătorești",
        "description": "Răspuns formal la o acțiune judecătorească, depus în termen legal. Folosit când GJC sau un candidat este chemat în judecată.",
        "emitent":     "GJC",
        "variables": [
            _v("intimat_name",        "Intimat (cel care depune întâmpinarea)", True, "manual"),
            _v("intimat_calitate",    "Calitate intimat (pârât/intervenient)", True, "manual"),
            _v("reclamant_name",      "Reclamant (cel care a introdus acțiunea)", True, "manual"),
            _v("dosar_nr",            "Nr. dosar instanță",              True,  "manual"),
            _v("tribunal_judet",      "Instanța",                        True,  "manual"),
            _v("obiect_actiune",      "Obiectul acțiunii reclamantului", True,  "manual"),
            _v("motivare_intampinare","Motivele întâmpinării (apărările)", True, "manual", "textarea"),
            _v("probe_propuse",       "Probe propuse în apărare",        False, "manual", "textarea"),
            _v("data_depunerii",      "Data depunerii",                  True,  "manual"),
        ],
        "rag_queries": [
            "art 205 cod procedura civila intampinare termen depunere",
            "art 254 cod procedura civila probe admisibilitate",
            "art 268 codul muncii termen contestatie",
        ],
        "min_citations": 2,
        "bulk_mode":     False,
        "preview_text": """Către,
{tribunal_judet}

Dosar nr. {dosar_nr}

ÎNTÂMPINARE

Intimat:    {intimat_name}, în calitate de {intimat_calitate}
Reclamant:  {reclamant_name}

Obiect acțiune: {obiect_actiune}

Subsemnatul/a {intimat_name}, prin prezenta ÎNTÂMPINARE, formulez
următoarele apărări față de acțiunea reclamantului:

{motivare_intampinare}

PROBE PROPUSE ÎN APĂRARE:
{probe_propuse}

Solicităm respingerea acțiunii ca neîntemeiată/nefondata.

Data: {data_depunerii}
{intimat_name}
Semnătura: ___________________________""",
    },
    "PLANGERE_PENALA": {
        "id":          "PLANGERE_PENALA",
        "name":        "Plângere penală la Poliție / Parchet",
        "category":    "Instanțe judecătorești",
        "description": "Plângere penală pentru infracțiuni săvârșite împotriva lucrătorilor: exploatare, trafic de persoane, lipsire de libertate, abuz de serviciu.",
        "emitent":     "GJC",
        "variables": [
            _v("petent_name",         "Petent (persoana lezată sau GJC)", True, "manual"),
            _v("petent_calitate",     "Calitate petent",                 True,  "manual"),
            _v("inculpat_name",       "Inculpat / făptuitor",            True,  "manual"),
            _v("inculpat_calitate",   "Calitate inculpat",               False, "manual"),
            _v("fapta_descrisa",      "Descrierea faptei penale",        True,  "manual", "textarea"),
            _v("data_savarsirii",     "Data/perioada săvârșirii",        True,  "manual"),
            _v("locul_savarsirii",    "Locul săvârșirii",                False, "manual"),
            _v("prejudiciu",          "Prejudiciul cauzat",              False, "manual"),
            _v("probe_anexate",       "Probe/martori",                   False, "manual", "textarea"),
            _v("unitate_sesizata",    "Unitatea de Poliție / Parchet sesizat", True, "manual"),
            _v("data_plangerii",      "Data plângerii",                  True,  "manual"),
        ],
        "rag_queries": [
            "art 210 cod penal trafic persoane exploatare munca",
            "art 211 cod penal exploatare cersetorie sau munca",
            "art 297 cod penal abuz de serviciu",
            "art 189 cod penal lipsire de libertate",
        ],
        "min_citations": 2,
        "bulk_mode":     False,
        "preview_text": """Către,
{unitate_sesizata}

PLÂNGERE PENALĂ

Petent:     {petent_name}, în calitate de {petent_calitate}
Inculpat:   {inculpat_name} ({inculpat_calitate})

Subsemnatul/a {petent_name}, formulez prezenta PLÂNGERE PENALĂ împotriva
lui/ei {inculpat_name}, pentru săvârșirea infracțiunii de ______,
prevăzută de Codul Penal.

SITUAȚIA DE FAPT:
{fapta_descrisa}

Data/Perioada săvârșirii: {data_savarsirii}
Locul săvârșirii: {locul_savarsirii}
Prejudiciul cauzat: {prejudiciu}

PROBE ȘI MARTORI: {probe_anexate}

Solicităm efectuarea cercetărilor penale și tragerea la răspundere penală
a inculpatului conform legii.

Data: {data_plangerii}                      Semnătura: ___________________
{petent_name}""",
    },
    "SESIZARE_DIICOT": {
        "id":          "SESIZARE_DIICOT",
        "name":        "Sesizare DIICOT — trafic de persoane / exploatare forță de muncă",
        "category":    "Instanțe judecătorești",
        "description": "Sesizare la Direcția de Investigare a Infracțiunilor de Criminalitate Organizată și Terorism pentru infracțiuni grave: trafic de persoane, exploatarea forței de muncă, rețele de recrutare ilegală.",
        "emitent":     "GJC",
        "variables": [
            _v("sesizant_name",       "Sesizant",                        True,  "manual"),
            _v("sesizant_calitate",   "Calitate sesizant",               True,  "manual"),
            _v("inculpat_name",       "Persoana/organizația sesizată",   True,  "manual"),
            _v("fapta_descrisa",      "Descrierea detaliată a faptelor", True,  "manual", "textarea"),
            _v("victimele",           "Numărul și datele victimelor",    True,  "manual"),
            _v("probe_anexate",       "Probe disponibile",               False, "manual", "textarea"),
            _v("data_sesizarii",      "Data sesizării",                  True,  "manual"),
        ],
        "rag_queries": [
            "art 210 cod penal trafic de persoane definitie",
            "legea 678 2001 trafic de persoane prevenire combatere",
            "art 182 cod penal exploatarea cersetoriei munca fortata",
        ],
        "min_citations": 3,
        "bulk_mode":     False,
        "preview_text": """Către,
DIRECȚIA DE INVESTIGARE A INFRACȚIUNILOR DE CRIMINALITATE ORGANIZATĂ
ȘI TERORISM — Serviciul Teritorial ______

SESIZARE

Sesizant:  {sesizant_name}, în calitate de {sesizant_calitate}
Persoana sesizată: {inculpat_name}

Prin prezenta, vă sesizăm cu privire la săvârșirea unor infracțiuni
ce intră în competența DIICOT, respectiv trafic de persoane și/sau
exploatarea forței de muncă, fapte prevăzute de art. 210-211 Cod Penal
și Legea nr. 678/2001.

SITUAȚIA VICTIMELOR: {victimele}

DESCRIEREA FAPTELOR:
{fapta_descrisa}

PROBE DISPONIBILE: {probe_anexate}

Data: {data_sesizarii}
{sesizant_name}
Semnătura: ___________________________""",
    },

    # ════════════════════════════════════════════════════════════════
    # CATEGORIE: Contestații și Memorii
    # ════════════════════════════════════════════════════════════════

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
        "preview_text": """Către,
{autoritate_name}

MEMORIU / CONTESTAȚIE

Contestatar: {contestatar_name}
Act contestat: {act_contestat}

Subsemnatul/a/societatea {contestatar_name}, formulez prezenta CONTESTAȚIE
împotriva actului administrativ {act_contestat}, pe care îl considerăm
nelegal/netemeinic pentru următoarele motive:

MOTIVARE:
{motivare}

SOLICITARE:
{solicitare}

PROBE ANEXATE: {probe_anexate}

Data: {data_contestatiei}
{contestatar_name} / Global Jobs Consulting SRL
Semnătura: ___________________________""",
    },
    "CONTESTATIE_AMENDA": {
        "id":          "CONTESTATIE_AMENDA",
        "name":        "Contestație amendă contravențională",
        "category":    "Contestații și memorii",
        "description": "Contestație la Judecătorie împotriva unui proces-verbal de contravenție (ITM, Poliție, ANAF, IGI etc.). Termen 15 zile calendaristice de la comunicare.",
        "emitent":     "GJC",
        "variables": [
            _v("petent_name",         "Petent (cel sancționat)",         True,  "manual"),
            _v("petent_adresa",       "Adresa petentului",               False, "manual"),
            _v("pv_nr",               "Nr. procesului-verbal",           True,  "manual"),
            _v("pv_data",             "Data procesului-verbal",          True,  "manual"),
            _v("pv_emitent",          "Emitentul PV (ex: ITM Bihor)",   True,  "manual"),
            _v("suma_amenda",         "Suma amenzii (RON)",              True,  "manual"),
            _v("fapta_retinuta",      "Fapta reținută în PV",           True,  "manual"),
            _v("motivare_contestatie","Motivele contestației",           True,  "manual", "textarea"),
            _v("probe_anexate",       "Probe anexate",                   False, "manual", "textarea"),
            _v("judecatorie_judet",   "Judecătoria competentă",         True,  "manual"),
            _v("data_contestatiei",   "Data contestației",               True,  "manual"),
        ],
        "rag_queries": [
            "art 31 32 33 ordonanta 2 2001 contestatie contraventie judecatorie",
            "art 7 ordonanta 2 2001 prescriptie contraventie",
            "termen 15 zile contestatie proces verbal contraventie",
        ],
        "min_citations": 2,
        "bulk_mode":     False,
        "preview_text": """Către,
JUDECĂTORIA {judecatorie_judet}

PLÂNGERE CONTRAVENȚIONALĂ
(Contestație la procesul-verbal de contravenție)

Petent:    {petent_name}, domiciliat în {petent_adresa}
Intimat:   {pv_emitent}

Obiect: Anularea Procesului-Verbal de Contravenție nr. {pv_nr} din {pv_data},
        prin care s-a aplicat o amendă de {suma_amenda} RON

Fapta reținută: {fapta_retinuta}

Subsemnatul/a {petent_name}, în termen legal (15 zile de la comunicare),
formulez prezenta PLÂNGERE împotriva PV nr. {pv_nr}/{pv_data},
pentru următoarele motive:

{motivare_contestatie}

PROBE: {probe_anexate}

Solicităm anularea procesului-verbal și exonerarea de la plata amenzii.

Data: {data_contestatiei}
{petent_name}
Semnătura: ___________________________""",
    },
    "PLANGERE_PREALABILA": {
        "id":          "PLANGERE_PREALABILA",
        "name":        "Plângere prealabilă — înainte de contencios administrativ",
        "category":    "Contestații și memorii",
        "description": "Pas obligatoriu înainte de a sesiza instanța de contencios administrativ. Se depune la autoritatea emitentă a actului contestat. Termen răspuns: 30 zile.",
        "emitent":     "GJC",
        "variables": [
            _v("petent_name",         "Petent",                          True,  "manual"),
            _v("autoritate_name",     "Autoritatea publică sesizată",    True,  "manual"),
            _v("act_contestat",       "Actul administrativ contestat",   True,  "manual"),
            _v("data_emitere_act",    "Data emiterii actului",           False, "manual"),
            _v("motivare",            "Motivele plângerii",              True,  "manual", "textarea"),
            _v("solicitare",          "Ce se solicită (revocare/modificare)", True, "manual", "textarea"),
            _v("data_plangerii",      "Data plângerii",                  True,  "manual"),
        ],
        "rag_queries": [
            "art 7 legea 554 2004 plangere prealabila contencios administrativ",
            "art 8 legea 554 2004 termen sesizare instanta contencios",
            "act administrativ nelegal revocare anulare",
        ],
        "min_citations": 2,
        "bulk_mode":     False,
        "preview_text": """Către,
{autoritate_name}

PLÂNGERE PREALABILĂ
(conform art. 7 din Legea nr. 554/2004 a contenciosului administrativ)

Petent: {petent_name}
Act contestat: {act_contestat} emis la data de {data_emitere_act}

Subsemnatul/a {petent_name}, în temeiul art. 7 din Legea nr. 554/2004,
formulez prezenta PLÂNGERE PREALABILĂ împotriva actului administrativ
{act_contestat}, solicitând revocarea/modificarea acestuia.

MOTIVELE PLÂNGERII:
{motivare}

SOLICITARE:
{solicitare}

În lipsa unui răspuns favorabil în termen de 30 de zile,
vom sesiza instanța de contencios administrativ competentă.

Data: {data_plangerii}
{petent_name} / Global Jobs Consulting SRL
Semnătura: ___________________________""",
    },

    # ════════════════════════════════════════════════════════════════
    # CATEGORIE: Documente GJC / Corespondență oficială
    # ════════════════════════════════════════════════════════════════

    "ADRESA_GENERICA": {
        "id":          "ADRESA_GENERICA",
        "name":        "Adresă oficială GJC către orice instituție",
        "category":    "Documente GJC / Corespondență",
        "description": "Adresă oficială emisă de GJC pentru orice solicitare, informare sau comunicare formală cu instituții de stat, angajatori sau parteneri.",
        "emitent":     "GJC",
        "variables": [
            _v("destinatar",          "Destinatar (instituție/persoană)", True,  "manual"),
            _v("subiect",             "Subiectul adresei",               True,  "manual"),
            _v("continut",            "Conținutul adresei",              True,  "manual", "textarea"),
            _v("referitor_la",        "Referitor la (dosar/persoană/situație)", False, "manual"),
            _v("solicitare",          "Ce se solicită (dacă e cazul)",  False,  "manual", "textarea"),
            _v("persoana_contact",    "Persoana de contact GJC",        False,  "manual"),
            _v("data_adresei",        "Data adresei",                    True,  "manual"),
        ],
        "rag_queries": [],
        "min_citations": 0,
        "bulk_mode":     False,
        "preview_text": """GLOBAL JOBS CONSULTING SRL
CUI: 44678741 | Oradea, Bihor | contact@gjc.ro

Nr. înreg.: _____ / {data_adresei}

Către: {destinatar}
Referitor la: {referitor_la}

ADRESĂ — {subiect}

Stimate/Stimată doamne/domn,

{continut}

{solicitare}

Cu stimă,
{persoana_contact}
GLOBAL JOBS CONSULTING SRL

Data: {data_adresei}""",
    },
    "NOTIFICARE_CLIENT_DEBIT": {
        "id":          "NOTIFICARE_CLIENT_DEBIT",
        "name":        "Notificare client — debit restant",
        "category":    "Documente GJC / Corespondență",
        "description": "Notificare de plată trimisă clienților restanți (companii sau persoane fizice) cu detaliile debitului și termenul de plată.",
        "emitent":     "GJC",
        "variables": [
            _v("client_name",         "Denumire client",                 True,  "company"),
            _v("client_cui",          "CUI client",                      False, "company"),
            _v("client_adresa",       "Adresa clientului",               False, "company"),
            _v("client_reprezentant", "Reprezentant legal client",       False, "manual"),
            _v("suma_datorata",       "Suma datorată (RON/EUR)",         True,  "manual"),
            _v("factura_nr",          "Nr. factură / contract",          False, "manual"),
            _v("servicii_prestate",   "Serviciile prestate",             False, "manual"),
            _v("termen_plata",        "Termen de plată acordat",        True,  "manual"),
            _v("consecinte",          "Consecințe în caz de neplată",   False,  "manual"),
            _v("data_notificarii",    "Data notificării",                True,  "manual"),
        ],
        "rag_queries": [
            "art 1516 cod civil punerea in intarziere debitorul",
            "art 1535 cod civil dobanda penalizatoare intarziere",
            "art 1516 cod civil dreptul creditorului executare silita",
        ],
        "min_citations": 1,
        "bulk_mode":     False,
        "preview_text": """NOTIFICARE DE PLATĂ

Către: {client_name} (CUI: {client_cui})
Adresa: {client_adresa}
În atenția: {client_reprezentant}

Referitor la: Factura/Contractul nr. {factura_nr}

Stimate/Stimată doamne/domn,

Global Jobs Consulting SRL vă notifică că suma de {suma_datorata},
reprezentând contravaloarea serviciilor de {servicii_prestate},
nu a fost achitată până la data prezentei notificări.

Vă solicităm achitarea integrală a sumei datorate în termen de {termen_plata}.

{consecinte}

În caz de neplată, ne rezervăm dreptul de a recurge la procedurile legale
de recuperare a creanței, conform art. 1516 din Codul Civil.

Data: {data_notificarii}
Global Jobs Consulting SRL""",
    },
    "ACORD_MEDIERE_MUNCII": {
        "id":          "ACORD_MEDIERE_MUNCII",
        "name":        "Acord de mediere — litigiu de muncă",
        "category":    "Documente GJC / Corespondență",
        "description": "Acord de mediere amiabilă între un angajator și un salariat, pentru stingerea unui litigiu (plată drepturi salariale, încetare CIM, despăgubiri).",
        "emitent":     "GJC",
        "variables": [
            _v("salariat_name",       "Numele salariatului",             True,  "candidate"),
            _v("angajator_name",      "Denumire angajator",              True,  "company"),
            _v("angajator_cui",       "CUI",                             False, "company"),
            _v("angajator_reprezentant","Reprezentant legal angajator",  True,  "manual"),
            _v("obiectul_litigiului", "Obiectul litigiului",            True,  "manual"),
            _v("suma_acordata",       "Suma agreată pentru stingere (RON)", True, "manual"),
            _v("termen_plata",        "Termen de plată",                 True,  "manual"),
            _v("clauze_suplimentare", "Alte clauze agreate",            False,  "manual", "textarea"),
            _v("data_acordului",      "Data acordului",                  True,  "manual"),
        ],
        "rag_queries": [
            "legea 192 2006 medierea solutionarea litigii de munca",
            "art 231 codul muncii conciliere litigiu",
            "acordul partilor stingerea litigiu de munca",
        ],
        "min_citations": 1,
        "bulk_mode":     False,
        "preview_text": """ACORD DE MEDIERE

Încheiat astăzi, {data_acordului}

Între:
1. {angajator_name} (CUI: {angajator_cui}), reprezentată prin {angajator_reprezentant} — ANGAJATOR
2. {salariat_name} — SALARIAT
3. Global Jobs Consulting SRL — MEDIATOR

Obiectul litigiului: {obiectul_litigiului}

TERMENII ACORDULUI:

Angajatorul se obligă să achite suma de {suma_acordata} RON
în termen de {termen_plata} de la semnarea prezentului acord.

Salariatul renunță la orice pretenție suplimentară față de angajator
cu privire la obiectul prezentului litigiu.

{clauze_suplimentare}

Prezentul acord stinge orice litigiu între părți cu privire la obiectul menționat.

Semnat în 3 exemplare originale.

Angajator: {angajator_reprezentant}    Salariat: {salariat_name}
Semnătura: __________________          Semnătura: __________________

Mediator: Global Jobs Consulting SRL
Semnătura: ___________________________""",
    },
}


# ── Pydantic models ───────────────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    template_id:    str
    variables:      Dict[str, Any]
    extra_context:  str  = ""
    bulk_candidates: Optional[List[Dict[str, Any]]] = None   # pentru bulk mode


class AgentChatRequest(BaseModel):
    message:    str
    session_id: str = "default"


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
    """Listează toate template-urile disponibile, grupate pe categorii."""
    result = []
    for t in TEMPLATES.values():
        result.append({
            "id":           t["id"],
            "name":         t["name"],
            "category":     t["category"],
            "description":  t["description"],
            "variables":    t["variables"],
            "bulk_mode":    t.get("bulk_mode", False),
            "emitent":      t.get("emitent", "GJC"),
            "min_citations": t.get("min_citations", 2),
        })
    return result


@legal_router.get("/templates/{template_id}")
async def get_template(template_id: str, user: dict = Depends(_require_legal_read)):
    """Returnează detaliile complete ale unui template, inclusiv modelul (preview_text)."""
    t = TEMPLATES.get(template_id)
    if not t:
        raise HTTPException(status_code=404, detail=f"Template '{template_id}' negăsit")
    return {
        "id":            t["id"],
        "name":          t["name"],
        "category":      t["category"],
        "description":   t["description"],
        "variables":     t["variables"],
        "bulk_mode":     t.get("bulk_mode", False),
        "emitent":       t.get("emitent", "GJC"),
        "min_citations": t.get("min_citations", 2),
        "rag_queries":   t.get("rag_queries", []),
        "preview_text":  t.get("preview_text", "(Model nedisponibil pentru acest șablon)"),
    }


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
#  AGENT CLAUDE LEGIS — Conversational Legal AI cu tool use
# ═══════════════════════════════════════════════════════════════════════════════

AGENT_MODEL = os.environ.get("ANTHROPIC_AGENT_MODEL", "claude-opus-4-5")

AGENT_SYSTEM_PROMPT = """Ești **Legis**, consultant juridic expert al Global Jobs Consulting SRL (GJC).
Ai 15 ani de experiență practică în dreptul muncii, imigrare și proceduri administrative în România.
Lucrezi zilnic cu dosare reale: litigii de muncă, inspecții ITM, proceduri IGI, protecția lucrătorilor migranți.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PERSONALITATEA TA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Vorbești ca un consultant juridic uman — profesional, direct, cald și concret.
NU ești un robot care listează pași. Ești un expert care dă sfaturi clare.

• Îți exprimi opinia: „Din punct de vedere juridic, poziția ta este solidă." sau „Sincer, șansele sunt mici, iată de ce..."
• Citezi legea exact: „Potrivit art. 81 alin. (8) din Legea 53/2003 — Codul Muncii, salariatul poate demisiona fără preaviz dacă angajatorul nu și-a respectat obligațiile esențiale."
• Avertizezi proactiv: „⚠️ Atenție! Ai doar 15 zile calendaristice să contești procesul-verbal."
• Când situația e complicată, o spui: „Aceasta e o situație delicată — am nevoie de câteva detalii înainte să îți dau o recomandare."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FLUXUL TĂU DE CONSULTANȚĂ (în această ordine)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. ASCULTĂ — înțelege situația. Dacă lipsesc detalii esențiale, întreabă specific.
2. CAUTĂ ÎN LEGE — folosești `search_legal_corpus` pentru articolele relevante.
3. ANALIZEAZĂ — explici clar situația juridică: ce drepturi există, ce riscuri, ce soluții.
4. CONSILIEZI — dai recomandarea ta concretă ca expert.
5. AVERTIZEZI — termene legale, probe necesare, riscuri de pierdere a dreptului.
6. OFERI DOCUMENTE — la final, dacă e cazul: „Vreau să generez [documentul X]. Confirmi?"

NU sări direct la generarea documentelor. Mai întâi consultanță, apoi documente.
NU genera documente dacă nu ai datele exacte (caută în CRM cu `search_candidates` / `search_companies`).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TERMENE CRITICE — menționează-le ÎNTOTDEAUNA când sunt relevante
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 15 zile calendaristice — contestație proces-verbal contravenție (art. 31 OG 2/2001)
• 30 zile — contestație decizie de concediere (art. 268 CM)
• 30 zile — răspuns la plângere prealabilă administrativă
• 45 zile — răspuns ITM la sesizare
• 3 ani — prescripție drepturi salariale (art. 268 CM)
• 6 luni — prescripție acțiune în contencios administrativ (art. 11 Legea 554/2004)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SPECIALIZAREA TA PRINCIPALĂ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DREPTUL MUNCII
• Neplata salariului, prime, ore suplimentare — art. 159–171 CM
• Demisie fără preaviz pentru culpa angajatorului — art. 81 alin. (8) CM
• Concediere ilegală, contestație — art. 252, 268 CM
• Răspundere patrimonială angajator — art. 253 CM
• Hărțuire, discriminare — OG 137/2000

IMIGRARE & MUNCĂ STRĂINI
• OUG 194/2002 — regimul juridic al străinilor (ședere, vize, expulzare)
• OUG 56/2007 / OG 25/2014 — încadrarea în muncă a cetățenilor non-UE
• Permise de ședere în scop de muncă, prelungiri, refuzuri IGI
• Consecințe angajare fără forme legale: amenzi art. 36–38 OUG 194/2002

PROCEDURI ADMINISTRATIVE
• Sesizări ITM — Legea 108/1999, Legea 319/2006 (SSM)
• Contestații amenzi contravenționale — OG 2/2001
• Contencios administrativ — Legea 554/2004
• Plângeri penale, sesizări DIICOT — trafic de persoane, exploatare

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROBE ȘI DOVEZI — menționează ce trebuie strâns
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Contract individual de muncă + acte adiționale
• Fluturași de salariu / extrase de cont bancar
• Comunicări scrise (email, WhatsApp, SMS) cu angajatorul
• Procese-verbale, decizii, notificări primite
• Martori (colegi, vecini, reprezentanți sindicat)
• Rapoarte medicale (în caz de accident, boală profesională)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATE GJC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Global Jobs Consulting SRL | CUI: 44678741 | Oradea, Bihor
Agent de muncă temporară autorizat | contact@gjc.ro

Răspunzi EXCLUSIV în limba română."""


# ── Definiții unelte disponibile pentru agent ─────────────────────────────────
LEGAL_TOOLS = [
    {
        "name": "search_candidates",
        "description": (
            "Caută candidați în baza de date CRM după nume, naționalitate sau număr pașaport. "
            "Returnează date complete: nume, pașaport, CNP, naționalitate, dată naștere, telefon, email."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Numele candidatului (parțial sau complet), nr. pașaport sau naționalitate",
                }
            },
            "required": ["query"],
        },
    },
    {
        "name": "search_companies",
        "description": (
            "Caută companii angajatoare în CRM după denumire sau CUI. "
            "Returnează: denumire, CUI, adresă, reprezentant legal, telefon, email, județ."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Denumirea companiei (parțial) sau CUI-ul",
                }
            },
            "required": ["query"],
        },
    },
    {
        "name": "search_immigration_cases",
        "description": (
            "Caută dosare de imigrare după numele candidatului sau al companiei. "
            "Returnează: nr. IGI, status dosar, tip permis, dată expirare, companie angajatoare."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Numele candidatului, al companiei sau numărul IGI",
                }
            },
            "required": ["query"],
        },
    },
    {
        "name": "search_legal_corpus",
        "description": (
            "Caută articole de lege relevante în corpusul legislativ GJC (Codul Muncii, OUG 194/2002, "
            "OUG 56/2007, Legea 319/2006 etc.). Folosește înainte de orice generare de document juridic."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Interogarea juridică (ex: 'demisie neplata salariu art 81', 'permis sedere prelungire straini')",
                },
                "top_k": {
                    "type": "integer",
                    "description": "Număr maxim rezultate (implicit 8, max 15)",
                    "default": 8,
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "list_templates",
        "description": (
            "Listează toate template-urile de documente juridice disponibile cu ID-urile lor. "
            "Folosește când nu știi exact ce template să alegi pentru situația descrisă."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "generate_legal_document",
        "description": (
            "Generează un document juridic complet (.docx) pe baza template-ului și variabilelor furnizate. "
            "Documentul va fi salvat și disponibil pentru descărcare. "
            "IMPORTANT: completează cât mai multe variabile posibil din datele găsite în CRM."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "template_id": {
                    "type": "string",
                    "description": "ID-ul exact al template-ului (ex: DEMISIE_ART_81_8, SESIZARE_ITM, ADRESA_GENERICA)",
                },
                "variables": {
                    "type": "object",
                    "description": "Obiect cu toate variabilele documentului (candidat_name, angajator_name, angajator_cui etc.)",
                },
            },
            "required": ["template_id", "variables"],
        },
    },
]


# ── Memorie conversații (in-memory per sesiune utilizator) ─────────────────────
_conversations: Dict[str, List[Dict]] = {}


async def _execute_tool(tool_name: str, tool_input: Dict, user: Dict) -> str:
    """Execută o unealtă a agentului și returnează rezultatul ca string."""
    try:
        # ── search_candidates ─────────────────────────────────────────────────
        if tool_name == "search_candidates":
            q = tool_input.get("query", "").strip()
            if not q:
                return "Eroare: query gol"
            candidates = await _db.candidates.find(
                {"$or": [
                    {"first_name":      {"$regex": q, "$options": "i"}},
                    {"last_name":       {"$regex": q, "$options": "i"}},
                    {"passport_number": {"$regex": q, "$options": "i"}},
                    {"nationality":     {"$regex": q, "$options": "i"}},
                ]},
                {"_id": 0, "password": 0, "password_hash": 0},
            ).limit(5).to_list(5)
            if not candidates:
                return f"Nu am găsit niciun candidat cu '{q}' în CRM."
            lines = [f"Găsit {len(candidates)} candidat(i):"]
            for c in candidates:
                lines.append(
                    f"- {c.get('first_name','')} {c.get('last_name','')} "
                    f"| Pașaport: {c.get('passport_number','N/A')} "
                    f"| CNP: {c.get('cnp','N/A')} "
                    f"| Naționalitate: {c.get('nationality','N/A')} "
                    f"| Dată naștere: {c.get('birth_date','N/A')} "
                    f"| Tel: {c.get('phone','N/A')} "
                    f"| Email: {c.get('email','N/A')}"
                )
            return "\n".join(lines)

        # ── search_companies ──────────────────────────────────────────────────
        elif tool_name == "search_companies":
            q = tool_input.get("query", "").strip()
            companies = await _db.companies.find(
                {"$or": [
                    {"name": {"$regex": q, "$options": "i"}},
                    {"cui":  {"$regex": q, "$options": "i"}},
                ]},
                {"_id": 0},
            ).limit(5).to_list(5)
            if not companies:
                return f"Nu am găsit nicio companie cu '{q}' în CRM."
            lines = [f"Găsit {len(companies)} companie(i):"]
            for c in companies:
                lines.append(
                    f"- {c.get('name','')} "
                    f"| CUI: {c.get('cui','N/A')} "
                    f"| Adresă: {c.get('address','')} {c.get('city','')} {c.get('county','')} "
                    f"| Rep. legal: {c.get('legal_representative', c.get('contact_person','N/A'))} "
                    f"| Tel: {c.get('phone','N/A')} "
                    f"| Email: {c.get('email','N/A')}"
                )
            return "\n".join(lines)

        # ── search_immigration_cases ──────────────────────────────────────────
        elif tool_name == "search_immigration_cases":
            q = tool_input.get("query", "").strip()
            cases = await _db.immigration_cases.find(
                {"$or": [
                    {"candidate_name": {"$regex": q, "$options": "i"}},
                    {"company_name":   {"$regex": q, "$options": "i"}},
                    {"igi_number":     {"$regex": q, "$options": "i"}},
                ]},
                {"_id": 0},
            ).limit(5).to_list(5)
            if not cases:
                return f"Nu am găsit dosare de imigrare cu '{q}'."
            lines = [f"Găsit {len(cases)} dosar(e):"]
            for c in cases:
                lines.append(
                    f"- {c.get('candidate_name','')} @ {c.get('company_name','')} "
                    f"| IGI: {c.get('igi_number','N/A')} "
                    f"| Status: {c.get('status','N/A')} "
                    f"| Tip permis: {c.get('permit_type','N/A')} "
                    f"| Exp: {c.get('permit_expiry','N/A')}"
                )
            return "\n".join(lines)

        # ── search_legal_corpus ───────────────────────────────────────────────
        elif tool_name == "search_legal_corpus":
            q     = tool_input.get("query", "").strip()
            top_k = min(int(tool_input.get("top_k", 8)), 15)
            if not q:
                return "Eroare: query gol"
            chunks = await search_corpus(_db, q, top_k=top_k)
            if not chunks:
                return (
                    "Nu am găsit articole relevante în corpusul legislativ. "
                    "Corpusul poate fi gol — accesează tab-ul 'Corpus Legislativ' și pornește build-ul automat."
                )
            lines = [f"{len(chunks)} fragmente găsite pentru '{q}':"]
            for ch in chunks[:8]:
                lines.append(
                    f"\n[{ch.get('act_title','')} — {ch.get('section_path','')}]\n"
                    f"{ch.get('text','')[:350]}…"
                )
            return "\n".join(lines)

        # ── list_templates ────────────────────────────────────────────────────
        elif tool_name == "list_templates":
            lines = ["Template-uri disponibile:"]
            for t in TEMPLATES.values():
                lines.append(
                    f"- ID: {t['id']} | {t['name']} | Categorie: {t['category']} "
                    f"| Emis de: {t.get('emitent','GJC')}"
                )
            return "\n".join(lines)

        # ── generate_legal_document ───────────────────────────────────────────
        elif tool_name == "generate_legal_document":
            template_id = tool_input.get("template_id", "")
            variables   = tool_input.get("variables", {})
            template_def = TEMPLATES.get(template_id)
            if not template_def:
                available = ", ".join(list(TEMPLATES.keys())[:8])
                return f"Template '{template_id}' nu există. Disponibile: {available}. Folosește list_templates."

            corpus_count = await _db.legal_chunks.count_documents({})
            rag_result   = await generate_legal_document(_db, template_def, variables, "")

            # Generare .docx
            doc_id        = str(uuid.uuid4())
            docx_filename = None
            docx_error    = None
            if DOCX_AVAILABLE:
                try:
                    candidat_name = variables.get(
                        "candidat_name",
                        variables.get("mandant_name",
                        variables.get("reclamant_name", ""))
                    )
                    docx_filename = generate_docx(
                        title         = template_def["name"],
                        body_text     = rag_result["text"],
                        template_id   = template_id,
                        variables     = variables,
                        doc_id        = doc_id,
                        emitent       = template_def.get("emitent", "GJC"),
                        candidat_name = candidat_name,
                    )
                except Exception as e:
                    docx_error = str(e)
                    logger.error(f"Agent DOCX error: {e}")

            # Salvare în MongoDB
            validation = rag_result["citations_validation"]
            doc_record = {
                "id":               doc_id,
                "template_id":      template_id,
                "template_name":    template_def["name"],
                "title": (
                    f"{template_def['name']} — "
                    f"{variables.get('candidat_name') or variables.get('sesizant_name') or variables.get('reclamant_name','')}"
                ),
                "variables":          variables,
                "generated_text":     rag_result["text"],
                "citations":          validation.get("valid_citations", []),
                "invalid_citations":  validation.get("invalid_citations", []),
                "confidence_score":   validation.get("confidence", 0.0),
                "status":             "draft",
                "model":              rag_result.get("model", ""),
                "tokens_used":        rag_result.get("tokens_used", 0),
                "docx_filename":      docx_filename,
                "docx_error":         docx_error,
                "corpus_size":        corpus_count,
                "created_by":         user.get("email", "agent"),
                "created_at":         datetime.now(timezone.utc).isoformat(),
                "agent_generated":    True,
            }
            await _db.generated_documents.insert_one(doc_record)

            citations      = validation.get("valid_citations", [])
            confidence_pct = round(validation.get("confidence", 0.0) * 100)
            return (
                f"DOCUMENT_GENERATED\n"
                f"doc_id:{doc_id}\n"
                f"title:{template_def['name']}\n"
                f"confidence:{confidence_pct}%\n"
                f"citations:{', '.join(citations) or 'niciuna verificată'}\n"
                f"docx_ok:{docx_filename is not None}\n"
                f"preview:{rag_result['text'][:400]}…"
            )

        return f"Unealtă necunoscută: {tool_name}"

    except Exception as exc:
        logger.error(f"Agent tool error [{tool_name}]: {exc}")
        return f"Eroare internă la executarea uneltei '{tool_name}': {str(exc)[:150]}"


@legal_router.post("/agent/chat")
async def agent_chat(
    req:  AgentChatRequest,
    user: dict = Depends(_require_legal_read),
):
    """
    Agentul conversational Claude Legis.
    Primește un mesaj în limbaj natural, execută unelte (CRM + corpus) și
    returnează răspunsul final împreună cu documentul generat (dacă e cazul).
    """
    session_key = f"{user.get('email', 'anon')}:{req.session_id}"

    if session_key not in _conversations:
        _conversations[session_key] = []

    history = _conversations[session_key]
    history.append({"role": "user", "content": req.message})

    # Limităm istoricul la ultimele 20 schimburi pentru a nu depăși token limit
    if len(history) > 20:
        history = history[-20:]

    client = anthropic_sdk.AsyncAnthropic(
        api_key=os.environ.get("ANTHROPIC_API_KEY", "")
    )

    messages       = list(history)
    tool_calls_log: List[Dict] = []

    # ── Agent loop (max 10 iterații) ──────────────────────────────────────────
    for _iteration in range(10):
        response = await client.messages.create(
            model      = AGENT_MODEL,
            max_tokens = 4096,
            system     = AGENT_SYSTEM_PROMPT,
            tools      = LEGAL_TOOLS,
            messages   = messages,
        )

        # ── Răspuns final ─────────────────────────────────────────────────────
        if response.stop_reason == "end_turn":
            final_text = ""
            for block in response.content:
                if hasattr(block, "text"):
                    final_text = block.text
                    break

            # Salvează istoricul
            history.append({"role": "assistant", "content": response.content})
            _conversations[session_key] = history[-20:]

            # Extrage doc_id dacă s-a generat vreun document
            doc_id    = None
            doc_title = None
            for call in tool_calls_log:
                raw = call.get("result", "")
                if "DOCUMENT_GENERATED" in raw:
                    for line in raw.split("\n"):
                        if line.startswith("doc_id:"):
                            doc_id = line.split(":", 1)[1].strip()
                        elif line.startswith("title:"):
                            doc_title = line.split(":", 1)[1].strip()

            return {
                "status":     "done",
                "message":    final_text,
                "tool_calls": tool_calls_log,
                "doc_id":     doc_id,
                "doc_title":  doc_title,
                "session_id": req.session_id,
            }

        # ── Execuție unelte ───────────────────────────────────────────────────
        elif response.stop_reason == "tool_use":
            tool_results: List[Dict] = []
            messages.append({"role": "assistant", "content": response.content})

            for block in response.content:
                if block.type == "tool_use":
                    result = await _execute_tool(block.name, block.input, user)
                    tool_calls_log.append({
                        "tool":   block.name,
                        "input":  block.input,
                        "result": result,
                    })
                    tool_results.append({
                        "type":        "tool_result",
                        "tool_use_id": block.id,
                        "content":     result,
                    })

            messages.append({"role": "user", "content": tool_results})

        else:
            break

    return {
        "status":     "error",
        "message":    "Agentul nu a putut finaliza sarcina. Încearcă un mesaj mai specific.",
        "tool_calls": tool_calls_log,
        "doc_id":     None,
        "doc_title":  None,
    }


@legal_router.post("/agent/clear")
async def clear_agent_conversation(
    session_id: str = "default",
    user: dict = Depends(_require_legal_read),
):
    """Resetează istoricul conversației pentru sesiunea curentă."""
    session_key = f"{user.get('email', 'anon')}:{session_id}"
    _conversations.pop(session_key, None)
    return {"status": "ok", "message": "Conversație resetată. Poți începe o nouă sesiune."}


# ═══════════════════════════════════════════════════════════════════════════════
#  AUTO-BUILD CORPUS DIN SURSE OFICIALE
# ═══════════════════════════════════════════════════════════════════════════════

# Stare globală a build-ului (resetată la pornire server)
_build_status: Dict[str, Any] = {
    "running":     False,
    "started_at":  None,
    "total":       0,
    "done":        0,
    "failed":      0,
    "skipped":     0,
    "current_act": "",
    "log":         [],
    "finished_at": None,
}

# 20 acte normative esențiale — sursa: legislatie.just.ro (HTML curat, nu PDF)
CORPUS_ACTS_LIST = [
    # ── PRIORITATE CRITICĂ ─────────────────────────────────────────────────────
    {"key": "CM",      "title": "Codul Muncii — Legea 53/2003 (republicat)",
     "url": "https://legislatie.just.ro/Public/DetaliiDocumentAfis/266893",  "act_type": "cod"},
    {"key": "OUG56",   "title": "OUG 56/2007 — Încadrarea în muncă a străinilor în România",
     "url": "https://legislatie.just.ro/Public/DetaliiDocumentAfis/81993",   "act_type": "oug"},
    {"key": "OUG194",  "title": "OUG 194/2002 — Regimul juridic al străinilor în România",
     "url": "https://legislatie.just.ro/Public/DetaliiDocumentAfis/55826",   "act_type": "oug"},
    {"key": "L108",    "title": "Legea 108/1999 — Înființarea și organizarea Inspecției Muncii",
     "url": "https://legislatie.just.ro/Public/DetaliiDocumentAfis/16354",   "act_type": "lege"},
    # ── PRIORITATE RIDICATĂ ────────────────────────────────────────────────────
    {"key": "OG25",    "title": "OG 25/2014 — Încadrarea în muncă și detașarea străinilor pe teritoriul României",
     "url": "https://legislatie.just.ro/Public/DetaliiDocumentAfis/159072",  "act_type": "og"},
    {"key": "OUG102",  "title": "OUG 102/2005 — Libera circulație a cetățenilor UE și SEE pe teritoriul României",
     "url": "https://legislatie.just.ro/Public/DetaliiDocumentAfis/63556",   "act_type": "oug"},
    {"key": "L156",    "title": "Legea 156/2000 — Protecția cetățenilor români care lucrează în străinătate",
     "url": "https://legislatie.just.ro/Public/DetaliiDocumentAfis/22814",   "act_type": "lege"},
    {"key": "L122",    "title": "Legea 122/2006 — Azilul în România",
     "url": "https://legislatie.just.ro/Public/DetaliiDocumentAfis/75406",   "act_type": "lege"},
    {"key": "L678",    "title": "Legea 678/2001 — Prevenirea și combaterea traficului de persoane",
     "url": "https://legislatie.just.ro/Public/DetaliiDocumentAfis/14062",   "act_type": "lege"},
    {"key": "L248",    "title": "Legea 248/2005 — Regimul liberei circulații a cetățenilor români în străinătate",
     "url": "https://legislatie.just.ro/Public/DetaliiDocumentAfis/65285",   "act_type": "lege"},
    # ── PRIORITATE MEDIE ───────────────────────────────────────────────────────
    {"key": "L319",    "title": "Legea 319/2006 — Securitate și Sănătate în Muncă",
     "url": "https://legislatie.just.ro/Public/DetaliiDocumentAfis/74762",   "act_type": "lege"},
    {"key": "HG905",   "title": "HG 905/2017 — Registrul general de evidență a salariaților (REVISAL)",
     "url": "https://legislatie.just.ro/Public/DetaliiDocumentAfis/185534",  "act_type": "hg"},
    {"key": "L62",     "title": "Legea 62/2011 — Dialogul social (republicată)",
     "url": "https://legislatie.just.ro/Public/DetaliiDocumentAfis/135836",  "act_type": "lege"},
    {"key": "OG137",   "title": "OG 137/2000 — Prevenirea și sancționarea tuturor formelor de discriminare",
     "url": "https://legislatie.just.ro/Public/DetaliiDocumentAfis/16835",   "act_type": "og"},
    {"key": "OG2",     "title": "OG 2/2001 — Regimul juridic al contravențiilor",
     "url": "https://legislatie.just.ro/Public/DetaliiDocumentAfis/13740",   "act_type": "og"},
    {"key": "L554",    "title": "Legea 554/2004 — Contenciosul administrativ",
     "url": "https://legislatie.just.ro/Public/DetaliiDocumentAfis/42215",   "act_type": "lege"},
    {"key": "L192",    "title": "Legea 192/2006 — Medierea și organizarea profesiei de mediator",
     "url": "https://legislatie.just.ro/Public/DetaliiDocumentAfis/74637",   "act_type": "lege"},
    # ── COMPLEMENTARE ─────────────────────────────────────────────────────────
    {"key": "L76",     "title": "Legea 76/2002 — Sistemul asigurărilor pentru șomaj și stimularea ocupării forței de muncă",
     "url": "https://legislatie.just.ro/Public/DetaliiDocumentAfis/17989",   "act_type": "lege"},
    {"key": "CPP",     "title": "Codul de Procedură Penală — Legea 135/2010",
     "url": "https://legislatie.just.ro/Public/DetaliiDocumentAfis/132290",  "act_type": "cod"},
    {"key": "CPC",     "title": "Codul de Procedură Civilă — Legea 134/2010",
     "url": "https://legislatie.just.ro/Public/DetaliiDocumentAfis/130671",  "act_type": "cod"},
]


async def _run_corpus_build(force: bool, created_by: str) -> None:
    """Background task: descarcă și ingerează actele legislative din surse oficiale."""
    global _build_status

    try:
        async with httpx.AsyncClient(
            timeout=45,
            headers={
                "User-Agent": "GJC-Legal-AI/1.0 (contact@gjc.ro)",
                "Accept-Language": "ro,en;q=0.9",
            },
            follow_redirects=True,
        ) as client:
            for act in CORPUS_ACTS_LIST:
                # Permite oprire manuală
                if not _build_status["running"]:
                    break

                _build_status["current_act"] = act["title"]

                try:
                    # ── 1. Skip dacă există deja (după source_url) ────────────
                    if not force:
                        existing = await _db.legal_acts.find_one({"source_url": act["url"]})
                        if existing:
                            _build_status["skipped"] += 1
                            _build_status["log"].append({
                                "act": act["title"], "status": "sărit",
                                "reason": "deja în corpus",
                            })
                            continue

                    # ── 2. Descarcă pagina ────────────────────────────────────
                    resp = await client.get(act["url"])
                    resp.raise_for_status()

                    html = resp.text
                    text = _extract_text_from_html(html)

                    if len(text.strip()) < 400:
                        raise ValueError(
                            f"Conținut insuficient ({len(text.strip())} car.) — "
                            "pagina poate necesita autentificare sau nu e disponibilă"
                        )

                    # ── 3. Verificare duplicat după hash ──────────────────────
                    c_hash = hashlib.sha256(text.encode()).hexdigest()
                    if not force:
                        dup = await _db.legal_acts.find_one({"content_hash": c_hash})
                        if dup:
                            _build_status["skipped"] += 1
                            _build_status["log"].append({
                                "act": act["title"], "status": "sărit",
                                "reason": "conținut identic existent",
                            })
                            continue

                    # ── 4. Chunking + ingestie ────────────────────────────────
                    act_id = str(uuid.uuid4())
                    chunks_raw = chunk_legal_text(text, act_title=act["title"], act_id=act_id)

                    inserted = 0
                    for idx, cd in enumerate(chunks_raw):
                        ct  = cd["text"]
                        ch  = hashlib.md5(ct.encode()).hexdigest()
                        emb = await get_embedding(ct)
                        try:
                            await _db.legal_chunks.insert_one({
                                "id":             str(uuid.uuid4()),
                                "act_id":         act_id,
                                "act_title":      act["title"],
                                "chunk_index":    idx,
                                "section_path":   cd["section_path"],
                                "article_number": cd.get("article_number"),
                                "text":           ct,
                                "chunk_type":     cd.get("chunk_type", "paragraph"),
                                "token_count":    len(ct.split()),
                                "content_hash":   ch,
                                "embedding":      emb,
                                "created_at":     datetime.now(timezone.utc).isoformat(),
                            })
                            inserted += 1
                        except Exception:
                            pass  # Duplicate chunk hash — skip silently

                    await _db.legal_acts.insert_one({
                        "id":           act_id,
                        "title":        act["title"],
                        "act_type":     act["act_type"],
                        "source_url":   act["url"],
                        "content_hash": c_hash,
                        "total_chunks": inserted,
                        "status":       "active",
                        "ingested_at":  datetime.now(timezone.utc).isoformat(),
                        "created_by":   created_by,
                        "auto_built":   True,
                    })

                    _build_status["done"] += 1
                    _build_status["log"].append({
                        "act": act["title"], "status": "ok", "chunks": inserted,
                    })
                    logger.info(f"Auto-build ✓ {act['title']} — {inserted} fragmente")

                except Exception as exc:
                    _build_status["failed"] += 1
                    _build_status["log"].append({
                        "act": act["title"], "status": "eroare",
                        "reason": str(exc)[:120],
                    })
                    logger.warning(f"Auto-build ✗ {act['title']}: {exc}")

                # Pauză între requesturi — respectuos față de serverul sursă
                await asyncio.sleep(6)

    except Exception as exc:
        logger.error(f"Auto-build corpus crash: {exc}")
    finally:
        _build_status["running"]     = False
        _build_status["current_act"] = ""
        _build_status["finished_at"] = datetime.now(timezone.utc).isoformat()


@legal_router.post("/auto-build-corpus")
async def auto_build_corpus(
    background_tasks: BackgroundTasks,
    force: bool = False,
    user:  dict = Depends(_require_legal_generate),
):
    """
    Lansează descărcarea automată a corpusului legislativ din legislatie.just.ro.
    Procesul rulează în fundal; progresul se verifică via GET /auto-build-status.
    """
    global _build_status

    if _build_status.get("running"):
        return {
            "status":  "already_running",
            "message": "Un build este deja în curs de desfășurare",
            **_build_status,
        }

    _build_status = {
        "running":     True,
        "started_at":  datetime.now(timezone.utc).isoformat(),
        "total":       len(CORPUS_ACTS_LIST),
        "done":        0,
        "failed":      0,
        "skipped":     0,
        "current_act": "",
        "log":         [],
        "finished_at": None,
    }
    background_tasks.add_task(_run_corpus_build, force, user.get("email", ""))
    return {
        "status":  "started",
        "total":   len(CORPUS_ACTS_LIST),
        "message": (
            f"Build pornit! Se vor descărca {len(CORPUS_ACTS_LIST)} acte legislative "
            "din legislatie.just.ro (~2 minute). Monitorizează progresul în timp real."
        ),
    }


@legal_router.get("/auto-build-status")
async def get_auto_build_status(user: dict = Depends(_require_legal_read)):
    """Returnează statusul curent al build-ului automat de corpus."""
    return _build_status


@legal_router.post("/auto-build-stop")
async def stop_auto_build(user: dict = Depends(_require_legal_generate)):
    """Oprește build-ul automat înainte de finalizare."""
    global _build_status
    if not _build_status.get("running"):
        return {"status": "not_running", "message": "Niciun build activ"}
    _build_status["running"] = False
    return {"status": "stopped", "message": "Build oprit. Actele deja descărcate rămân în corpus."}


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
