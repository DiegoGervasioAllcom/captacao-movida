"use client";

import { useState } from "react";
import { useSignIn } from "@clerk/nextjs";
import styles from "./login.module.css";
import { EyeIcon } from "./icons";
import { clerkError } from "./clerkError";

// Card de login (avatar + título + formulário). Clerk headless useSignIn:
// login por identificador (e-mail) + recuperação de senha. Texto real.

function goHome() {
  window.location.href = "/";
}

export default function SignInForm({ onCriarConta }: { onCriarConta: () => void }) {
  const { isLoaded, signIn, setActive } = useSignIn();
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function switchMode(next: "signin" | "reset") {
    setError(null); setCode(""); setResetSent(false); setPassword(""); setMode(next);
  }
  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await signIn.create({ identifier, password });
      if (res.status === "complete") { await setActive({ session: res.createdSessionId }); goHome(); }
      else setError("Verificação adicional necessária. Contate o suporte.");
    } catch (err) { setError(clerkError(err)); } finally { setBusy(false); }
  }
  async function handleResetRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || busy) return;
    setBusy(true); setError(null);
    try { await signIn.create({ strategy: "reset_password_email_code", identifier }); setResetSent(true); }
    catch (err) { setError(clerkError(err)); } finally { setBusy(false); }
  }
  async function handleResetConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await signIn.attemptFirstFactor({ strategy: "reset_password_email_code", code, password });
      if (res.status === "complete") { await setActive({ session: res.createdSessionId }); goHome(); }
      else setError("Não foi possível redefinir a senha.");
    } catch (err) { setError(clerkError(err)); } finally { setBusy(false); }
  }

  const passField = (label: string) => (
    <div className={styles.field}>
      <input type={showPassword ? "text" : "password"} autoComplete="current-password" aria-label={label} placeholder={label} required value={password} onChange={(e) => setPassword(e.target.value)} />
      <button type="button" className={styles.eye} onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} tabIndex={-1}>
        <EyeIcon off={showPassword} />
      </button>
    </div>
  );
  const userField = (
    <div className={styles.field}>
      <input type="text" autoComplete="username" aria-label="Usuário" placeholder="E-mail" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
    </div>
  );

  return (
    <>
      {error && <div className={`${styles.alert} ${styles.alertFloat}`} role="alert">{error}</div>}

      {mode === "signin" ? (
        <form onSubmit={handleSignIn}>
          {userField}
          {passField("Senha")}
          <button className={styles.enter} type="submit" disabled={busy}>{busy ? "Entrando..." : "Entrar"}</button>
          <button type="button" className={styles.forgot} onClick={() => switchMode("reset")}>Esqueceu a Senha?</button>
          <button type="button" className={styles.back} onClick={onCriarConta}>Ainda não tem conta? Criar conta</button>
        </form>
      ) : !resetSent ? (
        <form onSubmit={handleResetRequest}>
          <p className={styles.note}>Informe seu usuário (e-mail) e enviaremos um código para redefinir a senha.</p>
          {userField}
          <button className={styles.enter} type="submit" disabled={busy}>{busy ? "Enviando..." : "Enviar código"}</button>
          <button type="button" className={styles.back} onClick={() => switchMode("signin")}>Voltar para o login</button>
        </form>
      ) : (
        <form onSubmit={handleResetConfirm}>
          <p className={styles.note}>Digite o código recebido por e-mail e escolha uma nova senha.</p>
          <div className={styles.field}>
            <input type="text" inputMode="numeric" autoComplete="one-time-code" aria-label="Código" placeholder="Código" required value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          {passField("Nova senha")}
          <button className={styles.enter} type="submit" disabled={busy}>{busy ? "Salvando..." : "Redefinir e entrar"}</button>
          <button type="button" className={styles.back} onClick={() => switchMode("signin")}>Voltar para o login</button>
        </form>
      )}
    </>
  );
}
