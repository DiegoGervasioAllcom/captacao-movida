import type { Role } from "./types";

// =========================================================================
// Utilitarios de papel (role)
//
// IMPORTANTE: o claim `role` do session token do Clerk ja e usado pelo
// Supabase (precisa valer "authenticated"). Por isso o papel da APLICACAO
// (vendedor/gestor) vive em um claim SEPARADO chamado `app_role`,
// configurado no painel do Clerk como:
//   { "app_role": "{{user.public_metadata.role}}" }
// =========================================================================

/** Verifica se um valor desconhecido e um papel valido. */
export function isRole(value: unknown): value is Role {
  return value === "vendedor" || value === "gestor";
}

/**
 * Normaliza um valor de papel. Se nao for reconhecido (ex.: usuario sem
 * metadata configurado), assume "vendedor" por seguranca, que e o papel
 * de menor privilegio.
 */
export function normalizeRole(value: unknown): Role {
  return isRole(value) ? value : "vendedor";
}

/**
 * Le o papel da aplicacao a partir dos claims do session token do Clerk.
 * Usa o claim `app_role` (NAO o `role`, que pertence ao Supabase).
 */
export function roleFromClaims(claims: unknown): Role {
  const value = (claims as { app_role?: unknown } | null)?.app_role;
  return normalizeRole(value);
}
