-- FATIA 2, passo 1b — vigencia so decide onde EU SEI quem detecta (07/09/2026).
--
-- 🔴 O QUE A PRIMEIRA VERSAO IA APAGAR, pego no primeiro ensaio contra o banco.
--
--    Com a vigencia ligada, 272 sinais viraram 117 vigentes e 154 `sanou`. Bom
--    numero — e errado. Olhando POR REGRA, **R2, R7, R8, R10 e R14 estavam
--    TODAS em `sanou` e nenhuma em `vigente`**. Nao e coincidencia: essas cinco
--    nao saem do detector SQL, saem do **extrator de conversa** (cron 193, uma
--    edge separada as 10:30) — que a minha rodada nao chama e cuja execucao eu
--    nao registro.
--
--    Ou seja: "o detector nao reemitiu" estava sendo lido como "a situacao
--    sanou" quando o significado real era "esse detector nem rodou aqui". Eu
--    teria fechado, em silencio, sinais de *cancelamento declarado na conversa*
--    e *dificuldade financeira declarada* — o trabalho mais quente da lista.
--
-- 🔴 A DIRECAO DA FALHA AQUI E INVERSA A DO CAIXA, e de proposito. No dinheiro,
--    na duvida nao se lanca (fail-closed): repetir lancamento custa caro. Na
--    pauta, na duvida se MOSTRA (fail-open): o custo de um item velho e um
--    instante de atencao da ADM; o custo de um item sumido e um aluno perdido.
--    `sanou` exige prova positiva de que o detector daquela regra rodou e nao a
--    reemitiu. Sem essa prova, o sinal continua na lista.
--
-- 🔴 O MAPA REGRA→DETECTOR E DERIVADO DO CORPO DOS DETECTORES, nao escrito a
--    mao. Minha primeira versao tinha uma lista manual e a guarda pegou duas
--    regras que eu nao tinha visto (**R18** e **R9**). Pior: guarda de lista
--    manual pega regra NAO classificada, mas nao pega regra MAL classificada —
--    e essa produziria `sanou` errado, que e o dano de verdade. Derivando de
--    `pg_get_functiondef`, o mapa nao pode divergir de quem faz o trabalho, e
--    regra nova nasce classificada sozinha (a sincronizacao roda a cada rodada).

-- ── 1. de onde vem cada regra, lido do proprio detector ────────────────────
alter table radar_regras add column if not exists detector text;
comment on column radar_regras.detector is
  'Qual detector emite esta regra. DERIVADO por radar_sincronizar_detectores_v1 do corpo das funcoes — nao editar a mao. A vigencia so pode declarar `sanou` se ESTE detector rodou e nao reemitiu a situacao; regra sem detector nunca sana sozinha.';

alter table radar_rodadas add column if not exists detector text;
comment on column radar_rodadas.detector is
  'Qual detector rodou. Uma linha por detector, nao por rodada: sem isso nao da para dizer que a regra X foi reconferida, so que "algo rodou".';

create or replace function public.radar_sincronizar_detectores_v1()
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare v_n int := 0; v_orfas text[];
begin
  -- ⚠️ O par (funcao, apelido) e a UNICA parte escrita a mao, e ela e o que a
  --    `radar_rodada_diaria_v1` de fato chama — se divergir, a rodada quebra e
  --    aparece. As REGRAS de cada um saem do corpo da funcao.
  with detectores(fn, apelido) as (values
    ('radar_detectar_sinais_sql_v1',             'sql'),
    ('radar_detectar_aviso_previo_v1',           'aviso_previo'),
    ('radar_detectar_sinais_comercial_v1',       'comercial'),
    ('radar_detectar_matricula_sem_anamnese_v1', 'matricula_sem_anamnese')
  ),
  emitidas as (
    select d.apelido, m[1] as codigo
    from detectores d
    join pg_proc p on p.proname = d.fn and p.pronamespace = 'public'::regnamespace
    cross join lateral regexp_matches(pg_get_functiondef(p.oid), '''(R\d+)''', 'g') m
    group by 1, 2)
  update radar_regras r set detector = e.apelido
  from emitidas e
  where r.codigo = e.codigo and r.detector is distinct from e.apelido;
  get diagnostics v_n = row_count;

  -- ⚠️ Quem NAO aparece em nenhum detector fica NULL, e isso e informacao, nao
  --    lacuna: sao as de `llm_conversa` (extrator numa edge) e `sql_atendimento`
  --    (R18, cron horario proprio). Nenhuma delas registra rodada, entao
  --    nenhuma pode sanar sozinha — fail-open, por escolha.
  select array_agg(distinct r.codigo order by r.codigo) into v_orfas
  from radar_regras r
  where r.detector is null and coalesce(r.ativo, false)
    and r.origem not in ('llm_conversa', 'sql_atendimento')
    and exists (select 1 from radar_sinais s
                 where s.regra_codigo = r.codigo and s.status in ('aberto','triado'));

  return jsonb_build_object('reclassificadas', v_n,
                            'sem_detector_com_sinal_aberto', coalesce(v_orfas, '{}'));
end; $function$;

revoke all on function public.radar_sincronizar_detectores_v1() from public, anon;
grant execute on function public.radar_sincronizar_detectores_v1() to service_role;

select public.radar_sincronizar_detectores_v1();

-- ── 2. a rodada passa a ser POR DETECTOR ───────────────────────────────────
create or replace function public.radar_rodada_diaria_v1()
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare v_res jsonb := '{}'::jsonb; v_erros jsonb := '[]'::jsonb;
        v_um jsonb; v_id bigint; d record;
