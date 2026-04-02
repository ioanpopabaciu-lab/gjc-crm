import os
import shutil

os.environ['MONGO_URL'] = "mongodb+srv://gjc_admin:GJC2026admin@cluster0.4l9rft3.mongodb.net/gjc_crm?retryWrites=true&w=majority&appName=Cluster0"
os.environ['DB_NAME'] = "gjc_crm_db"

print("Se pregatesc fisierele Excel...")
src1 = "data/Baza de date_Ioan Baciu_07 04 2025.xlsx"
dst1 = "data/baza_date_apr2025.xlsx"
if os.path.exists(src1):
    shutil.copy2(src1, dst1)

src2 = "data/Baza de date noua, 18-Feb-2026.xlsx"
dst2 = "data/baza_date_feb2026.xlsx"
if os.path.exists(src2):
    shutil.copy2(src2, dst2)

print("Pornim importul pe Atlas...")
with open("import_data.py", "r", encoding="utf-8") as f:
    code = f.read()

exec(code)
