# Central de notificações operacionais — entrega e evidências

Atualizado em **18/09/2026**. Banco principal: `ouqwbbermlzqqvtqwlul`.

## O que entrou em produção

- Migration `20260918115015_central_notificacoes_operacionais`:
  - `eventos_operacionais`, append-only;
  - `eventos_operacionais_audiencia`, uma linha por professor alcançado;
  - gatilhos nas fontes canônicas, com `IS DISTINCT FROM` e bloco de exceção para não interromper webhook nem sincronização;
  - carga inicial idempotente dos últimos sete dias;
  - RPC de eventos e RPC de aniversários;
  - RLS sem políticas e sem leitura direta; execução das RPCs só por `service_role`.
- Migration `20260918120815_central_notificacoes_operacionais_acl`:
  - revoga a execução direta dos helpers e sete funções de gatilho para `public`, `anon`, `authenticated` e `service_role`;
  - preserva somente as três RPCs de serviço necessárias para `service_role`;
  - acrescenta índices de cobertura para as FKs de aluno, aula e unidade.
- Edge `processar-matricula-emusys`, versão **100**, com `verify_jwt=true`: guarda apenas a descrição curta e limpa de `matricula_alterada` na jornada. Não replica payload bruto, observações livres, saúde ou financeiro.
- Mapa do banco regenerado na produção: 577 tabelas/views e 1.518 funções. Os objetos novos foram classificados no domínio de professor; notificações do app, no de integração. O inventário de funções executáveis por `anon` caiu de 183 para 176.

## Contrato publicado

```sql
fn_eventos_operacionais_professor_v1(
  p_professor_id integer,
  p_desde timestamptz,
  p_cursor_detectado_em timestamptz default null,
  p_cursor_evento_id text default null,
  p_limite integer default 50,
  p_tipos text[] default null
) returns jsonb

fn_aniversariantes_do_professor_v1(
  p_professor_id integer,
  p_de date,
  p_ate date
) returns jsonb
```

A primeira retorna `{ itens, proximo_cursor }`, ordenado por `detectado_em desc, evento_id desc`; aceita no máximo 200 itens. `p_professor_id = null` é o recorte consolidado de serviço. A segunda deduplica por `unidade_id + emusys_student_id` (com ID local como fallback), exclui arquivados e exige vínculo operacional ativo na jornada.

Os doze tipos são `aula_reagendada`, `aula_cancelada`, `professor_trocado`, `experimental_marcada`, `experimental_convertida`, `experimental_cancelada`, `experimental_remarcada`, `aluno_novo`, `aviso_previo`, `matricula_trancada`, `matricula_encerrada` e `matricula_alterada`. Aniversários são consulta, não evento. Troca de sala continua fora do contrato.

A janela da aula é BRT de ontem até D+14, avaliando tanto o início anterior quanto o novo. Eventos de turma mantêm `aluno=null` e descrevem a turma, em vez de atribuir o fato a uma pessoa errada.

## Diferenças e limites deliberados

Não houve mudança de contrato. A carga inicial recupera exatamente as quatro fontes históricas previstas no desenho fechado: revisões de aula, `movimentacoes_admin`, `lead_experimentais` e transições de professor. Eventos de jornada (`aluno_novo`, trancamento, encerramento e alteração) começam a ser capturados no gatilho a partir da publicação, pois uma fotografia atual não permite inventar o antes/depois histórico.

A migration recebeu no Supabase o timestamp de aplicação `20260918115015`; o arquivo versionado do repositório foi renomeado para o mesmo timestamp. Isso evita deriva entre histórico remoto e repositório.

Já existia `notificacao_lida(professor_id, evento_id, lida_em)` e as RPCs de app que a usam. A coluna `evento_id` não tem FK, e a projeção nova não a lê nem a escreve; portanto não há conflito. A porta do LA Teacher pode reutilizá-la depois, se quiser, usando os IDs estáveis novos.

## Segurança e desempenho medidos

