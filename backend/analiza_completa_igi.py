"""
Analiza completa si corecta a tuturor emailurilor IGI
Cauta: avize emise, programari, solutionate, anulate
"""
import sys, io, asyncio, re, unicodedata
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from gmail_integration import get_gmail_service, extract_email_body
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone
from pathlib import Path
from collections import defaultdict

ATLAS_URL = "mongodb+srv://gjc_admin:GJC2026admin@cluster0.4l9rft3.mongodb.net/gjc_crm?retryWrites=true&w=majority&appName=Cluster0"
SEP = "=" * 70

def norm(text):
    if not text: return ''
    return unicodedata.normalize('NFD', str(text)).encode('ascii','ignore').decode('ascii').lower()

def extract_name_from_body(body):
    patterns = [
        r'Stimat\S*\s*/\s*Stimat\S*\s+([A-Z][A-Z\s\-\.]+?)\s*(?:<br|Solicitare|,|\n)',
        r'pentru\s+(?:dl\.?|dna\.?)?\s*([A-Z][A-Z\s\-]+?)(?:\s*,|\s*<|\s*\n)',
        r'Doamnei?/Domnului\s+([A-Z][A-Z\s\-]+?)(?:\s*,|\s*<)',
    ]
    for p in patterns:
        m = re.search(p, body, re.IGNORECASE)
        if m:
            name = m.group(1).strip().rstrip('.,')
            if len(name) > 3:
                return name
    return None

def extract_igi_number(subject, body):
    for text in [subject, body]:
        m = re.search(r'solicitare[:\s#]+(\d+)', text, re.IGNORECASE)
        if m: return m.group(1)
        m = re.search(r'nr\.?\s*dosar\s*:?\s*(\d+)', text, re.IGNORECASE)
        if m: return m.group(1)
    return None

def extract_date_request(body):
    m = re.search(r'din data\s+(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4})', body, re.IGNORECASE)
    if m: return m.group(1)
    m = re.search(r'data\s+(?:cererii|solicitarii)\s*:?\s*(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4})', body, re.IGNORECASE)
    if m: return m.group(1)
    return None

def extract_appointment_info(body):
    """Extrage data si ora programarii"""
    patterns = [
        r'(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4}),?\s*ora\s+(\d{1,2}[:.]\d{2})',
        r'data\s*:?\s*(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4}).*?ora\s*:?\s*(\d{1,2}[:.]\d{2})',
        r'programat[a]?\s+(?:pentru\s+)?(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4})',
        r'v[aă]\s+(?:rug[aă]m|invit[aă]m)\s+.{0,50}?(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4})',
    ]
    for p in patterns:
        m = re.search(p, body, re.IGNORECASE | re.DOTALL)
        if m:
            date = m.group(1)
            time = m.group(2) if m.lastindex >= 2 else None
            return date, time
    return None, None

def get_attachment_names(msg_data):
    """Extrage numele fisierelor atasate"""
    attachments = []
    def scan_parts(parts):
        for part in parts:
            filename = part.get('filename','')
            if filename:
                attachments.append(filename)
            if 'parts' in part:
                scan_parts(part['parts'])
    if 'parts' in msg_data.get('payload',{}):
        scan_parts(msg_data['payload']['parts'])
    return attachments

