"""
Script de import date din fișierele Excel în MongoDB
Global Jobs Consulting CRM
"""

import pandas as pd
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
import uuid
import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Statusurile de imigrare în ordine
IMMIGRATION_STAGES = [
    "Recrutat",
    "Documente Pregatite",
    "Permis Munca Depus",
    "Permis Munca Aprobat",
    "Viza Depusa",
    "Viza Aprobata",
    "Sosit Romania",
    "Permis Sedere"
]

# Mapping statusuri din Excel
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
    """Verifică dacă rândul conține date valide de candidat"""
    last_name = str(row.get('last_name', '')).strip().lower()
    first_name = str(row.get('first_name', '')).strip().lower()
    
    # Lista de cuvinte care indică rânduri header sau invalide
    invalid_keywords = [
        'nume', 'prenume', 'naționalitate', 'nationalitate', 'certificat', 
        'emis la', 'expirat', 'ocupația', 'ocupatia', 'pașaport', 'pasaport',
        'nr. crt', 'nr.crt', 'anaf', 'cazier'
    ]
    
    # Verifică dacă numele conține cuvinte invalide
    for keyword in invalid_keywords:
        if keyword in last_name or keyword in first_name:
            return False
    
    # Verifică dacă avem cel puțin un nume valid
    if not last_name or last_name in ['nan', '', 'none']:
        return False
        
    return True

def normalize_nationality(nat):
    """Normalizează numele naționalității"""
    if not nat or str(nat).lower() in ['nan', '', 'none']:
        return 'Necunoscut'
    
    nat = str(nat).strip()
    
    # Mapping pentru variante comune
    mapping = {
        'nepal': 'Nepal',
        'nepali': 'Nepal',
        'india': 'India',
        'indian': 'India',
        'filipine': 'Filipine',
        'philippines': 'Filipine',
        'filipina': 'Filipine',
        'nigeria': 'Nigeria',
        'nigerian': 'Nigeria',
        'sri lanka': 'Sri Lanka',
        'srilanka': 'Sri Lanka',
        'bangladesh': 'Bangladesh',
        'pakistan': 'Pakistan',
        'vietnam': 'Vietnam'
    }
    
    return mapping.get(nat.lower(), nat.title())

