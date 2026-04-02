"""
Import complet toate emailurile IGI din portaligi@roimigrari.eu
Analiza completa: avize emise, programari, statusuri, candidati
"""

import sys
import io
import re
import asyncio
import base64
from datetime import datetime, timezone
from collections import defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from gmail_integration import get_gmail_service, extract_email_body, IGI_STATUS_MAPPING
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

ATLAS_URL = "mongodb+srv://gjc_admin:GJC2026admin@cluster0.4l9rft3.mongodb.net/gjc_crm?retryWrites=true&w=majority&appName=Cluster0"
DB_NAME = "gjc_crm_db"


def parse_full_igi_email(subject: str, body: str, msg_id: str, date_str: str, sender: str) -> dict:
    """Parseaza complet un email IGI - extrage toate informatiile disponibile"""

    # Curata body-ul de HTML
    clean = body.replace('<br/>', ' ').replace('<br>', ' ').replace('&nbsp;', ' ')
    clean = re.sub(r'<[^>]+>', ' ', clean)
    clean = re.sub(r'\s+', ' ', clean).strip()

    result = {
        'gmail_id': msg_id,
        'date': date_str,
        'sender': sender,
        'subject': subject,
        'body_full': clean[:1000],
        'email_category': 'necunoscut',
        # Date dosar
        'igi_number': None,
        'candidate_name': None,
        'status_raw': None,
        'crm_stage': None,
        'request_date': None,
        # Date programare
        'appointment_date': None,
        'appointment_time': None,
        'appointment_location': None,
        # Date aviz
        'aviz_number': None,
        'aviz_type': None,
        'employer_name': None,
        # Procesare
        'processed': False,
        'imported_at': datetime.now(timezone.utc).isoformat()
    }

    # ─── 1. NUMARUL SOLICITARII din subiect ───
    sub_match = re.search(r'solicitare[:\s#]+(\d+)', subject, re.IGNORECASE)
    if sub_match:
        result['igi_number'] = sub_match.group(1)

    # ─── 2. NUMELE CANDIDATULUI ───
    name_patterns = [
        r'Stimat\S*\s*/\s*Stimat\S*\s+([A-Z][A-Z\s\-\.]+?)\s*(?:<br|Solicitare|,)',
        r'pentru\s+(?:dl\.?|dna\.?|d-na\.?)?\s*([A-Z][A-Z\s\-]+?)(?:\s*,|\s*<|\s*\n)',
        r'Ref(?:eritor)?\s+(?:la\s+)?(?:cerere|dosar|solicitare)\s+([A-Z][A-Z\s]+)',
    ]
    for pattern in name_patterns:
        match = re.search(pattern, body, re.IGNORECASE)
        if match:
            name = match.group(1).strip().rstrip('.,')
            if len(name) > 3:
                result['candidate_name'] = name
                break

    # ─── 3. STATUS NOU ───
    status_patterns = [
        r'trecut[^\n]*?stare[a]?\s+(.+?)(?:\.|$)',
        r'stare[a]?\s+(?:actuala|noua|curenta)\s*:?\s*(.+?)(?:\.|<|\n)',
        r'status\s*:?\s*(.+?)(?:\.|<|\n)',
    ]
    for pattern in status_patterns:
        match = re.search(pattern, clean, re.IGNORECASE)
        if match:
            status = match.group(1).strip().rstrip('.')
            if status:
                result['status_raw'] = status
                break

    # ─── 4. MAPEAZA STATUS -> ETAPA CRM ───
    if result['status_raw']:
        status_lower = result['status_raw'].lower()
        for igi_status, crm_stage in IGI_STATUS_MAPPING.items():
            if igi_status in status_lower:
                result['crm_stage'] = crm_stage
                break

    # ─── 5. DATA SOLICITARII ───
    date_patterns = [
        r'din data\s+(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4})',
        r'data\s+(?:cererii|solicitarii|depunerii)\s*:?\s*(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4})',
        r'depusa\s+(?:la\s+data\s+de\s+)?(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4})',
    ]
    for pattern in date_patterns:
        match = re.search(pattern, clean, re.IGNORECASE)
        if match:
            result['request_date'] = match.group(1)
            break

    # ─── 6. DATA PROGRAMARII ───
    appt_patterns = [
        r'programat[a]?\s+(?:pentru\s+)?(?:data\s+(?:de\s+)?)?(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4})\s*(?:ora\s+|,\s*)?(\d{1,2}[:.]\d{2})?',
        r'v[aă]\s+rug[aă]m\s+s[aă]\s+(?:v[aă]\s+)?prezenta[tț]i\s+(?:la\s+data\s+(?:de\s+)?)?(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4})(?:\s*,\s*ora\s+(\d{1,2}[:.]\d{2}))?',
        r'data\s+programarii\s*:?\s*(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4})\s*(?:,\s*ora\s+(\d{1,2}[:.]\d{2}))?',
        r'(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4})\s*,?\s*ora\s+(\d{1,2}[:.]\d{2})',
    ]
    for pattern in appt_patterns:
        match = re.search(pattern, clean, re.IGNORECASE)
        if match:
            result['appointment_date'] = match.group(1)
            if match.lastindex >= 2 and match.group(2):
                result['appointment_time'] = match.group(2)
            break

    # ─── 7. LOCATIE PROGRAMARE ───
    loc_patterns = [
        r'(?:la\s+sediul|la\s+adresa|locatia|ghiseu[ul]*\s+nr\.?)\s*:?\s*(.{10,80}?)(?:\.|,|\n)',
        r'adresa\s*:?\s*(.{10,80}?)(?:\.|,|\n)',
        r'(?:strada|str\.)\s+(.{5,60}?)(?:\.|,|\n)',
    ]
    for pattern in loc_patterns:
        match = re.search(pattern, clean, re.IGNORECASE)
        if match:
            result['appointment_location'] = match.group(1).strip()
            break

    # ─── 8. NUMAR AVIZ ───
    aviz_patterns = [
        r'aviz\s+(?:de\s+munc[aă]\s+)?(?:nr\.?|numărul|numarul)\s*:?\s*([A-Z0-9/\-]+)',
        r'nr\.?\s+aviz\s*:?\s*([A-Z0-9/\-]+)',
        r'aviz\s+([A-Z]{2,3}[\-/]\d+[\-/]\d+)',
    ]
    for pattern in aviz_patterns:
        match = re.search(pattern, clean, re.IGNORECASE)
        if match:
            result['aviz_number'] = match.group(1).strip()
            break

    # ─── 9. ANGAJATOR ───
    emp_patterns = [
        r'angajator[ul]*\s*:?\s*([A-Z][A-Za-z\s&\.]+?)(?:,|\.|SRL|SA|SNC|RA)(?:SRL|SA|SNC|RA)?',
        r'societate[a]?\s*:?\s*([A-Z][A-Za-z\s&\.]+?)(?:,|\.|SRL|SA)',
        r'la\s+(?:firma|compania|societatea)\s+([A-Z][A-Za-z\s]+?)(?:,|\.|$)',
    ]
    for pattern in emp_patterns:
        match = re.search(pattern, clean, re.IGNORECASE)
        if match:
            result['employer_name'] = match.group(0).strip()[:100]
            break

    # ─── 10. CATEGORIA EMAILULUI ───
    subj_lower = subject.lower()
    body_lower = clean.lower()

    if 'modificare stare' in subj_lower:
        status_l = (result['status_raw'] or '').lower()
        if any(x in status_l for x in ['ghiseu', 'aprobat', 'emis', 'acordat']):
            result['email_category'] = 'aviz_emis'
        elif any(x in status_l for x in ['respins', 'neconform', 'suspendat']):
            result['email_category'] = 'respins'
        elif any(x in status_l for x in ['programat', 'programare']):
            result['email_category'] = 'programare'
        elif 'curs' in status_l or 'analiz' in status_l or 'inregistrat' in status_l:
            result['email_category'] = 'in_procesare'
        else:
            result['email_category'] = 'modificare_stare'
    elif 'programare' in subj_lower or 'programat' in body_lower:
        result['email_category'] = 'programare'
    elif 'aviz' in subj_lower and ('emis' in subj_lower or 'aprobat' in subj_lower):
        result['email_category'] = 'aviz_emis'
    elif 'respins' in subj_lower or 'neconform' in body_lower:
        result['email_category'] = 'respins'
    elif 'confirmare' in subj_lower or 'inregistrat' in body_lower:
        result['email_category'] = 'inregistrat'

    return result


