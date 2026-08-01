-- Relatorios mensais canonicos e imutaveis.
-- A captura acontece antes do fechamento formal; a leitura historica nunca
-- recalcula a competencia usando o estado vivo do banco.

alter table public.fechamento_mensal_snapshots
  drop constraint if exists fechamento_mensal_snapshots_dominio_check;

alter table public.fechamento_mensal_snapshots
  add constraint fechamento_mensal_snapshots_dominio_check check (
    dominio = any (array[
      'alunos_admin',
      'alunos_executivo',
      'comercial',
      'retencao',
      'renovacoes',
      'professores',
      'relatorio_admin',
      'relatorio_admin_mensal',
      'relatorio_comercial_mensal',
      'relatorio_gerencial',
      'relatorio_coordenacao',
      'metas',
      'programa_matriculador',
      'programa_fideliza',
      'compatibilidade_dados_mensais'
    ]::text[])
  );

create or replace function public.proteger_fechamento_mensal_snapshot_imutavel_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if tg_op = 'DELETE' and old.status in ('aprovado', 'fechado') then
    raise exception 'SNAPSHOT_MENSAL_IMUTAVEL: exclusao proibida para snapshot %', old.id;
  end if;

  if tg_op = 'UPDATE' and old.status = 'fechado' then
    raise exception 'SNAPSHOT_MENSAL_IMUTAVEL: snapshot fechado % nao pode ser alterado', old.id;
  end if;

  if tg_op = 'UPDATE' and old.status = 'aprovado' then
    if new.status = 'fechado'
       and new.id = old.id
       and new.ano = old.ano
       and new.mes = old.mes
       and new.escopo = old.escopo
       and new.unidade_id is not distinct from old.unidade_id
       and new.dominio = old.dominio
       and new.versao = old.versao
       and new.fonte = old.fonte
       and new.payload = old.payload
       and new.payload_hash = old.payload_hash
       and new.fechado_em is not null then
      return new;
    end if;

    raise exception 'SNAPSHOT_MENSAL_IMUTAVEL: snapshot aprovado % exige nova versao para retificacao', old.id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_fechamento_mensal_snapshot_imutavel
  on public.fechamento_mensal_snapshots;
create trigger trg_fechamento_mensal_snapshot_imutavel
before update or delete on public.fechamento_mensal_snapshots
for each row execute function public.proteger_fechamento_mensal_snapshot_imutavel_v1();

revoke all on function public.proteger_fechamento_mensal_snapshot_imutavel_v1()
  from public, anon, authenticated, service_role;

create or replace function public.montar_relatorio_admin_mensal_payload_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_inicio date := make_date(p_ano, p_mes, 1);
  v_fim_exclusivo date := (make_date(p_ano, p_mes, 1) + interval '1 month')::date;
  v_proximo_fim date := (make_date(p_ano, p_mes, 1) + interval '2 months')::date;
  v_admin public.fechamento_mensal_snapshots%rowtype;
  v_gerencial public.fechamento_mensal_snapshots%rowtype;
  v_unidade public.unidades%rowtype;
  v_renovacoes jsonb := '[]'::jsonb;
  v_nao_renovacoes jsonb := '[]'::jsonb;
  v_avisos jsonb := '[]'::jsonb;
  v_evasoes jsonb := '[]'::jsonb;
  v_novos jsonb := '[]'::jsonb;
  v_transferencias jsonb := '[]'::jsonb;
  v_trancamentos jsonb := '{}'::jsonb;
  v_financeiro jsonb := '{}'::jsonb;
