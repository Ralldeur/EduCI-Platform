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


@app.get("/admin/stats")
def admin_stats():
    return {"totalDocuments": pipeline.count_documents()}


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
    try:
        text = extract_text(file.filename, content)
    except Exception:
        # pypdf/python-docx lèvent des exceptions très variées (xref
        # corrompu, fichier vide, zip invalide...) sur un fichier
        # illisible — PDF/DOCX corrompu, tronqué (upload interrompu), ou
        # simplement mal nommé (ex. un .txt renommé en .pdf par erreur).
        # Sans ce garde-fou, n'importe lequel de ces cas très réalistes
        # remontait en 500 brute avec stack trace, au lieu du même 422
        # clair que le cas ".txt vide" ci-dessous gère déjà.
        raise HTTPException(
            422,
            f"Impossible de lire {file.filename} — vérifiez qu'il n'est pas corrompu ou tronqué",
        )
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


@app.get("/lessons")
def list_lessons():
    """Documents ingérés dans le RAG, groupés par fichier source (voir
    RagPipeline.list_documents) — pour l'écran /admin/lessons."""
    return {"documents": pipeline.list_documents()}


@app.delete("/lessons/by-source/{source}")
def delete_lesson_by_source(source: str):
    """Supprime tous les chunks d'un document ingéré, identifié par son nom
    de fichier (`source`). C'est l'action déclenchée par le bouton
    supprimer de la liste des documents dans /admin/lessons."""
    deleted = pipeline.delete_by_source(source)
    if deleted == 0:
        raise HTTPException(404, f"Aucun document trouvé pour la source {source!r}")
    return {"source": source, "chunksDeleted": deleted}


@app.delete("/lessons/by-id/{point_id}")
def delete_lesson_by_id(point_id: str):
    """Repli minimal : supprime un unique chunk/point par son id Qdrant,
    pour le cas où il faut retirer un point précis en dehors de la
    suppression groupée par document."""
    if not pipeline.delete_by_id(point_id):
        raise HTTPException(404, f"Aucun point trouvé pour l'id {point_id!r}")
    return {"id": point_id, "deleted": True}


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
