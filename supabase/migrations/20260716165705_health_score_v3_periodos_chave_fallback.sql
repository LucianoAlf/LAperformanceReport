-- Alinha a unicidade materializada com o grao do reconstrutor.
-- Quando o Emusys nao informa matricula_disciplina_id (null/0), a particao
-- permanece separada por identidade de aluno na origem + disciplina e fica
-- obrigatoriamente em revisao no motor.

drop index if exists public.uq_professor_periodos_identidade_reconstrucao;
drop index if exists public.uq_professor_periodos_um_ativo_por_disciplina;

create unique index uq_professor_periodos_identidade_reconstrucao
  on public.professor_matricula_disciplina_periodos_v1 (
    reconstrucao_id,
    pessoa_chave,
    (
      case
        when nullif(emusys_matricula_disciplina_id, 0) is not null
          then 'md:' || emusys_matricula_disciplina_id::text
        else 'fallback:a:' || coalesce(emusys_aluno_id::text, 'sem-aluno') ||
             ':d:' || coalesce(emusys_disciplina_id::text, 'sem-disciplina')
      end
    ),
    coalesce(emusys_professor_id, -1),
    data_inicio
  );

create unique index uq_professor_periodos_um_ativo_por_disciplina
  on public.professor_matricula_disciplina_periodos_v1 (
    reconstrucao_id,
    pessoa_chave,
    (
      case
        when nullif(emusys_matricula_disciplina_id, 0) is not null
          then 'md:' || emusys_matricula_disciplina_id::text
        else 'fallback:a:' || coalesce(emusys_aluno_id::text, 'sem-aluno') ||
             ':d:' || coalesce(emusys_disciplina_id::text, 'sem-disciplina')
      end
    )
  )
  where status_periodo = 'ativo';

comment on index public.uq_professor_periodos_um_ativo_por_disciplina is
  'Um periodo ativo por chave canonica; fallback sem matricula-disciplina e isolado por aluno Emusys e disciplina.';
