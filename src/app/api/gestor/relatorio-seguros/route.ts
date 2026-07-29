import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import ExcelJS from "exceljs";
import { roleFromClaims } from "@/lib/roles";
import { normalizarPlaca } from "@/lib/validation";
import { LOJAS_DISPONIVEIS } from "@/lib/loja";
import {
  ErroSincronizacaoSeguros,
  sincronizarSegurosDasPlanilhas,
} from "@/lib/sincronizar-seguros";
import {
  AMARELO,
  CINZA_CABECALHO,
  CINZA_TITULO,
  CINZA_TOTAL,
  NOMES_MES,
  ROXO_SN_MOVIDA,
  VERDE,
  VERMELHO,
  estilizarCelula,
  formatarDataBr,
  limitesDoMes,
  mesAtualPadrao,
} from "@/lib/xlsx-estilo";

// =========================================================================
// Relatorio mensal de seguros por loja (download .xlsx no painel do gestor).
//
// 1. Busca no endpoint `doGet` do Apps Script (as 3 planilhas Google Sheets
//    que o Database Webhook ja alimenta - ver captacoes-to-google-sheets.gs)
//    todas as linhas com placa. (Ate o relatorio de desempenho existir, so
//    vinham as linhas com STATUS DA VENDA preenchido; este relatorio segue
//    correto porque todas as consultas abaixo filtram por status_venda e/ou
//    data_venda, nulos nas linhas sem venda.)
// 2. Faz upsert em `seguros_indicacao_movida` (por placa) com o servidor Supabase autenticado
//    como o proprio gestor (RLS - sem service_role neste app).
// 3. Cruza com `captacoes` pela placa pra saber "com/sem indicacao" e conta
//    indicacoes por loja no mes.
// 4. Monta um .xlsx no layout da aba "Resultado" da planilha modelo e
//    devolve como download.
//
// So "Emitida" conta como seguro fechado (Cancelada/Recusada/Pendente ficam
// no banco como historico, mas nao entram nos numeros do relatorio).
// =========================================================================

// Cores de "semaforo" pro Status da Venda na aba Base - mesmo esquema dos
// estilos nativos "Bom/Ruim/Neutro" do Excel (fundo claro + fonte escura da
// mesma cor), pra ficar reconhecivel visualmente sem precisar ler o texto.
function corDoStatusVenda(status: string | null): { fill: string; fontColor: string } | null {
  switch (status) {
    case "Emitida":
      return VERDE;
    case "Recusada":
      return VERMELHO;
    case "Pendente":
      return AMARELO;
    default:
      return null; // "Cancelada" e outros ficam sem cor especial
  }
}

/** Escreve um titulo mesclado (B..G) na linha indicada, com fundo colorido - replica as faixas "JULHO 2026." / "SN MOVIDA" da planilha modelo. */
function aplicarFaixaTitulo(
  ws: ExcelJS.Worksheet,
  linha: number,
  texto: string,
  fill: string,
  fontColor = "FF000000"
) {
  ws.mergeCells(linha, 2, linha, 7); // B..G
  const border = linha === 2 ? "medium" : "thin";
  for (let col = 2; col <= 7; col++) {
    const cel = ws.getCell(linha, col);
    if (col === 2) cel.value = texto;
    estilizarCelula(cel, { bold: true, fill, fontColor, align: "center", size: 12, border });
  }
}

/** Escreve uma linha de dados (loja + 5 numeros) nas colunas B..G da aba "Resultado". */
function escreverLinhaDados(
  ws: ExcelJS.Worksheet,
  linha: number,
  valores: [string, number, number, number, number, number],
  opts: { bold?: boolean; fill?: string } = {}
) {
  const r = ws.getRow(linha);
  const celLoja = r.getCell(2);
  celLoja.value = valores[0];
  estilizarCelula(celLoja, { bold: opts.bold, fill: opts.fill, align: "left", border: "thin" });
  for (let i = 1; i < valores.length; i++) {
    const cel = r.getCell(2 + i);
    cel.value = valores[i];
    estilizarCelula(cel, {
      bold: opts.bold,
      fill: opts.fill,
      align: "center",
      border: "thin",
      numFmt: i === valores.length - 1 ? "#,##0.00" : "#,##0",
    });
  }
}

