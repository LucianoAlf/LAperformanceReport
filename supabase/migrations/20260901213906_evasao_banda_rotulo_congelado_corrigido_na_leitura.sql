-- Terceira e ultima parte da correcao (ver 20260901213401 e 20260901213628).
--
-- Agosto/2026 ja esta FECHADO com o rotulo errado congelado no payload
-- (Arthur Felipe de Mattos, CG, "Minha Banda Para Sempre" -> 'interrompido').
-- Corrigir a captura resolve setembro em diante, mas nao agosto.
--
-- Por que nao recapturar nem retificar:
--   * capturar_relatorios_mensais_canonicos_v1 PULA unidade que ja tem snapshot
--     aprovado/fechado - por desenho, nunca cria versao nova.
--   * gravar_snapshot_fechamento_mensal recusa explicitamente:
--     'Snapshot ja aprovado/fechado ... Use fluxo de retificacao'.
--   * fechamento_mensal_retificacoes NAO e lido por esta funcao (ela le o payload cru) -
--     uma retificacao aqui seria inerte, o mesmo beco das retificacoes financeiras de 01/09.
--
-- Por que corrigir na LEITURA e legitimo aqui:
--   * `tipo_evasao` e campo de APRESENTACAO derivado, e este bloco ja existe justamente para
--     deriva-lo em tempo de leitura, com join nas tabelas vivas e guarda anti-drift.
--   * O numero congelado (churn 7,85% = 30/382) esta CERTO; quem esta errado e o rotulo.
--     Alinhar o rotulo ao numero restaura a coerencia interna do snapshot, nao a reescreve.
--
-- Escopo estreito, de proposito: so sobrescreve rotulo que a propria maquina derivou.
-- A condicao `m.tipo_evasao is null` preserva decisao humana - se alguem digitou o motivo
-- da saida, ele continua vencendo. Medido em todo o historico (mar-ago/2026): 0 evasoes em
-- curso de atividade extra tem tipo_evasao gravado a mao, e 3 registros mudam de rotulo
-- (Arthur/CG: interrompido -> banda, unico que muda numero; Isis e Lis/Recreio, Power Kids:
-- bolsista -> banda, ambos ja fora do churn, Recreio nao muda nenhum numero).
--
-- Os contadores v_evasoes_esperadas / v_evasoes_reconstruidas seguem lendo `e.item` cru,
-- entao a guarda EVASOES_MENSAL_DIVERGENTE nao e afetada.
--
-- Aprovado por Luciano em 01/09/2026.

do $mig$
declare
  v_def text;
  v_ocorr integer;

  c_de constant text :=
$a$               when nullif(trim(coalesce(e.item->>'tipo_evasao', '')), '') is not null then e.item$a$;

  c_para constant text :=
$b$               when m.id is not null
                 and nullif(trim(coalesce(m.tipo_evasao, '')), '') is null
                 and public.is_atividade_extra_curso(coalesce(m.curso_id, a.curso_id))
                 then e.item || jsonb_build_object('tipo_evasao', 'interrompido_banda')
               when nullif(trim(coalesce(e.item->>'tipo_evasao', '')), '') is not null then e.item$b$;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_relatorio_admin_mensal_rico_base_v1';

  if v_def is null then
    raise exception 'ANCORA_AUSENTE: get_relatorio_admin_mensal_rico_base_v1 nao encontrada';
  end if;

  v_ocorr := (length(v_def) - length(replace(v_def, c_de, ''))) / length(c_de);
  if v_ocorr <> 1 then
    raise exception 'ANCORA_ROTULO_CONGELADO: esperado 1, achou %', v_ocorr;
  end if;

  v_def := replace(v_def, c_de, c_para);
  execute v_def;
end
$mig$;
