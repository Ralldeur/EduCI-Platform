import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { requireAuth } from "./auth.js";

const app = express();
const PORT = process.env.PORT || 8000;

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
