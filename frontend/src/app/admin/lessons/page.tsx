"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { SUBJECTS, ALL_GRADE_LEVELS } from "@/lib/utils";
import toast from "react-hot-toast";
import { Loader2, Plus } from "lucide-react";

export default function AdminLessonsPage() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [summary, setSummary] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [chapterTitle, setChapterTitle] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch("/api/admin/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          summary,
          subjectName,
          chapterTitle,
          gradeLevel,
        }),
      });

      if (res.ok) {
        toast.success("Leçon ajoutée avec succès !");
        setTitle("");
        setContent("");
        setSummary("");
        setChapterTitle("");
      } else {
        const data = await res.json();
        toast.error(data.error ?? "Erreur");
      }
    } catch {
      toast.error("Erreur de sauvegarde");
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
          <Plus size={18} />
          Ajouter une leçon
        </h2>

        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Select
              label="Matière"
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              options={SUBJECTS.map((s) => ({
                value: s.value,
                label: s.label,
              }))}
              placeholder="Choisir"
              required
            />
            <Select
              label="Niveau"
              value={gradeLevel}
              onChange={(e) => setGradeLevel(e.target.value)}
              options={ALL_GRADE_LEVELS.map((l) => ({
                value: l.value,
                label: l.label,
              }))}
              placeholder="Choisir"
              required
            />
          </div>

          <Input
            label="Chapitre"
            value={chapterTitle}
            onChange={(e) => setChapterTitle(e.target.value)}
            placeholder="Ex: Les nombres décimaux"
            required
          />

          <Input
            label="Titre de la leçon"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Addition de nombres décimaux"
            required
          />

          <div>
            <label className="block text-sm font-medium mb-1.5">
              Contenu de la leçon
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Le contenu complet de la leçon (supporte le Markdown)..."
              rows={10}
              required
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] text-sm resize-y"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              Résumé (optionnel)
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Un résumé court de la leçon..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] text-sm resize-y"
            />
          </div>

          <Button type="submit" disabled={saving} className="gap-2">
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Enregistrement...
              </>
            ) : (
              "Ajouter la leçon"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
