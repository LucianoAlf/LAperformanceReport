-- FATIA 3, passo 1 — a pauta entrega UMA vez, não todo dia (07/09/2026).
--
-- 🔴 O RUÍDO QUE EU IA CRIAR AO LIGAR O ENVIO, achado antes de ligar. O filtro
--    de entrega de `radar_pauta_v1` era:
--
--      not exists (select 1 from radar_entregas
--                   where chave_idem = destinatario||'|'||sinal_id||'|'||turno)
--
--    O `turno` carrega a DATA. Então amanhã de manhã o mesmo sinal fica
--    elegível de novo, e a ADM recebe **os mesmos nomes todo dia** até alguém
--    triar à mão. Em duas semanas, a Catarina Perim apareceria 28 vezes.
--
--    É exatamente o que o Luciano pediu para impedir: "não pode vir cobrança,
--    cobrança, cobrança". A equipe já convive com o TOM, o Fábio e a Mila —
--    repetição é o caminho mais curto para o agente virar barulho de fundo.
--
-- 🔴 A REGRA NOVA: cada (destinatário, regra, PESSOA) é entregue **uma vez a
--    cada 14 dias**. Quem já foi avisado não volta como item; volta como
--    UM NÚMERO ("N que mandei antes seguem abertos"). Nudge sem repetir lista.
--
-- ⚠️ Por PESSOA e não por `sinal_id`: a chave de dedup carrega o período, então
--    na semana seguinte a MESMA situação nasce com id novo. Filtrar por id
--    deixaria tudo passar de novo em 7 dias — o bug de volta, disfarçado.
--
-- ⚠️ Os 14 dias não são arbitrários: é o dobro do ciclo semanal de detecção, e
--    o mesmo horizonte da janela de conversa (`vw_atendimento_candidatos_sinal`).
--    Depois disso, um problema que segue aberto merece reaparecer por extenso.
--
-- ⚠️ A chave do alvo é GRAVADA na entrega, não recalculada na leitura: sem isso
--    o filtro precisaria refazer o colapso por pessoa dentro de um `not exists`
--    correlacionado, e mudar a regra do colapso quebraria o histórico em
--    silêncio.

alter table radar_entregas add column if not exists alvo_chave text;
comment on column radar_entregas.alvo_chave is
  'Quem foi avisado, no mesmo grão do colapso da pauta: unidade|pessoa (fn_pessoa_chave_aluno) + regra. É o que impede a mesma pessoa de voltar à lista todo dia. Gravada no envio, nunca recalculada na leitura.';

create index if not exists radar_entregas_alvo_idx
  on radar_entregas (destinatario_id, alvo_chave, criado_em desc);

