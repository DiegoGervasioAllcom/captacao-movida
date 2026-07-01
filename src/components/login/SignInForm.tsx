"use client";

import { useState } from "react";
import { useSignIn } from "@clerk/nextjs";
import styles from "./login.module.css";

// =========================================================================
// Formulário do login. UI customizada com o hook headless `useSignIn` do
// Clerk (login por identificador/e-mail + recuperação de senha).
//
// Renderiza DOIS layouts que compartilham o mesmo estado:
//  - desktop: controles sobrepostos exatamente sobre o design (login-bg.png);
//  - mobile:  um card empilhado funcional (< 820px).
// O campo "Usuário" aceita o e-mail cadastrado.
// =========================================================================

function goHome() {
  window.location.href = "/";
}

function clerkError(err: unknown): string {
  const e = err as { errors?: Array<{ longMessage?: string; message?: string }> };
  return (
    e?.errors?.[0]?.longMessage ??
    e?.errors?.[0]?.message ??
    "Não foi possível concluir. Tente novamente."
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return off ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.9 5.2A9.9 9.9 0 0 1 12 5c6.5 0 10 7 10 7a13.2 13.2 0 0 1-2.4 3.2M6.5 6.5A13.2 13.2 0 0 0 2 12s3.5 7 10 7a9.9 9.9 0 0 0 4-.8" />
      <path d="M9.5 9.5a3 3 0 0 0 4.2 4.2" />
      <path d="m2 2 20 20" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function SignInForm() {
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
    setError(null);
    setCode("");
    setResetSent(false);
    setPassword("");
    setMode(next);
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await signIn.create({ identifier, password });
      if (res.status === "complete") {
        await setActive({ session: res.createdSessionId });
        goHome();
      } else {
        setError("Verificação adicional necessária. Contate o suporte.");
      }
    } catch (err) {
      setError(clerkError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleResetRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn.create({ strategy: "reset_password_email_code", identifier });
      setResetSent(true);
    } catch (err) {
      setError(clerkError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleResetConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code,
        password,
      });
      if (res.status === "complete") {
        await setActive({ session: res.createdSessionId });
        goHome();
      } else {
        setError("Não foi possível redefinir a senha.");
      }
    } catch (err) {
      setError(clerkError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* ---------- DESKTOP: controles sobre o design ---------- */}
      <div className={styles.desktop}>
        {mode === "signin" ? (
          <form onSubmit={handleSignIn}>
            <div className={`${styles.field} ${styles.fieldUser}`}>
              <input
                type="text"
                autoComplete="username"
                aria-label="Usuário"
                placeholder="Usuário"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
            </div>
            <div className={`${styles.field} ${styles.fieldPass}`}>
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                aria-label="Senha"
                placeholder="Senha"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className={styles.eye}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                tabIndex={-1}
              >
                <EyeIcon off={showPassword} />
              </button>
            </div>
            <button className={styles.enter} type="submit" disabled={busy} aria-label="Entrar" />
            <button
              type="button"
              className={styles.forgot}
              onClick={() => switchMode("reset")}
              aria-label="Esqueceu a senha?"
            />
            {error && <div className={styles.alert} role="alert">{error}</div>}
          </form>
        ) : (
          <ResetPanel
            resetSent={resetSent}
            identifier={identifier}
            setIdentifier={setIdentifier}
            code={code}
            setCode={setCode}
            password={password}
            setPassword={setPassword}
            busy={busy}
            error={error}
            onRequest={handleResetRequest}
            onConfirm={handleResetConfirm}
            onBack={() => switchMode("signin")}
          />
        )}
      </div>

      {/* ---------- MOBILE: card empilhado ---------- */}
      <div className={styles.mobile}>
        <h2 className={styles.mTitle}>
          Bem vindo ao portal de indicações <b>Supper Certo</b> Seguros
        </h2>
        {error && <div className={styles.mAlert} role="alert">{error}</div>}
        {mode === "signin" ? (
          <form onSubmit={handleSignIn}>
            <div className={styles.mField}>
              <input
                type="text"
                autoComplete="username"
                aria-label="Usuário"
                placeholder="Usuário"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
            </div>
            <div className={styles.mField}>
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                aria-label="Senha"
                placeholder="Senha"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className={styles.mEye}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                <EyeIcon off={showPassword} />
              </button>
            </div>
            <button className={styles.mBtn} type="submit" disabled={busy}>
              {busy ? "Entrando..." : "Entrar"}
            </button>
            <button type="button" className={styles.mForgot} onClick={() => switchMode("reset")}>
              Esqueceu a Senha?
            </button>
          </form>
        ) : !resetSent ? (
          <form onSubmit={handleResetRequest}>
            <div className={styles.mField}>
              <input
                type="text"
                autoComplete="username"
                aria-label="Usuário"
                placeholder="Usuário"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
            </div>
            <button className={styles.mBtn} type="submit" disabled={busy}>
              {busy ? "Enviando..." : "Enviar código"}
            </button>
            <button type="button" className={styles.mBack} onClick={() => switchMode("signin")}>
              Voltar para o login
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetConfirm}>
            <div className={styles.mField}>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-label="Código"
                placeholder="Código"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <div className={styles.mField}>
              <input
                type="password"
                autoComplete="new-password"
                aria-label="Nova senha"
                placeholder="Nova senha"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button className={styles.mBtn} type="submit" disabled={busy}>
              {busy ? "Salvando..." : "Redefinir e entrar"}
            </button>
            <button type="button" className={styles.mBack} onClick={() => switchMode("signin")}>
              Voltar para o login
            </button>
          </form>
        )}
      </div>
    </>
  );
}

