"use client";

import { useState } from "react";
import {
  mascararTelefone,
  normalizarPlaca,
  validarCaptacao,
  type ErrosCaptacao,
} from "@/lib/validation";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { Captacao } from "@/lib/types";

interface Props {
  vendedorId: string;
  vendedorNome: string | null;
  loja: string | null;
  /** Chamado quando uma captacao e gravada com sucesso. */
  onCriada: (c: Captacao) => void;
}

type Estado = "idle" | "enviando";

// Formulario de captacao: nome, telefone e placa, com validacao e mascaras.
export default function CapturaForm({
  vendedorId,
  vendedorNome,
  loja,
  onCriada,
}: Props) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [placa, setPlaca] = useState("");
  const [erros, setErros] = useState<ErrosCaptacao>({});
  const [estado, setEstado] = useState<Estado>("idle");
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  async function aoEnviar(e: React.FormEvent) {
    e.preventDefault();
    setErroGeral(null);
    setSucesso(null);

    // 1) Validacao no cliente.
    const dados = { nome_cliente: nome, telefone, placa };
    const novosErros = validarCaptacao(dados);
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) return;

    setEstado("enviando");
    try {
      const supabase = createBrowserSupabaseClient();

      // 2) Grava PRIMEIRO no Supabase (fonte da verdade do lead).
      //    O encaminhamento ao webhook acontece DEPOIS, via Database Webhook
      //    do Supabase (configurado no painel) - nunca perdemos um lead.
      const { data, error } = await supabase
        .from("captacoes")
        .insert({
          vendedor_id: vendedorId,
          vendedor_nome: vendedorNome,
          loja,
          nome_cliente: nome.trim(),
          telefone: telefone.trim(),
          placa: normalizarPlaca(placa),
        })
        .select()
        .single();

      if (error) {
        // Trata sessao expirada / RLS / rede de forma amigavel.
        const msg = /jwt|exp|auth/i.test(error.message)
          ? "Sua sessao expirou. Atualize a pagina e entre novamente."
          : `Nao foi possivel salvar: ${error.message}`;
        setErroGeral(msg);
        return;
      }

      // Sucesso: limpa o formulario e avisa o pai.
      onCriada(data as Captacao);
      setNome("");
      setTelefone("");
      setPlaca("");
      setErros({});
      setSucesso("Cliente cadastrado com sucesso!");
    } catch {
      setErroGeral(
        "Falha de rede. Verifique sua conexao e tente novamente."
      );
    } finally {
      setEstado("idle");
    }
  }

  return (
    <form onSubmit={aoEnviar} noValidate>
      <h2 className="cm-card-title">Nova Captura</h2>
      <p className="cm-card-sub">
        Preencha os dados do veiculo e do cliente para iniciar a captacao.
      </p>

      {erroGeral && (
        <div className="cm-alert cm-alert-err" role="alert">
          {erroGeral}
        </div>
      )}
      {sucesso && (
        <div className="cm-alert cm-alert-ok" role="status">
          {sucesso}
        </div>
      )}

      <div className="cm-field">
        <label htmlFor="nome">Nome do cliente</label>
        <input
          id="nome"
          name="nome"
          type="text"
          autoComplete="name"
          placeholder="Ex: Joao da Silva"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          aria-invalid={!!erros.nome_cliente}
          aria-describedby={erros.nome_cliente ? "err-nome" : undefined}
        />
        {erros.nome_cliente && (
          <p id="err-nome" className="cm-err">
            {erros.nome_cliente}
          </p>
        )}
      </div>

      <div className="cm-field">
        <label htmlFor="telefone">Telefone de contato</label>
        <input
          id="telefone"
          name="telefone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="(00) 00000-0000"
          value={telefone}
          onChange={(e) => setTelefone(mascararTelefone(e.target.value))}
          aria-invalid={!!erros.telefone}
          aria-describedby={erros.telefone ? "err-tel" : undefined}
        />
        {erros.telefone && (
          <p id="err-tel" className="cm-err">
            {erros.telefone}
          </p>
        )}
      </div>

      <div className="cm-field">
        <label htmlFor="placa">Placa do veiculo</label>
        <input
          id="placa"
          name="placa"
          type="text"
          autoCapitalize="characters"
          placeholder="ABC1D23"
          value={placa}
          onChange={(e) => setPlaca(normalizarPlaca(e.target.value))}
          aria-invalid={!!erros.placa}
          aria-describedby={erros.placa ? "err-placa" : "hint-placa"}
          style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
        />
        {erros.placa ? (
          <p id="err-placa" className="cm-err">
            {erros.placa}
          </p>
        ) : (
          <p id="hint-placa" className="cm-hint">
            Aceita Mercosul (ABC1D23) e modelo antigo (ABC1234).
          </p>
        )}
      </div>

      <button
        type="submit"
        className="cm-btn"
        disabled={estado === "enviando"}
      >
        {estado === "enviando" ? "Cadastrando..." : "Cadastrar Cliente"}
      </button>
    </form>
  );
}
