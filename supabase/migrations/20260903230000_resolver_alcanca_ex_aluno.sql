-- Mapa de Sinais: o resolver passa a alcançar EX-ALUNO (fatia `historico`).
--
-- Decisão do Luciano (03/09): o radar precisa do ex-aluno, mas numa fatia
-- diferente — ali não se cobra ação, se MEDE. Dois usos escolhidos por ele:
-- (1) motivo de saída que morreu na conversa e (2) necropsia mensal.
--
-- O caso que motivou: **Théo Arruda** (aluno 689, `inativo`). O extrator ACHOU a
-- declaração de saída — "informou que não continuará e a escola confirmou o
-- encerramento da matrícula" — e o sinal morria porque o resolver só enxergava
-- `status ilike 'ativo%'`. A pesquisa de evasão tem **5 respostas contra 86
-- saídas**; o motivo estava escrito na conversa e não virava dado.
--
-- ⚠️ ORDEM DA CASCATA: ativo → EX-ALUNO → lead. Medido em 03/09 numa amostra de
-- 141 ex-alunos: **75 deles (53%) também existem em `leads`**, porque foram
-- leads antes de matricular. Pôr `lead` antes de ex-aluno mandaria METADE de
-- quem acabou de sair para a consultora como "lead parado" — a consultora
-- receberia para prospectar quem a escola acabou de perder.
--
-- ⚠️ QUEM DE FATO VOLTOU A SE INTERESSAR não pode ser confundido com o lead
-- original que virou matrícula. Discriminador: `leads.created_at >
-- alunos.data_matricula`. O lead ORIGINAL nasce ANTES da matrícula; um lead
-- criado DEPOIS é interesse novo, e esse sim pertence ao comercial.
--
-- ⚠️ Bolsista e banda continuam fora de tudo — inclusive do histórico. Quem
-- filtra é o trigger `radar_guarda_elegibilidade` via
-- `movimentacao_conta_nos_kpis_v1`, não este resolver.

