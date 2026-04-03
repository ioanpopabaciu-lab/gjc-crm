"""
Script complet pentru popularea si repararea datelor in MongoDB Atlas
Rezolva:
1. Repara company_id pentru candidati si immigration_cases (fuzzy match pe company_name)
2. Importa date din Excel: nationalitate, tip job, data expirare permis
3. Actualizeaza job_type pe candidat din job_function al dosarului de imigrare
4. Actualizeaza birth_date si passport_number din immigration_cases catre candidati
Afiseaza statistici finale detaliate
"""

import asyncio
import sys
import re
from pathlib import Path
from datetime import datetime, date
import pandas as pd
from motor.motor_asyncio import AsyncIOMotorClient

sys.stdout.reconfigure(encoding='utf-8')

MONGO_URI = "mongodb+srv://gjc_admin:GJC2026admin@cluster0.4l9rft3.mongodb.net/gjc_crm?retryWrites=true&w=majority&appName=Cluster0"
DB_NAME = "gjc_crm_db"
DATA_DIR = Path(r"C:\Users\ioanp\OneDrive\Desktop\GJC CRM\backend\data")

# Coloane fixe in Excel-urile tabelar (row 10 = header, date de la row 11)
COL_LAST_NAME   = 1
COL_FIRST_NAME  = 2
COL_NATIONALITY = 3
COL_JOB_TYPE    = 4
COL_PASSPORT    = 7
COL_PASSPORT_EXP = 8   # coloana imediat dupa pasaport = data expirare pasaport
COL_PERMIT_EXP  = 36   # "Data expirare" permis rezidenta
HEADER_ROW      = 10
DATA_START_ROW  = 11


# ========== UTILITARE ==========

def normalize_company(name: str) -> str:
    """Normalizeaza numele companiei pentru comparatie."""
    if not name:
        return ""
    s = str(name).lower().strip()
    replacements = {
        '\u0219': 's', '\u015f': 's', '\u021b': 't', '\u0163': 't',
        '\u0103': 'a', '\u00e2': 'a', '\u00ee': 'i',
        '\xe9': 'e', '\xe8': 'e', '\xea': 'e', '\xf3': 'o', '\xf6': 'o',
        '\xfc': 'u', '\xfa': 'u',
    }
    for k, v in replacements.items():
        s = s.replace(k, v)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def fuzzy_match_company(candidate_name: str, companies: list) -> dict | None:
    """Cauta compania in lista dupa fuzzy match pe name."""
    if not candidate_name:
        return None
    cn = normalize_company(candidate_name)
    stop_words = {'srl', 'sa', 'sl', 'srl.', 'sc', 'ra', 'ltd', 'llc', 's.r.l', 'scs', 'srl,'}
    cn_words = [w for w in cn.split() if w not in stop_words and len(w) > 2]

    best_match = None
    best_score = 0.0

    for comp in companies:
        comp_norm = normalize_company(comp.get('name', ''))
        comp_words = [w for w in comp_norm.split() if w not in stop_words and len(w) > 2]

        if not cn_words or not comp_words:
            continue

        common = set(cn_words) & set(comp_words)
        score = len(common) / max(len(cn_words), len(comp_words))

        if cn in comp_norm or comp_norm in cn:
            score += 0.5

        if score > best_score and score >= 0.5:
            best_score = score
            best_match = comp

    return best_match


