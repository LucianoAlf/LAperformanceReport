# Relatorio tecnico: fontes canonicas para LA Teacher

Data: 08/07/2026  
Projeto: LA Performance Report / LAHQ  
Objetivo: orientar o consumo do LA Teacher a partir do banco LAHQ/Supabase, sem buscar diretamente no Emusys.

## Resumo executivo

O LA Teacher deve consumir o LAHQ como fonte operacional.

Para a vida inicial do aluno, o caminho canonico hoje e:

```text
leads
  -> crm_conversas / crm_mensagens
  -> lead_experimentais
  -> emusys_experimentais_raw
  -> alunos
  -> aluno_jornada_matricula_disciplina
  -> aulas_emusys / aluno_presenca
  -> anamneses / anamnese_respostas_perfil
```

Para professor:

```text
get_jornada_professor(professor_id)
get_experimentais_professor_canonicos_v1(...)
vw_jornada_marcos
get_relatorio_pedagogico_aluno(...)
```

Nao consumir tabelas legadas de resumo comercial. Elas ja foram aposentadas porque geravam inflacao/divergencia.

## Principios de regra de negocio

### 1. LAHQ e a fonte de consumo do app

O Emusys continua sendo upstream, mas o app LA Teacher deve ler do LAHQ.

Motivo:

- o LAHQ ja aplica de/para de unidade, curso e professor;
- o LAHQ ja faz conciliacao operacional;
- o LAHQ guarda decisoes humanas e pendencias resolvidas;
- o LAHQ evita bater direto no Emusys pelo app;
- o LAHQ evita divergencia de regra entre relatorios, app do professor e dashboards.

### 2. Nao usar fontes legadas

Nao usar:

```text
dados_comerciais_legado
origem_leads_legado
```

Essas estruturas foram aposentadas por inflarem dados comerciais.

Para lead e comercial, usar:

```text
public.leads
public.lead_experimentais
public.emusys_experimentais_raw
public.lead_experimentais_decisoes_humanas
public.lead_conciliacao_decisoes
RPC get_conciliacao_experimentais_v2
RPC get_conciliacao_leads_qualidade_v1
RPC get_experimentais_professor_canonicos_v1
```

### 3. Dados financeiros nao sao foco do LA Teacher

O app do professor nao precisa consumir:

- MRR;
- ticket medio;
- parcelas;
- inadimplencia financeira detalhada;
- passaporte;
- lojinha;
- faturas.

Pode consumir apenas status pedagogico/operacional, quando fizer sentido:

- aluno ativo/trancado/finalizado;
- presenca/falta;
- proximidade de renovacao;
- anamnese;
- observacoes de aula;
- preparacao da aula experimental;
- jornada por disciplina.

## Fonte canonica do lead

Tabela principal:

```sql
public.leads
```

Campos relevantes para LA Teacher:

```text
id
nome
telefone
whatsapp
email
idade
unidade_id
curso_interesse_id
canal_origem_id
data_contato
data_primeiro_contato
data_ultimo_contato
status
observacoes
etapa_pipeline_id
temperatura
faixa_etaria
tipo_agendamento
observacoes_professor
data_passagem_mila
motivo_passagem_mila
qtd_mensagens_mila
sabia_preco
experimental_agendada
data_experimental
horario_experimental
professor_experimental_id
experimental_realizada
faltou_experimental
converteu
data_conversao
aluno_id
arquivado
```

Joins usuais:

```text
canais_origem        -> leads.canal_origem_id
cursos               -> leads.curso_interesse_id
unidades             -> leads.unidade_id
professores          -> leads.professor_experimental_id
crm_pipeline_etapas  -> leads.etapa_pipeline_id
```

Exemplo:

```sql
select
  l.id,
  l.nome,
  l.whatsapp,
  l.unidade_id,
  u.nome as unidade_nome,
  l.curso_interesse_id,
  c.nome as curso_interesse,
  l.canal_origem_id,
  co.nome as canal_origem,
  l.faixa_etaria,
  l.temperatura,
  l.observacoes,
  l.observacoes_professor,
  l.experimental_agendada,
  l.data_experimental,
  l.horario_experimental,
  l.professor_experimental_id,
  p.nome as professor_experimental,
  l.aluno_id
from public.leads l
left join public.unidades u on u.id = l.unidade_id
left join public.cursos c on c.id = l.curso_interesse_id
left join public.canais_origem co on co.id = l.canal_origem_id
left join public.professores p on p.id = l.professor_experimental_id
where l.id = :lead_id;
```