begin
  if p_unidade_id is null or p_ano is null or p_mes not between 1 and 12 then
    raise exception 'RELATORIO_ADMIN_MENSAL_PARAMETROS_INVALIDOS';
  end if;

  select * into v_unidade
  from public.unidades u
  where u.id = p_unidade_id and u.ativo = true;
  if not found then
    raise exception 'RELATORIO_ADMIN_MENSAL_UNIDADE_INVALIDA';
  end if;

  select * into v_admin
  from public.fechamento_mensal_snapshots s
  where s.ano = p_ano
    and s.mes = p_mes
    and s.escopo = 'unidade'
    and s.unidade_id = p_unidade_id
    and s.dominio = 'alunos_admin'
    and s.status in ('aprovado', 'fechado')
  order by s.versao desc
  limit 1;

  if v_admin.id is null
     or v_admin.payload_hash is null
     or public.hash_jsonb_canonico(v_admin.payload) <> v_admin.payload_hash then
    raise exception 'SNAPSHOT_ADMIN_DIVERGENTE';
  end if;

  select * into v_gerencial
  from public.fechamento_mensal_snapshots s
  where s.ano = p_ano
    and s.mes = p_mes
    and s.escopo = 'unidade'
    and s.unidade_id = p_unidade_id
    and s.dominio = 'relatorio_gerencial'
    and s.status in ('aprovado', 'fechado')
  order by s.versao desc
  limit 1;

  if v_gerencial.id is null
     or public.hash_jsonb_canonico(v_gerencial.payload) <> v_gerencial.payload_hash then
    raise exception 'SNAPSHOT_ADMIN_DIVERGENTE: relatorio gerencial ausente ou corrompido';
  end if;

  v_financeiro := coalesce(
    v_gerencial.payload->'financeiro_faturas_emusys',
    v_gerencial.payload->'dados_mes_atual'->0->'financeiro_faturas_emusys',
    '{}'::jsonb
  );

  select coalesce(jsonb_agg(item order by item->>'data', item->>'id'), '[]'::jsonb)
  into v_renovacoes
  from (
    select jsonb_build_object(
      'id', m.id,
      'data', m.data,
      'aluno_nome', m.aluno_nome,
      'valor_parcela_anterior', m.valor_parcela_anterior,
      'valor_parcela_novo', m.valor_parcela_novo,
      'forma_pagamento', fp.sigla,
      'agente_comercial', m.agente_comercial,
      'curso', c.nome,
      'professor', p.nome,
      'status', m.renovacao_status,
      'antecipada', coalesce(m.renovacao_antecipada, false)
    ) as item
    from public.movimentacoes_admin m
    left join public.formas_pagamento fp on fp.id = m.forma_pagamento_id
    left join public.cursos c on c.id = m.curso_id
    left join public.professores p on p.id = m.professor_id
    where m.unidade_id = p_unidade_id
      and m.tipo = 'renovacao'
      and coalesce(m.competencia_referencia, m.data) >= v_inicio
      and coalesce(m.competencia_referencia, m.data) < v_fim_exclusivo
      and m.created_at <= v_admin.capturado_em
      and (
        m.renovacao_status in ('confirmada', 'antecipada_confirmada')
        or (
          m.renovacao_status is null
          and nullif(btrim(coalesce(m.agente_comercial, '')), '') is not null
          and (
            m.valor_parcela_anterior is not null
            or m.valor_parcela_novo is not null
            or m.forma_pagamento_id is not null
          )
        )
      )
  ) q;

  select coalesce(jsonb_agg(item order by item->>'data', item->>'id'), '[]'::jsonb)
  into v_nao_renovacoes
  from (
    select jsonb_build_object(
      'id', m.id,
      'data', m.data,
      'aluno_nome', m.aluno_nome,
      'valor_parcela_anterior', m.valor_parcela_anterior,
      'valor_parcela_novo', m.valor_parcela_novo,
      'motivo', m.motivo,
      'curso', c.nome,
      'professor', p.nome
    ) as item
    from public.movimentacoes_admin m
    left join public.cursos c on c.id = m.curso_id
    left join public.professores p on p.id = m.professor_id
    where m.unidade_id = p_unidade_id
      and m.tipo = 'nao_renovacao'
      and coalesce(m.competencia_referencia, m.data) >= v_inicio
      and coalesce(m.competencia_referencia, m.data) < v_fim_exclusivo
      and m.created_at <= v_admin.capturado_em
  ) q;

  select coalesce(jsonb_agg(item order by item->>'data', item->>'id'), '[]'::jsonb)
  into v_avisos
  from (
    select jsonb_build_object(
      'id', m.id,
      'data', m.data,
      'mes_saida', m.mes_saida,
      'aluno_nome', m.aluno_nome,
      'valor_parcela', coalesce(m.valor_parcela_evasao, m.valor_parcela_anterior),
      'motivo', m.motivo,
      'curso', c.nome,
      'professor', p.nome
    ) as item
    from public.movimentacoes_admin m
    left join public.cursos c on c.id = m.curso_id
    left join public.professores p on p.id = m.professor_id
    where m.unidade_id = p_unidade_id
      and m.tipo = 'aviso_previo'
      and m.mes_saida >= v_fim_exclusivo
      and m.mes_saida < v_proximo_fim
      and m.created_at <= v_admin.capturado_em
  ) q;

  select coalesce(jsonb_agg(item order by item->>'data', item->>'id'), '[]'::jsonb)
  into v_evasoes
  from (
    select jsonb_build_object(
      'id', m.id,
      'data', m.data,
      'aluno_nome', m.aluno_nome,
      'tipo_evasao', m.tipo_evasao,
      'valor_perdido', coalesce(m.valor_parcela_evasao, m.valor_parcela_anterior, 0),
      'motivo', m.motivo,
      'curso', c.nome,
      'professor', p.nome
    ) as item
    from public.movimentacoes_admin m
    left join public.cursos c on c.id = m.curso_id
    left join public.professores p on p.id = m.professor_id
    where m.unidade_id = p_unidade_id
      and m.tipo = 'evasao'
      and coalesce(m.competencia_referencia, m.data) >= v_inicio
      and coalesce(m.competencia_referencia, m.data) < v_fim_exclusivo
      and m.created_at <= v_admin.capturado_em
  ) q;

  select coalesce(jsonb_agg(item order by item->>'data_matricula', item->>'nome'), '[]'::jsonb)
  into v_novos
  from (
    select jsonb_build_object(
      'id', a.id,
      'nome', a.nome,
      'data_matricula', a.data_matricula,
      'valor_parcela', a.valor_parcela,
      'curso', c.nome,
      'professor', p.nome,
      'tipo_codigo', tm.codigo,
      'agente_comercial', a.agente_comercial
    ) as item
    from public.alunos a
    join public.tipos_matricula tm on tm.id = a.tipo_matricula_id
    left join public.cursos c on c.id = a.curso_id
    left join public.professores p on p.id = a.professor_atual_id
    where a.unidade_id = p_unidade_id
      and a.data_matricula >= v_inicio
      and a.data_matricula < v_fim_exclusivo
      and a.created_at <= v_admin.capturado_em
      and a.is_segundo_curso is not true
      and upper(coalesce(tm.codigo, '')) not in (
        'BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA',
        'SEGUNDO_CURSO', 'TRANSFERENCIA'
      )
  ) q;

  select coalesce(jsonb_agg(item order by item->>'data_transferencia', item->>'nome'), '[]'::jsonb)
  into v_transferencias
  from (
    select jsonb_build_object(
      'id', t.id,
      'aluno_id', t.aluno_id,
      'nome', coalesce(a.nome, 'Aluno transferido'),
      'data_transferencia', t.data_transferencia,
      'unidade_origem', uo.nome,
      'unidade_destino', ud.nome,
      'observacao', t.observacao
    ) as item
    from public.aluno_transferencias t
    left join public.alunos a on a.id = t.aluno_id
    left join public.unidades uo on uo.id = t.unidade_origem_id
    left join public.unidades ud on ud.id = t.unidade_destino_id
    where t.unidade_destino_id = p_unidade_id
      and t.data_transferencia >= v_inicio
      and t.data_transferencia < v_fim_exclusivo
      and t.created_at <= v_admin.capturado_em
  ) q;

  v_trancamentos := public.get_trancamentos_admin_operacionais_v1(
    p_unidade_id,
    (v_fim_exclusivo - 1)
  );

  return jsonb_build_object(
    'schema_version', 1,
    'tipo', 'administrativo',
    'competencia', jsonb_build_object(
      'ano', p_ano,
      'mes', p_mes,
      'inicio', v_inicio,
      'fim_exclusivo', v_fim_exclusivo
    ),
    'unidade', jsonb_build_object(
      'id', v_unidade.id,
      'nome', v_unidade.nome,
      'codigo', v_unidade.codigo,
      'gerente', v_unidade.gerente_nome,
      'farmers', coalesce(to_jsonb(v_unidade.farmers_nomes), '[]'::jsonb)
    ),
    'fontes', jsonb_build_object(
      'alunos_admin', jsonb_build_object('snapshot_id', v_admin.id, 'payload_hash', v_admin.payload_hash),
      'relatorio_gerencial', jsonb_build_object('snapshot_id', v_gerencial.id, 'payload_hash', v_gerencial.payload_hash)
    ),
    'resumo', jsonb_build_object(
      'alunos_ativos', coalesce((v_admin.payload->>'alunos_ativos')::integer, 0),
      'alunos_pagantes', coalesce((v_admin.payload->>'alunos_pagantes')::integer, 0),
      'alunos_nao_pagantes', coalesce((v_admin.payload->>'alunos_nao_pagantes')::integer, 0),
      'alunos_trancados', coalesce((v_admin.payload->>'alunos_trancados')::integer, 0),
      'matriculas_trancadas', coalesce((v_admin.payload->>'matriculas_trancadas')::integer, 0),
      'bolsistas_integrais', coalesce((v_admin.payload->>'bolsistas_integrais')::integer, 0),
      'bolsistas_parciais', coalesce((v_admin.payload->>'bolsistas_parciais')::integer, 0),
      'matriculas_ativas', coalesce((v_admin.payload->>'matriculas_ativas')::integer, 0),
      'matriculas_base', coalesce((v_admin.payload->>'matriculas_base_alunos_ativos')::integer, 0),
      'matriculas_banda', coalesce((v_admin.payload->>'matriculas_banda')::integer, 0),
      'matriculas_adicionais', coalesce((v_admin.payload->>'matriculas_2_curso')::integer, 0),
      'matriculas_adicionais_extras', coalesce((v_admin.payload->>'matriculas_2_curso_extras')::integer, 0),
      'matriculas_coral', coalesce((v_admin.payload->>'matriculas_coral')::integer, 0),
      'alunos_com_exatamente_2_cursos', coalesce((v_admin.payload->>'alunos_com_exatamente_2_cursos')::integer, 0),
      'alunos_com_exatamente_3_cursos', coalesce((v_admin.payload->>'alunos_com_exatamente_3_cursos')::integer, 0),
      'alunos_com_4_ou_mais_cursos', coalesce((v_admin.payload->>'alunos_com_4_ou_mais_cursos')::integer, 0),
      'novos_alunos', jsonb_array_length(v_novos),
      'transferencias_recebidas', jsonb_array_length(v_transferencias),
      'renovacoes_realizadas', jsonb_array_length(v_renovacoes),
      'nao_renovacoes', jsonb_array_length(v_nao_renovacoes),
      'avisos_previos', jsonb_array_length(v_avisos),
      'evasoes', jsonb_array_length(v_evasoes),
      'mrr', coalesce((v_financeiro->>'mrr_atual')::numeric, 0),
      'ticket_medio', coalesce((v_financeiro->>'ticket_medio')::numeric, 0)
    ),
    'renovacoes', v_renovacoes,
    'nao_renovacoes', v_nao_renovacoes,
    'avisos_previos', v_avisos,
    'evasoes', v_evasoes,
    'novos_alunos', v_novos,
    'transferencias', v_transferencias,
    'trancamentos_detalhados', jsonb_build_object(
      'data_referencia', v_trancamentos->'data_referencia',
      'total_alunos', coalesce((v_trancamentos->>'total_alunos')::integer, 0),
      'total_matriculas', coalesce((v_trancamentos->>'total_matriculas')::integer, 0),
      'politica', jsonb_build_object(
        'prazo_contratual_meses', 1,
        'extensao_gerencial_meses', 1,
        'limite_total_meses', 2,
        'classificacao_por_item', 'faixa_politica'
      ),
      'itens', coalesce(v_trancamentos->'itens', '[]'::jsonb)
    ),
    'capturado_em', v_admin.capturado_em,
    'fuso', 'America/Sao_Paulo'
  );
