-- MODULO EVENTOS — quem pode entrar no recital (LAPE-39, fase 2)
--
-- A aba Alunos precisa da lista de candidatos da unidade. O grao dela e PESSOA, nao
-- matricula: `alunos` guarda uma linha por curso contratado, e a tela do recital pergunta
-- "quem sobe no palco", nao "quantos contratos existem". A identidade e o par
-- (unidade_id, pessoa_chave), pela MESMA regra da anamnese — a chave sai de
-- `vw_aluno_pessoa_chave`, fonte unica; o `case` dela nao e reimplementado aqui.
--
-- VALIDACAO CONTRA O ARTEFATO REAL (18/09/2026): o CSV de 259 alunos que o Arthur usou no
-- prototipo foi cruzado nome a nome com esta regra. E da BARRA (249 dos 259 casam por nome
-- exato normalizado) e a unidade tem hoje exatamente 259 pessoas ativas. Os 10 restantes
-- explicam-se sem sobra: 4 sao grafia (espaco duplo, apostrofo tipografico, "Guerrera" x
-- "Guerrero", "Fatima Santa Cruz da Silva" x "Fatima Santa Cruz") e estao ativos; 4 estao
-- TRANCADOS — que pela regra da casa nao e aluno ativo, e por isso a lista do Emusys os
-- trazia e esta nao traz; 1 evadiu; e 1 (Marina Bessa) nunca foi aluna, e LEAD.
--
-- ⚠️ BANDA NAO ENTRA NO RECITAL (decisao do Arthur), mas a pessoa que faz banda ENTRA.
-- Medido na Barra: as 13 pessoas com matricula de banda TAMBEM tem curso regular, e nenhuma
-- e "so banda" — por isso o filtro de banda vive nos CURSOS (o que vira apresentacao) e
-- nunca nas PESSOAS (quem aparece na lista). Filtrar a pessoa esconderia da coordenacao um
-- aluno que tem, sim, curso para apresentar.
--
-- `security_invoker = true` de proposito: a view NAO tem escopo proprio, ela herda a RLS de
-- `alunos` (`is_admin() or unidade_id in get_user_unidade_ids()`). E o oposto da receita de
-- `vw_aluno_comunidade_wa_v1`, que precisa de invoker=false para alcancar uma tabela
-- trancada — aqui a tabela de origem ja e legivel pelo usuario, entao emprestar os direitos
-- do dono so criaria um caminho de vazamento.

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
)
select
  m.unidade_id,
  m.pessoa_chave,
  -- Procedencia: a matricula mais recente da pessoa. `aluno_id` nunca identifica a pessoa
  -- (esse papel e da chave) — serve para a escrita ter uma linha de origem, no mesmo
  -- sentido que `anamneses.aluno_id` tem desde 01/09.
  (array_agg(m.aluno_id order by m.aluno_id desc))[1]   as aluno_id_referencia,
  -- Nome da matricula mais nova: quando o cadastro corrige a grafia, e nela que a correcao
  -- aparece primeiro.
  (array_agg(m.nome    order by m.aluno_id desc))[1]     as nome,
  max(m.data_nascimento)                                 as data_nascimento,
  case
    when max(m.data_nascimento) is null then null
    else extract(year from age(max(m.data_nascimento)))::integer
  end                                                    as idade_anos,
  -- Cursos que VAO ao palco. Sem banda, sem duplicata: e exatamente o numero de
  -- apresentacoes que a pessoa gera, a regra que a UNIQUE de evento_apresentacao cobra.
  count(distinct m.curso_id) filter (where not m.curso_e_banda and m.curso_id is not null)
                                                         as cursos_no_recital,
  coalesce(
    jsonb_agg(distinct jsonb_build_object(
      'curso_id',       m.curso_id,
      'curso_nome',     m.curso_nome,
      'professor_id',   m.professor_id,
      'professor_nome', m.professor_nome
    )) filter (where not m.curso_e_banda and m.curso_id is not null),
    '[]'::jsonb
  )                                                      as cursos,
  -- Sinalizado, nunca escondido: a coordenacao precisa saber que a pessoa esta na banda
  -- mesmo que a banda nao suba nesta grade.
  bool_or(m.curso_e_banda)                               as faz_banda
from matricula m
group by m.unidade_id, m.pessoa_chave;

comment on view public.vw_evento_aluno_elegivel_v1 is
  'Candidatos ao recital por PESSOA (unidade_id, pessoa_chave), derivada de alunos ativos. '
  'Banda filtra CURSO, nunca pessoa. security_invoker: herda a RLS de alunos. LAPE-39.';

-- ALTER DEFAULT PRIVILEGES do schema: toda relacao nova nasce com authenticated=arwdDxtm.
-- `grant select` depois NAO tira o resto — o revoke nominal vem primeiro.
revoke all on table public.vw_evento_aluno_elegivel_v1 from public, anon, authenticated;
grant select on table public.vw_evento_aluno_elegivel_v1 to authenticated;
grant select on table public.vw_evento_aluno_elegivel_v1 to service_role;
