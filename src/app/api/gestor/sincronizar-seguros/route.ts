import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { roleFromClaims } from "@/lib/roles";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { lojaOficial } from "@/lib/loja";
import { normalizarPlaca } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Periodo = "dia" | "mes";

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

function respostaJson(
  corpo: Record<string, unknown>,
  status = 200
): NextResponse {
  return NextResponse.json(corpo, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
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

function hojeBrasil(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function limitesDoPeriodo(periodo: Periodo): {
  inicio: string;
  fim: string;
} {
  const hoje = hojeBrasil();
  const [ano, mes, dia] = hoje.split("-").map(Number);

  if (periodo === "dia") {
    const fim = new Date(Date.UTC(ano, mes - 1, dia + 1))
      .toISOString()
      .slice(0, 10);
    return { inicio: hoje, fim };
  }

  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fim = new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10);
  return { inicio, fim };
}

export async function POST(req: NextRequest) {
  const { sessionClaims } = await auth();
  if (roleFromClaims(sessionClaims) !== "gestor") {
    return respostaJson({ error: "Nao autorizado." }, 403);
  }

  const periodoParam = req.nextUrl.searchParams.get("periodo");
  if (periodoParam !== "dia" && periodoParam !== "mes") {
    return respostaJson({ error: "Periodo invalido." }, 400);
  }
  const periodo: Periodo = periodoParam;
  const { inicio, fim } = limitesDoPeriodo(periodo);

  const segurosUrl = process.env.SEGUROS_SHEETS_URL;
  const segurosSecret = process.env.SEGUROS_READ_SECRET;
  if (!segurosUrl || !segurosSecret) {
    return respostaJson({ error: "Configuracao de seguros indisponivel." }, 500);
  }

  try {
    const url = new URL(segurosUrl);
    url.searchParams.set("secret", segurosSecret);
    const respostaSheets = await fetch(url, { cache: "no-store" });
    if (!respostaSheets.ok) {
      return respostaJson({ error: "Falha ao ler as planilhas de seguro." }, 502);
    }

    const corpoSheets = (await respostaSheets.json()) as {
      ok: boolean;
      registros?: RegistroSheet[];
    };
    if (!corpoSheets.ok || !Array.isArray(corpoSheets.registros)) {
      return respostaJson(
        { error: "Resposta invalida das planilhas de seguro." },
        502
      );
    }

    // Mantem todos os status do periodo, nao apenas "Emitida": se uma
    // transmissao tiver sido cancelada/recusada depois, o banco precisa
    // refletir a mudanca para a contagem nao continuar desatualizada.
    const porPlaca = new Map<
      string,
      {
        placa: string;
        loja: string | null;
        obs: string | null;
        data_venda: string;
        status_venda: string | null;
        premio_liquido: number | null;
        seguradora: string | null;
        motivo: string | null;
        updated_at: string;
      }
    >();
    const atualizadoEm = new Date().toISOString();

    for (const registro of corpoSheets.registros) {
      const placa = registro.placa ? normalizarPlaca(registro.placa) : "";
      const dataVenda = parseDataVenda(registro.dataVenda);
      if (!placa || !dataVenda || dataVenda < inicio || dataVenda >= fim) {
        continue;
      }
      porPlaca.set(placa, {
        placa,
        loja: lojaOficial(registro.loja) ?? registro.loja ?? null,
        obs: registro.obs || null,
        data_venda: dataVenda,
        status_venda: registro.statusVenda
          ? String(registro.statusVenda).trim()
          : null,
        premio_liquido: parsePremioLiquido(registro.premioLiquido),
        seguradora: registro.seguradora || null,
        motivo: registro.motivo || null,
        updated_at: atualizadoEm,
      });
    }

    const supabase = await createServerSupabaseClient();
    const linhas = Array.from(porPlaca.values());
    if (linhas.length > 0) {
      const { error: erroUpsert } = await supabase
        .from("seguros_indicacao_movida")
        .upsert(linhas, { onConflict: "placa" });
      if (erroUpsert) {
        return respostaJson({ error: "Falha ao atualizar as transmissoes." }, 500);
      }
    }

    const { count, error: erroContagem } = await supabase
      .from("seguros_indicacao_movida")
      .select("id", { count: "exact", head: true })
      .gte("data_venda", inicio)
      .lt("data_venda", fim);
    if (erroContagem) {
      return respostaJson(
        { error: "Falha ao consultar as transmissoes atualizadas." },
        500
      );
    }

    return respostaJson({ periodo, total: count ?? 0 });
  } catch {
    return respostaJson({ error: "Falha ao sincronizar as transmissoes." }, 500);
  }
}
