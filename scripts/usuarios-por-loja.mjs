// =========================================================================
// Relatorio: quantos usuarios (vendedores) por loja + o nome de cada um.
//
// O Clerk NAO permite filtrar por publicMetadata no painel nem na query da
// API - por isso listamos TODOS os usuarios (API REST do Clerk) e agrupamos
// por `loja` aqui, usando a mesma leitura case-insensitive de src/lib/loja.ts.
//
// SEM DEPENDENCIAS: usa fetch nativo do Node (>=18) e a API REST do Clerk.
// Nao precisa de node_modules - roda em qualquer Node, inclusive dentro de
// um container Docker no servidor (que nao tem Node no host).
//
// COMO RODAR (a chave vem do .env, nunca no codigo):
//
//   # Na sua maquina (tem Node):
//   npm run usuarios-por-loja
//   # ou, apontando para producao:
//   node --env-file=.env.production scripts/usuarios-por-loja.mjs
//
//   # No servidor (SEM Node no host, mas com Docker) - reusa a imagem do app,
//   # roda como seu usuario pra poder gravar o CSV na pasta montada:
//   docker run --rm --user $(id -u):$(id -g) \
//     -v "$PWD":/app -w /app captacao-movida:latest \
//     node --env-file=.env scripts/usuarios-por-loja.mjs
//
// LGPD: isto le dado pessoal de COLABORADOR (nome do vendedor + loja). E uma
// operacao de gestor/admin. De proposito NAO imprime/exporta e-mail, telefone
// nem senha - so nome e loja, o minimo pra responder "quem esta em qual loja".
// O CSV gerado contem nome de pessoas: trate como dado pessoal (nao versione,
// nao compartilhe fora da lista de gestores). Ja esta no .gitignore.
// =========================================================================
import { writeFileSync } from "node:fs";

const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) {
  console.error(
    "Falta CLERK_SECRET_KEY no ambiente.\n" +
      "Rode assim (a chave vem do .env):\n" +
      "  npm run usuarios-por-loja\n" +
      "  # ou: node --env-file=.env scripts/usuarios-por-loja.mjs",
  );
  process.exit(1);
}

const API = "https://api.clerk.com/v1";

async function clerkGet(caminho) {
  const res = await fetch(`${API}${caminho}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  if (!res.ok) {
    const corpo = await res.text().catch(() => "");
    throw new Error(
      `Clerk API respondeu ${res.status} em ${caminho}. ${corpo.slice(0, 300)}`,
    );
  }
  return res.json();
}

// Mesma logica de lojaFromPublicMetadata (src/lib/loja.ts): a chave "loja"
// e procurada ignorando maiusculas/minusculas porque quem cadastra no painel
// do Clerk digita a mao e a grafia varia.
function lojaDoMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return null;
  const chave = Object.keys(metadata).find((k) => k.toLowerCase() === "loja");
  const valor = chave ? metadata[chave] : undefined;
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

// A API REST usa snake_case (first_name, email_addresses[].email_address...).
function nomeDoUsuario(u) {
  const nome = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  if (nome) return nome;
  const emails = u.email_addresses || [];
  const primaria =
    emails.find((e) => e.id === u.primary_email_address_id) || emails[0];
  return primaria?.email_address || u.username || u.id;
}

const LIMITE = 100;
let offset = 0;
const usuarios = [];
// Pagina ate a API devolver uma pagina menor que o limite (fim da lista).
while (true) {
  const pagina = await clerkGet(`/users?limit=${LIMITE}&offset=${offset}`);
  if (!Array.isArray(pagina) || pagina.length === 0) break;
  usuarios.push(...pagina);
  if (pagina.length < LIMITE) break;
  offset += LIMITE;
}

const porLoja = new Map();
const semLoja = [];
for (const u of usuarios) {
  const loja = lojaDoMetadata(u.public_metadata);
  const nome = nomeDoUsuario(u);
  if (!loja) {
    semLoja.push(nome);
    continue;
  }
  if (!porLoja.has(loja)) porLoja.set(loja, []);
  porLoja.get(loja).push(nome);
}

const cmp = (a, b) => a.localeCompare(b, "pt-BR");
const lojas = [...porLoja.keys()].sort(cmp);

// ---- CSV (mesma convencao do painel do gestor: separador ";" + BOM) ----
function celulaCsv(valor) {
  const v = String(valor ?? "");
  return /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
const linhasCsv = [["Loja", "Usuario"].join(";")];
for (const loja of lojas) {
  for (const nome of porLoja.get(loja).slice().sort(cmp)) {
    linhasCsv.push([celulaCsv(loja), celulaCsv(nome)].join(";"));
  }
}
for (const nome of semLoja.slice().sort(cmp)) {
  linhasCsv.push([celulaCsv("(sem loja)"), celulaCsv(nome)].join(";"));
}
const argOut = process.argv.find((a) => a.startsWith("--out="));
const caminhoCsv = argOut ? argOut.slice("--out=".length) : "usuarios-por-loja.csv";
// BOM (﻿) garante acentuacao correta ao abrir no Excel.
writeFileSync(caminhoCsv, "﻿" + linhasCsv.join("\n"), "utf8");

console.log(`\nTotal de usuarios cadastrados no Clerk: ${usuarios.length}\n`);

console.log("=== Contagem por loja ===");
for (const loja of lojas) {
  console.log(`${String(porLoja.get(loja).length).padStart(3)}  ${loja}`);
}
if (semLoja.length) {
  console.log(`${String(semLoja.length).padStart(3)}  (sem loja definida)`);
}

console.log("\n=== Usuarios por loja ===");
for (const loja of lojas) {
  const nomes = porLoja.get(loja).sort(cmp);
  console.log(`\n${loja} (${nomes.length}):`);
  for (const nome of nomes) console.log(`  - ${nome}`);
}
if (semLoja.length) {
  console.log(`\n(sem loja definida) (${semLoja.length}):`);
  for (const nome of semLoja.sort(cmp)) console.log(`  - ${nome}`);
}

console.log(`\nCSV gerado em: ${caminhoCsv}`);
