"""
Import direct Excel -> MongoDB Atlas pentru GJC CRM
"""
import sys
import os
import asyncio
import pandas as pd
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
import uuid
import shutil

# Atlas connection
ATLAS_URL = "mongodb+srv://gjc_admin:GJC2026admin@cluster0.4l9rft3.mongodb.net/gjc_crm?retryWrites=true&w=majority&appName=Cluster0"
DB_NAME = "gjc_crm_db"

client = AsyncIOMotorClient(ATLAS_URL)
db = client[DB_NAME]

IMMIGRATION_STAGES = [
    "Recrutat", "Documente Pregatite", "Permis Munca Depus",
    "Permis Munca Aprobat", "Viza Depusa", "Viza Aprobata",
    "Sosit Romania", "Permis Sedere"
]

STATUS_MAPPING = {
    'depus (igi)': 'Permis Munca Depus',
    'in lucru': 'Documente Pregatite',
    'neinceput': 'Recrutat',
    'aprobat': 'Permis Munca Aprobat',
    'viza depusa': 'Viza Depusa',
    'viza aprobata': 'Viza Aprobata',
    'sosit': 'Sosit Romania',
    'finalizat': 'Permis Sedere'
}

def is_valid_candidate_row(row):
    last_name = str(row.get('last_name', '')).strip().lower()
    first_name = str(row.get('first_name', '')).strip().lower()
    invalid_keywords = [
        'nume', 'prenume', 'nationalitate', 'certificat', 'emis la',
        'expirat', 'ocupatia', 'pasaport', 'nr. crt', 'nr.crt', 'anaf', 'cazier'
    ]
    for keyword in invalid_keywords:
        if keyword in last_name or keyword in first_name:
            return False
    if not last_name or last_name in ['nan', '', 'none']:
        return False
    return True

def normalize_nationality(nat):
    if not nat or str(nat).lower() in ['nan', '', 'none']:
        return 'Necunoscut'
    nat = str(nat).strip()
    mapping = {
        'nepal': 'Nepal', 'nepali': 'Nepal',
        'india': 'India', 'indian': 'India',
        'filipine': 'Filipine', 'philippines': 'Filipine', 'filipina': 'Filipine',
        'nigeria': 'Nigeria', 'nigerian': 'Nigeria',
        'sri lanka': 'Sri Lanka', 'srilanka': 'Sri Lanka',
        'bangladesh': 'Bangladesh', 'pakistan': 'Pakistan', 'vietnam': 'Vietnam'
    }
    return mapping.get(nat.lower(), nat.title())

def normalize_company_name(name):
    if not name:
        return None
    name = str(name).strip()
    name_lower = name.lower()
    company_mapping = {
        'da vinci construct proiect srl': 'Da Vinci Construct Proiect SRL',
        'da vinci construct&proiect srl': 'Da Vinci Construct Proiect SRL',
        'allegria turism srl': 'Allegria Turism SRL',
        'araly exim srl': 'Araly Exim SRL',
        'babuiesti srl': 'Babuiesti SRL',
        'balearia food srl': 'Balearia Food SRL',
        'bonavilla complex srl': 'Bonavilla Complex SRL',
        'complex adorianis srl': 'Complex Adorianis SRL',
        'danessa impex srl': 'Danessa Impex SRL',
        'euroimpact srl': 'Euroimpact SRL',
        'fnk garage srl': 'FNK Garage SRL',
        'giulio impex srl': 'Giulio Impex SRL',
        'global clean magic srl': 'Global Clean Magic SRL',
        'hortifruct srl': 'Hortifruct SRL',
        'lider international srl': 'Lider International SRL',
        'lider international srl ': 'Lider International SRL',
        'novarom tour felix srl': 'Novarom Tour Felix SRL',
        'only build residence srl': 'Only Build Residence SRL',
        'pepiniera takacs csaba ii': 'Pepiniera Takacs Csaba II',
        'pfl facility services srl': 'PFL Facility Services SRL',
        'premium martin construct srl': 'Premium Martin Construct SRL',
        'pro smart cleaning srl': 'Pro Smart Cleaning SRL',
        'repede pleasure srl': 'Repede Pleasure SRL',
        'semarc a-z construct srl': 'Semarc A-Z Construct SRL',
        'luca veterinaru srl': 'Luca Veterinaru SRL',
    }
    if name_lower in company_mapping:
        return company_mapping[name_lower]
    for pattern, normalized in company_mapping.items():
        if pattern in name_lower:
            return normalized
    return name.strip()

