// =========================================================================
// Normalizacao - espelha src/lib/validation.ts (normalizarPlaca) e a logica
// de nome de loja de supabase/webhooks/captacoes-to-google-sheets.gs.
// Mantenha em sincronia se aquelas mudarem - nao ha import direto porque
// este e um projeto Node standalone (sem build TypeScript), separado do
// app Next.js de proposito (Playwright nao entra na imagem Docker do app).
// =========================================================================

/** Mesma regra de src/lib/validation.ts: maiusculo, so alfanumerico, 7 chars. */
export function normalizarPlaca(valor) {
  return String(valor || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 7);
}

/**
 * Mascara a placa para log (dado pessoal - LGPD.md secao 8: nao logar dado
 * pessoal em texto puro). Mostra so os ultimos 3 caracteres, ex.: "***1D23".
 */
export function mascararPlaca(valor) {
  const p = String(valor || "");
  if (p.length <= 3) return "*".repeat(p.length);
  return "*".repeat(p.length - 3) + p.slice(-3);
}

/**
 * Limpa o "Estabelecimento" do ViaNuvem (ex.: "MOVIDA - MOGI DAS CRUZES")
 * para um nome de loja legivel (ex.: "Mogi das Cruzes"), consistente com o
 * que os admins digitam no publicMetadata.loja do Clerk. Nao precisa ser
 * perfeito: o Apps Script normaliza (minusculo, sem acento) na hora de
 * rotear para a planilha, entao pequenas diferencas de capitalizacao aqui
 * nao quebram o roteamento.
 */
export function limparNomeLoja(estabelecimento) {
  const semPrefixo = String(estabelecimento || "")
    .replace(/^movida\s*-?\s*/i, "")
    .trim();
  if (!semPrefixo) return null;
  return semPrefixo
    .toLowerCase()
    .split(/\s+/)
    .map((palavra) => palavra.charAt(0).toUpperCase() + palavra.slice(1))
    .join(" ");
}
