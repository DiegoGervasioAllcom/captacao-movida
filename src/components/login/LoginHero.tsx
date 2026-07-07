import { Fragment } from "react";
import styles from "./login.module.css";
import { CoinBullet, StepPerson, StepShield, StepCoin, StepGift } from "./icons";

// Coluna esquerda: chamada da campanha (texto real) + ícones (SVG).
const STEPS = [
  { label: "INDICOU", icon: <StepPerson /> },
  { label: "FECHOU", icon: <StepShield /> },
  { label: "GANHOU", icon: <StepCoin /> },
  { label: "RESGATOU", icon: <StepGift /> },
];

export default function LoginHero() {
  return (
    <>
      {/* selo de check faz parte do cluster de topo (tl-art.png) */}
      <h1 className={styles.headline}>
        <span className={styles.hlOrange}>Indicou.</span>
        <span className={styles.hlWhite}>Fechou.</span>
        <span className={styles.hlOrange}>Ganhou.</span>
      </h1>

      <span className={styles.bullet}><CoinBullet /></span>
      <p className={styles.subtitle}>
        Cadastre seus clientes e acumule <b>Supper Moedas</b> a cada seguro contratado.
      </p>

      <div className={styles.lembrete}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.spark} src="/login/spark.png" alt="" aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.bell} src="/login/bell.png" alt="" aria-hidden="true" />
        <p className={styles.lembreteText}>
          <b>LEMBRETE:</b> Não esqueça de avisar para o cliente que a <b>Supper Certo</b> entrará em contato.
        </p>
      </div>

      <nav className={styles.steps} aria-label="Como funciona">
        {STEPS.map((st, i) => (
          <Fragment key={st.label}>
            {i > 0 && <span className={styles.stepDivider} aria-hidden="true" />}
            <div className={styles.step}>
              {st.icon}
              <span>{st.label}</span>
            </div>
          </Fragment>
        ))}
      </nav>
    </>
  );
}
