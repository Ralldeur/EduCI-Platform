"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import Input from "@/components/ui/Input";
import { SUBJECTS, ALL_GRADE_LEVELS, getGradeLevelLabel, getSubjectLabel } from "@/lib/utils";
import toast from "react-hot-toast";
import { Loader2, Upload, Trash2, FileText } from "lucide-react";

const DOC_TYPES = [
  { value: "cours", label: "Cours" },
  { value: "exercice", label: "Exercice" },
  { value: "oeuvre", label: "Œuvre littéraire" },
  { value: "correction", label: "Correction" },
];

interface LessonDocument {
  documentId: string;
  source: string;
  title: string;
  subject: string;
  gradeLevel: string;
  docType: string;
  author: string;
  workTitle: string;
  linkedDocumentId: string;
  chunksCount: number;
}

// Un document dont l'ingestion tourne encore en tâche de fond (voir
// ml-service POST /lessons/ingest, qui répond immédiatement avec un
// documentId + statut "processing" pour ne pas bloquer la requête HTTP
// pendant l'embedding chunk par chunk — potentiellement plusieurs minutes
// pour une œuvre complète). N'apparaît pas encore dans `documents` : le
// pipeline ne fait qu'un seul upsert Qdrant une fois tous les chunks prêts.
interface PendingIngestion {
  documentId: string;
  fileName: string;
  status: "processing" | "error";
  error?: string;
}

const POLL_INTERVAL_MS = 3000;

