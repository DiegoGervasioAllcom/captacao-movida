import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import ExcelJS from "exceljs";
import { roleFromClaims } from "@/lib/roles";
import { normalizarPlaca } from "@/lib/validation";
import {
  ErroSincronizacaoSeguros,
  sincronizarSegurosDasPlanilhas,
} from "@/lib/sincronizar-seguros";
import {
  AMARELO,
  AZUL,
  CINZA_CABECALHO,
  CINZA_SUBTOTAL,
  CINZA_TITULO,
  CINZA_TOTAL,
  NOMES_MES,
  VERDE,
  VERMELHO,
  escreverCabecalho,
  estilizarCelula,
  limitesDoMes,
  mesAtualPadrao,
} from "@/lib/xlsx-estilo";

// =========================================================================
// Relatorio de desempenho por LOJA e VENDEDOR (download .xlsx no painel do
// gestor). Mesmo fluxo do relatorio de seguros: clicar sincroniza o banco a
// partir das 3 planilhas e depois monta o arquivo.
//
// 1. Le o `doGet` do Apps Script e sincroniza `seguros_indicacao_movida` -
//    tanto as colunas de seguro quanto `status_negociacao` (coluna J STATUS:
//    o andamento da negociacao, que so existe na planilha, nao em `captacoes`).
// 2. Universo do relatorio: as captacoes com `created_at` DENTRO do mes
//    escolhido. Tudo o mais (status da negociacao, venda emitida/pendente,
//    premio) descreve ESSES leads, cruzados pela placa - de proposito nao ha
//    um segundo filtro por data da venda, senao as colunas de uma mesma
//    linha falariam de periodos diferentes e nao fechariam entre si.
// 3. Abas:
//    - "Por loja"     : uma linha por loja + TOTAL GERAL
//    - "Por vendedor" : uma linha por vendedor, agrupada por loja, com
//                       subtotal de loja
//    - "Base"         : detalhe lead a lead (sem dado pessoal do cliente
//                       alem da placa - ver LGPD.md)
//
// Os nomes de status da negociacao NAO sao fixos no codigo: viram colunas a
// partir do que existe nos dados do mes, pra nao quebrar quando o time
// adicionar um valor novo no dropdown da planilha.
// =========================================================================

const VENDEDOR_VIANUVEM = "vianuvem";
const SEM_STATUS = "Sem status";
const SEM_LOJA = "(sem loja)";

interface CaptacaoRelatorio {
  vendedor_id: string;
  vendedor_nome: string | null;
  loja: string | null;
  placa: string;
  canal: string | null;
  cpf: string | null;
  email: string | null;
  created_at: string;
}

/**
 * Um lead veio do ViaNuvem se ainda esta com `vendedor_id = 'vianuvem'` (nao
 * reivindicado) OU se tem CPF/e-mail preenchido: esses dois campos so chegam
 * pela importacao automatica e SOBREVIVEM a reivindicacao pelo portal - a
 * coluna `canal` nao serve pra isso, porque `registrar_captacao_vendedor` a
 * troca por "Indicação" quando o vendedor reivindica.
 */
function veioDoViaNuvem(c: CaptacaoRelatorio): boolean {
  return c.vendedor_id === VENDEDOR_VIANUVEM || !!c.cpf || !!c.email;
}

/** Metricas acumuladas de uma loja ou de um vendedor. */
interface Metricas {
  leads: number;
  viaNuvem: number;
  viaNuvemNaoReivindicadas: number;
  indicacoesVendedor: number;
  porStatus: Map<string, number>;
  vendasEmitidas: number;
  vendasPendentes: number;
  totalEmitidoR$: number;
}

function novasMetricas(): Metricas {
  return {
    leads: 0,
    viaNuvem: 0,
    viaNuvemNaoReivindicadas: 0,
    indicacoesVendedor: 0,
    porStatus: new Map(),
    vendasEmitidas: 0,
    vendasPendentes: 0,
    totalEmitidoR$: 0,
  };
}

