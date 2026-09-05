"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { SUBJECTS, ALL_GRADE_LEVELS, getGradeLevelLabel, getSubjectLabel } from "@/lib/utils";
import toast from "react-hot-toast";
import { Loader2, Upload, Trash2, FileText } from "lucide-react";

const DOC_TYPES = [
  { value: "cours", label: "Cours" },
  { value: "exercice", label: "Exercice" },
];

interface LessonDocument {
  source: string;
  title: string;
  subject: string;
  gradeLevel: string;
  docType: string;
  chunksCount: number;
}

export default function AdminLessonsPage() {
  const [subject, setSubject] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [docType, setDocType] = useState("cours");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [documents, setDocuments] = useState<LessonDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [deletingSource, setDeletingSource] = useState<string | null>(null);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error("Sélectionnez un fichier à ingérer");
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

      const res = await fetch("/api/admin/lessons", { method: "POST", body: formData });
      const data = await res.json();

      if (res.ok) {
        toast.success(`Document ingéré : ${data.chunksIngested} passage(s) indexé(s)`);
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        await fetchDocuments();
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
    setDeletingSource(doc.source);

    try {
      const res = await fetch(`/api/admin/lessons/${encodeURIComponent(doc.source)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        toast.success(`Document supprimé (${data.chunksDeleted ?? doc.chunksCount} passage(s))`);
        setDocuments((prev) => prev.filter((d) => d.source !== doc.source));
      } else {
        toast.error(data.error ?? "Erreur lors de la suppression");
      }
    } catch {
      toast.error("Erreur de connexion");
    } finally {
      setDeletingSource(null);
    }
  };

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
          <div className="grid sm:grid-cols-3 gap-4">
            <Select
              label="Matière"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              options={SUBJECTS.map((s) => ({ value: s.value, label: s.label }))}
              placeholder="Choisir"
              required
            />
            <Select
              label="Niveau"
              value={gradeLevel}
              onChange={(e) => setGradeLevel(e.target.value)}
              options={ALL_GRADE_LEVELS.map((l) => ({ value: l.value, label: l.label }))}
              placeholder="Choisir"
              required
            />
            <Select
              label="Type"
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              options={DOC_TYPES}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Fichier (PDF, texte ou docx)</label>
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
                Ingestion en cours...
              </>
            ) : (
              "Ingérer le document"
            )}
          </Button>
        </div>
      </form>

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
                  <th className="text-left px-4 py-3 font-medium">Passages</th>
                  <th className="text-right px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {documents.map((doc) => (
                  <tr key={doc.source} className="hover:bg-[var(--color-surface-hover)]">
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
                    <td className="px-4 py-3 text-[var(--color-muted)]">{doc.chunksCount}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(doc)}
                        disabled={deletingSource === doc.source}
                        className="p-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--color-danger-subtle)] hover:text-[var(--color-danger)] text-[var(--color-muted)] transition-colors cursor-pointer disabled:opacity-50"
                        title="Supprimer ce document"
                      >
                        {deletingSource === doc.source ? (
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
