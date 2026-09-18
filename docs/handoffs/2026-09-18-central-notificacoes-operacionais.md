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

Os dez tipos da v1 são `aula_reagendada`, `aula_cancelada`, `professor_trocado`, `experimental_marcada`, `experimental_convertida`, `aluno_novo`, `aviso_previo`, `matricula_trancada`, `matricula_encerrada` e `matricula_alterada`. Aniversários são consulta, não evento. Troca de sala continua fora do contrato.

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
