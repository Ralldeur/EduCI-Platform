import "dotenv/config";
import express from "express";
import { pool, initSchema } from "./db.js";

const app = express();
const PORT = process.env.PORT || 8081;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "UP" });
});

// Le gateway a déjà validé le JWT et injecté ces headers — on ne revalide
// pas ici, on fait confiance au réseau interne Docker.
function identity(req) {
  return {
    userId: req.headers["x-user-id"],
    email: req.headers["x-user-email"],
    roles: (req.headers["x-user-roles"] || "").split(",").filter(Boolean),
  };
}

// Appelé par le frontend juste après un login Keycloak réussi, pour créer
// ou mettre à jour le profil applicatif (niveau, série BAC).
app.post("/profile/sync", async (req, res) => {
  const { userId, email } = identity(req);
  if (!userId) return res.status(401).json({ error: "Non authentifié" });

  const { gradeLevel, bacSeries } = req.body || {};

  const result = await pool.query(
    `INSERT INTO auth_user_profiles (keycloak_user_id, email, grade_level, bac_series)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (keycloak_user_id)
     DO UPDATE SET
       email = EXCLUDED.email,
       grade_level = COALESCE(EXCLUDED.grade_level, auth_user_profiles.grade_level),
       bac_series = COALESCE(EXCLUDED.bac_series, auth_user_profiles.bac_series),
       updated_at = now()
     RETURNING *`,
    [userId, email, gradeLevel ?? null, bacSeries ?? null]
  );

  res.json(result.rows[0]);
});

// Un élève ne peut lire que son propre profil ; un admin peut tout lire.
app.get("/profile/:userId", async (req, res) => {
  const { userId, roles } = identity(req);
  const isAdmin = roles.includes("ROLE_ADMIN");

  if (!userId) return res.status(401).json({ error: "Non authentifié" });
  if (req.params.userId !== userId && !isAdmin) {
    return res.status(403).json({ error: "Accès refusé" });
  }

  const result = await pool.query(
    "SELECT * FROM auth_user_profiles WHERE keycloak_user_id = $1",
    [req.params.userId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Profil introuvable" });
  }

  res.json(result.rows[0]);
});

initSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[auth-service] listening on :${PORT}`);
    });
  })
  .catch((err) => {
    console.error("[auth-service] échec init schema:", err);
    process.exit(1);
  });
