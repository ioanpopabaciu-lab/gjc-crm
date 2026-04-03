"""
Re-extrage date complete din PDF-urile avizelor de munca IGI.

Campuri noi extrase (fata de import_pdf_avize.py):
  - company_county   -> companies.county
  - company_reg_commerce -> companies.reg_commerce
  - birth_country    -> candidates.birth_country
  - birth_date       -> candidates.birth_date
  - cor_code         -> immigration_cases.cor_code
  - job_function     -> immigration_cases.job_function
  - aviz_number/date -> immigration_cases.aviz_number / aviz_date
  - passport_number  -> candidates.passport_number

Surse PDF (in ordine de prioritate):
  1. Gmail API (gmail_token.json)
  2. Fisiere locale din avize_pdf/ (daca exista)

RULARE: foloseste venv-ul proiectului (are pdfplumber, motor, google-api):
  venv/Scripts/python.exe re_extract_pdf_complet.py
"""
# Asigura-te ca folosim Python-ul din venv (cu toate dependentele)
import sys, io, asyncio, re, base64, unicodedata
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
from collections import Counter

# ─── Configurare ────────────────────────────────────────────────────────────
ROOT_DIR = Path(__file__).parent
ATLAS = (
    "mongodb+srv://gjc_admin:GJC2026admin@cluster0.4l9rft3.mongodb.net/"
    "gjc_crm?retryWrites=true&w=majority&appName=Cluster0"
)
TOKEN_FILE = ROOT_DIR / "gmail_token.json"
SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
AVIZE_DIR = ROOT_DIR / "avize_pdf"
SEP = "=" * 70

# ─── Utilitare ───────────────────────────────────────────────────────────────
def norm(t):
    if not t:
        return ""
    return unicodedata.normalize("NFD", str(t)).encode("ascii", "ignore").decode("ascii").lower().strip()


def titlify(s):
    return " ".join(w.capitalize() for w in str(s).strip().split()) if s else ""


def pdf_to_text(pdf_bytes: bytes) -> str:
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            return "\n".join(page.extract_text() or "" for page in pdf.pages)
    except Exception as e:
        return ""


# ─── Gmail ───────────────────────────────────────────────────────────────────
def get_gmail():
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build

    creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
    return build("gmail", "v1", credentials=creds)


def download_pdf_gmail(service, gmail_id: str) -> bytes | None:
    """Descarca primul PDF atasat la un mesaj Gmail."""
    try:
        msg = (
            service.users()
            .messages()
            .get(userId="me", id=gmail_id, format="full")
            .execute()
        )
        parts = msg.get("payload", {}).get("parts", [])
        for part in parts:
            mime = part.get("mimeType", "")
            fname = part.get("filename", "")
            if mime in ("application/pdf", "application/octet-stream") or fname.lower().endswith(".pdf"):
                att_id = part.get("body", {}).get("attachmentId")
                if not att_id:
                    continue
                att = (
                    service.users()
                    .messages()
                    .attachments()
                    .get(userId="me", messageId=gmail_id, id=att_id)
                    .execute()
                )
                return base64.urlsafe_b64decode(att["data"])
    except Exception:
        pass
    return None


# ─── Regex-uri de extragere ──────────────────────────────────────────────────
# Company name — inainte de "cu sediul"
RE_COMPANY = re.compile(r"(?:depuse\s+de\s+)?(.+?)\s+cu\s+sediul", re.IGNORECASE | re.DOTALL)

# County — dupa "cu sediul/domiciliul în"
RE_COUNTY = re.compile(
    r"cu\s+sediul/domiciliul[uă]?\s+(?:în|in)\s+([^\n,]+)", re.IGNORECASE
)

# Registrul Comertului — J23/778/2001 sau F/C variante
RE_REG = re.compile(r"\b([JFC]\d+/\d+/\d+)\b")

# CUI / cod fiscal
RE_CUI = re.compile(r"cod(?:ul)?\s+fiscal\s*/CNP\s+(\d+)", re.IGNORECASE)
RE_CUI2 = re.compile(r"codul\s+fiscal\s+(\d+)", re.IGNORECASE)

