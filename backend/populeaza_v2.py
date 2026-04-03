"""
Populare v2 - mai precis, adresează problemele specifice:
1. Importă Ocupația + Naționalitate din Excel per companie (match pe pașaport sau nume)
2. Propagă job_function din immigration_cases → candidates via candidate_id
3. Fixează company_id în immigration_cases via name match
4. Salvează reg_commerce din re_extract_pdf_complet în companies
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
    n = unicodedata.normalize('NFD', str(t))
    n = ''.join(c for c in n if not unicodedata.combining(c))
    return re.sub(r'\s+', ' ', n.lower().strip())

def safe_s(v):
    if v is None: return None
    s = str(v).strip()
    return s if s and s.lower() not in ('nan', 'none', '-', 'n/a', '') else None

def safe_d(v):
    if v is None: return None
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d")
    s = str(v).strip()
    if not s or s.lower() in ('nan', 'none', '-'): return None
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%m/%d/%Y"):
        try: return datetime.strptime(s.split()[0], fmt).strftime("%Y-%m-%d")
        except: pass
    try: return pd.Timestamp(v).strftime("%Y-%m-%d")
    except: return None

async def run():
    client = AsyncIOMotorClient(ATLAS)
    db = client['gjc_crm_db']
    now = datetime.now(timezone.utc).isoformat()

    upd_job = upd_nat = upd_birth = upd_cid_cases = upd_reg = upd_cid_cands = 0

    # ════════════════════════════════════════════════════════
    # PASUL 1: job_function → candidates.job_type via candidate_id
    # ════════════════════════════════════════════════════════
    print(f"\n{SEP}")
    print("PASUL 1: job_function din dosare → job_type la candidați")
    print(SEP)

    # Ia toate dosarele cu job_function
    cases_with_job = await db.immigration_cases.find(
        {"job_function": {"$nin": [None, ""]}},
        {"_id": 0, "candidate_id": 1, "candidate_name": 1, "job_function": 1, "cor_code": 1}
    ).to_list(None)
    print(f"Dosare cu job_function: {len(cases_with_job)}")

    for case in cases_with_job:
        cid = case.get("candidate_id")
        if not cid: continue
        cand = await db.candidates.find_one({"id": cid}, {"_id": 0, "id": 1, "job_type": 1})
        if cand and not cand.get("job_type"):
            jf = case.get("job_function", "").strip().title()
            await db.candidates.update_one(
                {"id": cid},
                {"$set": {"job_type": jf, "updated_at": now}}
            )
            upd_job += 1

    # Fallback: match pe candidate_name
    all_cases_job = await db.immigration_cases.find(
        {"job_function": {"$nin": [None, ""]}},
        {"_id": 0, "candidate_name": 1, "job_function": 1}
    ).to_list(None)

    all_cands = await db.candidates.find(
        {"job_type": {"$in": [None, ""]}},
        {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "job_type": 1}
    ).to_list(None)

    cand_by_name = {}
    for c in all_cands:
        key = norm(f"{c.get('first_name','')} {c.get('last_name','')}")
        key2 = norm(f"{c.get('last_name','')} {c.get('first_name','')}")
        cand_by_name[key] = c["id"]
        cand_by_name[key2] = c["id"]

    for case in all_cases_job:
        cname = safe_s(case.get("candidate_name"))
        if not cname: continue
        cid = cand_by_name.get(norm(cname))
        if cid:
            jf = case.get("job_function", "").strip().title()
            await db.candidates.update_one(
                {"id": cid, "job_type": {"$in": [None, ""]}},
                {"$set": {"job_type": jf, "updated_at": now}}
            )
            upd_job += 1

    print(f"  job_type actualizat: {upd_job}")

    # ════════════════════════════════════════════════════════
    # PASUL 2: Import din Excel per sheet-companie
    # ════════════════════════════════════════════════════════
    print(f"\n{SEP}")
    print("PASUL 2: Import Ocupație + Naționalitate din Excel")
    print(SEP)

    excel_path = Path(r"C:\Users\ioanp\OneDrive\Desktop\GJC CRM\backend\data\Baza de date_Ioan Baciu_07 04 2025.xlsx")
    if excel_path.exists():
        xl = pd.ExcelFile(str(excel_path))
        for sheet in xl.sheet_names:
            if sheet.upper() == 'SUMAR': continue
            try:
                df = xl.parse(sheet, header=0)
                df.columns = [str(c).strip() for c in df.columns]
                # Normalizează coloanele
                col_norm = {norm(c): c for c in df.columns}

                # Găsește coloana pașaport (poate fi "Pașaport", "Pasaport", "Passport")
                pp_col = col_norm.get('pasaport') or col_norm.get('passport') or col_norm.get('nr. pasaport')
                nat_col = col_norm.get('nationalitate') or col_norm.get('cetatenie')
                job_col = col_norm.get('ocupatia') or col_norm.get('meserie') or col_norm.get('functie')
                name_col = col_norm.get('nume')
                prenume_col = col_norm.get('prenume')

                if not pp_col and not name_col:
                    continue

                processed = 0
                for _, row in df.iterrows():
                    pp = safe_s(row.get(pp_col, '')) if pp_col else None
                    nat = safe_s(row.get(nat_col, '')) if nat_col else None
                    job = safe_s(row.get(job_col, '')) if job_col else None

                    if not nat and not job: continue

                    cand = None
                    if pp:
                        cand = await db.candidates.find_one({"passport_number": pp}, {"_id": 0})
                    if not cand and name_col and prenume_col:
                        fn = safe_s(row.get(prenume_col, ''))
                        ln = safe_s(row.get(name_col, ''))
                        if fn and ln:
                            key = norm(f"{fn} {ln}")
                            key2 = norm(f"{ln} {fn}")
                            cand = await db.candidates.find_one(
                                {"$or": [
                                    {"first_name": {"$regex": fn, "$options": "i"},
                                     "last_name": {"$regex": ln, "$options": "i"}},
                                    {"first_name": {"$regex": ln, "$options": "i"},
                                     "last_name": {"$regex": fn, "$options": "i"}}
                                ]}, {"_id": 0}
                            )

                    if not cand: continue

                    update = {}
                    if nat and not cand.get("nationality"):
                        update["nationality"] = nat
                        upd_nat += 1
                    if job and not cand.get("job_type"):
                        update["job_type"] = job
                        upd_job += 1
                    if update:
                        update["updated_at"] = now
                        await db.candidates.update_one({"id": cand["id"]}, {"$set": update})
                        processed += 1

                if processed > 0:
                    print(f"  Sheet '{sheet}': {processed} candidați actualizați")
            except Exception as e:
                print(f"  [E] Sheet '{sheet}': {e}")

    print(f"  Naționalitate actualizat: {upd_nat}")
    print(f"  Job type total actualizat: {upd_job}")

    # ════════════════════════════════════════════════════════
    # PASUL 3: Fixează company_id în immigration_cases
    # ════════════════════════════════════════════════════════
    print(f"\n{SEP}")
    print("PASUL 3: Fixare company_id în immigration_cases")
    print(SEP)

    all_cos = await db.companies.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(None)
    cos_by_norm = {norm(c["name"]): c["id"] for c in all_cos}

    cases_no_cid = await db.immigration_cases.find(
        {"$or": [{"company_id": None}, {"company_id": ""}, {"company_id": {"$exists": False}}]},
        {"_id": 0, "id": 1, "company_name": 1}
    ).to_list(None)
    print(f"Dosare fără company_id: {len(cases_no_cid)}")

    for case in cases_no_cid:
        cname = safe_s(case.get("company_name"))
        if not cname: continue
        n = norm(cname)
        cid = cos_by_norm.get(n)
        if not cid:
            # partial
            for cn, c_id in cos_by_norm.items():
                if cn in n or n in cn:
                    cid = c_id; break
        if cid:
            await db.immigration_cases.update_one(
                {"id": case["id"]},
                {"$set": {"company_id": cid, "updated_at": now}}
            )
            upd_cid_cases += 1
    print(f"  Dosare fixate: {upd_cid_cases}")

    # ════════════════════════════════════════════════════════
    # PASUL 4: Verifică de ce stats sunt 0 — debug
    # ════════════════════════════════════════════════════════
    print(f"\n{SEP}")
    print("PASUL 4: Verificare stats companii")
    print(SEP)

    # Ia primele 5 companii cu candidați
    top_cos = await db.companies.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(10)
    for co in top_cos[:5]:
        cid = co["id"]
        cnt_cands = await db.candidates.count_documents({"company_id": cid})
        cnt_cases = await db.immigration_cases.count_documents({"company_id": cid})
        cnt_avize = await db.immigration_cases.count_documents({"company_id": cid, "aviz_number": {"$nin": [None, ""]}})
        print(f"  {co['name']}: candidati={cnt_cands}, dosare={cnt_cases}, avize={cnt_avize}")
        if cnt_cands == 0:
            # Verifică dacă există candidați cu company_name dar fără company_id
            by_name = await db.candidates.count_documents({"company_name": {"$regex": co["name"][:10], "$options": "i"}})
            print(f"    -> după company_name: {by_name}")

    # ════════════════════════════════════════════════════════
    # PASUL 5: Sincronizare company_id în candidați din immigration_cases
    # ════════════════════════════════════════════════════════
    print(f"\n{SEP}")
    print("PASUL 5: Sincronizare company_id în candidați")
    print(SEP)

    # Ia toate dosarele care au company_id valid
    cases_with_cid = await db.immigration_cases.find(
        {"company_id": {"$nin": [None, ""]}},
        {"_id": 0, "candidate_id": 1, "company_id": 1, "company_name": 1}
    ).to_list(None)

    updated = 0
    for case in cases_with_cid:
        cand_id = case.get("candidate_id")
        cid = case.get("company_id")
        if not cand_id or not cid: continue
        cand = await db.candidates.find_one({"id": cand_id}, {"_id": 0, "company_id": 1})
        if cand and not cand.get("company_id"):
            await db.candidates.update_one(
                {"id": cand_id},
                {"$set": {"company_id": cid, "company_name": case.get("company_name",""), "updated_at": now}}
            )
            updated += 1
            upd_cid_cands += 1
    print(f"  Candidați cu company_id actualizat: {updated}")

    # ════════════════════════════════════════════════════════
    # STATISTICI FINALE
    # ════════════════════════════════════════════════════════
    print(f"\n{SEP}")
    print("STARE FINALA BAZA DE DATE")
    print(SEP)

    total_c = await db.candidates.count_documents({})
    print(f"Candidați total: {total_c}")
    print(f"  job_type:     {await db.candidates.count_documents({'job_type': {'$nin': [None, '']}})}/{total_c}")
    print(f"  nationality:  {await db.candidates.count_documents({'nationality': {'$nin': [None, '']}})}/{total_c}")
    print(f"  birth_date:   {await db.candidates.count_documents({'birth_date': {'$nin': [None, '']}})}/{total_c}")
    print(f"  birth_cntry:  {await db.candidates.count_documents({'birth_country': {'$nin': [None, '']}})}/{total_c}")
    print(f"  passport_nr:  {await db.candidates.count_documents({'passport_number': {'$nin': [None, '']}})}/{total_c}")
    print(f"  company_id:   {await db.candidates.count_documents({'company_id': {'$nin': [None, '']}})}/{total_c}")
    print(f"  plasat:       {await db.candidates.count_documents({'status': 'plasat'})}")

    # Sample top companie cu candidați
    print(f"\nTop 5 companii cu candidați:")
    all_co = await db.companies.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(None)
    results = []
    for co in all_co:
        cnt = await db.candidates.count_documents({"company_id": co["id"]})
        if cnt > 0:
            results.append((co["name"], cnt))
    for name, cnt in sorted(results, key=lambda x: -x[1])[:5]:
        print(f"  {name}: {cnt}")

    client.close()
    print("\n✓ Gata!")

asyncio.run(run())
