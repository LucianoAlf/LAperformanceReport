-- O botao "Ir para a conversa" caia na lista da Caixa sem selecionar nada. O deep-link casa por
-- `admin_conversas.aluno_id`, mas a conversa criada pela pesquisa de evasao nasce com
-- **aluno_id NULL** — so com o telefone (`whatsapp_jid`), sem nem `nome_externo`. Medido: das 25
-- da fila, apenas 5 tinham conversa com `aluno_id`; as outras 20 existiam so pelo numero.
--
-- (A verificacao feita antes provava que a CONVERSA existe — casando por telefone — e nao que o
-- deep-link a acharia, que casa por aluno_id. Eram perguntas diferentes.)
--
-- Expor o telefone deixa o front casar pelos dois caminhos: aluno_id primeiro, telefone como rede.
-- Nao depende de arrumar o vinculo das conversas antigas nem de mudar a edge de envio.
--
-- Mesmas cautelas da migration anterior: DROP + CREATE (muda o RETURNS TABLE), as duas assinaturas
-- precisam casar coluna a coluna (`listar_...` faz `select count(*) over (), estado.*`), e recriar
-- funcao reabre execute para `anon` neste projeto — dai o revoke/grant no fim.

drop function if exists public.listar_followups_pesquisa_evasao_v1(uuid, integer, integer, text, integer, integer, text);
drop function if exists public.fn_pesquisa_evasao_followup_estado(timestamp with time zone);

create function public.fn_pesquisa_evasao_followup_estado(p_agora timestamp with time zone default clock_timestamp())
returns table(pesquisa_id uuid, evasao_id integer, aluno_id integer, aluno_nome text, telefone_destino text, unidade_id uuid, unidade_nome text, enviado_em timestamp with time zone, vencido_em timestamp with time zone, operador_usuario_id integer, operador_nome text, estado_visivel text, followup_pendente boolean, interagiu_sem_resposta_valida boolean, alerta_enviado_em timestamp with time zone, acao text, acao_canal text, acao_observacao text, acao_registrada_em timestamp with time zone, acao_operador_nome text)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
with base as (
  select
    pe.id as pesquisa_id,
    pe.evasao_id,
    mov.aluno_id,
    coalesce(nullif(btrim(mov.aluno_nome), ''), pe.aluno_nome)::text as aluno_nome,
    nullif(btrim(pe.telefone_destino_snapshot), '')::text as telefone_destino,
    pe.unidade_id,
    unidade.nome::text as unidade_nome,
    pe.enviado_em,
    pe.enviado_em + interval '72 hours' as vencido_em,
    pe.executado_por_usuario_id as operador_usuario_id,
    operador.nome::text as operador_nome,
    pe.modo_teste,
    pe.envio_status::text,
    pe.resposta_status::text,
    pe.resposta_valida,
    pe.opt_out_em,
    pe.conteudo_novo_desde_revisao,
    acao.acao,
    acao.canal as acao_canal,
    acao.observacao as acao_observacao,
    acao.registrado_em as acao_registrada_em,
    acao_operador.nome::text as acao_operador_nome,
    exists (
      select 1
      from public.pesquisa_evasao_mensagens mensagem
      where mensagem.pesquisa_id = pe.id
        and mensagem.direcao = 'entrada'
        and mensagem.resolution_status = 'resolvida'
        and mensagem.substantividade in ('abertura', 'adiamento', 'indeterminado')
    ) as interagiu_sem_resposta_valida,
    (
      select max(alerta.enviado_em)
      from public.lia_followup_resumo_itens item
      join public.lia_alertas_privados alerta
        on alerta.followup_resumo_id = item.resumo_id
       and alerta.status = 'enviado'
      where item.pesquisa_id = pe.id
        and item.ambiente = 'producao'
        and item.cancelado_em is null
    ) as alerta_enviado_em
  from public.pesquisa_evasao pe
  left join public.movimentacoes_admin mov on mov.id = pe.evasao_id
  join public.unidades unidade on unidade.id = pe.unidade_id
  left join public.usuarios operador on operador.id = pe.executado_por_usuario_id
  left join public.pesquisa_evasao_followup_acoes acao
    on acao.pesquisa_id = pe.id
  left join public.usuarios acao_operador
    on acao_operador.id = acao.operador_usuario_id
  where pe.modo_teste = false
    and pe.envio_status in ('enviado', 'entregue', 'lido')
    and pe.enviado_em is not null
    and (
      auth.role() = 'service_role'
      or public.fn_pesquisa_evasao_usuario_interno_ativo()
    )
), classificada as (
  select
    base.*,
    (
      envio_status in ('enviado', 'entregue', 'lido')
      and enviado_em is not null
      and resposta_valida = false
      and opt_out_em is null
      and resposta_status <> 'recusada_opt_out'
      and acao is null
      and p_agora >= vencido_em
    ) as esta_pendente
  from base
)
select
  classificada.pesquisa_id,
  classificada.evasao_id,
  classificada.aluno_id,
  classificada.aluno_nome,
  classificada.telefone_destino,
  classificada.unidade_id,
  classificada.unidade_nome,
  classificada.enviado_em,
  classificada.vencido_em,
  classificada.operador_usuario_id,
  classificada.operador_nome,
  case
    when opt_out_em is not null or resposta_status = 'recusada_opt_out'
      then 'opt_out'
    when conteudo_novo_desde_revisao
      and resposta_status in ('coletando', 'pronta_para_revisao', 'em_revisao')
      then 'nova_rodada'
    when resposta_status = 'coletando' then 'respondendo'
    when resposta_status in ('pronta_para_revisao', 'em_revisao', 'revisada')
      then resposta_status
    when acao = 'realizado' then 'followup_realizado'
    when acao = 'dispensado' then 'followup_dispensado'
    when esta_pendente and alerta_enviado_em is not null then 'followup_avisado'
    when esta_pendente then 'followup_pendente'
    else 'aguardando_resposta'
  end::text as estado_visivel,
  esta_pendente as followup_pendente,
  interagiu_sem_resposta_valida,
  alerta_enviado_em,
  acao,
  acao_canal,
  acao_observacao,
  acao_registrada_em,
  acao_operador_nome
