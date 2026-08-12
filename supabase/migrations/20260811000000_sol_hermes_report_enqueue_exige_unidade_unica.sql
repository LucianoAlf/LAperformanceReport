-- Incidente 2026-08-10: sol_hermes_report_enqueue aceitava p_unidade='todos' (ou
-- qualquer valor que não casasse com uma unidade única) e fazia broadcast do MESMO
-- texto para todas as unidades ativas. Relatório do Recreio (gerencial_ia,
-- conteúdo específico da unidade) foi enfileirado com p_unidade='todos' e virou
-- 3 linhas idênticas (Campo Grande, Barra, Recreio) — cada uma com jid/unidade_nome
-- corretos, mas texto errado nas 2 primeiras.
--
-- Os dois únicos chamadores (ModalRelatorio.tsx, ComercialPage.tsx) sempre passam
-- uma unidade específica de propósito — nenhum uso legítimo depende do broadcast
-- para 'todos'. A trava fecha o buraco na origem: se p_unidade não resolver para
-- exatamente UMA unidade ativa, a função recusa em vez de espalhar o texto.

CREATE OR REPLACE FUNCTION public.sol_hermes_report_enqueue(
  p_texto text,
  p_tipo_relatorio text,
  p_unidade text DEFAULT 'todos'::text,
  p_competencia text DEFAULT NULL::text,
  p_tipo_destino text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      when v_tipo_relatorio in ('comercial', 'comercial_diario', 'comercial_mensal', 'comercial_lead', 'comercial_experimental', 'comercial_visita', 'comercial_matricula') then 'relatorio_comercial'
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
      u.nome = v_unidade
      or u.id::text = v_unidade
    );

  -- Exige exatamente 1 unidade -- bloqueia 'todos', vazio, typo ou qualquer
  -- valor ambíguo. Reportar texto de uma unidade para "todas" nunca é a
  -- intenção real de um relatório com conteúdo específico de unidade.
  if v_unidade_ids is null or array_length(v_unidade_ids, 1) is distinct from 1 then
    return jsonb_build_object(
      'success', false,
      'error', 'p_unidade deve identificar exatamente uma unidade ativa (recebido: ' || coalesce(p_unidade, 'null') || ')'
    );
  end if;

  insert into public.fila_relatorios_sol_hermes (
    tipo_relatorio,
    origem,
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
    v_tipo_relatorio,
    'manual',
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
      from public.fila_relatorios_sol_hermes f
      where f.tipo_relatorio = v_tipo_relatorio
        and f.unidade_id = d.unidade_id
        and f.jid = d.jid
        and f.data_dia = ((now() at time zone 'America/Sao_Paulo'))::date
        and f.status in ('sol_pendente', 'sol_enviando', 'enviada')
    );

  get diagnostics v_rows = row_count;

  return jsonb_build_object(
    'success', true,
    'queued', v_rows,
    'status', 'sol_pendente',
    'tipoDestinatario', v_tipo_destinatario,
    'skipped', case when v_rows = 0 then 'already_queued_or_sent' else null end,
    'note', 'Enfileirado para Sol/Hermes nativo em fila dedicada.'
  );
end;
$function$;
