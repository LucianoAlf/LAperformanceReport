# Base de Conhecimento no LA Report — design

**Data:** 2026-08-20
**Autor:** Hugo + Claude
**Status:** aprovado para plano de implementação

## Problema

A tool `bd_conhecimento` dos agentes SDR Mila aponta para um artigo do Help Center do
Chatwoot que **não existe mais**:

```
https://chatla.latecnology.com.br/hc/la-music/articles/1755367413-base-de-conhecimento
→ HTTP 404
```

Verificado em 2026-08-20:

- O nó `bd_conhecimento` (`n8n-nodes-base.httpRequestTool`) existe e está **ligado como
  `ai_tool`** ao agente `SDR WHATSAPP` nos dois workflows ativos — `Agente SDR Mila CG`
  (`aHD4kJdzByLwFXA1`) e `Agente SDR Mila Recreio` (`gSHJHYMOYDQZqleW`). Nenhum está
  desabilitado. Não há Mila Barra ativa.
- No Chatwoot só existe hoje o portal `grupo-la`, com 3 artigos (Termos de Serviço,
  Política de Privacidade e um "Cursos" de 3 linhas). O portal `la-music` e o artigo
  `1755367413` foram deletados.
- Sem snapshot no Wayback Machine — o conteúdo do artigo é **irrecuperável**.

**Impacto:** o system prompt da Mila manda usar `bd_conhecimento` em cinco momentos —
etapa 4 (apresentar diferenciais), contorno da objeção "vou pensar", contorno de preço,
e *"sempre que receber uma pergunta cuja resposta não está neste prompt"*. Toda chamada
recebe 404. A Mila argumenta benefício e diferencial **sem fonte** há meses.

## O que já existe (e por que não serve como está)

A tabela `mila_config` tem a coluna `base_conhecimento text`, editável hoje em
**Pré-Atendimento → Configurações → "Mila - Atendente IA" → "Prompt e Base de
Conhecimento"** ([ConfigPreAtendimentoTab.tsx:890](../../../src/components/App/PreAtendimento/tabs/ConfigPreAtendimentoTab.tsx#L890)).

Estado real:

- **1 linha só** — Campo Grande, `ativo=true`, 1.170 caracteres, `updated_at` 2026-04-22.
  Recreio e Barra não têm linha (a tela mostra "Mila não configurada para esta unidade").
- O texto é **idêntico** ao da migration de seed `20260218_mila_agente_seed_cg.sql` —
  nunca foi editado depois de semeado. Nenhuma versão maior se perdeu.
- Quem lê essa coluna é a edge `mila-processar-mensagem` (v33, deployada), uma tentativa
  de rodar a Mila dentro do Supabase que está **parada**: `mila_message_buffer` tem 19
  linhas, a última de 2026-07-02, e `transferencias_mila` está zerada.

Ou seja: **uma base sem leitor e um leitor sem base**. O conteúdo existe e está certo;
o que falta é a Mila do n8n conseguir chegar nele.

Não serve como está por três motivos: é texto único (não dá para revisar ou desativar um
pedaço), é preso a `unidade_id` obrigatório (não existe conteúdo global) e mora numa
tabela de configuração técnica do agente, não num lugar onde a equipe comercial escreve.

## Conteúdo atual (preservado integralmente)

Quatro blocos, que viram a carga inicial da tabela nova:

| Bloco | Conteúdo |
|---|---|
| Diferenciais | 9 itens (maior escola do Rio, 12+ anos, metodologia própria, aula experimental gratuita…) |
| Como funciona | 4 itens (1×/semana, 50 min, individual, atividades extras) |
| Faixas etárias | 4 faixas (bebês → LA Music School) |
| Benefícios da música | 7 itens (cognitivo, concentração, socialização…) |

⚠️ Essa base é **magra** para o que o prompt espera dela. Não há nada sobre preços,
política de reposição de falta, planos, estrutura física ou o que acontece na primeira
aula — todos assuntos que o prompt delega explicitamente à tool. Engordar isso é trabalho
da equipe comercial na tela nova, e é o ganho principal da feature.

## Decisões

