# Versão mobile do LA Report — design

**Data:** 2026-09-12
**Task:** LAPE-32
**Mockup aprovado:** https://claude.ai/code/artifact/36946099-6925-4dcb-b5e2-e5c549d9eaef
**Status:** aprovado pelo Hugo em 12/09/2026. Próximo passo: plano de implementação.

---

## 1. O problema

O LA Report é usado todos os dias, em todas as funcionalidades, por toda a equipe — e no
celular ele é praticamente inutilizável. A causa é estrutural, não cosmética:
[`AppLayout.tsx:60`](../../../src/components/App/Layout/AppLayout.tsx) reserva
`marginLeft: 96px/256px` **fixo** para a sidebar. Num aparelho de 390px de largura sobra uma
faixa de conteúdo.

A versão desktop está boa e **não deve mudar**.

## 2. Escopo

| Item | Decisão |
|---|---|
| Público | Toda a equipe, todas as funcionalidades — entregue módulo a módulo |
| Aparelhos | Android (Chrome), iPhone (Safari), tablet/iPad |
| Offline | **Não.** Sem cache de dados |
| PWA na fase 1 | **Não.** Sem manifest, sem service worker, sem prompt de instalação |
| Desktop | Intocado |

### Por que a fase 1 não tem PWA

Decisão do Hugo em 12/09. O motivo técnico que a sustenta: **service worker e manifest são as
únicas peças que não voltam com `git revert`**.

- Um service worker registrado vive no navegador de cada pessoa. Apagar o arquivo e deployar
  não o remove de quem já o tem — o desfazer correto é publicar um SW suicida
  (`selfDestroying` do `vite-plugin-pwa`).
- Um manifest válido faz o Chrome anunciar a instalação sozinho: banner no Android **e um
  ícone de instalar na barra de endereço do desktop**. Ou seja, a peça mais irreversível é
  justamente a que mexe na cara do desktop que queremos intocado.

Sem essas duas peças, **a fase 1 inteira é reversível por deploy** e não deixa resíduo em
navegador nenhum.

### Fase 2 (só com OK explícito)

`manifest.json` + ícone `purpose: "maskable"` + service worker + botão "Instalar" discreto,
visível só no shell mobile. Obrigatório junto:

1. O documento HTML **nunca** é cache-first — só assets com hash no nome são cacheados.
2. `autoUpdate` + `clients.claim`, para versão nova assumir no próximo carregamento.
3. `beforeinstallprompt` + `preventDefault()`, para o prompt automático **não** aparecer.
4. `selfDestroying` testado **antes** do primeiro deploy real, não no dia do problema.

## 3. Abordagem escolhida: shell paralelo + reuso de hooks

```
router.tsx  (1 linha muda)
   └── ResponsiveLayout          ← arquivo novo, decide pelo breakpoint
         ├── AppLayout           ← intocado, byte a byte
         └── MobileLayout        ← arquivo novo
```

Telas mobile em `src/mobile/`, consumindo **os mesmos hooks** do desktop (72 já existem:
`useAgendaDia`, `useKPIsComercial`, `useHistoricoLTV`…).

### Alternativas descartadas

| Abordagem | Por que não |
|---|---|
| **B.** Responsivo in-place (breakpoints nos 362 componentes) | Toca todo arquivo do desktop, incluindo os de 7.560 linhas. Cada toque é risco de regressão no que está bom — e é exatamente o que o pedido excluía |
| **C.** App mobile separado (segundo entrypoint) | Duplicaria auth, RBAC, contextos e o client Supabase. Dois lugares para corrigir cada bug de permissão |

### Detecção de viewport

Hook `useIsMobile()` com `matchMedia` **e listener**. Ler só na montagem é o bug clássico:
quem gira o aparelho ou abre já em mobile fica com o shell errado até dar refresh.

**Corte em 1024px.** Cobre celular e iPad em retrato (768px, onde a sidebar comeria um terço
da tela). iPad em paisagem fica no desktop, que em 1024px é bom.