def normalize_company_name(name):
    """Normalizează numele companiei pentru a evita duplicate"""
    if not name:
        return None
    
    name = str(name).strip()
    
    # Normalizare - convertim la lowercase pentru comparație
    name_lower = name.lower()
    
    # Mapping pentru companii cunoscute cu variante de denumire
    company_mapping = {
        'da vinci construct proiect srl': 'Da Vinci Construct Proiect SRL',
        'da vinci construct&proiect srl': 'Da Vinci Construct Proiect SRL',
        'da vinci construct & proiect srl': 'Da Vinci Construct Proiect SRL',
        'davinci': 'Da Vinci Construct Proiect SRL',
        'allegria turism srl': 'Allegria Turism SRL',
        'allegria': 'Allegria Turism SRL',
        'araly exim srl': 'Araly Exim SRL',
        'araly exim srl ': 'Araly Exim SRL',
        'babuiesti srl': 'Babuiesti SRL',
        'babuiesti  srl': 'Babuiesti SRL',
        'babuiesti  srl ': 'Babuiesti SRL',
        'balearia food srl': 'Balearia Food SRL',
        'balearia': 'Balearia Food SRL',
        'bonavilla complex srl': 'Bonavilla Complex SRL',
        'bonavilla': 'Bonavilla Complex SRL',
        'complex adorianis srl': 'Complex Adorianis SRL',
        'adorianis': 'Complex Adorianis SRL',
        'covaliciuc mariana': 'Covaliciuc Mariana',
        'covaliciuc': 'Covaliciuc Mariana',
        'danessa impex srl': 'Danessa Impex SRL',
        'danessa': 'Danessa Impex SRL',
        'euroimpact srl': 'Euroimpact SRL',
        'euroimpact': 'Euroimpact SRL',
        'fnk garage srl': 'FNK Garage SRL',
        'fnk garage srl ': 'FNK Garage SRL',
        'fnk': 'FNK Garage SRL',
        'giulio impex srl': 'Giulio Impex SRL',
        'giulio': 'Giulio Impex SRL',
        'global clean magic srl': 'Global Clean Magic SRL',
        'global clean magic  srl': 'Global Clean Magic SRL',
        'global': 'Global Clean Magic SRL',
        'hortifruct srl': 'Hortifruct SRL',
        'hortifruct': 'Hortifruct SRL',
        'lari s legend food srl': 'Laris Legend Food SRL',
        'laris': 'Laris Legend Food SRL',
        'lider internațional srl': 'Lider International SRL',
        'lider internațional srl ': 'Lider International SRL',
        'lider international srl': 'Lider International SRL',
        'lider': 'Lider International SRL',
        'novarom tour felix srl': 'Novarom Tour Felix SRL',
        'novarom': 'Novarom Tour Felix SRL',
        'only build residence srl': 'Only Build Residence SRL',
        'only build residence  srl': 'Only Build Residence SRL',
        'only': 'Only Build Residence SRL',
        'pepiniera takacs csaba ii': 'Pepiniera Takacs Csaba II',
        'pepiniera': 'Pepiniera Takacs Csaba II',
        'pfl facility services srl': 'PFL Facility Services SRL',
        'pfl facility services srl ': 'PFL Facility Services SRL',
        'pfl': 'PFL Facility Services SRL',
        'premium martin construct srl': 'Premium Martin Construct SRL',
        'martin': 'Premium Martin Construct SRL',
        'pro smart cleaning srl': 'Pro Smart Cleaning SRL',
        'smart': 'Pro Smart Cleaning SRL',
        'repede pleasure srl': 'Repede Pleasure SRL',
        'repede': 'Repede Pleasure SRL',
        'semarc a-z construct srl': 'Semarc A-Z Construct SRL',
        'semarc': 'Semarc A-Z Construct SRL',
        'luca veterinaru srl': 'Luca Veterinaru SRL',
        'luca veterinary srl': 'Luca Veterinaru SRL',
    }
    
    # Căutăm match exact sau parțial
    if name_lower in company_mapping:
        return company_mapping[name_lower]
    
    # Căutare parțială - dacă conține un pattern cunoscut
    for pattern, normalized in company_mapping.items():
        if pattern in name_lower or name_lower in pattern:
            return normalized
    
    # Dacă nu găsim mapping, returnăm numele curățat
    return name.strip()