# Aviz numar si data
RE_AVIZ = re.compile(
    r"AVIZUL\s+DE\s+MUNC[Ă A]\s+nr\.?\s*(\d+)\s+din\s+(\d{2}[./]\d{2}[./]\d{4})",
    re.IGNORECASE,
)

# Tip munca
RE_WORK_TYPE = re.compile(
    r"lucr[aă]tor\s+(PERMANENT|SEZONIER|DETA[ŞS]AT)", re.IGNORECASE
)

# Cod COR si functie
RE_COR = re.compile(
    r"cod\s+func[tţ]ie\s+COR\s+(\d+)\s+(.+?)(?:\n|donnului|doamnei|$)",
    re.IGNORECASE,
)

# Candidat
RE_CANDIDATE = re.compile(
    r"domnului/doamnei\s+([A-ZĂÂÎȘȚ][A-ZĂÂÎȘȚ\s\-]+?)(?:\s+n[aă]scut|\s+CNP|\s*$)",
    re.IGNORECASE,
)

# Data nasterii
RE_BIRTH = re.compile(r"n[aă]scut[aă]?\s+la\s+(\d{2}[./]\d{2}[./]\d{4})", re.IGNORECASE)

# CNP
RE_CNP = re.compile(r"CNP[:\s]+(\d{13})", re.IGNORECASE)

# Tara nastere — pe versiunea ASCII a textului
# Format PDF: "CNP: 8020420050038 in NEPAL pasaport"
# (dupa normalizare ASCII: "în" devine "in")
RE_BIRTH_COUNTRY = re.compile(
    r"CNP[:\s]+\d+\s+\w+\s+([A-Z][A-Z\s]+?)(?:\s+pa[sss]aport|\s*$)",
    re.IGNORECASE,
)
# Fallback: ultimul cuvant uppercase pe linia de nastere inainte de pasaport
RE_BIRTH_COUNTRY2 = re.compile(
    r"nascut[a]?.+?in\s+([A-Z][A-Z\s]+?)(?:\s+pa[sss]aport|\s*$)",
    re.IGNORECASE,
)

# Pasaport — prinde ş (cedilla U+015F) si ș (comma below U+0219) si s
RE_PASSPORT = re.compile(r"pa[s\u015f\u0219]aport\s+nr\.?\s*([A-Z0-9]+)", re.IGNORECASE)

# Numar cerere IGI
RE_REQUEST = re.compile(
    r"cererii\s+[îiî]nregistrate\s+cu\s+num[aă]rul\s+(\d+)\s+din\s+(\d{2}[./]\d{2}[./]\d{4})",
    re.IGNORECASE,
)


# ─── Parser principal ─────────────────────────────────────────────────────────
def to_ascii(s: str) -> str:
    """Normalizeaza diacritice romanesti la ASCII, pastreaza majusculele."""
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode("ascii")