def parse_date_val(val) -> str | None:
    """Converteste diferite formate de date la string ISO YYYY-MM-DD."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.strftime('%Y-%m-%d')
    if isinstance(val, date):
        return val.strftime('%Y-%m-%d')
    s = str(val).strip()
    if s in ('', 'nan', 'None', 'NaT', '#REF!'):
        return None
    for fmt in ['%Y-%m-%d', '%d.%m.%Y', '%d/%m/%Y', '%m/%d/%Y', '%d-%m-%Y']:
        try:
            return datetime.strptime(s[:10], fmt).strftime('%Y-%m-%d')
        except ValueError:
            continue
    return None


def clean_str(val) -> str:
    """Curata un string, returneaza '' daca e nan/None."""
    if val is None:
        return ''
    s = str(val).strip()
    if s.lower() in ('nan', 'none', 'nat', '#ref!', ''):
        return ''
    return s


def normalize_passport(val) -> str | None:
    """Normalizeaza numarul de pasaport."""
    if val is None:
        return None
    s = clean_str(val).upper()
    if not s or len(s) < 5:
        return None
    # Elimina caractere ciudate
    s = re.sub(r'[^A-Z0-9]', '', s)
    if len(s) < 5:
        return None
    return s


# ========== CITIRE DATE DIN EXCEL ==========

def load_excel_data() -> dict:
    """
    Incarca datele din Excel-urile tabelar (cu structura fixa).
    Returneaza dict: {passport_number: {nationality, job_type, permit_expiry, first_name, last_name}}
    """
    excel_data = {}

    # Fisierele cu structura tabelara fixa (header la row 10)
    tabular_files = [
        DATA_DIR / "baza_date_apr2025.xlsx",
        DATA_DIR / "Baza de date_Ioan Baciu_07 04 2025.xlsx",
    ]

    for fpath in tabular_files:
        if not fpath.exists():
            print(f"  [SKIP] Fisier negasit: {fpath.name}")
            continue
        print(f"\n  Procesez: {fpath.name}")
        try:
            xl = pd.ExcelFile(str(fpath))
            total_file = 0
            for sheet in xl.sheet_names:
                if 'SUMAR' in sheet.upper():
                    continue
                try:
                    df = xl.parse(sheet, header=None)
                    if df.shape[0] <= DATA_START_ROW:
                        continue

                    rows_processed = 0
                    for i in range(DATA_START_ROW, len(df)):
                        row = df.iloc[i]
                        ncols = len(row)

                        # Pasaport
                        raw_passport = row.iloc[COL_PASSPORT] if COL_PASSPORT < ncols else None
                        passport = normalize_passport(raw_passport)
                        if not passport:
                            continue

                        # Nationalitate
                        nationality = clean_str(row.iloc[COL_NATIONALITY] if COL_NATIONALITY < ncols else None)
                        # Job type
                        job_type = clean_str(row.iloc[COL_JOB_TYPE] if COL_JOB_TYPE < ncols else None)
                        # Data expirare pasaport
                        passport_expiry = parse_date_val(row.iloc[COL_PASSPORT_EXP] if COL_PASSPORT_EXP < ncols else None)
                        # Data expirare permis rezidenta
                        permit_expiry = parse_date_val(row.iloc[COL_PERMIT_EXP] if COL_PERMIT_EXP < ncols else None)
                        # Nume / Prenume
                        last_name = clean_str(row.iloc[COL_LAST_NAME] if COL_LAST_NAME < ncols else None)
                        first_name = clean_str(row.iloc[COL_FIRST_NAME] if COL_FIRST_NAME < ncols else None)

                        entry = {
                            'last_name': last_name,
                            'first_name': first_name,
                            'nationality': nationality,
                            'job_type': job_type,
                            'passport_expiry': passport_expiry,
                            'permit_expiry': permit_expiry,
                            'source': fpath.name + '/' + sheet,
                        }

                        if passport not in excel_data:
                            excel_data[passport] = entry
                        else:
                            # Actualizeaza numai campurile goale
                            ex = excel_data[passport]
                            for k in ['nationality', 'job_type', 'permit_expiry', 'passport_expiry', 'last_name', 'first_name']:
                                if not ex.get(k) and entry.get(k):
                                    ex[k] = entry[k]

                        rows_processed += 1

                    total_file += rows_processed
                    if rows_processed > 0:
                        print(f"    Sheet '{sheet}': {rows_processed} angajati")
                except Exception as e:
                    print(f"    [ERR] Sheet '{sheet}': {e}")

            print(f"  Total {fpath.name}: {total_file} angajati procesati")

        except Exception as e:
            print(f"  [ERR] {fpath.name}: {e}")

    print(f"\n  Total intrari unice in Excel (indexate pe pasaport): {len(excel_data)}")
    return excel_data


# ========== MAIN ==========

async def main():
    print("=" * 70)
    print("SCRIPT POPULARE DATE - GJC CRM")
    print(f"Data: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)

    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DB_NAME]

    # ---- STATISTICI INITIALE ----
    print("\n[1] STATISTICI INITIALE")
    total_cand = await db.candidates.count_documents({})
    cu_company_id_i = await db.candidates.count_documents({'company_id': {'$nin': [None, '']}})
    cu_birth_i = await db.candidates.count_documents({'birth_date': {'$nin': [None, '']}})
    cu_passport_i = await db.candidates.count_documents({'passport_number': {'$nin': [None, '']}})
    cu_nationality_i = await db.candidates.count_documents({'nationality': {'$nin': [None, '']}})
    cu_job_type_i = await db.candidates.count_documents({'job_type': {'$nin': [None, '']}})
    cu_permit_i = await db.candidates.count_documents({'permit_expiry': {'$nin': [None, '']}})
    total_cases = await db.immigration_cases.count_documents({})

    print(f"  Candidati total:          {total_cand}")
    print(f"  Cu company_id:            {cu_company_id_i}/{total_cand}")
    print(f"  Cu birth_date:            {cu_birth_i}/{total_cand}")
    print(f"  Cu passport_number:       {cu_passport_i}/{total_cand}")
    print(f"  Cu nationality:           {cu_nationality_i}/{total_cand}")
    print(f"  Cu job_type:              {cu_job_type_i}/{total_cand}")
    print(f"  Cu permit_expiry:         {cu_permit_i}/{total_cand}")
    print(f"  Immigration cases total:  {total_cases}")

    # ---- STEP 1: VERIFICA SI REPARA COMPANY_ID ----
    print("\n[2] REPARARE COMPANY_ID")

    all_companies = await db.companies.find({}, {'_id': 0, 'id': 1, 'name': 1}).to_list(None)
    company_id_set = {c['id'] for c in all_companies}
    print(f"  Companii in DB: {len(all_companies)}")

    stats_company = {'candidates': 0, 'cases': 0, 'not_found_cand': 0, 'not_found_case': 0}

    # Candidati cu company_id invalid (nu exista in companies)
    all_cands_with_cname = await db.candidates.find(
        {'company_name': {'$nin': [None, '']}},
        {'_id': 1, 'id': 1, 'company_id': 1, 'company_name': 1, 'first_name': 1, 'last_name': 1}
    ).to_list(None)

    for cand in all_cands_with_cname:
        existing_cid = cand.get('company_id', '')
        if existing_cid and existing_cid in company_id_set:
            continue  # Deja valid

        match = fuzzy_match_company(cand.get('company_name', ''), all_companies)
        if match:
            await db.candidates.update_one(
                {'_id': cand['_id']},
                {'$set': {'company_id': match['id']}}
            )
            stats_company['candidates'] += 1
        else:
            stats_company['not_found_cand'] += 1

    # Immigration cases cu company_id invalid
    all_cases_with_cname = await db.immigration_cases.find(
        {'company_name': {'$nin': [None, '']}},
        {'_id': 1, 'id': 1, 'company_id': 1, 'company_name': 1}
    ).to_list(None)

    for case in all_cases_with_cname:
        existing_cid = case.get('company_id', '')
        if existing_cid and existing_cid in company_id_set:
            continue

        match = fuzzy_match_company(case.get('company_name', ''), all_companies)
        if match:
            await db.immigration_cases.update_one(
                {'_id': case['_id']},
                {'$set': {'company_id': match['id']}}
            )
            stats_company['cases'] += 1
        else:
            stats_company['not_found_case'] += 1

    print(f"  Candidati cu company_id reparat: {stats_company['candidates']}")
    print(f"  Cases cu company_id reparat:     {stats_company['cases']}")
    if stats_company['not_found_cand']:
        print(f"  [WARN] Candidati cu company negasita: {stats_company['not_found_cand']}")
    if stats_company['not_found_case']:
        print(f"  [WARN] Cases cu company negasita:     {stats_company['not_found_case']}")

    # ---- STEP 2: IMPORT DATE DIN EXCEL ----
    print("\n[3] IMPORT DATE DIN EXCEL")
    excel_data = load_excel_data()

    stats_excel = {
        'found': 0, 'not_found': 0,
        'nationality': 0, 'job_type': 0, 'permit_expiry': 0
    }

    # Toti candidatii cu passport_number
    cands_cu_passport = await db.candidates.find(
        {'passport_number': {'$nin': [None, '']}},
        {'_id': 1, 'passport_number': 1, 'nationality': 1, 'job_type': 1, 'permit_expiry': 1}
    ).to_list(None)

    for cand in cands_cu_passport:
        raw_p = cand.get('passport_number', '')
        passport = normalize_passport(raw_p)
        if not passport or passport not in excel_data:
            stats_excel['not_found'] += 1
            continue

        stats_excel['found'] += 1
        ex = excel_data[passport]
        updates = {}

        if not cand.get('nationality') and ex.get('nationality'):
            updates['nationality'] = ex['nationality']
            stats_excel['nationality'] += 1

        if not cand.get('job_type') and ex.get('job_type'):
            updates['job_type'] = ex['job_type']
            stats_excel['job_type'] += 1

        if not cand.get('permit_expiry') and ex.get('permit_expiry'):
            updates['permit_expiry'] = ex['permit_expiry']
            stats_excel['permit_expiry'] += 1

        if updates:
            await db.candidates.update_one({'_id': cand['_id']}, {'$set': updates})

    print(f"  Candidati cu passport gasit in Excel: {stats_excel['found']}")
    print(f"  Candidati cu passport negasit:        {stats_excel['not_found']}")
    print(f"  Nationality actualizate:              {stats_excel['nationality']}")
    print(f"  Job_type actualizate din Excel:       {stats_excel['job_type']}")
    print(f"  Permit_expiry actualizate:            {stats_excel['permit_expiry']}")

    # ---- STEP 3: JOB_TYPE din immigration_cases ----
    print("\n[4] JOB_TYPE din IMMIGRATION CASES")
    stats_job = {'updated': 0}

    # Candidati fara job_type
    cands_fara_job = await db.candidates.find(
        {'job_type': {'$in': [None, '']}},
        {'_id': 1, 'id': 1}
    ).to_list(None)

    cand_id_to_oid = {}
    for c in cands_fara_job:
        cid = c.get('id')
        if cid:
            cand_id_to_oid[str(cid)] = c['_id']

    print(f"  Candidati fara job_type: {len(cand_id_to_oid)}")

    if cand_id_to_oid:
        # Gasim immigration_cases cu job_function sau job_type pentru acesti candidati
        cases_cu_job = await db.immigration_cases.find(
            {
                'candidate_id': {'$in': list(cand_id_to_oid.keys())},
                '$or': [
                    {'job_function': {'$nin': [None, '']}},
                    {'job_type': {'$nin': [None, '']}}
                ]
            },
            {'_id': 0, 'candidate_id': 1, 'job_function': 1, 'job_type': 1}
        ).to_list(None)

        processed = set()
        for case in cases_cu_job:
            cid = str(case.get('candidate_id', ''))
            if cid in processed or cid not in cand_id_to_oid:
                continue

            # Prefer job_function (mai specific), fallback job_type
            job_val = clean_str(case.get('job_function') or case.get('job_type') or '')
            if not job_val:
                continue

            # Formatare titlu (Title Case)
            job_val = job_val.title()

            await db.candidates.update_one(
                {'_id': cand_id_to_oid[cid]},
                {'$set': {'job_type': job_val}}
            )
            processed.add(cid)
            stats_job['updated'] += 1

    print(f"  Job_type actualizate din cases: {stats_job['updated']}")

    # ---- STEP 4: BIRTH_DATE si PASSPORT din immigration_cases ----
    print("\n[5] BIRTH_DATE si PASSPORT din IMMIGRATION CASES")
    stats_from_cases = {'birth_date': 0, 'passport': 0, 'cases_checked': 0}

    # Cauta cases care AU birth_date sau passport_number (pot fi adaugate in viitor)
    cases_cu_date = await db.immigration_cases.find(
        {
            '$or': [
                {'birth_date': {'$nin': [None, '']}},
                {'passport_number': {'$nin': [None, '']}}
            ]
        },
        {'_id': 0, 'candidate_id': 1, 'birth_date': 1, 'passport_number': 1}
    ).to_list(None)

    stats_from_cases['cases_checked'] = len(cases_cu_date)

    for case in cases_cu_date:
        cid = str(case.get('candidate_id', ''))
        if not cid:
            continue

        cand = await db.candidates.find_one(
            {'id': cid},
            {'_id': 1, 'birth_date': 1, 'passport_number': 1}
        )
        if not cand:
            continue

        updates = {}
        if not cand.get('birth_date') and case.get('birth_date'):
            bd = parse_date_val(case['birth_date'])
            if bd:
                updates['birth_date'] = bd
                stats_from_cases['birth_date'] += 1

        if not cand.get('passport_number') and case.get('passport_number'):
            pp = normalize_passport(case['passport_number'])
            if pp:
                updates['passport_number'] = pp
                stats_from_cases['passport'] += 1

        if updates:
            await db.candidates.update_one({'_id': cand['_id']}, {'$set': updates})

    print(f"  Cases cu date (birth/passport): {stats_from_cases['cases_checked']}")
    print(f"  Birth_date actualizate:         {stats_from_cases['birth_date']}")
    print(f"  Passport actualizate:           {stats_from_cases['passport']}")

    # ---- STATISTICI FINALE ----
    print("\n" + "=" * 70)
    print("[6] STATISTICI FINALE")
    print("=" * 70)

    total_cand_f = await db.candidates.count_documents({})
    cu_company_id_f = await db.candidates.count_documents({'company_id': {'$nin': [None, '']}})
    cu_birth_f = await db.candidates.count_documents({'birth_date': {'$nin': [None, '']}})
    cu_passport_f = await db.candidates.count_documents({'passport_number': {'$nin': [None, '']}})
    cu_nationality_f = await db.candidates.count_documents({'nationality': {'$nin': [None, '']}})
    cu_job_type_f = await db.candidates.count_documents({'job_type': {'$nin': [None, '']}})
    cu_permit_f = await db.candidates.count_documents({'permit_expiry': {'$nin': [None, '']}})

    # Valideaza company_id-urile
    all_cids_final = {c['id'] for c in await db.companies.find({}, {'id': 1}).to_list(None)}
    cands_cu_cid_f = await db.candidates.find({'company_id': {'$nin': [None, '']}}, {'company_id': 1}).to_list(None)
    valid_cid_f = sum(1 for c in cands_cu_cid_f if c.get('company_id') in all_cids_final)
    invalid_cid_f = len(cands_cu_cid_f) - valid_cid_f

    print(f"\n  Candidati total:              {total_cand_f}")
    print(f"  company_id setat:             {cu_company_id_f}/{total_cand_f}  (valid={valid_cid_f}, invalid={invalid_cid_f})")
    print(f"  birth_date setat:             {cu_birth_f}/{total_cand_f}")
    print(f"  passport_number setat:        {cu_passport_f}/{total_cand_f}")
    print(f"  nationality setata:           {cu_nationality_f}/{total_cand_f}")
    print(f"  job_type setat:               {cu_job_type_f}/{total_cand_f}")
    print(f"  permit_expiry setat:          {cu_permit_f}/{total_cand_f}")

    print("\n  MODIFICARI REALIZATE IN ACEASTA RULARE:")
    print(f"  + company_id candidati reparate:  {stats_company['candidates']}")
    print(f"  + company_id cases reparate:      {stats_company['cases']}")
    print(f"  + nationality adaugate (Excel):   {stats_excel['nationality']}")
    print(f"  + job_type adaugate (Excel):      {stats_excel['job_type']}")
    print(f"  + job_type adaugate (Cases):      {stats_job['updated']}")
    print(f"  + permit_expiry adaugate (Excel): {stats_excel['permit_expiry']}")
    print(f"  + birth_date adaugate (Cases):    {stats_from_cases['birth_date']}")
    print(f"  + passport adaugate (Cases):      {stats_from_cases['passport']}")

    total_changes = (
        stats_company['candidates'] + stats_company['cases'] +
        stats_excel['nationality'] + stats_excel['job_type'] + stats_job['updated'] +
        stats_excel['permit_expiry'] + stats_from_cases['birth_date'] + stats_from_cases['passport']
    )
    print(f"\n  TOTAL ACTUALIZARI EFECTUATE: {total_changes}")

    # ---- COMPARATIE INAINTE / DUPA ----
    print("\n  COMPARATIE INAINTE vs DUPA:")
    print(f"  {'Camp':<25} {'Inainte':>10} {'Dupa':>10} {'+':<6}")
    fields = [
        ('company_id', cu_company_id_i, cu_company_id_f),
        ('birth_date', cu_birth_i, cu_birth_f),
        ('passport_number', cu_passport_i, cu_passport_f),
        ('nationality', cu_nationality_i, cu_nationality_f),
        ('job_type', cu_job_type_i, cu_job_type_f),
        ('permit_expiry', cu_permit_i, cu_permit_f),
    ]
    for name, before, after in fields:
        diff = after - before
        marker = f"+{diff}" if diff > 0 else str(diff)
        print(f"  {name:<25} {before:>10} {after:>10} {marker:<6}")

    # Avertismente
    print()
    if cu_birth_f == 0:
        print("  [ATENTIE] birth_date lipseste pentru TOTI candidatii.")
        print("  Excel-urile nu contin o coloana pentru data nasterii.")
        print("  Surse alternative: avize PDF, documente pasaport, date manuale.")

    if invalid_cid_f > 0:
        print(f"  [ATENTIE] {invalid_cid_f} candidati au company_id invalid (negasit in companies).")

    client.close()
    print("\n  SCRIPT TERMINAT CU SUCCES.")


if __name__ == "__main__":
    asyncio.run(main())
