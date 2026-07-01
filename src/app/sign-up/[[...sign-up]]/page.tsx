import { redirect } from "next/navigation";

// A criacao de conta agora vive na pagina principal ("/", aba "Criar Conta").
// Mantemos esta rota apenas para compatibilidade, encaminhando para a raiz.
export default function SignUpPage() {
  redirect("/");
}
