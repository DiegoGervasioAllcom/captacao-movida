import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { LOJAS_DISPONIVEIS } from "@/lib/loja";
import { telefoneValido } from "@/lib/validation";

// =========================================================================
// Promove loja + telefone escolhidos no autocadastro (unsafeMetadata,
// escrita pelo proprio vendedor no signUp.create) para publicMetadata (so o
// servidor escreve). Nunca mexe em `role` - sem role definido, o app ja
// trata como "vendedor" (menor privilegio, ver src/lib/roles.ts).
// =========================================================================
export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  const client = await clerkClient();
  const usuario = await client.users.getUser(userId);
  const loja = usuario.unsafeMetadata?.loja;
  const telefone = usuario.unsafeMetadata?.telefone;

  if (
    typeof loja !== "string" ||
    !LOJAS_DISPONIVEIS.includes(loja as (typeof LOJAS_DISPONIVEIS)[number])
  ) {
    return NextResponse.json({ error: "Loja invalida." }, { status: 400 });
  }
  if (typeof telefone !== "string" || !telefoneValido(telefone)) {
    return NextResponse.json({ error: "Telefone invalido." }, { status: 400 });
  }

  await client.users.updateUserMetadata(userId, {
    publicMetadata: { loja, telefone },
  });

  return NextResponse.json({ ok: true });
}