async def run():
    print(SEP)
    print("GJC CRM - ANALIZA COMPLETA SI CORECTA EMAILURI IGI")
    print(SEP)

    service = get_gmail_service()
    client = AsyncIOMotorClient(ATLAS_URL)
    db = client['gjc_crm_db']

    # ── Descarca TOATE emailurile cu paginare ──
    print("\nDescarcare emailuri de la portaligi@roimigrari.eu...")
    all_msgs = []
    page_token = None
    while True:
        kwargs = {'userId':'me','q':'from:portaligi@roimigrari.eu','maxResults':500}
        if page_token: kwargs['pageToken'] = page_token
        resp = service.users().messages().list(**kwargs).execute()
        msgs = resp.get('messages',[])
        all_msgs.extend(msgs)
        page_token = resp.get('nextPageToken')
        if not page_token: break
    print(f"Total emailuri: {len(all_msgs)}")

    # ── Categorii rezultat ──
    avize_emise = []
    programari = []
    solutionate = []
    in_procesare = []
    anulate = []
    inregistrate = []
    alte = []

    print(f"\nProcesare {len(all_msgs)} emailuri...\n")

    for i, msg in enumerate(all_msgs, 1):
        if i % 100 == 0:
            print(f"  Progres: {i}/{len(all_msgs)} ({int(i/len(all_msgs)*100)}%)")
        try:
            m = service.users().messages().get(
                userId='me', id=msg['id'], format='full'
            ).execute()
            headers = {h['name']: h['value'] for h in m['payload']['headers']}
            subject = headers.get('Subject','')
            sender  = headers.get('From','')
            to_field= headers.get('To','')
            date    = headers.get('Date','')
            body    = extract_email_body(m)
            attachments = get_attachment_names(m)

            subj_n = norm(subject)
            body_clean = body.replace('<br/>','  ').replace('<br>','  ')

            record = {
                'gmail_id': msg['id'],
                'subject': subject,
                'date': date,
                'sender': sender,
                'to': to_field,
                'body_preview': body_clean[:600],
                'attachments': attachments,
                'igi_number': extract_igi_number(subject, body_clean),
                'candidate_name': extract_name_from_body(body),
                'request_date': extract_date_request(body_clean),
                'status_raw': None,
                'appointment_date': None,
                'appointment_time': None,
                'category': 'necunoscut',
                'imported_at': datetime.now(timezone.utc).isoformat()
            }

            # Status din body
            m_stat = re.search(r'trecut[^\n]*?stare[a]?\s+(.+?)(?:\.|$)', body_clean, re.IGNORECASE)
            if m_stat:
                record['status_raw'] = m_stat.group(1).strip().rstrip('.')
            status_n = norm(record['status_raw'] or '')

            # ── CLASIFICARE CORECTA ──

            # 1. AVIZ EMIS - emailuri cu PDF atasat "Aviz de munca"
            if 'aviz de munc' in subj_n or 'work permit' in subj_n:
                record['category'] = 'aviz_emis'
                # Extrage numele din camp To: sau din attachment
                if not record['candidate_name']:
                    # Incearca din To: field - format "NUME PRENUME <email>"
                    to_name = re.search(r'^([A-Z][A-Z\s]+?)\s*<', to_field)
                    if to_name:
                        record['candidate_name'] = to_name.group(1).strip()
                    # Sau din attachment name
                    for att in attachments:
                        att_name = re.sub(r'\.(pdf|PDF)$','', att)
                        att_name = re.sub(r'aviz[_\-\s]*de[_\-\s]*munca[_\-\s]*','', att_name, flags=re.IGNORECASE)
                        att_name = att_name.strip('_- ')
                        if len(att_name) > 3:
                            record['candidate_name'] = att_name
                            break
                avize_emise.append(record)

            # 2. SOLUTIONATA - permis aprobat, se ridica in 8 zile
            elif 'solu' in status_n:
                record['category'] = 'solutionata'
                solutionate.append(record)

            # 3. DOCUMENT LA GHISEU - permis gata de ridicat
            elif 'ghiseu' in status_n or 'document la ghi' in norm(body):
                record['category'] = 'document_ghiseu'
                avize_emise.append(record)  # Adaugam si la avize

            # 4. PROGRAMARE
            elif any(x in subj_n for x in ['programare','appointment']) or \
                 any(x in status_n for x in ['programat','programare']):
                appt_date, appt_time = extract_appointment_info(body_clean)
                record['appointment_date'] = appt_date
                record['appointment_time'] = appt_time
                record['category'] = 'programare'
                programari.append(record)

            # 5. IN PROCESARE
            elif any(x in status_n for x in ['curs','analiz','solutionare','verificare']):
                record['category'] = 'in_procesare'
                in_procesare.append(record)

            # 6. TRANSMISA - dosar trimis spre analiza
            elif 'transmis' in status_n:
                record['category'] = 'transmisa'
                in_procesare.append(record)

            # 7. ANULATA
            elif 'anulat' in status_n:
                record['category'] = 'anulata'
                anulate.append(record)

            # 8. CONFIRMARE INREGISTRARE
            elif 'confirmare' in subj_n and 'profil' in subj_n:
                record['category'] = 'inregistrare_profil'
                inregistrate.append(record)

            # 9. ALTELE
            else:
                record['category'] = 'alta'
                alte.append(record)

        except Exception as e:
            pass

    # ── Salveaza in BD ──
    print("\nSalvare in baza de date...")
    all_records = avize_emise + solutionate + in_procesare + programari + anulate + inregistrate + alte
    await db.igi_emails.drop()
    if all_records:
        await db.igi_emails.insert_many(all_records)
    print(f"Salvate: {len(all_records)} inregistrari")

    # ── RAPORT ──
    print(f"\n{SEP}")
    print("RAPORT FINAL CORECT")
    print(SEP)
    print(f"  Avize de munca emise (PDF + Document la ghiseu) : {len(avize_emise)}")
    print(f"  Solutionate (aprobate, in asteptare 8 zile)     : {len(solutionate)}")
    print(f"  Dosare in procesare / transmise                 : {len(in_procesare)}")
    print(f"  Dosare programate                               : {len(programari)}")
    print(f"  Dosare anulate                                  : {len(anulate)}")
    print(f"  Inregistrari profil                             : {len(inregistrate)}")
    print(f"  Altele (auth codes, CUI, etc)                   : {len(alte)}")

    print(f"\n{SEP}")
    print(f"AVIZE DE MUNCA EMISE - LISTA COMPLETA ({len(avize_emise)})")
    print(SEP)
    for e in sorted(avize_emise, key=lambda x: x.get('date',''), reverse=True):
        nr   = str(e.get('igi_number') or '?')
        nume = str(e.get('candidate_name') or 'N/A')
        data = str(e.get('date',''))[:16]
        cat  = e.get('category','')
        att  = ', '.join(e.get('attachments',[]))[:40]
        print(f"  [{cat:15}] Nr.IGI {nr:10} | {nume:35} | {data} | {att}")

    print(f"\n{SEP}")
    print(f"SOLUTIONATE - aprobate, permis in pregatire ({len(solutionate)})")
    print(SEP)
    for e in sorted(solutionate, key=lambda x: x.get('date',''), reverse=True):
        print(f"  Nr.IGI {str(e.get('igi_number') or '?'):10} | {str(e.get('candidate_name') or 'N/A'):35} | {str(e.get('date',''))[:16]}")

    print(f"\n{SEP}")
    print(f"DOSARE PROGRAMATE ({len(programari)})")
    print(SEP)
    for e in sorted(programari, key=lambda x: x.get('date',''), reverse=True):
        appt = f"{e.get('appointment_date','?')} ora {e.get('appointment_time','?')}"
        print(f"  Nr.IGI {str(e.get('igi_number') or '?'):10} | {str(e.get('candidate_name') or 'N/A'):35} | {appt}")

    if anulate:
        print(f"\n{SEP}")
        print(f"DOSARE ANULATE ({len(anulate)})")
        print(SEP)
        for e in anulate:
            print(f"  Nr.IGI {str(e.get('igi_number') or '?'):10} | {str(e.get('candidate_name') or 'N/A'):35} | {e.get('status_raw','')}")

    # Salveaza raport txt
    rpath = Path(__file__).parent / 'RAPORT_IGI_FINAL.txt'
    with open(rpath, 'w', encoding='utf-8') as f:
        f.write(f"RAPORT IGI - {datetime.now().strftime('%d.%m.%Y %H:%M')}\n{SEP}\n\n")
        f.write(f"AVIZE EMISE: {len(avize_emise)}\nSOLUTIONATE: {len(solutionate)}\nPROGRAMARI: {len(programari)}\nANULATE: {len(anulate)}\nIN PROCESARE: {len(in_procesare)}\n\n")

        f.write(f"\nAVIZE DE MUNCA EMISE ({len(avize_emise)}):\n{SEP}\n")
        for e in sorted(avize_emise, key=lambda x: x.get('date',''), reverse=True):
            f.write(f"Nr IGI: {e.get('igi_number','?'):10} | Candidat: {str(e.get('candidate_name','N/A')):35} | Data: {str(e.get('date',''))[:16]} | Atasament: {', '.join(e.get('attachments',[]))}\n")

        f.write(f"\nSOLUTIONATE ({len(solutionate)}):\n{SEP}\n")
        for e in sorted(solutionate, key=lambda x: x.get('date',''), reverse=True):
            f.write(f"Nr IGI: {e.get('igi_number','?'):10} | Candidat: {str(e.get('candidate_name','N/A')):35} | Data: {str(e.get('date',''))[:16]}\n")

        f.write(f"\nPROGRAMARI ({len(programari)}):\n{SEP}\n")
        for e in sorted(programari, key=lambda x: x.get('date',''), reverse=True):
            f.write(f"Nr IGI: {e.get('igi_number','?'):10} | Candidat: {str(e.get('candidate_name','N/A')):35} | Data programare: {e.get('appointment_date','?')} ora {e.get('appointment_time','?')}\n")

        f.write(f"\nANULATE ({len(anulate)}):\n{SEP}\n")
        for e in anulate:
            f.write(f"Nr IGI: {e.get('igi_number','?'):10} | Candidat: {str(e.get('candidate_name','N/A')):35} | Motiv: {e.get('status_raw','')}\n")

        f.write(f"\nIN PROCESARE ({len(in_procesare)}):\n{SEP}\n")
        for e in in_procesare:
            f.write(f"Nr IGI: {e.get('igi_number','?'):10} | Candidat: {str(e.get('candidate_name','N/A')):35} | Status: {e.get('status_raw','')}\n")

    print(f"\nRaport salvat: {rpath}")
    client.close()

asyncio.run(run())