create or replace function public.radar_resolver_entidade_por_telefone(p_telefone text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with chave as (
  select public.fn_normalizar_telefone_br_key(p_telefone) as k
),
-- todas as matrículas cujo telefone (próprio ou do responsável) bate
casadas as (
  select a.id                                   as aluno_id,
         a.nome,
         a.unidade_id,
         a.status,
         a.data_matricula,
         a.unidade_id::text || '|' ||
           coalesce(pc.pessoa_chave, 'local:' || a.id::text) as pessoa,
         coalesce(a.is_segundo_curso, false)     as is_segundo,
         (a.status ilike 'ativo%')               as ativo
  from chave
  join public.alunos a
    on (public.fn_normalizar_telefone_br_key(a.telefone)             = chave.k
     or public.fn_normalizar_telefone_br_key(a.responsavel_telefone) = chave.k)
  left join public.vw_aluno_pessoa_chave pc on pc.aluno_id = a.id
  where chave.k is not null
),
ativos    as (select * from casadas where ativo),
inativos  as (select * from casadas where not ativo),
n_ativos  as (select count(distinct pessoa)::int as pessoas from ativos),
-- lead criado DEPOIS da matrícula = interesse novo (retorno), não o lead original
lead_novo as (
  select l.*
  from chave
  join public.leads l on public.fn_normalizar_telefone_br_key(l.telefone) = chave.k
  where chave.k is not null
    and (not exists (select 1 from casadas)
         or l.created_at > (select max(data_matricula) from casadas))
  order by l.created_at desc nulls last, l.id desc
  limit 1
),
lead_qualquer as (
  select l.*
  from chave
  join public.leads l on public.fn_normalizar_telefone_br_key(l.telefone) = chave.k
  where chave.k is not null
  order by l.created_at desc nulls last, l.id desc
  limit 1
),
um as (
  select jsonb_build_object(
           'entidade_tipo', 'aluno', 'entidade_id', a.aluno_id,
           'unidade_id', a.unidade_id, 'nome', a.nome,
           'identificacao', jsonb_build_object(
             'metodo','telefone_aluno','confianca',0.95,
             'chave_telefone',(select k from chave))) as j
  from ativos a
  order by a.is_segundo, a.data_matricula nulls last, a.aluno_id
  limit 1
),
fam as (
  select jsonb_build_object(
           'entidade_tipo','familia','entidade_id', null,
           'unidade_id', case when count(distinct a.unidade_id) = 1
                              then min(a.unidade_id::text)::uuid end,
           'nome', string_agg(distinct a.nome, ', '),
           'identificacao', jsonb_build_object(
             'metodo','telefone_familia','confianca',0.9,
             'chave_telefone',(select k from chave),
             'pessoas', count(distinct a.pessoa),
             'alunos', jsonb_agg(distinct jsonb_build_object('id',a.aluno_id,'nome',a.nome)))) as j
  from ativos a
),
-- ex-aluno: entra ANTES do lead, e entidade_tipo continua 'aluno' (o CHECK da
-- tabela não tem 'ex_aluno'). Quem separa é o `dominio`, que o trigger resolve
-- para 'historico' ao ver que a matrícula não está ativa.
ex as (
  select jsonb_build_object(
           'entidade_tipo','aluno','entidade_id', a.aluno_id,
           'unidade_id', a.unidade_id, 'nome', a.nome,
           'identificacao', jsonb_build_object(
             'metodo','telefone_ex_aluno','confianca',0.9,
             'chave_telefone',(select k from chave),
             'status_matricula', a.status,
             'nota','ex-aluno: vira fatia historico, medicao e nunca tarefa')) as j
  from inativos a
  order by a.is_segundo, a.data_matricula desc nulls last, a.aluno_id
  limit 1
),
ld as (
  select jsonb_build_object(
           'entidade_tipo','lead','entidade_id', l.id,
           'unidade_id', l.unidade_id, 'nome', l.nome,
           'identificacao', jsonb_build_object(
             'metodo','telefone_lead','confianca',0.9,
             'chave_telefone',(select k from chave))) as j
  from lead_qualquer l
),
ld_novo as (
  select jsonb_build_object(
           'entidade_tipo','lead','entidade_id', l.id,
           'unidade_id', l.unidade_id, 'nome', l.nome,
           'identificacao', jsonb_build_object(
             'metodo','telefone_lead_retorno','confianca',0.85,
             'chave_telefone',(select k from chave),
             'nota','lead criado depois da matricula: interesse novo, nao o lead original')) as j
  from lead_novo l
)
select case
         when (select k from chave) is null
           then jsonb_build_object('entidade_tipo', null, 'motivo', 'telefone_invalido')
         when (select pessoas from n_ativos) = 1 then (select j from um)
         when (select pessoas from n_ativos) > 1 then (select j from fam)
         -- ex-aluno que VOLTOU a se interessar pertence ao comercial
         when exists (select 1 from inativos) and (select j from ld_novo) is not null
           then (select j from ld_novo)
         when (select j from ex) is not null then (select j from ex)
         when (select j from ld) is not null then (select j from ld)
         else jsonb_build_object(
                'entidade_tipo', null, 'motivo', 'desconhecido',
                'identificacao', jsonb_build_object('chave_telefone',(select k from chave)))
       end;
$$;

comment on function public.radar_resolver_entidade_por_telefone(text) is
  'Telefone -> aluno | familia | ex-aluno (vira dominio historico) | lead | null. Cascata: ativo > ex-aluno > lead, porque 53%% dos ex-alunos tambem existem em leads e inverter mandaria quem acabou de sair para a consultora. Excecao: lead criado DEPOIS da matricula e interesse novo e volta a ser comercial. Fonte unica: nao reimplementar no consumidor.';

revoke all on function public.radar_resolver_entidade_por_telefone(text) from public, anon;
grant execute on function public.radar_resolver_entidade_por_telefone(text) to authenticated, service_role;