| Decisão | Escolha | Motivo |
|---|---|---|
| Formato | Blocos com título | Revisar/desativar um pedaço sem tocar no resto |
| Escopo | Global por padrão, exceção por unidade | Quase tudo vale para a rede; sem duplicar texto 3× |
| Consumidores | Mila (n8n) + equipe humana | Confirmado com o Hugo |
| Nó do n8n | **Mantido** — só troca a URL | Pedido explícito: "ela vai continuar, só consultando o conhecimento novo" |
| Retorno da edge | `text/plain` (markdown) | `httpRequestTool` joga a resposta crua no LLM; markdown lê melhor e mais barato que JSON escapado |
| Acesso | Token na query string | Não exige header no nó do n8n e não deixa os argumentos comerciais abertos na internet |
| Montagem do texto | **RPC**, não dentro da edge | Tela e edge chamam a mesma função — o preview não pode divergir do que a Mila recebe |
| Edge existe por quê | Só transporte (token + `text/plain`) | RPC direta exigiria `EXECUTE` para `anon`, e a anon key é pública (está no bundle do front) |
| Onde fica a tela | **Subaba** de Configurações | Decisão do Hugo; junto com a repaginação da tela, que hoje é uma coluna infinita |
| Campo antigo | **Preservado**, vira leitura | Nada é apagado; o Hugo compara os dois lado a lado antes de esconder |
| Busca semântica / RAG | **Fora de escopo** | ~1.200 caracteres cabem inteiros no contexto; indexar seria complexidade inventada |

## Arquitetura

```
   subaba Conhecimento ──escreve──► base_conhecimento_blocos
   (Configurações)                   (global + por unidade)
          │                                    ▲
          │ "Ver como a Mila vê"               │ lê
          └──────────────┐          ┌──────────┘
                         ▼          │
              RPC get_base_conhecimento(p_unidade_id)
                    (única fonte de montagem)
                         ▲
                         │ chama
              ┌──────────────────────────┐
              │ edge base-conhecimento   │  ← só transporte:
              │ GET ?unidade=&token=     │    valida token,
              │ → text/plain (markdown)  │    devolve text/plain
              └──────────────────────────┘
                         ▲ GET
          ┌──────────────┴──────────────────────┐
          │ nó bd_conhecimento (o mesmo de hoje)│
          │  Mila CG  ·  Mila Recreio           │
          └─────────────────────────────────────┘
```

### 1. Tabela `base_conhecimento_blocos`

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | uuid pk | `gen_random_uuid()` |
| `titulo` | text not null | vira `## Título` no texto entregue |
| `conteudo` | text not null | markdown livre |
| `unidade_id` | uuid null → `unidades(id)` | **NULL = global** (vale para as 3) |
| `ordem` | int not null default 0 | ordem de montagem do texto |
| `ativo` | bool not null default true | bloco inativo não vai para a Mila nem conta |
| `atualizado_por` | uuid null → `usuarios(id)` | quem mexeu por último |
| `created_at` / `updated_at` | timestamptz | `updated_at` por trigger |

Índice: `(ativo, unidade_id, ordem)` — é o predicado exato da edge.

**RLS:** seguir o padrão já usado em `crm_templates_whatsapp`
(`20260630141000_seguranca_rls_grupo_b_enable_policies.sql`):
`FOR ALL TO authenticated, mila_acesso_restrito, sol_acesso_restrito USING (true) WITH CHECK (true)`.
Conteúdo institucional, não dado sensível por unidade — não replicar aqui o escopo por
unidade das views de faturas.

**Carga inicial:** a migration **lê** `mila_config.base_conhecimento` de Campo Grande,
quebra pelos `##` e insere os 4 blocos como **globais** (`unidade_id = NULL`).
🔒 Nenhum `UPDATE` e nenhum `DELETE` em `mila_config`. A coluna original fica intacta no
banco, e o mesmo texto segue versionado em `20260218_mila_agente_seed_cg.sql` — duas
cópias independentes do que a tabela nova fizer.

### 2. RPC `get_base_conhecimento` + edge `base-conhecimento`

**A montagem do texto mora na RPC**, não na edge:

```sql
get_base_conhecimento(p_unidade_id uuid default null) returns text  -- STABLE
```

