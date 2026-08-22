import os

from fastapi import FastAPI, Form, HTTPException, UploadFile
from pydantic import BaseModel

from rag.extract import extract_text
from rag.pipeline import RagPipeline

QDRANT_URL = os.getenv("QDRANT_URL", "http://qdrant:6333")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434")

app = FastAPI(title="EduCI ML Service")
pipeline: RagPipeline | None = None

VALID_DOC_TYPES = {"cours", "exercice"}


@app.on_event("startup")
def startup():
    global pipeline
    # Connexion Qdrant + création de la collection si absente. Fait ici et
    # pas au import du module pour ne pas planter le process si Qdrant met
    # un peu de temps à démarrer (docker-compose depends_on gère l'ordre,
    # mais pas la disponibilité réelle du service).
    pipeline = RagPipeline(qdrant_url=QDRANT_URL, ollama_url=OLLAMA_URL)


@app.get("/health")
def health():
    return {"status": "UP"}


@app.post("/lessons/ingest")
async def ingest_lesson(
    file: UploadFile,
    subject: str = Form(...),
    gradeLevel: str = Form(""),
    docType: str = Form("cours"),
    title: str = Form(""),
):
    """Ingère un document (cours ou exercice) : extraction du texte,
    découpage en chunks, embedding et indexation dans Qdrant.

    docType doit être 'cours' ou 'exercice' — jamais autre chose, pour
    garantir la séparation stricte des deux au moment de la recherche.
    """
    if docType not in VALID_DOC_TYPES:
        raise HTTPException(400, f"docType doit être 'cours' ou 'exercice', reçu: {docType!r}")

    content = await file.read()
    text = extract_text(file.filename, content)
    if not text.strip():
        raise HTTPException(422, f"Aucun texte extrait de {file.filename}")

    chunks_ingested = pipeline.ingest(
        text,
        metadata={
            "subject": subject,
            "gradeLevel": gradeLevel,
            "docType": docType,
            "title": title or file.filename,
            "source": file.filename,
        },
    )

    return {"file": file.filename, "docType": docType, "chunksIngested": chunks_ingested}


class SearchRequest(BaseModel):
    query: str
    subject: str | None = None
    gradeLevel: str | None = None
    docType: str | None = None  # 'cours' ou 'exercice' — voir note ci-dessous
    topK: int = 5


@app.post("/rag/search")
def rag_search(req: SearchRequest):
    """Recherche RAG appelée par chat-service pour ancrer ses réponses sur
    le contenu réellement fourni (cours et exercices), au lieu d'halluciner.

    IMPORTANT : docType n'est volontairement PAS optionnel côté appelant en
    pratique — chat-service doit toujours préciser 'cours' quand il explique
    une notion, et 'exercice' quand il génère/corrige un exercice. Ne jamais
    laisser docType=None sur une requête destinée à une explication de
    cours, sous peine de faire remonter un énoncé d'exercice dans le
    contexte d'explication (règle produit non négociable).
    """
    results = pipeline.search(
        query=req.query,
        subject=req.subject,
        grade_level=req.gradeLevel,
        doc_type=req.docType,
        top_k=req.topK,
    )
    return {"results": results}