def fetch_all_igi_emails(service) -> list:
    """Descarca toate emailurile de la portaligi@roimigrari.eu cu paginare"""
    all_messages = []
    page_token = None
    query = 'from:portaligi@roimigrari.eu'

    print(f"\nDescarcare lista emailuri IGI...")
    page = 0
    while True:
        page += 1
        kwargs = {'userId': 'me', 'q': query, 'maxResults': 500}
        if page_token:
            kwargs['pageToken'] = page_token
        response = service.users().messages().list(**kwargs).execute()
        msgs = response.get('messages', [])
        all_messages.extend(msgs)
        print(f"  Pagina {page}: {len(msgs)} emailuri | Total: {len(all_messages)}")
        page_token = response.get('nextPageToken')
        if not page_token:
            break

    return all_messages


async def run_full_import():
    print("=" * 65)
    print("GJC CRM - IMPORT COMPLET EMAILURI IGI")
    print("portaligi@roimigrari.eu")
    print("=" * 65)

    # Conectare Gmail
    print("\nConectare Gmail...")
    service = get_gmail_service()
    print("OK - Conectat la office.kerljobsro@gmail.com")

    # Descarca lista completa
    all_messages = fetch_all_igi_emails(service)
    total = len(all_messages)
    print(f"\nTotal emailuri de procesat: {total}")

    # Conectare Atlas
    print("\nConectare baza de date...")
    client = AsyncIOMotorClient(ATLAS_URL)
    db = client[DB_NAME]

    # Sterge colectia veche si recreeaza
    await db.igi_emails.drop()
    print("Colectie igi_emails curatata.")

    # Procesare si import
    print(f"\nProcesare {total} emailuri...\n")

    processed = []
    errors = 0
    batch = []

    for i, msg in enumerate(all_messages, 1):
        try:
            msg_data = service.users().messages().get(
                userId='me', id=msg['id'], format='full'
            ).execute()

            headers = {h['name']: h['value'] for h in msg_data['payload']['headers']}
            subject = headers.get('Subject', '')
            sender = headers.get('From', '')
            date = headers.get('Date', '')
            body = extract_email_body(msg_data)

            email_doc = parse_full_igi_email(subject, body, msg['id'], date, sender)
            batch.append(email_doc)

            # Insert in batch-uri de 50
            if len(batch) >= 50:
                await db.igi_emails.insert_many(batch)
                processed.extend(batch)
                batch = []
                print(f"  Progres: {i}/{total} ({int(i/total*100)}%)", end='\r')

        except Exception as e:
            errors += 1

    # Insert ultimul batch
    if batch:
        await db.igi_emails.insert_many(batch)
        processed.extend(batch)

    print(f"\n  Progres: {total}/{total} (100%)")

    # ═══════════════════════════════════════════════
    # ANALIZA COMPLETA
    # ═══════════════════════════════════════════════
    print("\n" + "=" * 65)
    print("ANALIZA COMPLETA EMAILURI IGI")
    print("=" * 65)

    # Categorii
    categories = defaultdict(int)
    for e in processed:
        categories[e['email_category']] += 1

    print(f"\nTotal emailuri importate: {len(processed)}")
    print(f"Erori la procesare:       {errors}")
    print(f"\nDistributie pe categorii:")
    for cat, cnt in sorted(categories.items(), key=lambda x: -x[1]):
        print(f"  {cat:25} : {cnt:4} emailuri")

    # ─── AVIZE EMISE ───
    avize = [e for e in processed if e['email_category'] == 'aviz_emis']
    print(f"\n{'='*65}")
    print(f"AVIZE DE MUNCA EMISE: {len(avize)}")
    print(f"{'='*65}")
    avize_cu_nume = [e for e in avize if e['candidate_name']]
    avize_fara_nume = [e for e in avize if not e['candidate_name']]
    print(f"Cu nume extras:  {len(avize_cu_nume)}")
    print(f"Fara nume:       {len(avize_fara_nume)}")
    if avize_cu_nume:
        print(f"\nPrimele 20 avize emise:")
        for e in avize_cu_nume[:20]:
            print(f"  Nr.IGI {e['igi_number']:10} | {str(e['candidate_name']):30} | {e['date'][:16]}")

    # ─── PROGRAMARI ───
    programari = [e for e in processed if e['email_category'] == 'programare']
    print(f"\n{'='*65}")
    print(f"DOSARE PROGRAMATE: {len(programari)}")
    print(f"{'='*65}")
    for e in programari[:30]:
        appt = f"{e['appointment_date'] or '?'} ora {e['appointment_time'] or '?'}"
        print(f"  Nr.IGI {str(e['igi_number'] or '?'):10} | {str(e['candidate_name'] or 'Necunoscut'):28} | {appt}")

    # ─── RESPINSE ───
    respinse = [e for e in processed if e['email_category'] == 'respins']
    print(f"\n{'='*65}")
    print(f"DOSARE RESPINSE / NECONFORME: {len(respinse)}")
    print(f"{'='*65}")
    for e in respinse[:20]:
        print(f"  Nr.IGI {str(e['igi_number'] or '?'):10} | {str(e['candidate_name'] or 'Necunoscut'):28} | {e['status_raw']}")

    # ─── IN PROCESARE ───
    procesare = [e for e in processed if e['email_category'] == 'in_procesare']
    print(f"\n{'='*65}")
    print(f"DOSARE IN PROCESARE: {len(procesare)}")
    print(f"{'='*65}")

    # ─── SUMAR FINAL ───
    print(f"\n{'='*65}")
    print(f"SUMAR FINAL")
    print(f"{'='*65}")
    print(f"  Total emailuri IGI importate:  {len(processed)}")
    print(f"  Avize de munca emise:          {len(avize)}")
    print(f"  Dosare programate la ghiseu:   {len(programari)}")
    print(f"  Dosare respinse/neconforme:    {len(respinse)}")
    print(f"  Dosare in procesare:           {len(procesare)}")

    # Salveaza raport in fisier
    report_path = Path(__file__).parent / 'raport_igi_emailuri.txt'
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write(f"RAPORT COMPLET EMAILURI IGI - {datetime.now().strftime('%d.%m.%Y %H:%M')}\n")
        f.write(f"{'='*65}\n\n")
        f.write(f"Total emailuri: {len(processed)}\n")
        f.write(f"Avize emise: {len(avize)}\n")
        f.write(f"Programari: {len(programari)}\n")
        f.write(f"Respinse: {len(respinse)}\n\n")

        f.write(f"\nAVIZE DE MUNCA EMISE ({len(avize)}):\n{'='*50}\n")
        for e in avize:
            f.write(f"Nr IGI: {e['igi_number']} | Candidat: {e['candidate_name']} | Data: {e['date'][:16]} | Status: {e['status_raw']}\n")

        f.write(f"\nPROGRAMARI ({len(programari)}):\n{'='*50}\n")
        for e in programari:
            f.write(f"Nr IGI: {e['igi_number']} | Candidat: {e['candidate_name']} | Data programare: {e['appointment_date']} ora {e['appointment_time']}\n")

        f.write(f"\nRESPINSE ({len(respinse)}):\n{'='*50}\n")
        for e in respinse:
            f.write(f"Nr IGI: {e['igi_number']} | Candidat: {e['candidate_name']} | Motiv: {e['status_raw']}\n")

        f.write(f"\nTOATE EMAILURILE ({len(processed)}):\n{'='*50}\n")
        for e in processed:
            f.write(f"[{e['email_category']:20}] Nr:{str(e['igi_number'] or '?'):10} | {str(e['candidate_name'] or 'N/A'):30} | {e['status_raw'] or 'N/A'} | {e['date'][:16]}\n")

    print(f"\nRaport complet salvat in: {report_path}")
    print(f"\nToate datele sunt acum disponibile in CRM!")

    client.close()


asyncio.run(run_full_import())
