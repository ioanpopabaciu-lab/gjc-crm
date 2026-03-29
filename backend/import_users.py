import asyncio
import json
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
db = AsyncIOMotorClient(mongo_url)['gjc_crm']

async def main():
    with open('../database_export/users.json') as f:
        users = json.load(f)
    await db.users.delete_many({})
    if users:
        await db.users.insert_many(users)
    print("Users imported!")

asyncio.run(main())