def parse_aviz(text: str) -> dict:
    """Extrage toate campurile dintr-un text PDF aviz IGI."""
    d = {}
    # Versiunea flat (fara newline-uri) - cu diacritice originale
    flat = text.replace("\n", " ").strip()
    # Versiunea ASCII (fara diacritice) - pentru regex-uri cu litere speciale
    flat_ascii = to_ascii(flat)

    # Companie
    m = RE_COMPANY.search(flat)
    if m:
        d["company_name"] = m.group(1).strip()

    # Judet companie
    m = RE_COUNTY.search(flat)
    if m:
        raw = m.group(1).strip()
        # Curata: opreste la primul cuvant cheie ce nu e parte din judet
        raw = re.split(r"\s+nr\b|\s+cod\b|\s+str\b|\s+bd\b", raw, flags=re.IGNORECASE)[0]
        d["company_county"] = titlify(raw.strip(" ,"))

    # Registrul Comertului
    m = RE_REG.search(flat)
    if m:
        d["company_reg_commerce"] = m.group(1).strip()

    # CUI
    m = RE_CUI.search(flat) or RE_CUI2.search(flat)
    if m:
        d["company_cui"] = m.group(1).strip()

    # Aviz numar + data
    m = RE_AVIZ.search(flat)
    if m:
        d["aviz_number"] = m.group(1).strip()
        d["aviz_date"] = m.group(2).replace("/", ".").strip()

    # Tip munca
    m = RE_WORK_TYPE.search(flat)
    if m:
        d["work_type"] = m.group(1).upper()

    # COR + functie
    m = RE_COR.search(flat)
    if m:
        d["cor_code"] = m.group(1).strip()
        func_raw = m.group(2).strip()
        # Taie la urmatorul cuvant cheie daca a ramas in match
        func_raw = re.split(r"\s+domnului|\s+doamnei|\s+lucrător|\s+AVIZUL", func_raw, flags=re.IGNORECASE)[0]
        d["job_function"] = titlify(func_raw.strip(" ,"))

    # Candidat
    m = RE_CANDIDATE.search(flat)
    if m:
        d["candidate_name"] = m.group(1).strip()

    # Data nasterii
    m = RE_BIRTH.search(flat)
    if m:
        d["birth_date"] = m.group(1).replace("/", ".").strip()

    # CNP
    m = RE_CNP.search(flat)
    if m:
        d["cnp"] = m.group(1).strip()

    # Tara nastere — aplica pe versiunea ASCII (elimina probleme cu diacritice)
    m = RE_BIRTH_COUNTRY.search(flat_ascii) or RE_BIRTH_COUNTRY2.search(flat_ascii)
    if m:
        country_raw = m.group(1).strip(" ,\n")
        # Elimina artefacte dupa tara (ex: "eliberat de NEPAL" → "NEPAL")
        country_raw = re.sub(r"\s+eliberat.*$", "", country_raw, flags=re.IGNORECASE)
        d["birth_country"] = titlify(country_raw.strip())

    # Pasaport — aplica pe versiunea ASCII
    m = RE_PASSPORT.search(flat_ascii)
    if m:
        d["passport_number"] = m.group(1).strip()

    # Cerere IGI
    m = RE_REQUEST.search(flat)
    if m:
        d["request_number"] = m.group(1).strip()
        d["request_date"] = m.group(2).replace("/", ".").strip()

    return d


