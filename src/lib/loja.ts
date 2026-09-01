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
 * As lojas disponiveis no select de loja do autocadastro do vendedor.
 * As 22 originais ja tem planilha de destino mapeada em
 * supabase/webhooks/captacoes-to-google-sheets.gs (LOJA_PARA_PLANILHA);
 * contando uma vez cada loja real, ignorando os apelidos do ViaNuvem que
 * apontam pra essa mesma loja.
 *
 * As 26 marcadas NOVA (projeto de expansao Supper Certo, regionais GSP2-4 e
 * SPI1-2, planilha "NOVAS LOJAS PROJETO SUPPER.xlsx") AINDA NAO tem planilha
 * de destino mapeada em LOJA_PARA_PLANILHA - um lead dessas lojas cai no log
 * de erro do webhook (Erros_Webhook) em vez de chegar em algum vendedor, ate
 * alguem decidir o roteamento (everton/wesley/william ou planilha nova) e
 * adicionar a linha correspondente la. "CS Sao Paulo Vila Ema" (mesma
 * unidade fisica de Vila Ema) e "Venda ao Condutor" (nao e loja fisica)
 * ficaram de fora por decisao do time. "Auto Shopping Taubate", apesar do
 * nome parecido, e loja separada de "Taubate" (confirmado pelo time) - por
 * isso tem entrada propria abaixo, mesmo sendo NOVA.
 *
 * "Campinas Shop Dom Pedro" fica sem acento/abreviado de proposito: e a
 * chave exata que existe no mapa (o apelido com "Shopping" tem um hifen
 * que a normalizacao NAO remove - usar o nome "bonito" aqui quebraria o
 * roteamento dessa loja).
 */
export const LOJAS_DISPONIVEIS = [
  "Americana",
  "Aricanduva",
  "Auto Shopping Arena Motors", // NOVA
  "Auto Shopping Autonomistas", // NOVA
  "Auto Shopping Bandeirantes", // NOVA
  "Auto Shopping Raposo", // NOVA
  "Auto Shopping Tamboré", // NOVA
  "Auto Shopping Taubaté", // NOVA
  "Bauru", // NOVA
  "Campinas Amoreiras",
  "Campinas Itapura",
  "Campinas Orosimbo",
  "Campinas Shop Dom Pedro",
  "Eliseu de Almeida", // NOVA
  "Ermano Marchetti", // NOVA
  "Gastão Vidigal", // NOVA
  "Indaiatuba", // NOVA
  "Itaim Paulista",
  "Jundiaí",
  "Limeira", // NOVA
  "Loja Web",
  "Miguel Estefano", // NOVA
  "Mogi das Cruzes",
  "Nações Unidas", // NOVA
  "Osasco", // NOVA
  "Penha",
  "Piracicaba", // NOVA
  "Praia Grande",
  "Ribeirão Preto", // NOVA
  "Rio Claro", // NOVA
  "Santana", // NOVA
  "Santo André", // NOVA
  "Santos",
  "São Bernardo do Campo", // NOVA
  "São Bernardo Pereira Barreto", // NOVA
  "São Carlos", // NOVA
  "São José do Rio Preto", // NOVA
  "São José dos Campos",
  "São Miguel Paulista",
  "São Paulo Radial Leste",
  "Sorocaba", // NOVA
  "Sorocaba Dom Aguirre", // NOVA
  "Suzano",
  "Taubaté",
  "Timóteo Penteado",
  "Vila Carrão",
  "Vila Ema",
  "Vila Guilherme",
] as const;

/**
 * Mesma normalizacao usada em captacoes-to-google-sheets.gs (normalizarTexto)
 * e vianuvem-import/lib/normalizar.mjs (limparNomeLoja): remove acentos,
 * baixa a caixa e tira um eventual prefixo "movida -". Duplicada aqui de
 * proposito - as 3 runtimes (Apps Script, job standalone, Next.js) nao
 * compartilham codigo entre si.
 */
