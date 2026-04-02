"""
Import v2 - Candidati cu viza plasati si programari .xlsx
- Sheet 1: Muncitori sositi in Romania (Obtinut P.S., In Lucru, Depus IGI, etc.)
- Sheet 2: Muncitori cu programari viitoare (2026)

Mapare status:
  Obtinut P.S.  -> plasat (au permis sedere, lucreaza)
  In Lucru      -> plasat (lucreaza efectiv)
  Obtinut A.M   -> in procesare (au aviz munca, mai trebuie PS)
  Depus (IGI) * -> in procesare
  Pregatit *    -> activ
  Neinceput     -> activ
"""
import sys, io, uuid, re, unicodedata, asyncio
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from pathlib import Path
from datetime import datetime, timezone
import pandas as pd
from motor.motor_asyncio import AsyncIOMotorClient

ATLAS = "mongodb+srv://gjc_admin:GJC2026admin@cluster0.4l9rft3.mongodb.net/gjc_crm?retryWrites=true&w=majority&appName=Cluster0"
EXCEL = Path(__file__).parent / "data" / "Candidati cu viza plasati si programari .xlsx"
SEP = "=" * 70

# Mapare etape imigrare
STAGE_MAP = {
    "plasat":          (8, "Plasat - Lucreaza"),
    "în procesare":    (5, "Depus IGI"),
    "activ":           (3, "Pregatire Documente"),
}

def norm(t):
    if not t: return ''
    t = unicodedata.normalize('NFD', str(t)).encode('ascii', 'ignore').decode('ascii')
    return re.sub(r'\s+', ' ', t.lower().strip())

def map_status(statut: str) -> str:
    if not statut:
        return "activ"
    s = statut.lower().strip()
    # Plasat
    if any(x in s for x in ["obtinut p.s", "in lucru", "lucreaza"]):
        return "plasat"
    # In procesare
    if any(x in s for x in ["obtinut a.m", "depus (igi)", "depus igi", "in procesare"]):
        return "în procesare"
    # Activ
    return "activ"

def map_stage(crm_status: str, statut_raw: str):
    s = (statut_raw or "").lower()
    if "obtinut p.s" in s:
        return 9, "Permis Sedere Obtinut"
    if "in lucru" in s:
        return 9, "Plasat - Lucreaza"
    if "obtinut a.m" in s:
        return 7, "Aviz Munca Obtinut"
    if "depus (igi) p.s" in s:
        return 7, "Depus IGI - Permis Sedere"
    if "depus (igi)" in s or "depus igi" in s:
        return 6, "Depus IGI"
    if "pregatit" in s:
        return 4, "Pregatit Depunere"
    return 3, "Pregatire Documente"

def safe_str(v):
    if v is None: return None
    s = str(v).strip()
    return s if s and s.lower() not in ('nan', 'none', '-') else None

def safe_date(v):
    if v is None: return None
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d")
    s = str(v).strip()
    if not s or s.lower() in ('nan', 'none', '-'): return None
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except: pass
    try:
        return pd.Timestamp(v).strftime("%Y-%m-%d")
    except: pass
    return s

def safe_time(v):
    if v is None: return None
    if isinstance(v, datetime):
        return v.strftime("%H:%M")
    s = str(v).strip()
    return s if s and s.lower() not in ('nan', 'none') else None

def split_name(full_name):
    parts = full_name.strip().split()
    if not parts: return "", ""
    if len(parts) == 1: return "", parts[0]
    return " ".join(parts[1:]), parts[0]

async def find_candidate(db, full_name):
    """Cauta candidat cu match exact sau partial pe nume normalizat."""
    normalized = norm(full_name)
    if not normalized: return None
    all_cands = await db.candidates.find({}, {"_id": 0}).to_list(None)
    # Match exact (first+last sau last+first)
    for c in all_cands:
        n1 = norm(f"{c.get('first_name','')} {c.get('last_name','')}")
        n2 = norm(f"{c.get('last_name','')} {c.get('first_name','')}")
        if normalized in (n1, n2):
            return c
    # Match partial - toate cuvintele din search trebuie sa fie in numele din DB
    search_words = set(normalized.split())
    if len(search_words) < 2: return None
    for c in all_cands:
        db_full = norm(f"{c.get('first_name','')} {c.get('last_name','')}")
        if search_words.issubset(set(db_full.split())):
            return c
    return None

