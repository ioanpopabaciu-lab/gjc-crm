"""
Gmail Integration pentru GJC CRM
Citeste automat emailurile de la IGI si actualizeaza dosarele
"""

import os
import base64
import json
import re
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Permisiuni necesare - DOAR citire
SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']

CREDENTIALS_FILE = ROOT_DIR / 'credentials.json'
TOKEN_FILE = ROOT_DIR / 'gmail_token.json'

# Adresa reala IGI Romania
IGI_SENDERS = [
    'portaligi@roimigrari.eu',
    'portaligi.mai.gov.ro',
    'igi.mai.gov.ro',
    'roimigrari.eu',
]

# Mapare statusuri IGI -> etape CRM
IGI_STATUS_MAPPING = {
    'înregistrat': 'Permis Munca Depus',
    'inregistrat': 'Permis Munca Depus',
    'în curs de soluționare': 'Permis Munca Depus',
    'in curs de solutionare': 'Permis Munca Depus',
    'în analiză': 'Permis Munca Depus',
    'in analiza': 'Permis Munca Depus',
    'document la ghișeu': 'Permis Munca Aprobat',
    'document la ghiseu': 'Permis Munca Aprobat',
    'aprobat': 'Permis Munca Aprobat',
    'aviz emis': 'Permis Munca Aprobat',
    'aviz acordat': 'Permis Munca Aprobat',
    'respins': 'Recrutat',
    'rejected': 'Recrutat',
    'neconform': 'Recrutat',
    'suspendat': 'Recrutat',
    'viza acordata': 'Viza Aprobata',
    'viza aprobata': 'Viza Aprobata',
    'permis sedere': 'Permis Sedere',
    'finalizat': 'Permis Sedere',
}

# Cuvinte cheie pentru tipuri de email
EMAIL_PATTERNS = {
    'modificare_stare': ['modificare stare solicitare', 'stare solicitare'],
    'aviz_aprobat': ['document la ghiseu', 'aviz emis', 'aviz acordat', 'aprobat'],
    'aviz_respins': ['respins', 'neconform', 'rejected', 'suspendat'],
    'in_procesare': ['in curs de solutionare', 'in analiza', 'inregistrat'],
    'programare_igi': ['programare', 'programat pentru', 'appointment'],
    'viza_acordata': ['viza acordata', 'viza aprobata'],
}


def get_gmail_service():
    """Obtine serviciul Gmail autentificat"""
    creds = None

    # Verifica daca exista token salvat
    if TOKEN_FILE.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)

    # Daca nu exista token sau e expirat, face autentificarea
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not CREDENTIALS_FILE.exists():
                raise FileNotFoundError(
                    "Fisierul credentials.json nu a fost gasit in folderul backend!"
                )
            flow = InstalledAppFlow.from_client_secrets_file(
                str(CREDENTIALS_FILE), SCOPES
            )
            creds = flow.run_local_server(port=0)

        # Salveaza token-ul pentru utilizari viitoare
        with open(TOKEN_FILE, 'w') as token:
            token.write(creds.to_json())
        print(f"Token Gmail salvat in: {TOKEN_FILE}")

    return build('gmail', 'v1', credentials=creds)


def extract_email_body(msg_data: dict) -> str:
    """Extrage textul din email"""
    body = ''
    payload = msg_data.get('payload', {})

    def decode_part(part):
        data = part.get('body', {}).get('data', '')
        if data:
            return base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
        return ''

    if 'parts' in payload:
        for part in payload['parts']:
            if part.get('mimeType') == 'text/plain':
                body = decode_part(part)
                break
            elif part.get('mimeType') == 'text/html' and not body:
                body = decode_part(part)
            # Verifica parti imbricate
            if 'parts' in part:
                for subpart in part['parts']:
                    if subpart.get('mimeType') == 'text/plain':
                        body = decode_part(subpart)
                        break
    else:
        body = decode_part(payload)

    return body


def detect_email_type(subject: str, body: str) -> str:
    """Detecteaza tipul emailului IGI pe baza continutului"""
    text = (subject + ' ' + body).lower()

    for email_type, keywords in EMAIL_PATTERNS.items():
        for keyword in keywords:
            if keyword.lower() in text:
                return email_type

    return 'general_igi'


