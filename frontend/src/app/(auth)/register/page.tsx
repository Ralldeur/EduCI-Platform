"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { GraduationCap } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Link from "next/link";
import toast from "react-hot-toast";
import { ALL_GRADE_LEVELS } from "@/lib/utils";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, gradeLevel }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Erreur lors de l'inscription");
        return;
      }

      // Auto sign in after registration
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        toast.error("Inscription réussie ! Connecte-toi.");
        router.push("/login");
      } else {
        toast.success("Bienvenue sur Ivoir'Académie !");
        router.push("/chat");
        router.refresh();
      }
    } catch {
      toast.error("Erreur lors de l'inscription");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-[var(--color-background)] to-[var(--color-surface)]">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <GraduationCap size={48} className="text-[var(--color-primary)]" />
          </div>
          <h1 className="text-2xl font-bold">Inscription</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Crée ton compte et commence à apprendre
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 p-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
        >
          <Input
            label="Nom complet"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Kouassi Aya"
            required
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ton.email@exemple.com"
            required
          />
          <Input
            label="Mot de passe"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Au moins 6 caractères"
            minLength={6}
            required
          />
          <Select
            label="Niveau scolaire"
            value={gradeLevel}
            onChange={(e) => setGradeLevel(e.target.value)}
            options={ALL_GRADE_LEVELS.map((l) => ({
              value: l.value,
              label: l.label,
            }))}
            placeholder="Sélectionne ton niveau"
          />
          <Button
            type="submit"
            disabled={loading}
            className="w-full"
            size="lg"
          >
            {loading ? "Inscription..." : "S'inscrire"}
          </Button>
        </form>

        <p className="text-center text-sm text-[var(--color-muted)] mt-4">
          Déjà un compte ?{" "}
          <Link
            href="/login"
            className="text-[var(--color-primary)] hover:underline"
          >
            Connecte-toi
          </Link>
        </p>
      </div>
    </div>
  );
}
