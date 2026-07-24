import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { roleFromClaims } from "@/lib/roles";
import {
  ErroSincronizacaoSeguros,
  sincronizarSegurosDasPlanilhas,
} from "@/lib/sincronizar-seguros";

export const dynamic = "force-dynamic";

type Periodo = "dia" | "mes";

function respostaJson(
  corpo: Record<string, unknown>,
  status = 200
): NextResponse {
  return NextResponse.json(corpo, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
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

  return {
    inicio: `${ano}-${String(mes).padStart(2, "0")}-01`,
    fim: new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10),
  };
}

export async function POST(req: NextRequest) {
  const { sessionClaims } = await auth();
  if (roleFromClaims(sessionClaims) !== "gestor") {
    return respostaJson({ error: "Nao autorizado." }, 403);
  }

  const periodo = req.nextUrl.searchParams.get("periodo");
  if (periodo !== "dia" && periodo !== "mes") {
    return respostaJson({ error: "Periodo invalido." }, 400);
  }

  try {
    // Mesma sincronizacao usada antes de gerar o relatorio, sem criar arquivo.
    const supabase = await sincronizarSegurosDasPlanilhas();
    const { inicio, fim } = limitesDoPeriodo(periodo);
    const { count, error } = await supabase
      .from("seguros_indicacao_movida")
      .select("id", { count: "exact", head: true })
      .gte("data_venda", inicio)
      .lt("data_venda", fim);

    if (error) {
      return respostaJson(
        { error: "Falha ao consultar as transmissoes atualizadas." },
        500
      );
    }
    return respostaJson({ periodo, total: count ?? 0 });
  } catch (error) {
    if (error instanceof ErroSincronizacaoSeguros) {
      return respostaJson({ error: error.message }, error.status);
    }
    return respostaJson({ error: "Falha ao sincronizar as transmissoes." }, 500);
  }
}