begin
  -- regra nova entra classificada antes de qualquer coisa
  v_res := jsonb_build_object('sincronizacao', radar_sincronizar_detectores_v1());

  -- ⚠️ Cada detector em bloco PROTEGIDO e com linha PROPRIA: falha de um nao
  --    impede os outros (padrao de `fechar_competencia_mensal_dia1_v1`) e, o
  --    que importa mais aqui, falha de um nao pode autorizar a vigencia a
  --    declarar que as regras DELE sanaram.
  for d in
    select * from (values
      ('sql',                    'radar_detectar_sinais_sql_v1()'),
      ('aviso_previo',           'radar_detectar_aviso_previo_v1()'),
      ('comercial',              'radar_detectar_sinais_comercial_v1()'),
      ('matricula_sem_anamnese', 'radar_detectar_matricula_sem_anamnese_v1()')
    ) as t(nome, chamada)
  loop
    insert into radar_rodadas (rodada, detector) values ('diaria', d.nome) returning id into v_id;
    begin
      execute 'select public.' || d.chamada into v_um;
      update radar_rodadas set concluida_em = now(), resultado = v_um where id = v_id;
      v_res := v_res || jsonb_build_object(d.nome, v_um);
    exception when others then
      -- ⚠️ `concluida_em` fica NULL: rodada que morreu nao reconfere nada.
      update radar_rodadas set erros = jsonb_build_object('erro', sqlerrm, 'sqlstate', sqlstate)
       where id = v_id;
      v_erros := v_erros || jsonb_build_object('detector', d.nome, 'erro', sqlerrm, 'sqlstate', sqlstate);
    end;
  end loop;

  return jsonb_build_object('ok', jsonb_array_length(v_erros) = 0,
                            'resultado', v_res, 'erros', v_erros);
end; $function$;

revoke all on function public.radar_rodada_diaria_v1() from public, anon;
grant execute on function public.radar_rodada_diaria_v1() to service_role;

-- ── 3. a vigencia, ancorada no detector DAQUELA regra ──────────────────────
-- ⚠️ DROP antes do CREATE: `create or replace view` recusa renomear/reordenar
--    coluna (`cannot change name of view column`). A view nasceu ha minutos e
--    nao tem dependente — conferido antes, que e o que torna isto seguro; view
--    com consumidor exige o caminho longo.
drop view if exists public.vw_radar_sinal_vigencia_v1;
create view public.vw_radar_sinal_vigencia_v1 as
with rodada as (
  select detector, max(concluida_em) as em
  from radar_rodadas
  where rodada = 'diaria' and concluida_em is not null and erros is null
  group by detector)
select s.*,
       regexp_replace(s.chave_dedup, '\|[^|]+$', '') as situacao,
       r.detector as detector_da_regra,
       ro.em      as rodada_referencia,
       case
         -- 🔴 Sem detector declarado ou sem rodada boa dele: NUNCA `sanou`.
         --    A lista mostra demais, jamais de menos (ver cabecalho).
         when r.detector is null or ro.em is null then 'vigente'
         -- ⚠️ 36h cobre um dia perdido sem cobrir dois — a rodada e diaria.
         when ro.em < now() - interval '36 hours' then 'sem_rodada'
         when s.visto_em >= ro.em - interval '30 minutes' then 'vigente'
         else 'sanou'
       end as vigencia
from radar_sinais s
left join radar_regras r on r.codigo = s.regra_codigo
left join rodada ro on ro.detector = r.detector
where s.status in ('aberto', 'triado');

comment on view public.vw_radar_sinal_vigencia_v1 is
  'Sinal aberto com o veredito de vigencia, ancorado no detector DA REGRA. vigente = reemitido na ultima rodada boa daquele detector, OU detector desconhecido/sem rodada (fail-open deliberado: sumir com trabalho real e pior que mostrar item velho). sanou = o detector rodou e parou de reemitir. sem_rodada = o detector existe mas esta atrasado — alarme, nao lista vazia. Leitura canonica da pauta; nao filtrar radar_sinais cru.';

revoke all on public.vw_radar_sinal_vigencia_v1 from public, anon, authenticated;
grant select on public.vw_radar_sinal_vigencia_v1 to authenticated, service_role;

-- ── prova ──────────────────────────────────────────────────────────────────
do $prova$
declare v_orfas jsonb; v_conversa int; v_sanou_conversa int; v_vig int; v_san int;
begin
  v_orfas := radar_sincronizar_detectores_v1() -> 'sem_detector_com_sinal_aberto';
  if jsonb_array_length(v_orfas) > 0 then
    raise exception 'regra com sinal aberto e sem detector: % — classifique antes de seguir', v_orfas;
  end if;

  -- 🔴 as de conversa NAO podem aparecer como sanou: e o bug que esta migration
  --    existe para impedir, e a guarda tem de saber falhar.
  select count(*) filter (where true),
         count(*) filter (where vigencia = 'sanou')
    into v_conversa, v_sanou_conversa
  from vw_radar_sinal_vigencia_v1
  where regra_codigo in (select codigo from radar_regras where origem = 'llm_conversa');
  if v_conversa = 0 then
    raise exception 'nenhum sinal de conversa no universo — a prova nao exercitou nada';
  end if;
  if v_sanou_conversa > 0 then
    raise exception 'sinal de conversa marcado como sanou (%): o fail-open nao pegou', v_sanou_conversa;
  end if;

  select count(*) filter (where vigencia='vigente'), count(*) filter (where vigencia='sanou')
    into v_vig, v_san from vw_radar_sinal_vigencia_v1 where dominio='aluno';

  raise notice 'prova: % de conversa, nenhum sanou · dominio aluno: % vigentes, % sanaram',
               v_conversa, v_vig, v_san;
end $prova$;
