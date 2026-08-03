-- Direciona os alertas privados da Lia para Pesquisas > Evasao.
-- Nao ativa producao e nao agenda processamento. Atualiza somente entregas
-- ainda nao enviadas, para que a fila retida da Jessica use o destino correto.

create or replace function public.fn_lia_renderizar_alerta_pesquisa(
  p_tipo text,
  p_aluno_nome text,
  p_unidade_nome text
)
returns table (
  template_codigo text,
  template_versao integer,
  mensagem_renderizada text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_base_url text;
  v_link text;
begin
  select rtrim(config.app_base_url, '/')
  into v_base_url
  from public.lia_alertas_configuracao config
  where config.id = 1;

  if v_base_url is null then
    raise exception 'configuracao_lia_ausente';
  end if;

  v_link := v_base_url || '/app/sucesso-aluno?destino=pesquisas-evasao';
  template_versao := 2;

  case p_tipo
    when 'resposta_nova' then
      template_codigo := 'lia_evasao_resposta_nova';
      mensagem_renderizada := format(
        U&'\+01F514 *Resposta recebida \2014 Pesquisa de evas\00E3o*'
          || E'\n\nAluno: %s\nUnidade: %s\n\n'
          || U&'A fam\00EDlia respondeu \00E0 pesquisa que voc\00EA enviou. O conte\00FAdo permanece protegido no LA Report.'
          || E'\n\n'
          || U&'\+01F449 %s',
        p_aluno_nome,
        p_unidade_nome,
        v_link
      );
    when 'rodada_nova_pos_revisao' then
      template_codigo := 'lia_evasao_rodada_nova_pos_revisao';
      mensagem_renderizada := format(
        U&'\+01F514 *Nova rodada ap\00F3s revis\00E3o*'
          || E'\n\nAluno: %s\nUnidade: %s\n\n'
          || U&'A fam\00EDlia enviou novo conte\00FAdo depois da revis\00E3o. O caso voltou para a fila e precisa de uma nova leitura.'
          || E'\n\n'
          || U&'\+01F449 %s',
        p_aluno_nome,
        p_unidade_nome,
        v_link
      );
    when 'opt_out' then
      template_codigo := 'lia_evasao_opt_out';
      mensagem_renderizada := format(
        U&'\+01F515 *Fam\00EDlia recusou novos contatos \2014 Pesquisa de evas\00E3o*'
          || E'\n\nAluno: %s\nUnidade: %s\n\n'
          || U&'A fam\00EDlia pediu para n\00E3o receber novas mensagens desta pesquisa. O caso foi bloqueado para follow-up.'
          || E'\n\n'
          || U&'\+01F449 %s',
        p_aluno_nome,
        p_unidade_nome,
        v_link
      );
    else
      raise exception 'tipo_alerta_lia_invalido';
  end case;

  return next;
end;
$function$;

comment on function public.fn_lia_renderizar_alerta_pesquisa(text, text, text) is
  'Renderiza alertas privados sem conteudo da resposta e abre Pesquisas > Evasao; fonte ASCII-safe para preservar Unicode.';

update public.lia_alertas_privados
set mensagem_renderizada = replace(
      mensagem_renderizada,
      '/app/sucesso-aluno',
      '/app/sucesso-aluno?destino=pesquisas-evasao'
    ),
    template_versao = 2,
    atualizado_em = now()
where status in ('aguardando_liberacao', 'pendente')
  and provider_message_id is null
  and mensagem_renderizada like '%/app/sucesso-aluno%'
  and mensagem_renderizada not like '%destino=pesquisas-evasao%';