def extract_candidate_name(subject: str, body: str) -> Optional[str]:
    """Incearca sa extraga numele candidatului din email"""
    text = subject + ' ' + body

    # Pattern: nume in format "PRENUME NUME" sau "Prenume Nume"
    patterns = [
        r'pentru\s+([A-Z][a-z]+\s+[A-Z][A-Z]+)',
        r'candidat[ul]*\s+([A-Z][a-z]+\s+[A-Z][A-Z]+)',
        r'muncitor[ul]*\s+([A-Z][a-z]+\s+[A-Z][A-Z]+)',
        r'([A-Z]{2,}\s+[A-Z]{2,})',  # Nume cu majuscule
    ]

    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(1).strip()

    return None


def extract_aviz_number(subject: str, body: str) -> Optional[str]:
    """Extrage numarul avizului de munca din email"""
    text = subject + ' ' + body

    patterns = [
        r'aviz\s+nr\.?\s*(\d+[-/]\d+)',
        r'aviz\s+nr\.?\s*(\d+)',
        r'nr\.?\s+dosar\s*:?\s*(\d+[-/\d]+)',
        r'dosar\s+nr\.?\s*(\d+)',
        r'reference\s+number\s*:?\s*([A-Z0-9/-]+)',
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).strip()

    return None


def extract_appointment_date(body: str) -> Optional[str]:
    """Extrage data programarii din email"""
    patterns = [
        r'(\d{1,2}[./-]\d{1,2}[./-]\d{4})\s*ora\s*(\d{1,2}:\d{2})',
        r'data\s*:?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})',
        r'(\d{1,2}\s+\w+\s+\d{4})\s*la\s*ora\s*(\d{1,2}:\d{2})',
    ]

    for pattern in patterns:
        match = re.search(pattern, body, re.IGNORECASE)
        if match:
            return match.group(0).strip()

    return None


def parse_igi_email(subject: str, body: str) -> dict:
    """
    Parseaza un email IGI de tip 'Modificare stare solicitare'
    Extrage: nume candidat, numar solicitare, status nou, data
    """
    import re
    clean_body = body.replace('<br/>', ' ').replace('<br>', ' ').replace('&nbsp;', ' ')

    # Extrage numarul solicitarii din subiect: "Modificare stare solicitare: 1955072"
    igi_number = None
    subject_match = re.search(r'solicitare[:\s]+(\d+)', subject, re.IGNORECASE)
    if subject_match:
        igi_number = subject_match.group(1)

    # Extrage numele candidatului: "Stimate / Stimata/Stimată CHAND SUNIL BAHADUR <br/>"
    candidate_name = None
    name_match = re.search(r'Stimat\S*\s*/\s*Stimat\S*\s+([A-Z][A-Z\s\-]+?)\s*(?:<br|<\/|Solicitare)', body, re.IGNORECASE)
    if name_match:
        candidate_name = name_match.group(1).strip()

    # Extrage statusul nou: "a trecut în starea Document la ghișeu"
    status_raw = None
    status_match = re.search(r'trecut[^\n]*?starea?\s+(.+?)(?:\.|$)', clean_body, re.IGNORECASE)
    if status_match:
        status_raw = status_match.group(1).strip().rstrip('.')

    # Mapeaza statusul IGI la etapa CRM
    crm_stage = None
    if status_raw:
        for igi_status, crm_stage_value in IGI_STATUS_MAPPING.items():
            if igi_status in status_raw.lower():
                crm_stage = crm_stage_value
                break

    # Extrage data solicitarii: "din data 19.01.2026"
    request_date = None
    date_match = re.search(r'din data\s+(\d{1,2}\.\d{1,2}\.\d{4})', clean_body)
    if date_match:
        request_date = date_match.group(1)

    return {
        'igi_number': igi_number,
        'candidate_name': candidate_name,
        'status_raw': status_raw,
        'crm_stage': crm_stage,
        'request_date': request_date,
    }


