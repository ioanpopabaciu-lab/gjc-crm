"""
Actualizare completa baza de date din emailurile IGI:
- Creeaza dosare noi pentru fiecare nr IGI gasit in emailuri
- Adauga candidati noi daca nu exista
- Actualizeaza statusuri si date programare
"""
import sys, io, asyncio, unicodedata, re, uuid
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone

ATLAS = "mongodb+srv://gjc_admin:GJC2026admin@cluster0.4l9rft3.mongodb.net/gjc_crm?retryWrites=true&w=majority&appName=Cluster0"
SEP = "=" * 70

def norm(t):
    if not t: return ''
    return unicodedata.normalize('NFD', str(t)).encode('ascii','ignore').decode('ascii').lower().strip()

def titlify(name):
    """POPESCU ION -> Popescu Ion"""
    if not name: return name
    return ' '.join(w.capitalize() for w in str(name).strip().split())

def extract_appointment(body_preview):
    """Extrage data si ora programarii din body_preview"""
    if not body_preview: return None, None
    # Format: "data de 31/03/2026 09:45"
    m = re.search(r'data de (\d{2}/\d{2}/\d{4})\s+(\d{2}:\d{2})', str(body_preview))
    if m:
        return m.group(1), m.group(2)
    return None, None

def extract_name_from_preview(body_preview):
    """Extrage numele candidatului din body_preview"""
    if not body_preview: return None
    # Format: "Stimate / Stimată POPESCU ION," sau "Stimate / Stimata POPESCU ION"
    m = re.search(r'Stimat[^\s]*/\s*Stimat[^\s]*\s+([A-Z][A-Z\s\-]+?)[\s,]', str(body_preview))
    if m:
        return m.group(1).strip()
    return None

# Prioritate categorie (mai mare = mai important)
CAT_PRIORITY = {
    'aviz_emis': 7, 'document_ghiseu': 6, 'solutionata': 5,
    'programare': 4, 'in_procesare': 3, 'transmisa': 2, 'anulata': 1
}

CAT_TO_STAGE = {
    'aviz_emis':       {'stage': 4, 'stage_name': 'Permis Munca Aprobat',  'status': 'aprobat'},
    'document_ghiseu': {'stage': 4, 'stage_name': 'Permis Munca Aprobat',  'status': 'aprobat'},
    'solutionata':     {'stage': 4, 'stage_name': 'Permis Munca Aprobat',  'status': 'aprobat'},
    'programare':      {'stage': 3, 'stage_name': 'Permis Munca Depus',    'status': 'in procesare'},
    'in_procesare':    {'stage': 3, 'stage_name': 'Permis Munca Depus',    'status': 'in procesare'},
    'transmisa':       {'stage': 3, 'stage_name': 'Permis Munca Depus',    'status': 'in procesare'},
    'anulata':         {'stage': 1, 'stage_name': 'Recrutat',              'status': 'anulat'},
}