## Mila, conversa e preparo da aula experimental

### Historico de conversa

Tabelas:

```sql
public.crm_conversas
public.crm_mensagens
```

`crm_conversas` guarda uma conversa por lead.

Campos uteis:

```text
lead_id
unidade_id
status
atribuido_a
whatsapp_jid
nao_lidas
ultima_mensagem_at
ultima_mensagem_preview
mila_pausada
```

`crm_mensagens` guarda o historico completo.

Campos uteis:

```text
conversa_id
lead_id
direcao
tipo
conteudo
midia_url
remetente
remetente_nome
created_at
transcricao
```

Exemplo para montar historico do atendimento:

```sql
select
  m.created_at,
  m.direcao,
  m.remetente,
  m.tipo,
  m.conteudo,
  m.transcricao
from public.crm_mensagens m
where m.lead_id = :lead_id
order by m.created_at asc;
```

### O que o lead disse que gosta

A Mila tem uma tool chamada `preparar_aula`.

Ela salva:

```text
leads.observacoes_professor
```

Formato atual gravado pela edge:

```text
Banda/cantor favorito: ... | Obs: ...
```

Arquivo:

```text
supabase/functions/mila-processar-mensagem/index.ts
```

Regra:

- O que o aluno disse que gosta/preferencias musicais deve ser buscado em `leads.observacoes_professor`.
- O contexto completo pode ser reconstituido por `crm_mensagens`.
- `leads.observacoes` guarda motivacao/observacoes gerais do lead.

Consulta recomendada:

```sql
select
  id,
  nome,
  observacoes as observacoes_gerais,
  observacoes_professor as preparo_aula_experimental,
  qtd_mensagens_mila,
  data_passagem_mila,
  motivo_passagem_mila
from public.leads
where id = :lead_id;
```

Observacao: nao foi identificada, no codigo auditado, uma tabela separada de "resumo da Mila". A fonte operacional atual e o proprio lead mais o historico de mensagens.

## Qualidade de dados do lead

Tabela de auditoria:

```sql
public.lead_conciliacao_decisoes
```

RPC de fila/pendencias:

```sql
public.get_conciliacao_leads_qualidade_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_tipo text
)
```

RPC de resolucao:

```sql
public.resolver_conciliacao_lead_qualidade(
  p_lead_id integer,
  p_campo text,
  p_valor_id integer,
  p_decidido_por text,
  p_motivo text
)
```

Campos resolvidos:

```text
canal_origem_id
curso_interesse_id
```

Regra importante:

Essa conciliacao nao cria base paralela. Ela atualiza a propria `public.leads` e grava auditoria em `lead_conciliacao_decisoes`.

## Aula experimental

Tabelas principais:

```sql
public.lead_experimentais
public.emusys_experimentais_raw
public.lead_experimentais_decisoes_humanas
```

### `lead_experimentais`

Representa o agendamento/estado operacional da experimental no fluxo comercial.

Campos usados pelo app/relatorios:

```text
id
lead_id
nome_aluno
unidade_id
data_experimental
horario_experimental
professor_experimental_id
curso_interesse_id
status
etapa_pipeline_id
aluno_id
emusys_lead_id
emusys_aula_id
created_at
updated_at
```

### `emusys_experimentais_raw`

Espelho operacional vindo do Emusys para validar presenca, falta, cancelamento e remanejamentos.

Usado por:

- conciliacao de experimentais;
- taxa Exp -> Mat;
- conversao canonica por professor;
- auditoria de inflacao de experimentais internas/ADM.

### RPC oficial de conciliacao comercial

```sql
public.get_conciliacao_experimentais_v2(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodo text default 'mensal',
  p_data date default null
)
```

Retorna JSON com:

```text
resumo.raw_realizadas_emusys
resumo.raw_realizadas_emusys_comercial
resumo.raw_internas_emusys
resumo.raw_excluidas_decisao
resumo.experimentais_agendadas
resumo.experimentais_realizadas_confirmadas
resumo.matriculas_diretas
resumo.denominador_taxa_exp_mat
resumo.conversoes_exp_mat_canonicas
resumo.pendencias_taxa_exp_mat
resumo.taxa_exp_mat_liberada
resumo.taxa_exp_mat_canonica
resumo.taxa_exp_mat_status
items[]
```

