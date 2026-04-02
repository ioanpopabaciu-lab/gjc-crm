"""
Descarca PDF-urile pentru companiile care inca nu au CUI
si actualizeaza cu fuzzy matching mai bun
"""
import sys, io, asyncio, re, base64, unicodedata, uuid
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
    t = unicodedata.normalize('NFD', str(t)).encode('ascii','ignore').decode('ascii')
    t = re.sub(r'[^\w\s]', '', t.lower())
    return ' '.join(t.split())

def similarity(a, b):
    """Similitudine simpla intre doua stringuri"""
    a_words = set(norm(a).split())
    b_words = set(norm(b).split())
    if not a_words or not b_words: return 0
    # Elimina cuvinte comune fara sens
    stop = {'srl','sa','ra','srl','snc','scs','ii','if','sna','pfa','the','and'}
    a_words -= stop
    b_words -= stop
    if not a_words or not b_words: return 0
    common = a_words & b_words
    return len(common) / max(len(a_words), len(b_words))

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

def parse_company_from_aviz(text):
    t = text.replace('\n', ' ')
    d = {}
    m = re.search(r'depuse de (.+?)\s+cu sediul', t, re.IGNORECASE)
    if m: d['name'] = m.group(1).strip()
    m = re.search(r'cu sediul/domiciliul [îiî]n (.+?)(?:nr\.|cod|,|Registrul|$)', t, re.IGNORECASE)
    if m: d['city'] = m.group(1).strip().rstrip()
    m = re.search(r'cod(?:ul)? fiscal\s*/CNP\s+(\d+)', t, re.IGNORECASE)
    if not m: m = re.search(r'codul fiscal\s+(\d+)', t, re.IGNORECASE)
    if m: d['cui'] = m.group(1).strip()
    m = re.search(r'Registrul Comer[^\s]* ([J-Z]\d+/\d+/\d+)', t, re.IGNORECASE)
    if m: d['reg_com'] = m.group(1).strip()
    return d

async def run():
    print(SEP)
    print("FIX COMPANII - COMPLETARE CUI DIN PDF AVIZE")
    print(SEP)

    service = get_gmail()
    client = AsyncIOMotorClient(ATLAS)
    db = client['gjc_crm_db']

    # Companiile fara CUI
    all_companies = await db.companies.find({}).to_list(length=None)
    no_cui = [c for c in all_companies if not c.get('cui') or str(c.get('cui','')).strip() in ['', '-', 'None']]
    print(f"Companii fara CUI: {len(no_cui)}")

    # Avize disponibile
    avize = await db.igi_emails.find({
        'category': 'aviz_emis',
        'attachments': {'$nin': [None, []]}
    }).to_list(length=None)
    print(f"Avize PDF disponibile: {len(avize)}")

    # --- Descarca si parseaza TOATE PDF-urile, salveaza company data ---
    print("\nExtragere date companii din PDF-uri...")
    pdf_companies = {}  # company_name_norm -> {name, cui, city, reg_com}

    for i, email in enumerate(avize):
        gmail_id = email.get('gmail_id')
        if not gmail_id: continue
        if (i+1) % 30 == 0:
            print(f"  {i+1}/{len(avize)}...")
        try:
            msg = service.users().messages().get(userId='me', id=gmail_id, format='full').execute()
            for part in msg.get('payload', {}).get('parts', []):
                if part.get('filename','').endswith('.pdf') or part.get('mimeType') == 'application/pdf':
                    att_id = part.get('body',{}).get('attachmentId')
                    if not att_id: continue
                    att = service.users().messages().attachments().get(
                        userId='me', messageId=gmail_id, id=att_id
                    ).execute()
                    pdf_bytes = base64.urlsafe_b64decode(att['data'])
                    text = pdf_to_text(pdf_bytes)
                    comp_data = parse_company_from_aviz(text)
                    if comp_data.get('name') and comp_data.get('cui'):
                        key = norm(comp_data['name'])
                        pdf_companies[key] = comp_data
                    break
        except:
            pass

    print(f"Companii unice gasite in PDF-uri: {len(pdf_companies)}")
    print("\nLista companii din PDF-uri (cu CUI):")
    for k, v in sorted(pdf_companies.items()):
        print(f"  {v.get('name','?'):45} CUI: {v.get('cui','?'):10} {v.get('city','')}")

    # --- Potriveste companiile fara CUI cu datele din PDF ---
    print(f"\nPotrivire companii fara CUI...")
    updated = 0
    merged = 0
    now = datetime.now(timezone.utc).isoformat()

    for db_company in no_cui:
        db_name = db_company.get('name', '')
        best_match = None
        best_score = 0

        for pdf_key, pdf_data in pdf_companies.items():
            score = similarity(db_name, pdf_data.get('name',''))
            if score > best_score:
                best_score = score
                best_match = pdf_data

        if best_match and best_score >= 0.4:
            print(f"  MATCH ({best_score:.0%}): '{db_name}' -> '{best_match['name']}' CUI:{best_match.get('cui','')}")
            upd = {}
            if best_match.get('cui'):
                upd['cui'] = best_match['cui']
            if best_match.get('city') and not db_company.get('city'):
                city = best_match['city'].strip()
                upd['city'] = city.capitalize() if city else ''
            if best_match.get('reg_com') and not db_company.get('reg_com'):
                upd['reg_com'] = best_match['reg_com']
            if upd:
                await db.companies.update_one({'id': db_company['id']}, {'$set': upd})
                updated += 1

            # Merge duplicate: daca exista compania cu CUI deja in DB (din avize),
            # actualizeaza toti candidatii sa foloseasca aceasta companie
            existing_with_cui = next(
                (c for c in all_companies
                 if c.get('cui') == best_match.get('cui') and c['id'] != db_company['id']),
                None
            )
            if existing_with_cui:
                # Muta candidatii de la compania fara CUI la cea cu CUI
                res = await db.candidates.update_many(
                    {'company_id': db_company['id']},
                    {'$set': {'company_id': existing_with_cui['id'],
                              'company_name': existing_with_cui['name']}}
                )
                if res.modified_count > 0:
                    print(f"    -> Mutat {res.modified_count} candidati la '{existing_with_cui['name']}'")
                    merged += 1
        else:
            if best_score > 0.2:
                print(f"  SKIP  ({best_score:.0%}): '{db_name}' cel mai aproape de '{best_match['name'] if best_match else '?'}'")

    print(f"\n{SEP}")
    print("REZULTATE")
    print(SEP)
    print(f"  Companii actualizate cu CUI: {updated}")
    print(f"  Duplicate rezolvate:         {merged}")

    # Statistici finale
    total_comp = await db.companies.count_documents({})
    comp_cu_cui = await db.companies.count_documents({'cui': {'$nin': [None, '', '-']}})
    print(f"\n  Total companii: {total_comp}")
    print(f"  Cu CUI:         {comp_cu_cui}")
    print(f"  Fara CUI:       {total_comp - comp_cu_cui}")

    client.close()
    print("\nGata!")

asyncio.run(run())
