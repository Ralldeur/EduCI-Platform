import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { requireAuth } from "./auth.js";

const app = express();
const PORT = process.env.PORT || 8000;

// En-têtes de sécurité HTTP de base (pas de dépendance helmet ajoutée pour
// si peu). Volontairement pas de Content-Security-Policy ici : une CSP mal
// calibrée casse facilement des pages qu'on ne contrôle pas depuis ce
// service (le gateway ne sert que du JSON/proxy, jamais de HTML) — à
// définir plutôt côté frontend (voir next.config.ts) où le contenu réel est
// rendu.
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.get("/health", (_req, res) => {
  res.json({ status: "UP" });
});

// Endpoint public : le profil est créé/synchronisé juste après le login
// Keycloak, donc le token vient d'être émis — on protège quand même par
// requireAuth (le token est déjà là à ce moment du flux).
app.use(
  "/api/auth",
  requireAuth,
  createProxyMiddleware({
    target: process.env.AUTH_SERVICE_URL || "http://auth-service:8081",
    changeOrigin: true,
  })
);

app.use(
  "/api/chat",
  requireAuth,
  createProxyMiddleware({
    target: process.env.CHAT_SERVICE_URL || "http://chat-service:8082",
    changeOrigin: true,
  })
);

app.use(
  "/api/ml",
  requireAuth,
  createProxyMiddleware({
    target: process.env.ML_SERVICE_URL || "http://ml-service:8086",
    changeOrigin: true,
  })
);

app.listen(PORT, () => {
  console.log(`[gateway] listening on :${PORT}`);
});
