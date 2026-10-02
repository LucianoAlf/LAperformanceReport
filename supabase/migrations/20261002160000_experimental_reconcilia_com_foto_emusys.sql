-- supabase/migrations/20261002160000_experimental_reconcilia_com_foto_emusys.sql
--
-- Experimental: UMA linha por aula do Emusys, com a data e a situacao que o Emusys mostra hoje.
--
-- Por que (medido em 02/10/2026): no reagendamento o Emusys MANTEM o id da aula e muda a data;
-- aqui o webhook cria uma linha NOVA (outro emusys_agendamento_id) com a data nova e sem id de
-- aula, e o id fica na linha VELHA, que segue com a data antiga. Dai tres defeitos:
--   * presenca em dobro  - Laura/Isabelly (Recreio) realizadas em 28/09 e 30/09 (uma aula so);
--   * presenca inventada - o caminho de reserva da sync-presenca-emusys confirma a linha nova
--     por "existe aula experimental do professor nesse dia", sem olhar pessoa nem presenca:
--     Bella e Inacio (ausentes no Emusys), Caio 12:00 (agendamento que nao existe mais) e
--     Maria (aula reagendada e CANCELADA no Emusys) contavam como realizadas;
--   * falta antes da aula - Arthur (Recreio) "faltou" em 01/10, aula dele e 08/10.
-- Barra set/26: "Experimentais realizadas" 35 contra 33 da Kailane era exatamente isto.
--
-- Fonte: emusys_experimentais_raw com snapshot_ativo (uma linha ativa por aula, data e
-- situacao atuais, renovada pelo snapshot do relatorio comercial). Regras:
--   A. linha com o id da aula e data diferente do Emusys:
--      - se existe a linha-eco do reagendamento (mesmo lead, data/hora do Emusys, sem id),
--        o id PASSA para ela e a velha vira 'cancelada' (substituida);
--      - senao, a propria linha recebe a data/hora do Emusys.
--   B. linha com o id e data certa: status = situacao do Emusys (presente/faltou/cancelada);
--      'agendada' do Emusys so desfaz realizada/faltou quando a aula foi movida (regra A).
--   C. aula do Emusys sem linha ligada, mas com linha-eco: liga o id na eco.
--   D. linha SEM id, vinda do Emusys (emusys_agendamento_id), nao cancelada, cujo lead tem
--      aula no Emusys a ate 21 dias e NENHUMA aula do Emusys na data/hora dela:
--      'cancelada' (agendamento que o Emusys ja nao tem).
-- Nunca: rebaixar 'convertido'; mexer em status de linha com chamada humana
-- (chamada_status preenchido - vira conflito no log); tocar experimental lancada a mao
-- (sem emusys_agendamento_id). O id so e ligado se a aula existe em aulas_emusys como
-- experimental (senao trg_experimental_normaliza_referencia_aula o descartaria em silencio).
--
-- Carimbo por execucao em automacao_log (evento 'experimental_reconcilia_emusys'): run id,
-- modo, janela, contagens por acao e cada id tocado. Checagem:
--   select created_at, status, detalhes->'contagem' from automacao_log
--   where evento = 'experimental_reconcilia_emusys' order by created_at desc limit 5;

