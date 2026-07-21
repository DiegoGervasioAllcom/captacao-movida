import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { roleFromClaims } from "@/lib/roles";

// =========================================================================
// Middleware de autenticacao e autorizacao por papel.
//
//  - Rotas publicas: login / cadastro.
//  - /vendedor: exige usuario autenticado.
//  - /gestor: exige usuario autenticado COM papel "gestor".
//
// O papel vem do claim `app_role` do session token do Clerk.
// =========================================================================

const isPublicRoute = createRouteMatcher([
  "/", // pagina principal = login customizado
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

const isGestorRoute = createRouteMatcher(["/gestor(.*)", "/api/gestor(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  // Rotas publicas passam direto.
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  const { userId, sessionClaims, redirectToSignIn } = await auth();

  // Nao autenticado -> manda para o login.
  if (!userId) {
    return redirectToSignIn({ returnBackUrl: req.url });
  }

  // Protege a area do gestor: somente papel "gestor".
  if (isGestorRoute(req)) {
    if (roleFromClaims(sessionClaims) !== "gestor") {
      // Sem permissao -> redireciona para a area do vendedor.
      return NextResponse.redirect(new URL("/vendedor", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Aplica em todas as rotas, exceto arquivos estaticos e _next.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Sempre roda nas rotas de API.
    "/(api|trpc)(.*)",
  ],
};