async def find_or_create_company(db, company_name, created_companies):
    if not company_name: return None, None
    company_name = company_name.strip()
    norm_name = norm(company_name)
    all_cos = await db.companies.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(None)
    for c in all_cos:
        if norm(c.get("name", "")) == norm_name:
            return c["id"], c["name"]
    # Creeaza noua
    new_id = str(uuid.uuid4())
    new_co = {
        "id": new_id,
        "name": company_name,
        "status": "activ",
        "industry": "Constructii/Servicii",
        "notes": "Creat automat la import plasati",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.companies.insert_one(new_co)
    created_companies.append(company_name)
    return new_id, company_name

async def run():
    print(SEP)
    print("IMPORT v2 - CANDIDATI PLASATI SI PROGRAMARI")
    print(SEP)

    client = AsyncIOMotorClient(ATLAS)
    db = client['gjc_crm_db']

    # Citeste Excel
    xl = pd.ExcelFile(str(EXCEL))
    df1 = xl.parse(xl.sheet_names[0])
    df2 = xl.parse(xl.sheet_names[1])
    print(f"Sheet 1 '{xl.sheet_names[0]}': {len(df1)} randuri")
    print(f"Sheet 2 '{xl.sheet_names[1]}': {len(df2)} randuri")

    stats = {
        "s1_actualizati": 0, "s1_noi": 0,
        "s2_actualizati": 0, "s2_noi": 0,
        "dosare_actualizate": 0, "dosare_create": 0,
        "companii_create": [],
        "erori": 0
    }
    created_companies = []
    now_iso = datetime.now(timezone.utc).isoformat()
    today = datetime.now().strftime("%Y-%m-%d")

    # ═══════════════════════════════════════════════════════
    # SHEET 1 - Muncitori ajunsi in Romania
    # ═══════════════════════════════════════════════════════
    print(f"\n{SEP}")
    print("SHEET 1: Muncitori ajunsi in Romania")
    print(SEP)

    df1_valid = df1[df1["Nume Angajat"].notna() & (df1["Nume Angajat"].astype(str).str.strip() != "")].copy()
    print(f"Randuri valide: {len(df1_valid)}")
    print()

    for _, row in df1_valid.iterrows():
        full_name = safe_str(row.get("Nume Angajat"))
        if not full_name: continue

        statut       = safe_str(row.get("Statut")) or "Neinceput"
        data_prog    = safe_date(row.get("Data progrmare "))
        ora_prog     = safe_time(row.get("Ora programare"))
        ang_initial  = safe_str(row.get("Angajator Initial"))
        ang_final    = safe_str(row.get("Angajator Final"))

        crm_status = map_status(statut)
        stage_num, stage_name = map_stage(crm_status, statut)

        # Companie finala (plasament) sau initiala daca nu are finala
        comp_name_ref = ang_final or ang_initial
        company_id, company_name = await find_or_create_company(db, comp_name_ref, created_companies)

        # Note
        notes_parts = [f"Statut Excel: {statut}"]
        if ang_initial and ang_initial != ang_final:
            notes_parts.append(f"Angajator aviz initial: {ang_initial}")
        if ang_final:
            notes_parts.append(f"Angajator final (plasament): {ang_final}")
        if data_prog:
            notes_parts.append(f"Data programare aviz: {data_prog}")
        if ora_prog:
            notes_parts.append(f"Ora programare: {ora_prog}")
        note_line = f"[Import {today}] " + " | ".join(notes_parts)

        try:
            existing = await find_candidate(db, full_name)

            if existing:
                candidate_id = existing["id"]
                upd = {
                    "status": crm_status,
                    "updated_at": now_iso,
                }
                # Seteaza compania finala daca e plasare
                if company_id and crm_status == "plasat":
                    upd["company_id"] = company_id
                    upd["company_name"] = company_name
                elif company_id and not existing.get("company_id"):
                    upd["company_id"] = company_id
                    upd["company_name"] = company_name

                # Adauga note
                old_notes = existing.get("notes") or ""
                upd["notes"] = f"{old_notes}\n{note_line}".strip()

                await db.candidates.update_one({"id": candidate_id}, {"$set": upd})
                print(f"  [U] {full_name} -> status={crm_status} | {statut}")
                stats["s1_actualizati"] += 1
            else:
                first_name, last_name = split_name(full_name)
                candidate_id = str(uuid.uuid4())
                new_cand = {
                    "id": candidate_id,
                    "first_name": first_name,
                    "last_name": last_name,
                    "status": crm_status,
                    "company_id": company_id,
                    "company_name": company_name,
                    "notes": note_line,
                    "created_at": now_iso,
                    "updated_at": now_iso,
                }
                await db.candidates.insert_one(new_cand)
                print(f"  [+] NOU: {full_name} -> status={crm_status} | {statut}")
                stats["s1_noi"] += 1

            # Actualizeaza dosarul de imigrare
            imm = await db.immigration_cases.find_one({"candidate_id": candidate_id}, {"_id": 0})
            if imm:
                imm_upd = {
                    "updated_at": now_iso,
                    "current_stage": stage_num,
                    "current_stage_name": stage_name,
                }
                if crm_status == "plasat":
                    imm_upd["status"] = "aprobat"
                elif crm_status == "în procesare":
                    imm_upd["status"] = "activ"
                if company_id and crm_status == "plasat":
                    imm_upd["company_id"] = company_id
                    imm_upd["company_name"] = company_name
                if data_prog:
                    imm_upd["appointment_date"] = data_prog
                if ora_prog:
                    imm_upd["appointment_time"] = ora_prog
                await db.immigration_cases.update_one({"candidate_id": candidate_id}, {"$set": imm_upd})
                stats["dosare_actualizate"] += 1

        except Exception as e:
            print(f"  [E] EROARE {full_name}: {e}")
            stats["erori"] += 1

    # ═══════════════════════════════════════════════════════
    # SHEET 2 - Muncitori programati (viitor 2026)
    # ═══════════════════════════════════════════════════════
    print(f"\n{SEP}")
    print("SHEET 2: Muncitori programati (2026)")
    print(SEP)

    df2_valid = df2[df2["Nume Angajat"].notna() & (df2["Nume Angajat"].astype(str).str.strip() != "")].copy()
    print(f"Randuri valide: {len(df2_valid)}")
    print()

    for _, row in df2_valid.iterrows():
        full_name = safe_str(row.get("Nume Angajat"))
        if not full_name: continue

        statut      = safe_str(row.get("Statut")) or "Neinceput"
        locatie     = safe_str(row.get("Locatie Programare"))
        ora_prog    = safe_time(row.get("Ora programare"))
        data_prog   = safe_date(row.get("Data progrmare "))
        ang_initial = safe_str(row.get("Angajator Initial"))
        ang_final   = safe_str(row.get("Angajator Final"))
        cont_prog   = safe_str(row.get("Cont Programare"))

        crm_status = "activ"  # toti sunt Neinceput = activ, cu programare viitoare

        comp_name_ref = ang_final or ang_initial
        company_id, company_name = await find_or_create_company(db, comp_name_ref, created_companies)

        notes_parts = []
        if data_prog:
            notes_parts.append(f"Programare ambasada: {data_prog}")
        if ora_prog:
            notes_parts.append(f"Ora: {ora_prog}")
        if locatie:
            notes_parts.append(f"Locatie: {locatie}")
        if cont_prog:
            notes_parts.append(f"Cont programare: {cont_prog}")
        if ang_initial:
            notes_parts.append(f"Angajator aviz: {ang_initial}")
        note_line = f"[Import {today}] " + " | ".join(notes_parts)

        try:
            existing = await find_candidate(db, full_name)

            if existing:
                candidate_id = existing["id"]
                upd = {"updated_at": now_iso}
                if company_id and not existing.get("company_id"):
                    upd["company_id"] = company_id
                    upd["company_name"] = company_name
                old_notes = existing.get("notes") or ""
                upd["notes"] = f"{old_notes}\n{note_line}".strip()
                await db.candidates.update_one({"id": candidate_id}, {"$set": upd})
                print(f"  [U] {full_name} -> programare: {data_prog} @ {locatie}")
                stats["s2_actualizati"] += 1
            else:
                first_name, last_name = split_name(full_name)
                candidate_id = str(uuid.uuid4())
                new_cand = {
                    "id": candidate_id,
                    "first_name": first_name,
                    "last_name": last_name,
                    "status": crm_status,
                    "company_id": company_id,
                    "company_name": company_name,
                    "notes": note_line,
                    "created_at": now_iso,
                    "updated_at": now_iso,
                }
                await db.candidates.insert_one(new_cand)
                print(f"  [+] NOU: {full_name} | {data_prog} @ {locatie}")
                stats["s2_noi"] += 1

            # Actualizeaza sau creeaza dosar
            imm = await db.immigration_cases.find_one({"candidate_id": candidate_id}, {"_id": 0})
            if imm:
                imm_upd = {
                    "updated_at": now_iso,
                }
                if data_prog:
                    imm_upd["appointment_date"] = data_prog
                if ora_prog:
                    imm_upd["appointment_time"] = ora_prog
                if locatie:
                    imm_upd["appointment_location"] = locatie
                if company_id and not imm.get("company_id"):
                    imm_upd["company_id"] = company_id
                    imm_upd["company_name"] = company_name
                await db.immigration_cases.update_one({"candidate_id": candidate_id}, {"$set": imm_upd})
                stats["dosare_actualizate"] += 1
            else:
                # Creeaza dosar nou cu programarea din Excel
                new_case = {
                    "id": str(uuid.uuid4()),
                    "candidate_id": candidate_id,
                    "candidate_name": full_name,
                    "company_id": company_id,
                    "company_name": company_name,
                    "case_type": "Permis de munca",
                    "status": "activ",
                    "current_stage": 1,
                    "current_stage_name": "Initierea Dosarului",
                    "appointment_date": data_prog,
                    "appointment_time": ora_prog,
                    "appointment_location": locatie,
                    "assigned_to": cont_prog or "Ioan Baciu",
                    "notes": f"Programare ambasada {data_prog} | Angajator: {ang_initial}",
                    "created_at": now_iso,
                    "updated_at": now_iso,
                }
                await db.immigration_cases.insert_one(new_case)
                stats["dosare_create"] += 1
                print(f"     [+] Dosar nou creat: {data_prog}")

        except Exception as e:
            print(f"  [E] EROARE {full_name}: {e}")
            stats["erori"] += 1

    # ═══════════════════════════════════════════════════════
    # REZULTATE
    # ═══════════════════════════════════════════════════════
    print(f"\n{SEP}")
    print("REZULTATE FINALE")
    print(SEP)
    print(f"SHEET 1 - Muncitori ajunsi:")
    print(f"  Actualizati:  {stats['s1_actualizati']}")
    print(f"  Noi creati:   {stats['s1_noi']}")
    print(f"SHEET 2 - Programari viitoare:")
    print(f"  Actualizati:  {stats['s2_actualizati']}")
    print(f"  Noi creati:   {stats['s2_noi']}")
    print(f"Dosare actualizate: {stats['dosare_actualizate']}")
    print(f"Dosare create:      {stats['dosare_create']}")
    print(f"Companii create:    {len(created_companies)}")
    if created_companies:
        for c in created_companies:
            print(f"  - {c}")
    print(f"Erori:              {stats['erori']}")

    # Statistici finale DB
    total_cands = await db.candidates.count_documents({})
    plasati = await db.candidates.count_documents({"status": "plasat"})
    in_procesare = await db.candidates.count_documents({"status": "în procesare"})
    activi = await db.candidates.count_documents({"status": "activ"})
    total_cases = await db.immigration_cases.count_documents({})
    cu_programare = await db.immigration_cases.count_documents({
        "appointment_date": {"$nin": [None, "", "N/A"]}
    })
    aprobate = await db.immigration_cases.count_documents({"status": "aprobat"})

    print(f"\n{SEP}")
    print("STARE FINALA BAZA DE DATE")
    print(SEP)
    print(f"  Total candidati:     {total_cands}")
    print(f"    Plasati:           {plasati}")
    print(f"    In procesare:      {in_procesare}")
    print(f"    Activi:            {activi}")
    print(f"  Total dosare:        {total_cases}")
    print(f"    Aprobate:          {aprobate}")
    print(f"    Cu programare:     {cu_programare}")

    client.close()
    print("\nGata!")

asyncio.run(run())
