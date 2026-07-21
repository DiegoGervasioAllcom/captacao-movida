import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import ExcelJS from "exceljs";
import { roleFromClaims } from "@/lib/roles";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { normalizarPlaca } from "@/lib/validation";
import { LOJAS_DISPONIVEIS, lojaOficial } from "@/lib/loja";

// =========================================================================
// Relatorio mensal de seguros por loja (download .xlsx no painel do gestor).
//
// 1. Busca no endpoint `doGet` do Apps Script (as 3 planilhas Google Sheets
//    que o Database Webhook ja alimenta - ver captacoes-to-google-sheets.gs)
//    as linhas com STATUS DA VENDA preenchido.
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

interface RegistroSheet {
  placa?: string;
  loja?: string;
  obs?: string;
  dataVenda?: string;
  statusVenda?: string;
  premioLiquido?: string | number;
  seguradora?: string;
  motivo?: string;
}

/**
 * A coluna "DATA DA VENDA" e formatada como data na planilha - o Apps Script
 * serializa isso (JSON.stringify de um objeto Date) como ISO 8601, ex.:
 * "2026-07-16T03:00:00.000Z" (NAO como texto "16/07/2026"). Tambem tolera o
 * caso raro de a celula ainda ser texto solto tipo "15/07/2026" ou "08/0726"
 * (sem uma das barras - visto ao vivo numa das planilhas). Retorna null
 * (loga e pula a linha, nao quebra o processamento) quando nao consegue
 * interpretar, ou quando o ano vem claramente corrompido (ex.: celula mal
 * formatada gerando ano "0726" em vez de "2026").
 */
function parseDataVenda(bruto: string | undefined): string | null {
  if (!bruto) return null;
  const s = String(bruto).trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (iso) {
    const [, yyyy, mm, dd] = iso;
    if (Number(yyyy) < 2000 || Number(yyyy) > 2100) return null;
    return `${yyyy}-${mm}-${dd}`;
  }

  const digitos = s.replace(/\D/g, "");
  let dd: string, mm: string, yyyy: string;
  if (digitos.length === 8) {
    dd = digitos.slice(0, 2);
    mm = digitos.slice(2, 4);
    yyyy = digitos.slice(4, 8);
  } else if (digitos.length === 6) {
    dd = digitos.slice(0, 2);
    mm = digitos.slice(2, 4);
    yyyy = `20${digitos.slice(4, 6)}`;
  } else {
    return null;
  }
  const diaNum = Number(dd);
  const mesNum = Number(mm);
  if (mesNum < 1 || mesNum > 12 || diaNum < 1 || diaNum > 31) return null;
  return `${yyyy}-${mm}-${dd}`;
}

