-- 3o ANDAR da vertical COMERCIAL — a pauta passa a entender FATIA.
--
-- Tres defeitos que a fatia comercial expos na `radar_pauta_v1`:
--
-- 1. NAO FILTRAVA DOMINIO. Um destinatario da Sol com R8 na lista pegaria
--    tambem o R8 COMERCIAL (lead sem resposta) — a mesma regra existe nos dois
--    mundos, e era exatamente esse o defeito que motivou as fatias.
--
-- 2. NAO RESOLVIA NOME DE LEAD. Havia `left join alunos` e `left join
--    professores`, mas nao `leads` — entao TODO sinal comercial sairia sem
--    nome na mensagem.
--
-- 3. ORDENAVA ERRADO PARA O COMERCIAL. A urgencia vinha de
--    `evidencia->>'dias_ate_vencer'`, que sinal comercial nao tem. Minha
--    primeira tentativa usou `-dias_parado`, colocando o MAIS PARADO primeiro —
--    e o ensaio mostrou a mensagem abrindo com "113 dias sem desfecho". Esta
--    errado: retencao ordena por prazo apertando, mas COMERCIAL ordena por
--    FRESCOR. Lead que fez a experimental ha 113 dias esta frio; quem fez ha 3
--    e onde esta a conversao. Corrigido para `+dias_parado` (ascendente), e a
--    mensagem passou a abrir com 6 e 7 dias.
--
-- Ensaio dos tres agentes depois da mudanca, sem regressao:
--   lia (guardia) 5 entregues / 30 na fila
--   sol (secretaria) 8 / 10
--   mila (consultora) 24 / 364
--
-- ⚠️ Tudo volta DESLIGADO (`ativo=false`). Fase 0: nada chega a ninguem sem OK.

CREATE OR REPLACE FUNCTION public.radar_pauta_v1(p_agente text, p_registrar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_turno text := to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM-DD') ||
                  case when extract(hour from now() at time zone 'America/Sao_Paulo') < 13
                       then '-manha' else '-tarde' end;
  v_out jsonb;
begin
  with dest as (select * from radar_destinatarios where agente=p_agente and ativo),
  cand as (
    select d.id dest_id, d.nome dest_nome, d.papel, d.canal, d.camada, d.teto_por_turno,
           s.id sinal_id, s.regra_codigo, s.severidade, s.contexto, s.orientacao, s.evidencia,
           coalesce(a.nome, pr.nome, le.nome, s.evidencia->>'nomes') alvo_nome,
           u.nome unidade_nome, p.aprendizado, p.janela_dias, s.detectado_em,
           d.nome||'|'||s.id||'|'||v_turno chave,
           -- URGÊNCIA REAL: dias até o contrato vencer ou o aviso expirar
           coalesce((s.evidencia->>'dias_ate_vencer')::int,
                    (s.evidencia->>'dias_parado')::int, 999) urgencia_dias,
           row_number() over (partition by d.id order by
             case s.severidade when 'critico' then 1 when 'alto' then 2 when 'atencao' then 3 else 4 end,
             coalesce((s.evidencia->>'dias_ate_vencer')::int,
                    (s.evidencia->>'dias_parado')::int, 999),
             s.detectado_em) rn,
           count(*) over (partition by d.id) total_fila
    from dest d
    join radar_sinais s
      on s.status in ('aberto','triado') and s.canonico
     and s.regra_codigo = any(d.regras)
     and s.dominio = d.dominio
     and (d.unidade_id is null or s.unidade_id=d.unidade_id)
     and case s.severidade when 'critico' then 4 when 'alto' then 3 when 'atencao' then 2 else 1 end
         >= case d.severidade_min when 'critico' then 4 when 'alto' then 3 when 'atencao' then 2 else 1 end
    left join alunos a on s.entidade_tipo='aluno' and a.id=s.entidade_id
    left join professores pr on s.entidade_tipo='professor' and pr.id=s.entidade_id
    left join leads le on s.entidade_tipo='lead' and le.id=s.entidade_id
    left join unidades u on u.id=s.unidade_id
    left join radar_padroes p on p.codigo=s.padrao_codigo and p.ativo
    where not exists (select 1 from radar_entregas e
                      where e.chave_idem = d.nome||'|'||s.id||'|'||v_turno)
  ),
  no_teto as (select * from cand where rn <= teto_por_turno)
  select jsonb_build_object(
    'ok', true, 'agente', p_agente, 'turno', v_turno, 'gerado_em', now(),
    'destinatarios', coalesce((
      select jsonb_agg(jsonb_build_object(
        'destinatario', x.dest_nome, 'papel', x.papel, 'canal', x.canal, 'camada', x.camada,
        'entregues', x.entregues, 'na_fila', x.total_fila, 'itens', x.itens, 'mensagem', x.mensagem))
      from (
        select c.dest_nome, c.papel, c.canal, c.camada,
          count(*)::int entregues, max(c.total_fila)::int total_fila,
          jsonb_agg(jsonb_build_object(
            'sinal_id',c.sinal_id,'regra',c.regra_codigo,'severidade',c.severidade,
            'aluno',c.alvo_nome,'unidade',c.unidade_nome,'contexto',c.contexto,
            'orientacao',c.orientacao,'aprendizado',c.aprendizado,'janela_dias',c.janela_dias)
            order by c.rn) itens,
          case c.camada when 'estrategica' then
            '📊 *Mapa de Sinais — '||to_char(now() at time zone 'America/Sao_Paulo','DD/MM')||'*'||chr(10)||
            'Os '||count(*)::text||' casos mais urgentes de agora:'||chr(10)||chr(10)||
            string_agg('*'||coalesce(c.alvo_nome,'?')||'* ('||coalesce(c.unidade_nome,'?')||')'||chr(10)||
                       c.contexto||chr(10)||'→ '||coalesce(c.orientacao,''), chr(10)||chr(10) order by c.rn)||
            chr(10)||chr(10)||
            case when max(c.total_fila) > count(*)
                 then '_Mais '||(max(c.total_fila)-count(*))::text||' casos na fila — os próximos vêm no turno seguinte._'
                 else '_Fila zerada._' end
          else
            '⚡ *Atenção do dia — '||to_char(now() at time zone 'America/Sao_Paulo','DD/MM')||'*'||chr(10)||chr(10)||
            string_agg(c.contexto||chr(10)||'→ '||coalesce(c.orientacao,''), chr(10)||chr(10) order by c.rn)||
            case when max(c.total_fila) > count(*)
                 then chr(10)||chr(10)||'_+'||(max(c.total_fila)-count(*))::text||' na fila._' else '' end
          end mensagem
        from no_teto c group by c.dest_nome, c.papel, c.canal, c.camada
      ) x), '[]'::jsonb),
    'total_entregue', (select count(*) from no_teto),
    'total_na_fila', (select count(*) from cand)
  ) into v_out;

  if p_registrar then
    insert into radar_entregas (destinatario_id, sinal_id, agente, canal, chave_idem, status)
    select c.dest_id, c.sinal_id, p_agente, c.canal, c.chave, 'pendente'
    from no_teto c on conflict (chave_idem) do nothing;
  end if;
  return v_out;
end;
$function$;
