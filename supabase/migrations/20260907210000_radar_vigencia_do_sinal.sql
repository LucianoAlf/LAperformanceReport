-- FATIA 2, passo 1 — o sinal passa a saber se AINDA VALE (07/09/2026).
--
-- 🔴 O DEFEITO, medido antes de escrever uma linha de codigo.
--
--    Nada reavalia um sinal depois de detectado. Ele nasce, e so sai da lista
--    por expiracao no relogio ou triagem humana. Em R1 ("frequencia
--    despencando", 123 dos 272 abertos = 45% da pauta) isso produz exatamente
--    o ruido que a Daiana descreveu no lado comercial:
--
--      · 23 dos 75 alunos de R1 (31%) vieram a **TODAS** as aulas dos ultimos
--        14 dias — estao na lista como "despencando" e ja voltaram.
--      · Destes, **15 ja estao acima de 50%** na propria janela de 60 dias da
--        regra: falham o criterio dela HOJE e o sinal segue aberto.
--
--    E a lista ainda RENASCE: 100% das chaves carregam o periodo, entao 272
--    sinais abertos sao **180 situacoes** em duas semanas de operacao (1,51
--    copia cada). No ritmo atual, em dezembro a mesma familia apareceria 15x.
--
-- 🔴 A SOLUCAO NAO DUPLICA NENHUMA REGRA — e o ponto mais importante daqui.
--    A tentacao era escrever um "revalidador" com as 11 condicoes de novo, que
--    e literalmente a causa-raiz das duplicatas de renovacao desta casa (duas
--    fontes de escrita com regras proprias para o mesmo campo). Em vez disso:
--
--      **o proprio detector ja diz a verdade de hoje, todo dia as 09:00.**
--
--    Se ele reemite a situacao, ela vale; se para de reemitir, sanou. O
--    detector continua sendo a fonte unica, e regra NOVA nasce coberta sem
--    ninguem lembrar de nada.
--
--    Prova da separacao, medida em R1: dos **48 redetectados** hoje, a
--    frequencia media de 60 dias e **30,7%** e **ZERO** esta acima de 50%. Dos
--    **27 nao redetectados**, a media e 43,9% e **22 (81%) ja passaram de 50%**
--    — os 5 restantes caem no piso de `aulas >= 3` ou na borda da janela.
--
-- ⚠️ POR QUE `visto_em` E NAO "detectado na semana corrente": o `on conflict
--    (chave_dedup) do nothing` **congela `detectado_em` no primeiro dia** em que
--    a condicao apareceu no periodo. Como o detector roda TODO DIA, na terca a
--    linha de segunda pareceria velha. Inferir o periodo pela chave tambem nao
--    serve: R12/R13 usam MES (e, no aviso previo, um mes FUTURO — o da saida
--    prevista) enquanto as outras 9 usam semana ISO. `visto_em` resolve os dois
--    sem adivinhar formato, e vale para qualquer regra futura.
--
-- ⚠️ FALHA FECHADA: sem rodada recente a vigencia e `sem_rodada`, que **nao e**
--    "sanou". Cron parado esvaziaria a pauta em silencio — o mesmo modo de
--    falha do `sem_captura` da comunidade WhatsApp, onde "nao sei" nunca pode
--    virar "nao". Aqui vira alarme, nao lista vazia.

-- ── 1. a coluna que faltava ────────────────────────────────────────────────
alter table radar_sinais add column if not exists visto_em timestamptz;
comment on column radar_sinais.visto_em is
  'Ultima vez que o DETECTOR reemitiu esta situacao. Diferente de detectado_em, que congela na primeira vez do periodo por causa do ON CONFLICT. E a base de vw_radar_sinal_vigencia_v1: sinal nao reemitido na ultima rodada sanou sozinho.';

update radar_sinais set visto_em = detectado_em where visto_em is null;
create index if not exists radar_sinais_visto_em_idx on radar_sinais (visto_em desc)
  where status in ('aberto','triado');

-- ── 2. os 5 detectores passam a carimbar `visto_em` ────────────────────────
-- ⚠️ Guarda declara o numero esperado POR FUNCAO (27/08: assumir 1 escondeu
--    metade da correcao). Total 14: 6 + 5 + 1 + 1 + 1.
do $detectores$
declare
  r record; v_def text; n int; v_total int := 0;
  esperado jsonb := '{"radar_detectar_sinais_sql_v1":6,"radar_detectar_sinais_comercial_v1":5,
                      "radar_detectar_aviso_previo_v1":1,"radar_detectar_calor_atendimento_v1":1,
                      "radar_detectar_matricula_sem_anamnese_v1":1}'::jsonb;
  velho text := 'on conflict (chave_dedup) do nothing';
  novo  text := 'on conflict (chave_dedup) do update set visto_em = now(), atualizado_em = now()';
begin
  for r in select key as fn, value::text::int as qtd from jsonb_each(esperado) loop
    select pg_get_functiondef(oid) into v_def from pg_proc
     where proname = r.fn and pronamespace = 'public'::regnamespace;
    if v_def is null then raise exception 'detector % nao existe', r.fn; end if;

    n := (length(v_def) - length(replace(v_def, velho, ''))) / length(velho);
    if n <> r.qtd then
      raise exception 'ANCORA em %: esperava % ocorrencias de do-nothing, achei %', r.fn, r.qtd, n;
    end if;

    execute replace(v_def, velho, novo);
    v_total := v_total + n;
  end loop;
  raise notice 'detectores atualizados: % clausulas passaram a carimbar visto_em', v_total;
