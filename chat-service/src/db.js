import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://educi_admin:educi_admin_pwd@postgres:5432/educi_db",
});

// Tables préfixées `chat_` — même convention que `auth_user_profiles` dans
// auth-service (une seule base Postgres partagée pour l'instant, cf. plan).
export async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_conversations (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      title       TEXT,
      subject     TEXT,
      grade_level TEXT,
      serie       TEXT,
      mode        TEXT NOT NULL DEFAULT 'CHAT',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
      role            TEXT NOT NULL,
      content         TEXT NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}
