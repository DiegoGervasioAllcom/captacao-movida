import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { roleFromClaims } from "@/lib/roles";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { Captacao } from "@/lib/types";

// =========================================================================
// Devolve TODAS as captacoes que batem com a busca (sem paginacao) - usada
// so pelo botao "Exportar CSV" do painel do gestor. A tabela em si (ver
// gestor/page.tsx) pagina no banco, entao o componente cliente so tem a
// pagina atual em memoria; pra exportar tudo que bate com o filtro, precisa
// dessa consulta separada, sem `.range()`.
// =========================================================================

export async function GET(req: NextRequest) {
  const { sessionClaims } = await auth();
  if (roleFromClaims(sessionClaims) !== "gestor") {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 403 });
  }

  const busca = (req.nextUrl.searchParams.get("busca") ?? "").trim();

  const supabase = await createServerSupabaseClient();
  let query = supabase.from("captacoes").select("*");
  if (busca) {
    const termo = `%${busca}%`;
    query = query.or(
      `nome_cliente.ilike.${termo},placa.ilike.${termo},vendedor_nome.ilike.${termo},telefone.ilike.${termo}`
    );
  }
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json(
      { error: "Falha ao consultar captacoes." },
      { status: 500 }
    );
  }

  return NextResponse.json({ captacoes: (data ?? []) as Captacao[] });
}
