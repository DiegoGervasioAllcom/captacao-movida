import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import GestorClient from "@/components/GestorClient";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { roleFromClaims } from "@/lib/roles";
import type { Captacao } from "@/lib/types";

// =========================================================================
// Painel do gestor (renderizado no servidor).
// A tabela pagina no banco (a RLS libera tudo porque app_role = 'gestor'):
// cada troca de pagina/busca e uma navegacao normal do Next (searchParams
// `pagina`/`busca` na URL), que re-executa esta Server Component com uma
// nova consulta `.range()` + `.or(ilike)`. As metricas do topo (total,
// hoje, vendedores ativos) sao sobre a base INTEIRA, nao so a pagina atual
// nem filtradas pela busca - por isso sao consultas a parte.
// =========================================================================

const TAMANHO_PAGINA = 25;

/** Meia-noite de "hoje" no fuso do Brasil (fixo em -03:00, sem horario de verao desde 2019), como ISO p/ comparar com `timestamptz`. */
function inicioDoDiaBrasilISO(): string {
  const hojeBr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return `${hojeBr}T00:00:00-03:00`;
}

/** Data de hoje em Sao Paulo no formato da coluna `date` do Supabase. */
function hojeBrasil(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Soma dias a uma data ISO sem depender do fuso do servidor. */
function somarDias(dataIso: string, dias: number): string {
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + dias))
    .toISOString()
    .slice(0, 10);
}

/** Limites exclusivos do mes atual no fuso de Sao Paulo, para coluna `date`. */
function limitesMesAtualBrasil(dataHoje: string): {
  inicio: string;
  fim: string;
} {
  const [ano, mes] = dataHoje.split("-").map(Number);
  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fim = new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10);
  return { inicio, fim };
}

export default async function GestorPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string; busca?: string }>;
}) {
  const { userId, sessionClaims } = await auth();
  if (!userId) redirect("/sign-in");

  // Defesa em profundidade: alem do middleware, validamos o papel aqui.
  if (roleFromClaims(sessionClaims) !== "gestor") redirect("/vendedor");

  const params = await searchParams;
  const pagina = Math.max(1, Number(params.pagina) || 1);
  const busca = (params.busca ?? "").trim();

  let captacoes: Captacao[] = [];
  let totalRegistros = 0;
  let totalCaptacoes = 0;
  let captacoesHoje = 0;
  let vendedoresAtivos = 0;
  let transmissoesEmitidasHoje = 0;
  let transmissoesEmitidasMes = 0;
  let erro: string | null = null;

  try {
    const supabase = await createServerSupabaseClient();

    let query = supabase.from("captacoes").select("*", { count: "exact" });
    if (busca) {
      const termo = `%${busca}%`;
      query = query.or(
        `nome_cliente.ilike.${termo},placa.ilike.${termo},vendedor_nome.ilike.${termo},telefone.ilike.${termo}`
      );
    }
    const de = (pagina - 1) * TAMANHO_PAGINA;
    const dataHoje = hojeBrasil();
    const amanha = somarDias(dataHoje, 1);
    const mesAtual = limitesMesAtualBrasil(dataHoje);

    const [
      { data, count, error },
      { count: countTotal, error: erroTotal },
      { count: countHoje, error: erroHoje },
      { data: dadosVendedores, error: erroVendedores },
      { count: countTransmissoesHoje, error: erroTransmissoesHoje },
      { count: countTransmissoesMes, error: erroTransmissoesMes },
    ] = await Promise.all([
      query.order("created_at", { ascending: false }).range(de, de + TAMANHO_PAGINA - 1),
      supabase.from("captacoes").select("id", { count: "exact", head: true }),
      supabase
        .from("captacoes")
        .select("id", { count: "exact", head: true })
        .gte("created_at", inicioDoDiaBrasilISO()),
      supabase.from("captacoes").select("vendedor_id"),
      supabase
        .from("seguros_indicacao_movida")
        .select("id", { count: "exact", head: true })
        .eq("status_venda", "Emitida")
        .gte("data_venda", dataHoje)
        .lt("data_venda", amanha),
      supabase
        .from("seguros_indicacao_movida")
        .select("id", { count: "exact", head: true })
        .eq("status_venda", "Emitida")
        .gte("data_venda", mesAtual.inicio)
        .lt("data_venda", mesAtual.fim),
    ]);

    if (
      error ||
      erroTotal ||
      erroHoje ||
      erroVendedores ||
      erroTransmissoesHoje ||
      erroTransmissoesMes
    ) {
      erro = "Nao foi possivel carregar as captacoes.";
    } else {
      captacoes = (data ?? []) as Captacao[];
      totalRegistros = count ?? 0;
      totalCaptacoes = countTotal ?? 0;
      captacoesHoje = countHoje ?? 0;
      vendedoresAtivos = new Set(
        (dadosVendedores ?? []).map((v) => v.vendedor_id)
      ).size;
      transmissoesEmitidasHoje = countTransmissoesHoje ?? 0;
      transmissoesEmitidasMes = countTransmissoesMes ?? 0;
    }
  } catch {
    erro = "Falha ao conectar ao banco de dados.";
  }

  return (
    <div className="cm-page">
      <AppHeader papel="gestor" />
      <main className="cm-wrap">
        <h2 className="cm-card-title" style={{ fontSize: 28 }}>
          Visao Geral
        </h2>
        <p className="cm-card-sub">
          Centro de comando de captacoes. Monitore os leads em tempo real.
        </p>

        {erro ? (
          <div className="cm-alert cm-alert-err" role="alert">
            {erro}
          </div>
        ) : (
          <GestorClient
            captacoes={captacoes}
            busca={busca}
            pagina={pagina}
            tamanhoPagina={TAMANHO_PAGINA}
            totalRegistros={totalRegistros}
            totalCaptacoes={totalCaptacoes}
            captacoesHoje={captacoesHoje}
            vendedoresAtivos={vendedoresAtivos}
            transmissoesEmitidasHoje={transmissoesEmitidasHoje}
            transmissoesEmitidasMes={transmissoesEmitidasMes}
          />
        )}
      </main>
    </div>
  );
}
