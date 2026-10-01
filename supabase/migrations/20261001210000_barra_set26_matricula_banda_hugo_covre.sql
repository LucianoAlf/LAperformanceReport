-- supabase/migrations/20261001210000_barra_set26_matricula_banda_hugo_covre.sql
--
-- Barra set/2026: a matricula de banda do Hugo Covre Guimaraes da Silva (Emusys 880, "Minha
-- Banda Pra Sempre", matricula 23/09/2026, mensalidade 0, prof. Jeyson, Qua 17h) existe no
-- Emusys e nunca foi criada em alunos (nenhum webhook registrado; o sync de matriculas nao cria
-- aluno). Achada na comparacao matricula a matricula contra GET /matriculas (01/10/2026): o
-- Emusys tem 300 matriculas (299 ativas + 1 trancada) e o LA Report 298 ativas + 1 trancada.
-- Decisao do Hugo: criar a matricula (existe no Emusys); trancado continua NAO contando como
-- ativo (regra de 08/08), entao a diferenca do Tom de Aquino Barbieri permanece.
--
-- Cria a linha copiando os dados pessoais da matricula de Guitarra dele (aluno 1858) e
-- recaptura setembro da Barra como nova versao (mesmo caminho de 20261001200000).
-- Guarda: ativos 271 / pagantes 267 / novas 21 (inalterados: banda nao entra) e matriculas
-- ativas 299 no relatorio admin; senao tudo volta.

do $$
declare
  v_n int;
begin
  if exists (select 1 from public.alunos where unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' and emusys_matricula_id = '880') then
    raise exception 'matricula 880 ja existe em alunos';
  end if;
  insert into public.alunos (
    nome, unidade_id, status, curso_id, professor_atual_id, dia_aula, horario_aula, modalidade,
    tipo_aluno, tipo_matricula_id, is_segundo_curso, valor_parcela, valor_cheio, desconto_fixo, desconto_condicional,
    data_matricula, data_inicio_contrato, data_fim_contrato, dia_vencimento,
    emusys_matricula_id, emusys_student_id, emusys_lead_id, lead_origem_id,
    telefone, data_nascimento, classificacao, responsavel_nome, responsavel_telefone, responsavel_cpf, responsavel_emusys_id,
    forma_pagamento_id, updated_by)
  select nome, unidade_id, 'ativo', 33, 49, 'Quarta', '17:00:00', 'turma',
    tipo_aluno, 5, true, 0, 0, 437, 0,
    '2026-09-23', '2026-09-23', '2027-08-18', 5,
    '880', emusys_student_id, emusys_lead_id, lead_origem_id,
    telefone, data_nascimento, classificacao, responsavel_nome, responsavel_telefone, responsavel_cpf, responsavel_emusys_id,
    forma_pagamento_id, 'migration 20261001210000'
  from public.alunos where id = 1858 and emusys_student_id = '1234';
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'esperava inserir 1 matricula, inseriu %', v_n; end if;
  if not exists (select 1 from public.alunos where unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' and emusys_matricula_id = '880' and status = 'ativo') then
    raise exception 'matricula 880 nao ficou gravada (gatilho reverteu?)';
  end if;
end $$;

do $$
declare
  v_u uuid := '368d47f5-2d88-4475-bc14-ba084a9a348e';
  v_obs text := 'Recaptura Barra set/26: matricula de banda do Hugo Covre (Emusys 880) que faltava; migration 20261001210000';
  v_prev jsonb; v_un jsonb; v_dom text; v_key text; v_fonte text; v_payload jsonb; v_ver int; v_id uuid;
  v_bloco jsonb; v_fech jsonb; v_dm record; v_rel jsonb; v_n int;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('app.fechamento_competencia_viva', '2026-9', true);

  update public.competencias_mensais set status = 'aberto'
  where unidade_id = v_u and ano = 2026 and mes = 9 and status = 'fechado';
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'esperava reabrir 1 competencia, reabriu %', v_n; end if;

  v_prev := public.preview_fechamento_mensal(2026, 9, null, true);
  select value into v_un from jsonb_array_elements(v_prev->'unidades') where value->>'unidade_id' = v_u::text;
  if v_un is null then raise exception 'preview sem a Barra'; end if;
  if jsonb_array_length(coalesce(v_un->'bloqueios', '[]')) > 0 then
    raise exception 'preview da Barra bloqueado: %', v_un->'bloqueios';
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
      raise exception 'payload % invalido', v_dom;
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
            jsonb_build_object('dominio', v_dom, 'fonte', v_fonte, 'versao', v_ver, 'origem', '20261001210000'));
  end loop;

  v_bloco := public.garantir_bloco_financeiro_gerencial_v1(2026, 9, v_u);
  if coalesce((v_bloco->>'ok')::boolean, false) is not true then
    raise exception 'bloco financeiro: %', v_bloco;
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
            jsonb_build_object('dominio', v_dom, 'fonte', v_fonte, 'versao', v_ver, 'origem', '20261001210000'));
  end loop;

  v_fech := public.fechar_competencia_mensal_canonica_v2(2026, 9, v_obs, v_u, null);
  perform public.atualizar_dados_mensais_por_snapshot(2026, 9, v_u, false);

  select alunos_ativos, alunos_pagantes, novas_matriculas into v_dm
  from public.dados_mensais where unidade_id = v_u and ano = 2026 and mes = 9;
  if (v_dm.alunos_ativos, v_dm.alunos_pagantes, v_dm.novas_matriculas) is distinct from (271, 267, 21) then
    raise exception 'resultado inesperado: ativos % pagantes % novas %', v_dm.alunos_ativos, v_dm.alunos_pagantes, v_dm.novas_matriculas;
  end if;

  v_rel := public.get_relatorio_admin_mensal_rico_v1(v_u, 2026, 9);
  if (v_rel#>>'{payload,resumo,alunos_ativos}')::int <> 271 or (v_rel#>>'{payload,resumo,novos_alunos}')::int <> 21
     or (v_rel#>>'{payload,resumo,matriculas_ativas}')::int <> 299 then
    raise exception 'relatorio admin nao refletiu: %', v_rel#>'{payload,resumo}';
  end if;
  if (select status from public.competencias_mensais where unidade_id = v_u and ano = 2026 and mes = 9) <> 'fechado' then
    raise exception 'competencia nao voltou a fechado';
  end if;
  raise notice 'Barra set/26 recapturada: % snapshots fechados', v_fech->>'snapshots_fechados';
end $$;