end;
$function$;

revoke all on function public.montar_relatorio_admin_mensal_payload_v1(uuid, integer, integer)
  from public, anon, authenticated, service_role;

create or replace function public.montar_relatorio_comercial_mensal_payload_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_inicio date := make_date(p_ano, p_mes, 1);
  v_fim_exclusivo date := (make_date(p_ano, p_mes, 1) + interval '1 month')::date;
  v_comercial public.fechamento_mensal_snapshots%rowtype;
  v_gerencial public.fechamento_mensal_snapshots%rowtype;
  v_unidade public.unidades%rowtype;
  v_kpis jsonb := '{}'::jsonb;
  v_kpis_gerencial jsonb := '{}'::jsonb;
  v_matriculas jsonb := '[]'::jsonb;
  v_leads_canal jsonb := '[]'::jsonb;
  v_leads_curso jsonb := '[]'::jsonb;
  v_matriculas_canal jsonb := '[]'::jsonb;
  v_matriculas_curso jsonb := '[]'::jsonb;
  v_alertas jsonb := '[]'::jsonb;
  v_matriculas_total integer := 0;
  v_leads_detalhados integer := 0;
  v_leads_snapshot integer := 0;
  v_experimentais integer := 0;
  v_conversoes integer := 0;
  v_pendencias integer := 0;
  v_total_passaporte numeric := 0;
  v_total_parcela numeric := 0;
  v_qtd_passaporte integer := 0;
  v_qtd_parcela integer := 0;
