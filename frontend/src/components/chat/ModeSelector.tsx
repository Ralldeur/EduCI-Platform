"use client";

import { SUBJECTS, GRADE_LEVELS, CYCLE_LABELS } from "@/lib/utils";
import { LYCEE_SERIES } from "@/lib/curriculum";
import Select from "@/components/ui/Select";

interface ModeSelectorProps {
  subject: string;
  gradeLevel: string;
  serie: string;
  onSubjectChange: (value: string) => void;
  onGradeLevelChange: (value: string) => void;
  onSerieChange: (value: string) => void;
}

const LYCEE_LEVELS = ["2NDE", "1ERE", "TLE"];

export default function ModeSelector({
  subject,
  gradeLevel,
  serie,
  onSubjectChange,
  onGradeLevelChange,
  onSerieChange,
}: ModeSelectorProps) {
  const gradeOptions = Object.entries(GRADE_LEVELS).flatMap(
    ([cycle, levels]) =>
      levels.map((l) => ({
        value: l.value,
        label: `${l.label} (${CYCLE_LABELS[cycle]})`,
      }))
  );

  const subjectOptions = SUBJECTS.map((s) => ({
    value: s.value,
    label: `${s.icon} ${s.label}`,
  }));

  const serieOptions = LYCEE_SERIES.map((s) => ({
    value: s.value,
    label: s.label,
  }));

  const isLycee = LYCEE_LEVELS.includes(gradeLevel);

  return (
    <div className="flex flex-wrap gap-2 px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="w-48">
        <Select
          value={gradeLevel}
          onChange={(e) => onGradeLevelChange(e.target.value)}
          options={gradeOptions}
          placeholder="🎓 Niveau scolaire"
          className="text-xs py-1.5"
        />
      </div>
      <div className="w-48">
        <Select
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          options={subjectOptions}
          placeholder="📚 Matière"
          className="text-xs py-1.5"
        />
      </div>
      {isLycee && (
        <div className="w-48">
          <Select
            value={serie}
            onChange={(e) => onSerieChange(e.target.value)}
            options={serieOptions}
            placeholder="🎯 Série (BAC)"
            className="text-xs py-1.5"
          />
        </div>
      )}
    </div>
  );
}
