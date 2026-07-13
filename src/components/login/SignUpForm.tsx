"use client";

import { useState } from "react";
import { useSignUp } from "@clerk/nextjs";
import styles from "./login.module.css";
import { EyeIcon } from "./icons";
import { clerkError } from "./clerkError";
import { LOJAS_DISPONIVEIS } from "@/lib/loja";
import { mascararTelefone, telefoneValido } from "@/lib/validation";

// Autocadastro do vendedor. Loja e telefone escolhidos aqui vao em
// `unsafeMetadata` (unico campo que o cliente pode escrever no Clerk) -
// depois que a conta e confirmada, /api/vendedor/perfil promove esses
// valores para `publicMetadata` no servidor. `role` nunca e definido por
// aqui: sem role, o app ja trata como "vendedor" (menor privilegio, ver
// src/lib/roles.ts).

function goHome() {
  window.location.href = "/";
}

export default function SignUpForm({ onVoltar }: { onVoltar: () => void }) {
  // Ativa a sessao recem-criada, promove loja/telefone (melhor esforco) e
  // entra. Usado tanto quando o cadastro ja sai "complete" (verificacao de
  // e-mail desligada no Clerk) quanto apos confirmar o codigo (ligada).
  async function finalizarCadastro(sessionId: string | null) {
    if (sessionId && setActive) await setActive({ session: sessionId });
    // Melhor esforco: se falhar, um admin ainda pode definir loja/telefone manualmente.
    await fetch("/api/vendedor/perfil", { method: "POST" }).catch(() => {});
    goHome();
  }

  const { isLoaded, signUp, setActive } = useSignUp();
  const [etapa, setEtapa] = useState<"dados" | "codigo">("dados");
  const [nomeCompleto, setNomeCompleto] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [loja, setLoja] = useState("");
  const [senha, setSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCriarConta(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || busy) return;
    if (!telefoneValido(telefone)) {
      setError("Telefone deve ter 10 ou 11 digitos.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const [firstName, ...resto] = nomeCompleto.trim().split(/\s+/);
      const res = await signUp.create({
        firstName,
        lastName: resto.join(" ") || undefined,
        emailAddress: email,
        password: senha,
        unsafeMetadata: { loja, telefone },
      });
      // Verificacao de e-mail DESLIGADA no Clerk: o cadastro ja sai
      // "complete" com sessao criada -> ativa e entra direto, sem etapa de
      // codigo (chamar prepareEmailAddressVerification aqui daria erro).
      if (res.status === "complete") {
        await finalizarCadastro(res.createdSessionId);
        return;
      }
      // Verificacao LIGADA: dispara o e-mail e vai para a etapa de codigo.
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setEtapa("codigo");
    } catch (err) {
      setError(clerkError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmarCodigo(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await signUp.attemptEmailAddressVerification({ code: codigo });
      if (res.status !== "complete") {
        setError("Não foi possível confirmar o código.");
        return;
      }
      await finalizarCadastro(res.createdSessionId);
    } catch (err) {
      setError(clerkError(err));
    } finally {
      setBusy(false);
    }
  }

  if (etapa === "codigo") {
    return (
      <form onSubmit={handleConfirmarCodigo}>
        {error && <div className={`${styles.alert} ${styles.alertFloat}`} role="alert">{error}</div>}
        <p className={styles.note}>Digite o código de confirmação enviado para {email}.</p>
        <div className={styles.field}>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label="Código"
            placeholder="Código"
            required
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
          />
        </div>
        <button className={styles.enter} type="submit" disabled={busy}>
          {busy ? "Confirmando..." : "Confirmar e entrar"}
        </button>
        <button type="button" className={styles.back} onClick={() => setEtapa("dados")}>
          Voltar
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleCriarConta}>
      {/* Necessario para o "Smart CAPTCHA" do Clerk (protecao anti-bot no
          cadastro), quando habilitado na instancia - invisivel se nao. */}
      <div id="clerk-captcha" />
      {error && <div className={`${styles.alert} ${styles.alertFloat}`} role="alert">{error}</div>}
      <div className={`${styles.field} ${styles.fieldCompact}`}>
        <input
          type="text"
          autoComplete="name"
          aria-label="Nome completo"
          placeholder="Nome completo"
          required
          value={nomeCompleto}
          onChange={(e) => setNomeCompleto(e.target.value)}
        />
      </div>
      <div className={`${styles.field} ${styles.fieldCompact}`}>
        <input
          type="email"
          autoComplete="email"
          aria-label="E-mail"
          placeholder="E-mail"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className={`${styles.field} ${styles.fieldCompact}`}>
        <input
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          aria-label="Telefone"
          placeholder="Telefone"
          required
          value={telefone}
          onChange={(e) => setTelefone(mascararTelefone(e.target.value))}
        />
      </div>
      <div className={`${styles.field} ${styles.selectField} ${styles.fieldCompact}`}>
        <select
          aria-label="Loja"
          required
          value={loja}
          onChange={(e) => setLoja(e.target.value)}
        >
          <option value="" disabled>
            Selecione sua loja
          </option>
          {LOJAS_DISPONIVEIS.map((nome) => (
            <option key={nome} value={nome}>
              {nome}
            </option>
          ))}
        </select>
      </div>
      <div className={`${styles.field} ${styles.fieldCompact}`}>
        <input
          type={showSenha ? "text" : "password"}
          autoComplete="new-password"
          aria-label="Senha"
          placeholder="Senha"
          required
          minLength={8}
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />
        <button
          type="button"
          className={styles.eye}
          onClick={() => setShowSenha((v) => !v)}
          aria-label={showSenha ? "Ocultar senha" : "Mostrar senha"}
          tabIndex={-1}
        >
          <EyeIcon off={showSenha} />
        </button>
      </div>
      <p className={styles.hint}>Mínimo de 8 caracteres.</p>
      <button className={styles.enter} type="submit" disabled={busy}>
        {busy ? "Criando conta..." : "Criar conta"}
      </button>
      <button type="button" className={styles.back} onClick={onVoltar}>
        Já tem conta? Entrar
      </button>
    </form>
  );
}
