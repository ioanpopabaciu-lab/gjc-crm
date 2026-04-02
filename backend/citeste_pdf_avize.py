"""
Descarca PDF-urile avizelor de munca din Gmail si extrage:
- Numele companiei, CUI, adresa
- Numele candidatului, seria pasaportului, data nasterii, data expirare
- Numarul avizului, data emiterii, valabilitate
"""
import sys, io, asyncio, re, base64, os, unicodedata
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

ATLAS = "mongodb+srv://gjc_admin:GJC2026admin@cluster0.4l9rft3.mongodb.net/gjc_crm?retryWrites=true&w=majority&appName=Cluster0"
SEP = "=" * 70

TOKEN_FILE = ROOT_DIR / 'gmail_token.json'
SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']

def norm(t):
    if not t: return ''
    return unicodedata.normalize('NFD', str(t)).encode('ascii','ignore').decode('ascii').lower().strip()

def get_gmail():
    creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
    return build('gmail', 'v1', credentials=creds)

def download_pdf(service, msg_id, attachment_id):
    """Descarca PDF din Gmail"""
    try:
        att = service.users().messages().attachments().get(
            userId='me', messageId=msg_id, id=attachment_id
        ).execute()
        data = base64.urlsafe_b64decode(att['data'])
        return data
    except Exception as e:
        print(f"    Eroare download attachment: {e}")
        return None

def extract_text_from_pdf(pdf_bytes):
    """Extrage text din PDF"""
    try:
        import pdfplumber
        import io
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            text = ''
            for page in pdf.pages:
                text += (page.extract_text() or '') + '\n'
        return text
    except Exception:
        pass

    try:
        from reportlab.lib import pdfencrypt
        pass
    except Exception:
        pass

    # Fallback: citeste raw text din PDF bytes
    try:
        raw = pdf_bytes.decode('latin-1', errors='ignore')
        # Extrage stringuri text din PDF raw
        texts = re.findall(r'BT.*?ET', raw, re.DOTALL)
        result = ''
        for t in texts:
            strings = re.findall(r'\(([^)]{2,})\)', t)
            result += ' '.join(strings) + ' '
        return result
    except:
        return ''