function somar(destino: Metricas, origem: Metricas) {
  destino.leads += origem.leads;
  destino.viaNuvem += origem.viaNuvem;
  destino.viaNuvemNaoReivindicadas += origem.viaNuvemNaoReivindicadas;
  destino.indicacoesVendedor += origem.indicacoesVendedor;
  destino.vendasEmitidas += origem.vendasEmitidas;
  destino.vendasPendentes += origem.vendasPendentes;
  destino.totalEmitidoR$ += origem.totalEmitidoR$;
  for (const [status, n] of origem.porStatus) {
    destino.porStatus.set(status, (destino.porStatus.get(status) ?? 0) + n);
  }
}

/** Cor de "semaforo" pro andamento da negociacao (heuristica por palavra-chave, ja que os valores sao texto livre da planilha). */
function corDoStatusNegociacao(status: string): { fill: string; fontColor: string } | null {
  const s = status.toLowerCase();
  if (s.includes("transmitid") || s.includes("emitid") || s.includes("fechad")) return VERDE;
  if (s.includes("negocia") || s.includes("andamento") || s.includes("contato feito")) return AZUL;
  if (s.includes("sem contato") || s === SEM_STATUS.toLowerCase()) return AMARELO;
  if (s.includes("perdid") || s.includes("recus") || s.includes("desist") || s.includes("cancel")) {
    return VERMELHO;
  }
  return null;
}

function corDoStatusVenda(status: string | null): { fill: string; fontColor: string } | null {
  switch (status) {
    case "Emitida":
      return VERDE;
    case "Recusada":
      return VERMELHO;
    case "Pendente":
      return AMARELO;
    default:
      return null;
  }
}

/** Escreve uma linha de dados: textos a esquerda, numeros centralizados. */
function escreverLinha(
  ws: ExcelJS.Worksheet,
  linha: number,
  valores: (string | number)[],
  opts: { bold?: boolean; fill?: string; colMoeda?: number } = {}
) {
  const r = ws.getRow(linha);
  valores.forEach((v, i) => {
    const cel = r.getCell(1 + i);
    cel.value = v;
    estilizarCelula(cel, {
      bold: opts.bold,
      fill: opts.fill,
      align: typeof v === "number" ? "center" : "left",
      border: "thin",
      numFmt:
        typeof v === "number"
          ? i === opts.colMoeda
            ? "#,##0.00"
            : "#,##0"
          : undefined,
    });
  });
}

