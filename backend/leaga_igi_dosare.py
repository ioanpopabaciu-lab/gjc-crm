"""
Leaga emailurile IGI de dosarele de imigrare existente
Actualizeaza statusul fiecarui dosar pe baza celui mai recent email IGI
"""
import sys, io, asyncio, unicodedata, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone

ATLAS_URL = "mongodb+srv://gjc_admin:GJC2026admin@cluster0.4l9rft3.mongodb.net/gjc_crm?retryWrites=true&w=majority&appName=Cluster0"
SEP = "=" * 70

def norm(text):
    if not text: return ''
    return unicodedata.normalize('NFD', str(text)).encode('ascii','ignore').decode('ascii').lower().strip()

# Mapare categorie IGI -> etapa CRM
CATEGORY_TO_STAGE = {
    'aviz_emis':       {'stage': 4, 'stage_name': 'Permis Munca Aprobat', 'status': 'aprobat'},
    'document_ghiseu': {'stage': 4, 'stage_name': 'Permis Munca Aprobat', 'status': 'aprobat'},
    'solutionata':     {'stage': 4, 'stage_name': 'Permis Munca Aprobat', 'status': 'aprobat'},
    'programare':      {'stage': 3, 'stage_name': 'Permis Munca Depus',   'status': 'in procesare'},
    'in_procesare':    {'stage': 3, 'stage_name': 'Permis Munca Depus',   'status': 'in procesare'},
    'transmisa':       {'stage': 3, 'stage_name': 'Permis Munca Depus',   'status': 'in procesare'},
    'anulata':         {'stage': 2, 'stage_name': 'Recrutat',             'status': 'anulat'},
}

