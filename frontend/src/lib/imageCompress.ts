// Compression/redimensionnement d'une photo côté client avant envoi à l'IA
// (vision Groq qwen/qwen3.6-27b, voir chat-service/src/groqClient.js) —
// utilisé par ChatInput.tsx (chat) et /exercises (correction par photo).
//
// Deux raisons de compresser plutôt que d'envoyer le fichier brut :
// 1. Une photo de téléphone peut peser plusieurs Mo — ça ralentit l'envoi
//    sur une connexion mobile ivoirienne typique, pour rien : Groq compte
//    un coût fixe de 2048 tokens par image quelle que soit sa résolution
//    (voir IMAGE_TOKEN_COST, groqClient.js), donc au-delà d'une résolution
//    suffisante pour la lisibilité de l'écriture, plus de pixels n'apporte
//    aucun bénéfice.
// 2. Ça reste sous la limite de taille du corps JSON du chat-service
//    (express.json({limit:"15mb"}), voir index.js) même avec le
//    gonflement d'environ 33% du base64 par rapport aux octets bruts.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

/**
 * Lit un fichier image, le redimensionne (si besoin) à MAX_DIMENSION sur son
 * plus grand côté, et retourne une data URL JPEG compressée — prête à être
 * envoyée telle quelle dans le corps JSON de /api/chat ou
 * /api/exercises/correct (champ `image` / `studentAnswerImage`).
 */
export function compressImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Image invalide ou illisible"));
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          const scale = MAX_DIMENSION / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Compression impossible sur cet appareil"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
      };
      img.src = reader.result as string;
    };

    reader.readAsDataURL(file);
  });
}
