import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { ptBR } from "@clerk/localizations";
import "./globals.css";

// Metadados da aplicacao.
export const metadata: Metadata = {
  title: "Supper Certo",
  description: "Indique e Ganhe - plataforma para vendedores e gestores.",
};

// Mobile-first: viewport responsivo.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f49e00",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Localizacao em portugues do Brasil nos componentes do Clerk.
    <ClerkProvider localization={ptBR}>
      <html lang="pt-BR">
        <head>
          {/* Fontes da identidade visual (Kinetic Harvest) */}
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link
            rel="preconnect"
            href="https://fonts.gstatic.com"
            crossOrigin="anonymous"
          />
          <link
            href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&family=Montserrat:wght@500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap"
            rel="stylesheet"
          />
        </head>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