async def run():
    client = AsyncIOMotorClient(ATLAS_URL)
    db = client['gjc_crm_db']

    print(SEP)
    print("GJC CRM - LEGARE EMAILURI IGI DE DOSARE")
    print(SEP)

    # Incarca toate datele
    all_emails   = await db.igi_emails.find({}).to_list(length=None)
    all_cases    = await db.immigration_cases.find({}).to_list(length=None)
    all_cands    = await db.candidates.find({}).to_list(length=None)

    print(f"Emailuri IGI in BD: {len(all_emails)}")
    print(f"Dosare imigrare:    {len(all_cases)}")
    print(f"Candidati:          {len(all_cands)}")

    # Index candidati dupa nume normalizat
    cand_index = {}
    for c in all_cands:
        full_name = norm(f"{c.get('first_name','')} {c.get('last_name','')}".strip())
        rev_name  = norm(f"{c.get('last_name','')} {c.get('first_name','')}".strip())
        cand_index[full_name] = c
        cand_index[rev_name]  = c

    # Grupeza emailurile IGI pe candidat (cel mai recent per candidat)
    # Prioritate: aviz_emis > document_ghiseu > solutionata > programare > in_procesare > transmisa > anulata
    PRIORITY = {
        'aviz_emis': 7, 'document_ghiseu': 6, 'solutionata': 5,
        'programare': 4, 'in_procesare': 3, 'transmisa': 2, 'anulata': 1
    }

    # Grupeaza dupa igi_number (cel mai bun identifier)
    by_igi_number = {}
    by_name_norm  = {}

    for e in all_emails:
        cat = e.get('category', '')
        if cat not in CATEGORY_TO_STAGE:
            continue

        igi_nr = e.get('igi_number')
        name_n = norm(e.get('candidate_name', ''))

        def is_better(existing, new_e):
            p_exist = PRIORITY.get(existing.get('category',''), 0)
            p_new   = PRIORITY.get(new_e.get('category',''), 0)
            if p_new > p_exist: return True
            if p_new == p_exist and str(new_e.get('date','')) > str(existing.get('date','')): return True
            return False

        if igi_nr:
            if igi_nr not in by_igi_number or is_better(by_igi_number[igi_nr], e):
                by_igi_number[igi_nr] = e

        if name_n and len(name_n) > 4:
            if name_n not in by_name_norm or is_better(by_name_norm[name_n], e):
                by_name_norm[name_n] = e

    print(f"\nEmailuri cu Nr. IGI: {len(by_igi_number)}")
    print(f"Emailuri cu Nume:   {len(by_name_norm)}")

    # Actualizare dosare
    updated = 0
    not_found = 0
    already_ok = 0

    print(f"\nActualizare dosare de imigrare...")

    for case in all_cases:
        candidate_name = case.get('candidate_name', '')
        name_n = norm(candidate_name)

        # Cauta mai intai dupa igi_number din dosar (daca exista)
        best_email = None
        case_igi = case.get('igi_number')
        if case_igi and case_igi in by_igi_number:
            best_email = by_igi_number[case_igi]

        # Daca nu, cauta dupa nume
        if not best_email:
            if name_n in by_name_norm:
                best_email = by_name_norm[name_n]
            else:
                # Incearca si varianta inversa (prenume-nume vs nume-prenume)
                parts = name_n.split()
                if len(parts) >= 2:
                    rev = norm(' '.join(reversed(parts)))
                    if rev in by_name_norm:
                        best_email = by_name_norm[rev]
                    else:
                        # Cauta partial (primul si ultimul cuvant)
                        for key in by_name_norm:
                            key_parts = key.split()
                            name_parts = name_n.split()
                            # Daca cel putin 2 cuvinte se potrivesc
                            matches = sum(1 for p in name_parts if p in key_parts)
                            if matches >= 2 and len(name_parts) >= 2:
                                best_email = by_name_norm[key]
                                break

        if not best_email:
            not_found += 1
            continue

        # Determina noua etapa
        cat = best_email.get('category', '')
        mapping = CATEGORY_TO_STAGE.get(cat)
        if not mapping:
            continue

        new_stage      = mapping['stage']
        new_stage_name = mapping['stage_name']
        new_status     = mapping['status']

        # Actualizeaza doar daca e o schimbare relevanta
        current_stage = case.get('current_stage', 0)

        update_data = {
            'igi_email_category': cat,
            'igi_email_date': best_email.get('date', ''),
            'igi_email_id': str(best_email.get('_id', '')),
            'updated_at': datetime.now(timezone.utc).isoformat(),
        }

        # Adauga igi_number daca il avem
        if best_email.get('igi_number'):
            update_data['igi_number'] = best_email['igi_number']

        # Adauga info programare
        if cat == 'programare' and best_email.get('appointment_date'):
            update_data['appointment_date'] = best_email['appointment_date']
            update_data['appointment_time'] = best_email.get('appointment_time', '')

        # Actualizeaza etapa doar daca emailul arata un progres mai mare
        if new_stage > current_stage:
            update_data['current_stage'] = new_stage
            update_data['current_stage_name'] = new_stage_name
            update_data['status'] = new_status
            update_data['notes'] = f"Actualizat automat din email IGI ({cat}) - {best_email.get('date','')[:16]}"

        await db.immigration_cases.update_one(
            {'id': case['id']},
            {'$set': update_data}
        )
        updated += 1

    print(f"\n{SEP}")
    print("REZULTATE ACTUALIZARE")
    print(SEP)
    print(f"  Dosare actualizate cu date IGI: {updated}")
    print(f"  Dosare fara corespondent email: {not_found}")
    print(f"  Total dosare procesate:         {len(all_cases)}")

    # Statistici finale dupa actualizare
    cases_after = await db.immigration_cases.find({}).to_list(length=None)
    stages = {}
    for c in cases_after:
        sn = c.get('current_stage_name', 'necunoscut')
        stages[sn] = stages.get(sn, 0) + 1

    print(f"\nRepartizare dosare pe etape (dupa actualizare):")
    for stage, count in sorted(stages.items()):
        print(f"  {stage:35} : {count}")

    # Afiseaza dosarele cu aviz emis
    aprobate = [c for c in cases_after if c.get('current_stage_name') == 'Permis Munca Aprobat']
    print(f"\n{SEP}")
    print(f"DOSARE CU PERMIS APROBAT ({len(aprobate)}):")
    print(SEP)
    for c in sorted(aprobate, key=lambda x: str(x.get('igi_email_date','')), reverse=True):
        nr   = str(c.get('igi_number','?'))
        nume = str(c.get('candidate_name','N/A'))
        cat  = str(c.get('igi_email_category',''))
        data = str(c.get('igi_email_date',''))[:16]
        print(f"  Nr IGI: {nr:12} | {nume:40} | [{cat}] {data}")

    client.close()
    print(f"\nGata!")

asyncio.run(run())
