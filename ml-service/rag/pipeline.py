"""Pipeline RAG — inspiré de rag/pipeline.py dans yeredon-ai, adapté pour
ingérer les cours et exercices du curriculum ivoirien et répondre aux
questions des élèves en se basant dessus.

Règle produit importante (voir plan-architecture-microservices.md) :
les exercices ne doivent JAMAIS apparaître dans une explication de cours.
On applique donc un filtre strict sur `docType` ("cours" | "exercice") à
la recherche, jamais les deux mélangés dans le même appel.
"""
import uuid

import httpx
from qdrant_client import QdrantClient
from qdrant_client.http import models as qm

COLLECTION = "curriculum_educi"
VECTOR_SIZE = 768  # dimension du modèle d'embedding nomic-embed-text (Ollama)


class RagPipeline:
    def __init__(self, qdrant_url: str, ollama_url: str, embed_model: str = "nomic-embed-text"):
        self.qdrant = QdrantClient(url=qdrant_url)
        self.ollama_url = ollama_url
        self.embed_model = embed_model
        self._ensure_collection()

    def _ensure_collection(self):
        existing = [c.name for c in self.qdrant.get_collections().collections]
        if COLLECTION not in existing:
            self.qdrant.create_collection(
                collection_name=COLLECTION,
                vectors_config=qm.VectorParams(size=VECTOR_SIZE, distance=qm.Distance.COSINE),
            )

    def count_documents(self) -> int:
        return self.qdrant.get_collection(COLLECTION).points_count

    def embed(self, text: str) -> list[float]:
        with httpx.Client(timeout=60) as client:
            r = client.post(
                f"{self.ollama_url}/api/embeddings",
                json={"model": self.embed_model, "prompt": text},
            )
            r.raise_for_status()
            return r.json()["embedding"]

    @staticmethod
    def chunk(text: str, size: int = 800, overlap: int = 100) -> list[str]:
        """Découpage simple par paragraphes, regroupés jusqu'à ~`size`
        caractères avec un peu de recouvrement pour ne pas couper le
        contexte pile à la frontière d'un chunk."""
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        chunks: list[str] = []
        current = ""

        for p in paragraphs:
            if len(current) + len(p) + 1 <= size:
                current = f"{current}\n{p}".strip()
            else:
                if current:
                    chunks.append(current)
                current = f"{current[-overlap:]}\n{p}".strip() if overlap and current else p

        if current:
            chunks.append(current)

        return chunks or ([text[:size]] if text.strip() else [])

    def ingest(self, text: str, metadata: dict) -> int:
        """metadata attendu : subject, gradeLevel, docType ('cours' ou
        'exercice'), title, source."""
        chunks = self.chunk(text)
        points = [
            qm.PointStruct(
                id=str(uuid.uuid4()),
                vector=self.embed(chunk_text),
                payload={**metadata, "text": chunk_text},
            )
            for chunk_text in chunks
        ]
        if points:
            self.qdrant.upsert(collection_name=COLLECTION, points=points)
        return len(points)

    def search(
        self,
        query: str,
        subject: str | None = None,
        grade_level: str | None = None,
        doc_type: str | None = None,
        top_k: int = 5,
    ) -> list[dict]:
        must = []
        if subject:
            must.append(qm.FieldCondition(key="subject", match=qm.MatchValue(value=subject)))
        if grade_level:
            must.append(qm.FieldCondition(key="gradeLevel", match=qm.MatchValue(value=grade_level)))
        if doc_type:
            must.append(qm.FieldCondition(key="docType", match=qm.MatchValue(value=doc_type)))

        results = self.qdrant.search(
            collection_name=COLLECTION,
            query_vector=self.embed(query),
            query_filter=qm.Filter(must=must) if must else None,
            limit=top_k,
            with_payload=True,
        )

        return [
            {
                "score": r.score,
                "text": r.payload.get("text", ""),
                "title": r.payload.get("title", ""),
                "subject": r.payload.get("subject", ""),
                "gradeLevel": r.payload.get("gradeLevel", ""),
                "docType": r.payload.get("docType", ""),
                "source": r.payload.get("source", ""),
            }
            for r in results
        ]
