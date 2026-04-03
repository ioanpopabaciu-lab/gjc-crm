"""
Populare completă bază de date CRM din toate sursele disponibile:
1. Leagă company_id în immigration_cases (după company_name)
2. Propagă job_function din immigration_cases → candidates.job_type
3. Propagă birth_date, birth_country, passport_number din immigration_cases → candidates
4. Importă date din Excel (passport_expiry, permit_expiry, nationality, job_type)
5. Actualizează reg_commerce în companies din câmpul salvat de re_extract_pdf_complet.py
"""
import sys, io, re, unicodedata, asyncio
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from pathlib import Path
from datetime import datetime, timezone
import pandas as pd
from motor.motor_asyncio import AsyncIOMotorClient

ATLAS = "mongodb+srv://gjc_admin:GJC2026admin@cluster0.4l9rft3.mongodb.net/gjc_crm?retryWrites=true&w=majority&appName=Cluster0"
SEP = "=" * 70

def norm(t):
    if not t: return ''
    t = unicodedata.normalize('NFD', str(t)).encode('ascii', 'ignore').decode('ascii')
    return re.sub(r'\s+', ' ', t.lower().strip())

def safe_str(v):
    if v is None: return None
    s = str(v).strip()
    return s if s and s.lower() not in ('nan', 'none', '-', 'n/a') else None

def safe_date(v):
    if v is None: return None
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d")
    s = str(v).strip()
    if not s or s.lower() in ('nan', 'none', '-'): return None
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%m/%d/%Y", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(s.split()[0], fmt).strftime("%Y-%m-%d")
        except: pass
    try:
        return pd.Timestamp(v).strftime("%Y-%m-%d")
    except: pass
    return None

