-- Observabilidade do campo alunos.professor_experimental_id.
-- Ate a v32 do webhook processar-matricula-emusys o campo recebia uma COPIA do professor titular
-- da matricula, porque o professor da experimental nao vem no payload de matricula_nova (ele mora
-- em lead_experimentais). Resultado medido em 06/08/2026: 91,9% dos alunos matriculados desde
-- junho tinham os dois campos iguais, e 91 apontavam um professor sem nenhuma experimental
-- registrada por tras. A v33 passou a resolver o valor de lead_experimentais (professor unico,
-- experimental realizada, ocorrida ate a data da matricula) e a gravar null quando ambiguo.
-- Esta view existe para provar, ao longo dos proximos meses, se a correcao pegou de fato.
create or replace view public.vw_saude_professor_experimental
with (security_invoker = true) as
with base as (
  select
    date_trunc('month', a.data_matricula)::date as competencia,
    a.unidade_id,
    a.professor_experimental_id as campo,
    a.professor_atual_id as titular,
    (
      select array_agg(distinct le.professor_experimental_id)
      from public.lead_experimentais le
      where le.emusys_lead_id::text = a.emusys_lead_id
        and le.professor_experimental_id is not null
        and le.status in ('experimental_realizada', 'convertido')
        and le.data_experimental <= a.data_matricula
    ) as profs_experimental
  from public.alunos a
  where a.data_matricula is not null
    and a.arquivado_em is null
)
select
  competencia,
  unidade_id,
  count(*)::int                                                                          as matriculas,
  -- universo em que da para julgar: existe UMA experimental identificavel
  count(*) filter (where array_length(profs_experimental, 1) = 1)::int                   as com_experimental_unica,
  count(*) filter (where array_length(profs_experimental, 1) = 1
                     and campo = profs_experimental[1])::int                             as campo_confere,
  count(*) filter (where array_length(profs_experimental, 1) = 1
                     and campo is distinct from profs_experimental[1])::int              as campo_diverge,
  -- o sintoma do bug antigo: aponta professor sem nenhuma experimental por tras
  count(*) filter (where profs_experimental is null
                     and campo is not null and campo = titular)::int                     as copia_sem_lastro,
  -- comportamento correto da v33 quando nao ha experimental
  count(*) filter (where profs_experimental is null and campo is null)::int              as vazio_correto,
  count(*) filter (where array_length(profs_experimental, 1) > 1)::int                   as ambiguo_nao_decidivel,
  round(
    100.0 * count(*) filter (where array_length(profs_experimental, 1) = 1 and campo = profs_experimental[1])
    / nullif(count(*) filter (where array_length(profs_experimental, 1) = 1), 0)
  , 1)                                                                                   as pct_acerto
from base
group by 1, 2;

comment on view public.vw_saude_professor_experimental is
  'Saude do campo alunos.professor_experimental_id por competencia/unidade. campo_confere/pct_acerto = acerto contra a experimental real (lead_experimentais); copia_sem_lastro = sintoma do bug corrigido na v33 do webhook de matricula (06/08/2026).';

-- ALTER DEFAULT PRIVILEGES do schema public concede tudo em relacao nova para authenticated,
-- e grant select depois NAO tira o resto. Revogar primeiro e so entao conceder leitura.
revoke all on public.vw_saude_professor_experimental from public, anon, authenticated;
grant select on public.vw_saude_professor_experimental to authenticated;