begin
  if p_unidade_id is null or p_ano is null or p_mes not between 1 and 12 then
    raise exception 'RELATORIO_COMERCIAL_MENSAL_PARAMETROS_INVALIDOS';
  end if;

  select * into v_unidade
  from public.unidades u
  where u.id = p_unidade_id and u.ativo = true;
  if not found then
    raise exception 'RELATORIO_COMERCIAL_MENSAL_UNIDADE_INVALIDA';
  end if;

  select * into v_comercial
  from public.fechamento_mensal_snapshots s
  where s.ano = p_ano
    and s.mes = p_mes
    and s.escopo = 'unidade'
    and s.unidade_id = p_unidade_id
    and s.dominio = 'comercial'
    and s.status in ('aprovado', 'fechado')
  order by s.versao desc
  limit 1;

  if v_comercial.id is null
     or v_comercial.payload_hash is null
     or public.hash_jsonb_canonico(v_comercial.payload) <> v_comercial.payload_hash then
    raise exception 'SNAPSHOT_COMERCIAL_DIVERGENTE';
  end if;
  v_kpis := coalesce(v_comercial.payload->'kpis', v_comercial.payload, '{}'::jsonb);
  v_leads_snapshot := coalesce((v_kpis->>'leads_entrantes')::integer, 0);

  select * into v_gerencial
  from public.fechamento_mensal_snapshots s
  where s.ano = p_ano
    and s.mes = p_mes
    and s.escopo = 'unidade'
    and s.unidade_id = p_unidade_id
    and s.dominio = 'relatorio_gerencial'
    and s.status in ('aprovado', 'fechado')
  order by s.versao desc
  limit 1;

  if v_gerencial.id is null
     or public.hash_jsonb_canonico(v_gerencial.payload) <> v_gerencial.payload_hash then
    raise exception 'SNAPSHOT_COMERCIAL_DIVERGENTE: relatorio gerencial ausente ou corrompido';
  end if;
  v_kpis_gerencial := coalesce(v_gerencial.payload->'kpis_comercial'->0, '{}'::jsonb);

  with base as (
    select
      a.id,
      a.unidade_id,
      a.nome,
      a.idade_atual,
      a.data_matricula,
      a.telefone,
      a.responsavel_telefone,
      a.emusys_student_id,
      a.valor_passaporte,
      a.valor_parcela,
      a.forma_pagamento_id,
      a.curso_id,
      a.professor_atual_id,
      a.professor_experimental_id,
      c.nome as curso_nome,
      c.is_projeto_banda,
      tm.codigo as tipo_codigo,
      tm.conta_como_pagante,
      tm.entra_ticket_medio,
      pf.nome as professor_nome,
      pe.nome as professor_experimental_nome,
      fp.nome as forma_pagamento,
      coalesce(coa.nome, col.nome, 'Nao informado') as canal_nome,
      coalesce(
        nullif(a.emusys_student_id, ''),
        'nome:' || lower(regexp_replace(trim(coalesce(a.nome, '')), '\s+', ' ', 'g'))
          || '|tel:' || regexp_replace(
            coalesce(nullif(a.telefone, ''), a.responsavel_telefone, ''),
            '\D', '', 'g'
          )
      ) as pessoa_key
    from public.alunos a
    left join public.cursos c on c.id = a.curso_id
    left join public.tipos_matricula tm on tm.id = a.tipo_matricula_id
    left join public.professores pf on pf.id = a.professor_atual_id
    left join public.professores pe on pe.id = a.professor_experimental_id
    left join public.formas_pagamento fp on fp.id = a.forma_pagamento_id
    left join public.canais_origem coa on coa.id = a.canal_origem_id
    left join lateral (
      select l.canal_origem_id
      from public.leads l
      where l.unidade_id = a.unidade_id
        and l.created_at <= v_comercial.capturado_em
        and (
          l.aluno_id = a.id
          or (
            nullif(a.emusys_lead_id, '') ~ '^[0-9]+$'
            and l.emusys_lead_id = a.emusys_lead_id::integer
          )
        )
      order by (l.aluno_id = a.id) desc, l.created_at desc, l.id desc
      limit 1
    ) lead on true
    left join public.canais_origem col on col.id = lead.canal_origem_id
    where a.unidade_id = p_unidade_id
      and a.data_matricula >= v_inicio
      and a.data_matricula < v_fim_exclusivo
      and a.created_at <= v_comercial.capturado_em
      and a.arquivado_em is null
      and lower(coalesce(a.status, '')) not in ('excluido', 'excluida', 'cancelado', 'cancelada')
      and coalesce(a.is_segundo_curso, false) = false
      and coalesce(c.is_projeto_banda, false) = false
      and lower(coalesce(c.nome, '')) not like '%banda%'
      and lower(coalesce(c.nome, '')) not like '%canto coral%'
      and upper(coalesce(tm.codigo, '')) not in (
        'BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA',
        'SEGUNDO_CURSO', 'TRANSFERENCIA'
      )
      and (
        coalesce(tm.conta_como_pagante, false) = true
        or coalesce(tm.entra_ticket_medio, false) = true
      )
      and coalesce(a.valor_parcela, 0) > 0
  ), agrupadas as (
    select
      unidade_id,
      data_matricula,
      pessoa_key,
      min(id) as id,
      min(nome) as nome,
      max(idade_atual) as idade,
      string_agg(distinct curso_nome, ' e ' order by curso_nome) as cursos,
      string_agg(distinct professor_nome, ' e ' order by professor_nome)
        filter (where professor_nome is not null) as professores,
      string_agg(distinct professor_experimental_nome, ' e ' order by professor_experimental_nome)
        filter (where professor_experimental_nome is not null) as professores_experimentais,
      string_agg(distinct forma_pagamento, ' e ' order by forma_pagamento)
        filter (where forma_pagamento is not null) as formas_pagamento,
      max(canal_nome) as canal,
      max(coalesce(valor_passaporte, 0)) as valor_passaporte,
      sum(coalesce(valor_parcela, 0)) as valor_parcela,
      jsonb_agg(valor_parcela order by id)
        filter (where coalesce(valor_parcela, 0) > 0) as parcelas
    from base
    group by unidade_id, data_matricula, pessoa_key
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'nome', nome,
        'idade', idade,
        'data_matricula', data_matricula,
        'cursos', cursos,
        'professores', professores,
        'professores_experimentais', professores_experimentais,
        'formas_pagamento', formas_pagamento,
        'canal', canal,
        'valor_passaporte', valor_passaporte,
        'valor_parcela', valor_parcela,
        'parcelas', coalesce(parcelas, '[]'::jsonb)
      ) order by data_matricula, nome, id
    ), '[]'::jsonb),
    count(*)::integer,
    coalesce(sum(valor_passaporte), 0),
    count(*) filter (where valor_passaporte > 0)::integer,
    coalesce(sum(valor_parcela), 0),
    count(*) filter (where valor_parcela > 0)::integer
  into
    v_matriculas,
    v_matriculas_total,
    v_total_passaporte,
    v_qtd_passaporte,
    v_total_parcela,
    v_qtd_parcela
  from agrupadas;

  if v_matriculas_total <> coalesce((v_kpis->>'matriculas_comerciais_principais')::integer, 0) then
    raise exception 'SNAPSHOT_COMERCIAL_DIVERGENTE: matriculas detalhadas %, snapshot %',
      v_matriculas_total,
      coalesce((v_kpis->>'matriculas_comerciais_principais')::integer, 0);
  end if;

  select coalesce(sum(coalesce(l.quantidade, 1)), 0)::integer
  into v_leads_detalhados
  from public.leads l
  where l.unidade_id = p_unidade_id
    and l.data_contato >= v_inicio
    and l.data_contato < v_fim_exclusivo
    and l.created_at <= v_comercial.capturado_em;

  if v_leads_detalhados > v_leads_snapshot then
    raise exception 'SNAPSHOT_COMERCIAL_DIVERGENTE: leads detalhados %, snapshot %',
      v_leads_detalhados, v_leads_snapshot;
  end if;

  with distribuicao as (
    select coalesce(co.nome, 'Sem canal') as nome,
           sum(coalesce(l.quantidade, 1))::integer as quantidade
    from public.leads l
    left join public.canais_origem co on co.id = l.canal_origem_id
    where l.unidade_id = p_unidade_id
      and l.data_contato >= v_inicio
      and l.data_contato < v_fim_exclusivo
      and l.created_at <= v_comercial.capturado_em
    group by coalesce(co.nome, 'Sem canal')
    union all
    select 'Sem canal', v_leads_snapshot - v_leads_detalhados
    where v_leads_snapshot > v_leads_detalhados
  ), consolidada as (
    select nome, sum(quantidade)::integer as quantidade
    from distribuicao
    group by nome
  )
  select coalesce(jsonb_agg(
    jsonb_build_object('nome', nome, 'quantidade', quantidade)
    order by quantidade desc, nome
  ), '[]'::jsonb)
  into v_leads_canal
  from consolidada;

  with distribuicao as (
    select coalesce(c.nome, 'Sem curso') as nome,
           sum(coalesce(l.quantidade, 1))::integer as quantidade
    from public.leads l
    left join public.cursos c on c.id = l.curso_interesse_id
    where l.unidade_id = p_unidade_id
      and l.data_contato >= v_inicio
      and l.data_contato < v_fim_exclusivo
      and l.created_at <= v_comercial.capturado_em
    group by coalesce(c.nome, 'Sem curso')
    union all
    select 'Sem curso', v_leads_snapshot - v_leads_detalhados
    where v_leads_snapshot > v_leads_detalhados
  ), consolidada as (
    select nome, sum(quantidade)::integer as quantidade
    from distribuicao
    group by nome
  )
  select coalesce(jsonb_agg(
    jsonb_build_object('nome', nome, 'quantidade', quantidade)
    order by quantidade desc, nome
  ), '[]'::jsonb)
  into v_leads_curso
  from consolidada;

  select coalesce(jsonb_agg(
    jsonb_build_object('nome', canal, 'quantidade', quantidade)
    order by quantidade desc, canal
  ), '[]'::jsonb)
  into v_matriculas_canal
  from (
    select item->>'canal' as canal, count(*)::integer as quantidade
    from jsonb_array_elements(v_matriculas) item
    group by item->>'canal'
  ) q;

  select coalesce(jsonb_agg(
    jsonb_build_object('nome', curso, 'quantidade', quantidade)
    order by quantidade desc, curso
  ), '[]'::jsonb)
  into v_matriculas_curso
  from (
    select curso, count(*)::integer as quantidade
    from jsonb_array_elements(v_matriculas) item
    cross join lateral regexp_split_to_table(coalesce(item->>'cursos', 'Nao informado'), '\s+e\s+') curso
    group by curso
  ) q;

  v_experimentais := coalesce(
    (v_kpis_gerencial->>'denominador_taxa_exp_mat')::integer,
    (v_kpis->>'experimentais_realizadas_presenca_confirmada')::integer,
    0
  );
  v_conversoes := least(
    coalesce(
      (v_kpis_gerencial->>'conversoes_exp_mat_canonicas')::integer,
      (v_kpis->>'conversoes_de_lead')::integer,
      0
    ),
    v_matriculas_total
  );
  v_pendencias := coalesce((v_kpis_gerencial->>'pendencias_taxa_exp_mat')::integer, 0);

  if v_pendencias > 0 then
    v_alertas := v_alertas || jsonb_build_array(
      format('%s pendencia(s) de conciliacao em auditoria', v_pendencias)
    );
  end if;
  if v_leads_snapshot > v_leads_detalhados then
    v_alertas := v_alertas || jsonb_build_array(
      format(
        '%s lead(s) do fechamento sem detalhamento historico de canal/curso',
        v_leads_snapshot - v_leads_detalhados
      )
    );
  end if;

  return jsonb_build_object(
    'schema_version', 1,
    'tipo', 'comercial',
    'competencia', jsonb_build_object(
      'ano', p_ano,
      'mes', p_mes,
      'inicio', v_inicio,
      'fim_exclusivo', v_fim_exclusivo
    ),
    'unidade', jsonb_build_object(
      'id', v_unidade.id,
      'nome', v_unidade.nome,
      'codigo', v_unidade.codigo,
      'hunter', v_unidade.hunter_nome
    ),
    'fontes', jsonb_build_object(
      'comercial', jsonb_build_object('snapshot_id', v_comercial.id, 'payload_hash', v_comercial.payload_hash),
      'relatorio_gerencial', jsonb_build_object('snapshot_id', v_gerencial.id, 'payload_hash', v_gerencial.payload_hash)
    ),
    'resumo', jsonb_build_object(
      'leads', v_leads_snapshot,
      'experimentais', v_experimentais,
      'faltas', coalesce((v_kpis->>'experimentais_no_show')::integer, (v_kpis_gerencial->>'faltaram')::integer, 0),
      'visitas', coalesce((v_kpis->>'visitas')::integer, 0),
      'matriculas', v_matriculas_total,
      'conversoes_exp_mat', v_conversoes,
      'pendencias_conciliacao', v_pendencias,
      'taxa_lead_exp', case when v_leads_snapshot > 0 then round(v_experimentais::numeric / v_leads_snapshot * 100, 1) else 0 end,
      'taxa_exp_mat', case when v_experimentais > 0 then round(v_conversoes::numeric / v_experimentais * 100, 1) else null end,
      'taxa_lead_mat', case when v_leads_snapshot > 0 then round(v_matriculas_total::numeric / v_leads_snapshot * 100, 1) else 0 end,
      'total_passaportes', round(v_total_passaporte, 2),
      'total_parcelas', round(v_total_parcela, 2),
      'ticket_medio_passaporte', case when v_qtd_passaporte > 0 then round(v_total_passaporte / v_qtd_passaporte, 2) else 0 end,
      'ticket_medio_parcela', case when v_qtd_parcela > 0 then round(v_total_parcela / v_qtd_parcela, 2) else 0 end
    ),
    'leads_por_canal', v_leads_canal,
    'leads_por_curso', v_leads_curso,
    'matriculas_por_canal', v_matriculas_canal,
    'matriculas_por_curso', v_matriculas_curso,
    'matriculas', v_matriculas,
    'alertas', v_alertas,
    'capturado_em', v_comercial.capturado_em,
    'fuso', 'America/Sao_Paulo'
  );