async def run():
    client = AsyncIOMotorClient(ATLAS)
    db = client['gjc_crm_db']
    now = datetime.now(timezone.utc).isoformat()

    stats = {
        "cases_company_id_fixed": 0,
        "candidates_job_updated": 0,
        "candidates_birth_updated": 0,
        "candidates_passport_updated": 0,
        "candidates_country_updated": 0,
        "companies_reg_fixed": 0,
        "candidates_excel_updated": 0,
        "candidates_nationality_updated": 0,
        "candidates_permit_updated": 0,
        "candidates_passport_expiry_updated": 0,
    }

    # ═══════════════════════════════════════════════════════
    # PASUL 1: Leagă company_id în immigration_cases
    # ═══════════════════════════════════════════════════════
    print(f"\n{SEP}")
    print("PASUL 1: Legare company_id în immigration_cases")
    print(SEP)

    # Construiește index companii
    all_companies = await db.companies.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(None)
    company_by_norm = {norm(c["name"]): c for c in all_companies}

    # Dosare fără company_id valid
    cases_no_cid = await db.immigration_cases.find(
        {"$or": [{"company_id": None}, {"company_id": ""}, {"company_id": {"$exists": False}}]},
        {"_id": 0, "id": 1, "company_name": 1}
    ).to_list(None)
    print(f"Dosare fără company_id: {len(cases_no_cid)}")

    for case in cases_no_cid:
        cname = case.get("company_name")
        if not cname: continue
        matched = company_by_norm.get(norm(cname))
        if not matched:
            # Partial match
            for cn, co in company_by_norm.items():
                if cn in norm(cname) or norm(cname) in cn:
                    matched = co
                    break
        if matched:
            await db.immigration_cases.update_one(
                {"id": case["id"]},
                {"$set": {"company_id": matched["id"], "updated_at": now}}
            )
            stats["cases_company_id_fixed"] += 1

    print(f"  Dosare fixate: {stats['cases_company_id_fixed']}")

    # Verifică și candidații fără company_id valid dar cu company_name
    cands_no_cid = await db.candidates.find(
        {"company_name": {"$nin": [None, ""]},
         "$or": [{"company_id": None}, {"company_id": ""}, {"company_id": {"$exists": False}}]},
        {"_id": 0, "id": 1, "company_name": 1}
    ).to_list(None)
    print(f"Candidați fără company_id dar cu company_name: {len(cands_no_cid)}")

    fixed_cands = 0
    for cand in cands_no_cid:
        cname = cand.get("company_name")
        if not cname: continue
        matched = company_by_norm.get(norm(cname))
        if not matched:
            for cn, co in company_by_norm.items():
                if cn in norm(cname) or norm(cname) in cn:
                    matched = co
                    break
        if matched:
            await db.candidates.update_one(
                {"id": cand["id"]},
                {"$set": {"company_id": matched["id"], "updated_at": now}}
            )
            fixed_cands += 1
    print(f"  Candidați fixați: {fixed_cands}")

    # ═══════════════════════════════════════════════════════
    # PASUL 2: Propagă date din immigration_cases → candidates
    # ═══════════════════════════════════════════════════════
    print(f"\n{SEP}")
    print("PASUL 2: Propagare date din dosare → candidați")
    print(SEP)

    # Obține toate dosarele cu câmpuri utile
    all_cases = await db.immigration_cases.find({}, {
        "_id": 0, "candidate_id": 1, "job_function": 1, "cor_code": 1,
        "birth_date": 1, "birth_country": 1, "passport_number": 1, "aviz_date": 1
    }).to_list(None)

    for case in all_cases:
        cand_id = case.get("candidate_id")
        if not cand_id: continue

        cand = await db.candidates.find_one({"id": cand_id}, {"_id": 0})
        if not cand: continue

        update = {}

        # job_type din job_function
        jf = safe_str(case.get("job_function"))
        if jf and not cand.get("job_type"):
            # Normalizare funcție
            jf_clean = jf.strip().title()
            update["job_type"] = jf_clean
            stats["candidates_job_updated"] += 1

        # birth_date
        bd = safe_date(case.get("birth_date"))
        if bd and not cand.get("birth_date"):
            update["birth_date"] = bd
            stats["candidates_birth_updated"] += 1

        # birth_country
        bc = safe_str(case.get("birth_country"))
        if bc and not cand.get("birth_country"):
            update["birth_country"] = bc.upper()
            stats["candidates_country_updated"] += 1

        # passport_number
        pn = safe_str(case.get("passport_number"))
        if pn and not cand.get("passport_number"):
            update["passport_number"] = pn
            stats["candidates_passport_updated"] += 1

        if update:
            update["updated_at"] = now
            await db.candidates.update_one({"id": cand_id}, {"$set": update})

    print(f"  Job type actualizat:     {stats['candidates_job_updated']}")
    print(f"  Data naștere actualizat: {stats['candidates_birth_updated']}")
    print(f"  Țara naștere actualizat: {stats['candidates_country_updated']}")
    print(f"  Nr. pașaport actualizat: {stats['candidates_passport_updated']}")

    # ═══════════════════════════════════════════════════════
    # PASUL 3: Import date din Excel
    # ═══════════════════════════════════════════════════════
    print(f"\n{SEP}")
    print("PASUL 3: Import date din Excel")
    print(SEP)

    excel_files = [
        Path(r"C:\Users\ioanp\OneDrive\Desktop\GJC CRM\backend\data\baza_date_feb2026.xlsx"),
        Path(r"C:\Users\ioanp\OneDrive\Desktop\GJC CRM\backend\data\Baza de date_Ioan Baciu_07 04 2025.xlsx"),
        Path(r"C:\Users\ioanp\OneDrive\Desktop\GJC CRM\backend\data\baza_date_apr2025.xlsx"),
    ]

    for excel_path in excel_files:
        if not excel_path.exists():
            print(f"  [!] Nu există: {excel_path.name}")
            continue
        print(f"\n  Citesc: {excel_path.name}")
        try:
            xl = pd.ExcelFile(str(excel_path))
            for sheet_name in xl.sheet_names:
                df_raw = xl.parse(sheet_name, header=None)
                # Găsește rândul cu header (caută "Nume" sau "Pasaport")
                header_row = None
                for i in range(min(15, len(df_raw))):
                    row_str = " ".join([str(v).lower() for v in df_raw.iloc[i].values if str(v) != 'nan'])
                    if any(k in row_str for k in ['nume', 'pasaport', 'passport', 'name']):
                        header_row = i
                        break
                if header_row is None:
                    print(f"    [!] Nu am găsit header în sheet '{sheet_name}'")
                    continue

                df = xl.parse(sheet_name, header=header_row)
                df.columns = [str(c).strip() for c in df.columns]
                print(f"    Sheet '{sheet_name}': {len(df)} rânduri, coloane: {list(df.columns[:8])}")

                # Identifică coloanele relevante (flexibil)
                col_map = {}
                for col in df.columns:
                    c_low = col.lower()
                    if 'pasaport' in c_low or 'passport' in c_low:
                        if 'expir' in c_low or 'valabilit' in c_low:
                            col_map.setdefault('passport_expiry', col)
                        elif 'nr' in c_low or col_map.get('passport_number') is None:
                            col_map.setdefault('passport_number', col)
                    if 'permis' in c_low or 'rezidenta' in c_low or 'rezidență' in c_low or 'sedere' in c_low:
                        if 'expir' in c_low or 'data' in c_low:
                            col_map.setdefault('permit_expiry', col)
                    if ('national' in c_low or 'cetatenie' in c_low or 'cetățenie' in c_low):
                        col_map.setdefault('nationality', col)
                    if ('ocupat' in c_low or 'meseri' in c_low or 'functie' in c_low or 'functia' in c_low or 'job' in c_low):
                        col_map.setdefault('job_type', col)
                    if 'prenume' in c_low:
                        col_map.setdefault('first_name', col)
                    if c_low in ('nume', 'name') or ('nume' in c_low and 'angajat' not in c_low):
                        col_map.setdefault('last_name', col)
                    if 'nastere' in c_low or 'naștere' in c_low or 'birth' in c_low:
                        if 'data' in c_low or 'date' in c_low:
                            col_map.setdefault('birth_date', col)

                print(f"    Coloane identificate: {col_map}")

                for _, row in df.iterrows():
                    # Identifică candidatul după pașaport
                    pn = safe_str(row.get(col_map.get('passport_number', '___')))
                    if not pn: continue

                    cand = await db.candidates.find_one({"passport_number": pn}, {"_id": 0})
                    if not cand: continue

                    update = {}

                    pe = safe_date(row.get(col_map.get('passport_expiry', '___')))
                    if pe and not cand.get('passport_expiry'):
                        update['passport_expiry'] = pe
                        stats["candidates_passport_expiry_updated"] += 1

                    permit = safe_date(row.get(col_map.get('permit_expiry', '___')))
                    if permit and not cand.get('permit_expiry'):
                        update['permit_expiry'] = permit
                        stats["candidates_permit_updated"] += 1

                    nat = safe_str(row.get(col_map.get('nationality', '___')))
                    if nat and not cand.get('nationality'):
                        update['nationality'] = nat
                        stats["candidates_nationality_updated"] += 1

                    jt = safe_str(row.get(col_map.get('job_type', '___')))
                    if jt and not cand.get('job_type'):
                        update['job_type'] = jt
                        stats["candidates_excel_updated"] += 1

                    bd = safe_date(row.get(col_map.get('birth_date', '___')))
                    if bd and not cand.get('birth_date'):
                        update['birth_date'] = bd
                        stats["candidates_birth_updated"] += 1

                    if update:
                        update['updated_at'] = now
                        await db.candidates.update_one({"passport_number": pn}, {"$set": update})

        except Exception as e:
            print(f"  [E] Eroare la {excel_path.name}: {e}")

    print(f"  Passport expiry actualizat: {stats['candidates_passport_expiry_updated']}")
    print(f"  Permit expiry actualizat:   {stats['candidates_permit_updated']}")
    print(f"  Nationality actualizat:     {stats['candidates_nationality_updated']}")
    print(f"  Job type (Excel):           {stats['candidates_excel_updated']}")

    # ═══════════════════════════════════════════════════════
    # PASUL 4: Fixează reg_commerce și county în companies
    # ═══════════════════════════════════════════════════════
    print(f"\n{SEP}")
    print("PASUL 4: Fixare county/reg_commerce în companii")
    print(SEP)

    # Verifică câte companii au county setat (din re_extract_pdf_complet.py)
    cu_county = await db.companies.count_documents({"county": {"$nin": [None, ""]}})
    cu_reg = await db.companies.count_documents({"reg_commerce": {"$nin": [None, ""]}})
    print(f"  Companii cu county: {cu_county}")
    print(f"  Companii cu reg_commerce: {cu_reg}")

    # Dacă avem date în immigration_cases, propagăm la companies
    # Dosarele au company_county și company_reg_commerce extrase din PDF
    pipeline = [
        {"$match": {"company_county": {"$nin": [None, ""]}}},
        {"$group": {
            "_id": "$company_id",
            "county": {"$first": "$company_county"},
            "reg_commerce": {"$first": "$company_reg_commerce"},
            "company_name": {"$first": "$company_name"}
        }}
    ]
    cases_with_county = await db.immigration_cases.aggregate(pipeline).to_list(200)
    print(f"  Dosare cu company_county: {len(cases_with_county)}")

    for item in cases_with_county:
        cid = item["_id"]
        if not cid: continue
        update = {}
        county = safe_str(item.get("county"))
        reg = safe_str(item.get("reg_commerce"))
        co = await db.companies.find_one({"id": cid}, {"_id": 0})
        if co:
            if county and not co.get("county"):
                update["county"] = county.strip()
                stats["companies_reg_fixed"] += 1
            if reg and not co.get("reg_commerce"):
                update["reg_commerce"] = reg.strip()
        if update:
            update["updated_at"] = now
            await db.companies.update_one({"id": cid}, {"$set": update})

    # Alternativ - ia county/reg direct din dosarele cu company_name match
    all_cases_county = await db.immigration_cases.find(
        {"company_county": {"$nin": [None, ""]}, "company_name": {"$nin": [None, ""]}},
        {"_id": 0, "company_name": 1, "company_county": 1, "company_reg_commerce": 1}
    ).to_list(None)

    for c in all_cases_county:
        cname = c.get("company_name")
        matched = company_by_norm.get(norm(cname))
        if not matched: continue
        co = await db.companies.find_one({"id": matched["id"]}, {"_id": 0})
        if not co: continue
        update = {}
        county = safe_str(c.get("company_county"))
        reg = safe_str(c.get("company_reg_commerce"))
        if county and not co.get("county"):
            update["county"] = county.strip()
        if reg and not co.get("reg_commerce"):
            update["reg_commerce"] = reg.strip()
        if update:
            await db.companies.update_one({"id": matched["id"]}, {"$set": {**update, "updated_at": now}})

    cu_county_after = await db.companies.count_documents({"county": {"$nin": [None, ""]}})
    cu_reg_after = await db.companies.count_documents({"reg_commerce": {"$nin": [None, ""]}})
    print(f"  Companii cu county după fixare: {cu_county_after}")
    print(f"  Companii cu reg_commerce după fixare: {cu_reg_after}")

    # ═══════════════════════════════════════════════════════
    # STATISTICI FINALE
    # ═══════════════════════════════════════════════════════
    print(f"\n{SEP}")
    print("STATISTICI FINALE BAZA DE DATE")
    print(SEP)

    total_cands = await db.candidates.count_documents({})
    cu_job = await db.candidates.count_documents({"job_type": {"$nin": [None, ""]}})
    cu_birth = await db.candidates.count_documents({"birth_date": {"$nin": [None, ""]}})
    cu_country = await db.candidates.count_documents({"birth_country": {"$nin": [None, ""]}})
    cu_passport = await db.candidates.count_documents({"passport_number": {"$nin": [None, ""]}})
    cu_pp_expiry = await db.candidates.count_documents({"passport_expiry": {"$nin": [None, ""]}})
    cu_permit = await db.candidates.count_documents({"permit_expiry": {"$nin": [None, ""]}})
    cu_nationality = await db.candidates.count_documents({"nationality": {"$nin": [None, ""]}})
    plasati = await db.candidates.count_documents({"status": "plasat"})
    in_procesare = await db.candidates.count_documents({"status": "în procesare"})

    total_companies = await db.companies.count_documents({})
    cu_cui = await db.companies.count_documents({"cui": {"$nin": [None, ""]}})

    total_cases = await db.immigration_cases.count_documents({})
    cu_aviz = await db.immigration_cases.count_documents({"aviz_number": {"$nin": [None, ""]}})
    cu_cor = await db.immigration_cases.count_documents({"cor_code": {"$nin": [None, ""]}})
    cu_appointment = await db.immigration_cases.count_documents({"appointment_date": {"$nin": [None, ""]}})

    print(f"CANDIDAȚI ({total_cands}):")
    print(f"  Plasați:          {plasati}")
    print(f"  În procesare:     {in_procesare}")
    print(f"  Cu job_type:      {cu_job}/{total_cands}")
    print(f"  Cu data naștere:  {cu_birth}/{total_cands}")
    print(f"  Cu țara naștere:  {cu_country}/{total_cands}")
    print(f"  Cu pașaport nr:   {cu_passport}/{total_cands}")
    print(f"  Cu exp. pașaport: {cu_pp_expiry}/{total_cands}")
    print(f"  Cu exp. permis:   {cu_permit}/{total_cands}")
    print(f"  Cu naționalitate: {cu_nationality}/{total_cands}")

    print(f"\nCOMPANII ({total_companies}):")
    print(f"  Cu CUI:           {cu_cui}/{total_companies}")
    print(f"  Cu județ:         {cu_county_after}/{total_companies}")
    print(f"  Cu reg. comerț:   {cu_reg_after}/{total_companies}")

    print(f"\nDOSARE ({total_cases}):")
    print(f"  Cu aviz emis:     {cu_aviz}/{total_cases}")
    print(f"  Cu COR:           {cu_cor}/{total_cases}")
    print(f"  Cu programare:    {cu_appointment}/{total_cases}")

    client.close()
    print("\n✓ Gata!")

asyncio.run(run())
