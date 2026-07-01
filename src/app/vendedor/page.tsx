"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import AppHeader from "@/components/AppHeader";
import CapturaForm from "@/components/CapturaForm";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { formatarDataHora } from "@/lib/format";
import type { Captacao } from "@/lib/types";

// =========================================================================
// Area do vendedor: formulario de captacao + "minhas captacoes".
// A RLS garante que o vendedor so enxergue as proprias captacoes.
// =========================================================================

export default function VendedorPage() {
  const { isLoaded, user } = useUser();
  const [captacoes, setCaptacoes] = useState<Captacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const nome = user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? null;

  // Carrega as captacoes do vendedor logado.
  const carregar = useCallback(async () => {
    if (!user) return;
    setCarregando(true);
    setErro(null);
    try {
      const supabase = createBrowserSupabaseClient();
      const { data, error } = await supabase
        .from("captacoes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) {
        setErro("Nao foi possivel carregar suas captacoes.");
        return;
      }
      setCaptacoes((data ?? []) as Captacao[]);
    } catch {
      setErro("Falha de rede ao carregar captacoes.");
    } finally {
      setCarregando(false);
    }
  }, [user]);

  useEffect(() => {
    if (isLoaded && user) carregar();
    else if (isLoaded && !user) setCarregando(false);
  }, [isLoaded, user, carregar]);

  return (
    <div className="cm-page">
      <AppHeader papel="vendedor" />
      <main className="cm-wrap" style={{ maxWidth: 720 }}>
        <section className="cm-card">
          {isLoaded && user && (
            <CapturaForm
              vendedorId={user.id}
              vendedorNome={nome}
              onCriada={(c) => setCaptacoes((atual) => [c, ...atual])}
            />
          )}
          {!isLoaded && <p className="cm-muted">Carregando...</p>}
        </section>

        <section className="cm-card" aria-labelledby="titulo-minhas">
          <h2 id="titulo-minhas" className="cm-card-title">
            Minhas Captacoes
          </h2>

          {carregando && <p className="cm-muted">Carregando...</p>}
          {erro && (
            <div className="cm-alert cm-alert-err" role="alert">
              {erro}
            </div>
          )}

          {!carregando && !erro && captacoes.length === 0 && (
            <p className="cm-empty">
              Voce ainda nao registrou nenhuma captacao.
            </p>
          )}

          {captacoes.map((c) => (
            <div key={c.id} className="cm-list-item">
              <div>
                <div className="cm-list-name">{c.nome_cliente}</div>
                <div className="cm-list-meta">
                  {c.telefone} · {formatarDataHora(c.created_at)}
                </div>
              </div>
              <span className="cm-placa">{c.placa}</span>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
