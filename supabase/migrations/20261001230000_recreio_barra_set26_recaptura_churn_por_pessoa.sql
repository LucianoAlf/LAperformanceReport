-- supabase/migrations/20261001230000_recreio_barra_set26_recaptura_churn_por_pessoa.sql
--
-- Regrava setembro/2026 de Recreio e Barra como NOVA versao de snapshot, ja com o churn por
-- pessoa (20261001220000). Pedido do Hugo em 01/10/2026 ("conserta so recreio e barra";
-- Campo Grande fica para depois: as 11 saidas interrompidas em 01/10 tem ultima aula em
-- setembro no Emusys e a data precisa ser decidida antes).
--
-- Cadastro do Recreio corrigido junto (conferido no Emusys):
--   * Davi Zeemann (aluno 2552, Emusys 1595): data_matricula 30/09 (o webhook chegou 01/10);
--   * Isabela (aluno 2522, Emusys 1587): bolsista integral (tipo 3, valor 0).
-- Guardas (= simulacao com rollback de 01/10): senao a migration inteira volta.
--   Recreio: churn 2,63 | MRR perdido 4586,40 | previstas 12 | taxa 100 | novos 21 | bolsistas 7+4
--   Barra:   churn 4,49 | MRR perdido 5236,00 | previstas 14 | ativos 271 | pagantes 267

update public.alunos set data_matricula = '2026-09-30'
where id = 2552 and emusys_matricula_id = '1595' and data_matricula = '2026-10-01';

update public.alunos set tipo_matricula_id = 3, valor_parcela = 0
where id = 2522 and emusys_matricula_id = '1587';

do $$
declare
  v_rec uuid := '95553e96-971b-4590-a6eb-0201d013c14d';
  v_bar uuid := '368d47f5-2d88-4475-bc14-ba084a9a348e';
  v_obs text := 'Recaptura set/26: churn por pessoa que saiu da escola (20261001220000); migration 20261001230000';
  v_u uuid; v_prev jsonb; v_un jsonb; v_dom text; v_key text; v_fonte text; v_payload jsonb; v_ver int; v_id uuid;
  v_bloco jsonb; v_n int; v_p jsonb;
