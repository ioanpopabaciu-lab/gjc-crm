"""
Script: download_pasapoarte_gdrive.py
Descarca pozele pasapoartelor din Google Drive folosind requests direct.

Rulare: python -X utf8 download_pasapoarte_gdrive.py
"""

import sys
import time
import re
from pathlib import Path

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import requests

# ID-urile celor 50 de fisiere (obtinute cu gdown skip_download)
file_ids = [
    "1i3waamao_SinxZEzYXc0wnmxQvKSdQuc",
    "1cH-Qe9j0A1uZh9y65V1bWdWzUA9BudOK",
    "1d-TlyaEq1mj72hGReyKyw3elGXuJ5jiS",
    "1OyB8QiCfTy_pcAFGxW1DcEku_ddoIFqf",
    "1Dxk5EF0qcZS1RLPJZcIvkopmXDRC26Dz",
    "15n4AZ7opdhJtRYrhoy8Xu_5tDBOJTH6_",
    "10bYTwHrfnffF_ttkFCSEGUMFMPRWt9T-",
    "1DbMGOveCrdyBZQHwzkoXD3kuConRrMm1",
    "1aBdcAGpKsHgL_JJKD_1axA-6-_Mcp_AS",
    "1GB_DOsqOC2HdozZ0uGRfAziK4rulix9h",
    "1vXSgTfWhGyAMfmSwJMtPX04RKnXB3vmk",
    "1SEq1p750Fef3w-eaHcGbe4yLWryyqoNL",
    "1XXkaMWKLmp9MiIfucA3ykhXgLlcqzEKc",
    "18Mtz2rIi_uvZKapKJaqegNqMkXYQeuPq",
    "19h6Mkn0Yrat8Hz_-eTnvbnqA1ewrnxay",
    "1VaIfmTPRPIsi4eaFfajK9pE0-0EPWXL_",
    "12k9JmVowejMexwtKL2uphz6W8Dx3BxJN",
    "1wPXz-yUvGtxXaBW2TbmtxpVcO6T3Cb1w",
    "1wBvtj4i4FyRiDf-MWFkO3X3aR7tfne9x",
    "1XTs2HGO7rhtlql0sM5GQZyXsFZLxFI_T",
    "19sVLClxRk9KE1WVRh5nuQgfd15VPV72f",
    "1sz2X1gqeUVdvzMR2WyBNl1dRODVaf8SG",
    "1XZ-Gz_rceh4wwkDHmmKsmXw8DDMWFjB0",
    "1UqTx1gHy9-Oq60gpUwZRglBacpcQVgvo",
    "1y8yJi50lLNjuwTjc1UW26mXR3n87Qz5S",
    "1XNsONkRgQhBlRALMSOFnx1cK0gTzBxBa",
    "1lAw3mjbVywTWZc3EdT0UAHbIqghVD5PU",
    "1mhU2xUZaPzqK1fHRQK3WoUjORRSPN5jE",
    "1Rby-QOhTn6WJKYI-ddGQ3rNrTA6LZfBA",
    "11B52sRw5Nx5KOAQqjAfRw7OXIbYNjazp",
    "1INxvDx3jE-XzWrn9ioXsuTxxG_JtNajX",
    "1V0T6gVsWtvBLKhDq1g8RCLnVv-ljE9Fk",
    "113k2Jztm_QI8ozTqItW8TBijnsrPa4n0",
    "1X4NwIM_XutY-lu6VqjLKE6zLOkjnmmGU",
    "18Awqwudo2Lu0cKsNJhCHHnYu9NcdODWX",
    "1bADKN773qLqNO2PILlQ-qqprKadQElGG",
    "1bq2nIX9MIBiL-iTdcLBzU2D-gXyV3eiR",
    "1xAtQQYcYmWsKzqDWKiAgiVjVVuWsmtep",
    "1okVY9DR5y3YAn-WBFjj6oUO_O_vsun0d",
    "1LhcEUR3t5oKiFdqTGRZkFTxEdI7KSPhL",
    "1KykMiTMWRW4QKKiNxmNfzsqdHNcsxtMu",
    "11SbboSDcCvf4kCvvUoXEoWZ8AFom9GwU",
    "1_VDmZ9BuDar5_1aSqr-6B9Kn7GeVXK_5",
    "1hDfXzKHVf3fTo5CbFBT-M5l7LE6_biST",
    "1JyNpTrpHpusFFLrRNwVdsDP3xKcaID6B",
    "1cFSJjyZuMXJyzK6Ac5nNgScJDiw5Sz7g",
    "169fWkX193iVBwe-mrfC8M4QzzZLwDOO4",
    "1tCXXOOxWg6F4NG9GBkC7TBQAqWBDi_X7",
    "1Hft_73qi7671Vrf4_vbbCx1QFINrSLOg",
    "1S2atxLfpSk5aY2n_m2KwFGKDiDlc3OwH",
]

