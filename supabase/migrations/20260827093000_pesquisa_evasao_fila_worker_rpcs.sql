-- RPCs do worker da fila de repescagem: claim atomico, conclusao, falha e
-- cancelamento. Toda escrita passa por aqui; nada de UPDATE direto na tabela
-- fora destas funcoes.

create or replace function public.claim_repescagem_evasao_job(
  p_worker_id uuid,
  p_lease_seconds integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_job public.pesquisa_evasao_envios_fila%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'REPESCAGEM_FORBIDDEN: service_role obrigatoria' using errcode = '42501';
  end if;
  if p_worker_id is null then
    raise exception 'REPESCAGEM_WORKER_INVALIDO';
  end if;

  -- Lease vencido NAO volta para pendente. Diferente da fila financeira, aqui o
  -- efeito colateral de repetir e uma mensagem duplicada para um ex-aluno.
  -- Entre mandar duas vezes e nao mandar, o sistema nao manda.
  update public.pesquisa_evasao_envios_fila
     set status = 'falhou',
         ultimo_erro = 'LEASE_EXPIRADO: enviou sem confirmacao',
         worker_id = null,
         lease_expires_at = null
   where status = 'enviando'
     and lease_expires_at <= now();

  update public.pesquisa_evasao_envios_fila f
     set status = 'enviando',
         worker_id = p_worker_id,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         tentativas = f.tentativas + 1
   where f.id = (
     select c.id
       from public.pesquisa_evasao_envios_fila c
      where c.status = 'pendente'
        and c.agendada_para <= now()
        -- Item 4 do review final: o claim so exigia agendada_para <= now(),
        -- sem impor espacamento entre envios. Com o cron nascendo desligado
        -- (por desenho), quem enfileira um lote e liga o cron depois faz
        -- todas as linhas vencidas saírem em poucos minutos -- a rajada que a
        -- feature existe para evitar. Nenhuma outra linha pode ter sido
        -- enviada nos ultimos 60 segundos OU estar sendo enviada com lease
        -- ainda valido.
        and not exists (
          select 1 from public.pesquisa_evasao_envios_fila r
           where (
                   (r.status = 'enviada' and r.enviada_em > now() - interval '60 seconds')
                   or (r.status = 'enviando' and r.lease_expires_at > now())
                 )
        )
      order by c.agendada_para
      for update skip locked
      limit 1
   )
  returning f.* into v_job;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_job.id,
    'pesquisa_id', v_job.pesquisa_id,
    'toque', v_job.toque,
    'template_id', v_job.template_id,
    'template_versao', v_job.template_versao
  );
end;
$function$;

