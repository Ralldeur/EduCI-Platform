/**
 * Migration des comptes existants (table Prisma `User`, mots de passe
 * bcryptjs coût 12) vers Keycloak, en préservant le hash tel quel — pas de
 * reset password au premier login (décision actée dans le plan §Phase 1).
 *
 * Prérequis :
 *   - Keycloak doit avoir le provider bcrypt installé (voir keycloak/Dockerfile)
 *   - Le realm `educi` doit déjà exister (importé via keycloak/realm-export.json)
 *
 * Usage :
 *   KEYCLOAK_URL=http://localhost:8080 \
 *   KEYCLOAK_ADMIN_USER=admin \
 *   KEYCLOAK_ADMIN_PASSWORD=admin \
 *   node scripts/migrate-users-to-keycloak.mjs
 *
 * Idempotent : un utilisateur déjà présent dans Keycloak (même email) est
 * simplement ignoré (log "déjà migré"), on peut relancer le script sans
 * risque après une interruption.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || "http://localhost:8080";
const REALM = process.env.KEYCLOAK_REALM || "educi";
const ADMIN_USER = process.env.KEYCLOAK_ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || "admin";
const BCRYPT_COST = Number(process.env.BCRYPT_COST || 12); // doit matcher bcrypt.hash(password, 12) dans register/route.ts

// Table de correspondance rôle applicatif -> rôle réaliste du realm educi.
const ROLE_MAP = {
  ADMIN: "ROLE_ADMIN",
  TEACHER: "ROLE_TEACHER",
  STUDENT: "ROLE_STUDENT",
};

async function getAdminToken() {
  const res = await fetch(
    `${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: "admin-cli",
        grant_type: "password",
        username: ADMIN_USER,
        password: ADMIN_PASSWORD,
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`Échec login admin Keycloak: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function userExistsInKeycloak(token, email) {
  const res = await fetch(
    `${KEYCLOAK_URL}/admin/realms/${REALM}/users?email=${encodeURIComponent(email)}&exact=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return false;
  const users = await res.json();
  return users.length > 0;
}

async function createUserWithBcryptHash(token, user) {
  // Format confirmé par le code source du provider bcrypt : le salt est
  // encodé dans le hash bcrypt lui-même, donc `secretData.salt` n'est pas
  // nécessaire — seul `secretData.value` (le hash bcrypt complet, ex.
  // "$2a$12$....") est utilisé, avec `algorithm: "bcrypt"` côté credentialData.
  const body = {
    username: user.email,
    email: user.email,
    emailVerified: true,
    enabled: true,
    firstName: user.name || "",
    realmRoles: [ROLE_MAP[user.role] || "ROLE_STUDENT"],
    attributes: user.gradeLevel ? { grade_level: [user.gradeLevel] } : undefined,
    credentials: [
      {
        type: "password",
        credentialData: JSON.stringify({
          algorithm: "bcrypt",
          hashIterations: BCRYPT_COST,
        }),
        secretData: JSON.stringify({ value: user.password }),
      },
    ],
  };

  const res = await fetch(`${KEYCLOAK_URL}/admin/realms/${REALM}/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status !== 201) {
    throw new Error(
      `Échec création ${user.email}: ${res.status} ${await res.text()}`
    );
  }
}

async function main() {
  console.log("🔑 [migrate] login admin Keycloak...");
  const token = await getAdminToken();

  console.log("📥 [migrate] lecture des utilisateurs Prisma...");
  const users = await prisma.user.findMany();
  console.log(`   ${users.length} utilisateur(s) trouvé(s).`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of users) {
    try {
      if (await userExistsInKeycloak(token, user.email)) {
        console.log(`  ⏭️  ${user.email} déjà migré, ignoré.`);
        skipped++;
        continue;
      }
      await createUserWithBcryptHash(token, user);
      console.log(`  ✅ ${user.email} migré.`);
      migrated++;
    } catch (err) {
      console.error(`  ❌ ${user.email}: ${err.message}`);
      failed++;
    }
  }

  console.log(
    `\n📊 [migrate] terminé — migrés: ${migrated}, déjà présents: ${skipped}, échecs: ${failed}`
  );

  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("❌ [migrate] erreur fatale:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