def parse_aviz_pdf(text):
    """Parseaza textul unui aviz de munca si extrage datele"""
    data = {}

    if not text or len(text) < 50:
        return data

    # Normalizeaza textul
    text_norm = text.replace('\n', ' ').replace('  ', ' ')

    # === COMPANIE ===
    # Angajator / Employer
    patterns_company = [
        r'Angajator[:\s]+([A-Z][A-Za-z\s\-\.]+(?:SRL|SA|RA|SNC|SCS|RA|SNP|RNP|SNA|RAAN|PFA|II|IF|RA))',
        r'Employer[:\s]+([A-Z][A-Za-z\s\-\.]+(?:SRL|SA|RA|SNC|SCS|RA))',
        r'Denumire angajator[:\s]+([A-Z][A-Za-z\s\-\.]+)',
        r'(?:denumirea|numele)\s+angajatorului[:\s]+([A-Z][A-Za-z\s\-\.]+)',
    ]
    for p in patterns_company:
        m = re.search(p, text_norm, re.IGNORECASE)
        if m:
            data['company_name'] = m.group(1).strip()
            break

    # CUI / CIF
    m = re.search(r'(?:CUI|CIF|cod fiscal)[:\s]+(?:RO\s*)?(\d{6,10})', text_norm, re.IGNORECASE)
    if m:
        data['company_cui'] = m.group(1).strip()

    # Adresa angajator
    m = re.search(r'(?:Adresa|Sediul)[:\s]+([^\n,]+(?:,\s*[^\n,]+){1,3})', text_norm, re.IGNORECASE)
    if m:
        data['company_address'] = m.group(1).strip()[:200]

    # === CANDIDAT ===
    # Nume si prenume
    patterns_name = [
        r'(?:Numele si prenumele|Nume si prenume|Solicitant|Name)[:\s]+([A-Z][A-Z\s\-]+)',
        r'(?:cetateanu[il]|foreigner)[:\s]+([A-Z][A-Z\s\-]+)',
    ]
    for p in patterns_name:
        m = re.search(p, text_norm, re.IGNORECASE)
        if m:
            name = m.group(1).strip()
            if len(name) > 3 and len(name) < 60:
                data['candidate_name_pdf'] = name
                break

    # Pasaport / Document de calatorie
    m = re.search(r'(?:Seria si numarul|Numar pasaport|Passport)[:\s]+([A-Z0-9]{6,15})', text_norm, re.IGNORECASE)
    if m:
        data['passport_number'] = m.group(1).strip()

    # CNP
    m = re.search(r'(?:CNP|Cod numeric personal)[:\s]+(\d{13})', text_norm, re.IGNORECASE)
    if m:
        data['cnp'] = m.group(1).strip()

    # Data nasterii
    m = re.search(r'(?:Data nasterii|Date of birth|Nascut[a]?)[:\s]+(\d{2}[.\-/]\d{2}[.\-/]\d{4})', text_norm, re.IGNORECASE)
    if m:
        data['birth_date'] = m.group(1).strip()

    # Data expirare pasaport
    m = re.search(r'(?:Valabil pana la|Valabilitate pasaport|Passport expiry|Data expirarii)[:\s]+(\d{2}[.\-/]\d{2}[.\-/]\d{4})', text_norm, re.IGNORECASE)
    if m:
        data['passport_expiry'] = m.group(1).strip()

    # Nationalitate
    m = re.search(r'(?:Cetatenia|Nationalitate|Nationality|Cetatean)[:\s]+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)', text_norm, re.IGNORECASE)
    if m:
        nat = m.group(1).strip()
        if len(nat) > 2 and len(nat) < 30:
            data['nationality'] = nat

    # === AVIZ ===
    # Numar aviz
    m = re.search(r'(?:Nr\.|Numarul|aviz nr\.?)[:\s]+(\d+(?:/\d+)?)', text_norm, re.IGNORECASE)
    if m:
        data['aviz_number'] = m.group(1).strip()

    # Data emiterii
    m = re.search(r'(?:Emis la|Data emiterii|Eliberat la)[:\s]+(\d{2}[.\-/]\d{2}[.\-/]\d{4})', text_norm, re.IGNORECASE)
    if m:
        data['issued_date'] = m.group(1).strip()

    # Valabilitate aviz
    m = re.search(r'(?:Valabil|Valabilitate)[:\s]+(\d{2}[.\-/]\d{2}[.\-/]\d{4})', text_norm, re.IGNORECASE)
    if m:
        data['valid_until'] = m.group(1).strip()

    # Ocupatie / job
    m = re.search(r'(?:Ocupatia|Functia|Ocupatie|Meseria|Job|Pozitia)[:\s]+([A-Za-z\s\-]+)', text_norm, re.IGNORECASE)
    if m:
        job = m.group(1).strip()
        if len(job) > 2 and len(job) < 50:
            data['job_type'] = job

    return data

