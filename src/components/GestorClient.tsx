"use client";

import { useMemo, useState } from "react";
import { formatarDataHora } from "@/lib/format";
import type { Captacao } from "@/lib/types";

// =========================================================================
// Componente cliente do painel do gestor: metricas, busca e exportacao CSV.
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
function exportarCsv(linhas: Captacao[]) {
  const cabecalho = [
    "Cliente",
    "Telefone",
    "Placa",
    "Vendedor",
    "Data/Hora",
  ];
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

export default function GestorClient({
  captacoes,
}: {
  captacoes: Captacao[];
}) {
  const [busca, setBusca] = useState("");

  // Filtra por nome do cliente, placa ou vendedor.
  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return captacoes;
    return captacoes.filter((c) =>
      [c.nome_cliente, c.placa, c.vendedor_nome ?? "", c.telefone]
        .join(" ")
        .toLowerCase()
        .includes(termo)
    );
  }, [busca, captacoes]);

  // Metricas simples.
  const hoje = new Date().toDateString();
  const totalHoje = captacoes.filter(
    (c) => new Date(c.created_at).toDateString() === hoje
  ).length;
  const vendedores = new Set(captacoes.map((c) => c.vendedor_id)).size;

  return (
    <>
      <div className="cm-stats">
        <div className="cm-stat">
          <div className="cm-stat-label">Total de captacoes</div>
          <div className="cm-stat-value">{captacoes.length}</div>
        </div>
        <div className="cm-stat">
          <div className="cm-stat-label">Captacoes de hoje</div>
          <div className="cm-stat-value">{totalHoje}</div>
        </div>
        <div className="cm-stat">
          <div className="cm-stat-label">Vendedores ativos</div>
          <div className="cm-stat-value">{vendedores}</div>
        </div>
      </div>

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
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <button
              type="button"
              className="cm-btn cm-btn-ghost cm-btn-sm"
              onClick={() => exportarCsv(filtradas)}
              disabled={filtradas.length === 0}
            >
              ⭳ Exportar CSV
            </button>
          </div>
        </div>

        {filtradas.length === 0 ? (
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
                {filtradas.map((c) => (
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

        <p className="cm-muted" style={{ marginTop: 16, fontSize: 13 }}>
          Exibindo {filtradas.length} de {captacoes.length} captacoes
        </p>
      </section>
    </>
  );
}
