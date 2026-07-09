"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import IndicacaoHeader from "@/components/vendedor/IndicacaoHeader";
import CapturaForm from "@/components/CapturaForm";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { formatarDataHora } from "@/lib/format";
import { lojaFromPublicMetadata, telefoneFromPublicMetadata } from "@/lib/loja";
import type { Captacao } from "@/lib/types";
import styles from "@/components/vendedor/indicacao.module.css";

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
  const loja = lojaFromPublicMetadata(user?.publicMetadata);
  const telefoneVendedor = telefoneFromPublicMetadata(user?.publicMetadata);

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
      <IndicacaoHeader loja={loja} />
      <main className="cm-wrap" style={{ maxWidth: 760 }}>
        <section className={styles.card}>
          {isLoaded && user && (
            <CapturaForm
              vendedorId={user.id}
              vendedorNome={nome}
              vendedorTelefone={telefoneVendedor}
              loja={loja}
              onCriada={(c) => setCaptacoes((atual) => [c, ...atual])}
            />
          )}
          {!isLoaded && <p className="cm-muted">Carregando...</p>}
        </section>

        <section className={styles.card} aria-labelledby="titulo-minhas">
          <h2 id="titulo-minhas" className={styles.cardTitle}>
            Minhas Indicações
          </h2>

          {carregando && <p className="cm-muted">Carregando...</p>}
          {erro && (
            <div className={`${styles.alert} ${styles.alertErr}`} role="alert">
              {erro}
            </div>
          )}

          {!carregando && !erro && captacoes.length === 0 && (
            <p className={styles.empty}>
              Você ainda não registrou nenhuma indicação.
            </p>
          )}

          {captacoes.map((c) => (
            <div key={c.id} className={styles.listItem}>
              <div>
                <div className={styles.listName}>{c.nome_cliente}</div>
                <div className={styles.listMeta}>
                  {c.telefone} · {formatarDataHora(c.created_at)}
                </div>
              </div>
              <span className={styles.placa}>{c.placa}</span>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
