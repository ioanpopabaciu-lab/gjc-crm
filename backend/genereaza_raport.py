"""
Genereaza raport complet din baza de date
"""
import sys, io, asyncio, unicodedata
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
from pathlib import Path

ATLAS_URL = "mongodb+srv://gjc_admin:GJC2026admin@cluster0.4l9rft3.mongodb.net/gjc_crm?retryWrites=true&w=majority&appName=Cluster0"
SEP = "=" * 70

async def run():
    client = AsyncIOMotorClient(ATLAS_URL)
    db = client['gjc_crm_db']

    all_records = await db.igi_emails.find({}).to_list(length=None)
    print(f"Total inregistrari in BD: {len(all_records)}")

    avize_emise = [r for r in all_records if r.get('category') in ('aviz_emis', 'document_ghiseu')]
    solutionate = [r for r in all_records if r.get('category') == 'solutionata']
    programari  = [r for r in all_records if r.get('category') == 'programare']
    anulate     = [r for r in all_records if r.get('category') == 'anulata']
    in_procesare= [r for r in all_records if r.get('category') in ('in_procesare', 'transmisa')]

    print(f"\n{SEP}")
    print("RAPORT FINAL")
    print(SEP)
    print(f"  Avize de munca emise (PDF + Document la ghiseu): {len(avize_emise)}")
    print(f"  Solutionate (aprobate, permis in pregatire)    : {len(solutionate)}")
    print(f"  Programari                                     : {len(programari)}")
    print(f"  Anulate                                        : {len(anulate)}")
    print(f"  In procesare                                   : {len(in_procesare)}")

    rpath = Path(__file__).parent / 'RAPORT_IGI_FINAL.txt'
    with open(rpath, 'w', encoding='utf-8') as f:
        f.write(f"RAPORT IGI - {datetime.now().strftime('%d.%m.%Y %H:%M')}\n{SEP}\n\n")
        f.write(f"AVIZE EMISE: {len(avize_emise)}\n")
        f.write(f"SOLUTIONATE: {len(solutionate)}\n")
        f.write(f"PROGRAMARI: {len(programari)}\n")
        f.write(f"ANULATE: {len(anulate)}\n")
        f.write(f"IN PROCESARE: {len(in_procesare)}\n\n")

        # AVIZE EMISE
        f.write(f"\nAVIZE DE MUNCA EMISE ({len(avize_emise)}):\n{SEP}\n")
        for e in sorted(avize_emise, key=lambda x: str(x.get('date','')), reverse=True):
            cat  = str(e.get('category',''))
            nr   = str(e.get('igi_number') or '?')
            nume = str(e.get('candidate_name') or 'N/A')
            data = str(e.get('date',''))[:16]
            att  = ', '.join(e.get('attachments',[]))
            f.write(f"[{cat:15}] Nr IGI: {nr:12} | Candidat: {nume:40} | Data: {data} | {att}\n")

        # SOLUTIONATE
        f.write(f"\nSOLUTIONATE - aprobate, permis in pregatire ({len(solutionate)}):\n{SEP}\n")
        for e in sorted(solutionate, key=lambda x: str(x.get('date','')), reverse=True):
            nr   = str(e.get('igi_number') or '?')
            nume = str(e.get('candidate_name') or 'N/A')
            data = str(e.get('date',''))[:16]
            stat = str(e.get('status_raw') or '')
            f.write(f"Nr IGI: {nr:12} | Candidat: {nume:40} | Data: {data} | Status: {stat}\n")

        # PROGRAMARI
        f.write(f"\nPROGRAMARI ({len(programari)}):\n{SEP}\n")
        for e in sorted(programari, key=lambda x: str(x.get('date','')), reverse=True):
            nr   = str(e.get('igi_number') or '?')
            nume = str(e.get('candidate_name') or 'N/A')
            appt = str(e.get('appointment_date') or '?')
            ora  = str(e.get('appointment_time') or '?')
            data = str(e.get('date',''))[:16]
            f.write(f"Nr IGI: {nr:12} | Candidat: {nume:40} | Programare: {appt} ora {ora} | Email: {data}\n")

        # ANULATE
        f.write(f"\nANULATE ({len(anulate)}):\n{SEP}\n")
        for e in anulate:
            nr   = str(e.get('igi_number') or '?')
            nume = str(e.get('candidate_name') or 'N/A')
            stat = str(e.get('status_raw') or '')
            f.write(f"Nr IGI: {nr:12} | Candidat: {nume:40} | Motiv: {stat}\n")

        # IN PROCESARE
        f.write(f"\nIN PROCESARE / TRANSMISE ({len(in_procesare)}):\n{SEP}\n")
        for e in in_procesare:
            nr   = str(e.get('igi_number') or '?')
            nume = str(e.get('candidate_name') or 'N/A')
            stat = str(e.get('status_raw') or '')
            f.write(f"Nr IGI: {nr:12} | Candidat: {nume:40} | Status: {stat}\n")

    print(f"\nRaport salvat: {rpath}")
    client.close()

asyncio.run(run())
