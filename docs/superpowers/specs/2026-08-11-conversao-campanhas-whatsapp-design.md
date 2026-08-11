# Conversão de campanhas WhatsApp — aba comparativa + página de detalhamento por campanha

## Contexto

O módulo Campanhas (`src/components/App/Campanhas/`) hoje mede só entrega/engajamento:
enviados, entregues, lidos, respondidos, falhas e custo (`hooks/useCampanhas.ts`,
`hooks/useKPIsCampanha.ts`, `tabs/CampanhasTab.tsx`, `components/CampanhaDrawer.tsx`). Não
existe nenhum número de **conversão em matrícula** por campanha — a pergunta "quantos
matricularam por causa desse disparo" hoje só dá pra responder rodando SQL na mão.

Investigação (campanha "Feirão de Matrículas 2026", 3 linhas em `campanhas` — Campo Grande,
Recreio, Barra, todas com `numero_meta_id` = "Conta Principal") confirmou o caminho de dados:

- Quando a Mila (agente IA vinculado ao mesmo `numero_meta_id`) qualifica um lead que respondeu
  ao disparo e transfere pro consultor, o webhook do agente grava 1 linha em `leads_campanhas`
  (`lead_id`, `campanha_slug`, `campanha_nome`, `created_at`) — `campanha_slug` vem de
  `agentes.tools[].config.campanha_label` (ex. `"feirao-matriculas26"`), **não** de
  `campanhas.id`. É um sistema de atribuição paralelo ao de disparo.
- `leads.aluno_id` aponta pro registro em `alunos` quando o lead converte. Testado nos 4
  matriculados reais do Feirão: os 4 têm `aluno_id` preenchido, `status='ativo'`,
  `is_segundo_curso=false` — o join `leads_campanhas → leads → alunos` é confiável.
- **`campanha_slug` sozinho não distingue as 3 linhas de `campanhas`** (CG/Recreio/Barra
  compartilham o mesmo slug, porque é o mesmo agente/label pros três). A distinção correta é
  `campanha_slug` + `leads.unidade_id = campanhas.unidade_id` — testado e bateu exato
  (17 leads CG / 10 Barra / 10 Recreio = 37, mesmo total das transferências em
  `agente_conversas`).
- A regra canônica de "isso é uma matrícula que conta" já existe e não deve ser duplicada:
  `ehMatriculaComercialCanonica` em `src/lib/comercialMatriculasCanonicas.ts:54` (exclui
  segundo curso, banda/coral, status cancelado/excluído, tipo fora da nova comercial). Contar só
  por `leads.converteu=true` infla o número (não aplica essas exclusões).

Motivo de pedido do usuário: decidir quando vale a pena continuar disparando um lote de
campanha (ex. Feirão) depende de ver conversão e custo por matrícula, não só entrega. Também foi
pedido, à parte, melhorar o detalhamento de cada campanha — hoje é um `Drawer` lateral
(`components/CampanhaDrawer.tsx`) com largura máxima 640px e o preview do template cortado em
`line-clamp-6` (`CampanhaDrawer.tsx:161`), insuficiente pra ver o template inteiro e as
conversas.

## Objetivo

1. Nova aba **"Conversão"** em `CampanhasPage.tsx`, comparando todas as campanhas: leads
   gerados, matriculados, taxa de conversão, custo por matrícula.
2. Nova **página de detalhamento por campanha** (rota própria, substitui o Drawer atual como
   ponto de entrada principal) mostrando tudo sem cortar: métricas de entrega, template
   completo, conversão daquela campanha específica, conversas, contatos, timeline.
3. Não duplicar a lógica de "o que conta como matrícula" — importar de
   `comercialMatriculasCanonicas.ts`.

## Fora de escopo (decidido explicitamente)

- **Mudar qualquer RPC/hook/métrica existente.** Tudo aqui é leitura nova sobre tabelas que já
  existem (`leads_campanhas`, `leads`, `alunos`, `campanhas`, `mensagens_campanha`,
  `conversas_campanha`). Nenhum consumidor atual (Comercial, Pré-Atendimento, Tráfego Pago) é
  tocado.