async def run():
    client = AsyncIOMotorClient(ATLAS)
    db = client['gjc_crm_db']

    print(SEP)
    print("GJC CRM - ACTUALIZARE COMPLETA DIN EMAILURI IGI")
    print(SEP)

    # --- Incarca date existente ---
    relevant_cats = ['aviz_emis','document_ghiseu','solutionata','programare','in_procesare','transmisa','anulata']
    all_emails   = await db.igi_emails.find({'category': {'$in': relevant_cats}}).to_list(length=None)
    all_cases    = await db.immigration_cases.find({}).to_list(length=None)
    all_cands    = await db.candidates.find({}).to_list(length=None)

    print(f"Emailuri IGI relevante: {len(all_emails)}")
    print(f"Dosare existente:       {len(all_cases)}")
    print(f"Candidati existenti:    {len(all_cands)}")

    # --- Re-parseaza appointment dates din body_preview ---
    print("\nRe-parsare date programare...")
    appt_fixed = 0
    for e in all_emails:
        if e.get('category') == 'programare' and not e.get('appointment_date'):
            appt_date, appt_time = extract_appointment(e.get('body_preview',''))
            if appt_date:
                await db.igi_emails.update_one(
                    {'_id': e['_id']},
                    {'$set': {'appointment_date': appt_date, 'appointment_time': appt_time}}
                )
                e['appointment_date'] = appt_date
                e['appointment_time'] = appt_time
                appt_fixed += 1
    print(f"  Date programare extrase: {appt_fixed}")

    # --- Re-parseaza candidate_name din aviz_emis (erau gresit setate ca filename) ---
    for e in all_emails:
        if e.get('category') == 'aviz_emis':
            # Incearca sa extraga numele din body_preview
            name = extract_name_from_preview(e.get('body_preview',''))
            if name and 'work permit' not in name.lower():
                if e.get('candidate_name') != name:
                    await db.igi_emails.update_one(
                        {'_id': e['_id']},
                        {'$set': {'candidate_name': name}}
                    )
                    e['candidate_name'] = name

    # --- Index candidati dupa nume normalizat ---
    cand_by_norm = {}
    for c in all_cands:
        fn = norm(f"{c.get('first_name','')} {c.get('last_name','')}".strip())
        ln = norm(f"{c.get('last_name','')} {c.get('first_name','')}".strip())
        cand_by_norm[fn] = c
        cand_by_norm[ln] = c

    # --- Index dosare dupa igi_number si candidate_id ---
    case_by_igi  = {c['igi_number']: c for c in all_cases if c.get('igi_number')}
    case_by_cand = {c['candidate_id']: c for c in all_cases if c.get('candidate_id')}

    # --- Grupeaza emailurile pe nr IGI (cel mai relevant per dosar) ---
    best_by_igi  = {}  # igi_number -> best email
    best_by_name = {}  # norm_name -> best email

    for e in all_emails:
        cat = e.get('category', '')

        # Fix candidate_name daca e filename
        name = e.get('candidate_name', '')
        if not name or 'work permit' in name.lower():
            continue

        igi = e.get('igi_number')

        def is_better(existing, new_e):
            p_old = CAT_PRIORITY.get(existing.get('category',''), 0)
            p_new = CAT_PRIORITY.get(new_e.get('category',''), 0)
            if p_new > p_old: return True
            if p_new == p_old and str(new_e.get('date','')) > str(existing.get('date','')): return True
            return False

        if igi:
            if igi not in best_by_igi or is_better(best_by_igi[igi], e):
                best_by_igi[igi] = e

        name_n = norm(name)
        if name_n and len(name_n) > 3:
            if name_n not in best_by_name or is_better(best_by_name[name_n], e):
                best_by_name[name_n] = e

    print(f"\nDosare unice dupa nr IGI: {len(best_by_igi)}")
    print(f"Dosare unice dupa nume:   {len(best_by_name)}")

    # --- Proceseaza fiecare dosar din emailuri ---
    new_candidates = 0
    new_cases = 0
    updated_cases = 0
    now = datetime.now(timezone.utc).isoformat()

    all_dosare = list(best_by_igi.values())
    # Adauga si dosare care nu au nr IGI dar au nume
    igi_names_used = set(norm(e.get('candidate_name','')) for e in best_by_igi.values())
    for name_n, e in best_by_name.items():
        if name_n not in igi_names_used:
            all_dosare.append(e)

    print(f"\nTotal dosare de procesat: {len(all_dosare)}")
    print("Procesare...")

    for e in all_dosare:
        cat      = e.get('category', '')
        igi_nr   = e.get('igi_number')
        raw_name = e.get('candidate_name', '') or ''
        if not raw_name or 'work permit' in raw_name.lower():
            continue

        name_n   = norm(raw_name)
        mapping  = CAT_TO_STAGE.get(cat, {})
        if not mapping:
            continue

        # 1. Gaseste sau creeaza candidat
        candidate = None

        # Cauta exact
        if name_n in cand_by_norm:
            candidate = cand_by_norm[name_n]
        else:
            # Cauta partial (2+ cuvinte comune)
            parts = name_n.split()
            if len(parts) >= 2:
                for key, c in cand_by_norm.items():
                    key_parts = key.split()
                    matches = sum(1 for p in parts if p in key_parts and len(p) > 2)
                    if matches >= 2:
                        candidate = c
                        break

        # Daca nu gasit, creeaza candidat nou
        if not candidate:
            name_parts = raw_name.strip().split()
            if len(name_parts) >= 2:
                last  = titlify(name_parts[0])
                first = titlify(' '.join(name_parts[1:]))
            else:
                last  = titlify(raw_name)
                first = ''

            new_cand = {
                'id': str(uuid.uuid4()),
                'first_name': first,
                'last_name': last,
                'nationality': '',
                'passport_number': None,
                'passport_expiry': None,
                'permit_expiry': None,
                'phone': None,
                'email': None,
                'job_type': '',
                'status': 'activ',
                'company_id': None,
                'company_name': None,
                'notes': f'Importat din emailuri IGI ({cat}) - {e.get("date","")[:10]}',
                'created_at': now,
            }
            await db.candidates.insert_one(new_cand)
            candidate = new_cand
            cand_by_norm[name_n] = candidate
            fn = norm(f"{first} {last}")
            ln = norm(f"{last} {first}")
            cand_by_norm[fn] = candidate
            cand_by_norm[ln] = candidate
            new_candidates += 1

        cand_id   = candidate['id']
        cand_name = f"{candidate.get('last_name','')} {candidate.get('first_name','')}".strip()

        # 2. Gaseste sau creeaza dosar imigrare
        existing_case = None
        if igi_nr and igi_nr in case_by_igi:
            existing_case = case_by_igi[igi_nr]
        elif cand_id in case_by_cand:
            existing_case = case_by_cand[cand_id]

        appt_date, appt_time = extract_appointment(e.get('body_preview',''))
        if not appt_date:
            appt_date = e.get('appointment_date')
            appt_time = e.get('appointment_time')

        update_fields = {
            'current_stage': mapping['stage'],
            'current_stage_name': mapping['stage_name'],
            'status': mapping['status'],
            'igi_email_category': cat,
            'igi_email_date': e.get('date','')[:16],
            'updated_at': now,
        }
        if igi_nr:
            update_fields['igi_number'] = igi_nr
        if appt_date:
            update_fields['appointment_date'] = appt_date
            update_fields['appointment_time'] = appt_time or ''

        if cat == 'document_ghiseu':
            update_fields['notes'] = f"Permis gata de ridicat la ghiseu IGI - {e.get('date','')[:10]}"
        elif cat == 'aviz_emis':
            attms = e.get('attachments', [])
            update_fields['notes'] = f"Aviz emis: {attms[0] if attms else ''} - {e.get('date','')[:10]}"
        elif cat == 'solutionata':
            update_fields['notes'] = f"Solicitare solutionata, permis in pregatire - {e.get('date','')[:10]}"
        elif cat == 'programare':
            update_fields['notes'] = f"Programare la IGI: {appt_date or '?'} ora {appt_time or '?'}"
        elif cat == 'anulata':
            update_fields['notes'] = f"Dosar anulat - {e.get('status_raw','')} - {e.get('date','')[:10]}"

        if existing_case:
            # Actualizeaza doar daca noul status e mai avansat
            old_stage = existing_case.get('current_stage', 0)
            if mapping['stage'] >= old_stage:
                await db.immigration_cases.update_one(
                    {'id': existing_case['id']},
                    {'$set': update_fields}
                )
                updated_cases += 1
        else:
            # Creeaza dosar nou
            req_date = e.get('request_date')
            if req_date and '.' in str(req_date):
                parts = str(req_date).split('.')
                try:
                    req_date_iso = f"{parts[2]}-{parts[1]}-{parts[0]}"
                except:
                    req_date_iso = now[:10]
            else:
                req_date_iso = now[:10]

            new_case = {
                'id': str(uuid.uuid4()),
                'candidate_id': cand_id,
                'candidate_name': cand_name or raw_name,
                'company_id': candidate.get('company_id') or None,
                'company_name': candidate.get('company_name') or None,
                'case_type': 'Permis de munca',
                'submitted_date': req_date_iso,
                'deadline': None,
                'assigned_to': 'Ioan Baciu',
                'documents_total': 0,
                'documents_complete': 0,
                'created_at': now,
                **update_fields
            }
            await db.immigration_cases.insert_one(new_case)
            case_by_igi[igi_nr or new_case['id']] = new_case
            case_by_cand[cand_id] = new_case
            new_cases += 1

    # --- RAPORT FINAL ---
    total_cases  = await db.immigration_cases.count_documents({})
    total_cands  = await db.candidates.count_documents({})

    print(f"\n{SEP}")
    print("RAPORT FINAL")
    print(SEP)
    print(f"  Candidati noi adaugati:     {new_candidates}")
    print(f"  Dosare noi create:          {new_cases}")
    print(f"  Dosare existente actualizate: {updated_cases}")
    print(f"\n  Total dosare in BD:   {total_cases}")
    print(f"  Total candidati in BD: {total_cands}")

    # Statistici pe etape
    cases_all = await db.immigration_cases.find({}).to_list(length=None)
    stages = {}
    for c in cases_all:
        sn = c.get('current_stage_name', 'Necunoscut')
        stages[sn] = stages.get(sn, 0) + 1

    print(f"\n  Repartizare pe etape:")
    for sn, cnt in sorted(stages.items(), key=lambda x: -x[1]):
        print(f"    {sn:35} : {cnt}")

    client.close()
    print(f"\nGata! Baza de date actualizata.")

asyncio.run(run())