function normalizarTextoLoja(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^movida\s*-?\s*/, "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Alias (normalizado) -> nome oficial em LOJAS_DISPONIVEIS. Mesma lista de
 * apelidos de LOJA_PARA_PLANILHA em captacoes-to-google-sheets.gs, so que
 * mapeando pro nome oficial da loja em vez da planilha de destino - usada
 * pra reconciliar o texto livre de loja que vem da coluna D das planilhas
 * (preenchido pelo time, com grafias variadas) com o relatorio de seguros
 * por loja. SE UMA LOJA NOVA APARECER OU UM APELIDO NOVO, mantenha os dois
 * mapas em sincronia.
 */
const LOJA_ALIAS_PARA_OFICIAL: Record<string, (typeof LOJAS_DISPONIVEIS)[number]> = (() => {
  const mapa: Record<string, string> = {
    Americana: "Americana",
    "Campinas Amoreiras": "Campinas Amoreiras",
    "Campinas Itapura": "Campinas Itapura",
    "Campinas Orosimbo": "Campinas Orosimbo",
    "Campinas Shop Dom Pedro": "Campinas Shop Dom Pedro",
    "Campinas - Shopping Dom Pedro": "Campinas Shop Dom Pedro",
    "Seminovos Movida Campinas Shopping Dom Pedro": "Campinas Shop Dom Pedro",
    Jundiai: "Jundiaí",
    "Loja Web": "Loja Web",
    "Praia Grande": "Praia Grande",
    "Seminovos Movida Praia Grande - Sp": "Praia Grande",
    Santos: "Santos",
    "Sao Jose dos Campos": "São José dos Campos",
    Suzano: "Suzano",
    "Seminovos Movida Suzano": "Suzano",
    "Seminovos Movida Suzano - Sp": "Suzano",
    Taubate: "Taubaté",
    "Guarulhos Timoteo Penteado": "Timóteo Penteado",
    "Timoteo Penteado": "Timóteo Penteado",
    "Mogi das Cruzes": "Mogi das Cruzes",
    Aricanduva: "Aricanduva",
    "Itaim Paulista": "Itaim Paulista",
    Penha: "Penha",
    "Radial Leste": "São Paulo Radial Leste",
    "Sao Paulo Radial Leste": "São Paulo Radial Leste",
    "Sao Miguel": "São Miguel Paulista",
    "Sao Miguel Paulista": "São Miguel Paulista",
    "Vila Carrao": "Vila Carrão",
    "Vila Ema": "Vila Ema",
    "Vila Guilherme": "Vila Guilherme",
    // Lojas novas (projeto de expansao Supper Certo) - so a identidade, sem
    // apelido conhecido ainda (nenhum export real inspecionado por enquanto).
    "Auto Shopping Arena Motors": "Auto Shopping Arena Motors",
    "Auto Shopping Autonomistas": "Auto Shopping Autonomistas",
    "Auto Shopping Bandeirantes": "Auto Shopping Bandeirantes",
    "Auto Shopping Raposo": "Auto Shopping Raposo",
    "Auto Shopping Tamboré": "Auto Shopping Tamboré",
    "Auto Shopping Taubaté": "Auto Shopping Taubaté",
    "Seminovos Movida Auto Shopping Taubate": "Auto Shopping Taubaté", // apelido ViaNuvem
    Bauru: "Bauru",
    "Eliseu de Almeida": "Eliseu de Almeida",
    "Ermano Marchetti": "Ermano Marchetti",
    "Gastão Vidigal": "Gastão Vidigal",
    Indaiatuba: "Indaiatuba",
    Limeira: "Limeira",
    "Miguel Estefano": "Miguel Estefano",
    "Nações Unidas": "Nações Unidas",
    Osasco: "Osasco",
    Piracicaba: "Piracicaba",
    "Ribeirão Preto": "Ribeirão Preto",
    "Rio Claro": "Rio Claro",
    Santana: "Santana",
    "Santo André": "Santo André",
    "São Bernardo do Campo": "São Bernardo do Campo",
    "São Bernardo Pereira Barreto": "São Bernardo Pereira Barreto",
    "São Carlos": "São Carlos",
    "São José do Rio Preto": "São José do Rio Preto",
    Sorocaba: "Sorocaba",
    "Sorocaba Dom Aguirre": "Sorocaba Dom Aguirre",
  };
  const normalizado: Record<string, (typeof LOJAS_DISPONIVEIS)[number]> = {};
  for (const [chave, valor] of Object.entries(mapa)) {
    normalizado[normalizarTextoLoja(chave)] = valor as (typeof LOJAS_DISPONIVEIS)[number];
  }
  return normalizado;
})();

/**
 * Resolve um texto livre de loja (ex.: "MOVIDA - VILA CARRÃO", vindo da
 * coluna D das planilhas de seguro) para o nome oficial em LOJAS_DISPONIVEIS,
 * tolerando as variacoes de grafia ja conhecidas. Retorna null se nao
 * reconhecer (loja nova ou grafia ainda nao mapeada).
 */
export function lojaOficial(nomeLivre: string | null | undefined): string | null {
  if (!nomeLivre) return null;
  return LOJA_ALIAS_PARA_OFICIAL[normalizarTextoLoja(nomeLivre)] ?? null;
}