Devolve `# Base de Conhecimento LA Music` + os blocos `ativo = true` com
`unidade_id is null or unidade_id = p_unidade_id`, ordenados por `ordem, titulo`, cada um
como `## {titulo}` + `{conteudo}`. Sem unidade: só os globais (degrada, não quebra).

🔒 **Por que a montagem é RPC e não código da edge:** a tela precisa do mesmo texto para o
botão "Ver como a Mila vê". Se a concatenação morasse na edge, o front teria que
reimplementá-la em TypeScript — duas implementações da mesma regra, que é a causa-raiz
documentada das duplicatas de renovação (`FormRenovacao` × webhook calculando competência
de formas diferentes). A tela chama a RPC; a edge chama a mesma RPC.

⚠️ `revoke execute ... from anon` explícito depois de criar. `ALTER DEFAULT PRIVILEGES`
neste schema concede `EXECUTE` a `anon` em função nova, e `revoke from public` **não
basta** — pegou `get_agenda_dia`, `get_kpis_alunos_canonicos_base_v131` e a de retificação
(3×). Conferir `proacl` em `pg_proc`; o correto é `{postgres=X, authenticated=X, service_role=X}`.

**A edge é só transporte** (~15 linhas, nenhuma regra de negócio):

```
GET /functions/v1/base-conhecimento?unidade=<slug|uuid>&token=<token>
→ 200 text/plain; charset=utf-8, corpo markdown
→ 401 se token inválido · 400 se unidade desconhecida
```

Valida o token, resolve a unidade, chama a RPC como `service_role`, devolve o texto.

**Por que não deixar o n8n chamar a RPC direto pelo PostgREST:** precisaria da `apikey`
na URL, e a única disponível é a **anon key — que é pública** (está no bundle JS do LA
Report). Para funcionar, a função precisaria de `EXECUTE` para `anon`, o que deixaria a
base legível para qualquer um na internet. Um token dedicado tem escopo mínimo. Além
disso, PostgREST devolveria JSON com `\n` escapado, e não markdown limpo.

- `verify_jwt = false` no `config.toml`.
  ⚠️ **Deploy pelo MCP reseta `verify_jwt` para `true` e não lê o `config.toml`** — já
  derrubou `sync-inadimplencia-emusys` e `sync-presenca-emusys` nesse projeto. Passar o
  flag explícito no deploy e **conferir depois** que a URL responde 200 sem header.
- Token em secret (`BASE_CONHECIMENTO_TOKEN`), comparado em tempo constante.
- Sem unidade informada: devolve só os blocos globais (degrada, não quebra).

### 3. Subaba "Conhecimento" + repaginação de Configurações

A tela hoje ([ConfigPreAtendimentoTab.tsx](../../../src/components/App/PreAtendimento/tabs/ConfigPreAtendimentoTab.tsx))
é **917 linhas** com três blocos empilhados numa coluna só — Visitas (l. 403), Feriados
(l. 540) e Mila (l. 696) — e a base de conhecimento cai na linha 890 de 917. Acrescentar
uma quarta seção nessa coluna pioraria o problema, então a repaginação entra junto.

```
Pré-Atendimento › Configurações
┌──────────────────────────────────────────────────────────┐
│  Unidade: [ Campo Grande ▾ ]          ← um seletor só    │
│  ◍ Visitas   ○ Feriados   ○ Mila   ○ Conhecimento        │
│  ────────────────────────────────────────────────────    │
│   (conteúdo da subaba escolhida)                         │
└──────────────────────────────────────────────────────────┘
```

**Subabas** com estilo mais discreto que o `PageTabs` do nível de cima (pílula menor, sem
gradiente) — duas fileiras de pílulas idênticas confundem qual nível é qual.

**Um seletor de unidade só**, no topo da aba. Hoje Visitas e Mila têm cada um o seu, em
pontos diferentes da rolagem. Seletor **próprio da aba** (as 3 unidades, começando na
primeira), não o filtro global do cabeçalho: configuração sempre precisa de UMA unidade,
e "Consolidado" — onde o Hugo normalmente está — não faz sentido para editar horário de
visita ou prompt. Feriados ignora (é por ano).