| Verificação | Resultado |
|---|---:|
| Leitura direta das duas tabelas por `anon` | negada |
| Leitura direta por `authenticated` | negada |
| Leitura direta por `service_role` | negada |
| Execução das duas RPCs por `service_role` | permitida |
| Execução direta dos sete gatilhos por `anon`/`authenticated` | negada |
| RPC de eventos, recorte consolidado, 50 itens | 3,367 ms |
| RPC de eventos, professor com 7 itens | 9,326 ms |
| Aniversários próximos 30 dias para a amostra | 5 itens |
| Carga inicial de sete dias | 68 inserções em 2.132,18 ms |
| Repetição da mesma carga | 0 inserções em 236,81 ms |

Índices de leitura:

```sql
create index idx_eventos_operacionais_audiencia_professor_detectado
  on eventos_operacionais_audiencia
  (professor_id, detectado_em desc, evento_id desc)
  include (participacao);

create index idx_eventos_operacionais_detectado
  on eventos_operacionais (detectado_em desc, evento_id desc);

create index idx_eventos_operacionais_aluno_id on eventos_operacionais (aluno_id);
create index idx_eventos_operacionais_aula_id on eventos_operacionais (aula_id);
create index idx_eventos_operacionais_unidade_id on eventos_operacionais (unidade_id);
```

No primeiro `EXPLAIN ANALYZE`, a tabela ainda tinha apenas 68 fatos e 79 linhas de audiência; o otimizador escolheu um scan em memória de 0,224 ms em vez do índice. O índice acima é o caminho de leitura destinado ao crescimento e a consulta real ficou abaixo do aceite de 50 ms.

O advisor mantém somente o informativo “RLS habilitado sem política” nas duas tabelas; neste caso é intencional, pois todos os privilégios diretos foram revogados. Os três índices novos ainda aparecem como não usados por serem recém-criados; eles cobrem verificações de FK e consultas futuras por aluno, aula e unidade.

## Carga inicial: contagem observada

| Tipo | Eventos | Audiências |
|---|---:|---:|
| `aula_reagendada` | 26 | 26 |
| `aula_cancelada` | 22 | 22 |
| `professor_trocado` | 11 | 22 |
| `experimental_marcada` | 5 | 5 |
| `aviso_previo` | 4 | 4 |
| `aluno_novo` | 0 | 0 |
| `matricula_trancada` | 0 | 0 |
| `matricula_encerrada` | 0 | 0 |
| `matricula_alterada` | 0 | 0 |

Os dois professores de uma troca explicam as 22 audiências para 11 fatos. Os quatro tipos zerados não foram fabricados: a carga inicial não os reconstrói de fotografia atual; os gatilhos estão ativos para as próximas mudanças reais.

## Amostras sem nome de aluno

| Tipo | Forma observada |
|---|---|
| `aula_reagendada` | `aula.inicio` e `mudanca.antes/depois.inicio`; curso e turma quando disponíveis |
| `aula_cancelada` | `mudanca.antes.status=ativa`, `mudanca.depois.status=cancelada`; motivo somente quando a fonte informou |
| `professor_trocado` | `mudanca.antes.professor` e `mudanca.depois.professor`; duas audiências, `saiu` e `entrou` |
| `experimental_marcada` | `aula.inicio`, curso e professor responsável |
| `experimental_convertida` | `mudanca.antes.data_experimental`, `mudanca.depois.data_matricula`, curso e uma ou duas audiências `responsavel` |
| `experimental_cancelada` | `mudanca.antes.data_experimental` e `horario_experimental`; depois = status cancelada; audiência `responsavel` |
| `experimental_remarcada` | `mudanca.antes/depois.data_experimental` e `horario_experimental`; audiência `responsavel` |
| `aviso_previo` | `mudanca.depois.acao=adicionado`, `data_prevista` e categoria do motivo; sem observações livres |
| `aluno_novo` / `matricula_trancada` / `matricula_encerrada` / `matricula_alterada` | ainda sem ocorrência publicada desde a ativação; os formatos foram cobertos pela fixture PostgreSQL |

Nenhuma amostra deste documento contém nome de aluno, payload bruto, valor/parcela, saúde, presença ou observações livres.

