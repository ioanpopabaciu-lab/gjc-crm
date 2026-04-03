"""
Populare v3 - cu header row corect la rândul 10 din Excel
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

    upd_nat = upd_job = upd_pp = upd_pp_exp = upd_cid = 0

    # ════════════════════════════════════════════════════════
    # PASUL 1: Import din Excel cu header la rândul 10
    # ════════════════════════════════════════════════════════
    print(f"\n{SEP}")
    print("PASUL 1: Import Naționalitate + Ocupație + Pașaport din Excel (header=10)")
    print(SEP)

    excel_path = Path(r"C:\Users\ioanp\OneDrive\Desktop\GJC CRM\backend\data\Baza de date_Ioan Baciu_07 04 2025.xlsx")
    if not excel_path.exists():
        print("[ERR] Fișierul Excel nu există!")
    else:
        xl = pd.ExcelFile(str(excel_path))
        for sheet in xl.sheet_names:
            if sheet.upper() == 'SUMAR':
                continue
            try:
                # Citim fara header mai intai ca sa gasim randul cu header
                df_raw = xl.parse(sheet, header=None)
                header_row = None
                for i, row in df_raw.iterrows():
                    vals = [str(v) for v in row]
                    if any('Ocupat' in v or 'National' in v or 'Pașaport' in v or 'Pasaport' in v for v in vals):
                        header_row = i
                        break

                if header_row is None:
                    # Fallback: row 10
                    header_row = 10

                df = xl.parse(sheet, header=header_row)
                df.columns = [str(c).strip() for c in df.columns]
                col_norm = {norm(c): c for c in df.columns}

                # Găsim coloanele relevante
                nat_col  = col_norm.get('nationalitate') or col_norm.get('cetatenie') or col_norm.get('natinalitate')
                job_col  = col_norm.get('ocupatia') or col_norm.get('ocupatie') or col_norm.get('meserie') or col_norm.get('functie')
                cor_col  = col_norm.get('cor')
                pp_col   = col_norm.get('pasaport') or col_norm.get('nr. pasaport') or col_norm.get('nr pasaport')
                # Passport expiry - coloana dupa pasaport, de obicei unnamed
                name_col   = col_norm.get('nume')
                prenume_col = col_norm.get('prenume')

                # Gaseste coloana passport expiry (prima coloana unnamed dupa pasaport)
                pp_exp_col = None
                if pp_col:
                    pp_idx = list(df.columns).index(pp_col)
                    if pp_idx + 1 < len(df.columns):
                        next_col = df.columns[pp_idx + 1]
                        if 'Unnamed' in next_col or norm(next_col) == '':
                            pp_exp_col = next_col

                if not pp_col and not name_col:
                    print(f"  [SKIP] Sheet '{sheet}' - nu am găsit coloane relevante. Cols: {list(df.columns)[:6]}")
                    continue

                processed = 0
                for _, row in df.iterrows():
                    pp      = safe_s(row.get(pp_col, '')) if pp_col else None
                    nat     = safe_s(row.get(nat_col, '')) if nat_col else None
                    job     = safe_s(row.get(job_col, '')) if job_col else None
                    cor     = safe_s(row.get(cor_col, '')) if cor_col else None
                    pp_exp  = safe_d(row.get(pp_exp_col, '')) if pp_exp_col else None
                    fn      = safe_s(row.get(prenume_col, '')) if prenume_col else None
                    ln      = safe_s(row.get(name_col, '')) if name_col else None

                    if not nat and not job and not pp: continue
                    if not pp and not (fn and ln): continue

                    # Cauta candidatul
                    cand = None
                    if pp:
                        cand = await db.candidates.find_one({"passport_number": pp}, {"_id": 0})
                    if not cand and fn and ln:
                        cand = await db.candidates.find_one(
                            {"$or": [
                                {"first_name": {"$regex": f"^{re.escape(fn)}$", "$options": "i"},
                                 "last_name": {"$regex": f"^{re.escape(ln)}$", "$options": "i"}},
                                {"first_name": {"$regex": f"^{re.escape(ln)}$", "$options": "i"},
                                 "last_name": {"$regex": f"^{re.escape(fn)}$", "$options": "i"}}
                            ]}, {"_id": 0}
                        )

                    if not cand: continue

                    update = {}
                    if nat and not cand.get("nationality"):
                        update["nationality"] = nat.title()
                        upd_nat += 1
                    if job and not cand.get("job_type"):
                        update["job_type"] = job.title()
                        upd_job += 1
                    if pp and not cand.get("passport_number"):
                        update["passport_number"] = pp
                        upd_pp += 1
                    if pp_exp and not cand.get("passport_expiry"):
                        update["passport_expiry"] = pp_exp
                        upd_pp_exp += 1
                    # Update passport even if exists (to fix/refresh)
                    if pp and cand.get("passport_number") != pp:
                        update["passport_number"] = pp
                        upd_pp += 1

                    if update:
                        update["updated_at"] = now
                        await db.candidates.update_one({"id": cand["id"]}, {"$set": update})
                        processed += 1

                if processed > 0:
                    print(f"  Sheet '{sheet}': {processed} candidați actualizați")
            except Exception as e:
                print(f"  [E] Sheet '{sheet}': {e}")

    print(f"\n  Naționalitate actualizat: {upd_nat}")
    print(f"  Job type actualizat:      {upd_job}")
    print(f"  Pașaport actualizat:      {upd_pp}")
    print(f"  Pașaport expiry actualizat: {upd_pp_exp}")

    # ════════════════════════════════════════════════════════
    # PASUL 2: Fix company_id în immigration_cases via candidat
    # ════════════════════════════════════════════════════════
    print(f"\n{SEP}")
    print("PASUL 2: Fix company_id în dosare via candidat")
    print(SEP)

    cases_no_cid = await db.immigration_cases.find(
        {"$or": [{"company_id": None}, {"company_id": ""}, {"company_id": {"$exists": False}}]},
        {"_id": 0, "id": 1, "company_name": 1, "candidate_id": 1, "candidate_name": 1}
    ).to_list(None)
    print(f"Dosare fără company_id: {len(cases_no_cid)}")

    # Build company maps
    all_cos = await db.companies.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(None)
    cos_by_norm = {norm(c["name"]): c["id"] for c in all_cos}

    fixed = 0
    for case in cases_no_cid:
        cid = None
        cname = safe_s(case.get("company_name"))

        # Metoda 1: match pe company_name
        if cname:
            n = norm(cname)
            cid = cos_by_norm.get(n)
            if not cid:
                for cn, c_id in cos_by_norm.items():
                    if cn and n and (cn in n or n in cn) and len(min(cn, n)) > 4:
                        cid = c_id; break

        # Metoda 2: via candidat
        if not cid:
            cand_id = case.get("candidate_id")
            if cand_id:
                cand = await db.candidates.find_one({"id": cand_id}, {"_id": 0, "company_id": 1, "company_name": 1})
                if cand and cand.get("company_id"):
                    cid = cand["company_id"]

        if cid:
            co = next((c for c in all_cos if c["id"] == cid), None)
            co_name = co["name"] if co else ""
            await db.immigration_cases.update_one(
                {"id": case["id"]},
                {"$set": {"company_id": cid, "company_name": co_name, "updated_at": now}}
            )
            fixed += 1
            upd_cid += 1

    print(f"  Dosare fixate: {fixed}")

    # ════════════════════════════════════════════════════════
    # PASUL 3: Merge companii duplicate
    # ════════════════════════════════════════════════════════
    print(f"\n{SEP}")
    print("PASUL 3: Verificare companii duplicate")
    print(SEP)

    all_cos_full = await db.companies.find({}, {"_id": 0}).to_list(None)
    duplicates = {}
    for co in all_cos_full:
        n = norm(co["name"])
        # Simplifica: sterge SRL, SA, etc
        n_simple = re.sub(r'\b(srl|sa|srl\.|s\.r\.l\.|s\.a\.)\b', '', n).strip()
        n_simple = re.sub(r'[&\-]', ' ', n_simple)
        n_simple = re.sub(r'\s+', ' ', n_simple).strip()
        if n_simple not in duplicates:
            duplicates[n_simple] = []
        duplicates[n_simple].append(co)

    merged = 0
    for key, cos in duplicates.items():
        if len(cos) > 1:
            print(f"  Duplicate: {[c['name'] for c in cos]}")
            # Pastreaza primul (mai complet), muta candidatii si dosarele
            keep = cos[0]
            for dup in cos[1:]:
                # Muta candidatii
                r1 = await db.candidates.update_many(
                    {"company_id": dup["id"]},
                    {"$set": {"company_id": keep["id"], "company_name": keep["name"]}}
                )
                # Muta dosarele
                r2 = await db.immigration_cases.update_many(
                    {"company_id": dup["id"]},
                    {"$set": {"company_id": keep["id"], "company_name": keep["name"]}}
                )
                print(f"    Mutat {r1.modified_count} candidați, {r2.modified_count} dosare de la '{dup['name']}' → '{keep['name']}'")
                merged += 1

    print(f"  Companii duplicate procesate: {merged}")

    # ════════════════════════════════════════════════════════
    # STATISTICI FINALE
    # ════════════════════════════════════════════════════════
    print(f"\n{SEP}")
    print("STARE FINALA BAZA DE DATE")
    print(SEP)

    total_c = await db.candidates.count_documents({})
    print(f"Candidați total: {total_c}")
    print(f"  job_type:        {await db.candidates.count_documents({'job_type': {'$nin': [None, '']}})}/{total_c}")
    print(f"  nationality:     {await db.candidates.count_documents({'nationality': {'$nin': [None, '']}})}/{total_c}")
    print(f"  birth_date:      {await db.candidates.count_documents({'birth_date': {'$nin': [None, '']}})}/{total_c}")
    print(f"  birth_country:   {await db.candidates.count_documents({'birth_country': {'$nin': [None, '']}})}/{total_c}")
    print(f"  passport_nr:     {await db.candidates.count_documents({'passport_number': {'$nin': [None, '']}})}/{total_c}")
    print(f"  passport_expiry: {await db.candidates.count_documents({'passport_expiry': {'$nin': [None, '']}})}/{total_c}")
    print(f"  company_id:      {await db.candidates.count_documents({'company_id': {'$nin': [None, '']}})}/{total_c}")
    print(f"  plasat:          {await db.candidates.count_documents({'status': 'plasat'})}")

    total_cases = await db.immigration_cases.count_documents({})
    print(f"\nDosare total: {total_cases}")
    print(f"  cu company_id: {await db.immigration_cases.count_documents({'company_id': {'$nin': [None, '']}})}/{total_cases}")
    print(f"  cu aviz:       {await db.immigration_cases.count_documents({'aviz_number': {'$nin': [None, '']}})}/{total_cases}")

    total_co = await db.companies.count_documents({})
    print(f"\nCompanii total: {total_co}")

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
