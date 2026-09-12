import type { MetadataRoute } from "next";

// Icônes générées par scripts/generate-icons.mjs à partir du même tracé
// que src/components/icons/EduCILogo.tsx — voir ce script pour régénérer
// après une retouche du dessin.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EduCI - Assistant Éducatif IA",
    short_name: "EduCI",
    description:
      "Plateforme éducative intelligente pour les élèves ivoiriens, selon le programme scolaire ivoirien.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0b",
    theme_color: "#0a0a0b",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
