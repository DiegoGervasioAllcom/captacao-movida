"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// =========================================================================
// Cliente Supabase para o NAVEGADOR (browser).
//
// O Supabase e usado APENAS como banco de dados. A autenticacao e do Clerk.
// Integramos os dois via "third-party auth" nativo do Supabase: o token de
// sessao do Clerk e injetado em cada requisicao atraves de `accessToken`.
//
// As policies de RLS no banco leem:
//   auth.jwt()->>'sub'      -> id do usuario no Clerk (vendedor_id)
//   auth.jwt()->>'app_role' -> papel da aplicacao (vendedor | gestor)
// (o claim `role` pertence ao Supabase e vale sempre "authenticated")
//
// IMPORTANTE: nunca coloque URL/chave reais aqui. Tudo vem de variaveis de
// ambiente (prefixo NEXT_PUBLIC_ porque rodam no navegador).
// =========================================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// A chave "anon" foi renomeada pelo Supabase para "publishable key".
// Mantemos o nome NEXT_PUBLIC_SUPABASE_ANON_KEY por compatibilidade.
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Falha cedo e com mensagem clara durante o desenvolvimento.
  throw new Error(
    "Variaveis NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY sao obrigatorias. " +
      "Configure-as no arquivo .env.local (veja .env.example)."
  );
}

/**
 * Cria um cliente Supabase ja configurado para enviar o token do Clerk.
 *
 * Usa `window.Clerk.session.getToken()` (exatamente como na integracao
 * recomendada). Se nao houver sessao, retorna null e o Supabase trata a
 * requisicao como anonima (bloqueada pela RLS).
 */
export function createBrowserSupabaseClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    accessToken: async () =>
      (await window.Clerk?.session?.getToken()) ?? null,
  });
}

// Tipagem minima de window.Clerk para uso no navegador.
declare global {
  interface Window {
    Clerk?: {
      session?: {
        getToken: () => Promise<string | null>;
      };
    };
  }
}
