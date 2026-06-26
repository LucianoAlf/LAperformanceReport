-- P07D - Make ignored professor-unit links explicit in the canonical view.

create or replace view public.vw_professores_emusys_vinculos as
select
  pu.id as professores_unidade_id,
  pu.unidade_id,
  u.codigo as unidade_codigo,
  u.nome as unidade_nome,
  pu.professor_id,
  p.nome as professor_nome,
  p.nome_normalizado as professor_nome_normalizado,
  p.ativo as professor_ativo,
  pu.emusys_id as emusys_professor_id,
  pu.emusys_nome,
  pu.emusys_nome_normalizado,
  pu.emusys_ativo,
  pu.validacao_status,
  pu.match_score,
  pu.origem,
  pu.validado_em,
  pu.validado_por,
  pu.last_seen_em,
  pu.updated_at,
  case
    when pu.validacao_status = 'ignorado' then 'ignorado'
    when pu.emusys_id is null then 'sem_emusys_id'
    when pu.validacao_status in ('validado_humano', 'auto_match', 'preexistente') then 'vinculo_utilizavel'
    else 'revisar'
  end as qualidade_vinculo
from public.professores_unidades pu
join public.professores p on p.id = pu.professor_id
join public.unidades u on u.id = pu.unidade_id;

grant select on public.vw_professores_emusys_vinculos to anon, authenticated;
