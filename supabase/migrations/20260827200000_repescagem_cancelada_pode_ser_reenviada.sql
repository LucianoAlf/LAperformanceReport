-- Cancelar e DESFAZER, nao gastar o toque.
--
-- A trava `ja_enfileirada` olhava so a EXISTENCIA da linha do toque 2, em
-- qualquer status. Resultado: quem fosse cancelado saia da repescagem para
-- sempre -- o oposto do que cancelar significa. Caso concreto: 4 linhas do 1o
-- lote da Jessy foram canceladas para o teste controlado de 27/08 e ficariam
-- permanentemente inelegiveis; na tela o botao ainda dizia "Reenviada" para
-- elas, o que era falso -- nenhuma mensagem tinha saido.
--
-- Linha viva (`pendente`/`enviando`) ou ja concluida (`enviada`) continua
-- bloqueando: nessas a mensagem esta a caminho ou ja saiu.
--
-- ⚠️ Nao da para simplesmente inserir outra linha: existe `unique (pesquisa_id,
-- toque)`. Entao a linha cancelada/falhada e REATIVADA -- horario novo,
-- template atual, contadores zerados. Assim o historico nao vira lixo e o
-- indice parcial `..._vivo_uidx` (no maximo 1 viva por pesquisa) segue valendo.
--
-- O corpo abaixo e o mesmo aplicado em producao em 27/08 (migration
-- `repescagem_cancelada_pode_ser_reenviada`).

