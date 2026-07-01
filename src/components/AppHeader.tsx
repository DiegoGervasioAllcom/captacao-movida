"use client";

import { UserButton } from "@clerk/nextjs";
import Brand from "./Brand";

// Cabecalho fixo do app, com a marca e o menu do usuario (Clerk).
export default function AppHeader({ papel }: { papel?: string }) {
  return (
    <header className="cm-header">
      <Brand />
      <div className="cm-row">
        {papel && (
          <span className="cm-chip cm-chip-ok" aria-label={`Papel: ${papel}`}>
            {papel}
          </span>
        )}
        <UserButton afterSignOutUrl="/sign-in" />
      </div>
    </header>
  );
}