export default function AdminLessonsPage() {
  const [subject, setSubject] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [docType, setDocType] = useState("cours");
  const [author, setAuthor] = useState("");
  const [workTitle, setWorkTitle] = useState("");
  const [linkedDocumentId, setLinkedDocumentId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [documents, setDocuments] = useState<LessonDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingIngestion[]>([]);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/lessons");
      const data = await res.json();
      setDocuments(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Erreur lors du chargement des documents");
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Polling des ingestions en cours : tant qu'il y a des entrées "pending",
  // on interroge leur statut toutes les POLL_INTERVAL_MS et on rafraîchit
  // la liste des documents dès que l'une passe à "ready" (elle disparaît
  // alors de `pending` et apparaît dans `documents`).
  useEffect(() => {
    if (pending.length === 0) return;

    const interval = setInterval(async () => {
      for (const job of pending) {
        if (job.status === "error") continue;
        try {
          const res = await fetch(`/api/admin/lessons/status/${job.documentId}`);
          const data = await res.json().catch(() => ({}));
          if (!res.ok) continue;

          if (data.status === "ready") {
            toast.success(`"${job.fileName}" indexé : ${data.chunksIngested} passage(s)`);
            setPending((prev) => prev.filter((p) => p.documentId !== job.documentId));
            await fetchDocuments();
          } else if (data.status === "error") {
            toast.error(`Échec de l'ingestion de "${job.fileName}" : ${data.error ?? "erreur inconnue"}`);
            setPending((prev) =>
              prev.map((p) => (p.documentId === job.documentId ? { ...p, status: "error", error: data.error } : p))
            );
          }
        } catch {
          // Erreur réseau ponctuelle pendant le polling — on retente au tour suivant.
        }
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [pending, fetchDocuments]);

  const resetForm = () => {
    setFile(null);
    setAuthor("");
    setWorkTitle("");
    setLinkedDocumentId("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error("Sélectionnez un fichier à ingérer");
      return;
    }
    if (docType === "oeuvre" && !workTitle.trim()) {
      toast.error("Le titre de l'œuvre est requis");
      return;
    }
    if (docType === "correction" && !linkedDocumentId) {
      toast.error("Sélectionnez l'exercice associé à cette correction");
      return;
    }
    setSaving(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("subject", subject);
      formData.append("gradeLevel", gradeLevel);
      formData.append("docType", docType);
      formData.append("title", file.name);
      formData.append("author", author);
      formData.append("workTitle", workTitle);
      formData.append("linkedDocumentId", linkedDocumentId);

      const res = await fetch("/api/admin/lessons", { method: "POST", body: formData });
      const data = await res.json();

      if (res.ok) {
        toast.success(`"${file.name}" en cours d'indexation...`);
        setPending((prev) => [...prev, { documentId: data.documentId, fileName: file.name, status: "processing" }]);
        resetForm();
      } else {
        toast.error(data.error ?? "Erreur");
      }
    } catch {
      toast.error("Erreur de connexion");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (doc: LessonDocument) => {
    if (!confirm(`Supprimer "${doc.title}" (${doc.chunksCount} passage(s) indexé(s)) ? Cette action est irréversible.`)) {
      return;
    }
    setDeletingId(doc.documentId);

    try {
      const res = await fetch(`/api/admin/lessons/${encodeURIComponent(doc.documentId)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        toast.success(`Document supprimé (${data.chunksDeleted ?? doc.chunksCount} passage(s))`);
        setDocuments((prev) => prev.filter((d) => d.documentId !== doc.documentId));
      } else {
        toast.error(data.error ?? "Erreur lors de la suppression");
      }
    } catch {
      toast.error("Erreur de connexion");
    } finally {
      setDeletingId(null);
    }
  };

  const exercices = documents.filter((d) => d.docType === "exercice");
  const linkedExercice = (linkedDocId: string) => documents.find((d) => d.documentId === linkedDocId);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Gestion des leçons</h1>

      <form
        onSubmit={handleSubmit}
        className="p-6 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] max-w-2xl"
      >
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <Upload size={18} />
          Ingérer un document dans le RAG
        </h2>

        <div className="space-y-4">
          <Select
            label="Type"
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            options={DOC_TYPES}
            required
          />

          {docType === "correction" && (
            <Select
              label="Exercice associé"
              value={linkedDocumentId}
              onChange={(e) => setLinkedDocumentId(e.target.value)}
              options={exercices.map((d) => ({ value: d.documentId, label: d.title }))}
              placeholder={exercices.length ? "Choisir l'exercice" : "Aucun exercice ingéré pour l'instant"}
              required
            />
          )}

          {docType === "oeuvre" && (
            <div className="grid sm:grid-cols-2 gap-4">
              <Input label="Auteur" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="ex. Ahmadou Kourouma" />
              <Input
                label="Titre de l'œuvre"
                value={workTitle}
                onChange={(e) => setWorkTitle(e.target.value)}
                placeholder="ex. Les Soleils des indépendances"
                required
              />
            </div>
          )}

          {docType !== "correction" && (
            <div className="grid sm:grid-cols-2 gap-4">
              <Select
                label="Matière"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                options={SUBJECTS.map((s) => ({ value: s.value, label: s.label }))}
                placeholder="Choisir"
                required={docType === "cours" || docType === "exercice"}
              />
              <Select
                label="Niveau"
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value)}
                options={ALL_GRADE_LEVELS.map((l) => ({ value: l.value, label: l.label }))}
                placeholder="Choisir"
                required={docType === "cours" || docType === "exercice"}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1.5">
              Fichier (PDF, texte ou docx{docType === "oeuvre" ? " — un livre entier est accepté, jusqu'à 60 Mo" : ""})
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md,.docx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
              className="w-full text-sm file:mr-3 file:px-3 file:py-2 file:rounded-[var(--radius-md)] file:border-0 file:bg-[var(--color-primary)] file:text-white file:text-sm file:font-medium file:cursor-pointer"
            />
          </div>

          <Button type="submit" disabled={saving} className="gap-2">
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Envoi en cours...
              </>
            ) : (
              "Ingérer le document"
            )}
          </Button>
        </div>
      </form>

      {pending.length > 0 && (
        <div className="mt-4 max-w-2xl space-y-2">
          {pending.map((job) => (
            <div
              key={job.documentId}
              className="flex items-center gap-2 px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-hover)] text-sm"
            >
              {job.status === "processing" ? (
                <>
                  <Loader2 size={14} className="animate-spin text-[var(--color-primary)]" />
                  <span>
                    Indexation de <strong>{job.fileName}</strong> en cours — ça peut prendre plusieurs minutes pour un
                    gros document.
                  </span>
                </>
              ) : (
                <span className="text-[var(--color-danger)]">
                  Échec de l&apos;indexation de <strong>{job.fileName}</strong> : {job.error}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
        <div className="p-6 pb-0">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <FileText size={18} />
            Documents indexés ({documents.length})
          </h2>
        </div>

        {loadingDocs ? (
          <div className="flex justify-center py-12">
            <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
          </div>
        ) : documents.length === 0 ? (
          <p className="text-center py-8 text-sm text-[var(--color-muted)]">
            Aucun document indexé
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-hover)]">
                  <th className="text-left px-4 py-3 font-medium">Titre</th>
                  <th className="text-left px-4 py-3 font-medium">Matière</th>
                  <th className="text-left px-4 py-3 font-medium">Niveau</th>
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-left px-4 py-3 font-medium">Détails</th>
                  <th className="text-left px-4 py-3 font-medium">Passages</th>
                  <th className="text-right px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {documents.map((doc) => (
                  <tr key={doc.documentId} className="hover:bg-[var(--color-surface-hover)]">
                    <td className="px-4 py-3 max-w-xs truncate" title={doc.title}>
                      {doc.title}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">
                      {getSubjectLabel(doc.subject) || "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">
                      {doc.gradeLevel ? getGradeLevelLabel(doc.gradeLevel) : "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)] capitalize">{doc.docType || "—"}</td>
                    <td className="px-4 py-3 text-[var(--color-muted)] max-w-[16rem] truncate">
                      {doc.docType === "oeuvre" && doc.author ? `Auteur : ${doc.author}` : null}
                      {doc.docType === "correction" && doc.linkedDocumentId
                        ? `Corrige : ${linkedExercice(doc.linkedDocumentId)?.title ?? "exercice supprimé"}`
                        : null}
                      {doc.docType !== "oeuvre" && doc.docType !== "correction" ? "—" : null}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{doc.chunksCount}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(doc)}
                        disabled={deletingId === doc.documentId}
                        className="p-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--color-danger-subtle)] hover:text-[var(--color-danger)] text-[var(--color-muted)] transition-colors cursor-pointer disabled:opacity-50"
                        title="Supprimer ce document"
                      >
                        {deletingId === doc.documentId ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Trash2 size={16} />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
