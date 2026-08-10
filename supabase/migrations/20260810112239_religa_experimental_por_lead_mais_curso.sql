-- Segunda rodada de religacao: LEAD + CURSO.
--
-- A primeira rodada (`20260810112125`) religou 19 casos exigindo 1 aula por experimental E
-- 1 experimental por aula. Sobraram 74, que se dividem em:
--   A) 32 — nenhuma aula do lead no dia. A aula nunca existiu: e agendamento cancelado.
--           Nao ha o que religar; fica para tratamento proprio.
--   C) 31 — VARIAS aulas do lead no dia. E multi-instrumento: a pessoa testou 2+ cursos.
--           O nome nao desempata, o lead sozinho tambem nao — mas o CURSO sim.
--   B) 11 — a aula ja esta tomada por outra experimental. Sao pares
--           agendamento x realizacao, tratados a parte.
--
-- Esta migration resolve o caso C cruzando `lead_experimentais.curso_interesse_id` com
-- `aulas_emusys.curso_nome`. ⚠️ O nome do curso na aula vem com sufixo " T" quando e turma
-- (ex.: "Canto T"), entao a comparacao remove o sufixo antes de casar.
--
-- Medido: das 31 com candidata livre, 28 tem candidata de curso igual. So sao religadas as
-- que ficam com EXATAMENTE UMA candidata depois do desempate — chave errada e pior que
-- chave ausente.
--
-- Resultado acumulado do dia: 117 -> 237 experimentais ligadas (77,7%); 362 -> 68 quebradas.
do $mig$
declare v_n int; v_antes int;
begin
  select count(*) into v_antes
    from public.lead_experimentais le
   where le.emusys_aula_id is not null
     and not exists (select 1 from public.aulas_emusys a where a.emusys_id = le.emusys_aula_id);

  if v_antes <> 74 then
    raise exception 'ABORTADO: esperava 74 quebradas, achei %', v_antes;
  end if;

  with quebradas as (
    select le.* from public.lead_experimentais le
     where le.emusys_aula_id is not null and le.emusys_lead_id is not null
       and not exists (select 1 from public.aulas_emusys a where a.emusys_id = le.emusys_aula_id)
  ), cand as (
    select q.id as le_id, a.emusys_id as aula
      from quebradas q
      join public.aula_alunos_emusys aa
        on aa.unidade_id = q.unidade_id and aa.emusys_lead_id = q.emusys_lead_id
      join public.aulas_emusys a
        on a.id = aa.aula_emusys_id and a.categoria = 'experimental'
       and a.data_aula = q.data_experimental
      join public.cursos c on c.id = q.curso_interesse_id
     where not exists (select 1 from public.lead_experimentais o
                        where o.unidade_id = q.unidade_id and o.emusys_aula_id = a.emusys_id)
       and lower(unaccent(c.nome)) = lower(unaccent(regexp_replace(coalesce(a.curso_nome,''), ' T$', '')))
     group by q.id, a.emusys_id
  ), inequivocas as (
    select le_id, min(aula) as aula
      from cand
     group by le_id
    having count(*) = 1
       and min(aula) not in (
         select aula from cand group by aula having count(distinct le_id) > 1
       )
  )
  update public.lead_experimentais le
     set emusys_aula_id = i.aula
    from inequivocas i
   where le.id = i.le_id;
  get diagnostics v_n = row_count;

  raise notice 'religadas por LEAD+CURSO: %', v_n;

  if v_n = 0 then
    raise exception 'ABORTADO: nenhuma religada — o desempate por curso nao funcionou';
  end if;
end
$mig$;
