"""
Script import: Candidati cu viza plasati si programari
Sursa: Candidati cu viza plasati si programari .xlsx
Destinatie: MongoDB Atlas - gjc_crm

Sheet 1 "Muncitori ajunsi in Romania":
  - Candidati sositi/plasati cu viza
  - Coloane: Nume Angajat, Statut, Ora programare, Data programare,
             Angajator Initial, Angajator Final, Pasaport, + documente

Sheet 2 "Muncitori programati":
  - Candidati cu programare viitoare
  - Coloane: Nume Angajat, Statut, Locatie Programare, Ora programare,
             Data programare, Angajator Initial, Angajator Final, Cont Programare, + documente
"""

import uuid
import re
import unicodedata
from datetime import datetime, timezone
from typing import Optional

import pandas as pd
from pymongo import MongoClient

# ─── CONFIG ──────────────────────────────────────────────────────────────────
MONGO_URI = "mongodb+srv://gjc_admin:GJC2026admin@cluster0.4l9rft3.mongodb.net/gjc_crm?retryWrites=true&w=majority&appName=Cluster0"
EXCEL_PATH = r"C:\Users\ioanp\OneDrive\Desktop\GJC CRM\backend\data\Candidati cu viza plasati si programari .xlsx"

# ─── UTILITARE ────────────────────────────────────────────────────────────────

def normalize_name(name: str) -> str:
    """Normalizare nume pentru comparare fuzzy: lowercase, fara diacritice, fara spatii duble."""
    if not name or not isinstance(name, str):
        return ""
    # Inlocuieste diacriticele romanesti si internationale
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_name = "".join(c for c in nfkd if not unicodedata.combining(c))
    ascii_name = ascii_name.lower().strip()
    ascii_name = re.sub(r"\s+", " ", ascii_name)
    return ascii_name


def split_name(full_name: str):
    """Imparte numele complet in first_name si last_name.
    Conventie: primul cuvant = last_name (familia), restul = first_name.
    Daca e un singur cuvant, first_name='' si last_name=cuvantul.
    """
    parts = full_name.strip().split()
    if len(parts) == 0:
        return "", ""
    if len(parts) == 1:
        return "", parts[0]
    # Primul cuvant = last_name (familie), restul = first_name
    return " ".join(parts[1:]), parts[0]


def safe_str(val) -> Optional[str]:
    if val is None or (isinstance(val, float) and __import__("math").isnan(val)):
        return None
    return str(val).strip() if str(val).strip() else None


def safe_date(val) -> Optional[str]:
    """Converteste valoarea intr-un string ISO date sau None."""
    if val is None or (isinstance(val, float) and __import__("math").isnan(val)):
        return None
    if isinstance(val, datetime):
        return val.strftime("%Y-%m-%d")
    if isinstance(val, str):
        val = val.strip()
        if not val:
            return None
        # Incearca diverse formate
        for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%m/%d/%Y"):
            try:
                return datetime.strptime(val, fmt).strftime("%Y-%m-%d")
            except ValueError:
                pass
        return val  # returneaza ca string brut daca nu s-a putut parsa
    # pandas Timestamp
    try:
        return pd.Timestamp(val).strftime("%Y-%m-%d")
    except Exception:
        return None


def safe_time(val) -> Optional[str]:
    """Converteste valoarea intr-un string HH:MM sau None."""
    if val is None or (isinstance(val, float) and __import__("math").isnan(val)):
        return None
    if isinstance(val, datetime):
        return val.strftime("%H:%M")
    s = str(val).strip()
    if not s or s.lower() in ("nan", "none"):
        return None
    return s


def find_candidate_by_name(db, full_name: str):
    """Cauta un candidat in MongoDB folosind fuzzy match pe nume normalizat."""
    normalized = normalize_name(full_name)
    if not normalized:
        return None

    # Cauta toti candidatii si compara normalizat
    candidates = list(db.candidates.find({}, {"_id": 0}))
    for c in candidates:
        db_name = normalize_name(f"{c.get('first_name', '')} {c.get('last_name', '')}")
        if db_name == normalized:
            return c
        # Si invers (unele inregistrari pot fi last first)
        db_name_rev = normalize_name(f"{c.get('last_name', '')} {c.get('first_name', '')}")
        if db_name_rev == normalized:
            return c

    # Daca nu gasit exact, incearca partial (toate cuvintele din cautare trebuie sa fie in nume)
    search_words = set(normalized.split())
    for c in candidates:
        db_name = normalize_name(f"{c.get('first_name', '')} {c.get('last_name', '')}")
        db_words = set(db_name.split())
        if search_words and search_words.issubset(db_words):
            return c

    return None


def find_immigration_case_by_candidate_id(db, candidate_id: str):
    """Gaseste dosarul de imigrare al unui candidat."""
    return db.immigration_cases.find_one({"candidate_id": candidate_id}, {"_id": 0})


