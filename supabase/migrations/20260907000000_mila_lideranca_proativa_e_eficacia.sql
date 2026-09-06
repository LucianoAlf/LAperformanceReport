-- A MILA FALA PRIMEIRO COM A LIDERANCA + O LACO COMECA A FECHAR (06/09/2026)
--
-- Aplicado em producao no mesmo dia; arquivo versionado a partir do corpo VIVO.
-- ⚠️  e OPT-IN: quatro pessoas passam na regra de cargo e o
--    Alf pediu duas. Receber WhatsApp todo dia as 8:30 nao e consequencia de
--    cargo. Hugo e Anne Susan ficam elegiveis e DESLIGADOS.

alter table governanca.agente_usuarios
  add column if not exists recebe_briefing boolean not null default false;

CREATE OR REPLACE FUNCTION public.mila_lideranca_ativa_v1()
 RETURNS TABLE(telefone text, nome text, apelido text, nivel text, departamento text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'governanca'
AS $function$
  select u.telefone, u.nome, split_part(u.nome, ' ', 1) as apelido, u.nivel, u.departamento
  from governanca.agente_usuarios u
  where u.ativo
    and u.recebe_briefing                       -- ⚠️ opt-in, nao cargo
    and (lower(u.nivel) = 'diretoria'
         or (lower(u.departamento) = 'comercial' and lower(u.nivel) = 'lider'))
  order by (lower(u.nivel) = 'diretoria'), u.nome;
$function$
;

CREATE OR REPLACE FUNCTION public.mila_briefing_lideranca_v1(p_solicitante_telefone text, p_data date DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date, p_tipo text DEFAULT 'manha'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_quem record; v_dep text; v_niv text;
  v_ini date := date_trunc('month', p_data)::date;
  v_unid jsonb; v_atend jsonb; v_padroes_velhos int; v_pend jsonb;
  v_dias_no_mes int := p_data - date_trunc('month', p_data)::date + 1;
begin
  select * into v_quem
  from governanca.quem_eh(regexp_replace(coalesce(p_solicitante_telefone,''), '\D','','g'));
  if v_quem.nome is null then
    return jsonb_build_object('ok', false, 'motivo', 'solicitante_desconhecido');
  end if;
  v_dep := lower(coalesce(v_quem.departamento,'')); v_niv := lower(coalesce(v_quem.nivel,''));
  if not (v_niv = 'diretoria' or (v_dep = 'comercial' and v_niv = 'lider')) then
    return jsonb_build_object('ok', false, 'motivo', 'nao_e_lideranca_comercial');
  end if;

  -- ⚠️ MESMO PERIODO do mes anterior, nao mes fechado: comparar 6 dias com 31
  --    daria "queda" todo comeco de mes e ensinaria a ignorar o numero.
  select jsonb_agg(jsonb_build_object(
           'unidade', u.nome,
           'mes_ate_hoje', (select count(*) filter (where m.conta)
                            from matriculas_comerciais_v1(u.id, v_ini, p_data + 1) m),
           'mesmo_periodo_mes_passado', (select count(*) filter (where m2.conta)
                            from matriculas_comerciais_v1(u.id,
                                 (v_ini - interval '1 month')::date,
                                 ((v_ini - interval '1 month')::date + v_dias_no_mes)) m2))
         order by u.nome)
    into v_unid
  from unidades u where u.nome in ('Campo Grande','Recreio','Barra');

  begin select mila_atendimento_serie_v1(p_solicitante_telefone, 7) into v_atend;
  exception when others then v_atend := null; end;

  select count(*) into v_padroes_velhos from radar_padroes
   where ativo and medido_em < p_data - 45;

  begin select radar_pendencias_comerciais_v1(p_solicitante_telefone, 5) into v_pend;
  exception when others then v_pend := null; end;

  return jsonb_build_object(
    'ok', true, 'tipo', p_tipo, 'data', p_data,
    'quem', jsonb_build_object('nome', v_quem.nome, 'nivel', v_quem.nivel),
    'dia_do_mes', v_dias_no_mes,
    'unidades', coalesce(v_unid,'[]'::jsonb),
    'rede_mes_ate_hoje', (select coalesce(sum((x->>'mes_ate_hoje')::int),0)
                          from jsonb_array_elements(coalesce(v_unid,'[]'::jsonb)) x),
    'rede_mesmo_periodo_mes_passado', (select coalesce(sum((x->>'mesmo_periodo_mes_passado')::int),0)
                          from jsonb_array_elements(coalesce(v_unid,'[]'::jsonb)) x),
    'atendimento', v_atend, 'pendencias', v_pend,
    'padroes_envelhecidos', v_padroes_velhos,
    -- 🔴 NAO EXISTE LUGAR NO BANCO ONDE "A CAMPANHA DO MES" SEJA REGISTRADA.
    --    `radar_estrategias` e catalogo de estrategias, nao plano do mes, e nao
    --    tem data de criacao. Entao a Mila NAO afirma que falta campanha — ela
    --    PERGUNTA. Dizer "nao ha campanha" sem fonte seria inventar sinal, que
    --    e exatamente o que a base proibe.
    'campanha_do_mes', 'nao_sei',
    'perguntar_campanha', (v_dias_no_mes <= 10),
    'nada_para_hoje', false);
end; $function$
;

CREATE OR REPLACE FUNCTION public.mila_registrar_eficacia_v1(p_solicitante_telefone text, p_codigo_estrategia text, p_resultado text, p_rotulo text, p_comparador text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_quem record; v_dep text; v_niv text; v_antes text;
begin
  select * into v_quem
  from governanca.quem_eh(regexp_replace(coalesce(p_solicitante_telefone,''),'\D','','g'));
  if v_quem.nome is null then
    return jsonb_build_object('ok', false, 'motivo','solicitante_desconhecido');
  end if;
  v_dep := lower(coalesce(v_quem.departamento,'')); v_niv := lower(coalesce(v_quem.nivel,''));
  -- ⚠️ So quem lidera fecha o laco: dizer se uma estrategia funcionou e decisao
  --    de gestao, nao registro de operacao.
  if not (v_niv='diretoria' or (v_dep='comercial' and v_niv='lider')) then
    return jsonb_build_object('ok', false, 'motivo','so_lideranca_registra_eficacia');
  end if;
  if lower(coalesce(p_rotulo,'')) not in ('observado','atribuido','incremental') then
    return jsonb_build_object('ok', false, 'motivo','rotulo_invalido',
      'aceitos', jsonb_build_array('observado','atribuido','incremental'));
  end if;
  -- 🔴 `incremental` EXIGE comparador. Sem contra o que comparar, incremental e
  --    so uma palavra bonita para observado.
  if lower(p_rotulo)='incremental' and coalesce(btrim(p_comparador),'')='' then
    return jsonb_build_object('ok', false, 'motivo','incremental_exige_comparador',
      'recado','Contra o que? Mesmo mes do ano passado, ou as unidades que nao fizeram.');
  end if;

  select evidencia_eficacia into v_antes from radar_estrategias where codigo = p_codigo_estrategia;
  if not found then
    return jsonb_build_object('ok', false, 'motivo','estrategia_nao_encontrada', 'codigo', p_codigo_estrategia);
  end if;

  -- ⚠️ ACUMULA, nao sobrescreve: a segunda vez que uma estrategia roda e o dado
  --    mais valioso que existe — e comparar com a primeira e o unico jeito de
  --    saber se melhorou.
  update radar_estrategias
     set evidencia_eficacia = trim(both E'\n' from coalesce(v_antes,'') || E'\n' ||
           to_char(now() at time zone 'America/Sao_Paulo','DD/MM/YYYY') || ' · ' ||
           lower(p_rotulo) || ' · ' || btrim(p_resultado) ||
           case when coalesce(btrim(p_comparador),'')<>'' then ' · contra: ' || btrim(p_comparador) else '' end ||
           ' · por ' || v_quem.nome),
         atualizada_em = now()
   where codigo = p_codigo_estrategia;

  insert into automacao_log (evento, acao, status, aluno_nome, detalhes)
  values ('radar','eficacia_registrada','ok','radar de estrategias',
          jsonb_build_object('codigo',p_codigo_estrategia,'rotulo',lower(p_rotulo),
                             'quem',v_quem.nome,'tinha_antes',(coalesce(v_antes,'')<>'')));

  return jsonb_build_object('ok', true, 'codigo', p_codigo_estrategia,
    'recado','Registrado. Da proxima vez que essa estrategia aparecer, eu trago o que ela ja rendeu.');
end; $function$
;


update governanca.agente_usuarios set recebe_briefing = true
 where telefone in ('5521966875271','5521981278047');   -- Krissya e Alf
