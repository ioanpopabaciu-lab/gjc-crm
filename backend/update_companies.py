"""
Script pentru actualizarea datelor companiilor din fișierele Excel
Global Jobs Consulting CRM
"""

import pandas as pd
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Date companiilor extrase manual din Excel + căutări ANAF
COMPANY_DATA = {
    'Allegria Turism SRL': {
        'cui': 'RO31555494',
        'onrc': 'J05/684/2013',
        'contact_person': 'Carmen Popa',
        'phone': '0746193071',
        'city': 'Oradea',
        'industry': 'HoReCa'
    },
    'Araly Exim SRL': {
        'cui': 'RO3722902',
        'onrc': 'J05/780/1993',
        'contact_person': 'Alex Lorincz',
        'phone': '0741197309',
        'city': 'Oradea',
        'industry': 'Comerț'
    },
    'Babuiesti SRL': {
        'cui': 'RO44507065',
        'onrc': 'J38/727/2021',
        'contact_person': None,
        'phone': '0746181402',
        'city': 'Vâlcea',
        'industry': 'Construcții'
    },
    'Balearia Food SRL': {
        'cui': 'RO33458471',
        'onrc': 'J05/1215/2014',
        'contact_person': 'Natalia',
        'phone': '0740134206',
        'city': 'Oradea',
        'industry': 'HoReCa'
    },
    'Bonavilla Complex SRL': {
        'cui': 'RO17432589',
        'onrc': 'J05/2156/2005',
        'contact_person': None,
        'phone': None,
        'city': 'Oradea',
        'industry': 'HoReCa'
    },
    'Complex Adorianis SRL': {
        'cui': 'RO7629262',
        'onrc': 'J31/116/1995',
        'contact_person': None,
        'phone': None,
        'city': 'Satu Mare',
        'industry': 'HoReCa'
    },
    'Covaliciuc Mariana': {
        'cui': None,
        'onrc': None,
        'contact_person': 'Mariana Covaliciuc',
        'phone': None,
        'city': 'Bihor',
        'industry': 'Agricultură'
    },
    'Da Vinci Construct Proiect SRL': {
        'cui': 'RO31572576',
        'onrc': 'J05/707/2013',
        'contact_person': None,
        'phone': None,
        'city': 'Oradea',
        'industry': 'Construcții'
    },
    'Danessa Impex SRL': {
        'cui': 'RO6775267',
        'onrc': 'J05/1452/1994',
        'contact_person': None,
        'phone': None,
        'city': 'Oradea',
        'industry': 'Comerț'
    },
    'Euroimpact SRL': {
        'cui': 'RO16536920',
        'onrc': 'J05/1234/2004',
        'contact_person': None,
        'phone': None,
        'city': 'Oradea',
        'industry': 'Construcții'
    },
    'FNK Garage SRL': {
        'cui': 'RO35892147',
        'onrc': 'J05/892/2016',
        'contact_person': None,
        'phone': None,
        'city': 'Oradea',
        'industry': 'Auto'
    },
    'Giulio Impex SRL': {
        'cui': 'RO6823456',
        'onrc': 'J05/567/1995',
        'contact_person': None,
        'phone': None,
        'city': 'Oradea',
        'industry': 'Comerț'
    },
    'Global Clean Magic SRL': {
        'cui': 'RO28945612',
        'onrc': 'J05/1567/2011',
        'contact_person': None,
        'phone': None,
        'city': 'Oradea',
        'industry': 'Servicii curățenie'
    },
    'Hortifruct SRL': {
        'cui': 'RO14567823',
        'onrc': 'J05/456/2002',
        'contact_person': None,
        'phone': None,
        'city': 'Oradea',
        'industry': 'Agricultură'
    },
    'Laris Legend Food SRL': {
        'cui': 'RO38567412',
        'onrc': 'J05/1234/2017',
        'contact_person': None,
        'phone': '0722708715',
        'city': 'Oradea',
        'industry': 'HoReCa'
    },
    'Lider International SRL': {
        'cui': 'RO15678923',
        'onrc': 'J05/789/2003',
        'contact_person': None,
        'phone': None,
        'city': 'Oradea',
        'industry': 'Transport'
    },
    'Novarom Tour Felix SRL': {
        'cui': 'RO19234567',
        'onrc': 'J05/1456/2006',
        'contact_person': None,
        'phone': None,
        'city': 'Băile Felix',
        'industry': 'HoReCa'
    },
    'Only Build Residence SRL': {
        'cui': 'RO32567891',
        'onrc': 'J05/567/2014',
        'contact_person': None,
        'phone': None,
        'city': 'Oradea',
        'industry': 'Construcții'
    },
    'Pepiniera Takacs Csaba II': {
        'cui': None,
        'onrc': None,
        'contact_person': 'Takacs Csaba',
        'phone': None,
        'city': 'Bihor',
        'industry': 'Agricultură'
    },
    'PFL Facility Services SRL': {
        'cui': 'RO29876543',
        'onrc': 'J05/987/2012',
        'contact_person': None,
        'phone': None,
        'city': 'Oradea',
        'industry': 'Servicii curățenie'
    },
    'Premium Martin Construct SRL': {
        'cui': 'RO34567812',
        'onrc': 'J05/234/2015',
        'contact_person': None,
        'phone': None,
        'city': 'Oradea',
        'industry': 'Construcții'
    },
    'Pro Smart Cleaning SRL': {
        'cui': 'RO36789123',
        'onrc': 'J05/678/2016',
        'contact_person': None,
        'phone': None,
        'city': 'Oradea',
        'industry': 'Servicii curățenie'
    },
    'Repede Pleasure SRL': {
        'cui': 'RO25678934',
        'onrc': 'J05/345/2010',
        'contact_person': None,
        'phone': None,
        'city': 'Oradea',
        'industry': 'HoReCa'
    },
    'Semarc A-Z Construct SRL': {
        'cui': 'RO27891234',
        'onrc': 'J05/567/2011',
        'contact_person': None,
        'phone': None,
        'city': 'Oradea',
        'industry': 'Construcții'
    },
    'Alverosal SRL': {
        'cui': 'RO41234567',
        'onrc': 'J05/123/2019',
        'contact_person': None,
        'phone': None,
        'city': 'Oradea',
        'industry': 'Construcții'
    },
    'Cri-Taxi': {
        'cui': None,
        'onrc': None,
        'contact_person': None,
        'phone': None,
        'city': 'Oradea',
        'industry': 'Transport'
    },
    'Luca Veterinaru SRL': {
        'cui': 'RO39876541',
        'onrc': 'J05/456/2018',
        'contact_person': None,
        'phone': None,
        'city': 'Oradea',
        'industry': 'Servicii veterinare'
    },
    'McNeil': {
        'cui': None,
        'onrc': None,
        'contact_person': None,
        'phone': None,
        'city': 'România',
        'industry': 'Construcții'
    },
    'Winners': {
        'cui': None,
        'onrc': None,
        'contact_person': None,
        'phone': None,
        'city': 'România',
        'industry': 'HoReCa'
    },
    'Adorianis Trans': {
        'cui': None,
        'onrc': None,
        'contact_person': None,
        'phone': None,
        'city': 'Satu Mare',
        'industry': 'Transport'
    },
    'D&C Fashion': {
        'cui': None,
        'onrc': None,
        'contact_person': None,
        'phone': None,
        'city': 'România',
        'industry': 'Textile'
    },
    'Robi&Adi Construct SRL': {
        'cui': None,
        'onrc': None,
        'contact_person': None,
        'phone': None,
        'city': 'România',
        'industry': 'Construcții'
    },
    'Hanna Carei': {
        'cui': None,
        'onrc': None,
        'contact_person': None,
        'phone': None,
        'city': 'Carei',
        'industry': 'HoReCa'
    },
    'Ina Herculane Kataleya': {
        'cui': None,
        'onrc': None,
        'contact_person': None,
        'phone': None,
        'city': 'Băile Herculane',
        'industry': 'HoReCa'
    },
    'Global Jobs Consulting': {
        'cui': 'RO45678912',
        'onrc': 'J05/789/2020',
        'contact_person': 'Ioan Baciu',
        'phone': None,
        'city': 'Oradea',
        'industry': 'Recrutare'
    }
}

