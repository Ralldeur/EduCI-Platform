import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://educi_admin:educi_admin_pwd@postgres:5432/educi_db",
});

// Table préfixée `auth_` pour rester lisible dans la base Postgres
// partagée (décision : une seule base pour tous les services pour
// l'instant, cf. plan §Phase 0).
export async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_user_profiles (
      keycloak_user_id TEXT PRIMARY KEY,
      email             TEXT NOT NULL,
      grade_level       TEXT,
      bac_series        TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}