## Sincronização da grade

Corte da migration: **18/09/2026 11:51:00 UTC**. O recorte anterior usa as 24 horas antes desse corte e apenas execuções `metadados` concluídas.

| Unidade | Antes: n / p50 / p90 | Depois: n / p50 / p90 |
|---|---|---|
| Barra | 96 / 13.958,59 / 16.531,40 ms | 1 / 13.664,18 / 13.664,18 ms |
| Campo Grande | 89 / 20.464,09 / 24.713,24 ms | 1 / 18.618,28 / 18.618,28 ms |
| Recreio | 95 / 19.358,41 / 23.354,39 ms | 2 / 18.738,50 / 18.980,67 ms |

A amostra pós-corte ainda é curta (1, 1 e 2 execuções), portanto esses p50/p90 são um sinal inicial, não uma distribuição estabilizada de 24 horas.

A primeira tentativa pós-corte de Campo Grande falhou antes de ler qualquer página (`EMUSYS_HTTP_FALHOU`, 0 aulas e 0 presenças). O mesmo código já ocorreu nove vezes desde 00:00 UTC, inclusive antes da migration; como não houve escrita em `aulas_emusys`, os gatilhos novos não executaram nessa tentativa. Ela não é usada no p50 pós-mudança.

Na leitura final desta entrega, os 68 fatos existentes têm `origem='carga_inicial'`, entre 11:51:53,245 e 11:51:53,503 UTC; ainda não houve fato novo de webhook ou sincronização após a carga. A observação de 24 horas começou no corte acima. A consulta de fechamento deve separar `origem='carga_inicial'` de `webhook`/`sincronizacao`, contar por tipo e anexar uma amostra anonimizada para cada tipo que tiver ocorrido.

## Validação executada

- Fixture PostgreSQL 17: 2 testes passaram, cobrindo todos os nove tipos, idempotência, paginação, aniversário, ACL/RLS, a escrita pela sincronização sob `service_role` após a revogação de `EXECUTE` e isolamento da falha do gatilho.
- `deno check` passou para `jornada-canonica.ts` e `processar-matricula-emusys/index.ts`.
- `npm run build` passou. Permanecem os avisos preexistentes de chunk/ciclo do Recharts.
- `npm run mapa:banco` passou pelo pooler e atualizou o mapa gerado.

## Ajustes do primeiro dia — 18/09

### 1. Cancelamento que escapava

A migration `20260918154358_central_notificacoes_operacionais_primeiro_dia` mantém o gatilho de atualização em `aulas_emusys` como `AFTER UPDATE OF cancelada`, com `WHEN (OLD.cancelada IS DISTINCT FROM NEW.cancelada) AND NEW.cancelada`, e acrescenta `trg_eventos_operacionais_aula_cancelada_insert` para `INSERT` já cancelado. Ambos passam pela mesma função protegida por exceção, portanto uma falha de notificação não interrompe a sincronização.

O teste PostgreSQL insere uma aula dentro da janela já com `cancelada=true`; antes da migration não havia `aula_cancelada`, depois há exatamente uma. O código de `sync-grade-futura-emusys` usa `upsert` por `(emusys_id, unidade_id)`: registros conhecidos seguem pelo `UPDATE`; registros ainda não vistos, inclusive já cancelados, seguem pelo `INSERT`.

O cruzamento temporal pedido ainda depende da revisão que ocorre após **19/09 03:08 UTC**. O corte será: aulas que se tornaram canceladas entre **18/09 11:51 UTC** e **19/09 03:08 UTC**, comparadas com fatos `aula_cancelada` de origem `sincronizacao` no mesmo intervalo. Não foram fabricados dados de sincronização para antecipar esses dois números.

### 2. Turma duplicada

O Emusys materializa a sessão de turma por matrícula-disciplina: no caso investigado, as aulas `240296` e `240446` têm mesma unidade, turma, curso, professor, horário original e horário reagendado, mas `matricula_disciplina_id` e `nr_da_aula` diferentes. O evento era calculado por `emusys_id`, por isso o mesmo fato chegava duas vezes. A migration introduz uma chave de sessão para aula de turma, composta por unidade, turma normalizada, curso Emusys e horário original/de referência. Aulas individuais conservam a chave por aula.

