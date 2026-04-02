import sys, io, asyncio, unicodedata
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from motor.motor_asyncio import AsyncIOMotorClient

ATLAS_URL = "mongodb+srv://gjc_admin:GJC2026admin@cluster0.4l9rft3.mongodb.net/gjc_crm?retryWrites=true&w=majority&appName=Cluster0"
SEP = "=" * 65

def normalize(text):
    if not text: return ''
    return unicodedata.normalize('NFD', text).encode('ascii', 'ignore').decode('ascii').lower()

async def analyze():
    client = AsyncIOMotorClient(ATLAS_URL)
    db = client['gjc_crm_db']

    all_emails = await db.igi_emails.find({}).to_list(length=None)
    print(f"Total emailuri in baza de date: {len(all_emails)}\n")

    avize_emise = []
    programari = []
    in_procesare = []
    respinse = []
    inregistrate = []
    alte = []

    for e in all_emails:
        status_n = normalize(e.get('status_raw', '') or '')
        subj_n   = normalize(e.get('subject', '') or '')

        if any(x in status_n for x in ['ghiseu', 'aprobat', 'emis', 'acordat', 'favorabil']):
            avize_emise.append(e)
        elif any(x in status_n for x in ['respins', 'neconform', 'suspendat', 'nefavorabil']):
            respinse.append(e)
        elif any(x in status_n for x in ['programat', 'programare']):
            programari.append(e)
        elif any(x in status_n for x in ['curs', 'analiz', 'solutionare']):
            in_procesare.append(e)
        elif any(x in status_n for x in ['inregistrat', 'depus']) or ('confirmare' in subj_n and 'profil' in subj_n):
            inregistrate.append(e)
        else:
            alte.append(e)

    # SUMAR
    print(SEP)
    print("RAPORT FINAL - EMAILURI IGI")
    print(SEP)
    print(f"  Avize de munca emise (Document la ghiseu) : {len(avize_emise)}")
    print(f"  Dosare programate                         : {len(programari)}")
    print(f"  Dosare in procesare                       : {len(in_procesare)}")
    print(f"  Dosare respinse / neconforme              : {len(respinse)}")
    print(f"  Profiluri inregistrate                    : {len(inregistrate)}")
    print(f"  Alte emailuri (auth, CUI, diverse)        : {len(alte)}")

    # AVIZE EMISE
    print(f"\n{SEP}")
    print(f"AVIZE DE MUNCA EMISE - LISTA COMPLETA ({len(avize_emise)})")
    print(SEP)
    for e in sorted(avize_emise, key=lambda x: x.get('date', ''), reverse=True):
        nr   = str(e.get('igi_number') or '?')
        nume = str(e.get('candidate_name') or 'N/A')
        data = str(e.get('date', ''))[:16]
        stat = str(e.get('status_raw') or '')
        print(f"  Nr.IGI {nr:10} | {nume:35} | {data} | {stat}")

    # PROGRAMARI
    print(f"\n{SEP}")
    print(f"DOSARE PROGRAMATE - LISTA COMPLETA ({len(programari)})")
    print(SEP)
    for e in sorted(programari, key=lambda x: x.get('date', ''), reverse=True):
        nr   = str(e.get('igi_number') or '?')
        nume = str(e.get('candidate_name') or 'N/A')
        appt = str(e.get('appointment_date') or '(vezi email)')
        ora  = str(e.get('appointment_time') or '')
        print(f"  Nr.IGI {nr:10} | {nume:35} | Data programare: {appt} {ora}")

    # RESPINSE
    if respinse:
        print(f"\n{SEP}")
        print(f"DOSARE RESPINSE / NECONFORME ({len(respinse)})")
        print(SEP)
        for e in respinse:
            nr   = str(e.get('igi_number') or '?')
            nume = str(e.get('candidate_name') or 'N/A')
            stat = str(e.get('status_raw') or '')
            print(f"  Nr.IGI {nr:10} | {nume:35} | {stat}")

    # IN PROCESARE (primele 30)
    print(f"\n{SEP}")
    print(f"DOSARE IN PROCESARE ({len(in_procesare)}) - primele 30:")
    print(SEP)
    for e in in_procesare[:30]:
        nr   = str(e.get('igi_number') or '?')
        nume = str(e.get('candidate_name') or 'N/A')
        stat = str(e.get('status_raw') or '')
        print(f"  Nr.IGI {nr:10} | {nume:35} | {stat}")

    # Salveaza raport text complet
    from pathlib import Path
    from datetime import datetime
    report_path = Path(__file__).parent / 'RAPORT_IGI_FINAL.txt'
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write(f"RAPORT COMPLET EMAILURI IGI - {datetime.now().strftime('%d.%m.%Y %H:%M')}\n")
        f.write(f"{SEP}\n\n")
        f.write(f"Total emailuri: {len(all_emails)}\n")
        f.write(f"Avize emise: {len(avize_emise)}\n")
        f.write(f"Programari: {len(programari)}\n")
        f.write(f"Respinse: {len(respinse)}\n")
        f.write(f"In procesare: {len(in_procesare)}\n\n")

        f.write(f"\nAVIZE DE MUNCA EMISE ({len(avize_emise)}):\n{SEP}\n")
        for e in sorted(avize_emise, key=lambda x: x.get('date',''), reverse=True):
            f.write(f"Nr IGI: {e.get('igi_number','?')} | Candidat: {e.get('candidate_name','N/A')} | Data email: {str(e.get('date',''))[:16]} | Status: {e.get('status_raw','')}\n")

        f.write(f"\nPROGRAMARI ({len(programari)}):\n{SEP}\n")
        for e in sorted(programari, key=lambda x: x.get('date',''), reverse=True):
            f.write(f"Nr IGI: {e.get('igi_number','?')} | Candidat: {e.get('candidate_name','N/A')} | Data programare: {e.get('appointment_date','?')} ora {e.get('appointment_time','?')}\n")

        f.write(f"\nRESPINSE ({len(respinse)}):\n{SEP}\n")
        for e in respinse:
            f.write(f"Nr IGI: {e.get('igi_number','?')} | Candidat: {e.get('candidate_name','N/A')} | Motiv: {e.get('status_raw','')}\n")

        f.write(f"\nIN PROCESARE ({len(in_procesare)}):\n{SEP}\n")
        for e in in_procesare:
            f.write(f"Nr IGI: {e.get('igi_number','?')} | Candidat: {e.get('candidate_name','N/A')} | Status: {e.get('status_raw','')}\n")

    print(f"\nRaport complet salvat: {report_path}")
    client.close()

asyncio.run(analyze())