def find_or_create_company(db, company_name: str) -> Optional[dict]:
    """Gaseste sau creeaza o companie in DB. Returneaza dict companie."""
    if not company_name:
        return None
    normalized = normalize_name(company_name)
    companies = list(db.companies.find({}, {"_id": 0}))
    for comp in companies:
        if normalize_name(comp.get("name", "")) == normalized:
            return comp
    # Creeaza companie noua
    new_company = {
        "id": str(uuid.uuid4()),
        "name": company_name,
        "status": "activ",
        "created_at": datetime.now(timezone.utc),
    }
    db.companies.insert_one(new_company)
    print(f"    [+] Companie noua creata: {company_name}")
    return new_company


# ─── PROCESARE SHEET 1: Muncitori ajunsi in Romania ──────────────────────────

def process_sheet1(db, df: pd.DataFrame, stats: dict):
    """
    Sheet 1 - Muncitori ajunsi in Romania:
    Candidati cu statut diversificat (Depus IGI, In Lucru, Pregatit pt depunere, etc.)
    Angajator Initial = compania care a obtinut avizul
    Angajator Final = compania la care lucreaza efectiv (plasament)
    """
    print("\n" + "="*60)
    print("SHEET 1: Muncitori ajunsi in Romania")
    print("="*60)

    # Filtrare randuri valide (Nume Angajat nevid)
    df_valid = df[df["Nume Angajat"].notna() & (df["Nume Angajat"].astype(str).str.strip() != "")].copy()
    print(f"Randuri valide de procesat: {len(df_valid)} din {len(df)}")

    for idx, row in df_valid.iterrows():
        full_name = safe_str(row.get("Nume Angajat"))
        if not full_name:
            continue

        statut        = safe_str(row.get("Statut"))
        ora_prog      = safe_time(row.get("Ora programare"))
        data_prog     = safe_date(row.get("Data progrmare "))
        ang_initial   = safe_str(row.get("Angajator Initial"))
        ang_final     = safe_str(row.get("Angajator Final"))
        pasaport_ok   = row.get("Pasaport")

        print(f"\n  -> {full_name} | {statut} | Initial: {ang_initial} | Final: {ang_final}")

        try:
            # Determinam statusul CRM in functie de statut din Excel
            crm_status = map_statut_to_crm_status(statut)

            # Gasim sau cream compania de plasament (finala)
            company_final = find_or_create_company(db, ang_final) if ang_final else None
            company_id    = company_final["id"] if company_final else None
            company_name  = company_final["name"] if company_final else None

            # Note despre compania initiala
            notes_extra = f"Angajator aviz initial: {ang_initial}" if ang_initial else ""
            if statut:
                notes_extra += f" | Statut Excel: {statut}" if notes_extra else f"Statut Excel: {statut}"
            if data_prog:
                notes_extra += f" | Data programare: {data_prog}"
            if ora_prog:
                notes_extra += f" | Ora programare: {ora_prog}"

            # Cauta candidat existent
            existing = find_candidate_by_name(db, full_name)

            if existing:
                # ACTUALIZARE
                candidate_id = existing["id"]
                update_data = {
                    "status": crm_status,
                    "updated_at": datetime.now(timezone.utc),
                }
                if company_id:
                    update_data["company_id"] = company_id
                if company_name:
                    update_data["company_name"] = company_name

                # Append la notes existente
                existing_notes = existing.get("notes") or ""
                if notes_extra:
                    new_notes = f"{existing_notes}\n[Import {datetime.now().strftime('%Y-%m-%d')}] {notes_extra}".strip()
                    update_data["notes"] = new_notes

                db.candidates.update_one({"id": candidate_id}, {"$set": update_data})
                print(f"     [U] Candidat actualizat: {full_name} -> status={crm_status}")
                stats["actualizati"] += 1

            else:
                # CREARE candidat nou
                first_name, last_name = split_name(full_name)
                candidate_id = str(uuid.uuid4())
                new_candidate = {
                    "id": candidate_id,
                    "first_name": first_name,
                    "last_name": last_name,
                    "status": crm_status,
                    "company_id": company_id,
                    "company_name": company_name,
                    "notes": f"[Import {datetime.now().strftime('%Y-%m-%d')}] {notes_extra}".strip(),
                    "created_at": datetime.now(timezone.utc),
                }
                db.candidates.insert_one(new_candidate)
                print(f"     [+] Candidat nou creat: {full_name} -> status={crm_status}")
                stats["noi"] += 1

            # Actualizeaza dosarul de imigrare daca exista
            imm_case = find_immigration_case_by_candidate_id(db, candidate_id)
            if imm_case:
                imm_update = {
                    "updated_at": datetime.now(timezone.utc),
                }
                # Daca e plasat sau depus IGI, marcam ca aprobat sau in procesare avansata
                if crm_status == "plasat":
                    imm_update["status"] = "aprobat"
                    imm_update["current_stage"] = 7
                    imm_update["current_stage_name"] = "Plasat"
                elif "igi" in (statut or "").lower():
                    imm_update["status"] = "în procesare"
                    imm_update["current_stage"] = 5
                    imm_update["current_stage_name"] = "Depus IGI"

                if company_name:
                    imm_update["company_name"] = company_name
                if company_id:
                    imm_update["company_id"] = company_id
                if data_prog:
                    imm_update["appointment_date"] = data_prog

                db.immigration_cases.update_one(
                    {"candidate_id": candidate_id},
                    {"$set": imm_update}
                )
                print(f"     [U] Dosar imigrare actualizat")

        except Exception as e:
            print(f"     [E] EROARE pentru {full_name}: {e}")
            stats["erori"] += 1


