"""
Script: import_passport_photos.py
Citeste pozele pasapoartelor din folderul data/pasapoarte_gdrive/ (sau alt folder specificat),
trimite fiecare poza la Claude AI pentru OCR, si importa datele in MongoDB (colectia candidates).

Rulare: python -X utf8 import_passport_photos.py
"""

import asyncio
import base64
import json
import re
import sys
import os
from pathlib import Path
from datetime import datetime, timezone
import uuid

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv(override=True)

import anthropic
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.getenv("MONGO_URL", "mongodb+srv://gjc_admin:GJC2026admin@cluster0.4l9rft3.mongodb.net/gjc_crm?retryWrites=true&w=majority&appName=Cluster0")
DB_NAME = os.getenv("DB_NAME", "gjc_crm_db")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

# Folderul cu pozele pasapoartelor
PHOTOS_DIR = Path(__file__).parent / "data" / "pasapoarte_gdrive"

# Suporta si .jpg, .jpeg, .png, .webp
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".HEIC", ".JPG", ".JPEG", ".PNG"}


PASSPORT_PROMPT = """Esti un expert in citirea documentelor oficiale. Analizeaza aceasta imagine a unui pasaport sau document de identitate.

Extrage EXACT urmatoarele informatii in format JSON:
{
  "surname": "numele de familie (din randul MRZ sau campul Surname/Nom)",
  "given_names": "prenumele (din randul MRZ sau campul Given names/Prenom)",
  "passport_number": "numarul pasaportului (exact, fara spatii)",
  "nationality": "nationalitatea (cod 3 litere ISO: ROU, MDA, UKR, etc.)",
  "birth_date": "data nasterii in format YYYY-MM-DD",
  "expiry_date": "data expirarii in format YYYY-MM-DD",
  "sex": "M sau F",
  "birth_place": "locul nasterii daca este vizibil, altfel string gol",
  "personal_number": "codul personal/CNP daca este vizibil, altfel string gol"
}

Reguli importante:
- Daca nu poti citi un camp, pune string gol ""
- Nu inventa date - extrage DOAR ce este vizibil in imagine
- Pasapoartele romanesti au seria 2 litere + 6 cifre (ex: PX123456)
- Pasapoartele moldovenesti incep cu A
- Datele din randul MRZ (ultimele 2 randuri cu cifre si litere) sunt cele mai fiabile
- Raspunde DOAR cu JSON valid, fara explicatii"""


def encode_image(image_path: Path) -> tuple[str, str]:
    """Converteste imaginea in base64 pentru API."""
    ext = image_path.suffix.lower()
    media_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".heic": "image/jpeg",  # HEIC tratat ca JPEG
    }
    media_type = media_types.get(ext, "image/jpeg")

    with open(image_path, "rb") as f:
        data = base64.standard_b64encode(f.read()).decode("utf-8")

    return data, media_type


