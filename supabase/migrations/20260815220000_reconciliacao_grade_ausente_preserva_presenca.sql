-- Uma marcacao humana terminal e historico de presenca, nao prova de que a
-- ocorrencia continua viva na grade atual do Emusys. A fotografia completa da
-- origem continua mandando na existencia operacional da aula; a decisao humana
-- fica preservada em aluno_presenca.

alter function public.reconciliar_grade_snapshot_emusys_v1(
  uuid, date, date, jsonb, boolean
) rename to reconciliar_grade_snapshot_emusys_v1_base;

create function public.reconciliar_grade_snapshot_emusys_v1(
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_snapshot jsonb,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_resultado_base jsonb;
  v_detalhe jsonb;
  v_aulas_com_marcacao integer[] := array[]::integer[];
  v_aulas_previstas integer := 0;
  v_aulas_ja_previstas integer := 0;
  v_aulas_aplicadas integer := 0;
begin
  v_resultado_base := public.reconciliar_grade_snapshot_emusys_v1_base(
    p_unidade_id,
    p_data_inicio,
    p_data_fim,
    p_snapshot,
    p_dry_run
  );

  -- A rotina base valida janela e fotografia antes de qualquer decisao. Uma
  -- foto invalida ou vazia deve continuar falhando fechada, sem este complemento.
  if coalesce(v_resultado_base ->> 'status', '') <> 'ok' then
    return v_resultado_base;
  end if;

  with
  snapshot as (
    select distinct (item.valor ->> 'emusys_id')::integer as emusys_id
    from jsonb_array_elements(p_snapshot) as item(valor)
  ),
  candidatas as (
    select a.id
    from public.aulas_emusys a
    where a.unidade_id = p_unidade_id
      and a.categoria = 'normal'
      and coalesce(a.cancelada, false) = false
      and a.data_aula between p_data_inicio and p_data_fim
      and not exists (
        select 1
        from snapshot s
        where s.emusys_id = a.emusys_id
      )
      and exists (
        select 1
        from public.aluno_presenca ap
        where ap.aula_emusys_id = a.id
          and public.fn_presenca_fecha_chamada(
            coalesce(
              ap.status_presenca,
              case ap.status
                when 'presente' then 'presente'
                when 'ausente' then 'falta'
                else null
              end
            ),
            ap.respondido_por
          )
      )
    for update of a
  )
  select coalesce(array_agg(c.id), array[]::integer[])
    into v_aulas_com_marcacao
  from candidatas c;

  v_aulas_previstas := cardinality(v_aulas_com_marcacao);

  if not p_dry_run and v_aulas_previstas > 0 then
    update public.aulas_emusys a
       set cancelada = true,
           cancelada_origem = 'sync_ausente_emusys',
           cancelada_motivo = 'Aula ausente no Emusys; presenca humana preservada',
           cancelada_em = now()
     where a.id = any(v_aulas_com_marcacao)
       and a.unidade_id = p_unidade_id
       and coalesce(a.cancelada, false) = false;
    get diagnostics v_aulas_aplicadas = row_count;
  end if;

  if v_aulas_previstas > 0 then
    -- A rotina-base pode ter classificado a aula como cancelavel e, antes do
    -- UPDATE dela, uma marcacao humana terminal ter sido gravada. Nesse caso
    -- ela fica no detalhe como "cancelar_aula_ausente", mas nao e aplicada
    -- pela base. Este complemento a cancela com a marcacao preservada sem
    -- contabilizar duas vezes a mesma aula no resumo retornado.
    select count(*)::integer
      into v_aulas_ja_previstas
    from jsonb_array_elements(coalesce(v_resultado_base -> 'detalhe', '[]'::jsonb))
      as elemento(valor)
    where elemento.valor ->> 'vinculo_id' is null
      and (elemento.valor ->> 'aula_local_id')::integer = any(v_aulas_com_marcacao)
      and elemento.valor ->> 'acao' = 'cancelar_aula_ausente';

    select coalesce(
      jsonb_agg(
        case
          when elemento.valor ->> 'acao' in ('preservar_marcacao_fechada', 'cancelar_aula_ausente')
           and elemento.valor ->> 'vinculo_id' is null
           and (elemento.valor ->> 'aula_local_id')::integer = any(v_aulas_com_marcacao)
            then jsonb_set(
              elemento.valor,
              '{acao}',
              '"cancelar_aula_ausente_preservando_marcacao"'::jsonb
            )
          else elemento.valor
        end
        order by elemento.ordem
      ),
      '[]'::jsonb
    )
    into v_detalhe
    from jsonb_array_elements(coalesce(v_resultado_base -> 'detalhe', '[]'::jsonb))
      with ordinality as elemento(valor, ordem);

    v_resultado_base := jsonb_set(v_resultado_base, '{detalhe}', v_detalhe, true);
    v_resultado_base := jsonb_set(
      v_resultado_base,
      '{aulas_canceladas}',
      to_jsonb(
        coalesce((v_resultado_base ->> 'aulas_canceladas')::integer, 0)
        + v_aulas_previstas
        - v_aulas_ja_previstas
      ),
      true
    );
    v_resultado_base := jsonb_set(
      v_resultado_base,
      '{aulas_canceladas_aplicadas}',
      to_jsonb(coalesce((v_resultado_base ->> 'aulas_canceladas_aplicadas')::integer, 0) + v_aulas_aplicadas),
      true
    );
    v_resultado_base := jsonb_set(
      v_resultado_base,
      '{alteracoes_aplicadas}',
      to_jsonb(coalesce((v_resultado_base ->> 'alteracoes_aplicadas')::integer, 0) + v_aulas_aplicadas),
      true
    );
  end if;

  return v_resultado_base;
end;
$function$;

revoke all on function public.reconciliar_grade_snapshot_emusys_v1(
  uuid, date, date, jsonb, boolean
) from public, anon, authenticated;
grant execute on function public.reconciliar_grade_snapshot_emusys_v1(
  uuid, date, date, jsonb, boolean
) to service_role;

comment on function public.reconciliar_grade_snapshot_emusys_v1(
  uuid, date, date, jsonb, boolean
) is
  'Compara fotografia completa do Emusys com a grade normal de hoje/futuro. Aula ausente e cancelada operacionalmente mesmo com marcacao humana terminal; a presenca e o roster historico nao sao apagados.';

-- Remediacao cirurgica confirmada pela grade do Emusys em 15/08/2026. As duas
-- ocorrencias de Matheus Sterque nao existem mais no sabado; manter a falta de
-- secretaria vinculada a 515512 e essencial para a trilha de auditoria.
update public.aulas_emusys a
   set cancelada = true,
       cancelada_origem = 'sync_ausente_emusys',
       cancelada_motivo = 'Aula ausente no Emusys; presenca humana preservada',
       cancelada_em = coalesce(a.cancelada_em, now())
  from public.unidades u
 where a.unidade_id = u.id
   and u.nome = 'Campo Grande'
   and a.data_aula = date '2026-08-15'
   and a.emusys_id in (515512, 680696)
   and (
     coalesce(a.cancelada, false) = false
     or a.cancelada_origem is null
   );
