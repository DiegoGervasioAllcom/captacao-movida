// =========================================================================
// Utilitario de loja do vendedor
//
// A loja fica em `publicMetadata.loja` no Clerk, definida por um admin no
// painel (igual ao papel/role) - o vendedor nao escolhe no cadastro.
// Diferente do papel, nao precisa de claim customizado no session token:
// e lida direto do objeto `user` do Clerk no cliente (useUser()), do mesmo
// jeito que o nome (`user.fullName`) ja e lido hoje.
//
// A busca da chave ignora maiusculas/minusculas ("loja", "Loja", "LOJA")
// porque quem cadastra o metadata no painel do Clerk digita a mao e a
// grafia varia - mais seguro tolerar aqui do que depender de disciplina
// manual em toda captacao futura.
// =========================================================================

/** Le a loja do vendedor a partir do publicMetadata do Clerk. */
export function lojaFromPublicMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const registro = metadata as Record<string, unknown>;
  const chave = Object.keys(registro).find((k) => k.toLowerCase() === "loja");
  const value = chave ? registro[chave] : undefined;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
