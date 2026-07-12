import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import GestorClient from "@/components/GestorClient";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { roleFromClaims } from "@/lib/roles";
import type { Captacao } from "@/lib/types";

// =========================================================================
// Painel do gestor (renderizado no servidor).
// Busca TODAS as captacoes (a RLS libera tudo porque app_role = 'gestor') e
// entrega ao componente cliente, que cuida da busca e da exportacao CSV.
// =========================================================================

export default async function GestorPage() {
  const { userId, sessionClaims } = await auth();
  if (!userId) redirect("/sign-in");

  // Defesa em profundidade: alem do middleware, validamos o papel aqui.
  if (roleFromClaims(sessionClaims) !== "gestor") redirect("/vendedor");

  let captacoes: Captacao[] = [];
  let erro: string | null = null;

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("captacoes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) erro = "Nao foi possivel carregar as captacoes.";
    else captacoes = (data ?? []) as Captacao[];
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
          <GestorClient captacoes={captacoes} />
        )}
      </main>
    </div>
  );
}
