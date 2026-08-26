-- Bloco aditivo: destinatario consolidado. O loop por unidade fica intocado, exceto
-- pela guarda `f.unidade_id is not null` na descoberta -- agora que a coluna e nullable,
-- a linha consolidada nao pode envenenar o distinct on que resolve o grupo das adms.
create or replace function public.fn_enfileirar_relatorio_presenca(p_data date DEFAULT (CURRENT_DATE - 1), p_dry_run boolean DEFAULT true)
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

-- Destinatario: Fabi Valdevino (Sucesso do Aluno) recebe pela caixa 3 = Lia.
insert into public.whatsapp_destinatarios_relatorio (tipo, nome, jid, unidade_id, caixa_id, ativo)
select 'presenca_pendencias_consolidado', 'Fabi Valdevino (privado)', '5521994696489', null, 3, true
 where not exists (
   select 1 from public.whatsapp_destinatarios_relatorio
    where tipo = 'presenca_pendencias_consolidado' and jid = '5521994696489'
 );
