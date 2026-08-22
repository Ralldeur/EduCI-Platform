import { createRemoteJWKSet, jwtVerify } from "jose";

const ISSUER = process.env.KEYCLOAK_ISSUER || "http://localhost:8080/realms/educi";
const JWKS_URL = process.env.KEYCLOAK_JWKS || "http://keycloak:8080/realms/educi/protocol/openid-connect/certs";

// Le JWKS est mis en cache et rafraîchi automatiquement par `jose`.
const jwks = createRemoteJWKSet(new URL(JWKS_URL));

/**
 * Vérifie le JWT Bearer, puis attache l'identité de l'utilisateur en headers
 * internes (x-user-id, x-user-email, x-user-roles) transmis aux services en
 * aval. Ceux-ci font confiance à ces headers car ils ne sont accessibles
 * qu'à l'intérieur du réseau Docker (jamais exposés au client).
 */
export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Token manquant" });
  }

  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: ISSUER });

    req.headers["x-user-id"] = payload.sub;
    req.headers["x-user-email"] = payload.email || "";
    req.headers["x-user-roles"] = (payload.realm_access?.roles || []).join(",");

    next();
  } catch (err) {
    console.error("[gateway] JWT invalide:", err.message);
    return res.status(401).json({ error: "Token invalide ou expiré" });
  }
}
