import os
import uuid

from fastapi import BackgroundTasks, FastAPI, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel

from rag.extract import extract_text
from rag.pipeline import RagPipeline

QDRANT_URL = os.getenv("QDRANT_URL", "http://qdrant:6333")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434")

app = FastAPI(title="EduCI ML Service")
pipeline: RagPipeline | None = None

VALID_DOC_TYPES = {"cours", "exercice", "oeuvre", "correction"}

# Taille max acceptée pour un fichier à ingérer (voir ingest_lesson) — sans
# cette limite, `await file.read()` charge le fichier entier en mémoire sans
# borne, ce qui permet un DoS par upload massif (le process ml-service n'a
# aucune autre protection de taille en amont : ni gateway, ni Next.js ne
# posent de limite sur ce endpoint).
# Relevée de 20 à 60 Mo (2026-09-20) pour permettre l'ingestion d'œuvres
# littéraires complètes en PDF texte (un roman de plusieurs centaines de
# pages en PDF texte-natif dépasse rarement 10-15 Mo ; au-delà, il s'agit
# presque toujours d'un PDF scanné/image, que pypdf ne sait de toute façon
# pas extraire — voir rag/extract.py, pas d'OCR).
MAX_UPLOAD_BYTES = 60 * 1024 * 1024  # 60 Mo

# Suivi en mémoire des ingestions en tâche de fond, clé = documentId (voir
# ingest_lesson). Volontairement pas persisté : un job "processing" perdu
# lors d'un redémarrage du service est un cas limite acceptable pour
# l'instant (l'admin relance l'ingestion) — /lessons/{document_id}/status
# retombe de toute façon sur un comptage Qdrant direct si le job n'est plus
# en mémoire, donc un document déjà terminé reste détecté comme "ready"
# même après un redémarrage.
INGESTION_JOBS: dict[str, dict] = {}


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


def _run_ingestion(document_id: str, text: str, metadata: dict) -> None:
    """Exécuté en tâche de fond par BackgroundTasks (voir ingest_lesson) —
    c'est ici que se fait le travail lent (un appel d'embedding Ollama par
    chunk, potentiellement des centaines pour une œuvre complète), après que
    la requête HTTP a déjà répondu au client avec documentId + statut
    "processing"."""
    try:
        _, chunks_ingested = pipeline.ingest(text, metadata, document_id=document_id)
        INGESTION_JOBS[document_id] = {"status": "ready", "chunksIngested": chunks_ingested}
    except Exception as exc:  # noqa: BLE001 — on veut capturer et exposer n'importe quelle erreur d'ingestion, pas planter le worker en tâche de fond
        INGESTION_JOBS[document_id] = {"status": "error", "error": str(exc)}


@app.post("/lessons/ingest")
async def ingest_lesson(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile,
    subject: str = Form(""),
    gradeLevel: str = Form(""),
    docType: str = Form("cours"),
    title: str = Form(""),
    author: str = Form(""),
    workTitle: str = Form(""),
    linkedDocumentId: str = Form(""),
):
    """Ingère un document (cours, exercice, œuvre littéraire ou correction) :
    extraction du texte puis, en tâche de fond, découpage en chunks,
    embedding et indexation dans Qdrant. Répond immédiatement avec un
    `documentId` et le statut "processing" — voir GET
    /lessons/{document_id}/status pour suivre la progression, nécessaire
    pour les gros documents (œuvres complètes) dont l'embedding chunk par
    chunk peut prendre plusieurs minutes.

    - docType 'correction' exige `linkedDocumentId` (le documentId de
      l'exercice associé).
    - docType 'oeuvre' exige `workTitle` (titre de l'œuvre).
    """
    require_admin(request)
    if docType not in VALID_DOC_TYPES:
        raise HTTPException(400, f"docType doit être l'un de {sorted(VALID_DOC_TYPES)}, reçu: {docType!r}")
    if docType == "correction" and not linkedDocumentId:
        raise HTTPException(400, "linkedDocumentId requis pour une correction (documentId de l'exercice associé)")
    if docType == "oeuvre" and not workTitle:
        raise HTTPException(400, "workTitle requis pour une œuvre")

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

    document_id = str(uuid.uuid4())
    metadata = {
        "subject": subject,
        "gradeLevel": gradeLevel,
        "docType": docType,
        "title": title or workTitle or file.filename,
        "source": file.filename,
        "author": author,
        "workTitle": workTitle,
        "linkedDocumentId": linkedDocumentId,
    }

    INGESTION_JOBS[document_id] = {"status": "processing"}
    background_tasks.add_task(_run_ingestion, document_id, text, metadata)

    return {"documentId": document_id, "file": file.filename, "docType": docType, "status": "processing"}


@app.get("/lessons/{document_id}/status")
def ingestion_status(document_id: str, request: Request):
    """Statut d'une ingestion lancée par POST /lessons/ingest — permet à
    /admin/lessons de faire un polling pendant le traitement en tâche de
    fond d'un gros document."""
    require_admin(request)
    job = INGESTION_JOBS.get(document_id)
    if job is not None:
        return job
    # Job plus en mémoire (redémarrage du service, ou requête tardive) : on
    # retombe sur un comptage Qdrant direct, qui reste correct pour un
    # document déjà indexé.
    count = pipeline.count_by_document_id(document_id)
    if count > 0:
        return {"status": "ready", "chunksIngested": count}
    raise HTTPException(404, "Ingestion inconnue ou expirée")


@app.get("/lessons")
def list_lessons(request: Request):
    """Documents ingérés dans le RAG, groupés par documentId (voir
    RagPipeline.list_documents) — pour l'écran /admin/lessons."""
    require_admin(request)
    return {"documents": pipeline.list_documents()}


@app.delete("/lessons/by-document-id/{document_id}")
def delete_lesson_by_document_id(document_id: str, request: Request):
    """Supprime tous les chunks d'un document ingéré, identifié par son
    `documentId`. C'est l'action déclenchée par le bouton supprimer de la
    liste des documents dans /admin/lessons pour tout document ingéré
    depuis l'introduction de documentId (2026-09-20)."""
    require_admin(request)
    deleted = pipeline.delete_by_document_id(document_id)
    if deleted == 0:
        raise HTTPException(404, f"Aucun document trouvé pour le documentId {document_id!r}")
    return {"documentId": document_id, "chunksDeleted": deleted}


@app.delete("/lessons/by-source/{source}")
def delete_lesson_by_source(source: str, request: Request):
    """Repli pour les documents ingérés AVANT documentId (regroupés comme
    "legacy:<source>" par list_documents) : supprime tous les chunks d'un
    document identifié par son nom de fichier (`source`)."""
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
    docType: str | None = None  # 'cours', 'exercice', 'oeuvre' ou 'correction' — voir note ci-dessous
    documentId: str | None = None
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

    documentId restreint la recherche à un document précis (typiquement une
    œuvre littéraire) — utilisé pour les conversations scopées à une œuvre.
    """
    results = pipeline.search(
        query=req.query,
        subject=req.subject,
        grade_level=req.gradeLevel,
        doc_type=req.docType,
        document_id=req.documentId,
        top_k=req.topK,
    )
    return {"results": results}
