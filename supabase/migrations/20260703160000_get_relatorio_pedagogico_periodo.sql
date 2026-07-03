-- Fase 0 do Relatório Pedagógico com IA: estende a RPC para aceitar um período.
-- Continua sendo a fonte única de verdade (frontend + edge/agente Fábio).
-- Params de período são opcionais (null = todo o histórico), mantendo compatibilidade
-- com as chamadas atuais get_relatorio_pedagogico_aluno(p_aluno_id).
-- SELECT-only, aditivo. Escopo = TODOS os cursos da PESSOA (nome + unidade_id).

-- Remove a versão de 1 argumento: com os novos params opcionais, uma chamada
-- get_relatorio_pedagogico_aluno(p_aluno_id) ficaria ambígua entre as duas assinaturas.
-- O frontend passa a chamar sempre a nova (com período null quando quer tudo).
drop function if exists public.get_relatorio_pedagogico_aluno(integer);

create or replace function public.get_relatorio_pedagogico_aluno(
  p_aluno_id integer,
  p_data_inicio date default null,
  p_data_fim date default null
)
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  with pessoa as (
    select nome, unidade_id, classificacao, modalidade
    from alunos
    where id = p_aluno_id
  ),
  matriculas as (
    select a.id
    from alunos a
    join pessoa p on a.nome = p.nome and a.unidade_id = p.unidade_id
  ),
  aulas as (
    select distinct on (ae.data_aula, ae.curso_nome, btrim(ae.anotacoes))
      ae.data_aula,
      (ae.data_hora_inicio at time zone 'America/Sao_Paulo')::time as horario_aula,
      ap.status,
      ae.curso_nome,
      ae.professor_nome,
      ae.tipo,
      ae.turma_nome,
      ae.anotacoes
    from aluno_presenca ap
    join aulas_emusys ae on ae.id = ap.aula_emusys_id
    where ap.aluno_id in (select id from matriculas)
      and ae.cancelada = false
      and ae.anotacoes is not null
      and btrim(ae.anotacoes) <> ''
      and (p_data_inicio is null or ae.data_aula >= p_data_inicio)
      and (p_data_fim is null or ae.data_aula <= p_data_fim)
    order by ae.data_aula, ae.curso_nome, btrim(ae.anotacoes),
             (ae.tipo <> 'individual'), (ae.professor_nome is null)
  ),
  aulas_json as (
    select
      count(*) as total,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'data_aula', data_aula,
            'horario_aula', horario_aula,
            'status', status,
            'curso_nome', curso_nome,
            'professor_nome', professor_nome,
            'tipo', tipo,
            'turma_nome', turma_nome,
            'anotacoes', anotacoes
          )
          order by data_aula desc, curso_nome
        ),
        '[]'::jsonb
      ) as itens
    from aulas
  ),
  coordenacao as (
    select
      p.classificacao,
      jsonb_build_array(
        jsonb_build_object('nome', 'Luciano', 'cargo', 'Direção'),
        jsonb_build_object(
          'nome',
          case
            when upper(coalesce(p.classificacao, '')) like 'LAMK%' then 'Marcos Quintella'
            else 'Juliana Balthazar'
          end,
          'cargo', 'Coordenação'
        ),
        jsonb_build_object('nome', 'Fernanda', 'cargo', 'Secretaria'),
        jsonb_build_object('nome', 'Clayton', 'cargo', 'Gerente de Relacionamento')
      ) as equipe
    from pessoa p
  )
  select jsonb_build_object(
    'aluno', jsonb_build_object(
      'id', p_aluno_id,
      'nome', p.nome,
      'classificacao', p.classificacao,
      'modalidade', p.modalidade,
      'is_kids', (upper(coalesce(p.classificacao, '')) like 'LAMK%')
    ),
    'unidade', jsonb_build_object(
      'nome', u.nome,
      'codigo', u.codigo,
      'endereco', u.endereco,
      'telefone', u.telefone,
      'gerente_nome', u.gerente_nome
    ),
    'periodo', jsonb_build_object(
      'data_inicio', p_data_inicio,
      'data_fim', p_data_fim
    ),
    'coordenacao', coordenacao.equipe,
    'total_registros', aulas_json.total,
    'aulas', aulas_json.itens
  )
  from pessoa p
  join unidades u on u.id = p.unidade_id
  cross join aulas_json
  cross join coordenacao;
$function$;

comment on function public.get_relatorio_pedagogico_aluno(integer, date, date) is
  'JSONB completo do Relatório de Histórico Pedagógico (aluno + escola + coordenação + aulas), com filtro opcional de período. Reutilizável por frontend e edge/agente Fábio. SELECT-only.';

grant execute on function public.get_relatorio_pedagogico_aluno(integer, date, date) to anon, authenticated;