def parse_excel_files():
    companies_dict = {}
    candidates_list = []

    # Fisier 1 - Apr 2025
    f1 = 'data/Baza de date_Ioan Baciu_07 04 2025.xlsx'
    if not os.path.exists(f1):
        f1 = 'data/baza_date_apr2025.xlsx'

    print(f"Procesare fisier: {f1}")
    xl_old = pd.ExcelFile(f1)
    df_sumar = pd.read_excel(xl_old, sheet_name='SUMAR', header=None)
    company_list_sumar = []
    for idx in range(4, 30):
        if df_sumar.shape[0] > idx and pd.notna(df_sumar.iloc[idx, 1]):
            company_list_sumar.append(str(df_sumar.iloc[idx, 1]).strip())

    company_sheets = [s for s in xl_old.sheet_names if s != 'SUMAR']
    for sheet_idx, sheet in enumerate(company_sheets):
        df = pd.read_excel(xl_old, sheet_name=sheet, header=None)
        if sheet_idx < len(company_list_sumar):
            company_name = company_list_sumar[sheet_idx]
        else:
            if df.shape[0] > 1 and df.shape[1] > 1 and pd.notna(df.iloc[1, 1]):
                company_name = str(df.iloc[1, 1]).strip()
            else:
                company_name = sheet
        company_name = normalize_company_name(company_name.strip())
        if company_name and company_name not in companies_dict:
            companies_dict[company_name] = {'name': company_name, 'cui': None, 'city': None, 'industry': None, 'status': 'activ'}

        for idx in range(11, df.shape[0]):
            row = df.iloc[idx]
            if pd.isna(row[1]) and pd.isna(row[2]):
                continue
            candidate = {
                'last_name': str(row[1]).strip() if pd.notna(row[1]) else '',
                'first_name': str(row[2]).strip() if pd.notna(row[2]) else '',
                'nationality': normalize_nationality(row[3] if pd.notna(row[3]) else None),
                'job_type': str(row[4]).strip() if pd.notna(row[4]) else None,
                'passport_number': str(row[7]).strip() if pd.notna(row[7]) else None,
                'passport_expiry': None,
                'company_name': company_name,
                'status': 'activ',
                'source': 'apr2025'
            }
            if pd.notna(row[8]):
                try:
                    candidate['passport_expiry'] = pd.to_datetime(row[8]).strftime('%Y-%m-%d')
                except:
                    pass
            if is_valid_candidate_row(candidate):
                candidates_list.append(candidate)

    print(f"  - Candidati din fisierul Apr2025: {len(candidates_list)}")

    # Fisier 2 - Feb 2026
    f2 = 'data/Baza de date noua, 18-Feb-2026.xlsx'
    if not os.path.exists(f2):
        f2 = 'data/baza_date_feb2026.xlsx'

    print(f"Procesare fisier: {f2}")
    xl_new = pd.ExcelFile(f2)
    df_new = pd.read_excel(xl_new, sheet_name='Muncitori ajunsi in Romania')
    new_count = 0
    for idx, row in df_new.iterrows():
        if pd.isna(row['Nume Angajat']):
            continue
        full_name = str(row['Nume Angajat']).strip()
        name_parts = full_name.split()
        if len(name_parts) >= 2:
            last_name = name_parts[0]
            first_name = ' '.join(name_parts[1:])
        else:
            last_name = full_name
            first_name = ''
        company_name = None
        if pd.notna(row.get('Angajator Final')) and str(row['Angajator Final']).strip():
            company_name = str(row['Angajator Final']).strip()
        elif pd.notna(row.get('Angajator Initial')) and str(row['Angajator Initial']).strip():
            company_name = str(row['Angajator Initial']).strip()
        company_name_normalized = normalize_company_name(company_name) if company_name else None
        if company_name_normalized and company_name_normalized not in companies_dict:
            companies_dict[company_name_normalized] = {'name': company_name_normalized, 'cui': None, 'city': None, 'industry': None, 'status': 'activ'}
        raw_status = str(row.get('Statut', '')).strip().lower()
        immigration_status = STATUS_MAPPING.get(raw_status, 'Recrutat')
        candidate = {
            'last_name': last_name, 'first_name': first_name,
            'nationality': 'Nepal', 'job_type': None,
            'passport_number': None, 'passport_expiry': None,
            'company_name': company_name_normalized, 'status': 'activ',
            'immigration_status': immigration_status, 'source': 'feb2026'
        }
        if is_valid_candidate_row(candidate):
            candidates_list.append(candidate)
            new_count += 1
    print(f"  - Candidati din fisierul Feb2026: {new_count}")
    return list(companies_dict.values()), candidates_list

