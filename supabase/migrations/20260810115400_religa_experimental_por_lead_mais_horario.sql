-- Terceira rodada de religacao: LEAD + HORARIO.
--
-- Sobraram do LEAD+CURSO os casos de multi-instrumento em que o nome do curso do interesse
-- nao bate com o `curso_nome` da aula (grafia diferente, ou o lead testou algo diferente do
-- que estava no interesse). O HORARIO desempata: a pessoa testou dois instrumentos em
-- horarios diferentes no mesmo dia.
--
-- Medido: 24 experimentais com candidata livre, 40 pares possiveis; com o horario, 19
-- ficam com EXATAMENTE UMA candidata. Religadas 9 (as demais disputam a mesma aula com
-- outra experimental quebrada, e a trava recusa escolher).
--
-- ⚠️ `lead_experimentais.horario_experimental` e hora local; `aulas_emusys.data_hora_inicio`
-- e timestamptz. A comparacao converte para America/Sao_Paulo antes de casar, senao o fuso
-- deslocaria tudo em 3 horas.
--
-- ⚠️ Comparacao por PREFIXO 'HH24:MI' de proposito: o horario do CRM as vezes vem com
-- segundos e o da aula nao.
do $mig$
declare v_n int; v_antes int;
begin
  select count(*) into v_antes
    from public.lead_experimentais le
   where le.emusys_aula_id is not null
     and not exists (select 1 from public.aulas_emusys a where a.emusys_id = le.emusys_aula_id);

  if v_antes <> 68 then
    raise exception 'ABORTADO: esperava 68 quebradas, achei %', v_antes;
  end if;

  with q as (
    select le.* from public.lead_experimentais le
     where le.emusys_aula_id is not null and le.emusys_lead_id is not null
       and le.horario_experimental is not null
       and not exists (select 1 from public.aulas_emusys a where a.emusys_id = le.emusys_aula_id)
  ), cand as (
    select q.id as le_id, a.emusys_id as aula
      from q
      join public.aula_alunos_emusys aa
        on aa.unidade_id = q.unidade_id and aa.emusys_lead_id = q.emusys_lead_id
      join public.aulas_emusys a
        on a.id = aa.aula_emusys_id and a.categoria = 'experimental'
       and a.data_aula = q.data_experimental
     where not exists (select 1 from public.lead_experimentais o
                        where o.unidade_id = q.unidade_id and o.emusys_aula_id = a.emusys_id)
       and q.horario_experimental::text like
           to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo','HH24:MI') || '%'
     group by q.id, a.emusys_id
  ), inequivocas as (
    select le_id, min(aula) as aula
      from cand
     group by le_id
    having count(*) = 1
       and min(aula) not in (select aula from cand group by aula having count(distinct le_id) > 1)
  )
  update public.lead_experimentais le
     set emusys_aula_id = i.aula
    from inequivocas i
   where le.id = i.le_id;
  get diagnostics v_n = row_count;

  raise notice 'religadas por LEAD+HORARIO: %', v_n;
  if v_n = 0 then
    raise exception 'ABORTADO: nenhuma religada — o desempate por horario nao funcionou';
  end if;
end
$mig$;
