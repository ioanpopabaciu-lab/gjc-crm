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

async def import_col(filename, col_name):
    filepath = f'../database_export/{filename}'
    if not os.path.exists(filepath):
        return
    with open(filepath, encoding='utf-8') as f:
        data = json.load(f)
    await db[col_name].delete_many({})
    if data:
        await db[col_name].insert_many(data)
    print(f"{col_name} imported!")

async def main():
    await import_col('companies.json', 'companies')
    await import_col('candidates.json', 'candidates')
    await import_col('immigration_cases.json', 'immigration_cases')
    await import_col('pipeline.json', 'pipeline')
    await import_col('jobs.json', 'jobs')

asyncio.run(main())