/** Aceita numero (Apps Script ja manda numero p/ celulas de moeda) ou texto "R$ 2.389,85" / "4.435,13". */
function parsePremioLiquido(bruto: string | number | undefined): number | null {
  if (bruto === undefined || bruto === null || bruto === "") return null;
  if (typeof bruto === "number") return Number.isFinite(bruto) ? bruto : null;
  const limpo = bruto.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/** "YYYY-MM-DD" (formato que o Supabase devolve p/ coluna `date`) -> "dd/MM/yyyy". */
function formatarDataBr(isoDate: string): string {
  const [yyyy, mm, dd] = isoDate.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

function mesAtualPadrao(): string {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

/** [inicio, fimExclusivo] em "YYYY-MM-DD" para o mes "YYYY-MM". */
function limitesDoMes(mes: string): { inicio: string; fim: string } {
  const [anoStr, mesStr] = mes.split("-");
  const ano = Number(anoStr);
  const mesNum = Number(mesStr);
  const inicio = new Date(Date.UTC(ano, mesNum - 1, 1));
  const fim = new Date(Date.UTC(ano, mesNum, 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { inicio: fmt(inicio), fim: fmt(fim) };
}

const NOMES_MES = [
  "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
  "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
];

// ---- Estilos extraidos da planilha modelo (MOVIDA 2026 SUPPER CERTO
// SEGUROS) que o time de seguros enviou, pra o .xlsx gerado ter o mesmo
// visual. As cores de cinza sao a aproximacao RGB dos tons de tema do Excel
// ("Branco, Fundo 1, Mais Escuro 15/25/35%") usados no arquivo original; o
// roxo da faixa "SN MOVIDA" e a cor exata (RGB puro) do arquivo original.
const CINZA_TITULO = "FFD9D9D9";
const CINZA_CABECALHO = "FFBFBFBF";
const CINZA_TOTAL = "FFA6A6A6";
const ROXO_SN_MOVIDA = "FF7030A0";

// Cores de "semaforo" pro Status da Venda na aba Base - mesmo esquema dos
// estilos nativos "Bom/Ruim/Neutro" do Excel (fundo claro + fonte escura da
// mesma cor), pra ficar reconhecivel visualmente sem precisar ler o texto.
function corDoStatusVenda(status: string | null): { fill: string; fontColor: string } | null {
  switch (status) {
    case "Emitida":
      return { fill: "FFC6EFCE", fontColor: "FF006100" }; // verde
    case "Recusada":
      return { fill: "FFFFC7CE", fontColor: "FF9C0006" }; // vermelho
    case "Pendente":
      return { fill: "FFFFEB9C", fontColor: "FF9C6500" }; // amarelo
    default:
      return null; // "Cancelada" e outros ficam sem cor especial
  }
}

function estilizarCelula(
  cel: ExcelJS.Cell,
  opts: {
    bold?: boolean;
    fill?: string;
    fontColor?: string;
    align?: "center" | "left";
    wrap?: boolean;
    size?: number;
    border?: "thin" | "medium";
    numFmt?: string;
  }
) {
  cel.font = {
    name: "Calibri",
    bold: opts.bold ?? false,
    size: opts.size ?? 11,
    color: { argb: opts.fontColor ?? "FF000000" },
  };
  if (opts.fill) {
    cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fill } };
  }
  cel.alignment = {
    horizontal: opts.align ?? "center",
    vertical: "middle",
    wrapText: opts.wrap ?? false,
  };
  if (opts.border) {
    const estilo = { style: opts.border } as const;
    cel.border = { top: estilo, left: estilo, bottom: estilo, right: estilo };
  }
  if (opts.numFmt) {
    cel.numFmt = opts.numFmt;
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

  const segurosUrl = process.env.SEGUROS_SHEETS_URL;
  const segurosSecret = process.env.SEGUROS_READ_SECRET;
  if (!segurosUrl || !segurosSecret) {
    return NextResponse.json(
      { error: "SEGUROS_SHEETS_URL e SEGUROS_READ_SECRET sao obrigatorios." },
      { status: 500 }
    );
  }

  const respostaSheets = await fetch(
    `${segurosUrl}?secret=${encodeURIComponent(segurosSecret)}`
  );
  if (!respostaSheets.ok) {
    return NextResponse.json(
      { error: "Falha ao ler as planilhas de seguro." },
      { status: 502 }
    );
  }
  const corpoSheets = (await respostaSheets.json()) as {
    ok: boolean;
    registros?: RegistroSheet[];
  };
  if (!corpoSheets.ok || !Array.isArray(corpoSheets.registros)) {
    return NextResponse.json(
      { error: "Resposta invalida do endpoint de planilhas." },
      { status: 502 }
    );
  }

  const supabase = await createServerSupabaseClient();

  // ---- 1. Upsert em `seguros_indicacao_movida` a partir das linhas lidas das planilhas ----
  const linhasParaGravar = corpoSheets.registros
    .map((r) => {
      const placa = r.placa ? normalizarPlaca(r.placa) : "";
      if (!placa) return null;
      return {
        placa,
        loja: lojaOficial(r.loja) ?? r.loja ?? null,
        obs: r.obs || null,
        data_venda: parseDataVenda(r.dataVenda),
        status_venda: r.statusVenda || null,
        premio_liquido: parsePremioLiquido(r.premioLiquido),
        seguradora: r.seguradora || null,
        motivo: r.motivo || null,
        updated_at: new Date().toISOString(),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (linhasParaGravar.length > 0) {
    const { error: erroUpsert } = await supabase
      .from("seguros_indicacao_movida")
      .upsert(linhasParaGravar, { onConflict: "placa" });
    if (erroUpsert) {
      return NextResponse.json(
        { error: `Falha ao sincronizar seguros: ${erroUpsert.message}` },
        { status: 500 }
      );
    }
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