export async function GET(req: NextRequest) {
  const { sessionClaims } = await auth();
  if (roleFromClaims(sessionClaims) !== "gestor") {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 403 });
  }

  const mesParam = req.nextUrl.searchParams.get("mes");
  const mes = mesParam && /^\d{4}-\d{2}$/.test(mesParam) ? mesParam : mesAtualPadrao();
  const { inicio, fim } = limitesDoMes(mes);

  // ---- 1. Sincroniza o banco a partir das planilhas ----
  // Mesma funcao usada pelo relatorio de seguros e pelas metricas de
  // transmissoes; ela devolve o client Supabase ja autenticado como o gestor.
  let supabase;
  try {
    supabase = await sincronizarSegurosDasPlanilhas();
  } catch (err) {
    if (err instanceof ErroSincronizacaoSeguros) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  // ---- 2. Leitura dos dados ----
  const [
    { data: captacoes, error: erroCaptacoes },
    { data: planilha, error: erroPlanilha },
  ] = await Promise.all([
    supabase
      .from("captacoes")
      .select("vendedor_id, vendedor_nome, loja, placa, canal, cpf, email, created_at")
      .gte("created_at", inicio)
      .lt("created_at", fim)
      .order("created_at", { ascending: true }),
    // Sem filtro de periodo: e um lookup por placa. O status da negociacao e o
    // ATUAL (a planilha nao guarda historico), e a venda pode ter sido fechada
    // em outro mes que a indicacao.
    supabase
      .from("seguros_indicacao_movida")
      .select("placa, status_negociacao, status_venda, premio_liquido, seguradora"),
  ]);
  if (erroCaptacoes || erroPlanilha) {
    const detalhe = erroCaptacoes?.message || erroPlanilha?.message || "";
    return NextResponse.json(
      { error: `Falha ao consultar os dados do relatorio. ${detalhe}`.trim() },
      { status: 500 }
    );
  }

  interface LinhaPlanilha {
    status_negociacao: string | null;
    status_venda: string | null;
    premio_liquido: number | null;
    seguradora: string | null;
  }
  const planilhaPorPlaca = new Map<string, LinhaPlanilha>();
  for (const p of planilha ?? []) {
    planilhaPorPlaca.set(normalizarPlaca(p.placa), p);
  }

  /** Status da negociacao de uma placa; "Sem status" cobre tanto "coluna vazia" quanto "placa que nem esta na planilha". */
  const statusDaPlaca = (placaNorm: string): string =>
    planilhaPorPlaca.get(placaNorm)?.status_negociacao?.trim() || SEM_STATUS;

  // ---- 3. Agregacao por loja e por vendedor ----
  const linhasCaptacao = (captacoes ?? []) as CaptacaoRelatorio[];

  const porLoja = new Map<string, Metricas>();
  interface LinhaVendedor {
    loja: string;
    vendedor: string;
    metricas: Metricas;
  }
  const porVendedor = new Map<string, LinhaVendedor>();
  const statusEncontrados = new Set<string>();

  for (const c of linhasCaptacao) {
    const loja = c.loja?.trim() || SEM_LOJA;
    const daNuvem = veioDoViaNuvem(c);
    const naoReivindicada = c.vendedor_id === VENDEDOR_VIANUVEM;
    const status = statusDaPlaca(normalizarPlaca(c.placa));
    statusEncontrados.add(status);
    const seguro = planilhaPorPlaca.get(normalizarPlaca(c.placa));

    const aplicar = (m: Metricas) => {
      m.leads += 1;
      if (daNuvem) m.viaNuvem += 1;
      if (naoReivindicada) m.viaNuvemNaoReivindicadas += 1;
      else m.indicacoesVendedor += 1;
      m.porStatus.set(status, (m.porStatus.get(status) ?? 0) + 1);
      if (seguro?.status_venda === "Emitida") {
        m.vendasEmitidas += 1;
        m.totalEmitidoR$ += seguro.premio_liquido ?? 0;
      } else if (seguro?.status_venda === "Pendente") {
        m.vendasPendentes += 1;
      }
    };

    if (!porLoja.has(loja)) porLoja.set(loja, novasMetricas());
    aplicar(porLoja.get(loja)!);

    // Leads ainda nao reivindicados nao pertencem a vendedor nenhum - ficam
    // so no total da loja (a aba "Por vendedor" seria enganosa com eles).
    if (naoReivindicada) continue;
    const chave = `${loja}||${c.vendedor_id}`;
    if (!porVendedor.has(chave)) {
      porVendedor.set(chave, {
        loja,
        vendedor: c.vendedor_nome?.trim() || "(sem nome)",
        metricas: novasMetricas(),
      });
    }
    aplicar(porVendedor.get(chave)!.metricas);
  }

  // Colunas de status: o que apareceu nos dados, em ordem alfabetica, com
  // "Sem status" sempre por ultimo.
  const COLUNAS_STATUS = [...statusEncontrados]
    .filter((s) => s !== SEM_STATUS)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  if (statusEncontrados.has(SEM_STATUS)) COLUNAS_STATUS.push(SEM_STATUS);

  const [anoStr, mesStr] = mes.split("-");
  const tituloPeriodo = `${NOMES_MES[Number(mesStr) - 1]} ${anoStr}`;

  const workbook = new ExcelJS.Workbook();

  // ---- 4. Aba "Por loja" ----
  const wsLoja = workbook.addWorksheet("Por loja");
  const CABECALHOS_LOJA = [
    "Loja",
    "Leads no mês",
    "Via Nuvem",
    "Via Nuvem sem vendedor",
    "Indicações de vendedor",
    ...COLUNAS_STATUS,
    "Vendas emitidas",
    "Vendas pendentes",
    "Total R$ emitido",
  ];
  wsLoja.columns = CABECALHOS_LOJA.map((_, i) => ({ width: i === 0 ? 30 : 14 }));

  wsLoja.mergeCells(1, 1, 1, CABECALHOS_LOJA.length);
  const celTituloLoja = wsLoja.getCell(1, 1);
  celTituloLoja.value = `DESEMPENHO POR LOJA — ${tituloPeriodo}`;
  for (let col = 1; col <= CABECALHOS_LOJA.length; col++) {
    estilizarCelula(wsLoja.getCell(1, col), {
      bold: true,
      fill: CINZA_TITULO,
      align: "center",
      size: 12,
      border: "medium",
    });
  }
  wsLoja.getRow(1).height = 22;
  escreverCabecalho(wsLoja, 2, CABECALHOS_LOJA);

  const lojasOrdenadas = [...porLoja.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], "pt-BR")
  );
  const colMoedaLoja = CABECALHOS_LOJA.length - 1;
  let linhaLoja = 3;
  for (const [loja, m] of lojasOrdenadas) {
    escreverLinha(
      wsLoja,
      linhaLoja,
      [
        loja,
        m.leads,
        m.viaNuvem,
        m.viaNuvemNaoReivindicadas,
        m.indicacoesVendedor,
        ...COLUNAS_STATUS.map((s) => m.porStatus.get(s) ?? 0),
        m.vendasEmitidas,
        m.vendasPendentes,
        m.totalEmitidoR$,
      ],
      { colMoeda: colMoedaLoja }
    );
    linhaLoja += 1;
  }
  const totalGeral = novasMetricas();
  for (const [, m] of lojasOrdenadas) somar(totalGeral, m);
  escreverLinha(
    wsLoja,
    linhaLoja,
    [
      "TOTAL GERAL",
      totalGeral.leads,
      totalGeral.viaNuvem,
      totalGeral.viaNuvemNaoReivindicadas,
      totalGeral.indicacoesVendedor,
      ...COLUNAS_STATUS.map((s) => totalGeral.porStatus.get(s) ?? 0),
      totalGeral.vendasEmitidas,
      totalGeral.vendasPendentes,
      totalGeral.totalEmitidoR$,
    ],
    { bold: true, fill: CINZA_TOTAL, colMoeda: colMoedaLoja }
  );
  wsLoja.views = [{ state: "frozen", ySplit: 2 }];

  // ---- 5. Aba "Por vendedor" (agrupada por loja, com subtotal) ----
  const wsVend = workbook.addWorksheet("Por vendedor");
  const CABECALHOS_VEND = [
    "Loja",
    "Vendedor",
    "Indicações",
    "Reivindicadas do ViaNuvem",
    ...COLUNAS_STATUS,
    "Vendas emitidas",
    "Vendas pendentes",
    "Total R$ emitido",
  ];
  wsVend.columns = CABECALHOS_VEND.map((_, i) => ({ width: i <= 1 ? 26 : 14 }));
  escreverCabecalho(wsVend, 1, CABECALHOS_VEND);

  const colMoedaVend = CABECALHOS_VEND.length - 1;
  const vendedoresOrdenados = [...porVendedor.values()].sort(
    (a, b) =>
      a.loja.localeCompare(b.loja, "pt-BR") ||
      b.metricas.leads - a.metricas.leads ||
      a.vendedor.localeCompare(b.vendedor, "pt-BR")
  );

  const linhaDoVendedor = (l: LinhaVendedor): (string | number)[] => [
    l.loja,
    l.vendedor,
    l.metricas.leads,
    // Reivindicadas = leads deste vendedor que nasceram no ViaNuvem (tem
    // CPF/e-mail da importacao); o resto e indicacao digitada no portal.
    l.metricas.viaNuvem,
    ...COLUNAS_STATUS.map((s) => l.metricas.porStatus.get(s) ?? 0),
    l.metricas.vendasEmitidas,
    l.metricas.vendasPendentes,
    l.metricas.totalEmitidoR$,
  ];

  let linhaVend = 2;
  let lojaCorrente: string | null = null;
  let subtotal = novasMetricas();
  const fecharSubtotal = () => {
    if (lojaCorrente === null) return;
    escreverLinha(
      wsVend,
      linhaVend,
      [
        `Subtotal ${lojaCorrente}`,
        "",
        subtotal.leads,
        subtotal.viaNuvem,
        ...COLUNAS_STATUS.map((s) => subtotal.porStatus.get(s) ?? 0),
        subtotal.vendasEmitidas,
        subtotal.vendasPendentes,
        subtotal.totalEmitidoR$,
      ],
      { bold: true, fill: CINZA_SUBTOTAL, colMoeda: colMoedaVend }
    );
    linhaVend += 1;
  };

  for (const l of vendedoresOrdenados) {
    if (lojaCorrente !== null && l.loja !== lojaCorrente) {
      fecharSubtotal();
      subtotal = novasMetricas();
    }
    lojaCorrente = l.loja;
    escreverLinha(wsVend, linhaVend, linhaDoVendedor(l), { colMoeda: colMoedaVend });
    linhaVend += 1;
    somar(subtotal, l.metricas);
  }
  fecharSubtotal();
  wsVend.views = [{ state: "frozen", ySplit: 1 }];

  if (vendedoresOrdenados.length === 0) {
    escreverLinha(wsVend, 2, ["Nenhuma indicação de vendedor no período."]);
  }

  // ---- 6. Aba "Base" - detalhe lead a lead. Sem nome/telefone/CPF/e-mail do
  // cliente de proposito (minimizacao - LGPD.md): a placa ja identifica a
  // linha na planilha, e o objetivo aqui e desempenho, nao contato.
  const wsBase = workbook.addWorksheet("Base");
  const CABECALHOS_BASE = [
    "Placa",
    "Loja",
    "Vendedor",
    "Origem",
    "Data da indicação",
    "Status da negociação",
    "Status da venda",
    "Seguradora",
    "Prêmio R$",
  ];
  wsBase.columns = [
    { width: 11 }, { width: 24 }, { width: 26 }, { width: 12 }, { width: 18 },
    { width: 20 }, { width: 15 }, { width: 20 }, { width: 13 },
  ];
  escreverCabecalho(wsBase, 1, CABECALHOS_BASE);

  const COL_STATUS_NEG = 5; // 0-based dentro de `valores`
  const COL_STATUS_VENDA = 6;
  linhasCaptacao.forEach((c, i) => {
    const placaNorm = normalizarPlaca(c.placa);
    const status = statusDaPlaca(placaNorm);
    const seguro = planilhaPorPlaca.get(placaNorm);
    const valores: (string | number)[] = [
      c.placa,
      c.loja?.trim() || SEM_LOJA,
      c.vendedor_id === VENDEDOR_VIANUVEM
        ? "(não reivindicada)"
        : c.vendedor_nome?.trim() || "(sem nome)",
      veioDoViaNuvem(c) ? "ViaNuvem" : "Indicação",
      new Date(c.created_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      status,
      seguro?.status_venda ?? "",
      seguro?.seguradora ?? "",
      seguro?.premio_liquido ?? "",
    ];
    const linha = wsBase.getRow(2 + i);
    valores.forEach((v, j) => {
      const cel = linha.getCell(1 + j);
      cel.value = v;
      const cor =
        j === COL_STATUS_NEG
          ? corDoStatusNegociacao(status)
          : j === COL_STATUS_VENDA
            ? corDoStatusVenda(seguro?.status_venda ?? null)
            : null;
      estilizarCelula(cel, {
        align: j === 1 || j === 2 ? "left" : "center",
        border: "thin",
        numFmt: j === 8 ? "#,##0.00" : undefined,
        fill: cor?.fill,
        fontColor: cor?.fontColor,
      });
    });
  });
  wsBase.views = [{ state: "frozen", ySplit: 1 }];
  wsBase.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: CABECALHOS_BASE.length } };

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="relatorio-desempenho-${mes}.xlsx"`,
    },
  });
}
