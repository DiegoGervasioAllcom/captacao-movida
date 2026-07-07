"use client";

import { UserButton } from "@clerk/nextjs";
import styles from "./indicacao.module.css";

interface Props {
  loja: string | null;
}

// Cabecalho da tela "Nova Indicação" (area do vendedor), fiel ao Figma
// "Tela Indicação Supper + SN Movida". Especifico dessa tela — o painel do
// gestor continua com o AppHeader/Brand genericos (Kinetic Harvest).
export default function IndicacaoHeader({ loja }: Props) {
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.logo}
          src="/vendedor/logo-supper-certo.png"
          alt="Supper Certo Seguros"
        />
        <div className={styles.titleGroup}>
          <p className={styles.title}>
            Supper Certo + <span className={styles.titlePurple}>seminovos</span>{" "}
            <span className={styles.titleOrange}>MOVIDA</span>
          </p>
          <p className={styles.tagline}>Indicou, Fechou, Ganhou</p>
        </div>
      </div>
      <div className={styles.actions}>
        <span className={styles.pill}>Vendedor</span>
        {loja && <span className={styles.pill}>{loja}</span>}
        <UserButton afterSignOutUrl="/sign-in" />
      </div>
    </header>
  );
}
