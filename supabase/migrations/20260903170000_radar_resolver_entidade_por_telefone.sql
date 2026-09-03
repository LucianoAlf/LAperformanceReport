-- Mapa de Sinais / A5: quem e a pessoa por tras de um telefone do Chatwoot.
--
-- Fonte unica da resolucao. Existe para que extrator, painel e qualquer sinal
-- futuro vindo de conversa cheguem na MESMA resposta — reimplementar o casamento
-- no consumidor e o padrao que gerou as duplicatas de renovacao neste projeto.
--
-- ⚠️ Um telefone pode pertencer legitimamente a MAIS DE UMA PESSOA: e o telefone
-- do responsavel, e irmaos estudam na escola. Isso ja mordeu antes (Miguel/Pedro
-- e Heitor/Willian na pesquisa de evasao, 05/08). Por isso 2+ pessoas nao vira
-- escolha arbitraria com `limit 1` — vira `entidade_tipo='familia'`, que e o que
-- o R5 ja faz e o que `radar_sinais` ja aceita (entidade_id nulo + identificacao).
--
-- ⚠️ So considera aluno ATIVO e ELEGIVEL (`radar_aluno_elegivel_v1`, que aplica
-- `movimentacao_conta_nos_kpis_v1`): bolsista e banda ficam fora do radar por
-- decisao do Alf ("nao contam em nada, em nada").
--
-- Medido em 03/09/2026 sobre os 173 telefones candidatos do dia:
--   126 casaram com aluno (108 pessoa unica, 18 familia) | 20 so lead
--   27 desconhecidos (15,6%) | 0 telefone sem chave valida

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
m as (
  select a.id                                   as aluno_id,
         a.nome,
         a.unidade_id,
         a.unidade_id::text || '|' ||
           coalesce(pc.pessoa_chave, 'local:' || a.id::text) as pessoa,
         coalesce(a.is_segundo_curso, false)     as is_segundo,
         a.data_matricula
  from chave
  join public.alunos a
    on (public.fn_normalizar_telefone_br_key(a.telefone)            = chave.k
     or public.fn_normalizar_telefone_br_key(a.responsavel_telefone) = chave.k)
  left join public.vw_aluno_pessoa_chave pc on pc.aluno_id = a.id
  where chave.k is not null
    and a.status ilike 'ativo%'
    and public.radar_aluno_elegivel_v1(a.id)
),
n as (select count(distinct pessoa)::int as pessoas from m),
-- uma pessoa: entidade e a MATRICULA principal (nao a de segundo curso)
um as (
  select jsonb_build_object(
           'entidade_tipo', 'aluno',
           'entidade_id',   m.aluno_id,
           'unidade_id',    m.unidade_id,
           'nome',          m.nome,
           'identificacao', jsonb_build_object(
                              'metodo',         'telefone_aluno',
                              'confianca',      0.95,
                              'chave_telefone', (select k from chave))) as j
  from m
  order by m.is_segundo, m.data_matricula nulls last, m.aluno_id
  limit 1
),
fam as (
  select jsonb_build_object(
           'entidade_tipo', 'familia',
           'entidade_id',   null,
           'unidade_id',    case when count(distinct m.unidade_id) = 1
                                 then min(m.unidade_id::text)::uuid end,
           'nome',          string_agg(distinct m.nome, ', '),
           'identificacao', jsonb_build_object(
                              'metodo',         'telefone_familia',
                              'confianca',      0.9,
                              'chave_telefone', (select k from chave),
                              'pessoas',        count(distinct m.pessoa),
                              'alunos',         jsonb_agg(distinct jsonb_build_object(
                                                  'id', m.aluno_id, 'nome', m.nome)))) as j
  from m
),
ld as (
  select jsonb_build_object(
           'entidade_tipo', 'lead',
           'entidade_id',   l.id,
           'unidade_id',    l.unidade_id,
           'nome',          l.nome,
           'identificacao', jsonb_build_object(
                              'metodo',         'telefone_lead',
                              'confianca',      0.9,
                              'chave_telefone', (select k from chave))) as j
  from chave
  join public.leads l on public.fn_normalizar_telefone_br_key(l.telefone) = chave.k
  where chave.k is not null
  order by l.created_at desc nulls last, l.id desc
  limit 1
)
select case
         when (select k from chave) is null
           then jsonb_build_object('entidade_tipo', null, 'motivo', 'telefone_invalido')
         when (select pessoas from n) = 1 then (select j from um)
         when (select pessoas from n) > 1 then (select j from fam)
         when (select j from ld) is not null then (select j from ld)
         else jsonb_build_object(
                'entidade_tipo', null,
                'motivo', 'desconhecido',
                'identificacao', jsonb_build_object('chave_telefone', (select k from chave)))
       end;
$$;

comment on function public.radar_resolver_entidade_por_telefone(text) is
  'Telefone do Chatwoot -> aluno | familia | lead | null. Fonte unica: nao reimplementar no consumidor. 2+ pessoas no mesmo telefone vira familia, nunca escolha arbitraria por limit 1.';

-- ACL: recriar funcao reabre EXECUTE para anon por ALTER DEFAULT PRIVILEGES
-- (ja pegou get_agenda_dia, get_kpis_alunos_canonicos_base_v131 e a retificacao
-- gerencial neste projeto). Revoke nominal, nao so do public.
revoke all on function public.radar_resolver_entidade_por_telefone(text) from public, anon;
grant execute on function public.radar_resolver_entidade_por_telefone(text) to authenticated, service_role;
