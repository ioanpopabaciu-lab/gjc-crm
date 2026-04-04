"""
Script: enrich_companies_anaf.py
Completeaza automat datele companiilor din CRM (telefon, adresa, oras, judet)
folosind API-ul public ANAF, dupa CIF.

Rulare: python enrich_companies_anaf.py
"""

import asyncio
import requests
import time
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime

MONGO_URL = "mongodb+srv://gjc_admin:GJC2026admin@cluster0.4l9rft3.mongodb.net/gjc_crm?retryWrites=true&w=majority&appName=Cluster0"
DB_NAME = "gjc_crm_db"


def anaf_lookup(cui_raw: str):
    """Apeleaza API-ul ANAF si returneaza datele companiei"""
    clean_cui = cui_raw.replace("RO", "").replace("ro", "").strip()
    if not clean_cui.isdigit():
        return None, f"CUI invalid: {cui_raw}"

    today = datetime.now().strftime("%Y-%m-%d")
    try:
        # Step 1: Trimite cererea
        resp = requests.post(
            "https://webservicesp.anaf.ro/AsynchWebService/api/v8/ws/tva",
            json=[{"cui": int(clean_cui), "data": today}],
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        if resp.status_code != 200:
            return None, f"ANAF HTTP {resp.status_code}"

        correlation_id = resp.json().get("correlationId")
        if not correlation_id:
            return None, "Nu s-a obtinut correlationId"

        # Step 2: Asteptam procesarea
        time.sleep(3)

        # Step 3: Obtinem rezultatul
        result_resp = requests.get(
            f"https://webservicesp.anaf.ro/AsynchWebService/api/v8/ws/tva?id={correlation_id}",
            timeout=30
        )
        if result_resp.status_code != 200:
            return None, f"ANAF result HTTP {result_resp.status_code}"

        result_data = result_resp.json()
        found_list = result_data.get("found", [])
        if not found_list:
            return None, "CUI negasit in ANAF"

        company_data = found_list[0]
        dg = company_data.get("date_generale", {})

        # Extragem orasul din adresa
        adresa = dg.get("adresa", "") or ""
        city = ""
        county = ""
        if adresa:
            parts = [p.strip() for p in adresa.split(",")]
            for part in parts:
                if "JUD." in part.upper():
                    county = part.replace("JUD.", "").replace("jud.", "").strip()
                    break
            if not county and len(parts) > 1:
                county = parts[1].strip()
            # Orasul e de obicei inainte de judet
            for part in parts:
                if "MUN." in part.upper() or "ORAS" in part.upper() or "MUNICIPIUL" in part.upper():
                    city = part.replace("MUN.", "").replace("MUNICIPIUL", "").replace("ORAS", "").strip()
                    break
            if not city:
                city = county

        return {
            "name_anaf": dg.get("denumire", ""),
            "address": adresa,
            "city": city or county or "Romania",
            "county": county,
            "phone": dg.get("telefon", "") or "",
            "registration_number": dg.get("nrRegCom", "") or "",
            "cod_caen": dg.get("cod_CAEN", "") or "",
            "status_tva": "Platitor TVA" if company_data.get("inregistrare_scop_Tva", {}).get("scpTVA") else "Neplatitor TVA",
        }, None

    except Exception as e:
        return None, str(e)[:100]


async def main():
    print("=" * 60)
    print("ENRICHMENT COMPANII DIN ANAF")
    print("=" * 60)

    mongo_client = AsyncIOMotorClient(MONGO_URL)
    db = mongo_client[DB_NAME]

    # Luam toate companiile
    companies = await db.companies.find({}, {"_id": 0}).to_list(500)
    total = len(companies)
    print(f"\nTotal companii in CRM: {total}\n")

    updated = 0
    skipped_no_cui = 0
    skipped_has_data = 0
    errors = 0

    for idx, company in enumerate(companies, 1):
        cui = company.get("cui", "").strip()
        name = company.get("name", "N/A")
        comp_id = company.get("id")

        prefix = f"[{idx:02d}/{total}] {name[:35]:<35}"

        # Skip daca nu are CUI
        if not cui:
            print(f"{prefix} -> SKIP (fara CUI)")
            skipped_no_cui += 1
            continue

        # Skip daca are deja telefon SI adresa
        has_phone = bool(company.get("phone", "").strip())
        has_address = bool(company.get("address", "").strip())
        if has_phone and has_address:
            print(f"{prefix} -> SKIP (are deja date)")
            skipped_has_data += 1
            continue

        # Apelam ANAF
        data, err = anaf_lookup(cui)

        if err:
            print(f"{prefix} -> EROARE: {err}")
            errors += 1
            continue

        # Actualizam doar campurile goale
        update_fields = {}
        if not has_address and data.get("address"):
            update_fields["address"] = data["address"]
        if not has_address and data.get("city"):
            update_fields["city"] = data["city"]
        if not company.get("county") and data.get("county"):
            update_fields["county"] = data["county"]
        if not has_phone and data.get("phone"):
            update_fields["phone"] = data["phone"]
        if not company.get("registration_number") and data.get("registration_number"):
            update_fields["registration_number"] = data["registration_number"]
        if data.get("cod_caen"):
            update_fields["cod_caen"] = data["cod_caen"]

        if update_fields:
            await db.companies.update_one(
                {"id": comp_id},
                {"$set": update_fields}
            )
            fields_list = ", ".join(update_fields.keys())
            phone_display = f"tel:{data.get('phone', '-')}" if data.get('phone') else "fara tel"
            print(f"{prefix} -> OK ({phone_display}, {fields_list})")
            updated += 1
        else:
            print(f"{prefix} -> ANAF ok dar fara date noi")
            skipped_has_data += 1

        # Pauza intre cereri ca sa nu supraincarcam ANAF
        time.sleep(1)

    mongo_client.close()

    print("\n" + "=" * 60)
    print(f"REZULTAT FINAL:")
    print(f"  Actualizate:       {updated}")
    print(f"  Deja aveau date:   {skipped_has_data}")
    print(f"  Fara CUI:          {skipped_no_cui}")
    print(f"  Erori ANAF:        {errors}")
    print(f"  Total procesate:   {total}")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