def parse_excel_files():
    """Parsează ambele fișiere Excel și returnează datele"""
    
    companies_dict = {}  # Folosim dict pentru a evita duplicate
    candidates_list = []
    
    # ========== FIȘIER VECHI (Apr 2025) ==========
    print("Procesare fișier vechi (Apr 2025)...")
    xl_old = pd.ExcelFile('data/baza_date_apr2025.xlsx')
    
    # Citim lista de companii din SUMAR
    df_sumar = pd.read_excel(xl_old, sheet_name='SUMAR', header=None)
    company_list_sumar = []
    for idx in range(4, 30):
        if df_sumar.shape[0] > idx and pd.notna(df_sumar.iloc[idx, 1]):
            company_list_sumar.append(str(df_sumar.iloc[idx, 1]).strip())
    
    # Sheet-urile cu companii (excluzând SUMAR)
    company_sheets = [s for s in xl_old.sheet_names if s != 'SUMAR']
    
    for sheet_idx, sheet in enumerate(company_sheets):
        df = pd.read_excel(xl_old, sheet_name=sheet, header=None)
        
        # Extragem numele companiei - preferăm din SUMAR
        if sheet_idx < len(company_list_sumar):
            company_name = company_list_sumar[sheet_idx]
        else:
            # Fallback: din celula B2 sau numele sheet-ului
            if df.shape[0] > 1 and df.shape[1] > 1 and pd.notna(df.iloc[1, 1]):
                company_name = str(df.iloc[1, 1]).strip()
            else:
                company_name = sheet.split('.')[-1].strip() if '.' in sheet else sheet
        
        # Normalizăm numele companiei
        company_name = company_name.strip()
        company_name = normalize_company_name(company_name)
        
        if company_name and company_name not in companies_dict:
            companies_dict[company_name] = {
                'name': company_name,
                'cui': None,
                'city': None,
                'industry': None,
                'status': 'activ'
            }
        
        # Candidații încep de la rândul 11 (index 11)
        # Coloane: 1=Nume, 2=Prenume, 3=Naționalitate, 4=Ocupația, 7=Pașaport, 8=Data expirare
        for idx in range(11, df.shape[0]):
            row = df.iloc[idx]
            
            # Skip dacă nu avem date
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
            
            # Data expirare pașaport - coloana 8
            if pd.notna(row[8]):
                try:
                    candidate['passport_expiry'] = pd.to_datetime(row[8]).strftime('%Y-%m-%d')
                except:
                    pass
            
            # Verificăm dacă este un candidat valid
            if is_valid_candidate_row(candidate):
                candidates_list.append(candidate)
    
    print(f"  - Candidați din fișierul vechi: {len(candidates_list)}")
    
    # ========== FIȘIER NOU (Feb 2026) ==========
    print("Procesare fișier nou (Feb 2026)...")
    xl_new = pd.ExcelFile('data/baza_date_feb2026.xlsx')
    
    # Sheet "Muncitori ajunsi in Romania"
    df_new = pd.read_excel(xl_new, sheet_name='Muncitori ajunsi in Romania')
    
    new_candidates_count = 0
    for idx, row in df_new.iterrows():
        if pd.isna(row['Nume Angajat']):
            continue
        
        # Parsăm numele (format: "Nume Prenume" sau "Prenume Nume")
        full_name = str(row['Nume Angajat']).strip()
        name_parts = full_name.split()
        
        if len(name_parts) >= 2:
            # Presupunem format "Nume Prenume"
            last_name = name_parts[0]
            first_name = ' '.join(name_parts[1:])
        else:
            last_name = full_name
            first_name = ''
        
        # Determinăm compania (preferăm Angajator Final)
        company_name = None
        if pd.notna(row.get('Angajator Final')) and str(row['Angajator Final']).strip():
            company_name = str(row['Angajator Final']).strip()
        elif pd.notna(row.get('Angajator Initial')) and str(row['Angajator Initial']).strip():
            company_name = str(row['Angajator Initial']).strip()
        
        # Adăugăm compania dacă nu există
        if company_name and company_name not in companies_dict:
            companies_dict[company_name] = {
                'name': company_name,
                'cui': None,
                'city': None,
                'industry': None,
                'status': 'activ'
            }
        
        # Mapăm statusul
        raw_status = str(row.get('Statut', '')).strip().lower()
        immigration_status = STATUS_MAPPING.get(raw_status, 'Recrutat')
        
        candidate = {
            'last_name': last_name,
            'first_name': first_name,
            'nationality': 'Nepal',  # Majoritatea din acest fișier sunt din Nepal
            'job_type': None,
            'passport_number': None,
            'passport_expiry': None,
            'company_name': company_name,
            'status': 'activ',
            'immigration_status': immigration_status,
            'source': 'feb2026'
        }
        
        if is_valid_candidate_row(candidate):
            candidates_list.append(candidate)
            new_candidates_count += 1
    
    print(f"  - Candidați din fișierul nou: {new_candidates_count}")
    
    return list(companies_dict.values()), candidates_list

