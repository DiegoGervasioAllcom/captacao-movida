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

    const [
      { data, count, error },
      { count: countTotal },
      { count: countHoje },
      { data: dadosVendedores },
    ] = await Promise.all([
      query.order("created_at", { ascending: false }).range(de, de + TAMANHO_PAGINA - 1),
      supabase.from("captacoes").select("id", { count: "exact", head: true }),
      supabase
        .from("captacoes")
        .select("id", { count: "exact", head: true })
        .gte("created_at", inicioDoDiaBrasilISO()),
      supabase.from("captacoes").select("vendedor_id"),
    ]);

    if (error) {
      erro = "Nao foi possivel carregar as captacoes.";
    } else {
      captacoes = (data ?? []) as Captacao[];
      totalRegistros = count ?? 0;
      totalCaptacoes = countTotal ?? 0;
      captacoesHoje = countHoje ?? 0;
      vendedoresAtivos = new Set(
        (dadosVendedores ?? []).map((v) => v.vendedor_id)
      ).size;
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
          />
        )}
      </main>
    </div>
  );
}
