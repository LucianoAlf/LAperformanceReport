-- Texto do resumo mensal de presenca (WhatsApp, destinatario: Fabi).
-- Agrupa por ALUNO e nao por data, de proposito: a leitura dela e "quem ficou sem
-- registro no mes", e a reincidencia e o que alimenta a penalidade do Fideliza+.
-- O rodape declara a cobertura SEMPRE: sem isso, "0 pendencias" fica indistinguivel
-- de "nao consegui avaliar o mes".
create or replace function public.fn_texto_resumo_mensal_presenca_v1(
  p_ano integer, p_mes integer
)
returns text
language plpgsql stable security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_res jsonb;
  v_u jsonb;
  v_txt text;
  v_bloco text;
  v_aluno record;
  v_total_rede integer := 0;
  v_cobertura_incompleta boolean := false;
begin
  v_res := public.fn_presenca_resumo_mensal_v1(p_ano, p_mes, null);

  v_txt := 'RESUMO MENSAL DE PRESENCA' || E'\n'
    || 'Competencia ' || (v_res ->> 'competencia') || E'\n'
    || 'Alunos que ficaram sem presenca e sem falta no mes.' || E'\n';

  if coalesce((v_res ->> 'mes_parcial')::boolean, false) then
    v_txt := v_txt || '(mes ainda em andamento - ate '
      || to_char((v_res ->> 'periodo_fim')::date, 'DD/MM') || ')' || E'\n';
  end if;

  for v_u in select value from jsonb_array_elements(v_res -> 'unidades') loop
    v_total_rede := v_total_rede + (v_u ->> 'total')::integer;
    if (v_u -> 'cobertura' ->> 'completa')::boolean is not true then
      v_cobertura_incompleta := true;
    end if;

    v_bloco := E'\n' || '--- ' || upper(v_u ->> 'unidade_nome') || ' ---' || E'\n';

    if (v_u ->> 'total')::integer = 0 then
      v_bloco := v_bloco || 'Nada pendente. Todas as chamadas do mes foram fechadas.' || E'\n';
    else
      v_bloco := v_bloco
        || (v_u ->> 'total') || ' ocorrencia(s) em '
        || (v_u ->> 'alunos_distintos') || ' aluno(s)';
      if (v_u ->> 'reincidentes')::integer > 0 then
        v_bloco := v_bloco || ' - ' || (v_u ->> 'reincidentes') || ' com mais de uma';
      end if;
      v_bloco := v_bloco || E'\n';

      for v_aluno in
        select i ->> 'aluno_nome' as nome,
               count(*)::int as vezes,
               string_agg(distinct i ->> 'professor_nome', ', ') as profs,
               string_agg((i ->> 'data') || ' ' || (i ->> 'hora')
                 || ' ' || (i ->> 'curso_nome')
                 || case when i ->> 'tipo' = 'divergencia' then ' [respostas divergentes]' else '' end,
                 E'\n     ' order by (i ->> 'data_iso')::date) as linhas
        from jsonb_array_elements(v_u -> 'itens') i
        group by i ->> 'aluno_nome'
        order by count(*) desc, i ->> 'aluno_nome'
      loop
        v_bloco := v_bloco || E'\n' || '- ' || v_aluno.nome;
        if v_aluno.vezes > 1 then
          v_bloco := v_bloco || '  (' || v_aluno.vezes || 'x no mes)';
        end if;
        v_bloco := v_bloco || E'\n     ' || v_aluno.linhas || E'\n';
      end loop;
    end if;

    -- cobertura por unidade: so aparece quando ha o que declarar
    if (v_u -> 'cobertura' ->> 'completa')::boolean is not true then
      v_bloco := v_bloco || E'\n' || '! Avaliei '
        || (v_u -> 'cobertura' ->> 'dias_avaliados') || ' de '
        || (v_u -> 'cobertura' ->> 'dias_operacionais') || ' dias com aula. '
        || 'Os demais nao puderam ser conferidos (sincronizacao do Emusys incompleta), '
        || 'entao a lista acima pode estar incompleta.' || E'\n';
    end if;

    v_txt := v_txt || v_bloco;
  end loop;

  v_txt := v_txt || E'\n' || '========================' || E'\n';
  if v_total_rede = 0 and not v_cobertura_incompleta then
    v_txt := v_txt || 'Mes fechado sem pendencia nenhuma nas tres unidades.' || E'\n';
  else
    v_txt := v_txt || 'Total na rede: ' || v_total_rede || ' ocorrencia(s).' || E'\n';
  end if;
  v_txt := v_txt || 'Gerado em '
    || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || E'\n';

  return v_txt;
end;
$function$;

revoke all on function public.fn_texto_resumo_mensal_presenca_v1(integer, integer) from public, anon;
grant execute on function public.fn_texto_resumo_mensal_presenca_v1(integer, integer) to authenticated, service_role;;
