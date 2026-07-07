// =========================================================================
// Utilitario de loja do vendedor
//
// A loja fica em `publicMetadata.loja` no Clerk, definida por um admin no
// painel (igual ao papel/role) - o vendedor nao escolhe no cadastro.
// Diferente do papel, nao precisa de claim customizado no session token:
// e lida direto do objeto `user` do Clerk no cliente (useUser()), do mesmo
// jeito que o nome (`user.fullName`) ja e lido hoje.
// =========================================================================

/** Le a loja do vendedor a partir do publicMetadata do Clerk. */
export function lojaFromPublicMetadata(metadata: unknown): string | null {
  const value = (metadata as { loja?: unknown } | null)?.loja;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