# ─── Main async ──────────────────────────────────────────────────────────────
async def run():
    print(SEP)
    print("GJC CRM — RE-EXTRAGERE COMPLETA DATE DIN PDF AVIZE IGI")
    print(SEP)
    print(f"Start: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    # ── Conectare MongoDB ──
    client = AsyncIOMotorClient(ATLAS)
    db = client["gjc_crm_db"]

    # ── Incarca avize din MongoDB ──
    avize = await db.igi_emails.find(
        {"category": "aviz_emis", "attachments": {"$nin": [None, []]}}
    ).to_list(length=None)
    print(f"Avize cu atasament PDF in MongoDB: {len(avize)}")

    # ── Incarca indexuri existente ──
    companies = await db.companies.find({}).to_list(length=None)
    comp_by_cui  = {c.get("cui", ""): c for c in companies if c.get("cui")}
    comp_by_name = {norm(c.get("name", "")): c for c in companies}

    candidates = await db.candidates.find({}).to_list(length=None)
    cand_by_norm: dict = {}
    for c in candidates:
        fn = norm(f"{c.get('first_name', '')} {c.get('last_name', '')}".strip())
        ln = norm(f"{c.get('last_name', '')} {c.get('first_name', '')}".strip())
        if fn:
            cand_by_norm[fn] = c
        if ln:
            cand_by_norm[ln] = c

    cases = await db.immigration_cases.find({}).to_list(length=None)
    case_by_req  = {c.get("igi_number", "").strip(): c for c in cases if c.get("igi_number")}
    case_by_cand = {c.get("candidate_id", ""): c for c in cases if c.get("candidate_id")}

    now = datetime.now(timezone.utc).isoformat()

    stats = {
        "pdf_parsed": 0,
        "pdf_errors": 0,
        "gmail_errors": 0,
        "companies_updated": 0,
        "candidates_updated": 0,
        "cases_updated": 0,
    }
    cor_counter: Counter = Counter()

    # ── Conectare Gmail API (optional) ──
    gmail_service = None
    if TOKEN_FILE.exists():
        try:
            gmail_service = get_gmail()
            print("Gmail API: conectat cu succes")
        except Exception as e:
            print(f"Gmail API: nu s-a putut conecta ({e})")
            print("  → Se incearca fisiere locale din avize_pdf/")
    else:
        print("gmail_token.json: nu gasit → se incearca fisiere locale")

    # ── PAS 1: Descarca si parseaza PDF-urile ──
    print(f"\n{'─'*60}")
    print("PAS 1: Descarca si parseaza PDF-uri...")
    print(f"{'─'*60}")

    parsed_data = []

    for i, email in enumerate(avize):
        gmail_id = email.get("gmail_id")
        pdf_bytes = None

        # Progres
        if (i + 1) % 20 == 0:
            print(f"  {i+1}/{len(avize)} procesate (parsate OK: {stats['pdf_parsed']})...")

        # Sursa 1: Gmail API
        if gmail_service and gmail_id:
            pdf_bytes = download_pdf_gmail(gmail_service, gmail_id)
            if not pdf_bytes:
                stats["gmail_errors"] += 1

        # Sursa 2: fisier local
        if pdf_bytes is None and AVIZE_DIR.exists():
            att_list = email.get("attachments", [])
            for att_name in att_list:
                local_path = AVIZE_DIR / att_name
                if local_path.exists():
                    pdf_bytes = local_path.read_bytes()
                    break

        if pdf_bytes is None:
            stats["pdf_errors"] += 1
            continue

        text = pdf_to_text(pdf_bytes)
        if not text.strip():
            stats["pdf_errors"] += 1
            continue

        parsed = parse_aviz(text)
        if not parsed.get("candidate_name") and not parsed.get("company_name"):
            stats["pdf_errors"] += 1
            continue

        # Adauga metadate email
        parsed["gmail_id"] = gmail_id
        parsed["email_id"] = str(email.get("_id", ""))

        # Extrage work_permit din filename daca nu e deja in parsed
        att_list = email.get("attachments", [])
        if att_list:
            m = re.search(r"Work permit\s+(\d+)", att_list[0], re.IGNORECASE)
            if m:
                parsed.setdefault("work_permit_number", m.group(1))

        # Completeaza din pdf_data stocat daca lipseste ceva
        pdf_data_stored = email.get("pdf_data", {})
        if isinstance(pdf_data_stored, dict):
            parsed.setdefault("aviz_number", pdf_data_stored.get("aviz_number", ""))
            parsed.setdefault("cnp", pdf_data_stored.get("cnp", ""))
            parsed.setdefault("work_permit_number", pdf_data_stored.get("work_permit_number", ""))

        parsed_data.append(parsed)
        stats["pdf_parsed"] += 1

        # Colecteaza COR pentru statistici
        if parsed.get("cor_code") and parsed.get("job_function"):
            cor_counter[f"{parsed['cor_code']} - {parsed['job_function']}"] += 1

    print(f"\nRezultat parsare:")
    print(f"  PDF-uri parsate OK:   {stats['pdf_parsed']}")
    print(f"  Erori Gmail API:      {stats['gmail_errors']}")
    print(f"  Erori PDF (skip):     {stats['pdf_errors']}")

    if not parsed_data:
        print("\nNicio data extrasa din PDF-uri!")
        client.close()
        return

    # Statistici extragere
    print(f"\nCampuri extrase din {stats['pdf_parsed']} avize:")
    fields = [
        ("company_name",    "company_name"),
        ("company_county",  "company_county"),
        ("company_reg_commerce", "reg_commerce"),
        ("company_cui",     "CUI"),
        ("aviz_number",     "aviz_number"),
        ("cor_code",        "cor_code"),
        ("job_function",    "job_function"),
        ("candidate_name",  "candidate_name"),
        ("birth_date",      "birth_date"),
        ("birth_country",   "birth_country"),
        ("passport_number", "passport_number"),
    ]
    for key, label in fields:
        cnt = sum(1 for d in parsed_data if d.get(key))
        print(f"  {label:25} {cnt:4}/{stats['pdf_parsed']}")

    # ── PAS 2: Actualizeaza companiile (county + reg_commerce) ──
    print(f"\n{'─'*60}")
    print("PAS 2: Actualizeaza companii (county, reg_commerce)...")
    print(f"{'─'*60}")

    for d in parsed_data:
        if not d.get("company_name") and not d.get("company_cui"):
            continue

        cui = d.get("company_cui", "").strip()
        name_n = norm(d.get("company_name", ""))

        # Gaseste compania in BD
        company = None
        if cui and cui in comp_by_cui:
            company = comp_by_cui[cui]
        elif name_n and name_n in comp_by_name:
            company = comp_by_name[name_n]
        else:
            for k, c in comp_by_name.items():
                if name_n and len(name_n) > 5 and (name_n[:8] in k or k[:8] in name_n):
                    company = c
                    break

        if not company:
            # Nu crea companii noi in acest script — doar actualizeaza
            continue

        d["company_id"] = company.get("id")

        upd = {}
        # Adauga county doar daca nu exista
        if d.get("company_county") and not company.get("county"):
            upd["county"] = d["company_county"]
        # Adauga reg_commerce (salvam in reg_com cum e campul existent)
        if d.get("company_reg_commerce") and not company.get("reg_com") and not company.get("reg_commerce"):
            upd["reg_com"] = d["company_reg_commerce"]
        # Adauga CUI daca lipsea
        if cui and not company.get("cui"):
            upd["cui"] = cui

        if upd:
            await db.companies.update_one(
                {"_id": company["_id"]},
                {"$set": upd}
            )
            # Actualizeaza indexul local
            company.update(upd)
            stats["companies_updated"] += 1

    # ── PAS 3: Actualizeaza candidatii (birth_country, birth_date) ──
    print(f"\n{'─'*60}")
    print("PAS 3: Actualizeaza candidati (birth_country, birth_date, passport)...")
    print(f"{'─'*60}")

    for d in parsed_data:
        if not d.get("candidate_name"):
            continue

        raw_name = d["candidate_name"]
        name_n = norm(raw_name)

        # Cauta candidatul
        cand = None
        if name_n in cand_by_norm:
            cand = cand_by_norm[name_n]
        else:
            parts_n = name_n.split()
            if len(parts_n) >= 2:
                for key, c in cand_by_norm.items():
                    key_parts = key.split()
                    matches = sum(1 for p in parts_n if p in key_parts and len(p) > 2)
                    if matches >= 2:
                        cand = c
                        break

        if not cand:
            # CNP fallback
            if d.get("cnp"):
                cand_cnp = await db.candidates.find_one({"cnp": d["cnp"]})
                if cand_cnp:
                    cand = cand_cnp
                    cand_by_norm[name_n] = cand

        if not cand:
            continue

        d["candidate_id"] = cand.get("id")

        upd = {}
        if d.get("birth_country") and not cand.get("birth_country"):
            upd["birth_country"] = d["birth_country"]
        if d.get("birth_date") and not cand.get("birth_date"):
            upd["birth_date"] = d["birth_date"]
        if d.get("passport_number") and not cand.get("passport_number"):
            upd["passport_number"] = d["passport_number"]
        if d.get("cnp") and not cand.get("cnp"):
            upd["cnp"] = d["cnp"]
        if d.get("company_id") and not cand.get("company_id"):
            upd["company_id"] = d["company_id"]

        if upd:
            await db.candidates.update_one(
                {"_id": cand["_id"]},
                {"$set": upd}
            )
            cand.update(upd)
            stats["candidates_updated"] += 1

    # ── PAS 4: Actualizeaza dosarele de imigrare (cor_code, job_function, aviz) ──
    print(f"\n{'─'*60}")
    print("PAS 4: Actualizeaza dosare imigrare (cor_code, job_function, aviz)...")
    print(f"{'─'*60}")

    for d in parsed_data:
        req_nr = d.get("request_number", "").strip()
        cand_id = d.get("candidate_id")

        # Gaseste dosarul
        case = None
        if req_nr and req_nr in case_by_req:
            case = case_by_req[req_nr]
        elif cand_id and cand_id in case_by_cand:
            case = case_by_cand[cand_id]

        if not case:
            # Cauta dupa aviz_number
            if d.get("aviz_number"):
                case = await db.immigration_cases.find_one({"aviz_number": d["aviz_number"]})
            # Sau dupa cnp
            if not case and d.get("cnp"):
                cand_found = await db.candidates.find_one({"cnp": d["cnp"]})
                if cand_found:
                    case = await db.immigration_cases.find_one({"candidate_id": cand_found.get("id")})
                    if case and cand_id is None:
                        d["candidate_id"] = cand_found.get("id")

        if not case:
            continue

        upd: dict = {"updated_at": now}

        if d.get("cor_code"):
            upd["cor_code"] = d["cor_code"]
        if d.get("job_function"):
            upd["job_function"] = d["job_function"]
            # Pastram compatibilitate cu campul job_type existent
            if not case.get("job_type"):
                upd["job_type"] = d["job_function"]
        if d.get("aviz_number") and not case.get("aviz_number"):
            upd["aviz_number"] = d["aviz_number"]
        if d.get("aviz_date") and not case.get("aviz_date"):
            upd["aviz_date"] = d["aviz_date"]
        if d.get("work_permit_number") and not case.get("work_permit_number"):
            upd["work_permit_number"] = d["work_permit_number"]
        if d.get("work_type"):
            upd["work_type"] = d["work_type"]

        # Actualizeaza stage daca dosarul nu e deja la 'aprobat'
        if case.get("status") not in ("aprobat", "finalizat"):
            upd["current_stage"] = 4
            upd["current_stage_name"] = "Permis Munca Aprobat"
            upd["status"] = "aprobat"

        if len(upd) > 1:  # mai mult decat updated_at
            await db.immigration_cases.update_one(
                {"_id": case["_id"]},
                {"$set": upd}
            )
            stats["cases_updated"] += 1

    # ── RAPORT FINAL ─────────────────────────────────────────────────────────
    # Recalculeaza statistici live din BD
    comp_with_county = await db.companies.count_documents({"county": {"$exists": True, "$ne": ""}})
    comp_with_reg    = await db.companies.count_documents({"reg_com": {"$exists": True, "$ne": ""}})
    cand_with_bc     = await db.candidates.count_documents({"birth_country": {"$exists": True, "$ne": ""}})
    cases_with_cor   = await db.immigration_cases.count_documents({"cor_code": {"$exists": True, "$ne": ""}})

    print(f"\n{SEP}")
    print("RAPORT FINAL")
    print(SEP)
    print(f"  PDF-uri parsate cu succes:          {stats['pdf_parsed']}")
    print(f"  Companii actualizate (county/reg):  {stats['companies_updated']}")
    print(f"  Candidati actualizati:              {stats['candidates_updated']}")
    print(f"  Dosare actualizate (cor/func/aviz): {stats['cases_updated']}")
    print()
    print(f"  Companii cu county in BD:           {comp_with_county}")
    print(f"  Companii cu reg_com in BD:          {comp_with_reg}")
    print(f"  Candidati cu birth_country in BD:   {cand_with_bc}")
    print(f"  Dosare cu cor_code in BD:           {cases_with_cor}")

    # Top 10 functii COR
    # Daca nu am reusit sa colectam din PDF, recalculam din BD
    if not cor_counter:
        pipeline = [
            {"$match": {"cor_code": {"$exists": True, "$ne": ""}}},
            {"$group": {"_id": {"cor": "$cor_code", "func": "$job_function"}, "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 10},
        ]
        async for doc in db.immigration_cases.aggregate(pipeline):
            label = f"{doc['_id']['cor']} - {doc['_id'].get('func', '?')}"
            cor_counter[label] = doc["count"]

    if cor_counter:
        print(f"\nTop 10 functii COR (distributie candidati):")
        print(f"  {'Cod COR - Functie':<45} {'Nr. candidati':>12}")
        print(f"  {'─'*45} {'─'*12}")
        for label, cnt in cor_counter.most_common(10):
            print(f"  {label:<45} {cnt:>12}")

    # Exemple avize parsate
    ok_parsed = [d for d in parsed_data if d.get("candidate_name")]
    if ok_parsed:
        print(f"\nExemple avize parsate (primele 5):")
        print(f"  {'Candidat':<30} {'COR':<8} {'Functie':<25} {'Aviz nr.':<12}")
        print(f"  {'─'*30} {'─'*8} {'─'*25} {'─'*12}")
        for d in ok_parsed[:5]:
            print(
                f"  {d.get('candidate_name','?'):<30} "
                f"{d.get('cor_code','?'):<8} "
                f"{d.get('job_function','?'):<25} "
                f"{d.get('aviz_number','?'):<12}"
            )

    client.close()
    print(f"\nSfarsit: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("Gata!")


if __name__ == "__main__":
    asyncio.run(run())
