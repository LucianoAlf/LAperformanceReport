-- Feature (Fase 2 - base): camada de dados reutilizável do Relatório de Histórico Pedagógico.
-- Retorna TUDO que o relatório precisa em um único JSONB: dados do aluno, da unidade (escola),
-- da coordenação/equipe e a linha do tempo pedagógica (conteúdo das aulas do Emusys).
--
-- Reutilização: hoje o frontend (aba "Pedagógico" da Ficha do Aluno) monta o relatório
-- imprimível a partir deste JSON. Amanhã a mesma RPC alimenta o agente Fábio / edge function
-- para gerar PDF/PNG e enviar ao responsável via WhatsApp — mesma fonte de verdade.
--
-- SELECT-only, aditivo. Escopo = TODOS os cursos da PESSOA (nome + unidade_id).

create or replace function public.get_relatorio_pedagogico_aluno(p_aluno_id integer)
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
    select coalesce(
      jsonb_agg(
        jsonb_build_object('nome', s.nome, 'cargo', s.cargo)
        order by (s.unidade_id is not null), s.ordem
      ),
      '[]'::jsonb
    ) as equipe
    from staff_unidade s
    cross join pessoa p
    where coalesce(s.ativo, true) = true
      and (s.unidade_id = p.unidade_id or s.unidade_id is null)
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
    'coordenacao', coordenacao.equipe,
    'total_registros', aulas_json.total,
    'aulas', aulas_json.itens
  )
  from pessoa p
  join unidades u on u.id = p.unidade_id
  cross join aulas_json
  cross join coordenacao;
$function$;

comment on function public.get_relatorio_pedagogico_aluno(integer) is
  'JSONB completo do Relatório de Histórico Pedagógico (aluno + escola + coordenação + aulas). Reutilizável por frontend e futura edge/agente Fábio. SELECT-only.';

grant execute on function public.get_relatorio_pedagogico_aluno(integer) to anon, authenticated;
