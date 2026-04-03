"""
Deduplicare candidati cu acelasi passport_number.
Pastram candidatul cu dosare de imigrare, stergem duplicatul.
Daca ambii au dosare, pastram pe cel cu mai multe date si actualizam candidate_id in dosare.
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone

ATLAS = "mongodb+srv://gjc_admin:GJC2026admin@cluster0.4l9rft3.mongodb.net/gjc_crm?retryWrites=true&w=majority&appName=Cluster0"

async def run():
    client = AsyncIOMotorClient(ATLAS)
    db = client['gjc_crm_db']
    now = datetime.now(timezone.utc).isoformat()

    # Gaseste duplicatele dupa passport_number
    pipeline = [
        {"$match": {"passport_number": {"$nin": [None, ""]}}},
        {"$group": {
            "_id": "$passport_number",
            "count": {"$sum": 1},
            "ids": {"$push": "$id"}
        }},
        {"$match": {"count": {"$gt": 1}}}
    ]
    dups = await db.candidates.aggregate(pipeline).to_list(None)
    print(f"Duplicate passport numbers gasite: {len(dups)}")

    deleted = 0
    merged = 0
    skipped = 0

    for dup in dups:
        pp = dup["_id"]
        ids = dup["ids"]

        # Incarca toti candidatii cu acest passport
        cands = await db.candidates.find(
            {"id": {"$in": ids}}, {"_id": 0}
        ).to_list(None)

        if len(cands) < 2:
            continue

        # Numara dosarele de imigrare pentru fiecare
        scores = []
        for c in cands:
            case_cnt = await db.immigration_cases.count_documents({"candidate_id": c["id"]})
            # Scor = numar dosare * 100 + completitudine date
            completeness = sum(1 for f in ["nationality", "job_type", "passport_expiry", "company_id", "phone", "email"] if c.get(f))
            scores.append((case_cnt * 100 + completeness, c))

        scores.sort(key=lambda x: -x[0])
        winner = scores[0][1]
        losers = [s[1] for s in scores[1:]]

        # Copiaza datele utile de la loseri la winner
        update_winner = {}
        fields_to_copy = ["nationality", "job_type", "passport_expiry", "permit_expiry",
                           "phone", "email", "birth_date", "birth_country", "company_id", "company_name", "notes"]
        for loser in losers:
            for f in fields_to_copy:
                if loser.get(f) and not winner.get(f) and not update_winner.get(f):
                    update_winner[f] = loser[f]

        if update_winner:
            update_winner["updated_at"] = now
            await db.candidates.update_one({"id": winner["id"]}, {"$set": update_winner})

        # Actualizeaza dosarele de imigrare de la loseri sa pointeze la winner
        for loser in losers:
            loser_cases = await db.immigration_cases.count_documents({"candidate_id": loser["id"]})
            if loser_cases > 0:
                # Actualizeaza candidate_id in dosare
                await db.immigration_cases.update_many(
                    {"candidate_id": loser["id"]},
                    {"$set": {"candidate_id": winner["id"], "updated_at": now}}
                )
                merged += loser_cases

            # Sterge duplicatul
            await db.candidates.delete_one({"id": loser["id"]})
            deleted += 1
            print(f"  Sters: {loser.get('last_name')} {loser.get('first_name')} (pp={pp}) -> pastrat {winner.get('last_name')} {winner.get('first_name')}")

    total = await db.candidates.count_documents({})
    print(f"\nRezultat:")
    print(f"  Candidati sterse (duplicate): {deleted}")
    print(f"  Dosare reasignate: {merged}")
    print(f"  Total candidati ramas: {total}")

    client.close()
    print("\n✓ Gata!")

asyncio.run(run())