export async function GET(req: NextRequest) {
  const { sessionClaims } = await auth();
  if (roleFromClaims(sessionClaims) !== "gestor") {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 403 });
  }

  const mesParam = req.nextUrl.searchParams.get("mes");
  const mes = mesParam && /^\d{4}-\d{2}$/.test(mesParam) ? mesParam : mesAtualPadrao();
  const { inicio, fim } = limitesDoMes(mes);

  let supabase;
  try {
    supabase = await sincronizarSegurosDasPlanilhas();
  } catch (error) {
    if (error instanceof ErroSincronizacaoSeguros) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    return NextResponse.json(
      { error: "Falha ao sincronizar seguros." },
      { status: 500 }
    );
  }

  // ---- 2. Dados para o cruzamento ----
  const [
    { data: todasPlacasCaptadas, error: erroPlacas },
    { data: captacoesDoMes, error: erroCaptacoes },
    { data: segurosDoMes, error: erroSeguros },
    { data: segurosBaseDoMes, error: erroSegurosBase },
  ] = await Promise.all([
    supabase.from("captacoes").select("placa"),
    supabase
      .from("captacoes")
      .select("loja")
      .gte("created_at", inicio)
      .lt("created_at", fim),
    supabase
      .from("seguros_indicacao_movida")
      .select("loja, placa, premio_liquido")
      .eq("status_venda", "Emitida")
      .gte("data_venda", inicio)
      .lt("data_venda", fim),
    // Sem filtro de status_venda: a aba "Base" e o detalhe bruto do periodo
    // (todo mundo que teve alguma tentativa de venda no mes), diferente do
    // "Resultado" que so conta status_venda = "Emitida".
    supabase
      .from("seguros_indicacao_movida")
      .select("placa, loja, seguradora, data_venda, status_venda, premio_liquido")
      .gte("data_venda", inicio)
      .lt("data_venda", fim)
      .order("data_venda", { ascending: true }),
  ]);
  if (erroPlacas || erroCaptacoes || erroSeguros || erroSegurosBase) {
    return NextResponse.json(
      { error: "Falha ao consultar captacoes/seguros." },
      { status: 500 }
    );
  }

  const placasComIndicacao = new Set(
    (todasPlacasCaptadas ?? []).map((c) => normalizarPlaca(c.placa))
  );

  // ---- 3. Agregacao por loja ----
  interface LinhaRelatorio {
    loja: string;
    quant: number;
    indicados: number;
    semIndicacao: number;
    comIndicacao: number;
    totalR$: number;
  }
  const porLoja = new Map<string, LinhaRelatorio>(
    LOJAS_DISPONIVEIS.map((l) => [
      l,
      { loja: l, quant: 0, indicados: 0, semIndicacao: 0, comIndicacao: 0, totalR$: 0 },
    ])
  );

  for (const c of captacoesDoMes ?? []) {
    const loja = c.loja && porLoja.has(c.loja) ? c.loja : null;
    if (loja) porLoja.get(loja)!.indicados += 1;
  }

  for (const s of segurosDoMes ?? []) {
    const loja = s.loja && porLoja.has(s.loja) ? s.loja : null;
    if (!loja) continue;
    const linha = porLoja.get(loja)!;
    linha.quant += 1;
    linha.totalR$ += s.premio_liquido ?? 0;
    if (placasComIndicacao.has(normalizarPlaca(s.placa))) {
      linha.comIndicacao += 1;
    } else {
      linha.semIndicacao += 1;
    }
  }

  const linhas = LOJAS_DISPONIVEIS.map((l) => porLoja.get(l)!);
  const totalGeral = linhas.reduce(
    (acc, l) => ({
      loja: "TOTAL GERAL",
      quant: acc.quant + l.quant,
      indicados: acc.indicados + l.indicados,
      semIndicacao: acc.semIndicacao + l.semIndicacao,
      comIndicacao: acc.comIndicacao + l.comIndicacao,
      totalR$: acc.totalR$ + l.totalR$,
    }),
    { loja: "TOTAL GERAL", quant: 0, indicados: 0, semIndicacao: 0, comIndicacao: 0, totalR$: 0 }
  );

  // ---- 4. Monta o .xlsx replicando o visual da planilha modelo do time de
  // seguros (cores/negrito/bordas/mesclagem extraidos do arquivo real que
  // eles enviaram - ver helpers de estilo abaixo).
  const [anoStr, mesStr] = mes.split("-");
  const nomeMes = NOMES_MES[Number(mesStr) - 1];

  const workbook = new ExcelJS.Workbook();
  const wsResultado = workbook.addWorksheet("Resultado");
  wsResultado.columns = [
    { width: 3 }, // A - coluna vazia (espacador), igual a planilha modelo
    { width: 65 }, // B - REG / LOJAS
    { width: 7 }, // C - Quant.
    { width: 9.5 }, // D - Indicados
    { width: 16 }, // E - Seguros fechados sem indicacao
    { width: 15.5 }, // F - Seguros fechados com indicacao
    { width: 9.5 }, // G - Total R$
  ];

  aplicarFaixaTitulo(wsResultado, 2, `${nomeMes} ${anoStr}.`, CINZA_TITULO);
  aplicarFaixaTitulo(wsResultado, 4, "SN MOVIDA", ROXO_SN_MOVIDA, "FFFFFFFF");
  wsResultado.getRow(4).height = 15.75;

  const linhaCabecalho = wsResultado.getRow(5);
  linhaCabecalho.height = 25.5;
  const CABECALHOS_RESULTADO = [
    "REG / LOJAS", "Quant.", "Indicados",
    "Seguros fechados sem indicação", "Seguros fechados com indicação", "Total R$",
  ];
  CABECALHOS_RESULTADO.forEach((texto, i) => {
    const cel = linhaCabecalho.getCell(2 + i); // comeca na coluna B
    cel.value = texto;
    estilizarCelula(cel, {
      bold: true,
      fill: CINZA_CABECALHO,
      align: "center",
      wrap: true,
      size: i === 3 || i === 4 ? 10 : 11, // colunas mais longas (E/F) usam fonte menor, igual ao original
      border: "thin",
    });
  });

  let linhaAtual = 6;
  for (const l of linhas) {
    escreverLinhaDados(wsResultado, linhaAtual, [l.loja, l.quant, l.indicados, l.semIndicacao, l.comIndicacao, l.totalR$]);
    linhaAtual += 1;
  }
  escreverLinhaDados(
    wsResultado,
    linhaAtual,
    [totalGeral.loja, totalGeral.quant, totalGeral.indicados, totalGeral.semIndicacao, totalGeral.comIndicacao, totalGeral.totalR$],
    { bold: true, fill: CINZA_TOTAL }
  );

  // ---- 5. Aba "Base" - detalhe bruto (todas as tentativas de venda do mes,
  // nao so as Emitidas), no mesmo layout da planilha modelo do time de
  // seguros. "Tipo Seguro" nao existe como campo separado nos dados reais
  // hoje (as planilhas tem "Seguradora", nao um "tipo" distinto) - usamos a
  // seguradora ali ate existir um campo de tipo de verdade.
  const wsBase = workbook.addWorksheet("Base");
  wsBase.columns = [
    { width: 9.5 }, // Placa
    { width: 8.5 }, // Loja
    { width: 19 }, // Tipo Seguro
    { width: 16 }, // Data Venda
    { width: 14 }, // Status da Venda
    { width: 19.5 }, // Valor R$ Seguro
  ];
  const CABECALHOS_BASE = ["Placa", "Loja", "Tipo Seguro", "Data Venda", "Status da Venda", "Valor R$ Seguro"];
  const linhaCabecalhoBase = wsBase.getRow(1);
  CABECALHOS_BASE.forEach((texto, i) => {
    const cel = linhaCabecalhoBase.getCell(1 + i);
    cel.value = texto;
    estilizarCelula(cel, { bold: true, fill: CINZA_CABECALHO, align: "center", border: "thin" });
  });
  const COL_STATUS_VENDA = 4; // indice (0-based) da coluna "Status da Venda" em `valores` abaixo
  (segurosBaseDoMes ?? []).forEach((s, i) => {
    const linha = wsBase.getRow(2 + i);
    const valores = [
      s.placa,
      s.loja ?? "",
      s.seguradora ?? "",
      s.data_venda ? formatarDataBr(s.data_venda) : "",
      s.status_venda ?? "",
      s.premio_liquido ?? "",
    ];
    valores.forEach((v, j) => {
      const cel = linha.getCell(1 + j);
      cel.value = v;
      const corStatus = j === COL_STATUS_VENDA ? corDoStatusVenda(s.status_venda) : null;
      estilizarCelula(cel, {
        align: "center",
        border: "thin",
        numFmt: j === 5 ? "#,##0.00" : undefined,
        fill: corStatus?.fill,
        fontColor: corStatus?.fontColor,
      });
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="relatorio-seguros-${mes}.xlsx"`,
    },
  });
}
