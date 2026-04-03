"""
Fixare company_id pentru candidați și dosare fără companie
- Caută candidații fără company_id în Excel per sheet-companie
- Sheet-ul = compania => mapare candidat → companie
"""
import sys, io, re, unicodedata, asyncio
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from pathlib import Path
from datetime import datetime, timezone
import pandas as pd
from motor.motor_asyncio import AsyncIOMotorClient

ATLAS = "mongodb+srv://gjc_admin:GJC2026admin@cluster0.4l9rft3.mongodb.net/gjc_crm?retryWrites=true&w=majority&appName=Cluster0"

def norm(t):
    if not t: return ''
    n = unicodedata.normalize('NFD', str(t))
    n = ''.join(c for c in n if not unicodedata.combining(c))
    return re.sub(r'\s+', ' ', n.lower().strip())

def safe_s(v):
    if v is None: return None
    s = str(v).strip()
    return s if s and s.lower() not in ('nan', 'none', '-', 'n/a', '', '#ref!') else None

async def run():
    client = AsyncIOMotorClient(ATLAS)
    db = client['gjc_crm_db']
    now = datetime.now(timezone.utc).isoformat()

    # ════════════ Build Excel name → company map ════════════
    excel_path = Path(r"C:\Users\ioanp\OneDrive\Desktop\GJC CRM\backend\data\Baza de date_Ioan Baciu_07 04 2025.xlsx")
    xl = pd.ExcelFile(str(excel_path))

    # Sheet name → company name mapping (partial, from sheet label)
    sheet_to_co = {
        '1.Allegria': 'Allegria Turism SRL',
        '2.Araly': 'Araly Exim SRL',
        '3.Babuiesti': 'Babuiesti  SRL',
        '4. Balearia': 'Balearia Food SRL',
        '5.Bonavilla': 'Bonavilla Complex SRL',
        '6.Adorianis': 'Complex Adorianis SRL',
        '7.Cri-Taxi': 'Cri-Taxi',
        '8.DaVinci': 'Da Vinci Construct Proiect SRL',
        '9.Danessa': 'Danessa Impex SRL',
        '10.Euroimpact': 'Euroimpact SRL',
        '11.FNK': 'FNK Garage SRL',
        '12.Giulio': 'Giulio Impex SRL',
        '13.Global': 'Global Clean Magic  SRL',
        '14.Hortifruct': 'Hortifruct SRL',
        '15.Lari': "Lari s legend food SRL",
        '16.Micojor': 'Micojor SRL',
        '17.Mariana': 'Covaliciuc Mariana',
        '18.Only': 'Only Paper SRL',
        '19.Pepiniera': 'Pepiniera Floribunda SRL',
        '20.PFL': 'PFL Prod SRL',
        '21.Premium': 'Premium Martin Construct SRL',
        '22.Rippert': 'Rippert',
        '23.Robi': 'Robi&Adi Construct Srl',
        '24.Semarc': 'Semarc A-Z Construct SRL',
        '25.D&C': 'D&C Fashion',
        '26.Global Tech': 'Global Tehnology',
    }

    # Build: norm_name → company_name (from sheet content)
    name_to_company = {}  # normalized_candidate_name → company_name
    passport_to_company = {}  # passport_number → company_name

    for sheet in xl.sheet_names:
        if sheet.upper() == 'SUMAR':
            continue

        co_name = None
        for sk, cv in sheet_to_co.items():
            if sheet.startswith(sk) or sk in sheet or sheet in sk:
                co_name = cv
                break
        if not co_name:
            # Try to extract from row 1 (Denumire societate row)
            df_raw = xl.parse(sheet, header=None)
            try:
                co_name = safe_s(df_raw.iloc[1, 3])
            except:
                pass
        if not co_name:
            co_name = sheet

        try:
            # Find header row
            df_raw = xl.parse(sheet, header=None)
            header_row = 10  # default
            for i, row in df_raw.iterrows():
                vals = [str(v) for v in row]
                if any('Pasaport' in v or 'Pașaport' in v or 'Ocupat' in v for v in vals):
                    header_row = i
                    break

            df = xl.parse(sheet, header=header_row)
            df.columns = [str(c).strip() for c in df.columns]
            col_norm = {norm(c): c for c in df.columns}

            pp_col  = col_norm.get('pasaport') or col_norm.get('nr. pasaport')
            name_col = col_norm.get('nume')
            prenume_col = col_norm.get('prenume')

            for _, row in df.iterrows():
                pp = safe_s(row.get(pp_col, '')) if pp_col else None
                fn = safe_s(row.get(prenume_col, '')) if prenume_col else None
                ln = safe_s(row.get(name_col, '')) if name_col else None

                if pp:
                    passport_to_company[pp] = co_name
                if ln:
                    # Full name in "Nume" (single field)
                    full_name = norm(ln)
                    if fn:
                        full_name_1 = norm(f"{fn} {ln}")
                        full_name_2 = norm(f"{ln} {fn}")
                        name_to_company[full_name_1] = co_name
                        name_to_company[full_name_2] = co_name
                    else:
                        name_to_company[full_name] = co_name

        except Exception as e:
            print(f"  [E] Sheet {sheet}: {e}")

    print(f"Pașapoarte mapate în Excel: {len(passport_to_company)}")
    print(f"Nume mapate în Excel: {len(name_to_company)}")

    # ════════════ Load companies from DB ════════════
    all_cos = await db.companies.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(None)
    cos_by_norm = {norm(c["name"]): c["id"] for c in all_cos}
    cos_by_id = {c["id"]: c["name"] for c in all_cos}

    def find_company_id(co_name):
        if not co_name: return None, None
        n = norm(co_name)
        cid = cos_by_norm.get(n)
        if not cid:
            for cn, c_id in cos_by_norm.items():
                if cn and n and len(min(cn, n)) > 4 and (cn in n or n in cn):
                    cid = c_id; break
        if cid:
            return cid, cos_by_id.get(cid, co_name)
        return None, None

    # ════════════ Update candidates without company_id ════════════
    cands_no_co = await db.candidates.find(
        {"$or": [{"company_id": None}, {"company_id": ""}, {"company_id": {"$exists": False}}]},
        {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "passport_number": 1}
    ).to_list(None)

    print(f"\nCandidați fără company_id: {len(cands_no_co)}")

    updated_cands = 0
    for cand in cands_no_co:
        co_name = None
        pp = cand.get("passport_number")
        fn = cand.get("first_name", "")
        ln = cand.get("last_name", "")

        # Method 1: by passport
        if pp:
            co_name = passport_to_company.get(pp)

        # Method 2: by name
        if not co_name:
            keys = [
                norm(f"{fn} {ln}"),
                norm(f"{ln} {fn}"),
                norm(f"{ln}"),
                norm(f"{fn}")
            ]
            for key in keys:
                if key and key in name_to_company:
                    co_name = name_to_company[key]
                    break

        if co_name:
            cid, actual_name = find_company_id(co_name)
            if cid:
                await db.candidates.update_one(
                    {"id": cand["id"]},
                    {"$set": {"company_id": cid, "company_name": actual_name, "updated_at": now}}
                )
                updated_cands += 1

    print(f"  Candidați actualizați cu company_id: {updated_cands}")

    # ════════════ Update immigration_cases without company_id ════════════
    cases_no_co = await db.immigration_cases.find(
        {"$or": [{"company_id": None}, {"company_id": ""}, {"company_id": {"$exists": False}}]},
        {"_id": 0, "id": 1, "candidate_id": 1, "candidate_name": 1}
    ).to_list(None)

    print(f"\nDosare fără company_id: {len(cases_no_co)}")

    updated_cases = 0
    for case in cases_no_co:
        co_name = None
        cand_id = case.get("candidate_id")
        cname = case.get("candidate_name", "")

        # Method 1: via candidate (now updated)
        if cand_id:
            cand = await db.candidates.find_one({"id": cand_id}, {"_id": 0, "company_id": 1, "company_name": 1, "passport_number": 1, "first_name": 1, "last_name": 1})
            if cand and cand.get("company_id"):
                await db.immigration_cases.update_one(
                    {"id": case["id"]},
                    {"$set": {"company_id": cand["company_id"], "company_name": cand.get("company_name", ""), "updated_at": now}}
                )
                updated_cases += 1
                continue

            # Method 2: candidate name in Excel
            if cand:
                fn = cand.get("first_name", "")
                ln = cand.get("last_name", "")
                pp = cand.get("passport_number")
                if pp:
                    co_name = passport_to_company.get(pp)
                if not co_name:
                    for key in [norm(f"{fn} {ln}"), norm(f"{ln} {fn}"), norm(ln), norm(fn)]:
                        if key and key in name_to_company:
                            co_name = name_to_company[key]
                            break

        # Method 3: case candidate_name field
        if not co_name and cname:
            parts = cname.split()
            for key in [norm(cname)] + [norm(p) for p in parts if len(p) > 3]:
                if key in name_to_company:
                    co_name = name_to_company[key]
                    break

        if co_name:
            cid, actual_name = find_company_id(co_name)
            if cid:
                await db.immigration_cases.update_one(
                    {"id": case["id"]},
                    {"$set": {"company_id": cid, "company_name": actual_name, "updated_at": now}}
                )
                # Also update candidate
                if cand_id:
                    await db.candidates.update_one(
                        {"id": cand_id, "$or": [{"company_id": None}, {"company_id": ""}]},
                        {"$set": {"company_id": cid, "company_name": actual_name, "updated_at": now}}
                    )
                updated_cases += 1

    print(f"  Dosare actualizate cu company_id: {updated_cases}")

    # ════════════ Final stats ════════════
    total_c = await db.candidates.count_documents({})
    print(f"\nSTARE FINALA:")
    print(f"  company_id: {await db.candidates.count_documents({'company_id': {'$nin': [None, '']}})}/{total_c} candidați")
    total_cases = await db.immigration_cases.count_documents({})
    print(f"  company_id: {await db.immigration_cases.count_documents({'company_id': {'$nin': [None, '']}})}/{total_cases} dosare")

    client.close()
    print("\n✓ Gata!")

asyncio.run(run())