# ─── PROCESARE SHEET 2: Muncitori programati ─────────────────────────────────

def process_sheet2(db, df: pd.DataFrame, stats: dict):
    """
    Sheet 2 - Muncitori programati:
    Candidati cu programari viitoare la ambasada/consulat.
    Locatie Programare = judetul/orasul
    Cont Programare = persoana responsabila de programare
    """
    print("\n" + "="*60)
    print("SHEET 2: Muncitori programati")
    print("="*60)

    df_valid = df[df["Nume Angajat"].notna() & (df["Nume Angajat"].astype(str).str.strip() != "")].copy()
    print(f"Randuri valide de procesat: {len(df_valid)} din {len(df)}")

    for idx, row in df_valid.iterrows():
        full_name = safe_str(row.get("Nume Angajat"))
        if not full_name:
            continue

        statut       = safe_str(row.get("Statut"))
        locatie      = safe_str(row.get("Locatie Programare"))
        ora_prog     = safe_time(row.get("Ora programare"))
        data_prog    = safe_date(row.get("Data progrmare "))
        ang_initial  = safe_str(row.get("Angajator Initial"))
        ang_final    = safe_str(row.get("Angajator Final"))
        cont_prog    = safe_str(row.get("Cont Programare"))

        print(f"\n  -> {full_name} | {statut} | Programare: {data_prog} {ora_prog} @ {locatie}")

        try:
            crm_status = "în procesare"  # toti din sheet 2 sunt in procesare

            # Gasim compania (initial sau final)
            company_ref = ang_final or ang_initial
            company_obj = find_or_create_company(db, company_ref) if company_ref else None
            company_id   = company_obj["id"] if company_obj else None
            company_name = company_obj["name"] if company_obj else None

            # Construim notes
            notes_parts = []
            if statut:
                notes_parts.append(f"Statut Excel: {statut}")
            if locatie:
                notes_parts.append(f"Locatie programare: {locatie}")
            if ora_prog:
                notes_parts.append(f"Ora programare: {ora_prog}")
            if cont_prog:
                notes_parts.append(f"Cont programare: {cont_prog}")
            if ang_initial:
                notes_parts.append(f"Angajator aviz initial: {ang_initial}")
            notes_extra = " | ".join(notes_parts)

            existing = find_candidate_by_name(db, full_name)

            if existing:
                candidate_id = existing["id"]
                update_data = {
                    "updated_at": datetime.now(timezone.utc),
                }
                # Actualizam company daca nu are deja
                if company_id and not existing.get("company_id"):
                    update_data["company_id"] = company_id
                if company_name and not existing.get("company_name"):
                    update_data["company_name"] = company_name

                existing_notes = existing.get("notes") or ""
                if notes_extra:
                    note_line = f"[Import programari {datetime.now().strftime('%Y-%m-%d')}] Programare: {data_prog} | {notes_extra}"
                    new_notes = f"{existing_notes}\n{note_line}".strip()
                    update_data["notes"] = new_notes

                db.candidates.update_one({"id": candidate_id}, {"$set": update_data})
                print(f"     [U] Candidat actualizat cu programare: {full_name}")
                stats["actualizati"] += 1

            else:
                first_name, last_name = split_name(full_name)
                candidate_id = str(uuid.uuid4())
                note_line = f"[Import programari {datetime.now().strftime('%Y-%m-%d')}] Programare: {data_prog} | {notes_extra}"
                new_candidate = {
                    "id": candidate_id,
                    "first_name": first_name,
                    "last_name": last_name,
                    "status": crm_status,
                    "company_id": company_id,
                    "company_name": company_name,
                    "notes": note_line,
                    "created_at": datetime.now(timezone.utc),
                }
                db.candidates.insert_one(new_candidate)
                print(f"     [+] Candidat nou creat cu programare: {full_name}")
                stats["noi"] += 1

            # Actualizeaza/creeaza dosarul de imigrare
            imm_case = find_immigration_case_by_candidate_id(db, candidate_id)
            if imm_case:
                imm_update = {
                    "updated_at": datetime.now(timezone.utc),
                }
                if data_prog:
                    imm_update["appointment_date"] = data_prog
                if locatie:
                    imm_update["appointment_location"] = locatie
                if company_name:
                    imm_update["company_name"] = company_name
                if company_id:
                    imm_update["company_id"] = company_id

                db.immigration_cases.update_one(
                    {"candidate_id": candidate_id},
                    {"$set": imm_update}
                )
                print(f"     [U] Dosar imigrare actualizat cu data programarii: {data_prog}")
            else:
                # Creeaza dosar de imigrare nou pentru candidatii din sheet 2
                if data_prog:
                    new_case = {
                        "id": str(uuid.uuid4()),
                        "candidate_id": candidate_id,
                        "candidate_name": full_name,
                        "company_id": company_id,
                        "company_name": company_name,
                        "case_type": "Permis de munca",
                        "status": "în procesare",
                        "current_stage": 3,
                        "current_stage_name": "Programare ambasada",
                        "appointment_date": data_prog,
                        "appointment_location": locatie,
                        "documents_total": 34,
                        "documents_complete": 0,
                        "assigned_to": "Ioan Baciu",
                        "notes": f"Creat automat la import programari {datetime.now().strftime('%Y-%m-%d')}",
                        "created_at": datetime.now(timezone.utc),
                    }
                    db.immigration_cases.insert_one(new_case)
                    print(f"     [+] Dosar imigrare nou creat cu programare: {data_prog}")

        except Exception as e:
            print(f"     [E] EROARE pentru {full_name}: {e}")
            stats["erori"] += 1


