"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { GraduationCap } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Link from "next/link";
import toast from "react-hot-toast";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        toast.error(result.error);
      } else {
        router.push("/chat");
        router.refresh();
      }
    } catch {
      toast.error("Erreur de connexion");
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
          <h1 className="text-2xl font-bold">Connexion</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Accède à ton assistant éducatif
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 p-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
        >
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
            placeholder="••••••"
            required
          />
          <Button
            type="submit"
            disabled={loading}
            className="w-full"
            size="lg"
          >
            {loading ? "Connexion..." : "Se connecter"}
          </Button>
        </form>

        <p className="text-center text-sm text-[var(--color-muted)] mt-4">
          Pas encore de compte ?{" "}
          <Link
            href="/register"
            className="text-[var(--color-primary)] hover:underline"
          >
            Inscris-toi
          </Link>
        </p>
      </div>
    </div>
  );
}
