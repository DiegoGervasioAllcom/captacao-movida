import styles from "./login.module.css";
import LoginHero from "./LoginHero";
import SignInForm from "./SignInForm";

// =========================================================================
// Login "Supper Certo Seguros" — componentizado.
//   bg-plate.png (arte de fundo) + moedas (imagens transparentes) + logos,
//   e o resto como componentes reais: LoginHero (texto/ícones) e o card
//   (CSS) com o formulário (SignInForm).
// =========================================================================

const COINS: [string, string][] = [
  [styles.coinBl, "coin-bl"],
  [styles.coinR1, "coin-r1"],
  [styles.coinBr, "coin-br"],
  [styles.coinR2, "coin-r2"],
];

export default function LoginScreen() {
  return (
    <main className={styles.screen}>
      <div className={styles.stage}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.bgPlate} src="/login/bg-plate.png" alt="" aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.tlArt} src="/login/tl-art.png" alt="" aria-hidden="true" />

        {COINS.map(([cls, name]) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={cls} className={`${styles.coin} ${cls}`} src={`/login/${name}.png`} alt="" aria-hidden="true" />
        ))}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.logos} src="/login/logos.png" alt="Supper Certo Seguros · Seminovos Movida" />

        <LoginHero />

        <section className={styles.card} aria-label="Acesso ao portal">
          <SignInForm />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.cardBorder} src="/login/card-border.png" alt="" aria-hidden="true" />
        </section>
      </div>
    </main>
  );
}
