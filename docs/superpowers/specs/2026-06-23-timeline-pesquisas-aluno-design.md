# Timeline de Pesquisas do Aluno — Design

**Data:** 2026-06-23
**Autor:** Hugo (via Claude)
**Origem:** Pedido da Fabíola (Sucesso do Aluno) — continuação da pendência P3 ("histórico de avaliações no onboarding do aluno").

## Contexto

A Fabíola pediu uma **linha do tempo do aluno** onde todas as pesquisas da jornada apareçam cronologicamente, acessível a qualquer momento na ficha de detalhe do aluno. Cada marco mostra nota (estrelas), comentário opcional e a possibilidade de marcar que o aluno **não respondeu**.

Hoje existe:
- Tabela `pesquisas_whatsapp` com `tipo='pos_primeira_aula'` (coleta automática por WhatsApp via `processar-resposta-pesquisa` + lançamento manual via `registrar_resposta_pesquisa_manual`, criado em 2026-06-23).
- Aba "Respostas" (`RespostasPesquisaTab`) — visão **agregada** (KPIs, recortes), não por aluno.
- Pesquisa de evasão — **fluxo separado** (RPC própria, respostas em texto/áudio, não estrelas).

A visão **por aluno** ainda não existe. É o que este spec cobre.

## Objetivo

Entregar uma timeline de pesquisas **por aluno**, embutida nas fichas de detalhe existentes, com a régua de marcos **1ª aula → 3 meses → evasão**. Nesta entrega só a 1ª aula é preenchível; os demais marcos aparecem como "Em breve".

## Decisões tomadas (brainstorming)

- **Ponto de entrada:** ficha de detalhe do aluno (componente isolado embutido em mais de um lugar).
- **Régua de marcos:** 1ª aula → 3 meses → evasão.
- **Modelo de dados:** reusar `pesquisas_whatsapp` (Abordagem A) — sem tabela nova, sem duplicação.
- **Comentário e "não respondeu":** entram pelo fluxo de lançamento manual.
- **Granularidade:** timeline ligada à matrícula da ficha aberta (`aluno_id`), consistente com a pesquisa pós-1ª aula.

## Design

### 1. Banco de dados

Migration aditiva em `pesquisas_whatsapp`:

- **`comentario`** `text` NULL — comentário opcional.
- **`status`** `text` NULL — estado do marco, fonte da verdade:
  - `respondida` — tem nota.
  - `nao_respondida` — marcada explicitamente como não respondida.
  - `pendente` — enviada, aguardando resposta.

Backfill dos registros existentes:
```sql
UPDATE pesquisas_whatsapp
SET status = CASE WHEN nota IS NOT NULL THEN 'respondida' ELSE 'pendente' END
WHERE status IS NULL;
```

Constraint de unicidade lógica: **1 registro ativo por (`aluno_id`, `tipo`)**. Para suportar upsert de forma segura, criar índice único parcial:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pesquisa_aluno_tipo
  ON pesquisas_whatsapp (aluno_id, tipo);
