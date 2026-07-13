// =========================================================================
// Utilitarios de loja/telefone do vendedor
//
// Loja e telefone ficam em `publicMetadata.loja`/`publicMetadata.telefone`
// no Clerk - hoje preenchidos pelo proprio vendedor no autocadastro (ver
// SignUpForm.tsx + /api/vendedor/perfil), ou por um admin manualmente.
// Nao precisam de claim customizado no session token: sao lidos direto do
// objeto `user` do Clerk no cliente (useUser()), do mesmo jeito que o nome
// (`user.fullName`) ja e lido hoje.
//
// A busca da chave ignora maiusculas/minusculas ("loja", "Loja", "LOJA")
// porque quem cadastra o metadata no painel do Clerk digita a mao e a
// grafia varia - mais seguro tolerar aqui do que depender de disciplina
// manual em toda captacao futura.
// =========================================================================

function campoDoPublicMetadata(metadata: unknown, campo: string): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const registro = metadata as Record<string, unknown>;
  const chave = Object.keys(registro).find((k) => k.toLowerCase() === campo);
  const value = chave ? registro[chave] : undefined;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Le a loja do vendedor a partir do publicMetadata do Clerk. */
export function lojaFromPublicMetadata(metadata: unknown): string | null {
  return campoDoPublicMetadata(metadata, "loja");
}

/** Le o telefone do vendedor a partir do publicMetadata do Clerk. */
export function telefoneFromPublicMetadata(metadata: unknown): string | null {
  return campoDoPublicMetadata(metadata, "telefone");
}

/**
 * As 21 lojas que ja tem planilha de destino mapeada em
 * supabase/webhooks/captacoes-to-google-sheets.gs (LOJA_PARA_PLANILHA) -
 * contando uma vez cada loja real, ignorando os apelidos do ViaNuvem que
 * apontam pra essa mesma loja. Usada no select de loja do autocadastro do
 * vendedor - mantenha em sincronia se uma loja nova ganhar planilha.
 *
 * "Campinas Shop Dom Pedro" fica sem acento/abreviado de proposito: e a
 * chave exata que existe no mapa (o apelido com "Shopping" tem um hifen
 * que a normalizacao NAO remove - usar o nome "bonito" aqui quebraria o
 * roteamento dessa loja).
 */
export const LOJAS_DISPONIVEIS = [
  "Americana",
  "Aricanduva",
  "Campinas Amoreiras",
  "Campinas Itapura",
  "Campinas Orosimbo",
  "Campinas Shop Dom Pedro",
  "Itaim Paulista",
  "Jundiaí",
  "Mogi das Cruzes",
  "Penha",
  "Praia Grande",
  "Santos",
  "São José dos Campos",
  "São Miguel Paulista",
  "São Paulo Radial Leste",
  "Suzano",
  "Taubaté",
  "Timóteo Penteado",
  "Vila Carrão",
  "Vila Ema",
  "Vila Guilherme",
] as const;