out_dir = Path(__file__).parent / "data" / "pasapoarte_gdrive"
out_dir.mkdir(parents=True, exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
}

def download_gdrive_file(fid: str, out_path: Path) -> bool:
    """Descarca un fisier din Google Drive folosind requests."""
    session = requests.Session()

    # Incercam URL-ul direct
    url = f"https://drive.google.com/uc?export=download&id={fid}"

    try:
        resp = session.get(url, headers=HEADERS, stream=True, timeout=30)

        # Verificam daca avem pagina de confirmare (fisiere mari)
        content_type = resp.headers.get("Content-Type", "")
        if "text/html" in content_type:
            # Extragem token de confirmare
            html = resp.text
            # Cauta confirm token
            confirm_match = re.search(r'name="confirm"\s+value="([^"]+)"', html)
            uuid_match = re.search(r'name="uuid"\s+value="([^"]+)"', html)

            if confirm_match:
                confirm = confirm_match.group(1)
                uuid_val = uuid_match.group(1) if uuid_match else ""
                url2 = f"https://drive.google.com/uc?export=download&id={fid}&confirm={confirm}&uuid={uuid_val}"
                resp = session.get(url2, headers=HEADERS, stream=True, timeout=60)
            else:
                # Incearca URL alternativ
                url3 = f"https://drive.usercontent.google.com/download?id={fid}&export=download&authuser=0"
                resp = session.get(url3, headers=HEADERS, stream=True, timeout=60)

        # Verificam content-type final
        final_ct = resp.headers.get("Content-Type", "")
        if "text/html" in final_ct:
            return False  # Inca HTML, nu imagine

        # Scriem fisierul
        total = 0
        with open(out_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    total += len(chunk)

        if total < 5000:  # Mai mic de 5KB = probabil eroare
            out_path.unlink(missing_ok=True)
            return False

        return True

    except Exception as e:
        print(f"   Exceptie: {str(e)[:60]}")
        return False


print("=" * 60)
print("DESCARCARE PASAPOARTE DIN GOOGLE DRIVE")
print("=" * 60)
print(f"Folder destinatie: {out_dir}")
print(f"Total fisiere: {len(file_ids)}\n")

ok = 0
errors = 0

for i, fid in enumerate(file_ids, 1):
    out_path = out_dir / f"pasaport_{i:03d}_{fid[:8]}.jpg"

    if out_path.exists() and out_path.stat().st_size > 5000:
        print(f"[{i:02d}/{len(file_ids)}] {out_path.name} -> EXISTA ({out_path.stat().st_size // 1024} KB)")
        ok += 1
        continue

    success = download_gdrive_file(fid, out_path)
    if success:
        size_kb = out_path.stat().st_size // 1024
        print(f"[{i:02d}/{len(file_ids)}] {out_path.name} -> OK ({size_kb} KB)")
        ok += 1
    else:
        print(f"[{i:02d}/{len(file_ids)}] {fid[:8]}... -> EROARE")
        errors += 1

    time.sleep(0.5)

print("\n" + "=" * 60)
print(f"REZULTAT: {ok} descarcate, {errors} erori")
print(f"Fisiere in folder: {len(list(out_dir.glob('*.jpg')))}")
print("=" * 60)
