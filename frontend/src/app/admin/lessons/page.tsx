"use client";

import { useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { SUBJECTS, ALL_GRADE_LEVELS } from "@/lib/utils";
import toast from "react-hot-toast";
import { Loader2, Upload } from "lucide-react";

const DOC_TYPES = [
  { value: "cours", label: "Cours" },
  { value: "exercice", label: "Exercice" },
];

export default function AdminLessonsPage() {
  const [subject, setSubject] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [docType, setDocType] = useState("cours");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      } else {
        toast.error(data.error ?? "Erreur");
      }
    } catch {
      toast.error("Erreur de connexion");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Gestion des leçons</h1>

      <form
        onSubmit={handleSubmit}
        className="p-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] max-w-2xl"
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
              className="w-full text-sm file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-[var(--color-primary)] file:text-white file:text-sm file:font-medium file:cursor-pointer"
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
    </div>
  );
}
