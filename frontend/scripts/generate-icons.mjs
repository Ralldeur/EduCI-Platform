// Génère favicon.ico, apple-icon.png, icon.png et les icônes manifest
// (192/512) à partir du même tracé que EduCILogo.tsx (composant React
// utilisé dans l'app). Les deux doivent rester en phase manuellement : si
// tu modifies le dessin dans l'un, reporte le changement dans l'autre puis
// relance ce script (`node scripts/generate-icons.mjs` depuis frontend/).
//
// Pas de dépendance ICO dédiée dans ce projet (page/chat-service n'en ont
// jamais eu besoin) : le format ICO "PNG-in-ICO" (supporté par tous les
// navigateurs/OS depuis longtemps) est assez simple pour être assemblé à
// la main plutôt que d'ajouter une dépendance juste pour ça — voir
// buildIco() plus bas.

import sharp from "sharp";
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Couleur de marque canonique pour les assets statiques exportés (un seul
// orange, cohérent partout, plutôt que de faire varier la teinte selon le
// thème clair/sombre comme currentColor le permet dans l'app elle-même —
// voir EduCILogo.tsx). Valeur du thème clair (--color-primary), la plus
// saturée des deux : meilleur contraste sur fond blanc ET sur les barres
// d'onglets sombres.
const MARK_COLOR = "#c2661f";
// Fond des tuiles pleines (apple-touch-icon, icônes manifest) : fond du
// thème sombre (--color-background), thème par défaut de l'app.
const BG_COLOR = "#0a0a0b";

// Même tracé que src/components/icons/EduCILogo.tsx (viewBox 24x24).
//
// `simplified` raccourcit la pampille à un simple moignon + gland (au lieu
// du cordon long) : testé au rendu réel en 16x16, le cordon long se
// réduisait à un flou peu lisible une fois rastérisé à cette taille
// (vérifié visuellement), alors que le moignon court + gland (un point
// plein) reste visible. Le cordon complet reste utilisé sur les icônes
// plus grandes (48px+) et dans l'app (composant React vectoriel).
function markSvg({ color, transparent, simplified = false }) {
  const bg = transparent
    ? ""
    : `<rect width="24" height="24" fill="${BG_COLOR}"/>`;
  const tassel = simplified
    ? `<rect x="19.6" y="9" width="1.6" height="2.8" rx="0.8" />
       <circle cx="20.4" cy="12.6" r="1.7" />`
    : `<rect x="19.6" y="9" width="1.6" height="5.8" rx="0.8" />
       <circle cx="20.4" cy="15.6" r="1.8" />`;
  return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    ${bg}
    <g fill="${color}">
      <rect x="8.5" y="14.5" width="7" height="5" rx="2.5" />
      <path d="M12 6 L20 9 L12 12 L4 9 Z" />
      ${tassel}
    </g>
  </svg>`;
}

async function renderPng(svg, size) {
  return sharp(Buffer.from(svg), { density: 384 })
    .resize(size, size)
    .png()
    .toBuffer();
}

// Assemble un .ico "PNG-in-ICO" contenant plusieurs résolutions. Format :
// en-tête ICONDIR (6 octets) + une entrée ICONDIRENTRY (16 octets) par
// image + les données PNG brutes de chaque image à la suite.
function buildIco(pngBuffers) {
  const count = pngBuffers.length;
  const headerSize = 6 + 16 * count;
  let offset = headerSize;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // réservé
  header.writeUInt16LE(1, 2); // type = icône
  header.writeUInt16LE(count, 4);

  const entries = [];
  for (const { size, buf } of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // largeur (0 = 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // hauteur
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // réservé
    entry.writeUInt16LE(1, 4); // plans couleur
    entry.writeUInt16LE(32, 6); // bits/pixel
    entry.writeUInt32LE(buf.length, 8); // taille des données
    entry.writeUInt32LE(offset, 12); // offset dans le fichier
    offset += buf.length;
    entries.push(entry);
  }

  return Buffer.concat([header, ...entries, ...pngBuffers.map((p) => p.buf)]);
}

async function main() {
  // favicon.ico : marque seule, fond transparent, plusieurs résolutions,
  // version simplifiée (sans pampille — voir markSvg()) : c'est celle
  // qu'un navigateur affiche réellement dans l'onglet, quelle que soit la
  // résolution native du fichier.
  const icoSizes = [16, 32, 48];
  const icoPngs = await Promise.all(
    icoSizes.map(async (size) => ({
      size,
      buf: await renderPng(
        markSvg({ color: MARK_COLOR, transparent: true, simplified: true }),
        size
      ),
    }))
  );
  await writeFile(path.join(ROOT, "src/app/favicon.ico"), buildIco(icoPngs));

  // icon.png : même rôle que favicon.ico (onglet navigateur, potentiellement
  // réduit à 16px par le navigateur peu importe la résolution du fichier
  // source) — donc simplifié aussi, pour la même raison.
  await writeFile(
    path.join(ROOT, "src/app/icon.png"),
    await renderPng(
      markSvg({ color: MARK_COLOR, transparent: true, simplified: true }),
      512
    )
  );

  // apple-icon.png : iOS n'aime pas la transparence (il la remplit
  // lui-même, de façon imprévisible) — fond plein.
  await writeFile(
    path.join(ROOT, "src/app/apple-icon.png"),
    await renderPng(markSvg({ color: MARK_COLOR, transparent: false }), 180)
  );

  // Icônes manifest (PWA / écran d'accueil Android) : fond plein aussi,
  // pour un rendu cohérent avec apple-icon.
  await mkdir(path.join(ROOT, "public/icons"), { recursive: true });
  for (const size of [192, 512]) {
    await writeFile(
      path.join(ROOT, `public/icons/icon-${size}.png`),
      await renderPng(markSvg({ color: MARK_COLOR, transparent: false }), size)
    );
  }

  console.log("Icônes générées : favicon.ico, icon.png, apple-icon.png, public/icons/icon-{192,512}.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