end $detectores$;

-- ── 3. o registro da rodada — sem ele, "nao reemitiu" e ambiguo ────────────
create table if not exists radar_rodadas (
  id           bigserial primary key,
  rodada       text        not null,
  iniciada_em  timestamptz not null default now(),
  concluida_em timestamptz,
  resultado    jsonb,
  erros        jsonb
);
comment on table radar_rodadas is
  'Uma linha por execucao do detector. Existe para desambiguar "a situacao parou de aparecer" (sanou) de "o detector nao rodou" (nao sei). Sem isso, cron parado esvazia a pauta em silencio.';

alter table radar_rodadas enable row level security;
revoke all on table radar_rodadas from public, anon;
grant select on table radar_rodadas to authenticated, service_role;
drop policy if exists radar_rodadas_leitura on radar_rodadas;
create policy radar_rodadas_leitura on radar_rodadas for select
  to authenticated using (true);
-- ⚠️ RLS sem GRANT e letra morta, e GRANT sem policy le zero linha em silencio
--    (as duas armadilhas ja documentadas nesta casa). Aqui vao os dois.

create or replace function public.radar_rodada_diaria_v1()
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare v_id bigint; v_res jsonb := '{}'::jsonb; v_erros jsonb := '[]'::jsonb; v_um jsonb;
begin
  insert into radar_rodadas (rodada) values ('diaria') returning id into v_id;

  -- ⚠️ Cada detector em bloco PROTEGIDO: falha de um nao pode impedir os
  --    outros (mesmo padrao de `fechar_competencia_mensal_dia1_v1`, onde um
  --    aluno de CG deixou Barra e Recreio sem relatorio).
  begin v_um := radar_detectar_sinais_sql_v1();
        v_res := v_res || jsonb_build_object('sql', v_um);
  exception when others then
        v_erros := v_erros || jsonb_build_object('detector','sql','erro',sqlerrm,'sqlstate',sqlstate);
  end;

  begin v_um := radar_detectar_aviso_previo_v1();
        v_res := v_res || jsonb_build_object('aviso_previo', v_um);
  exception when others then
        v_erros := v_erros || jsonb_build_object('detector','aviso_previo','erro',sqlerrm,'sqlstate',sqlstate);
  end;

  begin v_um := radar_detectar_sinais_comercial_v1();
        v_res := v_res || jsonb_build_object('comercial', v_um);
  exception when others then
        v_erros := v_erros || jsonb_build_object('detector','comercial','erro',sqlerrm,'sqlstate',sqlstate);
  end;

  begin v_um := radar_detectar_matricula_sem_anamnese_v1();
        v_res := v_res || jsonb_build_object('matricula_sem_anamnese', v_um);
  exception when others then
        v_erros := v_erros || jsonb_build_object('detector','matricula_sem_anamnese','erro',sqlerrm,'sqlstate',sqlstate);
  end;

  -- ⚠️ `concluida_em` so e preenchida aqui. Rodada que morreu no meio fica com
  --    ela NULL, e a vigencia a ignora — de proposito: rodada parcial nao pode
  --    autorizar ninguem a declarar que uma situacao sanou.
  update radar_rodadas set concluida_em = now(), resultado = v_res,
         erros = case when jsonb_array_length(v_erros) > 0 then v_erros end
   where id = v_id;

  return jsonb_build_object('ok', jsonb_array_length(v_erros) = 0,
                            'rodada_id', v_id, 'resultado', v_res, 'erros', v_erros);
end; $function$;

revoke all on function public.radar_rodada_diaria_v1() from public, anon;
grant execute on function public.radar_rodada_diaria_v1() to service_role;

-- ── 4. a vigencia, com os TRES estados ─────────────────────────────────────
create or replace view public.vw_radar_sinal_vigencia_v1 as
with ultima as (
  select max(concluida_em) as em from radar_rodadas
   where rodada = 'diaria' and concluida_em is not null and erros is null)
select s.*,
       regexp_replace(s.chave_dedup, '\|[^|]+$', '') as situacao,
       (select em from ultima) as rodada_referencia,
       case
         -- ⚠️ 36h cobre um dia perdido sem cobrir dois: a rodada e diaria.
         when (select em from ultima) is null
           or (select em from ultima) < now() - interval '36 hours' then 'sem_rodada'
         when s.visto_em >= (select em from ultima) - interval '30 minutes' then 'vigente'
         else 'sanou'
       end as vigencia
from radar_sinais s
where s.status in ('aberto', 'triado');

comment on view public.vw_radar_sinal_vigencia_v1 is
  'Sinal aberto com o veredito de vigencia. vigente = o detector reemitiu na ultima rodada boa; sanou = ele parou de reemitir (a condicao deixou de valer sozinha); sem_rodada = o detector nao rodou e NAO SABEMOS — nunca tratar como sanou. Leitura canonica da pauta: nao filtrar radar_sinais cru.';

revoke all on public.vw_radar_sinal_vigencia_v1 from public, anon, authenticated;
grant select on public.vw_radar_sinal_vigencia_v1 to authenticated, service_role;
-- ⚠️ `ALTER DEFAULT PRIVILEGES` desta casa da TODOS os privilegios a
--    `authenticated` em relacao nova; `grant select` depois nao tira o resto.
--    Por isso o revoke vem antes. Conferir em pg_class.relacl = {authenticated=r}.