Uso recomendado:

- relatorio comercial;
- leitura gerencial;
- validar taxa Exp -> Mat;
- identificar pendencias que impedem KPI oficial.

## Taxa de conversao do professor

RPC canonica:

```sql
public.get_experimentais_professor_canonicos_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes_inicio integer,
  p_mes_fim integer default null
)
```

Retorno:

```text
professor_id
professor_nome
unidade_id
unidade_nome
realizadas_emusys
faltas_emusys
canceladas_emusys
matriculas_pos_exp
taxa_exp_mat
```

Essa RPC usa:

```text
emusys_experimentais_raw
lead_experimentais
lead_experimentais_decisoes_humanas
alunos
get_conciliacao_experimentais_v2
```

No frontend atual, a aba Professores consome essa RPC e usa `taxa_exp_mat` como conversao canonica do professor.

Exemplo:

```sql
select *
from public.get_experimentais_professor_canonicos_v1(
  :unidade_id,
  2026,
  6,
  6
)
where professor_id = :professor_id;
```

Observacao de regra:

Essa taxa mede conversao experimental -> matricula pelo professor no contexto comercial canonico. Ela nao deve ser confundida com qualidade pedagogica isolada. Para avaliar professor no LA Teacher, combine com:

- presenca;
- faltas;
- carteira atual;
- evasoes;
- jornada/marcos;
- anotacoes pedagogicas.

## Aluno matriculado

Tabela principal:

```sql
public.alunos
```

Campos uteis para LA Teacher:

```text
id
unidade_id
nome
telefone
whatsapp
email
data_nascimento
responsavel_nome
responsavel_telefone
curso_id
professor_atual_id
data_matricula
data_inicio_contrato
data_fim_contrato
status
instagram
lead_origem_id
emusys_student_id
emusys_matricula_id
anamnese_preenchida
aguardando_renovacao
```

Ponte lead -> aluno:

```text
leads.aluno_id
alunos.lead_origem_id
lead_experimentais.aluno_id
lead_experimentais_decisoes_humanas.aluno_id_decidido
```

Consulta recomendada:

```sql
select
  a.id,
  a.nome,
  a.status,
  a.unidade_id,
  a.curso_id,
  c.nome as curso_nome,
  a.professor_atual_id,
  p.nome as professor_nome,
  a.lead_origem_id,
  l.observacoes_professor as preparo_aula_experimental,
  l.observacoes as observacoes_lead
from public.alunos a
left join public.cursos c on c.id = a.curso_id
left join public.professores p on p.id = a.professor_atual_id
left join public.leads l on l.id = a.lead_origem_id
where a.id = :aluno_id;
```

## Jornada canonica do aluno

Tabela:

```sql
public.aluno_jornada_matricula_disciplina
```

Views/RPCs:

```sql
public.vw_jornada_aluno_atual
public.vw_jornada_aluno_com_presenca
public.vw_jornada_professor_atual
public.vw_jornada_marcos
public.get_jornada_aluno(p_aluno_id integer)
public.get_jornada_professor(p_professor_id integer)
```

Uso LA Teacher por professor:

```sql
select *
from public.get_jornada_professor(:professor_id);
```

Uso LA Teacher por aluno:

```sql
select *
from public.get_jornada_aluno(:aluno_id);
```

Campos mais importantes:

```text
jornada_label
nr_aulas_contratadas
nr_aulas_passadas
nr_aulas_futuras
proxima_aula_numero
percentual_jornada
presencas
faltas
percentual_presenca_contrato
tipo_marco
```

## Presenca, faltas e historico pedagogico

Tabelas:

```sql
public.aulas_emusys
public.aluno_presenca
```

`aulas_emusys` guarda:

```text
emusys_id
unidade_id
data_aula
data_hora_inicio
data_hora_fim
tipo
categoria
turma_nome
curso_emusys_id
curso_nome
professor_id
professor_nome
cancelada
nr_da_aula
matricula_disciplina_id
qtd_aulas_contrato
qtd_alunos
anotacoes
```

`aluno_presenca` guarda a presenca individual do aluno.

### Relatorio pedagogico do aluno

RPC:

```sql
public.get_relatorio_pedagogico_aluno(
  p_aluno_id integer,
  p_data_inicio date,
  p_data_fim date
)
```

