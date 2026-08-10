-- get_relatorio_admin_mensal_rico_v1 ja sobrepunha a retificacao do gerencial
-- para financeiro/inadimplencia. Estende o MESMO padrao para renovacoes:
--
--   1. payload.renovacoes (lista) e payload.resumo.renovacoes_realizadas ->
--      sobrepostos pela retificacao do snapshot relatorio_admin_mensal (nova
--      funcao aplicar_retificacao_relatorio_admin_mensal_renovacoes_v1).
--   2. payload.indicadores_retencao.{renovacoes_previstas,renovacoes_realizadas,
--      taxa_renovacao,taxa_nao_renovacao} -> sobrepostos a partir de
--      v_gerencial_payload#>'{kpis_retencao,0}' (ja e o payload RETIFICADO,
--      reaproveitando a variavel que a inadimplencia ja usa).
--
-- Antes disso, indicadores_retencao.renovacoes_previstas/taxa_renovacao vinham
-- de dentro de get_relatorio_admin_mensal_rico_base_v1, que le v_gerencial.payload
-- CRU (sem overlay nenhum) -- por isso a correcao da funcao de retificacao nao
-- bastava sozinha, precisava deste segundo ponto de leitura.
--
-- Feito por replace com guarda sobre pg_get_functiondef, nao por transcricao:
-- a funcao tem 9 checagens de invariante e uma transcricao erraria alguma.
--
-- Validado apos as retificacoes de Recreio/jul-2026: lista de renovacoes 23->19,
-- resumo.renovacoes_realizadas 23->19, indicadores_retencao.renovacoes_previstas
-- 27->21, renovacoes_realizadas 23->19, taxa_renovacao 85.19->90.48. Financeiro
-- e inadimplencia (retificacao ja existente) confirmados byte a byte identicos
-- antes e depois. Barra e Campo Grande (sem retificacao) seguem respondendo sem
-- excecao, com os numeros antigos intactos.

do $$
declare
  v_def text;
  v_novo text;
  v_ancora_1 text;
  v_insercao_1 text;
  v_ancora_2 text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_relatorio_admin_mensal_rico_v1'
  limit 1;

  if v_def is null then
    raise exception 'FUNCAO_NAO_ENCONTRADA: get_relatorio_admin_mensal_rico_v1';
  end if;

  -- (1) declara as variaveis novas, logo apos a ultima declarada.
  v_ancora_1 := '  v_metas_fideliza jsonb;
begin';
  if position(v_ancora_1 in v_def) = 0 then
    raise exception 'ANCORA_1_AUSENTE';
  end if;
  v_insercao_1 := '  v_metas_fideliza jsonb;
  v_admin_retificacao public.fechamento_mensal_retificacoes%rowtype;
  v_retencao_gerencial jsonb;
begin';
  v_novo := replace(v_def, v_ancora_1, v_insercao_1);
  if v_novo = v_def then raise exception 'REPLACE_1_SEM_EFEITO'; end if;

  -- (2) logo apos montar v_resultado, sobrepoe a retificacao do proprio
  -- snapshot relatorio_admin_mensal (renovacoes + resumo.renovacoes_realizadas).
  v_ancora_2 := '  v_resultado := public.get_relatorio_admin_mensal_rico_base_v3(p_unidade_id, p_ano, p_mes);

  v_gerencial_id';
  if position(v_ancora_2 in v_novo) = 0 then
    raise exception 'ANCORA_2_AUSENTE';
  end if;
  v_novo := replace(v_novo, v_ancora_2,
'  v_resultado := public.get_relatorio_admin_mensal_rico_base_v3(p_unidade_id, p_ano, p_mes);

  -- Sobreposicao da retificacao de renovacoes sobre O PROPRIO snapshot
  -- relatorio_admin_mensal (nao o gerencial). Mesma logica de dois hashes.
  select * into v_admin_retificacao
  from public.fechamento_mensal_retificacoes r
  where r.snapshot_id = nullif(v_resultado->>''snapshot_id'', '''')::uuid
    and r.base_payload_hash = nullif(v_resultado->>''payload_hash'', '''')
  order by r.created_at desc
  limit 1;

  if v_admin_retificacao.id is not null then
    if public.hash_jsonb_canonico(v_admin_retificacao.payload_corrigido) <> v_admin_retificacao.payload_corrigido_hash then
      raise exception ''RELATORIO_ADMIN_MENSAL_RETIFICACAO_CORROMPIDA'';
    end if;
    v_resultado := jsonb_set(
      v_resultado, ''{payload,renovacoes}'',
      coalesce(v_admin_retificacao.payload_corrigido#>''{renovacoes}'', v_resultado#>''{payload,renovacoes}''),
      true
    );
    v_resultado := jsonb_set(
      v_resultado, ''{payload,resumo,renovacoes_realizadas}'',
      coalesce(v_admin_retificacao.payload_corrigido#>''{resumo,renovacoes_realizadas}'', v_resultado#>''{payload,resumo,renovacoes_realizadas}''),
      true
    );
  end if;

  v_gerencial_id');
  if v_novo = v_def then raise exception 'REPLACE_2_SEM_EFEITO'; end if;

  -- (3) apos a inadimplencia, sobrepoe os 4 agregados de renovacao a partir do
  -- gerencial (v_gerencial_payload ja e o retificado, reusa a mesma variavel).
  if position('  select * into v_fideliza from public.programa_fideliza_config c where c.ano = p_ano;' in v_novo) = 0 then
    raise exception 'ANCORA_3_AUSENTE';
  end if;
  v_novo := replace(v_novo,
'  select * into v_fideliza from public.programa_fideliza_config c where c.ano = p_ano;',
'  -- Renovacoes (previstas/realizadas/taxa) tambem vem do gerencial
  -- (possivelmente retificado) -- mesmo padrao da inadimplencia acima.
  v_retencao_gerencial := case jsonb_typeof(v_gerencial_payload->''kpis_retencao'')
    when ''array'' then coalesce(v_gerencial_payload->''kpis_retencao''->0, ''{}''::jsonb)
    else ''{}''::jsonb
  end;
  if v_retencao_gerencial ? ''renovacoes_previstas'' then
    v_resultado := jsonb_set(v_resultado, ''{payload,indicadores_retencao,renovacoes_previstas}'', v_retencao_gerencial->''renovacoes_previstas'', true);
  end if;
  if v_retencao_gerencial ? ''renovacoes_realizadas'' then
    v_resultado := jsonb_set(v_resultado, ''{payload,indicadores_retencao,renovacoes_realizadas}'', v_retencao_gerencial->''renovacoes_realizadas'', true);
  end if;
  if v_retencao_gerencial ? ''taxa_renovacao'' then
    v_resultado := jsonb_set(v_resultado, ''{payload,indicadores_retencao,taxa_renovacao}'', v_retencao_gerencial->''taxa_renovacao'', true);
  end if;
  if v_retencao_gerencial ? ''taxa_nao_renovacao'' then
    v_resultado := jsonb_set(v_resultado, ''{payload,indicadores_retencao,taxa_nao_renovacao}'', v_retencao_gerencial->''taxa_nao_renovacao'', true);
  end if;

  select * into v_fideliza from public.programa_fideliza_config c where c.ano = p_ano;');
  if v_novo = v_def then raise exception 'REPLACE_3_SEM_EFEITO'; end if;

  execute v_novo;
end $$;
