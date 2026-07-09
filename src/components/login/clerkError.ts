import { ptBR } from "@clerk/localizations";

// Extrai uma mensagem de erro legivel de uma excecao do Clerk (front-end).
//
// O Clerk retorna o texto do erro (`.message`/`.longMessage`) sempre em
// ingles quando usado sem os componentes prontos (useSignIn/useSignUp, ver
// SignInForm/SignUpForm) - so os componentes prontos do Clerk usam a
// traducao do `localization` do ClerkProvider. Contornamos isso traduzindo
// pelo `.code` do erro, usando a mesma tabela de traducoes que o
// @clerk/localizations ja mantem em pt-BR (unstable__errors - nome do
// pacote, nao nosso; a chave pode mudar entre versoes do Clerk).
// Sem traducao pro codigo -> mensagem generica em pt-BR (nunca em ingles).
//
// Erros especificos de um campo (ex.: "e-mail ja cadastrado") usam uma
// chave composta "<code>__<paramName>" nessa tabela (ex.:
// "form_identifier_exists__email_address"), nao so o `code` puro - por
// isso tentamos a chave composta primeiro, com o `code` simples como
// segunda tentativa.
const traducoes = ptBR.unstable__errors as Record<string, string> | undefined;

export function clerkError(err: unknown): string {
  const e = err as {
    errors?: Array<{
      code?: string;
      longMessage?: string;
      message?: string;
      meta?: { paramName?: string };
    }>;
  };
  const primeiro = e?.errors?.[0];
  const codigo = primeiro?.code;
  const paramName = primeiro?.meta?.paramName;
  const chaveComposta = codigo && paramName ? `${codigo}__${paramName}` : undefined;
  const traduzida =
    (chaveComposta ? traducoes?.[chaveComposta] : undefined) ??
    (codigo ? traducoes?.[codigo] : undefined);
  return traduzida ?? "Não foi possível concluir. Tente novamente.";
}
