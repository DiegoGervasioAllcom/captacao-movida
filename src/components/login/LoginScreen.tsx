import styles from "./login.module.css";
import SignInForm from "./SignInForm";

// =========================================================================
// Tela de login "Supper Certo Seguros".
// O design (exportado do Figma, texto vetorizado) é a imagem login-bg.png,
// usada como base do palco. Os controles reais do formulário são
// sobrepostos exatamente sobre o card (ver SignInForm + login.module.css).
// =========================================================================

export default function LoginScreen() {
  return (
    <main className={styles.screen}>
      <div className={styles.stage}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.bg}
          src="/login/login-bg.png"
          alt="Indicou. Fechou. Ganhou. — Portal de indicações Supper Certo Seguros"
        />
        <SignInForm />
      </div>
    </main>
  );
}