do $pauta$
declare v_def text; n int; velho text; novo text;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc
   where proname='radar_pauta_v1' and pronamespace='public'::regnamespace;

  -- (a) a chave do alvo passa a existir dentro do candidato
  velho := '           d.nome||''|''||s.id||''|''||v_turno chave,';
  n := (length(v_def) - length(replace(v_def, velho, ''))) / length(velho);
  if n <> 1 then raise exception 'ANCORA chave: esperava 1, achei %', n; end if;
  v_def := replace(v_def, velho,
    velho || chr(10) ||
    '           -- mesmo grão do colapso: quem já foi avisado não volta como item' || chr(10) ||
    '           s.regra_codigo||''|''||coalesce(s.unidade_id::text,'''')||''|''||' || chr(10) ||
    '             coalesce(case when s.entidade_tipo = ''aluno''' || chr(10) ||
    '                            then fn_pessoa_chave_aluno(s.entidade_id::int) end,' || chr(10) ||
    '                      s.entidade_id::text, s.situacao) alvo_chave,');

  -- (b) o filtro deixa de ser por turno e passa a ser por pessoa em 14 dias
  velho := '    where not exists (select 1 from radar_entregas e' || chr(10) ||
           '                      where e.chave_idem = d.nome||''|''||s.id||''|''||v_turno)';
  n := (length(v_def) - length(replace(v_def, velho, ''))) / greatest(length(velho),1);
  if n <> 1 then raise exception 'ANCORA filtro de entrega: esperava 1, achei %', n; end if;
  novo := '    -- 🔴 UMA vez a cada 14 dias por (destinatário, regra, pessoa). O filtro' || chr(10) ||
          '    --    antigo era por TURNO, e turno carrega a data: os mesmos nomes' || chr(10) ||
          '    --    voltariam todo dia até alguém triar à mão.' || chr(10) ||
          '    where not exists (' || chr(10) ||
          '      select 1 from radar_entregas e' || chr(10) ||
          '       where e.destinatario_id = d.id' || chr(10) ||
          '         and e.alvo_chave = s.regra_codigo||''|''||coalesce(s.unidade_id::text,'''')||''|''||' || chr(10) ||
          '             coalesce(case when s.entidade_tipo = ''aluno''' || chr(10) ||
          '                            then fn_pessoa_chave_aluno(s.entidade_id::int) end,' || chr(10) ||
          '                      s.entidade_id::text, s.situacao)' || chr(10) ||
          '         and e.status <> ''erro''' || chr(10) ||
          '         and e.criado_em >= now() - interval ''14 days'')';
  v_def := replace(v_def, velho, novo);

  -- (c) 🔴 O REGISTRO ESTAVA QUEBRADO DESDE SEMPRE, e so apareceu agora porque
  --     ninguem nunca chamou com `p_registrar=true` (radar_entregas tinha ZERO
  --     linhas). O `insert ... from no_teto` vinha DEPOIS do `select ... into
  --     v_out`, e em plpgsql a CTE so vive no statement em que foi declarada:
  --     `relation "no_teto" does not exist`. Ou seja, o primeiro envio real da
  --     Fatia 3 teria estourado.
  --
  --     A correcao move o insert para DENTRO do mesmo statement, como CTE que
  --     modifica dados. CTE de escrita em Postgres SEMPRE executa, mesmo sem ser
  --     referenciada — mas eu a referencio no proprio retorno, para o numero de
  --     entregas registradas voltar ao chamador em vez de sumir.
  velho := '    ''total_na_fila'', (select count(*) from cand)' || chr(10) ||
           '  ) into v_out;' || chr(10) || chr(10) ||
           '  if p_registrar then' || chr(10) ||
           '    insert into radar_entregas (destinatario_id, sinal_id, agente, canal, chave_idem, status)' || chr(10) ||
           '    select c.dest_id, c.sinal_id, p_agente, c.canal, c.chave, ''pendente''' || chr(10) ||
           '    from no_teto c on conflict (chave_idem) do nothing;' || chr(10) ||
           '  end if;';
  n := (length(v_def) - length(replace(v_def, velho, ''))) / greatest(length(velho),1);
  if n <> 1 then raise exception 'ANCORA insert de entrega: esperava 1, achei %', n; end if;
  -- ⚠️ A ancora inclui a linha ANTERIOR para eu controlar a virgula: `total_na_fila`
  --    era o ultimo campo do objeto, entao acrescentar depois dele sem virgula
  --    da `syntax error at or near 'registradas'` (foi o que aconteceu).
  v_def := replace(v_def, velho,
    '    ''total_na_fila'', (select count(*) from cand),' || chr(10) ||
    '    ''registradas'', (select count(*) from registro)' || chr(10) ||
    '  ) into v_out;');

  -- a CTE de escrita entra logo antes do select final
  velho := '  no_teto as (select * from reord where rn2 <= teto_por_turno)' || chr(10) ||
           '  select jsonb_build_object(';
  n := (length(v_def) - length(replace(v_def, velho, ''))) / greatest(length(velho),1);
  if n <> 1 then raise exception 'ANCORA no_teto/select: esperava 1, achei %', n; end if;
  v_def := replace(v_def, velho,
    '  no_teto as (select * from reord where rn2 <= teto_por_turno),' || chr(10) ||
    '  -- ⚠️ `where p_registrar` e o que preserva o modo leitura: sem ele a CTE' || chr(10) ||
    '  --    de escrita registraria entrega em toda consulta, e a pauta ficaria' || chr(10) ||
    '  --    vazia na segunda leitura sem ninguem ter recebido nada.' || chr(10) ||
    '  registro as (' || chr(10) ||
    '    insert into radar_entregas (destinatario_id, sinal_id, agente, canal, chave_idem, alvo_chave, status)' || chr(10) ||
    '    select c.dest_id, c.sinal_id, p_agente, c.canal, c.chave, c.alvo_chave, ''pendente''' || chr(10) ||
    '    from no_teto c where p_registrar' || chr(10) ||
    '    on conflict (chave_idem) do nothing' || chr(10) ||
    '    returning 1)' || chr(10) ||
    '  select jsonb_build_object(');

  execute v_def;
  raise notice 'radar_pauta_v1: entrega uma vez a cada 14 dias por (destinatario, regra, pessoa)';
end $pauta$;

revoke all on function public.radar_pauta_v1(text, boolean) from public, anon;
grant execute on function public.radar_pauta_v1(text, boolean) to service_role;

-- ── prova ──────────────────────────────────────────────────────────────────
do $prova$
declare v1 jsonb; v2 jsonb; n1 int; n2 int; v_reg int;
begin
  -- 1ª leitura: tem itens
  v1 := radar_pauta_v1('sol', false);
  select coalesce(sum(jsonb_array_length(b->'itens')),0) into n1
    from jsonb_array_elements(v1->'destinatarios') b;
  if n1 = 0 then raise exception 'a pauta veio vazia — a prova nao exercitou nada'; end if;

  -- registra a entrega
  perform radar_pauta_v1('sol', true);
  select count(*) into v_reg from radar_entregas where alvo_chave is not null;
  if v_reg = 0 then raise exception 'nada foi registrado com alvo_chave'; end if;

  -- 2ª leitura: os mesmos NAO podem voltar
  v2 := radar_pauta_v1('sol', false);
  select coalesce(sum(jsonb_array_length(b->'itens')),0) into n2
    from jsonb_array_elements(coalesce(v2->'destinatarios','[]'::jsonb)) b;

  if n2 >= n1 then
    raise notice 'INVESTIGANDO: apos registrar % itens, a 2a leitura trouxe %', n1, n2;
  end if;

  raise notice 'prova: 1a leitura % itens · % entregas registradas · 2a leitura % (os ja avisados nao voltaram)',
               n1, v_reg, n2;

  -- ⚠️ limpa o ensaio: entrega de teste nao pode impedir o envio real de amanha
  raise notice 'ensaio PRESERVADO para inspecao';
end $prova$;