```
> Risco a validar antes de aplicar: confirmar que não há duplicatas `(aluno_id, tipo)` pré-existentes (tabela hoje está vazia, então seguro). A coleta automática deve respeitar o upsert.

A régua de marcos usa o campo `tipo` existente: `pos_primeira_aula` (ativo), `tres_meses` e `evasao` (reservados, sem coleta nesta entrega).

### 2. RPC `get_timeline_pesquisas_aluno(p_aluno_id integer)`

Retorna, para a régua fixa `[pos_primeira_aula, tres_meses, evasao]`, o estado de cada marco:
- `tipo`, `label` (ex: "1ª aula"), `nota`, `comentario`, `status`, `respondido_em`, `enviado_em`.
- Marco sem registro → linha com `status = NULL` (o front decide o rótulo).

Tipo de retorno: **`jsonb` array** ordenado pela régua (consistente com `get_analise_pesquisas`, facilita o tipo TS do hook). `SECURITY DEFINER` (a tabela tem RLS ativo).

### 3. RPC de gravação (upsert) `registrar_resposta_pesquisa_manual` (generalizar a existente)

A RPC atual (`p_aluno_id, p_nota, p_data`) só grava 1ª aula respondida. Generalizar para:
- `p_aluno_id integer`
- `p_tipo text` (default `'pos_primeira_aula'`) — valida contra a régua.
- `p_nota integer` NULL — 1 a 5, ou NULL quando não respondida.
- `p_comentario text` NULL
- `p_nao_respondeu boolean` (default false) — quando true, grava `status='nao_respondida'`, `nota=NULL`.
- `p_data date`

Comportamento:
- Validação: se não é `nao_respondeu`, exige `p_nota` entre 1 e 5.
- `status` derivado: `nao_respondida` se `p_nao_respondeu`, senão `respondida`.
- **Upsert** por (`aluno_id`, `tipo`): insere ou atualiza nota/comentário/status/datas (permite correção).
- `unidade_id` puxado do aluno; `enviado_em` = `respondido_em` = `p_data` @ 12h BRT; `manual = true`.

> Compatibilidade: a assinatura muda (novos parâmetros), então a migration faz **`DROP FUNCTION registrar_resposta_pesquisa_manual(integer,integer,date)` + recriar** com a nova assinatura (não dá para `CREATE OR REPLACE` mudando os params). O modal é o único consumidor e é atualizado junto.

### 4. Componente `TimelinePesquisasAluno`

- **Props:** `alunoId: number` (+ opcional `unidadeNome`/`alunoNome` para o modal de lançamento).
- **Comportamento:** busca os dados via `get_timeline_pesquisas_aluno`; renderiza timeline vertical com os 3 marcos.
- **Estados por marco:**
  - `respondida` → estrelas (1–5) + comentário (se houver) + data.
  - `nao_respondida` → selo cinza "Não respondeu" + data.
  - `pendente` (enviada por WhatsApp, aguardando) → selo "Aguardando resposta" + botão **Registrar** (permite a Fabi lançar a resposta manualmente mesmo assim).
  - `pos_primeira_aula` sem registro → "Sem registro" + botão **Registrar**.
  - `tres_meses` / `evasao` → "Em breve" (desabilitado).
- Botão **Registrar / Editar** abre o modal de lançamento já com aluno + marco pré-definidos.
- Recarrega após salvar.
- Autossuficiente: sem dependência do componente pai além do `alunoId`.

### 5. Modal de lançamento (generalizar `ModalLancarRespostaManual`)

Dois modos:
- **Modo busca** (atual, da aba Respostas): mantém a busca de aluno.
- **Modo contextual** (novo, da timeline): recebe `alunoId` + `tipo` fixos, sem busca.

Campos: marco (fixo no modo contextual; só 1ª aula no modo busca por ora), **nota (1–5) OU toggle "Não respondeu"**, **comentário** (textarea), data. Ao salvar chama a RPC upsert. Toast + callback `onSaved`.

### 6. Encaixe nas fichas

- **`ModalFichaAluno`** (módulo Alunos) — seção "Pesquisas / Acompanhamento".
- **`ModalDetalhesSucessoAluno`** (Sucesso do Aluno) — mesma seção.

Ambos recebem o `aluno.id`; basta inserir `<TimelinePesquisasAluno alunoId={...} />`.

## Escopo

**Nesta entrega:**
- Migration (`comentario`, `status`, índice único, backfill).
- RPC de leitura + RPC de gravação generalizada (upsert, via DROP + recriar).
- Componente `TimelinePesquisasAluno`.
- Modal de lançamento generalizado (busca + contextual; nota/não-respondeu/comentário).
- Embutir nas duas fichas.
- **Ajustar a edge `processar-resposta-pesquisa`** para respeitar a unicidade `(aluno_id, tipo)`: fazer update do registro `pendente` em vez de inserir um novo (senão a coleta automática quebra com o índice único). Verificar a lógica atual da edge antes de aplicar o índice.

**Fora de escopo (futuro):**
- Criar as pesquisas de **3 meses** e **evasão** (coleta/disparo).
- Captura automática de comentário pelo WhatsApp (hoje só nota via lista).
- Unificar a pesquisa de evasão atual (texto/áudio) na timeline.
- Status "tratado", progress bar de onboarding.

## Riscos / pontos de atenção

- **Índice único `(aluno_id, tipo)`**: confirmar ausência de duplicatas antes de aplicar (tabela vazia hoje → seguro). A coleta automática (`processar-resposta-pesquisa`) precisa continuar funcionando com a unicidade — validar que ela não tenta inserir um segundo registro do mesmo tipo (deve fazer update do registro `pendente`).
- **Granularidade pessoa × matrícula**: a timeline é por `aluno_id` (matrícula). Pessoa com 2 cursos verá a timeline da matrícula da ficha aberta. Aceito para esta entrega.
- **RLS**: leitura/gravação via RPC `SECURITY DEFINER` (a tabela tem RLS sem policies de acesso direto).

## Testes / validação

- Migration aplicada sem quebrar registros existentes (backfill correto).
- RPC de leitura retorna os 3 marcos na ordem, com estados corretos (respondida / não respondida / sem registro / em breve).
- Upsert: lançar → editar → confirmar que atualiza (não duplica).
- "Não respondeu": grava `status='nao_respondida'`, `nota=NULL`, aparece o selo.
- Timeline renderiza nas duas fichas com o `aluno_id` correto.
- Aba "Respostas" agregada continua funcionando (não regrediu com as colunas novas).
- `npm run build` + typecheck limpos.