Arquivos relacionados:

```text
supabase/migrations/20260703120000_historico_pedagogico_aluno.sql
supabase/migrations/20260703140000_get_relatorio_pedagogico_aluno.sql
supabase/functions/gerar-relatorio-pedagogico/index.ts
```

Uso para LA Teacher:

- historico de aulas;
- anotacoes do professor;
- presencas/faltas;
- evolucao pedagogica sem dados financeiros.

## Anamnese

Tabelas consumidas pelo frontend:

```sql
public.anamneses
public.anamnese_respostas_perfil
```

Consulta usada na ficha do aluno:

```sql
select
  *,
  anamnese_respostas_perfil(*)
from public.anamneses
where aluno_id = :aluno_id
  and status = 'completa'
order by created_at desc
limit 1;
```

Campos relevantes encontrados no frontend:

```text
tipo_formulario
telefone_aluno
entrevistador
status
genero
possui_instrumento
cursos_escolhidos
objetivos
tempo_para_metas
tempo_disponivel_estudo
experiencia_anterior
interesse_bandas
cuidado_medico
medicacao_continua
diagnosticos
necessidade_apoio
generos_musicais
instrumentos_toca
nivel_conhecimento_musical
nivel_habilidade_instrumento
motivo_procura_pais
metas_pais
fonte_exposicao_musical
musicos_na_familia
interesse_instrumento_cantar
exposicao_telas
comunicacao_crianca
sono_crianca
estereotipias
situacao_responsaveis
filiacao
quem_traz_crianca
temperamento_primario
temperamento_secundario
temperamento_codinome
temperamento_contagem
perfil_baby
observacoes_entrevistador
share_token
created_at
```

RPCs de apoio na ficha do aluno:

```sql
public.buscar_anamneses_pendentes(p_aluno_id)
public.vincular_anamnese_aluno(p_anamnese_id, p_aluno_id)
```

Uso recomendado para LA Teacher:

- exibir anamnese completa do aluno;
- destacar diagnosticos/necessidade de apoio;
- destacar objetivos, gostos musicais, temperamento e observacoes do entrevistador;
- nunca mostrar dados financeiros.

## Movimentacoes administrativas

Tabela:

```sql
public.movimentacoes_admin
```

Uso:

- historico de matricula;
- renovacao;
- nao renovacao;
- trancamento;
- finalizacao/evasao;
- aviso previo.

Regra:

Boa para historico e contexto. Nao usar como fonte da posicao de aula do contrato.

Para posicao de aula, usar a camada de jornada:

```text
aluno_jornada_matricula_disciplina
```

## Mapa resumido de consumo para LA Teacher

### Tela inicial do professor

Fonte principal:

```sql
select *
from public.get_jornada_professor(:professor_id);
```

Complementos:

```sql
select *
from public.get_experimentais_professor_canonicos_v1(:unidade_id, :ano, :mes_inicio, :mes_fim)
where professor_id = :professor_id;
```

```sql
select *
from public.vw_jornada_marcos
where professor_id = :professor_id;
```

### Ficha do aluno no app do professor

Buscar aluno:

```sql
select *
from public.alunos
where id = :aluno_id;
```

Buscar jornada:

```sql
select *
from public.get_jornada_aluno(:aluno_id);
```

Buscar anamnese:

```sql
select *, anamnese_respostas_perfil(*)
from public.anamneses
where aluno_id = :aluno_id
  and status = 'completa'
order by created_at desc
limit 1;
```

Buscar historico pedagogico:

```sql
select *
from public.get_relatorio_pedagogico_aluno(:aluno_id, :data_inicio, :data_fim);
```

### Aula experimental marcada para o professor

Fonte:

```sql
public.lead_experimentais
```

Consulta sugerida:

```sql
select
  le.id,
  le.lead_id,
  le.nome_aluno,
  le.data_experimental,
  le.horario_experimental,
  le.status,
  le.professor_experimental_id,
  p.nome as professor_nome,
  le.curso_interesse_id,
  c.nome as curso_nome,
  l.observacoes_professor as preparo_aula,
  l.observacoes as observacoes_lead,
  l.faixa_etaria,
  l.temperatura,
  l.whatsapp
from public.lead_experimentais le
left join public.leads l on l.id = le.lead_id
left join public.professores p on p.id = le.professor_experimental_id
left join public.cursos c on c.id = le.curso_interesse_id
where le.professor_experimental_id = :professor_id
  and le.data_experimental between :inicio and :fim
order by le.data_experimental, le.horario_experimental;
```