# ─── MAPARE STATUT ────────────────────────────────────────────────────────────

def map_statut_to_crm_status(statut: Optional[str]) -> str:
    """Mapeaza statutul din Excel la statusul din CRM."""
    if not statut:
        return "activ"
    s = statut.lower().strip()
    if "plasat" in s:
        return "plasat"
    if "igi" in s or "depus" in s:
        return "în procesare"
    if "lucru" in s:
        return "în procesare"
    if "pregatit" in s:
        return "activ"
    if "neinceput" in s:
        return "activ"
    if "respins" in s or "refuzat" in s:
        return "inactiv"
    return "activ"


# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("IMPORT: Candidati cu viza plasati si programari")
    print(f"Data import: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    # 1. Conectare MongoDB
    print("\n[1] Conectare MongoDB Atlas...")
    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=10000)
        client.server_info()
        db = client["gjc_crm"]
        print("    Conectat cu succes!")
        print(f"    Candidati existenti in DB: {db.candidates.count_documents({})}")
        print(f"    Dosare imigrare existente: {db.immigration_cases.count_documents({})}")
        print(f"    Companii existente: {db.companies.count_documents({})}")
    except Exception as e:
        print(f"    EROARE conectare MongoDB: {e}")
        return

    # 2. Citire Excel
    print(f"\n[2] Citire fisier Excel...")
    print(f"    Path: {EXCEL_PATH}")
    try:
        df_sheet1 = pd.read_excel(EXCEL_PATH, sheet_name="Muncitori ajunsi in Romania", header=0)
        df_sheet2 = pd.read_excel(EXCEL_PATH, sheet_name="Muncitori programati", header=0)
        print(f"    Sheet 1 'Muncitori ajunsi in Romania': {len(df_sheet1)} randuri")
        print(f"    Sheet 2 'Muncitori programati': {len(df_sheet2)} randuri")
    except Exception as e:
        print(f"    EROARE citire Excel: {e}")
        return

    # 3. Statistici
    stats = {"actualizati": 0, "noi": 0, "erori": 0}

    # 4. Procesare Sheet 1
    print("\n[3] Procesare Sheet 1...")
    process_sheet1(db, df_sheet1, stats)

    # 5. Procesare Sheet 2
    print("\n[4] Procesare Sheet 2...")
    process_sheet2(db, df_sheet2, stats)

    # 6. Statistici finale
    print("\n" + "=" * 60)
    print("STATISTICI FINALE")
    print("=" * 60)
    print(f"  Candidati actualizati:  {stats['actualizati']}")
    print(f"  Candidati noi creati:   {stats['noi']}")
    print(f"  Erori:                  {stats['erori']}")
    print(f"  TOTAL procesati:        {stats['actualizati'] + stats['noi']}")
    print()
    print(f"  Candidati in DB dupa import: {db.candidates.count_documents({})}")
    print(f"  Dosare imigrare in DB:       {db.immigration_cases.count_documents({})}")
    print(f"  Companii in DB:              {db.companies.count_documents({})}")
    print("=" * 60)
    print("Import finalizat cu succes!")


if __name__ == "__main__":
    main()
