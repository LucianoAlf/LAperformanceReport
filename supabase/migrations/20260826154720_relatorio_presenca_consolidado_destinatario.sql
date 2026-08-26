-- Relatorio de presenca consolidado para destinatario individual (Fabi, Sucesso do Aluno).
-- Spec: docs/superpowers/specs/2026-08-26-relatorio-presenca-consolidado-design.md

-- 1) CORRECAO DE SEGURANCA (achado nesta frente, nao e parte do pedido)
-- fn_texto_relatorio_presenca e SECURITY DEFINER e devolve nome de aluno, professor,
-- curso e horario. Estava executavel por anon e por PUBLIC: comprovado HTTP 200 via
-- PostgREST usando a anon key, que e publica (vai no bundle do front).
revoke execute on function public.fn_texto_relatorio_presenca(uuid, date) from anon;
revoke execute on function public.fn_texto_relatorio_presenca(uuid, date) from public;

-- 2) DDL
-- A linha consolidada nao pertence a nenhuma unidade. Relaxar NOT NULL e permissivo:
-- nenhuma escrita existente passa a falhar. O worker seleciona unidade_id mas nao o usa.
alter table public.fila_relatorios_sol_hermes alter column unidade_id drop not null;

-- Quem envia passa a ser declarado pelo destinatario. NULL = comportamento atual
-- (bridge nativa da Sol com fallback); preenchido = envio direto por aquela caixa.
alter table public.whatsapp_destinatarios_relatorio
  add column if not exists caixa_id integer references public.whatsapp_caixas(id);

comment on column public.whatsapp_destinatarios_relatorio.caixa_id is
  'Caixa de WhatsApp que envia para este destinatario. NULL = rota padrao do worker '
  '(bridge nativa da Sol, com fallback UAZAPI). Preenchido = envio direto por essa '
  'caixa, sem fallback cruzado -- o remetente segue o departamento de quem recebe.';

-- 3) TEXTO CONSOLIDADO
-- Reusa fn_presenca_pendencias_do_dia: a regra de o que e pendencia continua existindo
-- em um lugar so. Itera as mesmas unidades que a fn_enfileirar descobre, para o
-- consolidado ser exatamente a soma do que as adms receberam.
create or replace function public.fn_texto_relatorio_presenca_consolidado(p_data date)
 returns text
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_u record;
  v_linha record;
  v_dia text;
  v_corpo text := '';
  v_prof text;
  v_sem int;
  v_div int;
  v_alguma_unidade boolean := false;
begin
  v_dia := to_char(p_data, 'DD') || '/' ||
    case extract(month from p_data)
      when 1 then 'janeiro' when 2 then 'fevereiro' when 3 then 'março'
      when 4 then 'abril'   when 5 then 'maio'      when 6 then 'junho'
      when 7 then 'julho'   when 8 then 'agosto'    when 9 then 'setembro'
      when 10 then 'outubro' when 11 then 'novembro' else 'dezembro'
    end || '/' || to_char(p_data, 'YYYY');

  for v_u in
    select x.unidade_id, x.unidade_nome
      from (
        select distinct on (f.unidade_id)
               f.unidade_id, f.unidade_nome, f.enviada_em
          from public.fila_relatorios_sol_hermes f
         where f.grupo_nome ilike 'RELAT%DI%RIOS%'
           and f.status = 'enviada'
           and f.jid is not null
           and f.unidade_id is not null
         order by f.unidade_id, f.enviada_em desc
      ) x
     order by x.unidade_nome
  loop
    -- Mesma guarda da versao por unidade: sem aula no dia, nao ha relatorio a dar.
    if not exists (
      select 1 from public.aulas_emusys ae
       where ae.unidade_id = v_u.unidade_id
         and ae.data_aula = p_data
         and ae.data_hora_fim < now()
         and not coalesce(ae.cancelada, false)
         and ae.professor_id is not null
    ) then
      continue;
    end if;

    v_alguma_unidade := true;

    select count(*) filter (where motivo = 'sem_resposta'),
           count(*) filter (where motivo = 'divergencia')
      into v_sem, v_div
      from public.fn_presenca_pendencias_do_dia(v_u.unidade_id, p_data);

    v_corpo := v_corpo || E'\n' || '🏢 *' || upper(v_u.unidade_nome) || '*' || E'\n';

    if v_sem = 0 and v_div = 0 then
      v_corpo := v_corpo || '✅ Tudo fechado.' || E'\n';
      continue;
    end if;

    if v_sem > 0 then
      v_corpo := v_corpo || '⚠️ *SEM PRESENÇA E SEM FALTA* (' || v_sem || ')' || E'\n'
              || '_ninguém fechou a chamada — não é falta do aluno_' || E'\n';
      v_prof := '';
      for v_linha in
        select * from public.fn_presenca_pendencias_do_dia(v_u.unidade_id, p_data)
         where motivo = 'sem_resposta'
      loop
        if v_linha.professor_nome is distinct from v_prof then
          v_prof := v_linha.professor_nome;
          v_corpo := v_corpo || E'\n' || '👤 *' || v_prof || '*' || E'\n';
        end if;
        v_corpo := v_corpo || '• ' || v_linha.hora || ' — ' || v_linha.aluno_nome
                || ' _(' || v_linha.curso_nome || ')_' || E'\n';
      end loop;
    end if;

    if v_div > 0 then
      v_corpo := v_corpo || E'\n' || '🔀 *RESPOSTAS QUE NÃO BATEM* (' || v_div || ')' || E'\n'
              || '_o mesmo aluno na mesma aula com duas respostas — validem qual vale_' || E'\n';
      v_prof := '';
      for v_linha in
        select * from public.fn_presenca_pendencias_do_dia(v_u.unidade_id, p_data)
         where motivo = 'divergencia'
      loop
        if v_linha.professor_nome is distinct from v_prof then
          v_prof := v_linha.professor_nome;
          v_corpo := v_corpo || E'\n' || '👤 *' || v_prof || '*' || E'\n';
        end if;
        v_corpo := v_corpo || '• ' || v_linha.hora || ' — ' || v_linha.aluno_nome || E'\n'
                || '   ↳ ' || coalesce(v_linha.detalhe, '?') || E'\n';
      end loop;
    end if;
  end loop;

  -- Nenhuma unidade abriu no dia: nao ha relatorio. Quem chama nao enfileira nada.
  if not v_alguma_unidade then
    return null;
  end if;

  return '━━━━━━━━━━━━━━━━━━━━━━' || E'\n'
      || '📋 *PRESENÇA — PENDÊNCIAS*' || E'\n'
      || '📆 ' || v_dia || E'\n'
      || '━━━━━━━━━━━━━━━━━━━━━━' || E'\n'
      || v_corpo
      || E'\n' || '━━━━━━━━━━━━━━━━━━━━━━' || E'\n'
      || '_Corrijam no app ou na agenda. O que ficar sem resposta continua '
      || 'aparecendo amanhã._' || E'\n';
end;
$function$;

-- Funcao nova nasce com o ALTER DEFAULT PRIVILEGES do schema, que concede EXECUTE a anon.
revoke execute on function public.fn_texto_relatorio_presenca_consolidado(date) from anon;
revoke execute on function public.fn_texto_relatorio_presenca_consolidado(date) from public;
grant execute on function public.fn_texto_relatorio_presenca_consolidado(date) to service_role;