- **Atribuição via `graphify`/nova FK entre `campanhas` e `leads_campanhas`.** A distinção por
  `campanha_slug + unidade_id` é uma dependência conhecida do desenho atual de tracking (mesmo
  padrão usado hoje em Tráfego Pago para Meta Ads) — só funciona pra campanhas que têm um agente
  de qualificação por trás com `campanha_label` configurado. Campanhas de disparo puro, sem
  agente de resposta (não é o caso hoje, mas pode existir no futuro), não teriam como atribuir
  conversão por este caminho — ficará com "Leads gerados: 0" nesse cenário, não é um bug, é a
  ausência real de rastreamento.
- **Receita/LTV projetado.** Fica só custo por matrícula (dado que já existe,
  `campanhas.custo_real`). Ticket médio/LTV por matrícula não entra nesta fase.
- **Reenvio de falhas, edição de `limite_disparo`, pausar/retomar** — comportamento já existe no
  Drawer/`CampanhasTab.tsx`, só migra de lugar (drawer → página), sem mudar de lógica.
- **Mensagens em tempo real (realtime) na página de detalhamento.** A lista de conversas
  carrega ao abrir a página; não assina `postgres_changes` como o `ConversasTab.tsx` geral faz.
  Se no futuro isso incomodar, é extensão simples.

## Parte A — `hooks/useConversaoCampanhas.ts` (lib de atribuição, reaproveitável)

Novo hook que recebe opcionalmente um `campanhaId` (quando `null`/omitido, traz todas as
campanhas visíveis pro usuário; quando informado, filtra só aquela).

Fluxo por campanha:
1. Busca a campanha (`id, unidade_id, numero_meta_id, custo_real, custo_moeda`).
2. Busca o(s) agente(s) com esse `numero_meta_id` e extrai `campanha_label` de
   `tools[].config.campanha_label` (mesmo parsing que `LeadDrawer.tsx`/`ComercialPage.tsx` já
   fazem pra exibir a tag "📣 {campanha_nome}"). Se não achar agente/label, retorna zerado
   (ver "Fora de escopo").
3. Query em `leads_campanhas` (`campanha_slug = label`) com embed
   `leads(id, aluno_id, unidade_id, alunos(status, is_segundo_curso, is_banda, valor_parcela,
   valor_passaporte, cursos(nome, is_projeto_banda), tipos_matricula(codigo,
   conta_como_pagante, entra_ticket_medio)))`, filtrando `leads.unidade_id = campanha.unidade_id`
   no client (mesmo padrão client-side já usado em `TabComercialNew.tsx` pra métricas por
   canal — não é RPC).
4. `leadsGerados = ` total de linhas. `matriculados = ` linhas cujo `aluno` (via `aluno_id`)
   passa em `ehMatriculaComercialCanonica`.
5. Deriva: `taxaConversao = matriculados / leadsGerados`, `custoPorMatricula = custo_real /
   matriculados` (`null`/"—" se `matriculados === 0`, nunca dividir por zero).

Retorna, por campanha: `{ campanhaId, leadsGerados, matriculados, taxaConversao,
custoPorMatricula, matriculasDetalhe: [{ leadId, alunoId, nome, dataMatricula }] }` — o detalhe
alimenta tanto a aba geral (só precisa dos números) quanto a página de detalhamento (mostra a
lista de quem matriculou, com link pra ficha do aluno).

## Parte B — Aba "Conversão" em `CampanhasPage.tsx`

Novo item em `abas` (`{ id: 'conversao', label: 'Conversão', icon: TrendingUp }`), entre
"Campanhas" e "Conversas". `tabs/ConversaoTab.tsx` novo:

- Chama `useConversaoCampanhas()` (sem `campanhaId` → todas).
- Tabela (mesma linguagem visual dos cards existentes — fundo `slate-800/50`, borda
  `slate-700/50`, acento âmbar do módulo): colunas Campanha, Leads gerados, Matriculados, Taxa
  de conversão, Custo por matrícula. Cada linha é um botão/link que navega pra
  `/app/campanhas/:campanhaId`.
- Campanhas sem template/conversão ainda (recém-criadas, 0 enviados) aparecem com traço "—" nas
  colunas derivadas, não são escondidas.
- Sem filtro de período adicional — cada linha de `campanhas` já é uma unidade de disparo
  própria (se um Feirão futuro precisar de números por período, vira uma nova linha em
  `campanhas`, não um filtro aqui).

## Parte C — Página de detalhamento (`/app/campanhas/:campanhaId`)

Nova rota em `router.tsx`, ao lado de `campanhas` (mesmo guard `CampanhasGuard`, lazy):

