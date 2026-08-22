"""Extraction de texte brut depuis les fichiers de cours/exercices uploadés
(PDF, DOCX, ou texte brut .md/.txt)."""
from io import BytesIO

from docx import Document
from pypdf import PdfReader


def extract_text(filename: str, content: bytes) -> str:
    lower = filename.lower()

    if lower.endswith(".pdf"):
        reader = PdfReader(BytesIO(content))
        return "\n\n".join(page.extract_text() or "" for page in reader.pages)

    if lower.endswith(".docx"):
        doc = Document(BytesIO(content))
        return "\n\n".join(p.text for p in doc.paragraphs if p.text.strip())

    # .md / .txt / autres fichiers texte
    return content.decode("utf-8", errors="ignore")
