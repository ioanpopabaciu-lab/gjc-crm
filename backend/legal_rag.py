"""
GJC Legal RAG Engine
Căutare hibridă (full-text BM25 + semantic opțional) + generare documente Claude.
"""

import os
import re
import hashlib
import logging
from typing import List, Optional, Dict, Any

import anthropic as anthropic_sdk
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

CLAUDE_MODEL = "claude-sonnet-4-5-20250929"

# ── Embedding providers (opționale) ──────────────────────────────────────────
VOYAGE_KEY = os.environ.get("VOYAGE_API_KEY")
COHERE_KEY = os.environ.get("COHERE_API_KEY")


async def get_embedding(text: str) -> Optional[List[float]]:
    """Generează embedding text. Returnează None dacă nu e configurat niciun provider."""
    if VOYAGE_KEY:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.post(
                    "https://api.voyageai.com/v1/embeddings",
                    headers={"Authorization": f"Bearer {VOYAGE_KEY}"},
                    json={"model": "voyage-law-2", "input": [text]},
                )
                if r.status_code == 200:
                    return r.json()["data"][0]["embedding"]
        except Exception as e:
            logger.warning(f"Voyage embedding failed: {e}")
    if COHERE_KEY:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.post(
                    "https://api.cohere.ai/v1/embed",
                    headers={"Authorization": f"Bearer {COHERE_KEY}"},
                    json={
                        "texts": [text],
                        "model": "embed-multilingual-v3.0",
                        "input_type": "search_query",
                    },
                )
                if r.status_code == 200:
                    return r.json()["embeddings"][0]
        except Exception as e:
            logger.warning(f"Cohere embedding failed: {e}")
    return None


# ── Chunking ──────────────────────────────────────────────────────────────────