create or replace function public.concluir_repescagem_evasao_job(
  p_id uuid,
  p_worker_id uuid,
  p_provider_message_id text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'REPESCAGEM_FORBIDDEN: service_role obrigatoria' using errcode = '42501';
  end if;

  update public.pesquisa_evasao_envios_fila
     set status = 'enviada',
         provider_message_id = nullif(btrim(coalesce(p_provider_message_id, '')), ''),
         enviada_em = now(),
         worker_id = null,
         lease_expires_at = null
   where id = p_id and worker_id = p_worker_id and status = 'enviando';

  if not found then
    raise exception 'REPESCAGEM_CONCLUSAO_INVALIDA: job nao esta com este worker';
  end if;
end;
$function$;

create or replace function public.falhar_repescagem_evasao_job(
  p_id uuid,
  p_worker_id uuid,
  p_erro text,
  p_terminal boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'REPESCAGEM_FORBIDDEN: service_role obrigatoria' using errcode = '42501';
  end if;

  -- Guard de posse vive no proprio UPDATE (nao num SELECT antes): entre ler e
  -- escrever a linha pode ter mudado de dono/estado (ex.: a limpeza de lease
  -- do claim acabou de fechar como 'falhou'), e um UPDATE so por id reviveria
  -- essa linha para 'pendente' com base em variaveis ja obsoletas.
  update public.pesquisa_evasao_envios_fila f
     set status = case
           when p_terminal or f.tentativas >= f.max_tentativas then 'falhou'
           else 'pendente'
         end,
         -- backoff simples: 5 min por tentativa ja feita
         agendada_para = case
           when p_terminal or f.tentativas >= f.max_tentativas then f.agendada_para
           else public.proximo_horario_envio_repescagem(
                  now() + make_interval(mins => 5 * f.tentativas))
         end,
         ultimo_erro = left(coalesce(p_erro, 'erro desconhecido'), 500),
         worker_id = null,
         lease_expires_at = null
   where f.id = p_id
     and f.worker_id = p_worker_id
     and f.status = 'enviando';

  if not found then
    raise exception 'REPESCAGEM_FALHA_INVALIDA: job nao esta com este worker';
  end if;
end;
$function$;

create or replace function public.cancelar_repescagem_evasao(
  p_pesquisa_id uuid,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if not public.fn_pesquisa_evasao_usuario_interno_ativo() then
    raise exception 'REPESCAGEM_FORBIDDEN: usuario interno ativo obrigatorio'
      using errcode = '42501';
  end if;

  update public.pesquisa_evasao_envios_fila
     set status = 'cancelada',
         ultimo_erro = nullif(btrim(coalesce(p_motivo, '')), '')
   where pesquisa_id = p_pesquisa_id
     and toque = 2
     and status = 'pendente';

  if not found then
    raise exception 'REPESCAGEM_CANCELAMENTO_INVALIDO: so linha pendente pode ser cancelada';
  end if;
end;
$function$;

-- Item 2 do review final: a guarda de telefone compartilhado (dois irmaos no
-- mesmo numero, um responde e o outro nao) so era checada por
-- `enfileirar_repescagem_evasao` NA ENTRADA da fila. Entre enfileirar e
-- disparar pode passar horas -- a mae pode ter respondido nesse meio tempo --
-- e o worker nao revalidava isso antes de mandar o 2o toque. Mesma comparacao
-- da RPC de enfileiramento (8 ultimos digitos), agora tambem no disparo.
create or replace function public.existe_telefone_compartilhado_respondido(
  p_pesquisa_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_tel_digitos text;
  v_existe boolean;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'REPESCAGEM_FORBIDDEN: service_role obrigatoria' using errcode = '42501';
  end if;

  select regexp_replace(coalesce(p.telefone_destino_snapshot, ''), '\D', '', 'g')
    into v_tel_digitos
    from public.pesquisa_evasao p
   where p.id = p_pesquisa_id;

  if v_tel_digitos is null or v_tel_digitos = '' then
    return false;
  end if;

  select exists (
    select 1
      from public.pesquisa_evasao outra
     where outra.id <> p_pesquisa_id
       and outra.modo_teste = false
       and right(regexp_replace(coalesce(outra.telefone_destino_snapshot, ''), '\D', '', 'g'), 8)
           = right(v_tel_digitos, 8)
       and outra.resposta_status <> 'sem_resposta'
  ) into v_existe;

  return coalesce(v_existe, false);
end;
$function$;

revoke all on function public.claim_repescagem_evasao_job(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.concluir_repescagem_evasao_job(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.falhar_repescagem_evasao_job(uuid, uuid, text, boolean)
  from public, anon, authenticated;
revoke all on function public.cancelar_repescagem_evasao(uuid, text)
  from public, anon, authenticated;
revoke all on function public.existe_telefone_compartilhado_respondido(uuid)
  from public, anon, authenticated;

grant execute on function public.claim_repescagem_evasao_job(uuid, integer) to service_role;
grant execute on function public.concluir_repescagem_evasao_job(uuid, uuid, text) to service_role;
grant execute on function public.falhar_repescagem_evasao_job(uuid, uuid, text, boolean) to service_role;
grant execute on function public.cancelar_repescagem_evasao(uuid, text) to authenticated, service_role;
grant execute on function public.existe_telefone_compartilhado_respondido(uuid) to service_role;
