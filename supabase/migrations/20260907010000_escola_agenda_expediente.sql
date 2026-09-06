-- A ESCOLA PASSA A TER AGENDA QUE OS AGENTES CONSEGUEM LER (06/09/2026).
--
-- Motivo imediato: 07/09/2026 e feriado (Independencia) e cai numa segunda. Os
-- crons da Mila disparariam 08:30 e 18:30 normalmente — e seria o PRIMEIRO
-- briefing da lideranca na historia, num dia em que a escola esta fechada.
-- Mensagem automatica em dia sem expediente ensina a pessoa a ignorar o canal,
-- que e o oposto do que a proatividade serve.
--
-- 🔴 NAO CRIA TABELA DE FERIADO. `docs/` ja registra que "nao ha calendario
--    academico no banco", e a saida obvia seria cadastrar feriado a mao —
--    que envelhece, esquece recesso e depende de alguem lembrar. A GRADE JA
--    SABE: medido hoje, 07/09 tem 1 aula viva em 1 unidade, contra 320-330 nas
--    segundas vizinhas (24/08: 330 · 31/08: 324 · 14/09: 320). Queda de 99,7%.
--    Isso cobre feriado, recesso escolar e ponte com a mesma regra, sem
--    ninguem cadastrar nada.
--
-- ⚠️ O tipico e a MEDIANA do MESMO DIA DA SEMANA nas 8 semanas anteriores,
--    contando so os dias que tiveram aula. Sem o "so os dias com aula", o
--    recesso de 19/07-01/08 (documentado, 2 semanas) puxaria a mediana para
--    baixo e faria dia fechado parecer normal.
--
-- ⚠️ FALHA PARA "DESCONHECIDO", NUNCA PARA "FECHADO". Data fora do horizonte
--    do sync (a grade futura cobre ~14 dias) nao tem aula gravada — tratar
--    ausencia como fechado faria a Mila emudecer para sempre no dia em que o
--    sync atrasasse. Sem base de comparacao, a resposta e `desconhecido` e quem
--    chama decide; a proativa, por exemplo, fala assim mesmo.
--
-- ⚠️ Por unidade E consolidado: uma unidade pode fechar sozinha (obra, falta de
--    luz) enquanto as outras funcionam.

create or replace function public.escola_agenda_v1(
  p_de date default (now() at time zone 'America/Sao_Paulo')::date,
  p_ate date default null,
  p_unidade_id uuid default null
) returns jsonb
language sql stable security definer set search_path to 'public' as $function$
with dias as (
  select generate_series(p_de, coalesce(p_ate, p_de), interval '1 day')::date d
),
-- aulas vivas por dia no recorte pedido
reais as (
  select d.d, count(a.id) filter (where not coalesce(a.cancelada,false)) vivas
  from dias d
  left join aulas_emusys a
    on a.data_aula::date = d.d
   and (p_unidade_id is null or a.unidade_id = p_unidade_id)
  group by d.d
),
-- tipico: mediana do MESMO dia da semana nas 8 semanas anteriores, contando
-- so os dias que tiveram aula (senao o recesso rebaixa a referencia)
hist as (
  select d.d,
         percentile_cont(0.5) within group (order by x.vivas) tipico,
         count(*) semanas_com_aula
  from dias d
  cross join lateral (
    select count(a.id) filter (where not coalesce(a.cancelada,false)) vivas
    from generate_series(d.d - interval '8 week', d.d - interval '1 week', interval '1 week') s
    left join aulas_emusys a
      on a.data_aula::date = s::date
     and (p_unidade_id is null or a.unidade_id = p_unidade_id)
    group by s
  ) x
  where x.vivas > 0
  group by d.d
)
select coalesce(jsonb_agg(jsonb_build_object(
    'dia', r.d,
    'dia_semana', trim(to_char(r.d, 'TMDay')),
    'aulas_vivas', r.vivas,
    'tipico', round(coalesce(h.tipico, 0)),
    'semanas_de_referencia', coalesce(h.semanas_com_aula, 0),
    'situacao', case
      -- sem referencia = nao sei; nunca chutar "fechado"
      when coalesce(h.semanas_com_aula, 0) < 3 then 'desconhecido'
      when r.vivas = 0 then 'sem_expediente'
      when r.vivas < greatest(3, h.tipico * 0.2) then 'sem_expediente'
      when r.vivas < h.tipico * 0.6 then 'expediente_reduzido'
      else 'normal' end,
    'tem_expediente', case
      when coalesce(h.semanas_com_aula, 0) < 3 then null
      when r.vivas = 0 or r.vivas < greatest(3, h.tipico * 0.2) then false
      else true end
  ) order by r.d), '[]'::jsonb)
from reais r left join hist h on h.d = r.d;
$function$;

comment on function public.escola_agenda_v1(date, date, uuid) is
  'Agenda operacional da escola derivada da GRADE (aulas_emusys), nao de tabela de feriado. '
  'Cobre feriado, recesso e ponte com a mesma regra. `tem_expediente` = null significa "nao sei" '
  '(sem base de comparacao) e NUNCA deve ser lido como fechado.';

revoke all on function public.escola_agenda_v1(date, date, uuid) from public, anon;
grant execute on function public.escola_agenda_v1(date, date, uuid) to service_role, authenticated;

-- prova contra os dias que ja conhecemos
do $prova$
declare v jsonb; v_feriado jsonb; v_normal jsonb;
begin
  v := escola_agenda_v1('2026-09-07', '2026-09-14', null);

  select x into v_feriado from jsonb_array_elements(v) x where x->>'dia' = '2026-09-07';
  select x into v_normal  from jsonb_array_elements(v) x where x->>'dia' = '2026-09-14';

  if v_feriado is null or v_normal is null then
    raise exception 'a agenda nao devolveu os dois dias';
  end if;
  if (v_feriado->>'tem_expediente')::bool is distinct from false then
    raise exception '07/09 (feriado) deveria ser sem expediente, veio %: % aulas contra tipico %',
      v_feriado->>'situacao', v_feriado->>'aulas_vivas', v_feriado->>'tipico';
  end if;
  if (v_normal->>'tem_expediente')::bool is distinct from true then
    raise exception '14/09 (segunda normal) deveria ter expediente, veio %', v_normal->>'situacao';
  end if;

  -- o recesso escolar documentado (19/07 a 01/08) tem de cair como fechado
  select x into v_feriado from jsonb_array_elements(escola_agenda_v1('2026-07-22','2026-07-22',null)) x;
  if (v_feriado->>'tem_expediente')::bool is distinct from false then
    raise exception 'o recesso de julho nao foi reconhecido: %', v_feriado;
  end if;

  raise notice 'agenda provada: 07/09 = % (% aulas vs tipico %) · 14/09 = % · recesso de julho reconhecido',
    v_feriado->>'situacao', (v->0)->>'aulas_vivas', (v->0)->>'tipico', v_normal->>'situacao';
end $prova$;
