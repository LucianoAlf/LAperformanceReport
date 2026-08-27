-- Baseline sem mudanca semantica das funcoes de relatorio de presenca que
-- estavam vivas no banco, mas ainda nao tinham fonte versionada no Git.
-- Snapshot remoto: 2026-08-26T16:03:44Z, projeto ouqwbbermlzqqvtqwlul.

-- O cutover posterior precisa conseguir devolver exatamente o texto que estava
-- vivo antes da v2. A cópia é feita antes de qualquer CREATE OR REPLACE desta
-- migration e não fica exposta como nova porta pública.
do $preserva_legado$
declare
  v_def text;
  v_legado_def text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'fn_texto_relatorio_presenca'
    and pg_get_function_identity_arguments(p.oid) = 'p_unidade_id uuid, p_data date';

  v_legado_def := regexp_replace(
    v_def,
    'FUNCTION public\.fn_texto_relatorio_presenca\(',
    'FUNCTION public.fn_texto_relatorio_presenca_legado_v1(',
    'i'
  );
  if v_legado_def = v_def then
    raise exception 'assinatura fn_texto_relatorio_presenca nao encontrada';
  end if;
  execute v_legado_def;
end
$preserva_legado$;

revoke all on function public.fn_texto_relatorio_presenca_legado_v1(uuid, date)
  from public, anon, authenticated, service_role;

create or replace function public.fn_enfileirar_relatorio_presenca(
  p_data date default (current_date - 1),
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_u record;
  v_d record;
  v_txt text;
  v_out jsonb := '[]'::jsonb;
  v_id bigint;
  v_teve_aula boolean;
begin
  for v_u in
    select distinct on (f.unidade_id)
           f.unidade_id, f.unidade_nome, f.grupo_nome, f.jid
      from public.fila_relatorios_sol_hermes f
     where f.grupo_nome ilike 'RELAT%DI%RIOS%'
       and f.status = 'enviada' and f.jid is not null
       and f.unidade_id is not null
     order by f.unidade_id, f.enviada_em desc
  loop
    -- TEVE AULA? Se a unidade nao abriu, nao ha relatorio a dar. "Tudo
    -- fechado" num domingo e ruido, e ruido ensina a ignorar o canal.
    select exists (
      select 1 from public.aulas_emusys ae
       where ae.unidade_id = v_u.unidade_id
         and ae.data_aula = p_data
         and ae.data_hora_fim < now()
         and not coalesce(ae.cancelada, false)
         and ae.professor_id is not null
    ) into v_teve_aula;

    if not v_teve_aula then
      v_out := v_out || jsonb_build_object(
        'unidade', v_u.unidade_nome, 'pulado', 'nenhuma aula neste dia');
      continue;
    end if;

    v_txt := public.fn_texto_relatorio_presenca(v_u.unidade_id, p_data);

    if p_dry_run then
      v_out := v_out || jsonb_build_object(
        'unidade', v_u.unidade_nome, 'grupo', v_u.grupo_nome,
        'jid', v_u.jid, 'texto', v_txt);
      continue;
    end if;

    if exists (select 1 from public.fila_relatorios_sol_hermes
                where tipo_relatorio = 'presenca_pendencias'
                  and unidade_id = v_u.unidade_id
                  and data_dia = p_data
                  and status <> 'erro') then
      v_out := v_out || jsonb_build_object(
        'unidade', v_u.unidade_nome, 'pulado', 'ja enfileirado para este dia');
      continue;
    end if;

    insert into public.fila_relatorios_sol_hermes
      (tipo_relatorio, origem, unidade_id, unidade_nome, jid, grupo_nome,
       texto, status, agendada_para, data_dia, tentativas, metadata)
    values
      ('presenca_pendencias', 'auto_cron', v_u.unidade_id, v_u.unidade_nome,
       v_u.jid, v_u.grupo_nome, v_txt, 'sol_pendente', now(), p_data, 0,
       jsonb_build_object('rota','sol_hermes_native','fonte','fn_enfileirar_relatorio_presenca'))
    returning id into v_id;

    v_out := v_out || jsonb_build_object(
      'unidade', v_u.unidade_nome, 'grupo', v_u.grupo_nome, 'fila_id', v_id);
  end loop;

  -- ── Destinatario consolidado (uma mensagem com todas as unidades) ──────────
  -- Devolve NULL quando nenhuma unidade abriu no dia; nesse caso nao enfileira nada.
  v_txt := public.fn_texto_relatorio_presenca_consolidado(p_data);

  if v_txt is not null then
    for v_d in
      select d.nome, d.jid, d.caixa_id
        from public.whatsapp_destinatarios_relatorio d
       where d.tipo = 'presenca_pendencias_consolidado'
         and d.ativo
       order by d.id
    loop
      if p_dry_run then
        v_out := v_out || jsonb_build_object(
          'consolidado', v_d.nome, 'jid', v_d.jid,
          'caixa_id', v_d.caixa_id, 'texto', v_txt);
        continue;
      end if;

      -- IDEMPOTENCIA POR JID, nao por unidade: na linha consolidada unidade_id e
      -- NULL, e "unidade_id = null" nunca casa -- o guard passaria sempre e o
      -- destinatario receberia uma mensagem por execucao do cron.
      if exists (select 1 from public.fila_relatorios_sol_hermes
                  where tipo_relatorio = 'presenca_pendencias_consolidado'
                    and jid = v_d.jid
                    and data_dia = p_data
                    and status <> 'erro') then
        v_out := v_out || jsonb_build_object(
          'consolidado', v_d.nome, 'pulado', 'ja enfileirado para este dia');
        continue;
      end if;

      insert into public.fila_relatorios_sol_hermes
        (tipo_relatorio, origem, unidade_id, unidade_nome, jid, grupo_nome,
         texto, status, agendada_para, data_dia, tentativas, metadata)
      values
        ('presenca_pendencias_consolidado', 'auto_cron', null, 'Consolidado',
         v_d.jid, v_d.nome, v_txt, 'sol_pendente', now(), p_data, 0,
         jsonb_build_object(
           'rota', case when v_d.caixa_id is null then 'sol_hermes_native' else 'uazapi_caixa' end,
           'caixa_id', v_d.caixa_id,
           'fonte', 'fn_enfileirar_relatorio_presenca'))
      returning id into v_id;

      v_out := v_out || jsonb_build_object(
        'consolidado', v_d.nome, 'fila_id', v_id, 'caixa_id', v_d.caixa_id);
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'data', p_data,
                            'dry_run', p_dry_run, 'unidades', v_out);