def get_recent_igi_emails(service, max_results: int = 50) -> list:
    """
    Cauta emailuri recente de la portaligi@roimigrari.eu
    Returneaza lista de emailuri procesate cu date extrase
    """
    results = []

    # Query specific pentru adresa reala IGI
    query = 'from:portaligi@roimigrari.eu'

    print(f"Cautare emailuri IGI cu query: {query}")

    try:
        response = service.users().messages().list(
            userId='me',
            q=query,
            maxResults=max_results
        ).execute()

        messages = response.get('messages', [])
        print(f"Gasit {len(messages)} emailuri IGI")

        for msg in messages:
            msg_data = service.users().messages().get(
                userId='me',
                id=msg['id'],
                format='full'
            ).execute()

            headers = msg_data['payload']['headers']
            subject = next((h['value'] for h in headers if h['name'] == 'Subject'), '')
            sender = next((h['value'] for h in headers if h['name'] == 'From'), '')
            date = next((h['value'] for h in headers if h['name'] == 'Date'), '')

            body = extract_email_body(msg_data)
            email_type = detect_email_type(subject, body)

            # Parsare specifica pentru emailurile IGI "Modificare stare solicitare"
            parsed = parse_igi_email(subject, body)

            results.append({
                'gmail_id': msg['id'],
                'sender': sender,
                'subject': subject,
                'date': date,
                'body_preview': body[:600] if body else '',
                'email_type': email_type,
                'candidate_name': parsed['candidate_name'],
                'igi_number': parsed['igi_number'],
                'status_raw': parsed['status_raw'],
                'crm_stage': parsed['crm_stage'],
                'request_date': parsed['request_date'],
                'processed': False
            })

    except Exception as e:
        print(f"Eroare la cautarea emailurilor IGI: {e}")

    return results


async def save_emails_to_db(emails: list, db) -> dict:
    """Salveaza emailurile procesate in baza de date"""
    saved = 0
    duplicates = 0

    for email in emails:
        # Verifica daca emailul e deja in baza de date
        existing = await db.igi_emails.find_one({'gmail_id': email['gmail_id']})
        if existing:
            duplicates += 1
            continue

        email['created_at'] = datetime.now(timezone.utc).isoformat()
        await db.igi_emails.insert_one(email)
        saved += 1

    return {'saved': saved, 'duplicates': duplicates, 'total': len(emails)}


async def sync_igi_emails_task():
    """
    Task principal de sincronizare emailuri IGI
    Poate fi rulat manual sau programat automat
    """
    print("=" * 50)
    print("Sincronizare emailuri IGI pornita...")
    print("=" * 50)

    # Conectare la baza de date
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'gjc_crm')
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    try:
        # Obtine serviciul Gmail
        service = get_gmail_service()
        print("Conectat la Gmail cu succes!")

        # Cauta emailuri IGI
        emails = get_recent_igi_emails(service, max_results=100)

        if not emails:
            print("Nu au fost gasite emailuri de la IGI.")
            return {'status': 'ok', 'message': 'Nu au fost gasite emailuri IGI', 'emails_found': 0}

        # Salveaza in baza de date
        result = await save_emails_to_db(emails, db)

        print(f"Rezultat sincronizare:")
        print(f"  - Emailuri noi salvate: {result['saved']}")
        print(f"  - Duplicate sarite: {result['duplicates']}")
        print(f"  - Total procesate: {result['total']}")

        # Afiseaza tipurile de emailuri gasite
        types_found = {}
        for email in emails:
            t = email['email_type']
            types_found[t] = types_found.get(t, 0) + 1

        print(f"\nTipuri emailuri gasite:")
        for t, count in types_found.items():
            print(f"  - {t}: {count}")

        return {
            'status': 'ok',
            'emails_found': len(emails),
            'emails_saved': result['saved'],
            'types': types_found
        }

    except FileNotFoundError as e:
        print(f"Eroare: {e}")
        return {'status': 'error', 'message': str(e)}
    except Exception as e:
        print(f"Eroare la sincronizare: {e}")
        return {'status': 'error', 'message': str(e)}
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(sync_igi_emails_task())
