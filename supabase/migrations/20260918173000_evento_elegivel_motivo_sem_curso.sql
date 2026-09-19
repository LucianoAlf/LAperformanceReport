-- MODULO EVENTOS — "sem curso para o recital" tem DOIS motivos, e so um e regra (LAPE-39)
--
-- A 20260918170000 nasceu contando `cursos_no_recital` e parando ali. Medindo as 3 unidades
-- logo depois, apareceram 3 pessoas ativas com zero cursos no recital — e elas nao sao a
-- mesma coisa:
--
--   Campo Grande · Maria Eduarda de Lima Bomfim Pedro  → so "Minha Banda Para Sempre"
--   Campo Grande · Leamsi Guedes de Sant'anna          → so "Power Kids"
--   Barra        · Manuela Isolani Tavares Estanho     → curso_id NULO no cadastro
--
-- As duas primeiras sao a REGRA funcionando: banda e atividade extra nao sobem no recital,
-- entao nao ha o que apresentar. A terceira e um DEFEITO DE CADASTRO — e ela esta no CSV
-- que o Arthur usou no prototipo, ou seja, o Emusys sabe o curso dela e o nosso cadastro
-- nao. Exibir as tres com o mesmo silencio ("0 apresentacoes") faria a coordenacao tratar
-- um defeito corrigivel como decisao da casa.
--
-- ⚠️ Tambem corrige uma afirmacao cedo demais no comentario anterior: "nenhuma pessoa e so
-- banda" foi medido na BARRA (13 de 13 tem curso regular) e nao vale na rede — Campo Grande
-- tem 2. O filtro de banda continua no CURSO, e agora a pessoa sem nada a apresentar diz
-- por que.
--
-- ⚠️ A derivacao fica AQUI e nao na tela: "so banda" x "cadastro incompleto" e semantica de
-- dominio, e um terceiro motivo futuro faria cada consumidor inventar o proprio rotulo.

create or replace view public.vw_evento_aluno_elegivel_v1
with (security_invoker = true) as
with matricula as (
  select
    a.id                                              as aluno_id,
    a.unidade_id,
    pc.pessoa_chave,
    a.nome,
    a.data_nascimento,
    a.curso_id,
    c.nome                                            as curso_nome,
    coalesce(c.is_projeto_banda, false)               as curso_e_banda,
    a.professor_atual_id                              as professor_id,
    p.nome                                            as professor_nome
  from public.alunos a
  join public.vw_aluno_pessoa_chave pc on pc.aluno_id = a.id
  left join public.cursos c       on c.id = a.curso_id
  left join public.professores p  on p.id = a.professor_atual_id
  where a.status = 'ativo'
),
pessoa as (
  select
    m.unidade_id,
    m.pessoa_chave,
    (array_agg(m.aluno_id order by m.aluno_id desc))[1]   as aluno_id_referencia,
    (array_agg(m.nome    order by m.aluno_id desc))[1]     as nome,
    max(m.data_nascimento)                                 as data_nascimento,
    count(distinct m.curso_id)
      filter (where not m.curso_e_banda and m.curso_id is not null)
                                                           as cursos_no_recital,
    count(distinct m.curso_id) filter (where m.curso_id is not null)
                                                           as cursos_matriculados,
    coalesce(
      jsonb_agg(distinct jsonb_build_object(
        'curso_id',       m.curso_id,
        'curso_nome',     m.curso_nome,
        'professor_id',   m.professor_id,
        'professor_nome', m.professor_nome
      )) filter (where not m.curso_e_banda and m.curso_id is not null),
      '[]'::jsonb
    )                                                      as cursos,
    bool_or(m.curso_e_banda)                               as faz_banda
  from matricula m
  group by m.unidade_id, m.pessoa_chave
)
select
  p.unidade_id,
  p.pessoa_chave,
  p.aluno_id_referencia,
  p.nome,
  p.data_nascimento,
  case
    when p.data_nascimento is null then null
    else extract(year from age(p.data_nascimento))::integer
  end                                                      as idade_anos,
  p.cursos_no_recital,
  p.cursos,
  p.faz_banda,
  -- NULL = tem curso para apresentar. Os dois valores nao-nulos pedem acoes opostas:
  -- 'so_atividade_extra' e para aceitar, 'curso_nao_cadastrado' e para corrigir no Emusys.
  case
    when p.cursos_no_recital > 0        then null
    when p.cursos_matriculados > 0      then 'so_atividade_extra'
    else                                     'curso_nao_cadastrado'
  end                                                      as motivo_sem_curso
from pessoa p;

comment on view public.vw_evento_aluno_elegivel_v1 is
  'Candidatos ao recital por PESSOA (unidade_id, pessoa_chave), derivada de alunos ativos. '
  'Banda filtra CURSO, nunca pessoa. motivo_sem_curso separa a regra (so_atividade_extra) '
  'do defeito de cadastro (curso_nao_cadastrado). security_invoker: herda a RLS de alunos.';

revoke all on table public.vw_evento_aluno_elegivel_v1 from public, anon, authenticated;
grant select on table public.vw_evento_aluno_elegivel_v1 to authenticated;
grant select on table public.vw_evento_aluno_elegivel_v1 to service_role;
