/**
 * Normalisation du LaTeX généré par le modèle avant de le passer à
 * ReactMarkdown — partagée entre ChatMessage.tsx et exercises/page.tsx, qui
 * affichent toutes les deux des réponses IA pouvant contenir des formules.
 * Voir chaque fonction pour le détail du problème réglé ; extrait de
 * ChatMessage.tsx (session du 2026-09-05) pour que /exercises bénéficie des
 * mêmes correctifs au lieu de dupliquer (et désynchroniser) cette logique.
 */

import { useEffect, type RefObject } from "react";

/**
 * Le modèle écrit souvent les formules bloc sur une seule ligne
 * ("$$\frac{a}{b}$$"). remark-math ne reconnaît le mode "display" que si
 * $$ est isolé sur ses propres lignes (comme un fence de code) ; sinon il
 * traite la formule comme du math inline en style compact, ce qui rend les
 * fractions empilées illisibles. On force donc chaque bloc $$...$$ sur ses
 * propres lignes avant de passer le contenu à ReactMarkdown.
 */
function normalizeDisplayMath(text: string): string {
  return text.replace(
    /\$\$([\s\S]+?)\$\$/g,
    (_, formula: string) => `\n\n$$\n${formula.trim()}\n$$\n\n`
  );
}

/**
 * \frac utilise le style "cramped" de TeX pour son dénominateur : quand ce
 * dénominateur porte un exposant (ex. "0^+" pour une limite à droite), le
 * signe touche/chevauche la barre de fraction, surtout en math inline où
 * l'espacement est déjà compact. \dfrac force le style "display" (pleine
 * taille, non compact) partout, y compris en inline, ce qui règle ce
 * chevauchement sans rien changer visuellement là où \frac était déjà
 * correct.
 */
function forceDisplayFractions(text: string): string {
  return text.replace(/\\frac(?=\{)/g, "\\dfrac");
}

/** Applique les deux correctifs ci-dessus, dans l'ordre. */
export function normalizeMathContent(text: string): string {
  return forceDisplayFractions(normalizeDisplayMath(text));
}

/**
 * Réduit la taille de police d'une formule KaTeX display trop large pour
 * son conteneur, au lieu de la laisser déborder à droite (coupée net, avec
 * un défilement horizontal peu visible/découvrable — repéré à l'audit
 * mobile/tablette du 2026-09-05, confirmé cassé en test manuel sur
 * tablette 712px pour une équation à deux fractions).
 *
 * KaTeX dimensionne tout en unités `em` : réduire le font-size de l'élément
 * réduit donc proportionnellement toute la formule (barres de fraction,
 * exposants, espacements...) sans recalcul manuel. On mesure le débordement
 * réel (scrollWidth vs largeur disponible) plutôt que de deviner une taille
 * fixe, avec une marge de sécurité et un plancher pour rester lisible.
 * `overflow-x: auto` (globals.css) reste un filet de sécurité pour les
 * formules si longues que même la taille plancher ne suffit pas.
 */
export function fitKatexDisplaysToWidth(root: ParentNode = document): void {
  const displays = root.querySelectorAll<HTMLElement>(".katex-display");
  const MIN_FONT_SIZE_PX = 12;
  const SAFETY_MARGIN = 0.96;

  displays.forEach((el) => {
    // Reset avant de mesurer : sans ça, un rétrécissement déjà appliqué à
    // un rendu précédent (ex. après un redimensionnement de fenêtre)
    // fausserait la mesure de la largeur "naturelle" du contenu.
    el.style.fontSize = "";

    const available = el.clientWidth;
    const needed = el.scrollWidth;
    if (available <= 0 || needed <= available) return;

    const currentSize = parseFloat(getComputedStyle(el).fontSize);
    const ratio = (available / needed) * SAFETY_MARGIN;
    const targetSize = Math.max(currentSize * ratio, MIN_FONT_SIZE_PX);
    el.style.fontSize = `${targetSize}px`;
  });
}

/**
 * Applique fitKatexDisplaysToWidth() dans un effet : au montage/changement
 * de contenu (`deps`) et à chaque redimensionnement de fenêtre (rotation
 * d'écran sur tablette, DevTools responsive, etc.). Partagé entre
 * ChatMessage.tsx et exercises/page.tsx plutôt que dupliqué.
 */
export function useFitKatexDisplays(
  ref: RefObject<HTMLElement | null>,
  deps: React.DependencyList
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    fitKatexDisplaysToWidth(el);

    const onResize = () => fitKatexDisplaysToWidth(el);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