from classificada;
$function$;

create function public.listar_followups_pesquisa_evasao_v1(p_unidade_id uuid default null::uuid, p_limite integer default 50, p_offset integer default 0, p_estado text default 'todos'::text, p_ano integer default null::integer, p_mes integer default null::integer, p_busca text default null::text)
returns table(total_count bigint, pesquisa_id uuid, evasao_id integer, aluno_id integer, aluno_nome text, telefone_destino text, unidade_id uuid, unidade_nome text, enviado_em timestamp with time zone, vencido_em timestamp with time zone, operador_usuario_id integer, operador_nome text, estado_visivel text, followup_pendente boolean, interagiu_sem_resposta_valida boolean, alerta_enviado_em timestamp with time zone, acao text, acao_canal text, acao_observacao text, acao_registrada_em timestamp with time zone, acao_operador_nome text)
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not public.fn_pesquisa_evasao_usuario_interno_ativo() then
    raise exception 'usuario_interno_ativo_required';
  end if;

  if coalesce(p_estado, 'todos') not in (
    'todos', 'followup_pendente', 'followup_avisado',
    'followup_realizado', 'followup_dispensado', 'aguardando_resposta'
  ) then
    raise exception 'estado_followup_invalido';
  end if;

  return query
  select
    count(*) over ()::bigint,
    estado.*
  from public.fn_pesquisa_evasao_followup_estado(clock_timestamp()) estado
  where (p_unidade_id is null or estado.unidade_id = p_unidade_id)
    and (p_ano is null or extract(year from estado.enviado_em)::integer = p_ano)
    and (p_mes is null or extract(month from estado.enviado_em)::integer = p_mes)
    and (
      nullif(btrim(p_busca), '') is null
      or estado.aluno_nome ilike ('%' || btrim(p_busca) || '%')
      or estado.unidade_nome ilike ('%' || btrim(p_busca) || '%')
      or coalesce(estado.operador_nome, '') ilike ('%' || btrim(p_busca) || '%')
    )
    and (
      coalesce(p_estado, 'todos') = 'todos'
      or (p_estado = 'followup_pendente' and estado.followup_pendente)
      or estado.estado_visivel = p_estado
    )
  order by
    estado.followup_pendente desc,
    estado.vencido_em,
    estado.pesquisa_id
  limit least(greatest(coalesce(p_limite, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$function$;

revoke execute on function public.fn_pesquisa_evasao_followup_estado(timestamp with time zone) from public, anon;
revoke execute on function public.listar_followups_pesquisa_evasao_v1(uuid, integer, integer, text, integer, integer, text) from public, anon;

grant execute on function public.fn_pesquisa_evasao_followup_estado(timestamp with time zone) to authenticated, service_role;
grant execute on function public.listar_followups_pesquisa_evasao_v1(uuid, integer, integer, text, integer, integer, text) to authenticated, service_role;