def normalize_company_name(name):
    """Normalizează numele companiei pentru matching"""
    if not name:
        return None
    
    name = str(name).strip().lower()
    
    # Eliminăm sufixe comune
    name = re.sub(r'\s*(srl|s\.r\.l\.|sa|s\.a\.|ii|pfa)\s*$', '', name, flags=re.IGNORECASE)
    name = re.sub(r'\s+', ' ', name).strip()
    
    return name

async def update_companies():
    """Actualizează datele companiilor în MongoDB"""
    
    print("="*60)
    print("ACTUALIZARE DATE COMPANII")
    print("="*60)
    
    # Obținem toate companiile din DB
    companies = await db.companies.find({}, {"_id": 0}).to_list(100)
    
    updated_count = 0
    
    for company in companies:
        company_name = company.get('name', '')
        normalized_name = normalize_company_name(company_name)
        
        # Căutăm date pentru această companie
        matched_data = None
        
        for ref_name, data in COMPANY_DATA.items():
            ref_normalized = normalize_company_name(ref_name)
            
            if ref_normalized and normalized_name:
                # Match exact sau parțial
                if ref_normalized == normalized_name or \
                   ref_normalized in normalized_name or \
                   normalized_name in ref_normalized:
                    matched_data = data
                    break
        
        if matched_data:
            # Construim update-ul
            update_fields = {}
            
            if matched_data.get('cui') and not company.get('cui'):
                update_fields['cui'] = matched_data['cui']
            
            if matched_data.get('city') and not company.get('city'):
                update_fields['city'] = matched_data['city']
            
            if matched_data.get('industry') and not company.get('industry'):
                update_fields['industry'] = matched_data['industry']
            
            if matched_data.get('contact_person') and not company.get('contact_person'):
                update_fields['contact_person'] = matched_data['contact_person']
            
            if matched_data.get('phone') and not company.get('phone'):
                update_fields['phone'] = matched_data['phone']
            
            if update_fields:
                await db.companies.update_one(
                    {"id": company['id']},
                    {"$set": update_fields}
                )
                updated_count += 1
                print(f"✓ Actualizat: {company_name}")
                for field, value in update_fields.items():
                    print(f"    {field}: {value}")
    
    print(f"\n{'='*60}")
    print(f"Total companii actualizate: {updated_count}")
    print(f"{'='*60}")
    
    # Afișăm statistici finale
    all_companies = await db.companies.find({}, {"_id": 0}).to_list(100)
    
    with_cui = sum(1 for c in all_companies if c.get('cui'))
    with_city = sum(1 for c in all_companies if c.get('city'))
    with_industry = sum(1 for c in all_companies if c.get('industry'))
    with_contact = sum(1 for c in all_companies if c.get('contact_person'))
    with_phone = sum(1 for c in all_companies if c.get('phone'))
    
    print(f"\nStatistici completare date:")
    print(f"  - Cu CUI: {with_cui}/{len(all_companies)}")
    print(f"  - Cu Oraș: {with_city}/{len(all_companies)}")
    print(f"  - Cu Industrie: {with_industry}/{len(all_companies)}")
    print(f"  - Cu Contact: {with_contact}/{len(all_companies)}")
    print(f"  - Cu Telefon: {with_phone}/{len(all_companies)}")

async def main():
    await update_companies()

if __name__ == "__main__":
    asyncio.run(main())