## 4. O contrato que não pode quebrar

O `AppLayout` entrega isto às páginas via `Outlet context`:

```ts
{ filtroAtivo, unidadeSelecionada, setUnidadeSelecionada, competencia, setPeriodoLabel }
```

O `MobileLayout` **precisa entregar o mesmo objeto**. Se divergir, toda página quebra ao ser
aberta no celular. **Isso vira teste**, não convenção.

## 5. Navegação

### Barra inferior (aprovada)

`Início · Alunos · Agenda · Admin · Mais`

Serve ADM, secretaria e coordenação — o maior grupo de uso. Os outros 14 módulos ficam a dois
toques, no "Mais".

### "Mais"

Bottom sheet com grade de 4 colunas, agrupada como a sidebar (*Principal* / *Operacional*),
para quem conhece o desktop não reaprender nada.

Respeita as regras de visibilidade que já existem: Campanhas por `campanhas_config.
visibilidade_global`, Tráfego Pago por lista fixa de e-mail, Automações por `isAdmin`.

### ⚠️ Fonte única do menu

A lista de itens e as regras de visibilidade moram **dentro** de `AppSidebar.tsx`. Copiá-las
para o mobile criaria duas fontes de verdade — e módulo novo apareceria num menu e não no
outro.

**Decisão:** extrair para `src/lib/menuItems.ts`; a sidebar passa a ler de lá. Isso **toca um
arquivo do desktop**, mas é mover dado sem mudar comportamento, e é travável por teste. É o
mesmo padrão que evitou as duplicatas de renovação: uma regra, um lugar.

### `safe-area-inset`

A barra inferior reserva `env(safe-area-inset-bottom)` desde a fase 1. **Não é coisa de PWA,
é do aparelho**: sem ela a barra fica atrás do traço de home do iPhone. Também precisa
tolerar a barra do Safari, que aparece e some conforme a rolagem.

## 6. Vocabulário visual

Descoberto durante a revisão do mockup: filtro e navegação estavam ambos em ciano, e o Hugo
leu a tela como tendo **dois menus concorrentes**. Se ele confundiu, a equipe confundiria.

| Forma | Significa | Onde |
|---|---|---|
| **Ciano** | Onde eu estou — só navegação | Barra inferior, aba ativa |
| **Pílula clara sólida + ícone de funil** | Filtro ligado | Topo da lista |
| **Trilho segmentado** | Escopo de período | Mês / Trimestre / Semestre |
| **Setas em volta da data, no cabeçalho** | Troca de dia | Agenda |

Regra: **ciano é exclusivo de navegação.** Data é *lugar*, filtro é *recorte* — virar pílula
fazia os dois parecerem a mesma coisa.

Isso vale para o sistema inteiro. Sem a regra escrita, o módulo 12 inventa um controle novo e
a confusão volta.

## 7. Os 6 arquétipos

Os 18 módulos caem em seis problemas de tela. Resolver os seis resolve o sistema — é o que faz
o segundo módulo custar uma fração do primeiro.

| # | Arquétipo | Padrão | Atende |
|---|---|---|---|
| 1 | Lista densa | Linha com 3 informações + drill-down | Alunos, Faturas, Professores, Time, Salas, Contratos |
| 2 | Grade do dia | Coluna cronológica, linha do "agora" | Agenda |
| 3 | Ficha | Cabeçalho fixo + abas + ação na base | Ficha do aluno, do professor, do lead |
| 4 | Conversa | Tela cheia, navegação em camadas | Caixa de Entrada, Pré-Atendimento, Campanhas |
| 5 | Formulário | Um campo por linha, alvo ≥44pt | Entrada, lançamentos, Config |
| 6 | Gráfico | Uma série por cartão, número grande | Dashboard, Analytics, Metas, Tráfego Pago |

Notas de conteúdo que vieram do domínio, não do layout:

- **Arquétipo 1:** tabela de 20 colunas não encolhe. A linha mostra quem, com quem/quando, e o
  que exige ação. O resto mora na ficha.