Na carga já existente havia **22 fatos excedentes** em **10 grupos duplicados**: 8 fatos em 16 `aula_reagendada` de carga inicial, 11 em 18 `aula_cancelada` de carga inicial, 2 em 4 `aula_reagendada` de sincronização e 1 em 2 `professor_trocado` de sincronização. A migration preservou o primeiro fato, moveu suas audiências e removeu os excedentes; a verificação posterior encontrou **0 grupos duplicados**. A fixture muda duas linhas da mesma turma e exige um único fato — sem a nova chave, o teste produz dois.

### 3. Origem do aviso prévio

`processar-matricula-emusys` versão 100 agora grava `origem_registro='webhook_emusys'` ao criar ou atualizar `aluno_aviso_previo`. Isso percorre a função canônica de origem e resulta em `origem='webhook'` no evento. O teste estático falha sem esse campo; a fixture também comprova que o registro recém-identificado deixa de sair como sincronização. O único aviso novo observado foi corrigido para `webhook`; não houve alteração de prazo na RPC.

### 4. Experimental convertida

O tipo novo `experimental_convertida` foi adicionado à restrição da tabela e aos gatilhos de `aluno_jornada_matricula_disciplina`, com helper idempotente e seguro para falha. O elo procura a experimental pelo `emusys_lead_id` e depois registra audiência para o professor experimental e para o professor da jornada, quando diferentes. O `evento_id` é estável por unidade, lead e matrícula; o payload contém somente aluno, curso, data experimental e data da matrícula.

A carga inicial dos últimos sete dias inseriu **18 conversões** em **189,119 ms**; a repetição inseriu **0** em **58,949 ms**. Exemplo anonimizado: `u:95553e96-971b-4590-a6eb-0201d013c14d:lead:8483:matricula:1572:experimental_convertida`, com `data_experimental=2026-09-11` e `data_matricula=2026-09-11`.

Há vínculo de `lead_experimentais.emusys_aula_id` com `aulas_emusys`, portanto experimentais vinculadas já passam pelos gatilhos genéricos de `aula_reagendada` e `aula_cancelada`; não foi criado um segundo caminho para não duplicá-las. No corte desta verificação, 530 de 1.173 experimentais tinham essa ligação, incluindo 39 canceladas e 68 reagendadas; as 643 sem aula vinculada não têm como gerar esses dois eventos pela tabela de aulas.

### Verificação posterior aos ajustes

- A fixture PostgreSQL foi aplicada dentro de transação, verificou a nova função e a nova restrição, executou `ROLLBACK`, comprovou a ausência delas e então executou o cenário completo. Ela cobre inserção cancelada, deduplicação de turma, origem webhook do aviso, conversão, idempotência, ACL e isolamento da exceção.
- No banco real, a RPC de 50 itens para o professor 16 executou em **8,83 ms**; o recorte consolidado em **10,833 ms**, ambos com buffers em memória.
- O advisor não trouxe alerta novo para os objetos deste ajuste. Permanece apenas o informativo intencional de RLS sem política nas duas tabelas, cuja leitura direta continua revogada.
- A tentativa de regenerar o mapa nesta sessão não conseguiu resolver o host direto do banco e não havia URL de pooler local; ela abortou sem escrever arquivos. As verificações acima foram feitas no projeto Supabase real.

## Acompanhamento noturno — 18/09

### Experimental cancelada ou remarcada sem aula ligada

A migration `20260918205401_central_notificacoes_experimentais_sem_aula` entrou no banco principal. Ela acrescenta `experimental_cancelada` e `experimental_remarcada` à restrição de tipos e preserva o contrato da RPC: os novos tipos aparecem no mesmo campo `tipo`, com o mesmo `evento_id` estável, paginação e ordem por `detectado_em`.

Há dois caminhos canônicos, ambos protegidos por exceção:

