"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatarDataHora } from "@/lib/format";
import type { Captacao } from "@/lib/types";

// =========================================================================
// Componente cliente do painel do gestor: metricas, busca, paginacao e
// exportacao CSV.
//
// A busca e a paginacao acontecem no SERVIDOR (ver src/app/gestor/page.tsx):
// `captacoes` aqui e so a pagina atual, ja filtrada pelo banco. Digitar na
// busca (com debounce) ou clicar em Anterior/Proxima navega pra uma nova
// URL (`?busca=...&pagina=...`), que re-renderiza o Server Component com a
// consulta certa - por isso nao ha mais filtro em memoria aqui.
// =========================================================================

/** Escapa um valor para uma celula CSV (aspas + virgula + quebra de linha). */
function celulaCsv(valor: string): string {
  const v = valor ?? "";
  if (/[";\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

/** Gera e baixa um arquivo CSV com as captacoes (separador ";" p/ Excel BR). */
function baixarCsv(linhas: Captacao[]) {
  const cabecalho = ["Cliente", "Telefone", "Placa", "Vendedor", "Data/Hora"];
  const corpo = linhas.map((c) =>
    [
      celulaCsv(c.nome_cliente),
      celulaCsv(c.telefone),
      celulaCsv(c.placa),
      celulaCsv(c.vendedor_nome ?? ""),
      celulaCsv(formatarDataHora(c.created_at)),
    ].join(";")
  );
  // BOM (﻿) garante acentuacao correta ao abrir no Excel.
  const conteudo = "﻿" + [cabecalho.join(";"), ...corpo].join("\n");
  const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `captacoes-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** "YYYY-MM" do mes atual, valor default do seletor de relatorio de seguros. */
function mesAtual(): string {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

export default function GestorClient({
  captacoes,
  busca,
  pagina,
  tamanhoPagina,
  totalRegistros,
  totalCaptacoes,
  captacoesHoje,
  vendedoresAtivos,
  transmissoesEmitidasHoje,
  transmissoesEmitidasMes,
}: {
  captacoes: Captacao[];
  busca: string;
  pagina: number;
  tamanhoPagina: number;
  totalRegistros: number;
  totalCaptacoes: number;
  captacoesHoje: number;
  vendedoresAtivos: number;
  transmissoesEmitidasHoje: number;
  transmissoesEmitidasMes: number;
}) {
  const router = useRouter();
  const [textoBusca, setTextoBusca] = useState(busca);
  const [exportando, setExportando] = useState(false);
  const [erroExportacao, setErroExportacao] = useState("");

  const [mesRelatorio, setMesRelatorio] = useState(mesAtual);
  const [baixandoRelatorio, setBaixandoRelatorio] = useState(false);
  const [erroRelatorio, setErroRelatorio] = useState("");
  const [emitidasHoje, setEmitidasHoje] = useState(transmissoesEmitidasHoje);
  const [emitidasMes, setEmitidasMes] = useState(transmissoesEmitidasMes);
  const [atualizandoPeriodo, setAtualizandoPeriodo] = useState<
    "dia" | "mes" | null
  >(null);
  const [erroMetricas, setErroMetricas] = useState("");

  // Mantem o campo em sincronia se a busca mudar por fora (ex.: botao voltar do navegador).
  useEffect(() => setTextoBusca(busca), [busca]);
  useEffect(() => setEmitidasHoje(transmissoesEmitidasHoje), [
    transmissoesEmitidasHoje,
  ]);
  useEffect(() => setEmitidasMes(transmissoesEmitidasMes), [
    transmissoesEmitidasMes,
  ]);

  // Debounce: so navega 400ms depois de parar de digitar, e reseta pra pagina 1.
  useEffect(() => {
    if (textoBusca === busca) return;
    const timer = setTimeout(() => {
      const qs = new URLSearchParams();
      if (textoBusca) qs.set("busca", textoBusca);
      qs.set("pagina", "1");
      router.push(`/gestor?${qs.toString()}`);
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textoBusca]);

  function irParaPagina(novaPagina: number) {
    const qs = new URLSearchParams();
    if (busca) qs.set("busca", busca);
    qs.set("pagina", String(novaPagina));
    router.push(`/gestor?${qs.toString()}`);
  }

  // Exporta TODAS as captacoes que batem com a busca atual (nao so a pagina
  // exibida) - por isso busca de novo no servidor em vez de usar `captacoes`.
  async function exportarCsv() {
    setExportando(true);
    setErroExportacao("");
    try {
      const qs = new URLSearchParams();
      if (busca) qs.set("busca", busca);
      const resposta = await fetch(`/api/gestor/captacoes-export?${qs.toString()}`);
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => null);
        throw new Error(corpo?.error || "Falha ao exportar as captacoes.");
      }
      const corpo = (await resposta.json()) as { captacoes: Captacao[] };
      baixarCsv(corpo.captacoes);
    } catch (err) {
      setErroExportacao(
        err instanceof Error ? err.message : "Falha ao exportar as captacoes."
      );
    } finally {
      setExportando(false);
    }
  }

  // Baixa o .xlsx do relatorio de seguros do mes escolhido (cruza
  // `seguros_indicacao_movida` com `captacoes` no servidor - ver
  // src/app/api/gestor/relatorio-seguros).
  async function baixarRelatorioSeguros() {
    setBaixandoRelatorio(true);
    setErroRelatorio("");
    try {
      const resposta = await fetch(
        `/api/gestor/relatorio-seguros?mes=${mesRelatorio}`
      );
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => null);
        throw new Error(corpo?.error || "Falha ao gerar o relatorio.");
      }
      const blob = await resposta.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-seguros-${mesRelatorio}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      // A rota sincroniza primeiro as 3 planilhas no Supabase. Atualiza a
      // Server Component para as metricas refletirem os dados recem-gravados.
      router.refresh();
    } catch (err) {
      setErroRelatorio(
        err instanceof Error ? err.message : "Falha ao gerar o relatorio."
      );
    } finally {
      setBaixandoRelatorio(false);
    }
  }

  async function atualizarTransmissoes(periodo: "dia" | "mes") {
    setAtualizandoPeriodo(periodo);
    setErroMetricas("");
    try {
      const resposta = await fetch(
        `/api/gestor/sincronizar-seguros?periodo=${periodo}`,
        { method: "POST", cache: "no-store" }
      );
      const corpo = (await resposta.json().catch(() => null)) as {
        total?: number;
        error?: string;
      } | null;
      if (!resposta.ok || typeof corpo?.total !== "number") {
        throw new Error(corpo?.error || "Falha ao atualizar as transmissões.");
      }

      if (periodo === "dia") {
        setEmitidasHoje(corpo.total);
      } else {
        setEmitidasMes(corpo.total);
      }
      router.refresh();
    } catch (err) {
      setErroMetricas(
        err instanceof Error
          ? err.message
          : "Falha ao atualizar as transmissões."
      );
    } finally {
      setAtualizandoPeriodo(null);
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(totalRegistros / tamanhoPagina));

  return (
    <>
      <div className="cm-stats">
        <div className="cm-stat">
          <div className="cm-stat-label">Total de captacoes</div>
          <div className="cm-stat-value">{totalCaptacoes}</div>
        </div>
        <div className="cm-stat">
          <div className="cm-stat-label">Captacoes de hoje</div>
          <div className="cm-stat-value">{captacoesHoje}</div>
        </div>
        <div className="cm-stat">
          <div className="cm-stat-label">Vendedores ativos</div>
          <div className="cm-stat-value">{vendedoresAtivos}</div>
        </div>
      </div>

      <div className="cm-stats cm-stats-secondary" aria-label="Transmissões emitidas">
        <div className="cm-stat">
          <div className="cm-stat-label">Transmissões emitidas hoje</div>
          <div className="cm-stat-actions">
            <div className="cm-stat-value" aria-live="polite">
              {emitidasHoje}
            </div>
            <button
              type="button"
              className="cm-btn cm-btn-ghost cm-btn-sm"
              onClick={() => atualizarTransmissoes("dia")}
              disabled={atualizandoPeriodo !== null}
            >
              {atualizandoPeriodo === "dia" ? "Atualizando..." : "↻ Atualizar"}
            </button>
          </div>
        </div>
        <div className="cm-stat">
          <div className="cm-stat-label">Transmissões emitidas no mês</div>
          <div className="cm-stat-actions">
            <div className="cm-stat-value" aria-live="polite">
              {emitidasMes}
            </div>
            <button
              type="button"
              className="cm-btn cm-btn-ghost cm-btn-sm"
              onClick={() => atualizarTransmissoes("mes")}
              disabled={atualizandoPeriodo !== null}
            >
              {atualizandoPeriodo === "mes" ? "Atualizando..." : "↻ Atualizar"}
            </button>
          </div>
        </div>
      </div>
      <p className="cm-stats-note">
        Atualize diretamente pelas planilhas, sem gerar o relatório.
      </p>
      {erroMetricas && (
        <p role="alert" className="cm-alert cm-alert-err">
          {erroMetricas}
        </p>
      )}

      <section className="cm-card">
        <div className="cm-toolbar">
          <div className="cm-row">
            <h2 className="cm-card-title" style={{ margin: 0 }}>
              Ultimas Captacoes
            </h2>
            <span className="cm-live">ao vivo</span>
          </div>
          <div className="cm-row">
            <label htmlFor="busca" className="cm-sr-only">
              Filtrar por nome, placa ou vendedor
            </label>
            <input
              id="busca"
              className="cm-search"
              type="search"
              placeholder="Filtrar por nome, placa ou vendedor..."
              value={textoBusca}
              onChange={(e) => setTextoBusca(e.target.value)}
            />
            <button
              type="button"
              className="cm-btn cm-btn-ghost cm-btn-sm"
              onClick={exportarCsv}
              disabled={exportando || totalRegistros === 0}
            >
              {exportando ? "Exportando..." : "⭳ Exportar CSV"}
            </button>
          </div>
        </div>

        {erroExportacao && (
          <p role="alert" className="cm-alert cm-alert-err">
            {erroExportacao}
          </p>
        )}

        {captacoes.length === 0 ? (
          <p className="cm-empty">Nenhuma captacao encontrada.</p>
        ) : (
          <div className="cm-table-scroll">
            <table className="cm-table">
              <thead>
                <tr>
                  <th scope="col">Cliente</th>
                  <th scope="col">Telefone</th>
                  <th scope="col">Placa</th>
                  <th scope="col">Vendedor</th>
                  <th scope="col">Data/Hora</th>
                </tr>
              </thead>
              <tbody>
                {captacoes.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nome_cliente}</td>
                    <td>{c.telefone}</td>
                    <td>
                      <span className="cm-placa">{c.placa}</span>
                    </td>
                    <td>{c.vendedor_nome ?? "—"}</td>
                    <td>{formatarDataHora(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="cm-row" style={{ marginTop: 16, justifyContent: "space-between" }}>
          <p className="cm-muted" style={{ fontSize: 13, margin: 0 }}>
            Pagina {pagina} de {totalPaginas} — {totalRegistros} captacoes no total
          </p>
          <div className="cm-row">
            <button
              type="button"
              className="cm-btn cm-btn-ghost cm-btn-sm"
              onClick={() => irParaPagina(pagina - 1)}
              disabled={pagina <= 1}
            >
              ← Anterior
            </button>
            <button
              type="button"
              className="cm-btn cm-btn-ghost cm-btn-sm"
              onClick={() => irParaPagina(pagina + 1)}
              disabled={pagina >= totalPaginas}
            >
              Proxima →
            </button>
          </div>
        </div>
      </section>

      <section className="cm-card">
        <h2 className="cm-card-title">Relatorio de seguros por loja</h2>
        <p className="cm-muted" style={{ fontSize: 13 }}>
          Cruza os seguros fechados (planilhas do time de seguros) com as
          indicacoes dos vendedores, por loja, no mes escolhido.
        </p>
        <div className="cm-row">
          <label htmlFor="mes-relatorio-seguros" className="cm-sr-only">
            Mes do relatorio
          </label>
          <input
            id="mes-relatorio-seguros"
            className="cm-search"
            type="month"
            value={mesRelatorio}
            onChange={(e) => setMesRelatorio(e.target.value)}
          />
          <button
            type="button"
            className="cm-btn cm-btn-ghost cm-btn-sm"
            onClick={baixarRelatorioSeguros}
            disabled={baixandoRelatorio}
          >
            {baixandoRelatorio ? "Gerando..." : "⭳ Baixar relatorio do mes"}
          </button>
        </div>
        {erroRelatorio && (
          <p role="alert" className="cm-alert cm-alert-err">
            {erroRelatorio}
          </p>
        )}
      </section>
    </>
  );
}
