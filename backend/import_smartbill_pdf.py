"""
Script: import_smartbill_pdf.py
Importa facturile din PDF-ul exportat din SmartBill in MongoDB (colectia payments).

Rulare: python -X utf8 import_smartbill_pdf.py
"""

import asyncio
import re
import sys
from pathlib import Path
from datetime import datetime, timezone
import uuid

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import pypdf
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = "mongodb+srv://gjc_admin:GJC2026admin@cluster0.4l9rft3.mongodb.net/gjc_crm?retryWrites=true&w=majority&appName=Cluster0"
DB_NAME = "gjc_crm_db"
PDF_PATH = Path(__file__).parent / "data" / "Raport facturi emise - SmartBill.pdf"


def parse_invoice_page(text: str) -> dict | None:
    """Extrage datele dintr-o pagina de factura SmartBill"""
    if not text or "FACTURA" not in text:
        return None

    result = {}

    # Client name — linia imediat dupa "Client:"
    client_match = re.search(r'Client:\s*\n(.+?)(?:\n|Reg\. com)', text, re.DOTALL)
    if client_match:
        result["entity_name"] = client_match.group(1).strip().replace("\n", " ")

    # CIF client
    cif_match = re.search(r'CIF:\s*(RO\d+|\d+)', text)
    if cif_match:
        result["client_cif"] = cif_match.group(1).strip()

    # Serie si numar — "Seria EN-J nr. 0084" sau "Seria GJC nr. 001"
    serie_match = re.search(r'Seria\s+([A-Z\-]+)\s+nr\.\s*(\d+)', text, re.IGNORECASE)
    if serie_match:
        serie = serie_match.group(1).strip()
        numar = serie_match.group(2).strip().lstrip("0") or "0"
        result["invoice_number"] = f"{serie}{numar}"
        result["invoice_series"] = serie
        result["invoice_nr"] = int(numar)

    # Data emiterii — "Data (zi/luna/an): 11/02/2026"
    data_match = re.search(r'Data\s*\(zi/luna/an\):\s*(\d{1,2}/\d{1,2}/\d{4})', text)
    if data_match:
        raw = data_match.group(1)
        try:
            d = datetime.strptime(raw, "%d/%m/%Y")
            result["date_received"] = d.strftime("%Y-%m-%d")
        except Exception:
            result["date_received"] = raw

    # Total plata — "Total plata 5094.00" sau "Total plata 10 018.00"
    total_match = re.search(r'Total\s+plat[aă]\s+([\d\s\.,]+)', text, re.IGNORECASE)
    if total_match:
        val_str = total_match.group(1).strip()
        val_str = val_str.replace(" ", "").replace(",", ".")
        # Ia doar primul numar valid
        num_match = re.search(r'[\d]+\.?\d*', val_str)
        if num_match:
            try:
                result["amount"] = float(num_match.group())
            except Exception:
                result["amount"] = 0.0

    # Moneda — din "-Lei-" sau "-EUR-"
    if "-Lei-" in text or "RON" in text:
        result["currency"] = "RON"
    elif "-EUR-" in text or "EUR" in text:
        result["currency"] = "EUR"
    elif "USD" in text:
        result["currency"] = "USD"
    else:
        result["currency"] = "RON"

    # Termen plata
    termen_match = re.search(r'Termen\s+plat[aă]:\s*(\d{1,2}/\d{1,2}/\d{4})', text, re.IGNORECASE)
    if termen_match:
        result["due_date"] = termen_match.group(1)

    # Servicii (descriere)
    # Cauta linii intre header tabel si "Total plata"
    services = []
    lines = text.split("\n")
    in_services = False
    for line in lines:
        line = line.strip()
        if re.match(r'^0\s+1\s+2', line):  # header tabel
            in_services = True
            continue
        if "Total plata" in line or "Total plat" in line:
            in_services = False
            continue
        if in_services and line and not re.match(r'^\d+\s*$', line):
            # Filtreaza linii goale si numere simple
            if len(line) > 10 and not re.match(r'^[\d\s\.,]+$', line):
                services.append(line)
    if services:
        result["notes"] = " | ".join(services[:2])[:300]

    return result if result.get("invoice_number") and result.get("amount") else None


async def main():
    print("=" * 65)
    print("IMPORT FACTURI DIN PDF SMARTBILL")
    print("=" * 65)

    if not PDF_PATH.exists():
        print(f"EROARE: Nu gasesc fisierul: {PDF_PATH}")
        return

    print(f"Fisier: {PDF_PATH.name}")

    # Citim PDF-ul
    with open(PDF_PATH, "rb") as f:
        reader = pypdf.PdfReader(f)
        total_pages = len(reader.pages)
        print(f"Pagini: {total_pages}\n")
        pages_text = [reader.pages[i].extract_text() for i in range(total_pages)]

    # Conectare MongoDB
    mongo_client = AsyncIOMotorClient(MONGO_URL)
    db = mongo_client[DB_NAME]

    added = 0
    skipped = 0
    errors = 0
    invoices_found = []

    for i, text in enumerate(pages_text, 1):
        inv = parse_invoice_page(text)
        if not inv:
            continue

        inv_number = inv.get("invoice_number", "")
        entity_name = inv.get("entity_name", "")
        amount = inv.get("amount", 0)
        prefix = f"[{i:02d}/{total_pages}] {inv_number:<12} {entity_name[:30]:<30} {amount:>10.2f} {inv.get('currency','RON')}"

        # Verifica duplicat
        existing = await db.payments.find_one({"invoice_number": inv_number})
        if existing:
            print(f"{prefix} -> SKIP (exista deja)")
            skipped += 1
            continue

        # Cauta compania in CRM dupa nume
        entity_id = ""
        company = await db.companies.find_one(
            {"name": {"$regex": re.escape(entity_name[:20]), "$options": "i"}},
            {"_id": 0, "id": 1}
        )
        if company:
            entity_id = company.get("id", "")

        payment_doc = {
            "id": str(uuid.uuid4()),
            "type": "firma",
            "entity_id": entity_id,
            "entity_name": entity_name,
            "amount": amount,
            "currency": inv.get("currency", "RON"),
            "date_received": inv.get("date_received", ""),
            "invoice_number": inv_number,
            "status": "platit",  # din SmartBill lista = Incasata
            "method": "transfer",
            "contract_id": "",
            "notes": inv.get("notes", f"Importat din SmartBill PDF — {inv_number}"),
            "due_date": inv.get("due_date", ""),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "source": "smartbill_pdf",
        }

        await db.payments.insert_one(payment_doc)
        print(f"{prefix} -> OK")
        invoices_found.append(inv)
        added += 1

    mongo_client.close()

    print("\n" + "=" * 65)
    print(f"REZULTAT FINAL:")
    print(f"  Importate cu succes:  {added}")
    print(f"  Deja existente (skip): {skipped}")
    print(f"  Erori parsare:        {errors}")
    print(f"  Total pagini PDF:     {total_pages}")

    if added > 0:
        total_ron = sum(i["amount"] for i in invoices_found if i.get("currency") == "RON")
        total_eur = sum(i["amount"] for i in invoices_found if i.get("currency") == "EUR")
        print(f"\n  Valoare importata:")
        if total_ron: print(f"    RON: {total_ron:,.2f}")
        if total_eur: print(f"    EUR: {total_eur:,.2f}")
    print("=" * 65)


if __name__ == "__main__":
    asyncio.run(main())