// Painel de recuperação de senha (desktop), cobrindo a área do card.
function ResetPanel(props: {
  resetSent: boolean;
  identifier: string;
  setIdentifier: (v: string) => void;
  code: string;
  setCode: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  busy: boolean;
  error: string | null;
  onRequest: (e: React.FormEvent) => void;
  onConfirm: (e: React.FormEvent) => void;
  onBack: () => void;
}) {
  const { resetSent, busy, error } = props;
  return (
    <div className={styles.resetPanel}>
      {error && <div className={styles.alert} style={{ position: "static", width: "auto" }} role="alert">{error}</div>}
      {!resetSent ? (
        <form onSubmit={props.onRequest} style={{ display: "contents" }}>
          <p className={styles.resetTitle}>
            Informe seu usuário (e-mail) e enviaremos um código para redefinir a senha.
          </p>
          <div className={styles.resetField}>
            <input
              type="text"
              autoComplete="username"
              aria-label="Usuário"
              placeholder="Usuário"
              required
              value={props.identifier}
              onChange={(e) => props.setIdentifier(e.target.value)}
            />
          </div>
          <button className={styles.resetBtn} type="submit" disabled={busy}>
            {busy ? "Enviando..." : "Enviar código"}
          </button>
          <button type="button" className={styles.resetBack} onClick={props.onBack}>
            Voltar para o login
          </button>
        </form>
      ) : (
        <form onSubmit={props.onConfirm} style={{ display: "contents" }}>
          <p className={styles.resetTitle}>
            Digite o código recebido por e-mail e escolha uma nova senha.
          </p>
          <div className={styles.resetField}>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="Código"
              placeholder="Código"
              required
              value={props.code}
              onChange={(e) => props.setCode(e.target.value)}
            />
          </div>
          <div className={styles.resetField}>
            <input
              type="password"
              autoComplete="new-password"
              aria-label="Nova senha"
              placeholder="Nova senha"
              required
              value={props.password}
              onChange={(e) => props.setPassword(e.target.value)}
            />
          </div>
          <button className={styles.resetBtn} type="submit" disabled={busy}>
            {busy ? "Salvando..." : "Redefinir e entrar"}
          </button>
          <button type="button" className={styles.resetBack} onClick={props.onBack}>
            Voltar para o login
          </button>
        </form>
      )}
    </div>
  );
}
