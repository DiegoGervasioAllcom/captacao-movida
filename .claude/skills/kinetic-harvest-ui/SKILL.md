---
name: kinetic-harvest-ui
description: >-
  Sistema de design "Kinetic Harvest" do projeto: design tokens (CSS vars) e classes cm-*
  para construir telas Next.js consistentes, mobile-first e acessíveis. Use ao criar/editar
  páginas, componentes, formulários, botões, tabelas, cards, alertas ou qualquer CSS/estilo.
---

# Design System "Kinetic Harvest"

Tudo em `src/app/globals.css`. **Não** adicione bibliotecas de UI nem cores hardcoded — use os tokens e as classes `cm-*`. Mobile-first (estilos base p/ celular; media queries ampliam).

## Tokens (CSS variables) — use sempre `var(--token)`
- **Superfícies:** `--surface`, `--surface-container`, `--surface-container-low/high/highest`, `--surface-container-lowest`.
- **Texto:** `--on-surface`, `--on-surface-variant`, `--inverse-surface`/`--inverse-on-surface`.
- **Primária (Harvest Gold):** `--primary`, `--on-primary`, `--primary-container`, `--harvest-gold`.
- **Secundária (Velocity Green):** `--secondary`, `--secondary-container`, `--velocity-green`.
- **Terciária:** `--tertiary`, `--tertiary-container`. **Erro:** `--error`, `--error-container`, `--on-error`.
- **Bordas/raios:** `--outline`, `--outline-variant`; `--radius-sm/md/lg/xl/full`.
- **Espaço (base 4px):** `--space-1..6`. **Fontes:** `--font-sans` (Hanken Grotesk), `--font-mono` (JetBrains Mono).

## Classes `cm-*` (reaproveite)
- Layout: `cm-page`, `cm-wrap`, `cm-header`, `cm-row`, `cm-toolbar`.
- Cartões/texto: `cm-card`, `cm-card-title`, `cm-card-sub`, `cm-muted`, `cm-empty`.
- Formulário: `cm-field` (label+input+erro), `cm-err`, `cm-hint`, `cm-btn`, `cm-btn-ghost`, `cm-btn-sm`.
- Feedback: `cm-alert` + `cm-alert-err` / `cm-alert-ok`; `cm-chip` + `cm-chip-ok`.
- Dados: `cm-stats`/`cm-stat`/`cm-stat-label`/`cm-stat-value`; `cm-table`/`cm-table-scroll`; `cm-list-item`/`cm-list-name`/`cm-list-meta`; `cm-placa` (badge de placa); `cm-search`; `cm-live`.
- Utilitário: `cm-sr-only` (acessibilidade).

## Convenções
1. Reaproveite a classe existente antes de criar uma nova; se criar, siga o prefixo `cm-` e os tokens.
2. Acessibilidade obrigatória: `label` ligado por `htmlFor/id`, `aria-invalid`, `aria-describedby`, `role="alert"` (erro) / `role="status"` (sucesso), `cm-sr-only` para rótulos visuais ocultos. Textos em **pt-BR**.
3. Inputs de telefone/placa usam as máscaras de `src/lib/validation.ts` (veja skill `captacao-validation`).
4. Datas exibidas via `formatarDataHora` (`src/lib/format.ts`), padrão pt-BR.