begin
  if (select data_matricula from public.alunos where id = 2552) <> '2026-09-30'
     or (select tipo_matricula_id from public.alunos where id = 2522) <> 3 then
    raise exception 'cadastro do Recreio nao ficou como esperado';
  end if;

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('app.fechamento_competencia_viva', '2026-9', true);

  update public.competencias_mensais set status = 'aberto'
  where unidade_id in (v_rec, v_bar) and ano = 2026 and mes = 9 and status = 'fechado';
  get diagnostics v_n = row_count;
  if v_n <> 2 then raise exception 'esperava reabrir 2 competencias, reabriu %', v_n; end if;

  v_prev := public.preview_fechamento_mensal(2026, 9, null, true);

  foreach v_u in array array[v_rec, v_bar] loop
    select value into v_un from jsonb_array_elements(v_prev->'unidades') where value->>'unidade_id' = v_u::text;
    if v_un is null then raise exception 'preview sem a unidade %', v_u; end if;
    if jsonb_array_length(coalesce(v_un->'bloqueios', '[]')) > 0 then
      raise exception 'preview da unidade % bloqueado: %', v_u, v_un->'bloqueios';
    end if;

    for v_dom, v_key, v_fonte in select * from (values
        ('alunos_admin', 'admin_operacional', 'get_kpis_alunos_admin_operacional'),
        ('alunos_executivo', 'alunos_canonicos', 'get_kpis_alunos_canonicos'),
        ('comercial', 'comercial_canonico', 'get_kpis_comercial_canonicos_v2'),
        ('relatorio_gerencial', 'relatorio_gerencial', 'get_dados_relatorio_gerencial'),
        ('relatorio_coordenacao', 'relatorio_coordenacao', 'get_dados_relatorio_coordenacao'),
        ('programa_matriculador', 'programa_matriculador', 'get_programa_matriculador_dados'),
        ('programa_fideliza', 'programa_fideliza', 'get_programa_fideliza_dados')) t(a, b, c)
    loop
      v_payload := v_un->'fontes'->v_key;
      if v_payload is null or v_payload = 'null'::jsonb or v_payload ? 'erro' then
        raise exception 'payload % invalido na unidade %', v_dom, v_u;
      end if;
      select coalesce(max(versao), 0) + 1 into v_ver from public.fechamento_mensal_snapshots
        where ano = 2026 and mes = 9 and escopo = 'unidade' and unidade_id = v_u and dominio = v_dom;
      insert into public.fechamento_mensal_snapshots
        (ano, mes, escopo, unidade_id, dominio, versao, status, fonte, payload, payload_hash,
         financeiro_realizado_disponivel, observacao, aprovado_em)
      values (2026, 9, 'unidade', v_u, v_dom, v_ver, 'aprovado', v_fonte, v_payload,
              public.hash_jsonb_canonico(v_payload), false, v_obs, now())
      returning id into v_id;
      insert into public.fechamento_mensal_auditoria (snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes)
      values (v_id, 2026, 9, 'unidade', v_u, 'snapshot_gravado',
              jsonb_build_object('dominio', v_dom, 'fonte', v_fonte, 'versao', v_ver, 'origem', '20261001230000'));
    end loop;

    v_bloco := public.garantir_bloco_financeiro_gerencial_v1(2026, 9, v_u);
    if coalesce((v_bloco->>'ok')::boolean, false) is not true then
      raise exception 'bloco financeiro da unidade %: %', v_u, v_bloco;
    end if;

    for v_dom, v_fonte, v_payload in select * from (values
        ('relatorio_admin_mensal', 'montar_relatorio_admin_mensal_payload_v1', public.montar_relatorio_admin_mensal_payload_v1(v_u, 2026, 9)),
        ('relatorio_comercial_mensal', 'montar_relatorio_comercial_mensal_payload_v1', public.montar_relatorio_comercial_mensal_payload_v1(v_u, 2026, 9))) t(a, b, c)
    loop
      select coalesce(max(versao), 0) + 1 into v_ver from public.fechamento_mensal_snapshots
        where ano = 2026 and mes = 9 and escopo = 'unidade' and unidade_id = v_u and dominio = v_dom;
      insert into public.fechamento_mensal_snapshots
        (ano, mes, escopo, unidade_id, dominio, versao, status, fonte, payload, payload_hash, observacao, aprovado_em)
      values (2026, 9, 'unidade', v_u, v_dom, v_ver, 'aprovado', v_fonte, v_payload,
              public.hash_jsonb_canonico(v_payload), v_obs, now())
      returning id into v_id;
      insert into public.fechamento_mensal_auditoria (snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes)
      values (v_id, 2026, 9, 'unidade', v_u, 'snapshot_gravado',
              jsonb_build_object('dominio', v_dom, 'fonte', v_fonte, 'versao', v_ver, 'origem', '20261001230000'));
    end loop;

    perform public.fechar_competencia_mensal_canonica_v2(2026, 9, v_obs, v_u, null);
    perform public.atualizar_dados_mensais_por_snapshot(2026, 9, v_u, false);

    if (select status from public.competencias_mensais where unidade_id = v_u and ano = 2026 and mes = 9) <> 'fechado' then
      raise exception 'competencia da unidade % nao voltou a fechado', v_u;
    end if;
  end loop;

  v_p := (public.get_relatorio_admin_mensal_rico_v1(v_rec, 2026, 9))->'payload';
  if (v_p#>>'{indicadores_retencao,churn_rate}')::numeric <> 2.63
     or (v_p#>>'{indicadores_retencao,mrr_perdido}')::numeric <> 4586.40
     or (v_p#>>'{indicadores_retencao,renovacoes_previstas}')::int <> 12
     or (v_p#>>'{indicadores_retencao,taxa_renovacao}')::numeric <> 100
     or (v_p#>>'{resumo,novos_alunos}')::int <> 21
     or (v_p#>>'{resumo,bolsistas_integrais}')::int <> 7
     or (v_p#>>'{resumo,bolsistas_parciais}')::int <> 4 then
    raise exception 'Recreio fora do simulado: % / %', v_p->'indicadores_retencao', v_p->'resumo';
  end if;

  v_p := (public.get_relatorio_admin_mensal_rico_v1(v_bar, 2026, 9))->'payload';
  if (v_p#>>'{indicadores_retencao,churn_rate}')::numeric <> 4.49
     or (v_p#>>'{indicadores_retencao,mrr_perdido}')::numeric <> 5236.00
     or (v_p#>>'{indicadores_retencao,renovacoes_previstas}')::int <> 14
     or (v_p#>>'{resumo,alunos_ativos}')::int <> 271
     or (v_p#>>'{resumo,alunos_pagantes}')::int <> 267 then
    raise exception 'Barra fora do simulado: % / %', v_p->'indicadores_retencao', v_p->'resumo';
  end if;

  raise notice 'Recreio e Barra set/26 regravados com churn por pessoa';
end $$;
