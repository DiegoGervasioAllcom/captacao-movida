import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import * as XLSX from "xlsx";
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
 * Tolera os formatos inconsistentes vistos na planilha real (ex.:
 * "15/07/2026" e "08/0726", sem uma das barras). Retorna null (loga e pula
 * a linha, nao quebra o processamento) quando nao consegue interpretar.
 */
function parseDataVenda(bruto: string | undefined): string | null {
  if (!bruto) return null;
  const digitos = String(bruto).replace(/\D/g, "");
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
  ]);
  if (erroPlacas || erroCaptacoes || erroSeguros) {
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

  // ---- 4. Monta o .xlsx no layout da aba "Resultado" ----
  const [anoStr, mesStr] = mes.split("-");
  const nomeMes = NOMES_MES[Number(mesStr) - 1];
  const linhasPlanilha: (string | number)[][] = [
    [`${nomeMes} ${anoStr}.`],
    ["SN MOVIDA"],
    ["REG / LOJAS", "Quant.", "Indicados", "Seguros fechados sem indicação", "Seguros fechados com indicação", "Total R$"],
    ...linhas.map((l) => [l.loja, l.quant, l.indicados, l.semIndicacao, l.comIndicacao, l.totalR$]),
    [totalGeral.loja, totalGeral.quant, totalGeral.indicados, totalGeral.semIndicacao, totalGeral.comIndicacao, totalGeral.totalR$],
  ];
  const planilha = XLSX.utils.aoa_to_sheet(linhasPlanilha);
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, "Resultado");
  const buffer = XLSX.write(livro, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="relatorio-seguros-${mes}.xlsx"`,
    },
  });
}