create or replace function public.fn_reconciliar_experimentais_com_emusys_v1(
  p_unidade_id uuid default null,
  p_desde date default null,
  p_aplicar boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_desde date := coalesce(p_desde, (now() at time zone 'America/Sao_Paulo')::date - 21);
  v_run text := gen_random_uuid()::text;
  v_acoes jsonb := '[]'::jsonb;
  v_tocados int[] := '{}';
  e record; c record; s record; r record;
  v_status text;
  v_mudar_status boolean;
begin
  for e in
    select x.unidade_id, x.emusys_aula_id, x.emusys_lead_id, x.data_aula, x.horario_aula, x.situacao_operacional
    from public.emusys_experimentais_raw x
    where x.snapshot_ativo
      and x.emusys_aula_id is not null
      and coalesce(x.emusys_lead_id, 0) > 0
      and x.data_aula >= v_desde
      and (p_unidade_id is null or x.unidade_id = p_unidade_id)
      and exists (select 1 from public.aulas_emusys ae
                  where ae.unidade_id = x.unidade_id and ae.emusys_id = x.emusys_aula_id
                    and lower(btrim(coalesce(ae.categoria, ''))) = 'experimental')
      -- aula com um participante so na foto (hoje: todas)
      and not exists (select 1 from public.emusys_experimentais_raw y
                      where y.snapshot_ativo and y.unidade_id = x.unidade_id
                        and y.emusys_aula_id = x.emusys_aula_id and y.emusys_lead_id <> x.emusys_lead_id)
    order by x.unidade_id, x.data_aula, x.emusys_aula_id
  loop
    v_status := case e.situacao_operacional
      when 'presente' then 'experimental_realizada'
      when 'faltou' then 'experimental_faltou'
      when 'cancelada' then 'cancelada'
      when 'agendada' then 'experimental_agendada'
    end;

    select le.id, le.status, le.data_experimental, le.horario_experimental, le.chamada_status
      into c
    from public.lead_experimentais le
    where le.unidade_id = e.unidade_id and le.emusys_aula_id = e.emusys_aula_id;

    select le.id, le.status, le.chamada_status
      into s
    from public.lead_experimentais le
    where le.unidade_id = e.unidade_id
      and le.emusys_lead_id = e.emusys_lead_id
      and le.emusys_aula_id is null
      and le.data_experimental = e.data_aula
      and le.horario_experimental = e.horario_aula
    order by (le.status <> 'cancelada') desc, le.id desc
    limit 1;

    if c.id is not null
       and (c.data_experimental, c.horario_experimental) is distinct from (e.data_aula, e.horario_aula) then
      if s.id is not null then
        -- A1: o id passa para a linha-eco; a velha fica como substituida
        v_acoes := v_acoes || jsonb_build_object('acao', 'transferida', 'aula', e.emusys_aula_id,
          'de', c.id, 'para', s.id, 'data_emusys', e.data_aula, 'data_antiga', c.data_experimental,
          'status_de', c.status, 'status_eco_antes', s.status, 'status_novo', v_status);
        v_tocados := v_tocados || c.id || s.id;
        if p_aplicar then
          update public.lead_experimentais
            set emusys_aula_id = null, status = 'cancelada', updated_at = now()
          where id = c.id;
          update public.lead_experimentais
            set emusys_aula_id = e.emusys_aula_id,
                status = case when s.chamada_status is not null then status
                              when status = 'convertido' and v_status = 'experimental_realizada' then status
                              else v_status end,
                etapa_pipeline_id = case v_status when 'experimental_realizada' then 7
                                                  when 'experimental_faltou' then 9
                                                  else etapa_pipeline_id end,
                updated_at = now()
          where id = s.id;
        end if;
      else
        -- A2: a propria linha recebe a data do Emusys
        v_acoes := v_acoes || jsonb_build_object('acao', 'data_atualizada', 'aula', e.emusys_aula_id,
          'id', c.id, 'data_antiga', c.data_experimental, 'hora_antiga', c.horario_experimental,
          'data_emusys', e.data_aula, 'hora_emusys', e.horario_aula,
          'status_de', c.status, 'status_novo', v_status);
        v_tocados := v_tocados || c.id;
        if p_aplicar then
          update public.lead_experimentais
            set data_experimental = e.data_aula,
                horario_experimental = e.horario_aula,
                status = case when chamada_status is not null then status
                              when status = 'convertido' and v_status = 'experimental_realizada' then status
                              else v_status end,
                etapa_pipeline_id = case v_status when 'experimental_realizada' then 7
                                                  when 'experimental_faltou' then 9
                                                  else etapa_pipeline_id end,
                updated_at = now()
          where id = c.id;
        end if;
      end if;
      continue;
    end if;

    if c.id is not null then
      -- B: data certa; status segue a situacao do Emusys (agendada nao desfaz nada aqui)
      v_mudar_status := v_status <> 'experimental_agendada'
        and v_status is distinct from c.status
        and not (c.status = 'convertido' and v_status = 'experimental_realizada');
      if v_mudar_status and c.chamada_status is not null then
        v_acoes := v_acoes || jsonb_build_object('acao', 'conflito_chamada_humana', 'aula', e.emusys_aula_id,
          'id', c.id, 'status', c.status, 'emusys', v_status, 'chamada', c.chamada_status);
      elsif v_mudar_status then
        v_acoes := v_acoes || jsonb_build_object('acao', 'status_corrigido', 'aula', e.emusys_aula_id,
          'id', c.id, 'status_de', c.status, 'status_novo', v_status);
        v_tocados := v_tocados || c.id;
        if p_aplicar then
          update public.lead_experimentais
            set status = v_status,
                etapa_pipeline_id = case v_status when 'experimental_realizada' then 7
                                                  when 'experimental_faltou' then 9
                                                  else etapa_pipeline_id end,
                updated_at = now()
          where id = c.id;
        end if;
      end if;
      -- linha-eco no mesmo horario da linha ligada = duplicata
      if s.id is not null and s.status <> 'cancelada' and s.id <> c.id then
        v_acoes := v_acoes || jsonb_build_object('acao', 'eco_duplicada', 'aula', e.emusys_aula_id,
          'id', s.id, 'status_de', s.status, 'linha_da_aula', c.id);
        v_tocados := v_tocados || s.id;
        if p_aplicar then
          update public.lead_experimentais set status = 'cancelada', updated_at = now() where id = s.id;
        end if;
      end if;
      continue;
    end if;

    if s.id is not null then
      -- C: aula sem linha ligada; liga na eco
      v_acoes := v_acoes || jsonb_build_object('acao', 'aula_vinculada', 'aula', e.emusys_aula_id,
        'id', s.id, 'status_de', s.status, 'status_novo', v_status);
      v_tocados := v_tocados || s.id;
      if p_aplicar then
        update public.lead_experimentais
          set emusys_aula_id = e.emusys_aula_id,
              status = case when chamada_status is not null then status
                            when status = 'convertido' and v_status = 'experimental_realizada' then status
                            when v_status = 'experimental_agendada' then status
                            else v_status end,
              etapa_pipeline_id = case v_status when 'experimental_realizada' then 7
                                                when 'experimental_faltou' then 9
                                                else etapa_pipeline_id end,
              updated_at = now()
        where id = s.id;
      end if;
    end if;
  end loop;

  -- D: agendamento que o Emusys ja nao tem
  for r in
    select le.id, le.status, le.data_experimental, le.horario_experimental, le.emusys_lead_id, le.chamada_status
    from public.lead_experimentais le
    where le.emusys_aula_id is null
      and le.emusys_agendamento_id is not null
      and coalesce(le.emusys_lead_id, 0) > 0
      and le.status not in ('cancelada', 'convertido')
      and le.data_experimental between v_desde and v_hoje
      and (p_unidade_id is null or le.unidade_id = p_unidade_id)
      and not (le.id = any(v_tocados))
      and not exists (select 1 from public.emusys_experimentais_raw x
                      where x.snapshot_ativo and x.unidade_id = le.unidade_id
                        and x.emusys_lead_id = le.emusys_lead_id
                        and x.data_aula = le.data_experimental
                        and x.horario_aula = le.horario_experimental)
      and exists (select 1 from public.emusys_experimentais_raw x
                  where x.snapshot_ativo and x.unidade_id = le.unidade_id
                    and x.emusys_lead_id = le.emusys_lead_id
                    and x.emusys_aula_id is not null
                    and x.data_aula between le.data_experimental - 21 and le.data_experimental + 21)
    order by le.id
  loop
    if r.chamada_status is not null then
      v_acoes := v_acoes || jsonb_build_object('acao', 'conflito_chamada_humana', 'id', r.id,
        'status', r.status, 'emusys', 'sem_aula', 'chamada', r.chamada_status);
      continue;
    end if;
    v_acoes := v_acoes || jsonb_build_object('acao', 'sem_aula_no_emusys', 'id', r.id,
      'data', r.data_experimental, 'hora', r.horario_experimental, 'status_de', r.status);
    if p_aplicar then
      update public.lead_experimentais set status = 'cancelada', updated_at = now() where id = r.id;
    end if;
  end loop;

  insert into public.automacao_log (aluno_nome, evento, acao, status, workflow_id, execution_id, detalhes)
  values ('(rotina)', 'experimental_reconcilia_emusys', case when p_aplicar then 'aplicado' else 'ensaio' end, 'ok',
          'fn_reconciliar_experimentais_com_emusys_v1', v_run,
          jsonb_build_object('unidade_id', p_unidade_id, 'desde', v_desde, 'aplicar', p_aplicar,
            'contagem', (select coalesce(jsonb_object_agg(a, n), '{}'::jsonb)
                         from (select x->>'acao' a, count(*) n from jsonb_array_elements(v_acoes) x group by 1) z),
            'acoes', v_acoes));

  return jsonb_build_object('run', v_run, 'aplicar', p_aplicar, 'desde', v_desde,
    'contagem', (select coalesce(jsonb_object_agg(a, n), '{}'::jsonb)
                 from (select x->>'acao' a, count(*) n from jsonb_array_elements(v_acoes) x group by 1) z),
    'acoes', v_acoes);
end;
$$;

revoke all on function public.fn_reconciliar_experimentais_com_emusys_v1(uuid, date, boolean) from public, anon, authenticated;
grant execute on function public.fn_reconciliar_experimentais_com_emusys_v1(uuid, date, boolean) to service_role;

-- Roda no tick que ja existe (cron 95 `reconciliar-experimental-aulas`, a cada 15 min), ANTES
-- das duas portas de vinculo do app, para elas ja verem a data certa. Custo medido: ~100 ms
-- por rodada (~10 s/dia). Falha aqui nao derruba as portas antigas, mas fica no
-- automacao_log com status 'erro' e na resposta do tick.
do $$
declare
  v_def text;
  v_a text := '  v_natural  jsonb;
begin
';
  v_b text := '  v_natural := public.fn_reconciliar_experimental_aulas(p_dias, p_limite);

  return jsonb_build_object(
    ''ok'', true,
';
begin
  select pg_get_functiondef('public.fn_reconciliar_experimental_tick(integer,integer)'::regprocedure) into v_def;
  if position('fn_reconciliar_experimentais_com_emusys_v1' in v_def) > 0 then
    raise exception 'tick ja chama o reconciliador';
  end if;
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then raise exception 'ancora A do tick'; end if;
  if (length(v_def) - length(replace(v_def, v_b, ''))) / length(v_b) <> 1 then raise exception 'ancora B do tick'; end if;

  v_def := replace(v_def, v_a, '  v_natural  jsonb;
  v_emusys   jsonb;
begin
  -- Experimental = foto do Emusys (data reagendada, presenca, cancelamento). Primeiro,
  -- para as portas de vinculo abaixo ja lerem a data certa (20261002160000).
  begin
    v_emusys := public.fn_reconciliar_experimentais_com_emusys_v1(null, null, true) - ''acoes'';
  exception when others then
    v_emusys := jsonb_build_object(''ok'', false, ''erro'', sqlerrm, ''sqlstate'', sqlstate);
    insert into public.automacao_log (aluno_nome, evento, acao, status, workflow_id, execution_id, detalhes)
    values (''(rotina)'', ''experimental_reconcilia_emusys'', ''falhou'', ''erro'',
            ''fn_reconciliar_experimental_tick'', now()::text, v_emusys);
  end;

');
  v_def := replace(v_def, v_b, '  v_natural := public.fn_reconciliar_experimental_aulas(p_dias, p_limite);

  return jsonb_build_object(
    ''ok'', true,
    ''foto_emusys'', v_emusys,
');
  execute v_def;
end $$;

-- Correcao de setembro em diante (ensaio 02/10: Barra realizadas 35 -> 33, Recreio 47 -> 43,
-- CG 44 sem mudanca; conversao exp->mat das 3 sem mudanca). Mes fechado NAO e regravado.
do $$
declare v_r jsonb; v_n int;
begin
  v_r := public.fn_reconciliar_experimentais_com_emusys_v1(null, '2026-09-01', true);
  raise notice 'reconciliacao 01/09+: %', v_r->'contagem';

  select count(*) filter (where status in ('experimental_realizada', 'convertido')) into v_n
  from public.lead_experimentais
  where unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' and data_experimental between '2026-09-01' and '2026-09-30';
  if v_n <> 33 then raise exception 'Barra set/26: esperava 33 realizadas, ficou %', v_n; end if;

  if (public.fn_reconciliar_experimentais_com_emusys_v1(null, '2026-09-01', false)->'contagem') <> '{}'::jsonb then
    raise exception 'segunda rodada ainda acha o que fazer';
  end if;
end $$;

delete from public.conciliacao_experimentais_v2_cache;