- `lead_experimentais.status`: `AFTER UPDATE OF status`, com `WHEN OLD.status IS DISTINCT FROM NEW.status`, registra o cancelamento quando o status entra em cancelado;
- `lead_experimentais.data_experimental, horario_experimental`: `AFTER UPDATE OF ...`, com `WHEN ... IS DISTINCT FROM ...`, registra a remarcação quando a mesma linha muda;
- `leads_automacao_log`: o observer do webhook registra a remarcação como uma linha nova em `lead_experimentais`. O gatilho de `INSERT` do log recupera a agenda anterior do mesmo lead e cria `experimental_remarcada` para a nova linha.

O último caminho ordena a sequência por `(created_at, id)`, não só pelo timestamp: dois logs na mesma transação podem ter o mesmo `created_at`. Depois de confirmar a remarcação, ele remove apenas a `experimental_marcada` genérica que o gatilho legado de `INSERT` tenha criado para aquela nova linha. A marcação original e os eventos de aula vinculada não são removidos.

O elo com `aulas_emusys` é reavaliado em todos os caminhos. Se existe uma aula vinculada de verdade, o evento de experimental não nasce; a agenda continua a emitir `aula_cancelada` ou `aula_reagendada`. O payload novo contém somente `aluno`, `curso`, `aula.inicio` e `mudanca.antes/depois` com data, horário e, no cancelamento, status. Não leva motivo livre, observações, saúde, valor ou parcela. A audiência é uma única linha `responsavel` para `professor_experimental_id`.

Os índices parciais novos em `leads_automacao_log` são:

```sql
idx_leads_automacao_log_experimental_lead_criado
  (lead_id, created_at desc, id desc)
  -- criação/remarcação de experimental

idx_leads_automacao_log_experimental_carga
  (created_at, id)
  -- cancelamento/remarcação de experimental
```

A migration limita a espera pelo lock a 2 s durante a criação deles. A tabela tinha cerca de 110 mil linhas na medição. Antes, a busca do estado anterior de uma remarcação fazia `Seq Scan` de 110.698 linhas em **147,539 ms**; depois usa `Index Only Scan` em **0,115 ms**. A seleção dos 16 logs da carga de sete dias caiu de **96,715 ms** para **0,159 ms**. A repetição idempotente da carga completa mediu **30,135 ms** no banco real.

### Provas e carga real

A fixture PostgreSQL 17 agora falha sem esta migration porque os tipos não passam pela restrição e os gatilhos não existem. Ela também cobre três regressões específicas:

- dois logs com o mesmo timestamp devem gerar uma remarcação; sem a chave `(created_at, id)`, o estado anterior é perdido;
- a remarcação por webhook deve deixar **zero** `experimental_marcada` para a mesma linha nova;
- uma restrição que faz a escrita na tabela derivada falhar não pode impedir o `UPDATE` canônico de cancelamento nem a inserção dos dois logs de remarcação.

O teste passa com `node --test tests/eventosOperacionaisProfessorPostgres.test.mjs`, incluindo a aplicação da migration dentro de `BEGIN`/`ROLLBACK` e a prova de que os objetos desaparecem depois do rollback.

A carga de sete dias, iniciada em `2026-09-11 20:54:25 UTC`, inseriu **7** fatos: **1** `experimental_cancelada` e **6** `experimental_remarcada`. A segunda chamada inseriu **0**. A diferença frente aos 16 logs de transporte é a política do contrato: dos 5 cancelamentos, 2 já tinham aula vinculada e 2 estavam fora da janela de ontem até D+14; das 11 remarcações, 4 estavam vinculadas a aula (inclui uma entrega duplicada) e 1 ficou fora da janela. Não houve alvo ausente entre os logs analisados.

Exemplos sem nome de aluno:

| Tipo | Exemplo observado |
|---|---|
| `experimental_cancelada` | experimental `2930`; Teclado; agenda de 19/09 às 08:00 BRT; `status: experimental_agendada → cancelada` |
| `experimental_remarcada` | experimental `2894`; Aula Experimental; `14/09 15:00 → 24/09 15:00` BRT |

