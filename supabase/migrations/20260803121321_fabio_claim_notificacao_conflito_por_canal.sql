-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Segunda metade do contrato do indice uq_fabio_notif_recorrente_diario, que
-- passou a incluir o canal. O ON CONFLICT precisa casar EXATAMENTE com o
-- indice; sem isso a RPC devolve 42P10 e o briefing para de sair inteiro.
-- (Aconteceu: troquei o indice e deixei a RPC apontando pra chave antiga.)
create or replace function public.fabio_claim_notificacao(
  p_professor_id integer,
  p_tipo text,
  p_categoria text,
  p_canal text,
  p_corpo text,
  p_titulo text default null::text
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
    (professor_id, tipo, categoria, canal, corpo, titulo, status, tentativas)
  values
    (p_professor_id, p_tipo, p_categoria, p_canal, p_corpo, p_titulo, 'processando', 1)
  on conflict (professor_id, tipo, dia_referencia, canal)
    where tipo in ('briefing_matinal','pendencia_registro')
  do update set
    status = 'processando',
    tentativas = fabio_notificacoes.tentativas + 1,
    corpo = excluded.corpo,      -- reprocessa com conteudo fresco, nao o congelado da 1a tentativa
    titulo = excluded.titulo,
    canal = excluded.canal,
    last_error = null
  where fabio_notificacoes.status = 'falhou'
     or (fabio_notificacoes.status = 'processando' and fabio_notificacoes.criado_em < now() - interval '10 minutes')
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', true, 'claimed', false);  -- ja enviado nesse canal, ou outro worker processando agora
  end if;
  return jsonb_build_object('ok', true, 'claimed', true, 'notificacao_id', v_id);
end;
$function$;
