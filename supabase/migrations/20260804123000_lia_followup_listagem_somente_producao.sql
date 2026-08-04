-- Corrige o read model do painel de follow-up para nunca expor pesquisas de
-- teste. A migration estrutural original excluia modo_teste apenas do calculo
-- de pendencia; por isso o filtro "todos" ainda listava os registros de teste.
--
-- Mudanca somente de definicao: nenhuma linha de pesquisa_evasao e alterada.

create or replace function public.fn_pesquisa_evasao_followup_estado(
  p_agora timestamptz default clock_timestamp()
)
returns table (
  pesquisa_id uuid,
  evasao_id integer,
  aluno_nome text,
  unidade_id uuid,
  unidade_nome text,
  enviado_em timestamptz,
  vencido_em timestamptz,
  operador_usuario_id integer,
  operador_nome text,
  estado_visivel text,
  followup_pendente boolean,
  interagiu_sem_resposta_valida boolean,
  alerta_enviado_em timestamptz,
  acao text,
  acao_canal text,
  acao_observacao text,
  acao_registrada_em timestamptz,
  acao_operador_nome text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
with base as (
  select
    pe.id as pesquisa_id,
    pe.evasao_id,
    coalesce(nullif(btrim(mov.aluno_nome), ''), pe.aluno_nome)::text as aluno_nome,
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
  classificada.aluno_nome,
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

revoke all on function public.fn_pesquisa_evasao_followup_estado(timestamptz)
  from public, anon;
grant execute on function public.fn_pesquisa_evasao_followup_estado(timestamptz)
  to authenticated, service_role;

comment on function public.fn_pesquisa_evasao_followup_estado(timestamptz) is
  'Read model produtivo da fila de follow-up de evasao; exclui modo_teste antes de classificar ou listar qualquer estado.';