**Quebra de arquivo.** `ConfigPreAtendimentoTab.tsx` vira a casca com as subabas e o
seletor; cada seção sai para `config/VisitasSection.tsx`, `config/FeriadosSection.tsx`,
`config/MilaSection.tsx`, `config/ConhecimentoSection.tsx`. Comportamento das três
existentes é **preservado** — é movimentação, não reescrita.

Na subaba Conhecimento:

- lista de blocos: título, badge de escopo (Global / Campo Grande / Recreio / Barra),
  toggle `ativo`, reordenar, criar, editar, excluir;
- `hooks/useBaseConhecimento.ts` — CRUD direto no client Supabase (padrão do projeto,
  sem React Query);
- **Botão "Ver como a Mila vê"** — modal com o texto exato que a Mila recebe, vindo da
  RPC `get_base_conhecimento`. Sem isso a equipe escreve às cegas e só descobre o
  resultado numa conversa real com lead.

Conhecimento é subaba **irmã** de Mila, não uma seção dentro dela: o conteúdo é da escola
(diferenciais, FAQ, política) e quem escreve é o comercial; a subaba Mila é config técnica
do agente (prompt, modelo, temperatura, token). Misturar as duas é o que fez a base de
conhecimento ficar escondida no rodapé de uma tela de configuração e passar meses sem
ninguém tocar.

O textarea `base_conhecimento` continua na subaba **Mila**, **visível e desabilitado**,
com aviso apontando para a subaba Conhecimento. Some só quando o Hugo confirmar que os
blocos estão corretos — nunca antes, e nunca junto com o dado.

### 4. n8n — 2 nós

Nos workflows CG e Recreio, no nó `bd_conhecimento`:

- `url` → a da edge, com `unidade` e `token` da unidade daquele workflow.
- `toolDescription` → hoje diz *"fazer pesquisa no link disponível"*; passa a descrever
  a base da unidade e o que ela cobre.

⚠️ Os dois workflows estão **ativos em produção**. Só encostar neles com OK explícito do
Hugo no momento, e depois de a URL responder certo no navegador.

## Ordem de entrega

1. Migration: tabela + RLS + carga dos 4 blocos + RPC `get_base_conhecimento` — nada
   quebra, ninguém lê ainda.
2. Edge + secret — testável por URL no navegador, isolada.
3. Repaginação: casca com subabas + seletor único + as 3 seções movidas para
   `config/*.tsx`, comportamento inalterado.
4. Subaba Conhecimento + textarea antigo em leitura — a equipe já pode escrever.
5. n8n (com OK na hora) — a Mila só troca de fonte quando já há o que ler do outro lado.

Passos 3 e 4 separados de propósito: se a movimentação das seções quebrar alguma coisa,
o defeito não se mistura com a funcionalidade nova.

## Riscos e pontos de atenção

- **`verify_jwt` resetado no deploy** — ver §2. Conferir com `curl` sem header depois de
  cada deploy.
- **Edge `mila-processar-mensagem` (parada)** segue lendo `mila_config.base_conhecimento`.
  Como a coluna não é tocada, ela continua funcionando exatamente como hoje. Se um dia
  voltar a rodar, deve passar a ler da tabela nova — fora do escopo, anotado.
- **Duas fontes de escrita** — o motivo de o textarea virar leitura. Duas telas gravando
  a mesma informação foi a causa-raiz das duplicatas de renovação neste projeto.
- **Bloco pesado demais** — não há limite de tamanho por bloco. Se a base crescer muito,
  o custo por chamada da Mila sobe (a tool devolve tudo, sempre). Sinal para revisitar:
  passar de ~8.000 caracteres no total. Aí sim vale recorte por assunto ou busca.
- **`EXECUTE` para `anon` na RPC** — ver §2. Conferir `proacl` depois de criar, e de novo
  depois de qualquer `DROP+CREATE`.
- **Regressão na repaginação** — mover Visitas/Feriados/Mila de arquivo mexe em tela que
  funciona hoje. Por isso o passo 3 é isolado do 4, e o comportamento das três seções é
  preservado sem reescrita.
- **Painel Mila travado no loading** (observado em 2026-08-20, aba `MilaTab` no
  Consolidado) — problema separado, não tratado aqui.