end;
$function$;

revoke all on function public.fn_enfileirar_relatorio_presenca(date, boolean)
  from public, anon, authenticated;
grant execute on function public.fn_enfileirar_relatorio_presenca(date, boolean)
  to service_role;

create or replace function public.fn_texto_relatorio_presenca(
  p_unidade_id uuid,
  p_data date
)
returns text
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_unidade text;
  v_txt text;
  v_sem int;
  v_div int;
  v_linha record;
  v_prof text := '';
  v_dia text;
begin
  select nome into v_unidade from public.unidades where id = p_unidade_id;

  v_dia := to_char(p_data, 'DD') || '/' ||
    case extract(month from p_data)
      when 1 then 'janeiro' when 2 then 'fevereiro' when 3 then 'março'
      when 4 then 'abril'   when 5 then 'maio'      when 6 then 'junho'
      when 7 then 'julho'   when 8 then 'agosto'    when 9 then 'setembro'
      when 10 then 'outubro' when 11 then 'novembro' else 'dezembro'
    end || '/' || to_char(p_data, 'YYYY');

  select count(*) filter (where motivo='sem_resposta'),
         count(*) filter (where motivo='divergencia')
    into v_sem, v_div
    from public.fn_presenca_pendencias_do_dia(p_unidade_id, p_data);

  v_txt := '━━━━━━━━━━━━━━━━━━━━━━' || E'\n'
        || '📋 *PRESENÇA — PENDÊNCIAS*' || E'\n'
        || '🏢 *' || upper(coalesce(v_unidade,'?')) || '*' || E'\n'
        || '📆 ' || v_dia || E'\n'
        || '━━━━━━━━━━━━━━━━━━━━━━' || E'\n';

  if v_sem = 0 and v_div = 0 then
    return v_txt || E'\n' || '✅ *Tudo fechado.* Nenhuma pendência de presença.' || E'\n';
  end if;

  -- SEM RESPOSTA
  if v_sem > 0 then
    v_txt := v_txt || E'\n' || '⚠️ *SEM PRESENÇA E SEM FALTA* (' || v_sem || ')' || E'\n'
          || '_ninguém fechou a chamada — não é falta do aluno_' || E'\n'
          || '━━━━━━━━━━━━━━━━━━━━━━' || E'\n';
    v_prof := '';
    for v_linha in
      select * from public.fn_presenca_pendencias_do_dia(p_unidade_id, p_data)
       where motivo = 'sem_resposta'
    loop
      if v_linha.professor_nome is distinct from v_prof then
        v_prof := v_linha.professor_nome;
        v_txt := v_txt || E'\n' || '👤 *' || v_prof || '*' || E'\n';
      end if;
      v_txt := v_txt || '• ' || v_linha.hora || ' — ' || v_linha.aluno_nome
            || ' _(' || v_linha.curso_nome || ')_' || E'\n';
    end loop;
  end if;

  -- DIVERGENCIA
  if v_div > 0 then
    -- O titulo NAO promete "professor x secretaria". A primeira versao
    -- prometia, e o primeiro texto real desmentiu: veio
    -- `agenda_secretaria: falta x agenda_secretaria: presente` -- a MESMA
    -- origem respondendo diferente nas duas linhas da aula (o `aula_emusys_id`
    -- e id de EVENTO). Titulo que promete mais do que o dado sustenta faz a
    -- equipe procurar briga onde nao tem.
    v_txt := v_txt || E'\n' || '🔀 *RESPOSTAS QUE NÃO BATEM* (' || v_div || ')' || E'\n'
          || '_o mesmo aluno na mesma aula com duas respostas — validem qual vale_' || E'\n'
          || '━━━━━━━━━━━━━━━━━━━━━━' || E'\n';
    v_prof := '';
    for v_linha in
      select * from public.fn_presenca_pendencias_do_dia(p_unidade_id, p_data)
       where motivo = 'divergencia'
    loop
      if v_linha.professor_nome is distinct from v_prof then
        v_prof := v_linha.professor_nome;
        v_txt := v_txt || E'\n' || '👤 *' || v_prof || '*' || E'\n';
      end if;
      v_txt := v_txt || '• ' || v_linha.hora || ' — ' || v_linha.aluno_nome || E'\n'
            || '   ↳ ' || coalesce(v_linha.detalhe, '?') || E'\n';
    end loop;
  end if;

  v_txt := v_txt || E'\n' || '━━━━━━━━━━━━━━━━━━━━━━' || E'\n'
        || '_Corrijam no app ou na agenda. O que ficar sem resposta continua '
        || 'aparecendo amanhã._' || E'\n';

  return v_txt;
end;
$function$;

revoke all on function public.fn_texto_relatorio_presenca(uuid, date)
  from public, anon, authenticated, service_role;
grant execute on function public.fn_texto_relatorio_presenca(uuid, date)
  to authenticated, service_role;