- **Arquétipo 2:** cor marca **exceção** (acontecendo, experimental, cancelada); aula normal
  fica neutra — é a regra que o desktop já segue.
- **Arquétipo 3:** a ação de maior valor fica na base, na zona do polegar.
- **Arquétipo 5:** o texto de ajuda carrega a regra de negócio no ponto da decisão (ex.: a
  competência da renovação vem da 1ª aula do novo ciclo, não da data de hoje).
- **Arquétipo 6:** a nota do recesso escolar (19/07–01/08) acompanha o gráfico. Sem ela,
  julho lê como perda de aluno, que é a leitura errada mais provável.

## 8. Módulos ainda não portados

**Degradar, não bloquear** (aprovado). A tela desktop renderiza dentro do shell mobile, com
scroll horizontal e uma faixa âmbar: *"Tela ainda não adaptada. Funciona, mas rola para o
lado."*

Motivo: a equipe usa tudo, todo dia, e hoje essas telas já abrem no celular — desajeitadas,
mas abrem. Bloquear com "abra no computador" **tiraria acesso que existe** em 17 módulos de
uma vez, e a primeira semana do mobile seria uma reclamação por módulo.

A faixa some sozinha quando o módulo é portado, e funciona como lista de pendências visível.

## 9. Sequência

1. **Menu e shell** — a fundação. Sem menu, nenhum módulo é alcançável no celular
2. **Dashboard** — primeira tela que todos abrem
3. **Demais módulos**, um a um, cada um reusando seu arquétipo

## 10. Rollback

| Camada | Mecanismo |
|---|---|
| Aplicação | A bifurcação de shell lê uma flag → desligar é redeploy, não revert |
| Código | Branch/PR por módulo; reverter um não derruba os outros |
| Resíduo no navegador | **Nenhum na fase 1** — é o que a ausência de SW/manifest garante |

## 11. Como testar

`vite.config.ts` já tem `host: '0.0.0.0'` → abrir `http://<ip-da-máquina>:5175` no celular, na
mesma Wi-Fi. Layout, toque, rolagem e bottom sheet: tudo testável sem deploy e sem exposição.

⚠️ **IP local não é secure context.** Serve para layout, mas não registra service worker nem
oferece instalação. Quando a fase 2 chegar:

- **Android:** `chrome://inspect` com port forwarding — o celular enxerga como `localhost`,
  vira secure context, e continua privado.
- **iPhone:** não tem equivalente. Exige HTTPS real (túnel efêmero ou preview da Vercel).

## 12. Privacidade do trabalho

Branch **local, sem push**, enquanto for desenho visual. `git push` de branch gera preview na
Vercel automaticamente (projeto `la-performance-report` ligado a
`LucianoAlf/LAperformanceReport`) e a branch fica visível no GitHub.

Risco aceito: perder trabalho se a máquina morrer. Mitigação: commits locais frequentes.

## 13. Riscos conhecidos

| Risco | Tratamento |
|---|---|
| **Tailwind vem do CDN** (`cdn.tailwindcss.com`), config inline no `index.html`. É explicitamente não-produção e complica `safe-area-inset` e container queries | Não resolver agora. Usar `env()` em CSS puro onde precisar. Migrar o Tailwind para build é frente própria, fora deste escopo |
| **Lógica presa na página** em módulos monolíticos: `ComercialPage` tem 7.560 linhas, 93 `useState/useEffect` e 34 chamadas Supabase soltas | Extrair hook quando chegar a vez do módulo. É mover código, travado por teste — não é reescrita |
| Divergência do contrato do `Outlet context` | Teste que compara as chaves entregues pelos dois layouts |
| Módulo novo aparecer num menu e não no outro | Fonte única em `src/lib/menuItems.ts` (§5) |

## 14. Fora de escopo

- Offline e escrita offline
- PWA (fase 2)
- Migrar Tailwind do CDN para build
- Refatorar `ComercialPage` além do necessário para extrair seus hooks
- Redesenhar qualquer tela do desktop
