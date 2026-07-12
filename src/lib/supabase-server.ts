import { auth } from "@clerk/nextjs/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// =========================================================================
// Cliente Supabase para o SERVIDOR (Server Components / Route Handlers).
//
// Usado no painel do gestor, que e renderizado no servidor. Em vez de
// window.Clerk, usamos auth().getToken() para obter o token de sessao do
// Clerk e injeta-lo no Supabase. A RLS continua valendo: o gestor so ve
// tudo porque o claim `app_role` = 'gestor'.
// =========================================================================

export async function createServerSupabaseClient(): Promise<SupabaseClient> {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Variaveis NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY sao obrigatorias."
    );
  }

  const { getToken } = await auth();

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    accessToken: async () => (await getToken()) ?? null,
  });
}
