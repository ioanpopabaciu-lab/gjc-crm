import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import traceback

LOCAL_MONGO_URL = "mongodb://localhost:27017"
ATLAS_MONGO_URL = "mongodb+srv://gjc_admin:GJC2026admin@cluster0.4l9rft3.mongodb.net/gjc_crm?retryWrites=true&w=majority&appName=Cluster0"

LOCAL_DB_NAME = "gjc_crm"
ATLAS_DB_NAME = "gjc_crm_db"

async def migrate():
    print("Conectare la MongoDB...")
    local_client = AsyncIOMotorClient(LOCAL_MONGO_URL)
    atlas_client = AsyncIOMotorClient(ATLAS_MONGO_URL)
    
    local_db = local_client[LOCAL_DB_NAME]
    atlas_db = atlas_client[ATLAS_DB_NAME]
    
    collections_to_migrate = ["users", "companies", "candidates", "immigration", "pipeline", "documents", "alerts"]
    
    for coll_name in collections_to_migrate:
        try:
            local_coll = local_db[coll_name]
            atlas_coll = atlas_db[coll_name]
            
            count = await local_coll.count_documents({})
            if count == 0:
                print(f"Colectia '{coll_name}' este goala, o sarim.")
                continue
                
            print(f"Migram {count} documente din colectia '{coll_name}'...")
            
            # Citesc tot din local
            docs = await local_coll.find({}).to_list(length=None)
            
            # Sterg in atlas ca sa nu se dubleze
            await atlas_coll.delete_many({})
            
            # Inserez in atlas
            if docs:
                await atlas_coll.insert_many(docs)
                print(f" ✓ Succes '{coll_name}'")
        except Exception as e:
            print(f"Eroare la colectia {coll_name}: {e}")
            traceback.print_exc()
            
    print("\nMigrarea a fost finalizata cu succes!")

if __name__ == "__main__":
    asyncio.run(migrate())
