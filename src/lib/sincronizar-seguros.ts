import { createServerSupabaseClient } from "@/lib/supabase-server";
import { lojaOficial } from "@/lib/loja";
import { normalizarPlaca } from "@/lib/validation";

interface RegistroSheet {
  placa?: string;
  loja?: string;
  obs?: string;
  dataVenda?: string;
  /** Status da VENDA do seguro: Emitida | Cancelada | Recusada | Pendente. */
  statusVenda?: string;
  /**
   * Coluna J STATUS do contrato A-J: o andamento da NEGOCIACAO ("Sem contato",
   * "Em negociação", "Venda transmitida"...) - outra coluna, outro significado.
   * So vem depois de republicar o Apps Script com a versao que a expoe; com uma
   * implantacao antiga fica undefined e o relatorio de desempenho mostra tudo
   * como "Sem status".
   */
  statusNegociacao?: string;
  premioLiquido?: string | number;
  seguradora?: string;
  motivo?: string;
}

/**
 * Quantas linhas por chamada de upsert. Desde que o `doGet` passou a devolver
 * TODA linha com placa (e nao so as com venda de seguro - era preciso pra ter o
 * `status_negociacao` dos leads sem venda), esse payload e da ordem do total de
 * leads das 3 planilhas: grande demais para um request unico.
 */
const TAMANHO_LOTE = 500;

export class ErroSincronizacaoSeguros extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

function parseDataVenda(bruto: string | undefined): string | null {
  if (!bruto) return null;
  const valor = String(bruto).trim();
  if (!valor) return null;

  const iso = valor.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (iso) {
    const [, ano, mes, dia] = iso;
    if (Number(ano) < 2000 || Number(ano) > 2100) return null;
    return `${ano}-${mes}-${dia}`;
  }

  const digitos = valor.replace(/\D/g, "");
  let dia: string;
  let mes: string;
  let ano: string;
  if (digitos.length === 8) {
    dia = digitos.slice(0, 2);
    mes = digitos.slice(2, 4);
    ano = digitos.slice(4, 8);
  } else if (digitos.length === 6) {
    dia = digitos.slice(0, 2);
    mes = digitos.slice(2, 4);
    ano = `20${digitos.slice(4, 6)}`;
  } else {
    return null;
  }

  const diaNumero = Number(dia);
  const mesNumero = Number(mes);
  if (
    Number(ano) < 2000 ||
    Number(ano) > 2100 ||
    mesNumero < 1 ||
    mesNumero > 12 ||
    diaNumero < 1 ||
    diaNumero > 31
  ) {
    return null;
  }
  return `${ano}-${mes}-${dia}`;
}

function parsePremioLiquido(
  bruto: string | number | undefined
): number | null {
  if (bruto === undefined || bruto === null || bruto === "") return null;
  if (typeof bruto === "number") {
    return Number.isFinite(bruto) ? bruto : null;
  }
  const limpo = bruto
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : null;
}

/**
 * Reutiliza a mesma sincronizacao do relatorio mensal: le o doGet ja
 * publicado, normaliza todas as linhas e faz upsert por placa no Supabase.
 */
export async function sincronizarSegurosDasPlanilhas() {
  const segurosUrl = process.env.SEGUROS_SHEETS_URL;
  const segurosSecret = process.env.SEGUROS_READ_SECRET;
  if (!segurosUrl || !segurosSecret) {
    throw new ErroSincronizacaoSeguros(
      "Configuracao de seguros indisponivel.",
      500
    );
  }

  const url = new URL(segurosUrl);
  url.searchParams.set("secret", segurosSecret);
  const respostaSheets = await fetch(url, { cache: "no-store" });
  if (!respostaSheets.ok) {
    throw new ErroSincronizacaoSeguros(
      "Falha ao ler as planilhas de seguro.",
      502
    );
  }

  const corpoSheets = (await respostaSheets.json()) as {
    ok: boolean;
    registros?: RegistroSheet[];
  };
  if (!corpoSheets.ok || !Array.isArray(corpoSheets.registros)) {
    throw new ErroSincronizacaoSeguros(
      "Resposta invalida das planilhas de seguro.",
      502
    );
  }

  const atualizadoEm = new Date().toISOString();
  const porPlaca = new Map<
    string,
    {
      placa: string;
      loja: string | null;
      obs: string | null;
      data_venda: string | null;
      status_venda: string | null;
      status_negociacao: string | null;
      premio_liquido: number | null;
      seguradora: string | null;
      motivo: string | null;
      updated_at: string;
    }
  >();

  for (const registro of corpoSheets.registros) {
    const placa = registro.placa ? normalizarPlaca(registro.placa) : "";
    if (!placa) continue;
    porPlaca.set(placa, {
      placa,
      loja: lojaOficial(registro.loja) ?? registro.loja ?? null,
      obs: registro.obs || null,
      data_venda: parseDataVenda(registro.dataVenda),
      status_venda: registro.statusVenda
        ? String(registro.statusVenda).trim()
        : null,
      status_negociacao: registro.statusNegociacao
        ? String(registro.statusNegociacao).trim() || null
        : null,
      premio_liquido: parsePremioLiquido(registro.premioLiquido),
      seguradora: registro.seguradora || null,
      motivo: registro.motivo || null,
      updated_at: atualizadoEm,
    });
  }

  const supabase = await createServerSupabaseClient();
  const linhas = Array.from(porPlaca.values());
  for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
    const { error } = await supabase
      .from("seguros_indicacao_movida")
      .upsert(linhas.slice(i, i + TAMANHO_LOTE), { onConflict: "placa" });
    if (error) {
      throw new ErroSincronizacaoSeguros(
        "Falha ao sincronizar seguros no banco.",
        500
      );
    }
  }

  return supabase;
}
