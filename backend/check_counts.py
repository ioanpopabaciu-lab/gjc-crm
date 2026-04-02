import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

ATLAS_MONGO_URL = "mongodb+srv://gjc_admin:GJC2026admin@cluster0.4l9rft3.mongodb.net/gjc_crm?retryWrites=true&w=majority&appName=Cluster0"
LOCAL_MONGO_URL = "mongodb://localhost:27017"

async def check(label, url, db_name):
    client = AsyncIOMotorClient(url)
    db = client[db_name]
    cols = ["users", "companies", "candidates", "immigration", "pipeline", "documents", "alerts"]
    print(f"--- {label} ---")
    for c in cols:
        count = await db[c].count_documents({})
        print(f"{c}: {count}")

async def main():
    await check("LOCAL", LOCAL_MONGO_URL, "gjc_crm")
    await check("ATLAS", ATLAS_MONGO_URL, "gjc_crm_db")

asyncio.run(main())
