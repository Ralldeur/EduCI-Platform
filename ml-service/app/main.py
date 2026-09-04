import os

from fastapi import FastAPI, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel

from rag.extract import extract_text
from rag.pipeline import RagPipeline

QDRANT_URL = os.getenv("QDRANT_URL", "http://qdrant:6333")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434")

app = FastAPI(title="EduCI ML Service")
pipeline: RagPipeline | None = None

VALID_DOC_TYPES = {"cours", "exercice"}

# Taille max acceptée pour un fichier à ingérer (voir ingest_lesson) — sans
# cette limite, `await file.read()` charge le fichier entier en mémoire sans
# borne, ce qui permet un DoS par upload massif (le process ml-service n'a
# aucune autre protection de taille en amont : ni gateway, ni Next.js ne
# posent de limite sur ce endpoint).
MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 Mo


def require_admin(request: Request) -> None:
    """Vérifie le rôle ROLE_ADMIN via le header x-user-roles, injecté par le
    gateway à partir du JWT vérifié (voir gateway/src/auth.js) — ml-service
    n'a lui-même aucune vérification de JWT, il fait confiance à ce header
    exactement comme chat-service (voir isAdmin() dans chat-service/src/
    index.js). Sans ce garde-fou, n'importe quel utilisateur authentifié
    (pas seulement un admin) pouvait ingérer/supprimer des documents RAG ou
    lire /admin/stats en appelant directement /api/ml/... via le gateway —
    seule la page Next.js /admin/lessons vérifiait ROLE_ADMIN, pas ce
    service. Ne PAS appliquer cette vérification à /rag/search : chat-service
    l'appelle en service-à-service (pas via le gateway, pas de header
    x-user-roles) pour CHAQUE requête de chat/exercice, peu importe le rôle
    de l'élève.
    """
    roles = request.headers.get("x-user-roles", "")
    if "ROLE_ADMIN" not in roles.split(","):
        raise HTTPException(403, "Accès réservé aux administrateurs")


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
def admin_stats(request: Request):
    require_admin(request)
    return {"totalDocuments": pipeline.count_documents()}


@app.post("/lessons/ingest")
async def ingest_lesson(
    request: Request,
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
    require_admin(request)
    if docType not in VALID_DOC_TYPES:
        raise HTTPException(400, f"docType doit être 'cours' ou 'exercice', reçu: {docType!r}")

    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            413,
            f"Fichier trop volumineux ({len(content) // 1024} Ko) — limite {MAX_UPLOAD_BYTES // 1024 // 1024} Mo",
        )
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
def list_lessons(request: Request):
    """Documents ingérés dans le RAG, groupés par fichier source (voir
    RagPipeline.list_documents) — pour l'écran /admin/lessons."""
    require_admin(request)
    return {"documents": pipeline.list_documents()}


@app.delete("/lessons/by-source/{source}")
def delete_lesson_by_source(source: str, request: Request):
    """Supprime tous les chunks d'un document ingéré, identifié par son nom
    de fichier (`source`). C'est l'action déclenchée par le bouton
    supprimer de la liste des documents dans /admin/lessons."""
    require_admin(request)
    deleted = pipeline.delete_by_source(source)
    if deleted == 0:
        raise HTTPException(404, f"Aucun document trouvé pour la source {source!r}")
    return {"source": source, "chunksDeleted": deleted}


@app.delete("/lessons/by-id/{point_id}")
def delete_lesson_by_id(point_id: str, request: Request):
    """Repli minimal : supprime un unique chunk/point par son id Qdrant,
    pour le cas où il faut retirer un point précis en dehors de la
    suppression groupée par document."""
    require_admin(request)
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