```
{
  path: 'campanhas/:campanhaId',
  element: <CampanhasGuard><Suspense fallback={<PageLoader />}><CampanhaDetalhePage /></Suspense></CampanhasGuard>,
}
```

`src/components/App/Campanhas/CampanhaDetalhePage.tsx` — página cheia (não painel lateral),
promovendo o conteúdo do modo "expandido" do `CampanhaDrawer.tsx` atual pra layout de página, com
2 seções novas:

1. **Header**: nome, unidade, badge de status, ações (Pausar/Retomar — mesma call a
   `controle-campanha` que `CampanhasTab.tsx` já faz; botão voltar pra `/app/campanhas`).
2. **Métricas de entrega**: mesmo bloco do Drawer hoje (`DeliveryCoverageRing` +
   `MiniKPI` × 4 + alerta de falhas com "Reenviar") — reaproveitado, não recriado.
3. **Template completo** (novo): mesma busca em `templates_meta` que o Drawer já faz
   (`CampanhaDrawer.tsx:48-55`), mas **sem `line-clamp`** no corpo — texto inteiro, header de
   imagem em tamanho maior, botões.
4. **Conversão desta campanha** (novo): `useConversaoCampanhas(campanhaId)` — cards de Leads
   gerados / Matriculados / Taxa / Custo por matrícula, seguidos da lista `matriculasDetalhe`
   (nome do aluno, data da matrícula, link pra ficha — reaproveita rota/modal de ficha do aluno
   já existente em Alunos).
5. **Conversas** (novo): contatos que responderam a **esta** campanha — query em
   `mensagens_campanha` filtrada por `campanha_id`, agrupada por `conversa_id`/telefone, preview
   da última mensagem de cada thread. Ao clicar, abre o `ChatInfoPanel`/histórico completo
   (reaproveitar o que `ConversasTab.tsx` já usa para exibir uma conversa, não recriar o
   componente de chat).
6. **Contatos**: tabs + busca + lista que já existem no modo expandido do Drawer
   (`useContatosCampanha`, `BulkActionBar`) — movidos pra cá sem mudança de lógica.
7. **Timeline**: igual ao Drawer hoje (Criada/Iniciada/Concluída).

`CampanhaDrawer.tsx` deixa de ser o ponto de entrada principal — os cards em
`CampanhasTab.tsx` passam a navegar (`useNavigate` → `/app/campanhas/${c.id}`) em vez de abrir o
drawer. Definir se o componente `CampanhaDrawer.tsx` é removido ou mantido como preview rápido
(hover/click curto) é decisão de implementação, não estrutural — o comportamento mínimo exigido
é a página cheia existir e ser o destino do clique no card.

## Testes

1. **Atribuição por unidade:** com os dados reais do Feirão, `useConversaoCampanhas` sem
   `campanhaId` deve devolver Campo Grande=17 leads/1 matriculado (Mayara Caio Manhães de
   Moraes), Barra=10 leads/1 matriculado (Luíza P Caruso), Recreio=10 leads/2 matriculados
   (Benjamin Mota Falci Ramos, José Gabriel Borges) — confirmado por `leads.unidade_id` de cada
   um dos 4 convertidos, não pela contagem agregada por campanha_slug.
2. **Regra canônica aplicada:** criar (ambiente de teste) um lead convertido cujo `aluno`
   correspondente seja segundo curso (`is_segundo_curso=true`) ou banda — confirmar que **não**
   entra em `matriculados`, mesmo com `leads.converteu=true`.
3. **Divisão por zero:** campanha com `matriculados=0` mostra "—" em custo por matrícula, não
   `Infinity`/`NaN`/erro.
4. **Sem agente/label:** campanha cujo `numero_meta_id` não tem agente vinculado (ou agente sem
   `campanha_label` no `tools`) retorna `leadsGerados=0` sem lançar erro.
5. **Template sem corte:** na página de detalhamento, corpo do template com o texto real do
   Feirão (~700 caracteres) renderiza completo, sem `line-clamp`.
6. **Navegação:** clicar num card em `CampanhasTab.tsx` leva pra `/app/campanhas/:id` correta;
   clicar numa linha da aba Conversão leva pra mesma rota da campanha certa.
7. **Regressão:** `CampanhasTab.tsx`, `useKPIsCampanha.ts` e o realtime toast de
   `CampanhasPage.tsx` (novas mensagens inbound) continuam funcionando sem alteração de
   comportamento.
