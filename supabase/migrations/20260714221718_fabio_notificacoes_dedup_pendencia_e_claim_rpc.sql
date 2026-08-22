-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- DECISAO (14/07, depois de auditar o Tom): NAO construir fabio_jobs (fila com lock/retry)
-- pra briefing/pendencia. Prova no banco do Tom: fila (announcement_jobs, 32 linhas / 3
-- anuncios) e so pra fan-out AVULSO. Recorrente (group_ritual_logs, 42 linhas / 4 presets)
-- usa so log+dedup, sem fila nenhuma. Briefing e pendencia sao recorrentes — mesmo padrao.
-- fabio_jobs (fila de verdade) fica reservada pra Fase 3 (Jorni/backing track — trabalho
-- assincrono real, que demora e pode falhar de verdade).
--
-- Generaliza o dedup diario que hoje so cobria briefing_matinal: pendencia_registro tambem
-- e recorrente (1x/dia, decisao do Alf de hoje — nunca acumula em QUANTIDADE de mensagem,
-- so em CONTEUDO). experimental_nova/reagendamento ficam de fora do dedup — podem
-- legitimamente acontecer mais de uma vez no mesmo dia.
drop index if exists public.uq_fabio_notif_briefing_diario;

create unique index uq_fabio_notif_recorrente_diario
  on public.fabio_notificacoes (professor_id, tipo, dia_referencia)
  where tipo in ('briefing_matinal','pendencia_registro');

-- RPC de "claim atomico" pro worker do Hermes: tenta registrar o envio de hoje.
-- Se ja foi enviado (dedup bateu), devolve ja_enviado_hoje=true e o worker PULA — sem
-- precisar de SELECT-antes-de-INSERT (que teria race condition entre checar e gravar).
-- O padrao "insert direto, trata conflito" e mais seguro que "verifica, depois insere".
create or replace function public.fabio_registrar_envio_notificacao(
  p_professor_id integer,
  p_tipo text,
  p_categoria text,
  p_canal text,
  p_corpo text,
  p_titulo text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  insert into public.fabio_notificacoes
    (professor_id, tipo, categoria, canal, corpo, titulo, status, enviada_em)
  values
    (p_professor_id, p_tipo, p_categoria, p_canal, p_corpo, p_titulo, 'enviada', now())
  on conflict (professor_id, tipo, dia_referencia)
    where tipo in ('briefing_matinal','pendencia_registro')
  do nothing
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', true, 'ja_enviado_hoje', true, 'enviado', false);
  end if;

  return jsonb_build_object('ok', true, 'ja_enviado_hoje', false, 'enviado', true, 'notificacao_id', v_id);
end;
$function$;

revoke all on function public.fabio_registrar_envio_notificacao(integer,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.fabio_registrar_envio_notificacao(integer,text,text,text,text,text) to service_role, fabio_agent;
