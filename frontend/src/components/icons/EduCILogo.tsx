import { SVGProps } from "react";

/**
 * Symbole de marque EduCI — chapeau de diplômé stylisé, dessiné en interne
 * (pas l'icône générique lucide-react "GraduationCap" utilisée jusqu'ici).
 * Géométrie volontairement réduite à 3 formes pleines (losange plat,
 * "bandeau" arrondi, pampille) pour rester lisible jusqu'à 16px (favicon) —
 * voir frontend/DESIGN_SYSTEM.md pour la direction (sobre, "app premium",
 * un seul accent). Utilise `currentColor` comme les icônes lucide-react
 * voisines : la couleur se règle via la classe `text-*` du parent, pas ici.
 *
 * Le losange du dessus est délibérément très aplati (large, peu haut) et
 * séparé du bandeau par un espace vide, pour lire comme un plateau de
 * mortier PLAT posé sur une base distincte — et non comme une seule forme
 * effilée continue, qui se confondait visuellement avec l'icône d'envoi
 * (flèche/avion en papier, lucide "Send") utilisée dans le chat. La
 * pampille (asymétrique, sur le côté droit) accentue aussi cette
 * différence : une flèche est symétrique dans l'axe du mouvement, un
 * chapeau ne l'est pas.
 *
 * Les fichiers statiques (favicon.ico, apple-touch-icon, icônes manifest)
 * sont générés à partir du même tracé — voir scripts/generate-icons.mjs —
 * donc toute retouche du dessin doit se faire dans CE fichier puis être
 * répercutée en relançant ce script (les fichiers statiques ne se
 * régénèrent pas tout seuls).
 */
export default function EduCILogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {/* Bandeau (tour de tête) : forme arrondie distincte, séparée du
          plateau par un espace vide (pas de fusion en une seule silhouette). */}
      <rect x="8.5" y="14.5" width="7" height="5" rx="2.5" />
      {/* Plateau du chapeau : losange plat et anguleux, vu de biais. */}
      <path d="M12 6 L20 9 L12 12 L4 9 Z" />
      {/* Pampille : cordon épais + gland, accroché au coin droit du plateau. */}
      <rect x="19.6" y="9" width="1.6" height="5.8" rx="0.8" />
      <circle cx="20.4" cy="15.6" r="1.8" />
    </svg>
  );
}