async def run():
    print(SEP)
    print("GJC CRM - EXTRAGERE DATE DIN PDF-URI AVIZE DE MUNCA")
    print(SEP)

    # Conectare Gmail
    try:
        service = get_gmail()
        print("Gmail conectat OK")
    except Exception as e:
        print(f"Eroare Gmail: {e}")
        return

    client = AsyncIOMotorClient(ATLAS)
    db = client['gjc_crm_db']

    # Ia toate emailurile cu avize PDF
    avize_emails = await db.igi_emails.find({
        'category': 'aviz_emis',
        'attachments': {'$ne': []}
    }).to_list(length=None)

    print(f"Emailuri cu avize PDF: {len(avize_emails)}")

    # Instaleaza pdfplumber daca nu e instalat
    try:
        import pdfplumber
    except ImportError:
        print("Instalez pdfplumber...")
        os.system(f'"{ROOT_DIR}/venv/Scripts/pip.exe" install pdfplumber -q')
        import pdfplumber

    extracted = []
    errors = 0

    for i, email in enumerate(avize_emails):
        gmail_id = email.get('gmail_id')
        attachments = email.get('attachments', [])

        if not gmail_id or not attachments:
            continue

        if (i+1) % 20 == 0:
            print(f"  Procesat: {i+1}/{len(avize_emails)}")

        # Obtine attachment ID din Gmail
        try:
            msg = service.users().messages().get(
                userId='me', id=gmail_id, format='full'
            ).execute()

            parts = msg.get('payload', {}).get('parts', [])

            for part in parts:
                if part.get('mimeType') in ('application/pdf', 'application/octet-stream'):
                    att_id = part.get('body', {}).get('attachmentId')
                    filename = part.get('filename', '')

                    if not att_id:
                        continue

                    # Descarca PDF
                    pdf_data = download_pdf(service, gmail_id, att_id)
                    if not pdf_data:
                        continue

                    # Extrage text
                    text = extract_text_from_pdf(pdf_data)

                    # Parseaza date
                    parsed = parse_aviz_pdf(text)

                    if parsed:
                        parsed['gmail_id'] = gmail_id
                        parsed['attachment_filename'] = filename
                        parsed['email_date'] = email.get('date', '')

                        # Extrage work permit number din filename
                        m = re.search(r'Work permit (\d+)', filename)
                        if m:
                            parsed['work_permit_number'] = m.group(1)

                        extracted.append(parsed)

                        # Actualizeaza emailul IGI cu datele extrase
                        await db.igi_emails.update_one(
                            {'_id': email['_id']},
                            {'$set': {'pdf_data': parsed}}
                        )
        except Exception as e:
            errors += 1
            if errors <= 5:
                print(f"    Eroare la {gmail_id}: {str(e)[:80]}")

    print(f"\nPDF-uri procesate: {len(extracted)}, Erori: {errors}")

    if not extracted:
        print("Nu s-au putut extrage date din PDF-uri.")
        print("Probabil PDF-urile sunt scanate (imagini) sau protejate.")
        client.close()
        return

    # Arata ce s-a extras
    print(f"\nExemplu date extrase:")
    if extracted:
        for k, v in extracted[0].items():
            print(f"  {k}: {v}")

    # Actualizeaza candidatii si companiile cu datele din PDF
    updated_cands = 0
    updated_companies = 0
    new_companies = 0

    for d in extracted:
        # Actualizeaza companie daca avem CUI
        if d.get('company_name') or d.get('company_cui'):
            company = None
            if d.get('company_cui'):
                company = await db.companies.find_one({'cui': d['company_cui']})
            if not company and d.get('company_name'):
                company = await db.companies.find_one({
                    'name': {'$regex': d['company_name'][:15], '$options': 'i'}
                })

            if company:
                upd = {}
                if d.get('company_cui') and not company.get('cui'):
                    upd['cui'] = d['company_cui']
                if d.get('company_address') and not company.get('address'):
                    upd['address'] = d['company_address']
                if upd:
                    await db.companies.update_one({'id': company['id']}, {'$set': upd})
                    updated_companies += 1
            elif d.get('company_name'):
                import uuid
                from datetime import datetime, timezone
                new_co = {
                    'id': str(uuid.uuid4()),
                    'name': d['company_name'],
                    'cui': d.get('company_cui', ''),
                    'address': d.get('company_address', ''),
                    'city': '',
                    'industry': 'Constructii/Servicii',
                    'contact_person': '',
                    'phone': '',
                    'email': '',
                    'status': 'activ',
                    'notes': 'Importat din avize IGI',
                    'created_at': datetime.now(timezone.utc).isoformat()
                }
                await db.companies.insert_one(new_co)
                new_companies += 1

        # Actualizeaza candidat daca avem date
        if d.get('candidate_name_pdf') or d.get('passport_number'):
            cand = None
            if d.get('candidate_name_pdf'):
                name_n = norm(d['candidate_name_pdf'])
                cand = await db.candidates.find_one({
                    '$or': [
                        {'$expr': {'$eq': [{'$toLower': {'$concat': ['$last_name', ' ', '$first_name']}}, name_n]}},
                    ]
                })
                if not cand:
                    # Cauta partial
                    parts = d['candidate_name_pdf'].split()
                    if parts:
                        cand = await db.candidates.find_one({
                            'last_name': {'$regex': parts[0], '$options': 'i'}
                        })

            if cand:
                upd = {}
                if d.get('passport_number') and not cand.get('passport_number'):
                    upd['passport_number'] = d['passport_number']
                if d.get('passport_expiry') and not cand.get('passport_expiry'):
                    upd['passport_expiry'] = d['passport_expiry']
                if d.get('nationality') and not cand.get('nationality'):
                    upd['nationality'] = d['nationality']
                if d.get('job_type') and not cand.get('job_type'):
                    upd['job_type'] = d['job_type']
                if upd:
                    await db.candidates.update_one({'id': cand['id']}, {'$set': upd})
                    updated_cands += 1

    print(f"\n{SEP}")
    print("REZULTATE ACTUALIZARE DIN PDF-URI")
    print(SEP)
    print(f"  Date extrase din PDF-uri:     {len(extracted)}")
    print(f"  Candidati actualizati:        {updated_cands}")
    print(f"  Companii actualizate:         {updated_companies}")
    print(f"  Companii noi adaugate:        {new_companies}")

    client.close()

asyncio.run(run())
