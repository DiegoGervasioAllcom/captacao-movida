// =========================================================================
// Relatorio: quantos usuarios (vendedores) por loja + o nome de cada um.
//
// O Clerk NAO permite filtrar por publicMetadata no painel nem na query da
// API - por isso listamos TODOS os usuarios e agrupamos por `loja` aqui,
// usando a mesma leitura case-insensitive de src/lib/loja.ts.
//
// COMO RODAR (a chave vem do .env, nunca no codigo):
//   node --env-file=.env scripts/usuarios-por-loja.mjs
//   npm run usuarios-por-loja
//
// Alem de imprimir o relatorio, gera um CSV (separador ";" + BOM, igual ao
// export do painel do gestor) em usuarios-por-loja.csv - abre direto no
// Excel. O nome do arquivo pode ser trocado com --out=<caminho>.
//
// LGPD: isto le dado pessoal de COLABORADOR (nome do vendedor + loja). E uma
// operacao de gestor/admin. De proposito NAO imprime/exporta e-mail, telefone
// nem senha - so nome e loja, o minimo pra responder "quem esta em qual loja".
// O CSV gerado contem nome de pessoas: trate como dado pessoal (nao versione,
// nao compartilhe fora da lista de gestores). Ja esta no .gitignore.
// =========================================================================
import { writeFileSync } from "node:fs";
import { createClerkClient } from "@clerk/backend";

const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) {
  console.error(
    "Falta CLERK_SECRET_KEY no ambiente.\n" +
      "Rode assim (a chave vem do .env):\n" +
      "  node --env-file=.env scripts/usuarios-por-loja.mjs",
  );
  process.exit(1);
}

const clerk = createClerkClient({ secretKey });

// Mesma logica de lojaFromPublicMetadata (src/lib/loja.ts): a chave "loja"
// e procurada ignorando maiusculas/minusculas porque quem cadastra no painel
// do Clerk digita a mao e a grafia varia.
function lojaDoMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return null;
  const chave = Object.keys(metadata).find((k) => k.toLowerCase() === "loja");
  const valor = chave ? metadata[chave] : undefined;
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

function nomeDoUsuario(u) {
  const nome = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  if (nome) return nome;
  // fallback quando o vendedor nao preencheu o nome
  return u.emailAddresses?.[0]?.emailAddress || u.username || u.id;
}

const LIMITE = 100;
let offset = 0;
let total = Infinity;
const usuarios = [];

while (offset < total) {
  const { data, totalCount } = await clerk.users.getUserList({
    limit: LIMITE,
    offset,
  });
  total = totalCount;
  if (!data.length) break;
  usuarios.push(...data);
  offset += data.length;
}

const porLoja = new Map();
const semLoja = [];
for (const u of usuarios) {
  const loja = lojaDoMetadata(u.publicMetadata);
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
