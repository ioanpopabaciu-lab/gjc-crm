# -*- coding: utf-8 -*-
"""
Script: Completare date companii din ANAF + detectare/fuzionare duplicate
Rulare: python enrich_companies.py
"""
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import os, time, json, httpx
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME   = os.environ.get('DB_NAME', 'gjc_crm_db')
ANAF_URL  = "https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva"

# ─── Helpers ───────────────────────────────────────────────────────────────

def clean_cui(cui: str) -> str:
    return str(cui).upper().replace("RO","").replace(" ","").replace("-","").strip()

async def anaf_lookup(cui_clean: str, client: httpx.AsyncClient) -> dict | None:
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
            "name":         dg.get("denumire",""),
            "address":      dg.get("adresa",""),
            "phone":        dg.get("telefon",""),
            "reg_commerce": dg.get("nrRegCom",""),
            "county":       _extract_county(dg.get("adresa","")),
            "city":         _extract_city(dg.get("adresa","")),
            "caen_code":    dg.get("cod_CAEN",""),
            "is_vat":       bool(dg.get("scpTVA", False)),
        }
    except Exception as e:
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
        if p.upper().startswith("ORAȘ "):
            return p[5:].strip().title()
    return ""

# ─── Main ──────────────────────────────────────────────────────────────────

async def main():
    if not MONGO_URL:
        print("❌ MONGO_URL lipsă în .env"); return

    mongo = AsyncIOMotorClient(MONGO_URL)
    db = mongo[DB_NAME]

    companies = await db.companies.find({}, {"_id":0}).to_list(2000)
    print(f"\n[LIST] Total companii în baza de date: {len(companies)}")

    # ── 1. Detectare DUPLICATE după CUI ─────────────────────────────────
    print("\n🔍 Caut duplicate după CUI/cod fiscal...")
    cui_map = {}
    for c in companies:
        raw_cui = str(c.get("cui") or "").strip()
        if not raw_cui:
            continue
        clean = clean_cui(raw_cui)
        if not clean or len(clean) < 4:
            continue
        cui_map.setdefault(clean, []).append(c)

    duplicates = {k: v for k, v in cui_map.items() if len(v) > 1}
    merged_count = 0

    if duplicates:
        print(f"\n⚠️  Găsite {len(duplicates)} seturi de duplicate:\n")
        for cui, group in duplicates.items():
            names = [g['name'] for g in group]
            print(f"  CUI {cui}: {' | '.join(names)}")
            # Fuzionăm: păstrăm compania cu mai multe date, ștergem celelalte
            # Sortăm: mai întâi cel cu mai multe câmpuri completate
            ranked = sorted(group, key=lambda x: sum(1 for v in x.values() if v), reverse=True)
            keeper = ranked[0]
            to_delete = ranked[1:]

            # Preluăm câmpurile lipsă din duplicate în keeper
            merged = dict(keeper)
            for dup in to_delete:
                for field, val in dup.items():
                    if field == "_id": continue
                    if not merged.get(field) and val:
                        merged[field] = val

            # Salvăm keeper îmbogățit
            await db.companies.update_one({"id": keeper["id"]}, {"$set": merged})
            print(f"     ✅ Păstrat: '{keeper['name']}' (ID: {keeper['id']})")

            # Ștergem duplicate
            for dup in to_delete:
                await db.companies.delete_one({"id": dup["id"]})
                print(f"     🗑️  Șters duplicat: '{dup['name']}' (ID: {dup['id']})")
                merged_count += 1
    else:
        print("  ✅ Nu există duplicate!")

    # ── 2. Completare date din ANAF ──────────────────────────────────────
    print("\n🏛️  Completez date din ANAF pentru companiile cu CUI...")

    # Re-fetch după ștergere duplicate
    companies = await db.companies.find({}, {"_id":0}).to_list(2000)

    needs_enrich = []
    for c in companies:
        raw_cui = str(c.get("cui") or "").strip()
        if not raw_cui:
            continue
        clean = clean_cui(raw_cui)
        if not clean or not clean.isdigit():
            continue
        missing = not c.get("address") or not c.get("phone") or not c.get("county")
        if missing:
            needs_enrich.append((c, clean))

    print(f"  Companii cu date incomplete (au CUI): {len(needs_enrich)}")

    updated = 0
    failed  = 0
    async with httpx.AsyncClient() as client:
        for i, (company, cui_clean) in enumerate(needs_enrich):
            print(f"  [{i+1}/{len(needs_enrich)}] {company['name']} (CUI: {cui_clean})...", end=" ", flush=True)
            anaf = await anaf_lookup(cui_clean, client)
            if not anaf:
                print("❌ negăsit ANAF")
                failed += 1
                continue

            update = {}
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

            if update:
                await db.companies.update_one({"id": company["id"]}, {"$set": update})
                fields = ", ".join(update.keys())
                print(f"✅ completat: {fields}")
                updated += 1
            else:
                print("➖ deja complet")

            # Pauză mică să nu supraîncărcăm ANAF
            await asyncio.sleep(0.3)

    # ── 3. Companii fără CUI ─────────────────────────────────────────────
    no_cui = [c for c in companies if not str(c.get("cui") or "").strip()]
    if no_cui:
        print(f"\n⚠️  {len(no_cui)} companii fără CUI (nu pot fi completate din ANAF):")
        for c in no_cui:
            print(f"  - {c['name']} | Tel: {c.get('phone','-')} | Județ: {c.get('county','-')}")

    # ── Sumar ────────────────────────────────────────────────────────────
    print(f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ SUMAR OPERAȚIUNI
  Duplicate șterse:      {merged_count}
  Completate din ANAF:   {updated}
  Negăsite în ANAF:      {failed}
  Fără CUI (manual):     {len(no_cui)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
""")
    mongo.close()

if __name__ == "__main__":
    asyncio.run(main())
