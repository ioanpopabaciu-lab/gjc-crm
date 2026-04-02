"""
Extrage date din PDF-urile avizelor de munca IGI si actualizeaza BD complet.

Format PDF real:
  LEADER INTERNATIONAL S.R.L.
  cu sediul/domiciliul în Ilfov
  nr. înreg. în Registrul Comerţului J23/778/2001 codul fiscal /CNP 5659739
  AVIZUL DE MUNCĂ nr. 2669382 din 10.03.2026
  lucrător PERMANENT / cod funcţie COR 911201 femeie de serviciu
  domnului/doamnei MAGAR SUSHMA
  născut/născută la 20.04.2002, CNP: 8020420050038 în NEPAL
  paşaport nr. PA0486752 eliberat de NEPAL
"""
import sys, io, asyncio, re, base64, uuid, unicodedata
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
from dotenv import load_dotenv
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
import pdfplumber

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')
ATLAS = "mongodb+srv://gjc_admin:GJC2026admin@cluster0.4l9rft3.mongodb.net/gjc_crm?retryWrites=true&w=majority&appName=Cluster0"
TOKEN_FILE = ROOT_DIR / 'gmail_token.json'
SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']
SEP = "=" * 70

def norm(t):
    if not t: return ''
    return unicodedata.normalize('NFD', str(t)).encode('ascii','ignore').decode('ascii').lower().strip()

def titlify(s):
    return ' '.join(w.capitalize() for w in str(s).strip().split()) if s else ''

def get_gmail():
    creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
    return build('gmail', 'v1', credentials=creds)

def pdf_to_text(pdf_bytes):
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            return '\n'.join(page.extract_text() or '' for page in pdf.pages)
    except:
        return ''

def parse_aviz(text):
    """Parseaza text din aviz IGI - format cunoscut"""
    d = {}
    t = text.replace('\n', ' ').strip()

    # Companie - apare dupa "de" si inainte de "cu sediul"
    m = re.search(r'depuse de (.+?)\s+cu sediul', t, re.IGNORECASE)
    if m:
        d['company_name'] = m.group(1).strip()

    # Sediu companie
    m = re.search(r'cu sediul/domiciliul [îiî]n (.+?)(?:nr\.|cod|,|$)', t, re.IGNORECASE)
    if m:
        d['company_city'] = m.group(1).strip()

    # Registrul Comertului
    m = re.search(r'Registrul Comer[^\s]* ([J-Z]\d+/\d+/\d+)', t, re.IGNORECASE)
    if m:
        d['company_reg'] = m.group(1).strip()

    # CUI / cod fiscal
    m = re.search(r'cod(?:ul)? fiscal\s*/CNP\s+(\d+)', t, re.IGNORECASE)
    if not m:
        m = re.search(r'codul fiscal\s+(\d+)', t, re.IGNORECASE)
    if m:
        d['company_cui'] = m.group(1).strip()

    # Numar aviz
    m = re.search(r'AVIZUL DE MUNC[AĂ]\s+nr\.\s*(\d+)', t, re.IGNORECASE)
    if m:
        d['aviz_number'] = m.group(1).strip()

    # Data aviz
    m = re.search(r'AVIZUL DE MUNC[AĂ]\s+nr\.\s*\d+\s+din\s+(\d{2}\.\d{2}\.\d{4})', t, re.IGNORECASE)
    if m:
        d['aviz_date'] = m.group(1).strip()

    # Tip munca (PERMANENT / SEZONIER)
    m = re.search(r'lucr[aă]tor\s+(PERMANENT|SEZONIER|DETASAT|DETAȘAT)', t, re.IGNORECASE)
    if m:
        d['work_type'] = m.group(1).strip()

    # Cod COR si functie
    m = re.search(r'cod func[tţ]ie COR\s+(\d+)\s+(.+?)(?:domnului|doamnei|$)', t, re.IGNORECASE)
    if m:
        d['cor_code'] = m.group(1).strip()
        d['job_type'] = m.group(2).strip()

    # Nume candidat
    m = re.search(r'domnului/doamnei\s+([A-Z][A-Z\s\-]+?)(?:\s+n[aă]scut|\s+CNP|\s*$)', t, re.IGNORECASE)
    if m:
        d['candidate_name'] = m.group(1).strip()

    # Data nasterii
    m = re.search(r'n[aă]scut[aă]?\s+la\s+(\d{2}\.\d{2}\.\d{4})', t, re.IGNORECASE)
    if m:
        d['birth_date'] = m.group(1).strip()

    # CNP
    m = re.search(r'CNP[:\s]+(\d{13})', t, re.IGNORECASE)
    if m:
        d['cnp'] = m.group(1).strip()

    # Tara nastere / nationalitate
    m = re.search(r'n[aă]scut[aă]?\s+la\s+\d{2}\.\d{2}\.\d{4}[,\s]+CNP[:\s]+\d+\s+[îiî]n\s+([A-Z][A-Z\s]+?)(?:\s+pa[sş]aport|\s*$)', t, re.IGNORECASE)
    if m:
        d['nationality'] = m.group(1).strip()

    # Pasaport
    m = re.search(r'pa[sş]aport\s+nr\.\s*([A-Z0-9]+)', t, re.IGNORECASE)
    if m:
        d['passport_number'] = m.group(1).strip()

    # Serviciul IGI (judet)
    m = re.search(r'Serviciul pentru Imigr[aă]ri\s+([A-Z][A-Z\s]+?)(?:\s+\d|$)', t, re.IGNORECASE)
    if m:
        d['igi_service'] = m.group(1).strip()

    # Numar cerere IGI
    m = re.search(r'cererii [îiî]nregistrate cu num[aă]rul\s+(\d+)\s+din\s+(\d{2}\.\d{2}\.\d{4})', t, re.IGNORECASE)
    if m:
        d['request_number'] = m.group(1).strip()
        d['request_date'] = m.group(2).strip()

    return d

