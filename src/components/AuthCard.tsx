"use client";

import { useState } from "react";
import { useSignIn } from "@clerk/nextjs";
import type { Role } from "@/lib/types";

// =========================================================================
// Tela principal de autenticacao (pagina raiz "/").
//
// UI totalmente customizada com a identidade da marca (mockup), usando o
// hook "headless" do Clerk:
//   - useSignIn  -> login por e-mail/senha + recuperacao de senha
//
// Nao ha auto-cadastro: as contas sao criadas/gerenciadas pelo gestor/admin
// no painel do Clerk. O claim `role` (publicMetadata) define o papel e e
// aplicado no servidor pelo middleware e pela rota raiz; o seletor
// Vendedor/Gestor aqui e apenas uma preferencia visual.
// =========================================================================

type Mode = "signin" | "reset";

// Apos autenticar, recarrega a raiz: o servidor decide /vendedor ou /gestor.
function goHome() {
  window.location.href = "/";
}

// Extrai a mensagem de erro amigavel retornada pelo Clerk.
function clerkError(err: unknown): string {
  const e = err as { errors?: Array<{ longMessage?: string; message?: string }> };
  return (
    e?.errors?.[0]?.longMessage ??
    e?.errors?.[0]?.message ??
    "Nao foi possivel concluir. Tente novamente."
  );
}

