import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Gera um servidor mínimo em .next/standalone (só o necessário para rodar),
  // permitindo uma imagem Docker bem pequena. Ver Dockerfile / DOCKER.md.
  output: "standalone",
  // Fixa a raiz do tracing no projeto. Sem isso, o Next detecta o
  // package-lock.json da pasta-pai e aninha o standalone em subpastas,
  // quebrando o COPY do Dockerfile.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