end;
$function$;

revoke all on function public.montar_relatorio_comercial_mensal_payload_v1(uuid, integer, integer)
  from public, anon, authenticated, service_role;

create or replace function public.capturar_relatorios_mensais_canonicos_v1(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_unidade record;
  v_dominio text;
  v_fonte text;
  v_payload jsonb;
  v_snapshot_id uuid;
  v_versao integer;
  v_existentes integer;
  v_count integer := 0;
  v_ids jsonb := '[]'::jsonb;
begin
  if auth.role() <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'ACESSO_NEGADO_CAPTURA_RELATORIO_MENSAL';
  end if;
  if p_ano is null or p_mes not between 1 and 12 then
    raise exception 'COMPETENCIA_RELATORIO_MENSAL_INVALIDA';
  end if;

  for v_unidade in
    select u.id, u.nome
    from public.unidades u
    where u.ativo = true
      and (p_unidade_id is null or u.id = p_unidade_id)
    order by u.nome
  loop
    select count(*) into v_existentes
    from public.fechamento_mensal_snapshots s
    where s.ano = p_ano
      and s.mes = p_mes
      and s.escopo = 'unidade'
      and s.unidade_id = v_unidade.id
      and s.dominio in ('relatorio_admin_mensal', 'relatorio_comercial_mensal')
      and s.status in ('aprovado', 'fechado');

    if v_existentes = 2 then
      continue;
    elsif v_existentes <> 0 then
      raise exception 'SNAPSHOT_MENSAL_PARCIAL: unidade % possui % dominio(s)', v_unidade.nome, v_existentes;
    end if;

    for v_dominio, v_fonte, v_payload in
      select * from (values
        (
          'relatorio_admin_mensal'::text,
          'montar_relatorio_admin_mensal_payload_v1'::text,
          public.montar_relatorio_admin_mensal_payload_v1(v_unidade.id, p_ano, p_mes)
        ),
        (
          'relatorio_comercial_mensal'::text,
          'montar_relatorio_comercial_mensal_payload_v1'::text,
          public.montar_relatorio_comercial_mensal_payload_v1(v_unidade.id, p_ano, p_mes)
        )
      ) t(dominio, fonte, payload)
    loop
      select coalesce(max(s.versao), 0) + 1 into v_versao
      from public.fechamento_mensal_snapshots s
      where s.ano = p_ano
        and s.mes = p_mes
        and s.escopo = 'unidade'
        and s.unidade_id = v_unidade.id
        and s.dominio = v_dominio;

      insert into public.fechamento_mensal_snapshots (
        ano, mes, escopo, unidade_id, dominio, versao, status,
        fonte, payload, payload_hash, observacao,
        capturado_por, aprovado_em, aprovado_por
      ) values (
        p_ano, p_mes, 'unidade', v_unidade.id, v_dominio, v_versao,
        'aprovado', v_fonte, v_payload,
        public.hash_jsonb_canonico(v_payload),
        'Payload mensal completo capturado antes do fechamento formal',
        auth.uid(), now(), auth.uid()
      ) returning id into v_snapshot_id;

      insert into public.fechamento_mensal_auditoria (
        snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
      ) values (
        v_snapshot_id, p_ano, p_mes, 'unidade', v_unidade.id,
        'snapshot_gravado',
        jsonb_build_object('dominio', v_dominio, 'fonte', v_fonte, 'versao', v_versao),
        auth.uid()
      );

      v_count := v_count + 1;
      v_ids := v_ids || jsonb_build_array(v_snapshot_id);
    end loop;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'ano', p_ano,
    'mes', p_mes,
    'snapshots_capturados', v_count,
    'snapshot_ids', v_ids
  );
