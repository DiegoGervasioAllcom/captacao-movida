import { redirect } from "next/navigation";

// A tela de login agora e a pagina principal ("/").
// Mantemos esta rota apenas para compatibilidade com links/redirecionamentos
// antigos do Clerk, encaminhando para a raiz.
export default function SignInPage() {
  redirect("/");
}
