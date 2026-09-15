-- LAPE-33: expor o estado de "comunidade WhatsApp" na Lista de Alunos e na Ficha
-- (coluna opcional + filtro fixo + nome do grupo).
--
-- Nao reaproveita aluno_comunidade_estado_v1() (funcao ja consumida em producao por
-- get_estrelas_matriculador_v1 e radar_pendencias_comerciais_v1). Essa funcao so
-- verifica o grupo DA PROPRIA unidade do aluno. Esta view e deliberadamente mais
-- ampla: busca em TODOS os grupos ativos, para detectar o caso real de telefone
-- que casa num grupo de OUTRA unidade (ex: responsavel com filho em duas unidades).
-- Medido em 14/09/2026: 20 alunos caem nesse caso, invisiveis para a funcao antiga.
--
-- Grao: 1 linha por alunos.id (linha operacional/matricula), para juntar 1:1 com a
-- Lista de Alunos. O calculo por baixo usa o conjunto de telefones de TODAS as
-- matriculas da mesma pessoa (mesma unidade_id + pessoa_chave via vw_aluno_pessoa_chave),
-- igual a funcao canonica.
--
-- comunidade_wa_grupos e comunidade_wa_participantes tem RLS ligado e ZERO policy
-- (trancadas de proposito, so service_role/dono alcanca) -- por isso esta view
-- roda com security_invoker = false (mesmo padrao documentado no CLAUDE.md para
-- vw_disciplinas_modalidade). Nao destrancar as tabelas.

create view public.vw_aluno_comunidade_wa_v1
with (security_invoker = false) as
with fones as (
  select a.id as aluno_id, a.unidade_id, pc.pessoa_chave,
         public.fn_normalizar_telefone_br_key(f.fone) as telefone_key
  from public.alunos a
  join public.vw_aluno_pessoa_chave pc on pc.aluno_id = a.id
  join public.vw_aluno_pessoa_chave irmas
    on irmas.pessoa_chave = pc.pessoa_chave and irmas.unidade_id = pc.unidade_id
  join public.alunos a2 on a2.id = irmas.aluno_id
  cross join lateral (values (a2.telefone), (a2.whatsapp), (a2.responsavel_telefone)) f(fone)
  where public.fn_normalizar_telefone_br_key(f.fone) is not null
  union
  select a.id as aluno_id, a.unidade_id, pc.pessoa_chave,
         public.fn_normalizar_telefone_br_key(ac.telefone)
  from public.alunos a
  join public.vw_aluno_pessoa_chave pc on pc.aluno_id = a.id
  join public.vw_aluno_pessoa_chave irmas
    on irmas.pessoa_chave = pc.pessoa_chave and irmas.unidade_id = pc.unidade_id
  join public.aluno_contatos ac on ac.aluno_id = irmas.aluno_id
  where public.fn_normalizar_telefone_br_key(ac.telefone) is not null
),
grupos_ativos as (
  select g.id, g.unidade_id, g.nome,
         (select max(p.capturado_em)
            from public.comunidade_wa_participantes p
           where p.grupo_id = g.id) as ultima_captura
  from public.comunidade_wa_grupos g
  where g.ativo
),
captura_global as (
  select max(ultima_captura) as mais_recente, count(*) as total_grupos
  from grupos_ativos
),
matches as (
  select distinct f.aluno_id, f.unidade_id as aluno_unidade_id,
         g.id as grupo_id, g.unidade_id as grupo_unidade_id, g.nome as grupo_nome,
         g.ultima_captura
  from fones f
  join public.comunidade_wa_participantes p on p.telefone_key = f.telefone_key
  join grupos_ativos g on g.id = p.grupo_id
),
-- quando o telefone casa em mais de um grupo, prioriza o grupo da PROPRIA unidade
-- do aluno; senao, o de captura mais recente; desempate deterministico por id.
match_escolhido as (
  select distinct on (m.aluno_id)
         m.aluno_id, m.grupo_id, m.grupo_nome, m.grupo_unidade_id,
         (m.grupo_unidade_id = m.aluno_unidade_id) as grupo_mesma_unidade,
         m.ultima_captura
  from matches m
  order by m.aluno_id, (m.grupo_unidade_id = m.aluno_unidade_id) desc,
           m.ultima_captura desc nulls last, m.grupo_id
),
outros_grupos as (
  select m.aluno_id, array_agg(distinct m.grupo_nome order by m.grupo_nome) as nomes
  from matches m
  join match_escolhido me on me.aluno_id = m.aluno_id and m.grupo_id <> me.grupo_id
  group by m.aluno_id
)
select
  a.id as aluno_id,
  a.unidade_id,
  case
    when me.aluno_id is not null then 'na_comunidade'
    when cg.total_grupos = 0 then 'sem_grupo_configurado'
    when cg.mais_recente is null then 'sem_captura'
    when cg.mais_recente < now() - interval '2 days' then 'captura_desatualizada'
    else 'fora_da_comunidade'
  end as estado,
  me.grupo_id,
  me.grupo_nome,
  me.grupo_unidade_id,
  me.grupo_mesma_unidade,
  me.ultima_captura as capturado_em,
  og.nomes as outros_grupos_nomes
from public.alunos a
cross join captura_global cg
left join match_escolhido me on me.aluno_id = a.id
left join outros_grupos og on og.aluno_id = a.id;

comment on view public.vw_aluno_comunidade_wa_v1 is
  'LAPE-33: estado de comunidade WhatsApp por aluno (matricula). Busca em TODOS os '
  'grupos ativos, nao so o da propria unidade -- ver grupo_mesma_unidade para '
  'distinguir. Fonte: comunidade_wa_participantes (captura diaria, cron 190, '
  '07h BRT). Nao confundir com aluno_comunidade_estado_v1(), que so olha o grupo '
  'da propria unidade e e a usada pelos agentes (Mila/Sol).';

-- toda relacao nova em public nasce com privilegio amplo para authenticated via
-- ALTER DEFAULT PRIVILEGES do schema -- revoga e concede so o necessario.
revoke all on public.vw_aluno_comunidade_wa_v1 from public, anon, authenticated;
grant select on public.vw_aluno_comunidade_wa_v1 to authenticated;
