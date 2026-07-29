import type ExcelJS from "exceljs";

// =========================================================================
// Helpers de estilo compartilhados pelos relatorios .xlsx do painel do
// gestor (api/gestor/relatorio-seguros e api/gestor/relatorio-desempenho).
//
// As cores de cinza sao a aproximacao RGB dos tons de tema do Excel
// ("Branco, Fundo 1, Mais Escuro 15/25/35%") usados na planilha modelo que o
// time de seguros enviou; o roxo da faixa "SN MOVIDA" e a cor exata (RGB
// puro) do arquivo original.
// =========================================================================

export const CINZA_TITULO = "FFD9D9D9";
export const CINZA_CABECALHO = "FFBFBFBF";
export const CINZA_TOTAL = "FFA6A6A6";
export const CINZA_SUBTOTAL = "FFEDEDED";
export const ROXO_SN_MOVIDA = "FF7030A0";

/** Cores de "semaforo" (mesmo esquema dos estilos nativos Bom/Ruim/Neutro do Excel). */
export const VERDE = { fill: "FFC6EFCE", fontColor: "FF006100" };
export const VERMELHO = { fill: "FFFFC7CE", fontColor: "FF9C0006" };
export const AMARELO = { fill: "FFFFEB9C", fontColor: "FF9C6500" };
export const AZUL = { fill: "FFDDEBF7", fontColor: "FF1F4E79" };

export const NOMES_MES = [
  "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
  "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
];

export function estilizarCelula(
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

/** Escreve a linha de cabecalho de uma aba a partir da coluna `colInicial`. */
export function escreverCabecalho(
  ws: ExcelJS.Worksheet,
  linha: number,
  titulos: string[],
  opts: { colInicial?: number; size?: number } = {}
) {
  const colInicial = opts.colInicial ?? 1;
  const r = ws.getRow(linha);
  r.height = 30;
  titulos.forEach((texto, i) => {
    const cel = r.getCell(colInicial + i);
    cel.value = texto;
    estilizarCelula(cel, {
      bold: true,
      fill: CINZA_CABECALHO,
      align: "center",
      wrap: true,
      size: opts.size ?? 10,
      border: "thin",
    });
  });
}

/** "YYYY-MM-DD" (formato que o Supabase devolve p/ coluna `date`) -> "dd/MM/yyyy". */
export function formatarDataBr(isoDate: string): string {
  const [yyyy, mm, dd] = isoDate.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

/** "YYYY-MM" do mes atual (default dos seletores de relatorio). */
export function mesAtualPadrao(): string {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

/** [inicio, fimExclusivo] em "YYYY-MM-DD" para o mes "YYYY-MM". */
export function limitesDoMes(mes: string): { inicio: string; fim: string } {
  const [anoStr, mesStr] = mes.split("-");
  const ano = Number(anoStr);
  const mesNum = Number(mesStr);
  const inicio = new Date(Date.UTC(ano, mesNum - 1, 1));
  const fim = new Date(Date.UTC(ano, mesNum, 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { inicio: fmt(inicio), fim: fmt(fim) };
}