def ocr_passport(client: anthropic.Anthropic, image_path: Path) -> dict | None:
    """Trimite poza la Claude si extrage datele pasaportului."""
    try:
        img_data, media_type = encode_image(image_path)

        message = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=500,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": img_data,
                            },
                        },
                        {
                            "type": "text",
                            "text": PASSPORT_PROMPT,
                        }
                    ],
                }
            ],
        )

        response_text = message.content[0].text.strip()

        # Extrage JSON din raspuns
        json_match = re.search(r'\{[^{}]*\}', response_text, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
        return None

    except json.JSONDecodeError:
        return None
    except Exception as e:
        raise e


def normalize_name(name: str) -> str:
    """Normalizeaza un nume (titluri mari, fara spatii duble)."""
    if not name:
        return ""
    return " ".join(w.capitalize() for w in name.strip().split())


async def find_or_create_candidate(db, passport_data: dict) -> tuple[dict, bool]:
    """
    Cauta un candidat cu acelasi numar de pasaport.
    Returneaza (document, created:bool)
    """
    passport_number = passport_data.get("passport_number", "").strip()
    surname = normalize_name(passport_data.get("surname", ""))
    given_names = normalize_name(passport_data.get("given_names", ""))
    full_name = f"{surname} {given_names}".strip()

    # Cauta dupa numarul pasaportului
    if passport_number:
        existing = await db.candidates.find_one({"passport_number": passport_number})
        if existing:
            return existing, False

    # Cauta dupa nume complet (aproximativ)
    if full_name:
        existing = await db.candidates.find_one({
            "name": {"$regex": re.escape(surname), "$options": "i"}
        })
        if existing:
            return existing, False

    # Creeaza candidat nou
    new_candidate = {
        "id": str(uuid.uuid4()),
        "name": full_name,
        "surname": surname,
        "given_names": given_names,
        "passport_number": passport_number,
        "nationality": passport_data.get("nationality", ""),
        "birth_date": passport_data.get("birth_date", ""),
        "passport_expiry": passport_data.get("expiry_date", ""),
        "sex": passport_data.get("sex", ""),
        "birth_place": passport_data.get("birth_place", ""),
        "personal_number": passport_data.get("personal_number", ""),
        "status": "nou",
        "source": "passport_ocr",
        "created_at": datetime.now(timezone.utc).isoformat(),
        # Campuri goale care vor fi completate ulterior
        "phone": "",
        "email": "",
        "agency_id": "",
        "agency_name": "",
        "notes": "Importat automat din poza pasaport (Google Drive)",
    }
    return new_candidate, True


async def update_candidate_passport(db, candidate: dict, passport_data: dict, created: bool):
    """Actualizeaza sau creeaza candidatul in MongoDB."""
    surname = normalize_name(passport_data.get("surname", ""))
    given_names = normalize_name(passport_data.get("given_names", ""))
    full_name = f"{surname} {given_names}".strip()

    update_fields = {}

    # Actualizeaza doar campurile goale
    if not candidate.get("passport_number") and passport_data.get("passport_number"):
        update_fields["passport_number"] = passport_data["passport_number"]
    if not candidate.get("nationality") and passport_data.get("nationality"):
        update_fields["nationality"] = passport_data["nationality"]
    if not candidate.get("birth_date") and passport_data.get("birth_date"):
        update_fields["birth_date"] = passport_data["birth_date"]
    if not candidate.get("passport_expiry") and passport_data.get("expiry_date"):
        update_fields["passport_expiry"] = passport_data["expiry_date"]
    if not candidate.get("sex") and passport_data.get("sex"):
        update_fields["sex"] = passport_data["sex"]
    if not candidate.get("birth_place") and passport_data.get("birth_place"):
        update_fields["birth_place"] = passport_data["birth_place"]
    if not candidate.get("personal_number") and passport_data.get("personal_number"):
        update_fields["personal_number"] = passport_data["personal_number"]
    if not candidate.get("surname") and surname:
        update_fields["surname"] = surname
    if not candidate.get("given_names") and given_names:
        update_fields["given_names"] = given_names

    if created:
        await db.candidates.insert_one(candidate)
    elif update_fields:
        await db.candidates.update_one(
            {"id": candidate["id"]},
            {"$set": update_fields}
        )


async def main():
    if not ANTHROPIC_API_KEY:
        print("EROARE: ANTHROPIC_API_KEY nu este setat in .env!")
        print("Adauga in fisierul .env:")
        print("  ANTHROPIC_API_KEY=sk-ant-api03-...")
        sys.exit(1)

    print("=" * 65)
    print("IMPORT PASAPOARTE CU OCR AI (Claude Vision)")
    print("=" * 65)

    # Gaseste toate pozele
    photos = []
    for ext in IMAGE_EXTENSIONS:
        photos.extend(PHOTOS_DIR.glob(f"*{ext}"))
    photos = sorted(set(photos))

    if not photos:
        print(f"EROARE: Nu gasesc poze in {PHOTOS_DIR}")
        print("Ruleaza mai intai: python download_pasapoarte_gdrive.py")
        return

    print(f"Poze gasite: {len(photos)}")
    print(f"Folder: {PHOTOS_DIR}\n")

    # Initializare clienti
    ai_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    mongo_client = AsyncIOMotorClient(MONGO_URL)
    db = mongo_client[DB_NAME]

    created_count = 0
    updated_count = 0
    skipped_count = 0
    error_count = 0
    results = []

    for i, photo_path in enumerate(photos, 1):
        prefix = f"[{i:02d}/{len(photos)}] {photo_path.name:<40}"

        try:
            # OCR cu Claude
            passport_data = ocr_passport(ai_client, photo_path)

            if not passport_data or not (passport_data.get("passport_number") or passport_data.get("surname")):
                print(f"{prefix} -> SKIP (nu e pasaport sau necitet)")
                skipped_count += 1
                continue

            pn = passport_data.get("passport_number", "N/A")
            surname = normalize_name(passport_data.get("surname", ""))
            given = normalize_name(passport_data.get("given_names", ""))
            exp = passport_data.get("expiry_date", "?")
            nat = passport_data.get("nationality", "?")

            # Cauta/creeaza in MongoDB
            candidate, created = await find_or_create_candidate(db, passport_data)
            await update_candidate_passport(db, candidate, passport_data, created)

            action = "NOU  " if created else "UPDATE"
            full_name = f"{surname} {given}".strip()
            print(f"{prefix} -> {action} | {full_name:<25} | {pn:<12} | {nat} | exp:{exp}")

            results.append({
                "file": photo_path.name,
                "name": full_name,
                "passport_number": pn,
                "nationality": nat,
                "expiry": exp,
                "action": "created" if created else "updated",
            })

            if created:
                created_count += 1
            else:
                updated_count += 1

        except Exception as e:
            print(f"{prefix} -> EROARE: {str(e)[:80]}")
            error_count += 1

        # Mica pauza sa nu depasim rata API
        await asyncio.sleep(0.5)

    mongo_client.close()

    print("\n" + "=" * 65)
    print(f"REZULTAT FINAL:")
    print(f"  Candidati noi creati:    {created_count}")
    print(f"  Candidati actualizati:   {updated_count}")
    print(f"  Poze fara pasaport:      {skipped_count}")
    print(f"  Erori:                   {error_count}")
    print(f"  Total poze procesate:    {len(photos)}")

    # Nationalitati gasite
    if results:
        from collections import Counter
        nats = Counter(r["nationality"] for r in results if r.get("nationality"))
        print(f"\n  Nationalitati:")
        for nat, cnt in nats.most_common():
            print(f"    {nat}: {cnt}")

        # Pasapoarte expirate (expiry < azi)
        today = datetime.now().strftime("%Y-%m-%d")
        expired = [r for r in results if r.get("expiry") and r["expiry"] < today]
        if expired:
            print(f"\n  ⚠  Pasapoarte EXPIRATE ({len(expired)}):")
            for r in expired:
                print(f"    - {r['name']}: {r['passport_number']} (exp: {r['expiry']})")

    print("=" * 65)

    # Salveaza raport JSON
    report_path = PHOTOS_DIR.parent / "passport_ocr_report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\nRaport salvat: {report_path}")


if __name__ == "__main__":
    asyncio.run(main())
