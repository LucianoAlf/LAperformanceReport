-- FERIADO NAO E RECESSO — a v1 confundia os dois (06/09/2026, correcao do Alf).
--
-- A v1, escrita horas antes, dizia "sem aula regular = escola fechada". Errado,
-- e o Alf apontou: "no recesso de julho tem atendimento, tem matricula, tem
-- aula experimental. Isso ai e so para domingo e feriados. Periodo de recesso,
-- o pau canta."
--
-- MEDIDO, e ele esta certo com folga. Matriculas por dia:
--
--   ferias de verao  (05/01-28/02, 48 dias) ....... 6,1   ← MAIS que dia util
--   dias uteis de agosto .......................... 3,9
--   recesso de julho (20/07-01/08, 12 dias) ....... 1,6
--   feriado 03-04/04 (Sexta-Santa) ................ 0
--   feriado 21/04 · 01/05 · 04/06 ................. 0
--   domingos de agosto ............................ 0
--
-- Ou seja: a v1 teria calado a Sol e a Mila durante **60 dias por ano** de
-- operacao comercial intensa — inclusive janeiro e fevereiro, que sao a
-- temporada de matricula da escola.
--
-- ⚠️ LEAD NAO SERVE DE SINAL: 31 leads no Corpus Christi contra 34,3 num dia
--    util. Lead chega sozinho pelo Instagram, ninguem precisa estar na escola.
--    Matricula e que exige gente trabalhando — e por isso separa perfeito.
--
-- 🔴 O PROBLEMA: matricula do dia nao existe as 9h, quando o caixa abre. O
--    sinal precisa ser PROSPECTIVO. A saida veio da forma do calendario:
--
--      feriado = bloco CURTO de dias sem aula (1-2 dias, isolado)
--      recesso = bloco LONGO (12 e 48 dias nos dois casos de 2026)
--
--    Escola nao tira "feriado" de 3 dias: isso e periodo de ferias, e em ferias
--    o comercial trabalha. E o bloco e visivel ANTES de comecar, porque a grade
--    futura cobre ~14 dias — em 20/07 ja dava para ver 21-25/07 vazios.
--
-- ⚠️ O CORTE DE "SEM AULA" CAIU DE 20% PARA 5% do tipico. Com 20%, o dia
--    07/08/2026 era classificado como fechado — e nao era: tinha 306 aulas, 254
--    CANCELADAS e 52 vivas em 3 unidades, com 2 matriculas. Dia de operacao
--    reduzida, nao dia fechado. Feriado de verdade da 0 ou 1 aula.
--
-- ⚠️ DOMINGO e sempre sem expediente, por definicao, sem passar pela regra do
--    bloco — senao um domingo colado num feriado viraria bloco de 2 e a conta
--    ficaria dependendo de onde a semana cai.

create or replace function public.escola_agenda_v1(
  p_de date default (now() at time zone 'America/Sao_Paulo')::date,
  p_ate date default null,
  p_unidade_id uuid default null
) returns jsonb
language sql stable security definer set search_path to 'public' as $function$
with parametros as (
  -- janela alargada: o bloco precisa ser visto inteiro, para tras e para frente
  select p_de - 30 as ini, coalesce(p_ate, p_de) + 30 as fim
),
dias as (
  select d::date d, extract(dow from d)::int dow
  from parametros, generate_series(ini, fim, interval '1 day') d
),
reais as (
  select x.d, x.dow,
         (select count(*) from aulas_emusys a
           where a.data_aula::date = x.d and a.categoria = 'normal'
             and not coalesce(a.cancelada, false)
             and (p_unidade_id is null or a.unidade_id = p_unidade_id)) vivas
  from dias x
),
-- tipico do mesmo dia da semana, contando so os dias que tiveram aula
tipicos as (
  select r.d, r.dow, r.vivas,
         (select percentile_cont(0.5) within group (order by h.v)
            from (select (select count(*) from aulas_emusys a
                           where a.data_aula::date = s::date and a.categoria = 'normal'
                             and not coalesce(a.cancelada, false)
                             and (p_unidade_id is null or a.unidade_id = p_unidade_id)) v
                    from generate_series(r.d - interval '8 week', r.d - interval '1 week',
                                         interval '1 week') s) h
           where h.v > 0) tipico,
         (select count(*) from (
            select (select count(*) from aulas_emusys a
                     where a.data_aula::date = s::date and a.categoria = 'normal'
                       and not coalesce(a.cancelada, false)
                       and (p_unidade_id is null or a.unidade_id = p_unidade_id)) v
              from generate_series(r.d - interval '8 week', r.d - interval '1 week',
                                   interval '1 week') s) h2
           where h2.v > 0) refs
  from reais r
),
-- ⚠️ corte de 5%, nao 20%: com 20% o 07/08/2026 (52 aulas vivas, 2 matriculas)
--    virava "fechado". Feriado de verdade da 0 ou 1 aula.
marcados as (
  select *, (refs >= 3 and vivas < greatest(3, coalesce(tipico,0) * 0.05)) sem_aula
  from tipicos
),
-- blocos contiguos de dias sem aula, IGNORANDO domingo
uteis as (select * from marcados where dow <> 0),
grupos as (
  select *, sum(case when sem_aula then 0 else 1 end) over (order by d) bloco
  from uteis
),
tamanhos as (
  select d, sem_aula, vivas, tipico, refs,
         count(*) filter (where sem_aula) over (partition by bloco) dias_no_bloco
  from grupos
)
select coalesce(jsonb_agg(jsonb_build_object(
    'dia', m.d,
    'dia_semana', trim(to_char(m.d, 'TMDay')),
    'aulas_vivas', m.vivas,
    'tipico', round(coalesce(m.tipico, 0)),
    'semanas_de_referencia', m.refs,
    'dias_no_bloco', coalesce(t.dias_no_bloco, 0),
    'situacao', case
      when m.dow = 0 then 'domingo'
      when m.refs < 3 then 'desconhecido'
      when not coalesce(t.sem_aula, false) then
        case when m.vivas < coalesce(m.tipico,0) * 0.6 then 'expediente_reduzido' else 'normal' end
      -- sem aula: bloco curto = feriado (fecha); bloco longo = recesso (opera)
      when coalesce(t.dias_no_bloco, 1) >= 3 then 'recesso'
      else 'feriado' end,
    'tem_expediente', case
      when m.dow = 0 then false
      when m.refs < 3 then null
      when not coalesce(t.sem_aula, false) then true
      when coalesce(t.dias_no_bloco, 1) >= 3 then true   -- recesso: o comercial trabalha
      else false end
  ) order by m.d), '[]'::jsonb)
