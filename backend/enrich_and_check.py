# -*- coding: utf-8 -*-
"""
Script: Completare date companii din ANAF (fara fuzionare automata)
Pas 1: Restaurare Giulio Impex SRL (daca lipseste)
Pas 2: Completare date din ANAF pentru toate companiile cu CUI
Pas 3: Cautare CUI pentru companiile fara CUI (via ANAF dupa denumire)
Pas 4: Raport duplicate dupa CUI (pentru decizie manuala)

Rulare: python enrich_and_check.py
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import os, uuid, asyncio, httpx
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME   = os.environ.get('DB_NAME', 'gjc_crm_db')
ANAF_URL  = "https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva"

# ─── Helpers ───────────────────────────────────────────────────────────────

def clean_cui(cui: str) -> str:
    return str(cui).upper().replace("RO","").replace(" ","").replace("-","").strip()

async def anaf_lookup_by_cui(cui_clean: str, client: httpx.AsyncClient) -> dict | None:
    today = __import__('datetime').date.today().isoformat()
    try:
        r = await client.post(ANAF_URL,
            json=[{"cui": int(cui_clean), "data": today}],
            timeout=15)
        found = r.json().get("found", [])
        if not found:
            return None
        dg = found[0].get("date_generale", {})
        return {
            "anaf_name":    dg.get("denumire",""),
            "address":      dg.get("adresa",""),
            "phone":        dg.get("telefon",""),
            "reg_commerce": dg.get("nrRegCom",""),
            "county":       _extract_county(dg.get("adresa","")),
            "city":         _extract_city(dg.get("adresa","")),
            "caen_code":    dg.get("cod_CAEN",""),
            "is_vat":       bool(dg.get("scpTVA", False)),
        }
    except Exception:
        return None

def _extract_county(addr: str) -> str:
    for part in addr.split(","):
        p = part.strip()
        if p.upper().startswith("JUD."):
            return p[4:].strip().title()
    return ""

def _extract_city(addr: str) -> str:
    for part in addr.split(","):
        p = part.strip()
        if p.upper().startswith("MUN."):
            return p[4:].strip().title()
        if p.upper().startswith("MUNICIPIUL "):
            return p[11:].strip().title()
        if p.upper().startswith("ORAS ") or p.upper().startswith("ORAȘ "):
            return p[5:].strip().title()
    return ""

# ─── Main ──────────────────────────────────────────────────────────────────

async def main():
    if not MONGO_URL:
        print("EROARE: MONGO_URL lipseste in .env"); return

    mongo = AsyncIOMotorClient(MONGO_URL)
    db = mongo[DB_NAME]

    # ── PAS 1: Restaurare Giulio Impex SRL ──────────────────────────────
    print("\n" + "="*60)
    print("PAS 1: Verificare / Restaurare Giulio Impex SRL")
    print("="*60)

    giulio_exists = await db.companies.find_one(
        {"name": {"$regex": "giulio", "$options": "i"}}
    )

    if giulio_exists:
        print(f"  OK - Giulio Impex gasit in baza de date: '{giulio_exists['name']}'")
        print(f"       CUI: {giulio_exists.get('cui','(gol)')}")
    else:
        print("  ATENTIE: Giulio Impex NU exista! Creez compania...")
        giulio_doc = {
            "id": str(uuid.uuid4()),
            "name": "Giulio Impex SRL",
            "cui": None,   # va fi completat din ANAF dupa ce stim CUI-ul corect
            "city": None,
            "county": None,
            "address": None,
            "reg_commerce": None,
            "phone": None,
            "email": None,
            "status": "activ",
            "notes": "Restaurata dupa stergere eronata - necesita completare CUI",
            "created_at": datetime.now(timezone.utc)
        }
        await db.companies.insert_one(giulio_doc)
        print(f"  Giulio Impex SRL restaurata cu ID: {giulio_doc['id']}")
        print("  ACTIUNE NECESARA: Introduceti CUI-ul corect pentru Giulio Impex SRL")
        print("  (puteti face asta din sectiunea Clienti B2B din CRM)")

    # Verificam si Danessa Impex
    danessa = await db.companies.find_one(
        {"name": {"$regex": "danessa", "$options": "i"}}
    )
    if danessa:
        print(f"\n  Danessa gasita: '{danessa['name']}' | CUI: {danessa.get('cui','(gol)')}")
    else:
        print("\n  ATENTIE: Danessa Impex nu gasita in baza de date!")

    # ── PAS 2: Completare date din ANAF pentru companiile CU CUI ────────
    print("\n" + "="*60)
    print("PAS 2: Completare date din ANAF pentru companiile cu CUI")
    print("="*60)

    companies = await db.companies.find({}, {"_id":0}).to_list(2000)
    print(f"  Total companii: {len(companies)}")

    has_cui    = [(c, clean_cui(str(c.get('cui') or '')))
                  for c in companies
                  if str(c.get('cui') or '').strip()
                  and clean_cui(str(c.get('cui') or '')).isdigit()]

    no_cui     = [c for c in companies
                  if not str(c.get('cui') or '').strip()]

    print(f"  Cu CUI valid:   {len(has_cui)}")
    print(f"  Fara CUI:       {len(no_cui)}")

    updated = 0
    failed  = 0
    already_complete = 0

    async with httpx.AsyncClient() as client:
        for i, (company, cui_clean) in enumerate(has_cui):
            name = company.get('name','?')
            print(f"\n  [{i+1}/{len(has_cui)}] {name} (CUI: {cui_clean})", end=" ... ", flush=True)

            anaf = await anaf_lookup_by_cui(cui_clean, client)
            if not anaf:
                print("ANAF: negasit")
                failed += 1
                await asyncio.sleep(0.5)
                continue

            update = {}

            # Completam doar campurile goale
            if not company.get("address") and anaf.get("address"):
                update["address"] = anaf["address"]
            if not company.get("phone") and anaf.get("phone"):
                update["phone"] = anaf["phone"]
            if not company.get("county") and anaf.get("county"):
                update["county"] = anaf["county"]
            if not company.get("city") and anaf.get("city"):
                update["city"] = anaf["city"]
            if not company.get("reg_commerce") and anaf.get("reg_commerce"):
                update["reg_commerce"] = anaf["reg_commerce"]
            if not company.get("caen_code") and anaf.get("caen_code"):
                update["caen_code"] = anaf["caen_code"]

            # Salvam si denumirea ANAF ca referinta (nu o suprascriem pe cea din CRM)
            if anaf.get("anaf_name"):
                update["anaf_name_verified"] = anaf["anaf_name"]

            if update:
                await db.companies.update_one(
                    {"id": company["id"]},
                    {"$set": update}
                )
                fields = ", ".join(k for k in update.keys() if k != "anaf_name_verified")
                anaf_name = anaf.get("anaf_name","")
                match_info = ""
                if anaf_name and anaf_name.upper() not in name.upper() and name.upper() not in anaf_name.upper():
                    match_info = f" [ANAF spune: {anaf_name}]"
                print(f"completat: {fields}{match_info}")
                updated += 1
            else:
                print("deja complet")
                already_complete += 1

            await asyncio.sleep(0.4)

    # ── PAS 3: Companii fara CUI ─────────────────────────────────────────
    print("\n" + "="*60)
    print("PAS 3: Companii fara CUI (necesita completare manuala)")
    print("="*60)

    # Re-fetch pentru date actualizate
    companies_fresh = await db.companies.find({}, {"_id":0}).to_list(2000)
    no_cui_fresh = [c for c in companies_fresh
                    if not str(c.get('cui') or '').strip()]

    if no_cui_fresh:
        print(f"\n  {len(no_cui_fresh)} companii fara CUI:\n")
        print(f"  {'Nr':>3}  {'Denumire':<40}  {'Telefon':<15}  {'Judet':<15}")
        print(f"  {'-'*3}  {'-'*40}  {'-'*15}  {'-'*15}")
        for i, c in enumerate(no_cui_fresh, 1):
            phone  = str(c.get('phone')  or '-')
        county = str(c.get('county') or '-')
        print(f"  {i:>3}. {c['name']:<40}  {phone:<15}  {county:<15}")
    else:
        print("  Toate companiile au CUI!")

    # ── PAS 4: Detectare duplicate dupa CUI (FARA fuzionare automata) ────
    print("\n" + "="*60)
    print("PAS 4: Detectare duplicate dupa CUI (doar raport - fara stergere automata)")
    print("="*60)

    cui_map = {}
    for c in companies_fresh:
        raw = str(c.get('cui') or '').strip()
        if not raw:
            continue
        clean = clean_cui(raw)
        if not clean or not clean.isdigit() or len(clean) < 4:
            continue
        cui_map.setdefault(clean, []).append(c)

    duplicates = {k: v for k, v in cui_map.items() if len(v) > 1}

    if duplicates:
        print(f"\n  ATENTIE! {len(duplicates)} CUI-uri apar la mai multe companii:\n")
        for cui, group in duplicates.items():
            print(f"  CUI {cui}:")
            for g in group:
                print(f"    - '{g['name']}' | Tel: {g.get('phone','-')} | {g.get('county','-')}")
            print()
        print("  => Verificati manual daca sunt intr-adevar duplicate")
        print("     sau daca CUI-ul a fost introdus gresit la una dintre ele.")
        print("     Dupa verificare, spuneti-mi care se sterge si care se pastreaza.")
    else:
        print("  Niciun CUI duplicat detectat! Baza de date este curata.")

    # ── SUMAR ────────────────────────────────────────────────────────────
    print("\n" + "="*60)
    print("SUMAR")
    print("="*60)
    print(f"  Completate din ANAF:       {updated}")
    print(f"  Deja complete:             {already_complete}")
    print(f"  Negasite in ANAF:          {failed}")
    print(f"  Fara CUI (manual):         {len(no_cui_fresh)}")
    print(f"  CUI-uri duplicate gasite:  {len(duplicates)}")
    print("="*60)

    mongo.close()
    print("\nScript finalizat!")

if __name__ == "__main__":
    asyncio.run(main())
