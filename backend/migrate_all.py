import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

LOCAL_MONGO_URL = "mongodb://localhost:27017"
ATLAS_MONGO_URL = "mongodb+srv://gjc_admin:GJC2026admin@cluster0.4l9rft3.mongodb.net/gjc_crm?retryWrites=true&w=majority&appName=Cluster0"

async def migrate():
    local_client = AsyncIOMotorClient(LOCAL_MONGO_URL)
    atlas_client = AsyncIOMotorClient(ATLAS_MONGO_URL)
    local_db = local_client["gjc_crm"]
    atlas_db = atlas_client["gjc_crm_db"]
    collections = await local_db.list_collection_names()
    print(f"Colectii: {collections}")
    for coll_name in collections:
        local_coll = local_db[coll_name]
        atlas_coll = atlas_db[coll_name]
        count = await local_coll.count_documents({})
        if count == 0: continue
        print(f"Migram {count} din {coll_name}...")
        docs = await local_coll.find({}).to_list(length=None)
        await atlas_coll.delete_many({})
        await atlas_coll.insert_many(docs)
        print(f"Succes {coll_name}")

if __name__ == "__main__":
    asyncio.run(migrate())
