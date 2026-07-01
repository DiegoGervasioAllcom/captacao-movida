import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import AuthCard from "@/components/AuthCard";
import { roleFromClaims } from "@/lib/roles";

// =========================================================================
// Rota raiz "/": pagina principal do sistema.
//  - Usuario NAO autenticado  -> tela de login/cadastro customizada.
//  - Usuario autenticado:
//      gestor -> /gestor
//      demais -> /vendedor
// =========================================================================

export default async function HomePage() {
  const { userId, sessionClaims } = await auth();

  if (userId) {
    const role = roleFromClaims(sessionClaims);
    redirect(role === "gestor" ? "/gestor" : "/vendedor");
  }

  return <AuthCard />;
}
