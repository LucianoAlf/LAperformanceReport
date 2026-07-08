# Relatorio tecnico: jornada canonica por matricula/disciplina

Data: 08/07/2026  
Projeto: LA Performance Report / LAHQ  
Objetivo: documentar a camada canonica criada para responder, dentro do banco do LA Report, em que aula do contrato cada aluno esta.

## Resumo executivo

Foi criada uma camada canonica nova para a jornada do aluno por matricula/disciplina.

A regra aprovada e implementada foi:

- A jornada oficial e por matricula/disciplina, nao por aluno puro.
- Um aluno com Piano e Canto possui duas jornadas independentes.
- A posicao oficial vem do Emusys em `nr_aulas_contratadas`, `nr_aulas_passadas` e `nr_aulas_futuras`.
- Presenca/falta nao define a posicao da jornada. Presenca/falta entra como enriquecimento pedagogico e historico.
- A exibicao recomendada para LA Teacher e algo como `Aula 36/40`, com apoio de `35 realizadas de 40` para nao gerar ambiguidade.

Essa camada permite o LA Teacher consumir direto o LAHQ/Supabase, sem buscar no Emusys.

## O que foi criado

### Tabela canonica

Tabela:

```sql
public.aluno_jornada_matricula_disciplina
```

Unicidade:

```sql
unique (unidade_id, emusys_matricula_disciplina_id)
```

Essa chave e importante porque IDs do Emusys sao por unidade. O mesmo numero pode existir em escolas diferentes.

Campos centrais:

```sql
unidade_id
aluno_id
emusys_aluno_id
emusys_matricula_id
emusys_matricula_disciplina_id
emusys_disciplina_id
curso_id
curso_nome_emusys
professor_id
emusys_professor_id
professor_nome_emusys
status_matricula
qtd_contratos
nr_aulas_contratadas
nr_aulas_passadas
nr_aulas_futuras
proxima_aula_numero
percentual_jornada
data_primeira_aula
data_ultima_aula
dia_semana
horario
fonte_ultima_atualizacao
ultima_sincronizacao_emusys
payload_snapshot
```

Arquivo da migration:

```text
supabase/migrations/20260708190000_jornada_canonica_matricula_disciplina.sql
```

Hardening de seguranca:

```text
supabase/migrations/20260708193000_jornada_canonica_security_invoker.sql
```

## Regra de negocio implementada

### Posicao da jornada

Campos vindos do Emusys:

- `nr_aulas_contratadas`: total contratado para aquela disciplina/matricula.
- `nr_aulas_passadas`: aulas que ja ocorreram no contrato.
- `nr_aulas_futuras`: aulas futuras ainda previstas/agendadas.

Campos derivados no LAHQ:

```text
proxima_aula_numero = nr_aulas_passadas + 1, quando ainda existe aula futura
percentual_jornada = nr_aulas_passadas / nr_aulas_contratadas * 100
```

Exemplo:

```text
nr_aulas_contratadas = 40
nr_aulas_passadas = 35
nr_aulas_futuras = 5
proxima_aula_numero = 36
jornada_label = Aula 36/40
```

Se nao houver aula futura, `proxima_aula_numero` fica nulo e a view mostra a jornada como concluida ou como contador simples.

### Status canonico da matricula

O helper normaliza status para:

```text
ativa
trancada
finalizada
inativa
desconhecido
```

Eventos considerados ativos:

```text
ativa
ativo
matriculada
matriculado
em andamento
matricula_nova
matricula_renovacao
matricula_renovada
matricula_alterada
```

Eventos/estados de saida:

```text
matricula_trancamento -> trancada
matricula_finalizacao -> finalizada
evadida/evadido/inativa/inativo -> finalizada
```

## Views criadas para consumo

### `vw_jornada_aluno_atual`

Mostra jornadas ativas com joins legiveis:

- unidade
- aluno
- telefone/whatsapp
- responsavel
- curso local ou nome Emusys
- professor local ou nome Emusys
- contadores de jornada
- `jornada_label`

Filtro interno:

```sql
where j.status_matricula = 'ativa'
```

### `vw_jornada_aluno_com_presenca`

Enriquece a jornada com presenca/falta, usando:

```text
public.aluno_presenca
public.aulas_emusys
```

Campos adicionados:

```sql
presencas
faltas
aulas_com_presenca_registrada
percentual_presenca_contrato
ultima_aula_registrada
```

Observacao importante: presenca/falta e enriquecimento. A posicao da jornada continua vindo dos contadores do contrato.

### `vw_jornada_professor_atual`

Mesma base da jornada com presenca, filtrando apenas linhas com `professor_id`.

Uso principal:

- carteira do professor no LA Teacher;
- lista de alunos por professor;
- posicao atual de cada aluno por disciplina;
- risco de renovacao por proximidade do fim do contrato.

### `vw_jornada_marcos`

Classifica a jornada em marcos operacionais:

```sql
primeira_aula      -> proxima_aula_numero = 1
marco_aula         -> proxima_aula_numero in (15, 21)
perto_renovacao    -> nr_aulas_futuras <= 4
jornada            -> demais casos
```

Uso principal:

- alertas de aula 1;
- marcos de aula 15 e 21;
- alunos perto da renovacao;
- acompanhamento proativo do sucesso do aluno.

## RPCs criadas

### Jornada por aluno

```sql
public.get_jornada_aluno(p_aluno_id integer)
```

Retorna:

```sql
setof public.vw_jornada_aluno_com_presenca
```

Exemplo:

```sql
select *
from public.get_jornada_aluno(123)
order by curso_nome, emusys_matricula_disciplina_id;
```

### Jornada por professor

```sql
public.get_jornada_professor(p_professor_id integer)
```

Retorna:

```sql
setof public.vw_jornada_professor_atual
```

Exemplo:

```sql
select *
from public.get_jornada_professor(456)
order by aluno_nome, curso_nome;
```

## Alimentadores da camada canonica

### 1. Webhook de matricula

Arquivo:

```text
supabase/functions/processar-matricula-emusys/index.ts
```

Eventos que alimentam a jornada:

```text
matricula_nova
matricula_renovacao
matricula_renovada
matricula_trancamento
matricula_finalizacao
matricula_alterada
```

Ponto tecnico:

```ts
const EVENTOS_JORNADA_CANONICA = new Set([
  'matricula_nova',
  'matricula_renovacao',
  'matricula_renovada',
  'matricula_trancamento',
  'matricula_finalizacao',
  'matricula_alterada',
]);
```

Depois do handler principal, a edge chama:

```ts
sincronizarJornadaCanonicaWebhook(supabase, p)
```

Essa funcao usa:

```ts
buildJornadaInputFromWebhook(...)
upsertJornadaMatriculaDisciplina(...)
```

### Observacao sobre `matricula_alterada`

O webhook `matricula_alterada` existe e ja esta previsto.

O handler atual registra o evento como:

```text
jornada_matricula_alterada_recebida
```

E, na sequencia comum dos eventos de jornada, atualiza a tabela canonica com o payload recebido.

Isso e suficiente para mudancas de:

- curso;
- modulo;
- turma;
- disciplina;
- professor;
- agenda;
- contadores de aulas;
- datas de primeira/ultima aula.

Desde que o payload traga `matricula.disciplinas[]` com os contadores.

### 2. Sync de matriculas Emusys

Arquivo:

```text
supabase/functions/sync-matriculas-emusys/index.ts
```

Fonte:

```text
GET /matriculas
```

Fluxo:

```ts
buildJornadaInputFromMatriculaApi(mat, unidadeId, 'sync-matriculas-emusys')
buildJornadaRowsForUpsert(...)
upsertJornadasEmLote(...)
```

Esse sync e a fonte de reconciliacao/backfill. Ele puxa o estado atual do contrato no Emusys e regrava a tabela canonica por `unidade_id + emusys_matricula_disciplina_id`.

### 3. Sync de presenca/aulas Emusys

Arquivo:

```text
supabase/functions/sync-presenca-emusys/index.ts
```

Tabela enriquecida:

```text
public.aulas_emusys
```

Campos adicionados para dar match mais forte com jornada:

```sql
matricula_disciplina_id
qtd_aulas_contrato
```

Esses campos sao usados para cruzar aula/presenca com a jornada certa.

## Helper central

Arquivo:

```text
supabase/functions/_shared/jornada-canonica.ts
```

Responsabilidades:

- parsear payload de webhook;
- parsear resposta do endpoint `/matriculas`;
- extrair `matricula_disciplina_id`, `disciplina_id`, professor, agenda e contadores;
- resolver aluno local;
- resolver curso local por `curso_emusys_depara`;
- resolver professor local por `professores_unidades.emusys_id`;
- calcular `proxima_aula_numero`;
- calcular `percentual_jornada`;
- montar `payload_snapshot`;
- fazer upsert seguro.

Funcoes principais:

```ts
buildJornadaInputFromWebhook(...)
buildJornadaInputFromMatriculaApi(...)
buildJornadaRowsForUpsert(...)
upsertJornadaMatriculaDisciplina(...)
```

## Consumo no frontend atual

Hooks criados:

```text
src/hooks/useJornadaAluno.ts
src/hooks/useJornadaProfessor.ts
```

Uso por aluno:

```ts
supabase.rpc('get_jornada_aluno', {
  p_aluno_id: alunoId,
});
```

Uso por professor:

```ts
supabase.rpc('get_jornada_professor', {
  p_professor_id: professorId,
});
```

Componente ja integrado:

```text
src/components/App/SucessoCliente/ModalDetalhesSucessoAluno.tsx
```

O modal mostra a posicao no contrato por curso/professor.

## Como o LA Teacher deve consumir

### Carteira do professor

Use:

```sql
select *
from public.get_jornada_professor(:professor_id);
```

Campos relevantes para o app:

```text
aluno_id
aluno_nome
telefone
whatsapp
responsavel_nome
responsavel_telefone
curso_nome
professor_id
professor_nome
nr_aulas_contratadas
nr_aulas_passadas
nr_aulas_futuras
proxima_aula_numero
jornada_label
percentual_jornada
presencas
faltas
percentual_presenca_contrato
data_primeira_aula
data_ultima_aula
dia_semana
horario
```

### Jornada do aluno

Use:

```sql
select *
from public.get_jornada_aluno(:aluno_id);
```

Isso retorna uma linha por matricula/disciplina ativa do aluno.

### Marcos

Use:

```sql
select *
from public.vw_jornada_marcos
where unidade_id = :unidade_id
  and tipo_marco in ('primeira_aula', 'marco_aula', 'perto_renovacao')
order by data_ultima_aula nulls last, aluno_nome;
```

Para professor:

```sql
select *
from public.vw_jornada_marcos
where professor_id = :professor_id
order by tipo_marco, aluno_nome;
```

## O que nao misturar

### Nao usar `alunos.fase_jornada` como aula do contrato

Existe uma fase antiga no sucesso do aluno baseada em tempo de casa:

```text
onboarding
consolidacao
encantamento
renovacao
```

Essa fase e por tempo/meses. Ela nao responde "aula 36 de 40".

Para aula do contrato, use:

```text
aluno_jornada_matricula_disciplina
vw_jornada_aluno_atual
vw_jornada_aluno_com_presenca
vw_jornada_professor_atual
vw_jornada_marcos
```

### Nao usar `movimentacoes_admin` como estado da jornada

`movimentacoes_admin` registra eventos:

- matricula;
- renovacao;
- trancamento;
- finalizacao;
- aviso previo;
- nao renovacao.

Ela e boa para historico e relatorios administrativos, mas nao guarda o estado "aula 36/40" por disciplina.

### Presenca/falta nao e contador de contrato

`aluno_presenca` e `aulas_emusys` ajudam a saber presenca, faltas e historico pedagogico.

Mas a contagem oficial da posicao de jornada vem dos campos de contrato do Emusys:

```text
nr_aulas_contratadas
nr_aulas_passadas
nr_aulas_futuras
```

## Backfill executado

A camada foi populada usando `sync-matriculas-emusys` nas tres unidades.

Resultado informado apos execucao:

```text
Recreio: 1469 jornadas, 0 erros
Barra: 799 jornadas, 0 erros
Campo Grande: 2502 jornadas, 0 erros
```

## Validacao tecnica executada

Testes:

```powershell
node --test scripts\tests\jornada-canonica.test.ts
```

Resultado:

```text
4 testes passando
```

Build:

```powershell
npm run build
```

Resultado:

```text
build concluido com sucesso
```

Observacao: o Vite manteve apenas warnings conhecidos de tamanho de chunk/Recharts.

## Arquivos principais

Migrations:

```text
supabase/migrations/20260708190000_jornada_canonica_matricula_disciplina.sql
supabase/migrations/20260708193000_jornada_canonica_security_invoker.sql
```

Helper:

```text
supabase/functions/_shared/jornada-canonica.ts
```

Edges alimentadoras:

```text
supabase/functions/processar-matricula-emusys/index.ts
supabase/functions/sync-matriculas-emusys/index.ts
supabase/functions/sync-presenca-emusys/index.ts
```

Hooks/frontend:

```text
src/hooks/useJornadaAluno.ts
src/hooks/useJornadaProfessor.ts
src/components/App/SucessoCliente/ModalDetalhesSucessoAluno.tsx
```

Testes:

```text
scripts/tests/jornada-canonica.test.ts
```

## Checklist para LA Teacher

Para implementar consumo no LA Teacher:

1. Buscar professor logado no LAHQ e obter `professor_id`.
2. Chamar `get_jornada_professor(professor_id)`.
3. Renderizar uma linha por aluno/curso/disciplina.
4. Exibir `jornada_label`, `nr_aulas_passadas`, `nr_aulas_contratadas`, `nr_aulas_futuras`.
5. Exibir presenca/falta apenas como contexto de acompanhamento.
6. Usar `vw_jornada_marcos` para alertas de aula 1, aula 15, aula 21 e perto de renovacao.

## Riscos e pontos de atencao

- Se `curso_id` vier nulo, conferir `curso_emusys_depara`.
- Se `professor_id` vier nulo, conferir `professores_unidades.emusys_id`.
- Se `aluno_id` vier nulo, conferir `alunos.emusys_matricula_id` e `alunos.emusys_student_id`.
- Se um aluno trocar de professor/curso, o webhook `matricula_alterada` deve chegar e atualizar a linha da disciplina.
- Se o webhook falhar ou nao chegar, o `sync-matriculas-emusys` reconcilia no proximo ciclo.

