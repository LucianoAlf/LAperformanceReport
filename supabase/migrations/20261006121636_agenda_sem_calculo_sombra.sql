-- Agenda: parar de calcular a versao canonica em "sombra" so para jogar fora.
--
-- MEDIDO (06/10/2026): as 3 unidades + Consolidado estao em `presenca_rollout_config.modo =
-- 'sombra'` para a superficie 'agenda' desde 27/08 (motivo publicacao_tecnica_inicial_sem_cutover).
-- Nesse modo `get_agenda_dia_v2_sem_cache_20260924` fazia:
--     perform public.get_agenda_dia_canonica_v2(p_data, p_unidade_id);   -- resultado descartado
--     exception when others then null;                                    -- erro engolido
--   e DEPOIS calculava o legado, que e o que a tela usa.
-- O lado canonico e STABLE, nao escreve nada, e nenhuma funcao coleta evidencia dele (a
-- evidencia do cutover e informada a mao em admin_alterar_presenca_rollout_v1). Ou seja: o
-- calculo-sombra nao produzia NADA alem de custo. Mesmo padrao ja corrigido no absenteismo
-- (20260831193000), que derrubou a tela Sucesso do Aluno em 31/08.
--
-- Custo medido (sombra + legado -> so legado), saida IDENTICA (md5) em 12 de 12 comparacoes
-- (Consolidado, CG, Barra, Recreio x ontem, hoje, amanha):
--   Consolidado ontem (frio) 4358 -> 392 ms | CG 1486 -> 232 | Recreio 1597 -> 233
--   Consolidado hoje 436 -> 191 ms          | demais ~2x mais rapido
-- Volume: get_agenda_dia_v2 = 2.206 chamadas em 8 dias, media 628 ms, maximo 13 s.
-- Custo/dia: REDUZ (~metade do tempo de cada chamada da Agenda).
--
-- NAO muda a governanca do rollout: o modo continua 'sombra'; 'canonico_v2' segue exigindo
-- sombra previa + evidencia; virar para canonico_v2 continua chamando o lado canonico.
-- So o ramo 'sombra' deixa de executar o calculo descartado.
--
-- Prova pos-aplicacao (06/10/2026, producao): a saida da funcao e IDENTICA (md5) a
-- `fn_agenda_dia_legado_envelope_v1 || rollout_modo` em 12 de 12 casos (Consolidado, CG,
-- Barra, Recreio x 04/10, 06/10, 08/10), em 40-390 ms. ACL, SECURITY DEFINER, STABLE e
-- search_path preservados (CREATE OR REPLACE a partir da definicao viva).
--
-- Metodo: le a definicao VIVA, troca exatamente 1 bloco (guarda de contagem) e confere.

do $migration$
declare
  v_def text;
  v_bloco constant text := E'  if v_modo = ''sombra'' then\n    begin\n      perform public.get_agenda_dia_canonica_v2(p_data, p_unidade_id);\n    exception when others then\n      null;\n    end;\n  end if;\n';
  v_novo  constant text := E'  -- modo ''sombra'': o calculo canonico era feito so para ser descartado (resultado ignorado,\n  -- erro engolido, nada gravado). Removido em 06/10/2026 -- ver migration agenda_sem_calculo_sombra.\n';
  v_n int;
begin
  v_def := pg_get_functiondef('public.get_agenda_dia_v2_sem_cache_20260924(date,uuid)'::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, v_bloco, ''))) / length(v_bloco);
  if v_n <> 1 then
    raise exception 'AGENDA_SOMBRA: esperava 1 bloco sombra, achou %', v_n;
  end if;
  execute replace(v_def, v_bloco, v_novo);

  v_def := pg_get_functiondef('public.get_agenda_dia_v2_sem_cache_20260924(date,uuid)'::regprocedure);
  if v_def like '%perform public.get_agenda_dia_canonica_v2%' then
    raise exception 'AGENDA_SOMBRA: o perform da sombra continua na funcao';
  end if;
  if v_def not like '%return public.get_agenda_dia_canonica_v2(p_data, p_unidade_id)%' then
    raise exception 'AGENDA_SOMBRA: o ramo canonico_v2 sumiu (nao devia ser tocado)';
  end if;
  if v_def not like '%SECURITY DEFINER%' or v_def not like '%search_path%' then
    raise exception 'AGENDA_SOMBRA: perdeu SECURITY DEFINER ou search_path';
  end if;
end
$migration$;