async def run_import():
    print("=" * 60)
    print("GJC AI-CRM - Import Date Excel -> MongoDB Atlas")
    print("=" * 60)

    companies, candidates = parse_excel_files()
    print(f"\nTotal gasit:")
    print(f"  - Companii unice: {len(companies)}")
    print(f"  - Candidati: {len(candidates)}")

    print("\nStergere date vechi din Atlas...")
    await db.companies.delete_many({})
    await db.candidates.delete_many({})
    await db.immigration_cases.delete_many({})

    print("Import companii...")
    company_id_map = {}
    for company in companies:
        cid = str(uuid.uuid4())
        await db.companies.insert_one({
            'id': cid, 'name': company['name'], 'cui': None, 'city': None,
            'industry': None, 'contact_person': None, 'phone': None, 'email': None,
            'status': 'activ', 'notes': None, 'created_at': datetime.now(timezone.utc).isoformat()
        })
        company_id_map[company['name']] = cid
    print(f"  - {len(companies)} companii importate")

    print("Import candidati...")
    seen = set()
    inserted = 0
    for c in candidates:
        key = f"{c['last_name']}_{c['first_name']}_{c.get('company_name', '')}".lower()
        if key in seen:
            continue
        seen.add(key)
        cid = str(uuid.uuid4())
        company_id = company_id_map.get(c.get('company_name'))
        await db.candidates.insert_one({
            'id': cid, 'first_name': c['first_name'], 'last_name': c['last_name'],
            'nationality': c['nationality'], 'passport_number': c.get('passport_number'),
            'passport_expiry': c.get('passport_expiry'), 'permit_expiry': None,
            'phone': None, 'email': None, 'job_type': c.get('job_type'),
            'status': c.get('status', 'activ'), 'company_id': company_id,
            'company_name': c.get('company_name'), 'notes': None,
            'created_at': datetime.now(timezone.utc).isoformat()
        })
        inserted += 1
        if c.get('immigration_status'):
            stage_idx = IMMIGRATION_STAGES.index(c['immigration_status']) + 1 if c['immigration_status'] in IMMIGRATION_STAGES else 1
            await db.immigration_cases.insert_one({
                'id': str(uuid.uuid4()), 'candidate_id': cid,
                'candidate_name': f"{c['first_name']} {c['last_name']}",
                'company_id': company_id, 'company_name': c.get('company_name'),
                'case_type': 'Permis de munca', 'status': 'in procesare' if stage_idx < len(IMMIGRATION_STAGES) else 'finalizat',
                'current_stage': stage_idx, 'current_stage_name': c['immigration_status'],
                'submitted_date': datetime.now(timezone.utc).date().isoformat(),
                'deadline': None, 'assigned_to': 'Ioan Baciu',
                'notes': f"Importat din Excel - {c['immigration_status']}",
                'created_at': datetime.now(timezone.utc).isoformat()
            })

    print(f"  - {inserted} candidati importati")

    total_c = await db.companies.count_documents({})
    total_cand = await db.candidates.count_documents({})
    total_cases = await db.immigration_cases.count_documents({})

    print("\n" + "=" * 60)
    print("IMPORT FINALIZAT CU SUCCES!")
    print("=" * 60)
    print(f"  Companii:  {total_c}")
    print(f"  Candidati: {total_cand}")
    print(f"  Dosare:    {total_cases}")

    # Nationalitati
    nat_stats = await db.candidates.aggregate([
        {"$group": {"_id": "$nationality", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]).to_list(20)
    print("\nDistributie nationalitati:")
    for n in nat_stats:
        print(f"  - {n['_id']}: {n['count']}")

asyncio.run(run_import())