create or replace function public.enfileirar_repescagem_evasao(
  p_pesquisa_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_usuario_id integer;
  v_id uuid;
  v_p record;
  v_motivo text;
  v_cursor timestamptz;
  v_dia date;
  v_no_dia integer;
  v_template record;
  v_publico text;
  v_reaproveitavel uuid;
  v_enfileiradas jsonb := '[]'::jsonb;
  v_recusadas jsonb := '[]'::jsonb;
begin
  if not public.fn_pesquisa_evasao_usuario_interno_ativo() then
    raise exception 'REPESCAGEM_FORBIDDEN: usuario interno ativo obrigatorio'
      using errcode = '42501';
  end if;

  -- Serializa chamadas concorrentes: sem isso, duas operadoras enfileirando ao
  -- mesmo tempo podem ambas contar o teto diario abaixo de 30 antes de
  -- qualquer insert e estourar o limite juntas (padrao de corrida ja visto
  -- neste repo). xact, nao sessao: via PostgREST a conexao volta ao pool com
  -- o lock pendurado.
  perform pg_advisory_xact_lock(hashtext('repescagem_evasao_enfileiramento'));

  select u.id into v_usuario_id
  from public.usuarios u
  where u.auth_user_id = auth.uid()
  limit 1;

  v_cursor := public.proximo_horario_envio_repescagem(now() + interval '45 seconds');

  foreach v_id in array coalesce(p_pesquisa_ids, array[]::uuid[])
  loop
    v_motivo := null;
    v_reaproveitavel := null;

    select p.*, regexp_replace(coalesce(p.telefone_destino_snapshot,''), '\D', '', 'g') as tel_digitos
      into v_p
      from public.pesquisa_evasao p
     where p.id = v_id and p.modo_teste = false;

    if not found then
      v_motivo := 'pesquisa_inexistente';
    elsif v_p.opt_out_em is not null
       or v_p.resposta_status = 'recusada_opt_out' then
      v_motivo := 'opt_out';
    -- Regra pela POSITIVA: a CHECK admite nao_enviado/enviando/falhou, e
    -- nenhum desses pode virar repescagem.
    elsif v_p.envio_status not in ('enviado','entregue','lido') then
      v_motivo := 'primeiro_toque_nao_confirmado';
    elsif v_p.resposta_status <> 'sem_resposta' then
      v_motivo := 'ja_respondeu';
    elsif v_p.enviado_em is null
       or v_p.enviado_em > now() - interval '3 days' then
      v_motivo := 'muito_cedo';
    elsif exists (
      -- So linha VIVA ou ja CONCLUIDA bloqueia.
      select 1 from public.pesquisa_evasao_envios_fila f
       where f.pesquisa_id = v_id and f.toque = 2
         and f.status in ('pendente','enviando','enviada')
    ) then
      v_motivo := 'ja_enfileirada';
    elsif v_p.tel_digitos = '' then
      -- Sem telefone a linha nunca seria entregue: falha silenciosa mais
      -- adiante, na fila, se deixarmos passar.
      v_motivo := 'telefone_ausente';
    end if;

    if v_motivo is not null then
      v_recusadas := v_recusadas || jsonb_build_object('pesquisa_id', v_id, 'motivo', v_motivo);
      continue;
    end if;

    -- O publico do 2o toque e o MESMO do 1o: quem falou continua falando com
    -- quem recebeu. Nao recalcular por idade (duplicaria a regra de
    -- resolverPublicoPesquisa e depende da data de nascimento, que pode
    -- faltar) e nunca deduzir por telefone (o telefone do responsavel tambem
    -- e o do aluno em varios cadastros). Medido em 26/08: 37 de 37 pesquisas
    -- tem template_id.
    -- Linha cancelada/falhada da mesma pesquisa: reaproveitar (o unique de
    -- (pesquisa_id, toque) impede criar uma segunda).
    select f.id into v_reaproveitavel
      from public.pesquisa_evasao_envios_fila f
     where f.pesquisa_id = v_id and f.toque = 2
     limit 1;

    select t.publico into v_publico
      from public.pesquisa_evasao_templates t
     where t.id = v_p.template_id;

    if v_publico is null then
      v_recusadas := v_recusadas || jsonb_build_object('pesquisa_id', v_id, 'motivo', 'publico_indeterminado');
      continue;
    end if;

    select t.id, t.versao into v_template
      from public.pesquisa_evasao_templates t
     where t.chave = 'evasao_repescagem' and t.publico = v_publico and t.ativo
     order by t.versao desc
     limit 1;

    if not found then
      v_recusadas := v_recusadas || jsonb_build_object('pesquisa_id', v_id, 'motivo', 'template_ausente');
      continue;
    end if;

    -- Teto diario: 30 linhas por dia de agenda. Conta TUDO que ocupa aquele
    -- dia -- pendente, enviando E enviada -- e so exclui cancelada. Contar so
    -- pendente/enviando deixava a linha ja enviada sair da conta: enfileirar
    -- 25 de manha, deixar drenar e enfileirar mais 25 a tarde produzia 50
    -- mensagens no mesmo dia pelo mesmo numero, sem uma unica recusa. O teto
    -- existe para proteger o numero, nao a fila.
    loop
      v_dia := (v_cursor at time zone 'America/Sao_Paulo')::date;
      select count(*) into v_no_dia
        from public.pesquisa_evasao_envios_fila f
       where f.status <> 'cancelada'
         and (f.agendada_para at time zone 'America/Sao_Paulo')::date = v_dia;
      exit when v_no_dia < 30;
      v_cursor := public.proximo_horario_envio_repescagem(
        -- Parenteses obrigatorios: AT TIME ZONE liga mais forte que +, e sem
        -- eles o Postgres le `timestamp + (time AT TIME ZONE ...)`, operador que
        -- nao existe (42883). Quebrava o lote inteiro quando o teto estourava.
        (((v_dia + 1)::timestamp + time '09:00') at time zone 'America/Sao_Paulo')
      );
    end loop;

    begin
      if v_reaproveitavel is not null then
        update public.pesquisa_evasao_envios_fila
           set status = 'pendente',
               template_id = v_template.id,
               template_versao = v_template.versao,
               agendada_para = v_cursor,
               enfileirada_por_usuario_id = v_usuario_id,
               enfileirada_em = now(),
               tentativas = 0,
               ultimo_erro = null,
               worker_id = null,
               lease_expires_at = null,
               provider_message_id = null,
               enviada_em = null
         where id = v_reaproveitavel
           and status in ('cancelada','falhou');
        if not found then
          raise exception 'REPESCAGEM_REATIVACAO_PERDEU_A_CORRIDA';
        end if;
      else
        insert into public.pesquisa_evasao_envios_fila (
          pesquisa_id, unidade_id, toque, template_id, template_versao,
          status, agendada_para, enfileirada_por_usuario_id
        ) values (
          v_id, v_p.unidade_id, 2, v_template.id, v_template.versao,
          'pendente', v_cursor, v_usuario_id
        );
      end if;

      v_enfileiradas := v_enfileiradas || jsonb_build_object(
        'pesquisa_id', v_id, 'agendada_para', v_cursor
      );
    exception when others then
      -- Um item ruim (ex.: violar o indice de "vivo" da fila) nao pode
      -- derrubar o lote inteiro; registra o erro real e segue para o proximo.
      v_recusadas := v_recusadas || jsonb_build_object(
        'pesquisa_id', v_id, 'motivo', 'erro_ao_enfileirar', 'erro', sqlerrm
      );
    end;

    -- Intervalo aleatorio entre 90 e 240 segundos.
    v_cursor := public.proximo_horario_envio_repescagem(
      v_cursor + make_interval(secs => 90 + floor(random() * 151)::int)
    );
  end loop;

  return jsonb_build_object(
    'enfileiradas', v_enfileiradas,
    'recusadas', v_recusadas
  );
end;
$function$;

revoke all on function public.proximo_horario_envio_repescagem(timestamptz)
  from public, anon, authenticated;
revoke all on function public.enfileirar_repescagem_evasao(uuid[])
  from public, anon, authenticated;
grant execute on function public.enfileirar_repescagem_evasao(uuid[]) to authenticated, service_role;
grant execute on function public.proximo_horario_envio_repescagem(timestamptz) to service_role;
