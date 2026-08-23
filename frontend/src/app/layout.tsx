import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Providers from "@/components/Providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Ivoir'Académie - Assistant Éducatif IA",
  description:
    "Plateforme éducative intelligente pour les élèves ivoiriens. Apprends avec l'IA selon le programme scolaire ivoirien.",
  keywords: [
    "éducation",
    "Côte d'Ivoire",
    "IA",
    "apprentissage",
    "programme ivoirien",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