def chunk_legal_text(text: str, act_title: str = "", act_id: str = "") -> List[Dict]:
    """
    Împarte textul unui act normativ în chunk-uri pe articole.
    Fallback pe paragrafe dacă articolele nu sunt detectate.
    """
    chunks = []

    # Normalizare text
    text = re.sub(r"\r\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    # Încearcă să segmenteze pe articole: "Art. 1", "ARTICOLUL 1", "Articolul 1."
    article_pattern = re.compile(
        r"(?:^|\n)(?:Art\.|ARTICOLUL|Articolul)\s+(\d+(?:\^?\d*)?)\b",
        re.MULTILINE | re.IGNORECASE,
    )
    matches = list(article_pattern.finditer(text))

    if len(matches) >= 3:
        # Split pe articole
        for idx, match in enumerate(matches):
            start = match.start()
            end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
            article_text = text[start:end].strip()
            article_num = match.group(1)

            # Sub-split dacă articolul e prea mare (> 400 cuvinte)
            words = article_text.split()
            if len(words) > 400:
                sub_chunks = _split_by_paragraph(article_text, 400)
                for sub_idx, sub_text in enumerate(sub_chunks):
                    if len(sub_text.strip()) > 50:
                        chunks.append({
                            "article_number": article_num,
                            "section_path": f"{act_title} > Art. {article_num} > parte {sub_idx + 1}",
                            "text": sub_text.strip(),
                            "chunk_type": "article_part",
                        })
            else:
                if len(article_text) > 50:
                    chunks.append({
                        "article_number": article_num,
                        "section_path": f"{act_title} > Art. {article_num}",
                        "text": article_text.strip(),
                        "chunk_type": "article",
                    })
    else:
        # Fallback: split pe paragrafe
        paragraphs = [p.strip() for p in text.split("\n\n") if len(p.strip()) > 80]
        buffer = ""
        for para in paragraphs:
            if len((buffer + " " + para).split()) > 350:
                if buffer:
                    chunks.append({
                        "article_number": None,
                        "section_path": act_title,
                        "text": buffer.strip(),
                        "chunk_type": "paragraph",
                    })
                buffer = para
            else:
                buffer = (buffer + "\n\n" + para).strip()
        if buffer and len(buffer) > 80:
            chunks.append({
                "article_number": None,
                "section_path": act_title,
                "text": buffer.strip(),
                "chunk_type": "paragraph",
            })

    return chunks


def _split_by_paragraph(text: str, max_words: int) -> List[str]:
    """Împarte text în bucăți de max_words, respectând paragrafele."""
    paragraphs = text.split("\n")
    parts = []
    current = []
    current_words = 0
    for para in paragraphs:
        w = len(para.split())
        if current_words + w > max_words and current:
            parts.append("\n".join(current))
            current = [para]
            current_words = w
        else:
            current.append(para)
            current_words += w
    if current:
        parts.append("\n".join(current))
    return parts


# ── Căutare corpus ────────────────────────────────────────────────────────────

async def search_corpus(
    db: AsyncIOMotorDatabase,
    query: str,
    top_k: int = 12,
    act_id: Optional[str] = None,
) -> List[Dict]:
    """
    Căutare hibridă în corpusul legislativ.
    1. Încearcă MongoDB $text search (cu index)
    2. Fallback: $regex pe cuvinte cheie
    3. Opțional: re-ranking semantic cu embedding (dacă e configurat)
    """
    results = []
    filter_q: Dict = {}
    if act_id:
        filter_q["act_id"] = act_id

    # ── Pas 1: Full-text search (BM25) ───────────────────────────────────────
    try:
        text_filter = {**filter_q, "$text": {"$search": query}}
        cursor = db.legal_chunks.find(
            text_filter,
            {"_id": 0, "score": {"$meta": "textScore"}},
        ).sort([("score", {"$meta": "textScore"})]).limit(top_k * 2)
        results = await cursor.to_list(top_k * 2)
    except Exception:
        results = []

    # ── Pas 2: Fallback regex dacă full-text nu găsește nimic ─────────────────
    if len(results) < 3:
        keywords = [w for w in re.split(r"\W+", query) if len(w) > 3][:8]
        if keywords:
            regex_filter = {
                **filter_q,
                "$or": [
                    {"text": {"$regex": kw, "$options": "i"}} for kw in keywords
                ],
            }
            cursor2 = db.legal_chunks.find(regex_filter, {"_id": 0}).limit(top_k * 2)
            extra = await cursor2.to_list(top_k * 2)
            # Deduplicate
            existing_ids = {r.get("id") for r in results}
            for r in extra:
                if r.get("id") not in existing_ids:
                    results.append(r)
                    existing_ids.add(r.get("id"))

    # ── Pas 3: Semantic re-ranking (dacă embedding disponibil) ──────────────
    if results and (VOYAGE_KEY or COHERE_KEY):
        try:
            q_emb = await get_embedding(query)
            if q_emb:
                def cosine_sim(a, b):
                    if not a or not b or len(a) != len(b):
                        return 0.0
                    dot = sum(x * y for x, y in zip(a, b))
                    na = sum(x * x for x in a) ** 0.5
                    nb = sum(x * x for x in b) ** 0.5
                    return dot / (na * nb + 1e-9)

                scored = []
                for chunk in results:
                    emb = chunk.get("embedding")
                    sim = cosine_sim(q_emb, emb) if emb else 0.5
                    scored.append((sim, chunk))
                scored.sort(key=lambda x: -x[0])
                results = [c for _, c in scored]
        except Exception as e:
            logger.warning(f"Semantic reranking failed: {e}")

    return [_clean_chunk(r) for r in results[:top_k]]


def _clean_chunk(chunk: Dict) -> Dict:
    """Returnează câmpurile utile dintr-un chunk."""
    return {
        "id": chunk.get("id", ""),
        "act_id": chunk.get("act_id", ""),
        "act_title": chunk.get("act_title", ""),
        "section_path": chunk.get("section_path", ""),
        "article_number": chunk.get("article_number"),
        "text": chunk.get("text", ""),
        "chunk_type": chunk.get("chunk_type", "paragraph"),
    }


# ── Anti-halucinație ──────────────────────────────────────────────────────────

def validate_citations(generated_text: str, chunks: List[Dict]) -> Dict:
    """
    Verifică că fiecare citare din textul generat există în chunk-urile recuperate.
    Returnează: { valid: bool, confidence: float, invalid_citations: list, valid_citations: list }
    """
    # Extrage citări din text: "art. X", "Art. X", "alin. (Y)", "art. X alin. (Y)"
    citation_pattern = re.compile(
        r"[Aa]rt\.?\s*(\d+(?:\^?\d*)?)\s*(?:alin\.\s*\((\d+)\))?",
        re.IGNORECASE,
    )
    found_citations = citation_pattern.findall(generated_text)

    # Extrage articole disponibile din chunks
    available_articles = set()
    for chunk in chunks:
        art = chunk.get("article_number")
        if art:
            available_articles.add(str(art).strip())
        # Caută și în textul chunk-ului
        for m in citation_pattern.finditer(chunk.get("text", "")):
            available_articles.add(m.group(1).strip())

    valid_citations = []
    invalid_citations = []

    for art_num, alin_num in found_citations:
        art_num = art_num.strip()
        if art_num in available_articles:
            valid_citations.append(f"Art. {art_num}" + (f" alin. ({alin_num})" if alin_num else ""))
        else:
            invalid_citations.append(f"Art. {art_num}" + (f" alin. ({alin_num})" if alin_num else ""))

    total = len(valid_citations) + len(invalid_citations)
    confidence = (len(valid_citations) / total) if total > 0 else 0.8

    # Dacă nu e niciun chunk recuperat, confidence e scăzut
    if not chunks:
        confidence = 0.0

    return {
        "valid": len(invalid_citations) == 0,
        "confidence": round(confidence, 3),
        "valid_citations": list(set(valid_citations)),
        "invalid_citations": list(set(invalid_citations)),
        "total_chunks_used": len(chunks),
    }


# ── Generare document ─────────────────────────────────────────────────────────

async def generate_legal_document(
    db: AsyncIOMotorDatabase,
    template_def: Dict,
    variables: Dict,
    extra_context: str = "",
) -> Dict:
    """
    Generează un document juridic folosind RAG + Claude.
    Returnează: { text, citations_validation, chunks_used, tokens_used, model }
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY lipsă din environment")

    # ── 1. Căutare corpus ─────────────────────────────────────────────────────
    all_chunks = []
    seen_ids = set()
    for q in template_def.get("rag_queries", []):
        chunks = await search_corpus(db, q, top_k=6)
        for c in chunks:
            if c["id"] not in seen_ids:
                all_chunks.append(c)
                seen_ids.add(c["id"])

    # Dacă avem query din variabile (ex: motiv demisie), căutăm și după el
    if variables.get("motiv_demisie"):
        extra_chunks = await search_corpus(db, variables["motiv_demisie"], top_k=4)
        for c in extra_chunks:
            if c["id"] not in seen_ids:
                all_chunks.append(c)
                seen_ids.add(c["id"])

    # Limitează la top 15 chunks
    chunks_for_prompt = all_chunks[:15]

    # ── 2. Construiește prompt ────────────────────────────────────────────────
    template_id = template_def.get("id", "")
    template_name = template_def.get("name", "Document juridic")
    min_citations = template_def.get("min_citations", 2)

    chunks_text = ""
    if chunks_for_prompt:
        chunks_text = "\n\n".join([
            f"[CHUNK {i+1} | {c['act_title']} | {c['section_path']}]\n{c['text']}"
            for i, c in enumerate(chunks_for_prompt)
        ])
    else:
        chunks_text = "(Corpusul legislativ este gol. Generează documentul pe baza cunoștințelor generale, dar marchează toate citările cu [NECERTIFICAT].)"

    vars_text = "\n".join([f"- {k}: {v}" for k, v in variables.items() if v])

    system_prompt = """Ești un specialist în documente juridice românești, cu experiență în dreptul muncii și dreptul imigranților.
Generezi documente juridice formale în română, cu respectarea strictă a următoarelor reguli:

REGULI OBLIGATORII:
1. Citează NUMAI articolele care apar în CONTEXTUL LEGISLATIV furnizat mai jos
2. Format citări: "art. X alin. (Y) din [Denumire act]"
3. NU inventa articole, alineate sau acte normative care NU sunt în context
4. Dacă contextul legislativ e gol sau insuficient, scrie [BAZĂ LEGALĂ INSUFICIENTĂ] în locul citărilor
5. Limbaj juridic formal, în română
6. Structură clară: antet, corp, semnătură
7. Documentul trebuie să fie complet și semnat de persoana indicată"""

    user_prompt = f"""Generează un document de tip: {template_name}

CONTEXTUL LEGISLATIV (UTILIZEAZĂ NUMAI ACESTE PREVEDERI):
{chunks_text}

DATE DOCUMENT:
{vars_text}

{f"CONTEXT SUPLIMENTAR: {extra_context}" if extra_context else ""}

Generează documentul complet, formal, gata de semnat. Include minimum {min_citations} citări legale din contextul de mai sus.
Folosește antet cu datele persoanei/organizației emitente, corp cu motivarea legală, și bloc de semnătură."""

    # ── 3. Generare Claude ────────────────────────────────────────────────────
    client_ai = anthropic_sdk.Anthropic(api_key=api_key)
    message = client_ai.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=4096,
        messages=[{"role": "user", "content": user_prompt}],
        system=system_prompt,
    )

    generated_text = message.content[0].text
    tokens_used = message.usage.input_tokens + message.usage.output_tokens

    # ── 4. Validare anti-halucinație ──────────────────────────────────────────
    validation = validate_citations(generated_text, chunks_for_prompt)

    # Flag dacă confidence e scăzut
    if validation["confidence"] < 0.7:
        generated_text = (
            "⚠️ ATENȚIE: Baza legală insuficientă (confidence "
            f"{validation['confidence']:.0%}). Verificați manual citările!\n\n"
            + generated_text
        )

    return {
        "text": generated_text,
        "citations_validation": validation,
        "chunks_used": [c["id"] for c in chunks_for_prompt],
        "chunks_detail": chunks_for_prompt,
        "tokens_used": tokens_used,
        "model": CLAUDE_MODEL,
        "corpus_size": len(all_chunks),
    }