end;
$function$;

revoke all on function public.capturar_relatorios_mensais_canonicos_v1(integer, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.capturar_relatorios_mensais_canonicos_v1(integer, integer, uuid)
  to service_role;

create or replace function public.get_relatorio_mensal_canonico_v1(
  p_tipo text,
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_dominio text;
  v_snapshot public.fechamento_mensal_snapshots%rowtype;
  v_autorizado boolean;
begin
  if lower(coalesce(p_tipo, '')) = 'administrativo' then
    v_dominio := 'relatorio_admin_mensal';
    v_autorizado := public.pode_gerar_relatorio_admin_v1(p_unidade_id);
  elsif lower(coalesce(p_tipo, '')) = 'comercial' then
    v_dominio := 'relatorio_comercial_mensal';
    v_autorizado := public.pode_gerar_relatorio_comercial_v1(p_unidade_id);
  else
    raise exception 'TIPO_RELATORIO_MENSAL_INVALIDO';
  end if;

  if auth.role() <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin')
     and coalesce(v_autorizado, false) is not true then
    raise exception 'ACESSO_NEGADO_RELATORIO_MENSAL';
  end if;

  select * into v_snapshot
  from public.fechamento_mensal_snapshots s
  where s.ano = p_ano
    and s.mes = p_mes
    and s.escopo = 'unidade'
    and s.unidade_id = p_unidade_id
    and s.dominio = v_dominio
    and s.status = 'fechado'
  order by s.versao desc
  limit 1;

  if v_snapshot.id is null then
    raise exception 'RELATORIO_MENSAL_FECHADO_INDISPONIVEL';
  end if;
  if public.hash_jsonb_canonico(v_snapshot.payload) <> v_snapshot.payload_hash then
    raise exception 'SNAPSHOT_MENSAL_HASH_DIVERGENTE';
  end if;

  return jsonb_build_object(
    'snapshot_id', v_snapshot.id,
    'payload_hash', v_snapshot.payload_hash,
    'versao', v_snapshot.versao,
    'status', v_snapshot.status,
    'payload', v_snapshot.payload
  );
end;
$function$;

revoke all on function public.get_relatorio_mensal_canonico_v1(text, uuid, integer, integer)
  from public, anon;
grant execute on function public.get_relatorio_mensal_canonico_v1(text, uuid, integer, integer)
  to authenticated, service_role;

create or replace function public.fechar_competencia_mensal_canonica_v1(
  p_ano integer,
  p_mes integer,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_unidade record;
  v_lote_id uuid := gen_random_uuid();
  v_faltantes integer;
  v_fechadas integer := 0;
  v_snapshots_fechados integer := 0;
  v_result jsonb;
begin
  if auth.role() <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'ACESSO_NEGADO_FECHAMENTO_RELATORIO_MENSAL';
  end if;
  if p_ano is null or p_mes not between 1 and 12
     or nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'FECHAMENTO_RELATORIO_MENSAL_PARAMETROS_INVALIDOS';
  end if;

  for v_unidade in
    select u.id, u.nome
    from public.unidades u
    where u.ativo = true
    order by u.nome
  loop
    select count(*) into v_faltantes
    from (values
      ('alunos_admin'::text),
      ('alunos_executivo'::text),
      ('comercial'::text),
      ('relatorio_gerencial'::text),
      ('relatorio_admin_mensal'::text),
      ('relatorio_comercial_mensal'::text)
    ) esperado(dominio)
    where not exists (
      select 1
      from public.fechamento_mensal_snapshots s
      where s.ano = p_ano
        and s.mes = p_mes
        and s.escopo = 'unidade'
        and s.unidade_id = v_unidade.id
        and s.dominio = esperado.dominio
        and s.status in ('aprovado', 'fechado')
    );

    if v_faltantes > 0 then
      raise exception 'FECHAMENTO_RELATORIO_MENSAL_INCOMPLETO: unidade %, % dominio(s) ausente(s)',
        v_unidade.nome, v_faltantes;
    end if;

    v_result := public.fechar_competencia(
      v_unidade.id,
      p_ano,
      p_mes,
      'relatorios_mensais_canonicos_v1',
      p_motivo,
      v_lote_id
    );
    v_fechadas := v_fechadas + 1;
  end loop;

  with atualizados as (
    update public.fechamento_mensal_snapshots s
    set status = 'fechado',
        fechado_em = now(),
        fechado_por = auth.uid(),
        updated_at = now()
    where s.ano = p_ano
      and s.mes = p_mes
      and s.status = 'aprovado'
    returning s.id, s.unidade_id, s.escopo, s.dominio, s.versao
  ), auditados as (
    insert into public.fechamento_mensal_auditoria (
      snapshot_id, ano, mes, escopo, unidade_id, acao, detalhes, actor_id
    )
    select
      a.id,
      p_ano,
      p_mes,
      a.escopo,
      a.unidade_id,
      'snapshot_fechado',
      jsonb_build_object(
        'dominio', a.dominio,
        'versao', a.versao,
        'fechamento_lote_id', v_lote_id,
        'motivo', p_motivo
      ),
      auth.uid()
    from atualizados a
    returning snapshot_id
  )
  select count(*)::integer into v_snapshots_fechados
  from auditados;

  return jsonb_build_object(
    'ok', true,
    'ano', p_ano,
    'mes', p_mes,
    'fechamento_lote_id', v_lote_id,
    'competencias_fechadas', v_fechadas,
    'snapshots_fechados', v_snapshots_fechados
  );
end;
$function$;

revoke all on function public.fechar_competencia_mensal_canonica_v1(integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.fechar_competencia_mensal_canonica_v1(integer, integer, text)
  to service_role;

comment on function public.get_relatorio_mensal_canonico_v1(text, uuid, integer, integer) is
  'Le exclusivamente payload mensal fechado e imutavel. Nao recalcula competencia historica.';