## Dados canonicos por necessidade do LA Teacher

| Necessidade | Fonte canonica |
| --- | --- |
| Carteira atual do professor | `get_jornada_professor(professor_id)` |
| Aula atual do contrato | `aluno_jornada_matricula_disciplina` / `vw_jornada_*` |
| Proxima aula 15/21 | `vw_jornada_marcos` |
| Alunos perto de renovar | `vw_jornada_marcos` com `tipo_marco = 'perto_renovacao'` |
| Presenca/faltas | `aluno_presenca` + `aulas_emusys` ou `vw_jornada_aluno_com_presenca` |
| Historico/anotacoes de aula | `get_relatorio_pedagogico_aluno` / `aulas_emusys.anotacoes` |
| Experimental marcada | `lead_experimentais` |
| Preparacao da experimental | `leads.observacoes_professor` |
| Conversa com Mila | `crm_conversas` + `crm_mensagens` |
| Motivacao/observacao do lead | `leads.observacoes` |
| Curso de interesse | `leads.curso_interesse_id` -> `cursos` |
| Origem do lead | `leads.canal_origem_id` -> `canais_origem` |
| Pendencias de origem/curso | `get_conciliacao_leads_qualidade_v1` |
| Conversao por professor | `get_experimentais_professor_canonicos_v1` |
| Anamnese | `anamneses` + `anamnese_respostas_perfil` |
| Historico de renovacao/evasao/trancamento | `movimentacoes_admin` |

## Pontos que o Claude deve respeitar

1. Nao chamar Emusys pelo LA Teacher para dados que ja estao no LAHQ.
2. Nao usar tabelas legadas de resumo.
3. Nao calcular jornada por presenca/falta.
4. Nao tratar aluno como uma unica jornada quando houver segundo curso.
5. Sempre filtrar por `unidade_id` quando houver ID Emusys envolvido.
6. Para professor, preferir `professor_id` local do LAHQ.
7. Para curso, preferir `curso_id` local do LAHQ, mantendo `curso_nome_emusys` apenas como fallback.
8. Para experimental, separar lead real de remanejamento interno usando a conciliacao canonica.
9. Para gosto/preparacao de aula, usar `leads.observacoes_professor` e complementar com `crm_mensagens`.
10. Para anamnese, usar apenas registros completos (`status = 'completa'`) como leitura principal.

## Gaps conhecidos e recomendacoes

### Resumo estruturado da Mila

Hoje o sistema tem:

- conversa completa em `crm_mensagens`;
- dados consolidados em `leads`;
- preparo de aula em `leads.observacoes_professor`.

Nao foi identificado um campo/tabela separada de "resumo Mila" ja normalizado por topicos.

Recomendacao futura:

Criar uma view ou tabela de resumo de lead para professor, por exemplo:

```text
vw_lead_contexto_professor
```

Com:

```text
lead_id
nome
idade
faixa_etaria
curso_interesse
origem
preparo_aula
motivacao
resumo_ultimas_mensagens
data_experimental
professor_experimental_id
```

Mas, ate isso existir, consumir diretamente as fontes listadas acima.

### Anamnese schema

O frontend consome `anamneses` e `anamnese_respostas_perfil`, mas a migration de criacao dessas tabelas nao apareceu nos trechos auditados. Para Claude com acesso ao banco, confirmar o schema real com:

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('anamneses', 'anamnese_respostas_perfil')
order by table_name, ordinal_position;
```

### Professor app e seguranca

Antes de liberar no app:

- revisar RLS por professor;
- garantir que professor veja apenas alunos/jornadas da propria carteira;
- remover dados financeiros da resposta;
- evitar expor payload bruto de `payload_snapshot` no app.

## Caminho recomendado para uma API/view do LA Teacher

Criar posteriormente uma view/RPC agregadora para o app, sem dados financeiros:

```text
get_la_teacher_dashboard(p_professor_id)
get_la_teacher_aluno_contexto(p_aluno_id)
```

Com base em:

```text
get_jornada_professor
get_jornada_aluno
vw_jornada_marcos
lead_experimentais
leads
crm_mensagens
anamneses
get_relatorio_pedagogico_aluno
```

Isso evita que o app replique regra de negocio no frontend.