export default function AuthCard() {
  const { isLoaded: signInLoaded, signIn, setActive: setActiveSignIn } = useSignIn();

  const [mode, setMode] = useState<Mode>("signin");
  const [role, setRole] = useState<Role>("vendedor");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);

  // Sub-fluxo de troca de senha (reset).
  const [code, setCode] = useState("");
  const [resetSent, setResetSent] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function switchMode(next: Mode) {
    setError(null);
    setCode("");
    setResetSent(false);
    setMode(next);
  }

  // ---- Login ----
  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!signInLoaded || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await signIn.create({ identifier: email, password });
      if (res.status === "complete") {
        await setActiveSignIn({ session: res.createdSessionId });
        goHome();
      } else {
        setError("Verificacao adicional necessaria. Contate o suporte.");
      }
    } catch (err) {
      setError(clerkError(err));
    } finally {
      setBusy(false);
    }
  }

  // ---- Recuperar senha: envia codigo ----
  async function handleResetRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!signInLoaded || busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email,
      });
      setResetSent(true);
    } catch (err) {
      setError(clerkError(err));
    } finally {
      setBusy(false);
    }
  }

  // ---- Recuperar senha: confirma codigo + nova senha ----
  async function handleResetConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!signInLoaded || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code,
        password,
      });
      if (res.status === "complete") {
        await setActiveSignIn({ session: res.createdSessionId });
        goHome();
      } else {
        setError("Nao foi possivel redefinir a senha.");
      }
    } catch (err) {
      setError(clerkError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="cm-auth">
      <div className="cm-auth-shell">
        {/* Marca */}
        <header className="cm-auth-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="cm-auth-logo-img"
            src="/logo.png"
            alt="Supper Certo Seguros"
          />
          <h1 className="cm-auth-title">
            Indique e <span className="cm-hl">Ganhe</span>
          </h1>
          <p className="cm-auth-sub">
            Transforme cada indicação em recompensa.{" "}
            <strong>Quanto mais você indica, mais você ganha.</strong>
          </p>
        </header>

        {error && (
          <div className="cm-alert cm-alert-err" role="alert">
            {error}
          </div>
        )}

        {/* ---- Recuperar senha ---- */}
        {mode === "reset" ? (
          !resetSent ? (
            <form onSubmit={handleResetRequest}>
              <p className="cm-auth-note">
                Informe seu e-mail e enviaremos um codigo para redefinir a sua
                chave de acesso.
              </p>
              <EmailField value={email} onChange={setEmail} />
              <button className="cm-auth-submit" type="submit" disabled={busy}>
                {busy ? "Enviando..." : "Enviar codigo"}
                <ChevronIcon />
              </button>
              <button
                type="button"
                className="cm-auth-back"
                onClick={() => switchMode("signin")}
              >
                Voltar para o login
              </button>
            </form>
          ) : (
            <form onSubmit={handleResetConfirm}>
              <p className="cm-auth-note">
                Digite o codigo recebido por e-mail e escolha uma nova chave de
                acesso.
              </p>
              <CodeField value={code} onChange={setCode} />
              <PasswordField
                label="Nova chave de acesso"
                value={password}
                onChange={setPassword}
                show={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
              />
              <button className="cm-auth-submit" type="submit" disabled={busy}>
                {busy ? "Salvando..." : "Redefinir e entrar"}
                <ChevronIcon />
              </button>
              <button
                type="button"
                className="cm-auth-back"
                onClick={() => switchMode("signin")}
              >
                Voltar para o login
              </button>
            </form>
          )
        ) : (
          /* ---- Login ---- */
          <form onSubmit={handleSignIn}>
            {/* Como funciona, em 3 passos */}
            <div className="cm-steps" aria-label="Como funciona">
              <div className="cm-step">
                <UserPlusIcon />
                <span>Indique</span>
              </div>
              <span className="cm-step-arrow" aria-hidden="true">
                <ChevronIcon />
              </span>
              <div className="cm-step">
                <CheckIcon />
                <span>Cliente fecha</span>
              </div>
              <span className="cm-step-arrow" aria-hidden="true">
                <ChevronIcon />
              </span>
              <div className="cm-step cm-step-win">
                <CoinsIcon />
                <span>Você ganha</span>
              </div>
            </div>

            {/* Seletor de papel */}
            <div className="cm-auth-roles">
              <button
                type="button"
                className="cm-auth-role"
                aria-pressed={role === "vendedor"}
                onClick={() => setRole("vendedor")}
              >
                <SellerIcon />
                <span>Vendedor</span>
              </button>
              <button
                type="button"
                className="cm-auth-role"
                aria-pressed={role === "gestor"}
                onClick={() => setRole("gestor")}
              >
                <ManagerIcon />
                <span>Gestor</span>
              </button>
            </div>

            <EmailField value={email} onChange={setEmail} />

            <PasswordField
              label="Chave de acesso"
              value={password}
              onChange={setPassword}
              show={showPassword}
              onToggle={() => setShowPassword((v) => !v)}
            />

            <div className="cm-auth-meta">
              <label className="cm-auth-remember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Lembrar acesso
              </label>
              <button
                type="button"
                className="cm-auth-forgot"
                onClick={() => switchMode("reset")}
              >
                ESQUECI SENHA
              </button>
            </div>

            <button className="cm-auth-submit" type="submit" disabled={busy}>
              {busy ? "Aguarde..." : "Entrar"}
              <ChevronIcon />
            </button>
          </form>
        )}

        {/* Rodape */}
        <footer className="cm-auth-foot">
          <p className="cm-auth-foot-dev">Desenvolvido por Supper Certo</p>
          <div className="cm-auth-foot-links">
            <a href="mailto:diego.gervasio@allcomtelecom.com">SUPORTE</a>
            <span className="cm-auth-foot-sep">|</span>
            <a href="/privacidade">PRIVACIDADE</a>
          </div>
        </footer>
      </div>
    </main>
  );
}

// =========================================================================
// Campos reutilizaveis
// =========================================================================

function EmailField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="cm-auth-field">
      <label className="cm-auth-label" htmlFor="cm-email">
        Endereco de Email
      </label>
      <div className="cm-auth-input">
        <span className="cm-auth-ico" aria-hidden="true">
          <MailIcon />
        </span>
        <input
          id="cm-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="usuario@suppercerto.com.br"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggle,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="cm-auth-field">
      <label className="cm-auth-label" htmlFor="cm-password">
        {label}
      </label>
      <div className="cm-auth-input">
        <span className="cm-auth-ico" aria-hidden="true">
          <LockIcon />
        </span>
        <input
          id="cm-password"
          type={show ? "text" : "password"}
          autoComplete="current-password"
          required
          placeholder="••••••••"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="cm-auth-eye"
          onClick={onToggle}
          aria-label={show ? "Ocultar senha" : "Mostrar senha"}
        >
          {show ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </div>
  );
}

function CodeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="cm-auth-field">
      <label className="cm-auth-label" htmlFor="cm-code">
        Codigo_de_verificacao
      </label>
      <div className="cm-auth-input">
        <span className="cm-auth-ico" aria-hidden="true">
          <LockIcon />
        </span>
        <input
          id="cm-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          placeholder="000000"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

// =========================================================================
// Icones (SVG inline, sem dependencias externas)
// =========================================================================

function ChevronIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function CoinsIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
      <path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
    </svg>
  );
}

function UserPlusIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21a7 7 0 0 1 12-4.9" />
      <path d="M17 11v6M14 14h6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.4 2.4 4.6-5" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.9 5.2A9.9 9.9 0 0 1 12 5c6.5 0 10 7 10 7a13.2 13.2 0 0 1-2.4 3.2M6.5 6.5A13.2 13.2 0 0 0 2 12s3.5 7 10 7a9.9 9.9 0 0 0 4-.8" />
      <path d="M9.5 9.5a3 3 0 0 0 4.2 4.2" />
      <path d="m2 2 20 20" />
    </svg>
  );
}

function SellerIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

function ManagerIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3z" />
      <circle cx="12" cy="11" r="2.2" />
      <path d="M9.5 16a2.5 2.5 0 0 1 5 0" />
    </svg>
  );
}