No pós-carga, os 7 fatos têm audiência `responsavel`, não contêm os campos excluídos e há **0** marcações genéricas duplicadas para as seis remarcações. A RPC `fn_eventos_operacionais_professor_v1` já devolve os novos tipos ao filtrar `p_tipos`; a validação real retornou `experimental_remarcada` para uma audiência alcançada, sem leitura direta das tabelas.

### Cruzamento de cancelamentos — pendente do dado de 19/09

O horário local desta execução ainda é 18/09. A coleta de revisões que fecha o universo solicitado ocorre após **19/09 03:08 UTC**; portanto os números A e B não existem ainda e não foram estimados.

Assim que a coleta estiver presente, o cruzamento usará `primeira_coleta_em` da revisão append-only, particionado por `aula_staging_id` e ordenado por `primeira_coleta_em, id`. A é a união distinta de: (1) revisão que passou de `cancelada=false` para `true` na janela e (2) aula inserida já cancelada no mesmo intervalo. As duas partes aplicam a mesma janela BRT de ontem a D+14 dos gatilhos. B são os `aula_cancelada` de origem `sincronizacao` ou `webhook`, agrupados por unidade e `emusys_id`, detectados no mesmo intervalo.

```sql
with parametros as (
  select timestamptz '2026-09-18 11:51:00+00' as inicio,
         /* substituir pela primeira coleta concluída após 19/09 03:08 UTC */
         timestamptz '2026-09-19 03:08:00+00' as fim
), candidatas as (
  select distinct r.aula_staging_id
    from public.emusys_aulas_historico_revisoes_v1 r, parametros p
   where r.primeira_coleta_em >= p.inicio
     and r.primeira_coleta_em < p.fim
), historico as (
  select r.*,
         lag(coalesce(r.payload ->> 'cancelada', 'false')) over (
           partition by r.aula_staging_id order by r.primeira_coleta_em, r.id
         ) as cancelada_anterior,
         lag(r.payload ->> 'data_hora_inicio') over (
           partition by r.aula_staging_id order by r.primeira_coleta_em, r.id
         ) as inicio_anterior
    from public.emusys_aulas_historico_revisoes_v1 r
    join candidatas c on c.aula_staging_id = r.aula_staging_id
), a as (
  select distinct h.unidade_id, h.emusys_aula_id, 'revisao'::text as fonte
    from historico h, parametros p
   where h.primeira_coleta_em >= p.inicio
     and h.primeira_coleta_em < p.fim
     and coalesce(h.cancelada_anterior, 'false') <> 'true'
     and coalesce(h.payload ->> 'cancelada', 'false') = 'true'
     and public.fn_eventos_operacionais_na_janela_aula(
       public.fn_eventos_operacionais_timestamptz(h.inicio_anterior),
       public.fn_eventos_operacionais_timestamptz(h.payload ->> 'data_hora_inicio')
     )
  union
  select distinct ae.unidade_id, ae.emusys_id, 'insert_cancelado'::text
    from public.aulas_emusys ae, parametros p
   where ae.created_at >= p.inicio
     and ae.created_at < p.fim
     and ae.cancelada
     and public.fn_eventos_operacionais_na_janela_aula(null, ae.data_hora_inicio)
), b as (
  select distinct e.unidade_id, (e.aula ->> 'emusys_id')::bigint as emusys_aula_id
    from public.eventos_operacionais e, parametros p
   where e.tipo = 'aula_cancelada'
     and e.origem in ('sincronizacao', 'webhook')
     and e.detectado_em >= p.inicio
     and e.detectado_em < p.fim
)
select (select count(*) from a) as a_cancelamentos,
       (select count(*) from b) as b_eventos,
       (select count(*) from a left join b using (unidade_id, emusys_aula_id)
         where b.emusys_aula_id is null) as a_sem_evento;
```

Se `a_sem_evento > 0`, a consulta de detalhamento deve retornar somente `unidade_id`, `emusys_aula_id`, `turma_nome` ou `aluno_id`, e a razão técnica encontrada. Não incluirá nome de aluno.
