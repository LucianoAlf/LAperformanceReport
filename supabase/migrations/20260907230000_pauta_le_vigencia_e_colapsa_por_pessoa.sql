-- FATIA 2, passo 2 — a pauta le vigencia e mostra a PESSOA uma vez (07/09/2026).
--
-- 🔴 POR QUE NAO EXISTE FECHAMENTO AUTOMATICO AQUI, e essa foi a decisao mais
--    importante deste passo. O caminho obvio era um job que marcasse os `sanou`
--    como encerrados. Ele tem um modo de falha que so aparece semanas depois:
--
--      a chave de dedup carrega o periodo, entao se o sinal for FECHADO hoje e
--      a condicao voltar amanha (o aluno some de novo na mesma semana), o
--      `on conflict (chave_dedup) do update` reencontra a linha JA FECHADA e so
--      atualiza `visto_em` — o sinal nunca reaparece na pauta. Trabalho real
--      perdido em silencio, que e exatamente o que esta frente combate.
--
--    Entao a vigencia fica sendo um **veredito vivo**, nao uma transicao de
--    estado: a view recalcula a cada leitura e o sinal volta sozinho quando o
--    detector volta a emiti-lo. Sem job, sem estado, sem esse modo de falha.
--    O dado de aprendizado ("quais regras disparam em coisa que se resolve
--    sozinha") continua disponivel — e ate melhor, porque e ao vivo:
--      select regra_codigo, count(*) filter (where vigencia='sanou')
--        from vw_radar_sinal_vigencia_v1 group by 1;
--
-- 🔴 COLAPSO POR PESSOA. 272 sinais abertos sao 180 situacoes e ~140 pessoas.
--    Caso medido: Manuela Borges apareceu 2x em R13 — `R13|aluno|1736|2026-09`
--    (mes de saida antigo, `sanou`) e `R13|aluno|1736|2026-10` (o corrigido,
--    `vigente`). Uma unica realidade — ela avisou que sai — em duas linhas. A
--    ADM que ve a mesma familia duas vezes aprende que a lista nao foi
--    conferida, e passa a nao conferir tambem.
--
-- ⚠️ O colapso e por (regra, pessoa), NAO por pessoa: R1 (frequencia) e R13
--    (aviso previo) na mesma pessoa sao conversas diferentes. Isso ja e tratado
--    a montante — `radar_detectar_aviso_previo_v1` marca `canonico=false` nos
--    outros sinais de quem esta em aviso previo, e a pauta so le canonicos.
--
-- ⚠️ `entidade_id` e NULL para `familia` (a identidade dela mora na
--    `chave_dedup`), entao a chave de colapso e
--    `coalesce(entidade_id::text, situacao)`. Agrupar so por `entidade_id`
--    juntaria TODAS as familias numa linha so — erro que eu mesmo cometi ao
--    analisar isto pela primeira vez e que os dados desmentiram.

do $pauta$
declare v_def text; n int;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc
   where proname = 'radar_pauta_v1' and pronamespace = 'public'::regnamespace;
  if v_def is null then raise exception 'radar_pauta_v1 nao existe'; end if;

  -- ── (a) a fonte passa a ser a vigencia, nao a tabela crua ────────────────
  n := (length(v_def) - length(replace(v_def,
        'join radar_sinais s' || chr(10) || '      on s.status in (''aberto'',''triado'') and s.canonico', '')))
       / length('join radar_sinais s' || chr(10) || '      on s.status in (''aberto'',''triado'') and s.canonico');
  if n <> 1 then raise exception 'ANCORA fonte: esperava 1, achei %', n; end if;
  v_def := replace(v_def,
    'join radar_sinais s' || chr(10) || '      on s.status in (''aberto'',''triado'') and s.canonico',
    'join vw_radar_sinal_vigencia_v1 s' || chr(10) ||
    '      -- 🔴 `vigente` = o detector daquela regra reemitiu na ultima rodada boa.' || chr(10) ||
    '      --    Media de 60 dias nao anda depressa: sem este filtro, 31%% dos alunos' || chr(10) ||
    '      --    de R1 estavam na lista tendo vindo a TODAS as aulas dos ultimos 14' || chr(10) ||
    '      --    dias, e 15 deles ja acima do proprio limiar da regra.' || chr(10) ||
    '      on s.vigencia = ''vigente'' and s.canonico');

  -- ── (b) o ranking sai do CTE bruto e passa a rodar sobre o colapso ───────
  n := (length(v_def) - length(replace(v_def,
        '           row_number() over (partition by d.id order by', '')))
       / length('           row_number() over (partition by d.id order by');
  if n <> 1 then raise exception 'ANCORA row_number: esperava 1, achei %', n; end if;
  v_def := replace(v_def,
    '           row_number() over (partition by d.id order by',
    '           -- ⚠️ Colapso ANTES do ranking: a mesma pessoa na mesma regra e' || chr(10) ||
    '           --    UM item. Numerar antes deixaria buracos no teto por turno' || chr(10) ||
    '           --    (a copia consumiria vaga e depois sumiria).' || chr(10) ||
    '           row_number() over (partition by d.id, s.regra_codigo,' || chr(10) ||
    '                              coalesce(s.entidade_id::text, s.situacao)' || chr(10) ||
    '                              order by s.visto_em desc, s.detectado_em desc) rn_pessoa,' || chr(10) ||
    '           row_number() over (partition by d.id order by');

  -- ── (c) o teto passa a ler o colapso ─────────────────────────────────────
  n := (length(v_def) - length(replace(v_def, 'no_teto as (select * from cand where rn <= teto_por_turno)', '')))
       / length('no_teto as (select * from cand where rn <= teto_por_turno)');
  if n <> 1 then raise exception 'ANCORA no_teto: esperava 1, achei %', n; end if;
  v_def := replace(v_def,
    'no_teto as (select * from cand where rn <= teto_por_turno)',
    'unico as (select * from cand where rn_pessoa = 1),' || chr(10) ||
    '  -- ⚠️ `rn` e `total_fila` sao recontados sobre `unico`: contar a fila com' || chr(10) ||
    '  --    as copias diria "mais 40 na fila" onde ha 12 pessoas.' || chr(10) ||
    '  reord as (select u.*, row_number() over (partition by u.dest_id order by u.rn) rn2,' || chr(10) ||
    '                   count(*) over (partition by u.dest_id) fila2 from unico u),' || chr(10) ||
    '  no_teto as (select * from reord where rn2 <= teto_por_turno)');

  -- ── (d) o texto e a contagem passam a usar os recontados ─────────────────
  n := (length(v_def) - length(replace(v_def, 'max(c.total_fila)', '')))
       / length('max(c.total_fila)');
  -- ⚠️ Sao 5, nao 4: o alias mais dois pares (comparacao + subtracao) em CADA
  --    ramo do case (estrategica e operacional). Eu contei 4 e a guarda
  --    recusou — que e o motivo de ela declarar o numero em vez de assumir.
  if n <> 5 then raise exception 'ANCORA total_fila: esperava 5, achei %', n; end if;
  v_def := replace(v_def, 'max(c.total_fila)', 'max(c.fila2)');

  n := (length(v_def) - length(replace(v_def, 'order by c.rn)', '')))
       / length('order by c.rn)');
  if n <> 3 then raise exception 'ANCORA order by rn: esperava 3, achei %', n; end if;
  v_def := replace(v_def, 'order by c.rn)', 'order by c.rn2)');

  n := (length(v_def) - length(replace(v_def, '''na_fila'', x.total_fila', '')))
       / length('''na_fila'', x.total_fila');
  if n <> 1 then raise exception 'ANCORA na_fila: esperava 1, achei %', n; end if;

  n := (length(v_def) - length(replace(v_def, 'max(c.total_fila)::int total_fila', '')))
       / length('max(c.total_fila)::int total_fila');
  if n <> 0 then raise exception 'ANCORA total_fila alias: esperava 0 apos a troca, achei %', n; end if;

  execute v_def;
  raise notice 'radar_pauta_v1: le vigencia e colapsa por (regra, pessoa)';
end $pauta$;

revoke all on function public.radar_pauta_v1(text, boolean) from public, anon;
grant execute on function public.radar_pauta_v1(text, boolean) to service_role;

-- ── prova ──────────────────────────────────────────────────────────────────
do $prova$
declare v_total int; v_vig int; v_dup int;
begin
  select count(*) into v_total from radar_sinais where dominio='aluno' and status in ('aberto','triado');
  select count(*) into v_vig   from vw_radar_sinal_vigencia_v1 where dominio='aluno' and vigencia='vigente';
  if v_vig >= v_total then
    raise exception 'a vigencia nao filtrou nada (% de %) — algo esta errado', v_vig, v_total;
  end if;

  -- nenhuma (regra, pessoa) pode aparecer 2x entre os vigentes canonicos
  select count(*) into v_dup from (
    select regra_codigo, coalesce(entidade_id::text, situacao) pessoa
    from vw_radar_sinal_vigencia_v1
    where dominio='aluno' and vigencia='vigente' and canonico
    group by 1,2 having count(*) > 1) t;

  raise notice 'prova: % abertos → % vigentes · % pares (regra,pessoa) ainda com copia, que o colapso da pauta resolve',
               v_total, v_vig, v_dup;
end $prova$;
