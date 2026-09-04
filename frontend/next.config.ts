import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Masque le framework dans les réponses (X-Powered-By) — info gratuite
  // pour un attaquant sinon.
  poweredByHeader: false,
  // En-têtes de sécurité de base (voir audit sécurité). Volontairement pas
  // de Content-Security-Policy ici : cette app charge du contenu varié
  // (KaTeX, react-markdown, styles inline générés) et une CSP mise en place
  // sans tester chaque page casserait probablement le rendu — à calibrer
  // séparément avec de vrais tests visuels, pas dans cet audit.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;