async def import_to_mongodb(companies, candidates):
    """Importă datele în MongoDB"""
    
    print("\nȘtergere date existente...")
    await db.companies.delete_many({})
    await db.candidates.delete_many({})
    await db.immigration_cases.delete_many({})
    
    # ========== IMPORT COMPANII ==========
    print("\nImport companii...")
    company_id_map = {}  # Mapare nume companie -> ID
    
    for company in companies:
        company_id = str(uuid.uuid4())
        company_doc = {
            'id': company_id,
            'name': company['name'],
            'cui': company.get('cui'),
            'city': company.get('city'),
            'industry': company.get('industry'),
            'contact_person': None,
            'phone': None,
            'email': None,
            'status': 'activ',
            'notes': None,
            'created_at': datetime.now(timezone.utc).isoformat()
        }
        await db.companies.insert_one(company_doc)
        company_id_map[company['name']] = company_id
    
    print(f"  - {len(companies)} companii importate")
    
    # ========== IMPORT CANDIDAȚI ==========
    print("\nImport candidați...")
    candidates_inserted = 0
    
    # Deduplicare pe baza numelui complet și companiei
    seen_candidates = set()
    
    for candidate in candidates:
        # Cheie unică pentru deduplicare
        candidate_key = f"{candidate['last_name']}_{candidate['first_name']}_{candidate.get('company_name', '')}".lower()
        
        if candidate_key in seen_candidates:
            continue
        seen_candidates.add(candidate_key)
        
        candidate_id = str(uuid.uuid4())
        company_id = company_id_map.get(candidate.get('company_name'))
        
        candidate_doc = {
            'id': candidate_id,
            'first_name': candidate['first_name'],
            'last_name': candidate['last_name'],
            'nationality': candidate['nationality'],
            'passport_number': candidate.get('passport_number'),
            'passport_expiry': candidate.get('passport_expiry'),
            'permit_expiry': None,
            'phone': None,
            'email': None,
            'job_type': candidate.get('job_type'),
            'status': candidate.get('status', 'activ'),
            'company_id': company_id,
            'company_name': candidate.get('company_name'),
            'notes': None,
            'created_at': datetime.now(timezone.utc).isoformat()
        }
        await db.candidates.insert_one(candidate_doc)
        candidates_inserted += 1
        
        # Dacă avem status de imigrare, creăm și un dosar
        if candidate.get('immigration_status'):
            stage_idx = IMMIGRATION_STAGES.index(candidate['immigration_status']) + 1 if candidate['immigration_status'] in IMMIGRATION_STAGES else 1
            
            case_doc = {
                'id': str(uuid.uuid4()),
                'candidate_id': candidate_id,
                'candidate_name': f"{candidate['first_name']} {candidate['last_name']}",
                'company_id': company_id,
                'company_name': candidate.get('company_name'),
                'case_type': 'Permis de muncă',
                'status': 'în procesare' if stage_idx < len(IMMIGRATION_STAGES) else 'finalizat',
                'current_stage': stage_idx,
                'current_stage_name': candidate['immigration_status'],
                'submitted_date': datetime.now(timezone.utc).date().isoformat(),
                'deadline': None,
                'assigned_to': 'Ioan Baciu',
                'notes': f"Importat din Excel - status: {candidate['immigration_status']}",
                'created_at': datetime.now(timezone.utc).isoformat()
            }
            await db.immigration_cases.insert_one(case_doc)
    
    print(f"  - {candidates_inserted} candidați importați (după deduplicare)")
    
    # ========== STATISTICI FINALE ==========
    print("\n" + "="*60)
    print("IMPORT FINALIZAT CU SUCCES!")
    print("="*60)
    
    total_companies = await db.companies.count_documents({})
    total_candidates = await db.candidates.count_documents({})
    total_cases = await db.immigration_cases.count_documents({})
    
    # Statistici pe naționalități
    nationality_stats = await db.candidates.aggregate([
        {"$group": {"_id": "$nationality", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]).to_list(20)
    
    print(f"\nStatistici finale:")
    print(f"  - Companii: {total_companies}")
    print(f"  - Candidați: {total_candidates}")
    print(f"  - Dosare imigrare: {total_cases}")
    
    print(f"\nDistribuție pe naționalități:")
    for nat in nationality_stats:
        print(f"  - {nat['_id']}: {nat['count']}")
    
    return {
        'companies': total_companies,
        'candidates': total_candidates,
        'immigration_cases': total_cases
    }

async def main():
    print("="*60)
    print("GJC AI-CRM - Import Date din Excel")
    print("="*60)
    
    # Parsăm fișierele Excel
    companies, candidates = parse_excel_files()
    
    print(f"\nTotal găsite:")
    print(f"  - Companii unice: {len(companies)}")
    print(f"  - Candidați: {len(candidates)}")
    
    # Importăm în MongoDB
    result = await import_to_mongodb(companies, candidates)
    
    return result

if __name__ == "__main__":
    asyncio.run(main())
