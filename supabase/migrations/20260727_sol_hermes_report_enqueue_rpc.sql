-- Enfileira relatórios manuais para envio pela Sol/Hermes nativo.
-- Não envia por WAHA/UAZAPI. Usa status 'sol_pendente', ignorado pelo processor legado.

create or replace function public.sol_hermes_report_enqueue(
  p_texto text,
  p_tipo_relatorio text,
  p_unidade text default 'todos',
  p_competencia text default null,
  p_tipo_destino text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_texto text := btrim(coalesce(p_texto, ''));
  v_tipo_relatorio text := btrim(coalesce(p_tipo_relatorio, ''));
  v_unidade text := nullif(btrim(coalesce(p_unidade, 'todos')), '');
  v_tipo_destinatario text;
  v_unidade_ids uuid[];
  v_rows int := 0;
begin
  if length(v_texto) < 20 then
    return jsonb_build_object('success', false, 'error', 'texto inválido');
  end if;

  if v_tipo_relatorio = '' then
    return jsonb_build_object('success', false, 'error', 'tipoRelatorio obrigatório');
  end if;

  v_tipo_destinatario := coalesce(
    nullif(btrim(p_tipo_destino), ''),
    case
      when v_tipo_relatorio in ('diario', 'mensal', 'gerencial_ia', 'renovacoes', 'avisos', 'evasoes') then 'relatorio_admin'
      when v_tipo_relatorio in ('comercial', 'comercial_diario', 'comercial_mensal') then 'relatorio_comercial'
      else null
    end
  );

  if v_tipo_destinatario not in ('relatorio_admin', 'relatorio_comercial', 'relatorio_coordenacao') then
    return jsonb_build_object('success', false, 'error', 'tipo de destinatário não permitido: ' || coalesce(v_tipo_destinatario, 'null'));
  end if;

  select array_agg(u.id order by u.nome)
  into v_unidade_ids
  from public.unidades u
  where u.ativo = true
    and (
      coalesce(v_unidade, 'todos') = 'todos'
      or u.nome = v_unidade
      or u.id::text = v_unidade
    );

  if v_unidade_ids is null or array_length(v_unidade_ids, 1) is null then
    return jsonb_build_object('success', false, 'error', 'nenhuma unidade encontrada');
  end if;

  insert into public.fila_relatorios_whatsapp (
    unidade_id,
    unidade_nome,
    jid,
    grupo_nome,
    texto,
    status,
    agendada_para,
    erro,
    tentativas
  )
  select
    u.id,
    u.nome,
    d.jid,
    d.nome,
    v_texto,
    'sol_pendente',
    now(),
    case
      when p_competencia is not null then 'manual:' || v_tipo_relatorio || ':' || p_competencia
      else 'manual:' || v_tipo_relatorio
    end,
    0
  from public.whatsapp_destinatarios_relatorio d
  join public.unidades u on u.id = d.unidade_id
  where d.ativo = true
    and d.tipo = v_tipo_destinatario
    and d.unidade_id = any(v_unidade_ids)
    and not exists (
      select 1
      from public.fila_relatorios_whatsapp f
      where f.unidade_id = d.unidade_id
        and f.jid = d.jid
        and f.data_dia = ((now() at time zone 'America/Sao_Paulo'))::date
        and f.status in ('sol_pendente', 'sol_enviando', 'enviada')
    );

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return jsonb_build_object('success', false, 'error', 'nenhum destinatário ativo encontrado');
  end if;

  return jsonb_build_object(
    'success', true,
    'queued', v_rows,
    'status', 'sol_pendente',
    'tipoDestinatario', v_tipo_destinatario,
    'note', 'Enfileirado para Sol/Hermes nativo. Processor legado WAHA ignora status sol_pendente.'
  );
end;
$$;

revoke all on function public.sol_hermes_report_enqueue(text, text, text, text, text) from public;
grant execute on function public.sol_hermes_report_enqueue(text, text, text, text, text) to authenticated;
