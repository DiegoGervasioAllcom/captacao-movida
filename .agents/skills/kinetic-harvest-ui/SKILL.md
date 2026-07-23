---
name: kinetic-harvest-ui
description: >-
  Os dois regimes de estilo do projeto: design tokens (CSS vars) + classes cm-* de
  globals.css (painel do gestor) e CSS Modules fiéis ao Figma "Supper Certo" (tela de
  login e área do vendedor), sempre mobile-first e acessível. Use ao criar/editar
  páginas, componentes, formulários, botões, tabelas, cards, alertas ou qualquer
  CSS/estilo.
---

# Estilo do projeto: dois regimes

**Não** adicione bibliotecas de UI. Mobile-first (estilos base p/ celular; media queries ampliam). Antes de estilizar, identifique o regime:

| Tela | Regime | Arquivo |
|------|--------|---------|
| Painel do gestor, AppHeader, Brand | Tokens + classes `cm-*` (Kinetic Harvest) | `src/app/globals.css` |
| Tela de login (raiz) | CSS Module fiel ao Figma | `src/components/login/login.module.css` |
| Área do vendedor (IndicacaoHeader, CapturaForm, lista) | CSS Module fiel ao Figma | `src/components/vendedor/indicacao.module.css` |

## Regime 1 — Kinetic Harvest (gestor)
Sem cores hardcoded — use `var(--token)`:
- **Superfícies:** `--surface`, `--surface-dim/bright`, `--surface-container` (`-lowest/-low/-high/-highest`). **Texto:** `--on-surface`, `--on-surface-variant`, `--inverse-*`.
- **Primária (Harvest Gold):** `--primary`, `--on-primary`, `--primary-container`, `--harvest-gold`. **Secundária:** `--secondary`, `--secondary-container`, `--velocity-green`. **Terciária/Erro:** `--tertiary*`, `--error*`.
- **Bordas/raios:** `--outline`, `--outline-variant`; `--radius-sm`, `--radius` (0.5rem, padrão de inputs/botões/alertas), `--radius-md/lg/xl/full`.
- **Espaço (base 4px):** `--space-1..6`, `--space-8`, `--space-10`; layout: `--gutter` (16px mobile / 24px ≥768px), `--page-max` (1440px). **Fontes:** `--font-sans` (Hanken Grotesk), `--font-mono` (JetBrains Mono).

Classes `cm-*` existentes (todas em uso — reaproveite): layout `cm-page`, `cm-wrap`, `cm-header`, `cm-row`, `cm-toolbar`; marca `cm-brand`, `cm-logo`; cartões/texto `cm-card`, `cm-card-title`, `cm-card-sub`, `cm-muted`, `cm-empty`; botões `cm-btn`, `cm-btn-ghost`, `cm-btn-sm`; feedback `cm-alert` + `cm-alert-err`, `cm-chip` + `cm-chip-ok`, `cm-live`; dados `cm-stats`/`cm-stat`/`cm-stat-label`/`cm-stat-value`, `cm-table`/`cm-table-scroll`, `cm-placa`, `cm-search`; utilitário `cm-sr-only`.
(O CSS morto da tela de auth antiga — `cm-auth-*`, `cm-step*`, `cm-field`, `cm-list-*` etc. — foi removido em 2026-07-11; formulário de erro/sucesso do vendedor vive no CSS Module, não em `cm-*`.)

## Regime 2 — Telas Figma "Supper Certo" (login + vendedor)
- As **cores fixas da marca são intencionais** — não converta pra tokens nem "corrija": laranja `#f26a1b`, roxo `#7c4dff`, fundo do login `#0b0710`, botão do vendedor com gradiente `#f4ab3d→#eb9a2b`, fonte Montserrat.
- Os módulos **reutilizam tokens** de espaçamento/raio/superfície (`var(--space-*)`, `var(--radius*)`, `var(--surface-*)`) onde possível — siga esse equilíbrio: cor da marca fixa, geometria por token.
- `login.module.css`: palco com assets PNG de `/public/login/` (bg-plate, tl-art, moedas, logos, avatar, card-border), card alterna `cardTall` no modo criar conta.
- `indicacao.module.css`: header, pills, card do formulário (`field`, `label`, `input`, `hint`, `err`, `button`, `alert*`), lista (`listItem`, `listName`, `listMeta`, `placa`).
- Classe nova nesses regimes → dentro do módulo correspondente, não em `globals.css`.

## Convenções (valem nos dois regimes)
1. Reaproveite classe existente antes de criar; prefixo `cm-` só em `globals.css`.
2. Acessibilidade obrigatória: `label` ligado por `htmlFor/id`, `aria-invalid`, `aria-describedby`, `role="alert"` (erro) / `role="status"` (sucesso), `cm-sr-only` para rótulos ocultos. Textos em **pt-BR**. Foco visível global já existe (`:focus-visible` com outline Harvest Gold).
3. Inputs de telefone/placa usam as máscaras de `src/lib/validation.ts` (skill `captacao-validation`).
4. Datas exibidas via `formatarDataHora` (`src/lib/format.ts`), padrão pt-BR.