async def run():
    print(SEP)
    print("GJC CRM - IMPORT COMPLET DATE DIN PDF AVIZE")
    print(SEP)

    service = get_gmail()
    client = AsyncIOMotorClient(ATLAS)
    db = client['gjc_crm_db']

    avize = await db.igi_emails.find({
        'category': 'aviz_emis',
        'attachments': {'$nin': [None, []]}
    }).to_list(length=None)

    print(f"Avize PDF de procesat: {len(avize)}")

    # Index companii si candidati existenti
    companies = await db.companies.find({}).to_list(length=None)
    comp_by_cui  = {c.get('cui', ''): c for c in companies if c.get('cui')}
    comp_by_name = {norm(c.get('name','')): c for c in companies}

    candidates = await db.candidates.find({}).to_list(length=None)
    cand_by_norm = {}
    for c in candidates:
        fn = norm(f"{c.get('first_name','')} {c.get('last_name','')}".strip())
        ln = norm(f"{c.get('last_name','')} {c.get('first_name','')}".strip())
        if fn: cand_by_norm[fn] = c
        if ln: cand_by_norm[ln] = c

    now = datetime.now(timezone.utc).isoformat()

    stats = {
        'pdf_parsed': 0,
        'pdf_errors': 0,
        'companies_new': 0,
        'companies_updated': 0,
        'candidates_updated': 0,
        'cases_updated': 0,
    }

    parsed_data = []

    # --- Pas 1: Descarca si parseaza toate PDF-urile ---
    print("\nPas 1: Descarca si parseaza PDF-uri...")
    for i, email in enumerate(avize):
        gmail_id = email.get('gmail_id')
        if not gmail_id:
            continue

        if (i+1) % 25 == 0:
            print(f"  {i+1}/{len(avize)} procesate...")

        try:
            msg = service.users().messages().get(userId='me', id=gmail_id, format='full').execute()
            parts = msg.get('payload', {}).get('parts', [])

            for part in parts:
                mime = part.get('mimeType', '')
                if mime in ('application/pdf', 'application/octet-stream') or part.get('filename','').endswith('.pdf'):
                    att_id = part.get('body', {}).get('attachmentId')
                    if not att_id:
                        continue

                    att = service.users().messages().attachments().get(
                        userId='me', messageId=gmail_id, id=att_id
                    ).execute()
                    pdf_bytes = base64.urlsafe_b64decode(att['data'])

                    text = pdf_to_text(pdf_bytes)
                    parsed = parse_aviz(text)

                    if parsed.get('candidate_name') or parsed.get('company_name'):
                        parsed['gmail_id'] = gmail_id
                        parsed['email_id'] = str(email['_id'])
                        m = re.search(r'Work permit (\d+)', part.get('filename',''))
                        if m:
                            parsed['work_permit_number'] = m.group(1)
                        parsed_data.append(parsed)
                        stats['pdf_parsed'] += 1
                    break
        except Exception as e:
            stats['pdf_errors'] += 1

    print(f"PDF-uri parsate cu succes: {stats['pdf_parsed']}, Erori: {stats['pdf_errors']}")

    if not parsed_data:
        print("Nicio data extrasa!")
        client.close()
        return

    # Arata statistici despre ce s-a extras
    has_company = sum(1 for d in parsed_data if d.get('company_name'))
    has_cand    = sum(1 for d in parsed_data if d.get('candidate_name'))
    has_passport= sum(1 for d in parsed_data if d.get('passport_number'))
    has_birth   = sum(1 for d in parsed_data if d.get('birth_date'))
    print(f"\nDate extrase: companie={has_company}, candidat={has_cand}, pasaport={has_passport}, nastere={has_birth}")

    # --- Pas 2: Actualizeaza companiile ---
    print("\nPas 2: Actualizeaza/adauga companii...")
    for d in parsed_data:
        if not d.get('company_name'):
            continue

        cui = d.get('company_cui', '')
        name = d.get('company_name', '')
        name_n = norm(name)

        # Gaseste compania
        company = None
        if cui and cui in comp_by_cui:
            company = comp_by_cui[cui]
        elif name_n in comp_by_name:
            company = comp_by_name[name_n]
        else:
            # Cauta partial
            for k, c in comp_by_name.items():
                if name_n[:10] in k or k[:10] in name_n:
                    company = c
                    break

        if company:
            upd = {}
            if cui and not company.get('cui'):
                upd['cui'] = cui
            if d.get('company_city') and not company.get('city'):
                upd['city'] = titlify(d['company_city'])
            if d.get('company_reg') and not company.get('reg_com'):
                upd['reg_com'] = d['company_reg']
            if upd:
                await db.companies.update_one({'id': company['id']}, {'$set': upd})
                stats['companies_updated'] += 1
            d['company_id'] = company['id']
            d['company_name_db'] = company.get('name', name)
        else:
            # Creeaza companie noua
            new_co = {
                'id': str(uuid.uuid4()),
                'name': name,
                'cui': cui,
                'city': titlify(d.get('company_city', '')),
                'reg_com': d.get('company_reg', ''),
                'industry': 'Servicii',
                'contact_person': '',
                'phone': '',
                'email': '',
                'status': 'activ',
                'notes': 'Importat din avize IGI',
                'created_at': now,
            }
            await db.companies.insert_one(new_co)
            comp_by_cui[cui] = new_co
            comp_by_name[name_n] = new_co
            d['company_id'] = new_co['id']
            d['company_name_db'] = name
            stats['companies_new'] += 1

    # --- Pas 3: Actualizeaza candidatii ---
    print("Pas 3: Actualizeaza candidati...")
    for d in parsed_data:
        if not d.get('candidate_name'):
            continue

        raw_name = d['candidate_name']
        name_n = norm(raw_name)

        # Gaseste candidat
        cand = None
        if name_n in cand_by_norm:
            cand = cand_by_norm[name_n]
        else:
            parts = name_n.split()
            if len(parts) >= 2:
                for key, c in cand_by_norm.items():
                    key_parts = key.split()
                    matches = sum(1 for p in parts if p in key_parts and len(p) > 2)
                    if matches >= 2:
                        cand = c
                        break

        if cand:
            upd = {}
            if d.get('passport_number') and (not cand.get('passport_number') or cand.get('passport_number') == 'None'):
                upd['passport_number'] = d['passport_number']
            if d.get('nationality') and not cand.get('nationality'):
                upd['nationality'] = titlify(d['nationality'])
            if d.get('job_type') and not cand.get('job_type'):
                upd['job_type'] = titlify(d['job_type'])
            if d.get('birth_date') and not cand.get('birth_date'):
                upd['birth_date'] = d['birth_date']
            if d.get('cnp') and not cand.get('cnp'):
                upd['cnp'] = d['cnp']
            if d.get('company_id') and not cand.get('company_id'):
                upd['company_id'] = d['company_id']
                upd['company_name'] = d.get('company_name_db', '')
            if upd:
                await db.candidates.update_one({'id': cand['id']}, {'$set': upd})
                stats['candidates_updated'] += 1
            d['candidate_id'] = cand['id']
        else:
            # Creeaza candidat nou din PDF
            name_parts = raw_name.strip().split()
            last  = titlify(name_parts[0]) if name_parts else ''
            first = titlify(' '.join(name_parts[1:])) if len(name_parts) > 1 else ''
            new_cand = {
                'id': str(uuid.uuid4()),
                'first_name': first,
                'last_name': last,
                'nationality': titlify(d.get('nationality', '')),
                'passport_number': d.get('passport_number', ''),
                'passport_expiry': None,
                'birth_date': d.get('birth_date', ''),
                'cnp': d.get('cnp', ''),
                'permit_expiry': None,
                'phone': None,
                'email': None,
                'job_type': titlify(d.get('job_type', '')),
                'status': 'activ',
                'company_id': d.get('company_id'),
                'company_name': d.get('company_name_db', ''),
                'notes': f"Importat din aviz IGI nr.{d.get('aviz_number','')} din {d.get('aviz_date','')}",
                'created_at': now,
            }
            await db.candidates.insert_one(new_cand)
            cand_by_norm[name_n] = new_cand
            d['candidate_id'] = new_cand['id']

    # --- Pas 4: Actualizeaza dosarele de imigrare ---
    print("Pas 4: Actualizeaza dosare imigrare...")
    cases = await db.immigration_cases.find({}).to_list(length=None)
    case_by_req = {c.get('igi_number','').strip(): c for c in cases if c.get('igi_number')}
    case_by_cand = {c.get('candidate_id',''): c for c in cases}

    for d in parsed_data:
        req_nr = d.get('request_number')
        cand_id = d.get('candidate_id')

        # Gaseste dosarul
        case = None
        if req_nr and req_nr in case_by_req:
            case = case_by_req[req_nr]
        elif cand_id and cand_id in case_by_cand:
            case = case_by_cand[cand_id]

        upd = {
            'current_stage': 4,
            'current_stage_name': 'Permis Munca Aprobat',
            'status': 'aprobat',
            'igi_email_category': 'aviz_emis',
            'updated_at': now,
        }
        if req_nr:
            upd['igi_number'] = req_nr
        if d.get('aviz_number'):
            upd['aviz_number'] = d['aviz_number']
        if d.get('aviz_date'):
            upd['aviz_date'] = d['aviz_date']
        if d.get('work_permit_number'):
            upd['work_permit_number'] = d['work_permit_number']
        if d.get('job_type'):
            upd['job_type'] = d['job_type']
        if d.get('company_id') and cand_id:
            upd['company_id'] = d['company_id']
            upd['company_name'] = d.get('company_name_db', '')

        if case:
            await db.immigration_cases.update_one({'id': case['id']}, {'$set': upd})
            stats['cases_updated'] += 1
        elif cand_id:
            # Creeaza dosar nou cu datele din aviz
            new_case = {
                'id': str(uuid.uuid4()),
                'candidate_id': cand_id,
                'candidate_name': d.get('candidate_name', ''),
                'case_type': 'Permis de munca',
                'submitted_date': d.get('request_date', now[:10]),
                'deadline': None,
                'assigned_to': 'Ioan Baciu',
                'documents_total': 0,
                'documents_complete': 0,
                'created_at': now,
                **upd
            }
            await db.immigration_cases.insert_one(new_case)
            case_by_cand[cand_id] = new_case
            stats['cases_updated'] += 1

    # --- Raport final ---
    total_comp  = await db.companies.count_documents({})
    total_cands = await db.candidates.count_documents({})
    total_cases = await db.immigration_cases.count_documents({})

    print(f"\n{SEP}")
    print("RAPORT FINAL - DATE IMPORTATE DIN PDF AVIZE")
    print(SEP)
    print(f"  PDF-uri parsate:              {stats['pdf_parsed']}")
    print(f"  Companii noi adaugate:        {stats['companies_new']}")
    print(f"  Companii actualizate (CUI+):  {stats['companies_updated']}")
    print(f"  Candidati actualizati:        {stats['candidates_updated']}")
    print(f"  Dosare actualizate/create:    {stats['cases_updated']}")
    print(f"\n  Total companii in BD:  {total_comp}")
    print(f"  Total candidati in BD: {total_cands}")
    print(f"  Total dosare in BD:    {total_cases}")

    # Arata primele 10 avize parsate
    print(f"\nExemple avize parsate:")
    for d in parsed_data[:5]:
        print(f"  {d.get('candidate_name','?'):30} | {d.get('company_name','?'):35} | aviz {d.get('aviz_number','?')} din {d.get('aviz_date','?')}")

    client.close()
    print("\nGata!")

asyncio.run(run())
