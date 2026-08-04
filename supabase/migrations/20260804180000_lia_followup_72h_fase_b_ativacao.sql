-- Lia Fase B: libera somente o produtor do follow-up de 72 horas.
--
-- Nao cria cron, nao enfileira resumo e nao altera pesquisas existentes.
-- O cron e o dispatcher da Fase A ja publicados passam a chamar o produtor,
-- que permanece responsavel pela elegibilidade e pela janela diaria das 09h BRT.

do $block$
declare
  v_linhas_atualizadas integer;
begin
  update public.lia_alertas_configuracao
  set followup_72h_liberado = true,
      atualizado_em = clock_timestamp()
  where id = 1
    and alertas_producao_liberados = true
    and followup_72h_liberado = false;

  get diagnostics v_linhas_atualizadas = row_count;

  if v_linhas_atualizadas <> 1 then
    raise exception 'estado_invalido_para_ativar_followup_72h';
  end if;
end;
$block$;
