"""
Import passport_expiry din Excel Baza de date (coloana dupa Pasaport)
"""
import sys, io, re, unicodedata, asyncio
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from pathlib import Path
from datetime import datetime, timezone
import pandas as pd
from motor.motor_asyncio import AsyncIOMotorClient

ATLAS = "mongodb+srv://gjc_admin:GJC2026admin@cluster0.4l9rft3.mongodb.net/gjc_crm?retryWrites=true&w=majority&appName=Cluster0"

def norm(t):
    if not t: return ''
    n = unicodedata.normalize('NFD', str(t))
    n = ''.join(c for c in n if not unicodedata.combining(c))
    return re.sub(r'\s+', ' ', n.lower().strip())

def safe_s(v):
    if v is None: return None
    s = str(v).strip()
    return s if s and s.lower() not in ('nan', 'none', '-', 'n/a', '', '#ref!') else None

def safe_d(v):
    if v is None: return None
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d")
    try:
        ts = pd.Timestamp(v)
        if ts.year > 2000:
            return ts.strftime("%Y-%m-%d")
    except: pass
    s = str(v).strip()
    if not s or s.lower() in ('nan', 'none', '-'): return None
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%m/%d/%Y", "%Y-%m-%d %H:%M:%S"):
        try: return datetime.strptime(s.split()[0], fmt).strftime("%Y-%m-%d")
        except: pass
    return None

async def run():
    client = AsyncIOMotorClient(ATLAS)
    db = client['gjc_crm_db']
    now = datetime.now(timezone.utc).isoformat()

    excel_path = Path(r"C:\Users\ioanp\OneDrive\Desktop\GJC CRM\backend\data\Baza de date_Ioan Baciu_07 04 2025.xlsx")
    xl = pd.ExcelFile(str(excel_path))

    upd_pp_exp = 0
    upd_pp = 0
    upd_nat = 0
    upd_job = 0

    for sheet in xl.sheet_names:
        if sheet.upper() == 'SUMAR':
            continue
        try:
            df_raw = xl.parse(sheet, header=None)
            header_row = 10
            for i, row in df_raw.iterrows():
                vals = [str(v) for v in row]
                if any('Pasaport' in v or 'Pașaport' in v or 'Ocupat' in v for v in vals):
                    header_row = i
                    break

            df = xl.parse(sheet, header=header_row)
            df.columns = [str(c).strip() for c in df.columns]
            col_norm = {norm(c): c for c in df.columns}

            pp_col   = col_norm.get('pasaport') or col_norm.get('nr. pasaport') or col_norm.get('nr pasaport')
            nat_col  = col_norm.get('nationalitate') or col_norm.get('cetatenie')
            job_col  = col_norm.get('ocupatia') or col_norm.get('ocupatie') or col_norm.get('meserie')
            name_col   = col_norm.get('nume')
            prenume_col = col_norm.get('prenume')

            # Coloana passport expiry = prima Unnamed dupa Pasaport
            pp_exp_col = None
            if pp_col:
                cols = list(df.columns)
                pp_idx = cols.index(pp_col)
                for next_idx in range(pp_idx + 1, min(pp_idx + 3, len(cols))):
                    nc = cols[next_idx]
                    # Check if this col has date-like values
                    sample_vals = df[nc].dropna().head(5)
                    has_dates = False
                    for sv in sample_vals:
                        d = safe_d(sv)
                        if d and d > '2020-01-01':
                            has_dates = True
                            break
                    if has_dates:
                        pp_exp_col = nc
                        break

            if not pp_col and not name_col:
                continue

            processed = 0
            for _, row in df.iterrows():
                pp     = safe_s(row.get(pp_col, '')) if pp_col else None
                nat    = safe_s(row.get(nat_col, '')) if nat_col else None
                job    = safe_s(row.get(job_col, '')) if job_col else None
                fn     = safe_s(row.get(prenume_col, '')) if prenume_col else None
                ln     = safe_s(row.get(name_col, '')) if name_col else None
                pp_exp = safe_d(row.get(pp_exp_col, '')) if pp_exp_col else None

                if not pp and not (fn and ln) and not (fn and not ln): continue

                # Cauta candidatul
                cand = None
                if pp:
                    cand = await db.candidates.find_one({"passport_number": pp}, {"_id": 0})
                if not cand and fn and ln:
                    cand = await db.candidates.find_one(
                        {"$or": [
                            {"first_name": {"$regex": f"^{re.escape(fn)}$", "$options": "i"},
                             "last_name": {"$regex": f"^{re.escape(ln)}$", "$options": "i"}},
                            {"first_name": {"$regex": f"^{re.escape(ln)}$", "$options": "i"},
                             "last_name": {"$regex": f"^{re.escape(fn)}$", "$options": "i"}}
                        ]}, {"_id": 0}
                    )
                # DaVinci format: name + '' in prenume
                if not cand and ln and not fn:
                    parts = ln.strip().split()
                    if len(parts) >= 2:
                        # Try matching full name in different combos
                        for split_at in range(1, len(parts)):
                            p1 = ' '.join(parts[:split_at])
                            p2 = ' '.join(parts[split_at:])
                            cand = await db.candidates.find_one(
                                {"$or": [
                                    {"first_name": {"$regex": f"^{re.escape(p1)}$", "$options": "i"},
                                     "last_name": {"$regex": f"^{re.escape(p2)}$", "$options": "i"}},
                                    {"first_name": {"$regex": f"^{re.escape(p2)}$", "$options": "i"},
                                     "last_name": {"$regex": f"^{re.escape(p1)}$", "$options": "i"}}
                                ]}, {"_id": 0}
                            )
                            if cand: break

                if not cand: continue

                update = {}
                if pp_exp and not cand.get("passport_expiry"):
                    update["passport_expiry"] = pp_exp
                    upd_pp_exp += 1
                if pp and not cand.get("passport_number"):
                    update["passport_number"] = pp
                    upd_pp += 1
                if nat and not cand.get("nationality"):
                    update["nationality"] = nat.title()
                    upd_nat += 1
                if job and not cand.get("job_type"):
                    update["job_type"] = job.title()
                    upd_job += 1

                if update:
                    update["updated_at"] = now
                    await db.candidates.update_one({"id": cand["id"]}, {"$set": update})
                    processed += 1

            if processed > 0:
                print(f"  Sheet '{sheet}': {processed} actualizat")
        except Exception as e:
            print(f"  [E] Sheet '{sheet}': {e}")
            import traceback
            traceback.print_exc()

    print(f"\nRezultat:")
    print(f"  passport_expiry actualizat: {upd_pp_exp}")
    print(f"  passport_number actualizat: {upd_pp}")
    print(f"  nationality actualizat:     {upd_nat}")
    print(f"  job_type actualizat:        {upd_job}")

    # Final stats
    total = await db.candidates.count_documents({})
    print(f"\nStare finala ({total} candidati):")
    print(f"  passport_expiry: {await db.candidates.count_documents({'passport_expiry': {'$nin': [None, '']}})}/{total}")
    print(f"  nationality:     {await db.candidates.count_documents({'nationality': {'$nin': [None, '']}})}/{total}")
    print(f"  job_type:        {await db.candidates.count_documents({'job_type': {'$nin': [None, '']}})}/{total}")
    print(f"  passport_nr:     {await db.candidates.count_documents({'passport_number': {'$nin': [None, '']}})}/{total}")

    client.close()
    print("\n✓ Gata!")

asyncio.run(run())