from marcados m
left join tamanhos t on t.d = m.d
where m.d between p_de and coalesce(p_ate, p_de);
$function$;

comment on function public.escola_agenda_v1(date, date, uuid) is
  'Agenda operacional derivada da GRADE. Distingue FERIADO (bloco curto sem aula -> escola fechada, '
  'medido: 0 matriculas/dia) de RECESSO (bloco de 3+ dias -> aula regular para, comercial trabalha; '
  'medido: 1,6 matriculas/dia em julho e 6,1 nas ferias de verao, contra 3,9 num dia util). '
  '`tem_expediente = null` significa "nao sei" e NUNCA deve ser lido como fechado.';

revoke all on function public.escola_agenda_v1(date, date, uuid) from public, anon;
grant execute on function public.escola_agenda_v1(date, date, uuid) to service_role, authenticated;

-- prova: os casos medidos, um a um.
--
-- ⚠️ A assercao e sobre CALAR, nao sobre `tem_expediente`. As ferias de verao
--    devolvem `desconhecido` (nao ha grade antes de 2026 para comparar), e
--    desconhecido JA significa "rodo assim mesmo" — o resultado operacional e o
--    certo mesmo sem a funcao saber o nome do periodo. Afirmar `= true` ali
--    reprovaria um comportamento correto, que foi o que a 1a versao desta prova
--    fez.
do $prova$
declare v jsonb; r record; v_cala bool;
begin
  for r in
    select * from (values
      ('2026-09-07'::date, true,  'feriado',    'Independencia, segunda isolada'),
      ('2026-04-03',       true,  'feriado',    'Sexta-Santa, bloco de 2'),
      ('2026-05-01',       true,  'feriado',    'Dia do Trabalho'),
      ('2026-06-04',       true,  'feriado',    'Corpus Christi'),
      ('2026-07-22',       false, 'recesso',    'recesso de julho — 1,6 matriculas/dia'),
      ('2026-01-20',       false, null,         'ferias de verao — 6,1 matriculas/dia'),
      ('2026-08-07',       false, null,         '52 aulas vivas, 2 matriculas — aberto'),
      ('2026-09-08',       false, 'normal',     'terca normal'),
      ('2026-09-05',       false, 'normal',     'sabado normal'),
      ('2026-09-06',       true,  'domingo',    'domingo')
    ) t(dia, deve_calar, esperada_situacao, rotulo)
  loop
    select x into v from jsonb_array_elements(escola_agenda_v1(r.dia, r.dia, null)) x;
    v_cala := ((v->>'tem_expediente')::bool is false);
    if v_cala is distinct from r.deve_calar then
      raise exception '% (%): esperava calar=%, veio % — situacao=%, % aulas, tipico %, bloco %',
        r.dia, r.rotulo, r.deve_calar, v_cala, v->>'situacao',
        v->>'aulas_vivas', v->>'tipico', v->>'dias_no_bloco';
    end if;
    if r.esperada_situacao is not null and v->>'situacao' is distinct from r.esperada_situacao then
      raise exception '% (%): esperava situacao=%, veio %', r.dia, r.rotulo,
        r.esperada_situacao, v->>'situacao';
    end if;
    raise notice '  ok  % % -> % (% aulas, tipico %, bloco % dias)',
      r.dia, r.rotulo, v->>'situacao', v->>'aulas_vivas', v->>'tipico', v->>'dias_no_bloco';
  end loop;
  raise notice 'feriado e recesso separados — 10 casos medidos, e nenhum periodo comercial calado';
end $prova$;
