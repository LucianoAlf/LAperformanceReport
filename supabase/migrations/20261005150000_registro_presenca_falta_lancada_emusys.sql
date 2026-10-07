-- 2026-10-05 — Item 3 do desenho conjunto (Alf + agente do LA Teacher/Fábio):
-- falta LANÇADA no Emusys (presenca='ausente' + registro_presenca='registrado',
-- v1.8.2, medido ativo nas 3 unidades em 05/10) passa a cair como falta.
--
-- Contrato do desenho:
--   * registrado e confiavel em qualquer data (o campo rastreia lancamentos
--     retroativamente — medido desde 21/08); pendente/null segue neutro;
--   * 'emusys' continua NAO-forte: correcao humana posterior vence normalmente
--     e volta ao Emusys pelo escritor — e correcao, nao divergencia;
--   * eco: linha com respondido_por humano nunca troca a origem — o ramo forte
--     so atualiza a trilha; NADA novo e escrito em aluno_presenca_conflitos
--     (tabela legada); divergencia emusys-falta x humano-presente fica
--     derivavel nas colunas para a superficie canonica do item 4;
--   * resultado_pedagogico nao muda: a politica falta_confirmada ja contava
--     ausente como falta — o que muda e presenca_afirmada/chamada_fechada
--     (agenda, fila de cobranca).

-- 1. colunas novas em aluno_presenca (evidencia bruta + trilha)
alter table public.aluno_presenca
  add column if not exists emusys_registro_presenca text,
  add column if not exists emusys_registro_presenca_anterior text,
  add column if not exists emusys_registro_presenca_alterada_em timestamp with time zone;

comment on column public.aluno_presenca.emusys_registro_presenca is
  'Ultimo registro_presenca lido do Emusys (registrado|pendente|null). registrado = alguem lancou presenca ou falta.';
comment on column public.aluno_presenca.emusys_registro_presenca_anterior is
  'Valor anterior quando o registro_presenca do Emusys mudou — trilha, mesmo padrao de emusys_presenca_bruta_anterior.';
comment on column public.aluno_presenca.emusys_registro_presenca_alterada_em is
  'Quando o registro_presenca do Emusys mudou pela ultima vez.';

-- professor: o campo existe na v1.8.2 (professores[].registro_presenca) e a
-- coluna ja comporta a evidencia; o PROCESSAMENTO (falta do professor) fica
-- para a etapa seguinte do desenho — aqui so capturamos o dado.
alter table public.aulas_emusys
  add column if not exists professor_registro_presenca text;

comment on column public.aulas_emusys.professor_registro_presenca is
  'registro_presenca do professor no Emusys (v1.8.2) — so evidencia; sem processamento nesta etapa.';

-- 2. fn_presenca_fecha_chamada: overload com registro. Regra nova:
--    'emusys' + 'falta' so fecha quando registro='registrado' (falta lancada).
--    'emusys' + 'presente' segue fechando como antes (presente nunca vem pendente).
create or replace function public.fn_presenca_fecha_chamada(
  p_status_presenca text, p_respondido_por text, p_emusys_registro_presenca text)
 returns boolean
 language sql
 immutable parallel safe
as $function$
  select coalesce(
    p_status_presenca in ('presente', 'falta', 'falta_justificada')
    and (
      public.fn_presenca_e_forte(p_respondido_por)
      or (p_respondido_por = 'emusys' and (
            p_status_presenca = 'presente'
            or (p_status_presenca = 'falta' and p_emusys_registro_presenca = 'registrado')))
    ),
    false
  )
$function$;

-- a assinatura antiga (2 args) continua valida e delega sem registro —
-- chamadores nao migrados comportam-se exatamente como antes.
create or replace function public.fn_presenca_fecha_chamada(
  p_status_presenca text, p_respondido_por text)
 returns boolean
 language sql
 immutable parallel safe
as $function$
  select public.fn_presenca_fecha_chamada(p_status_presenca, p_respondido_por, null::text)
$function$;

-- 3. upsert_presenca_emusys_bruta (+p_registro_presenca)
-- drop da assinatura de 11 args: manter as duas tornaria a chamada RPC de 11
-- args ambigua para o PostgREST (a nova tem default). Sem dependentes — o
-- unico chamador e a edge sync-presenca-emusys.
drop function public.upsert_presenca_emusys_bruta(
  integer, integer, integer, uuid, date, time without time zone,
  text, text, text, text, timestamp with time zone);

CREATE OR REPLACE FUNCTION public.upsert_presenca_emusys_bruta(p_aluno_id integer, p_aula_emusys_id integer, p_professor_id integer, p_unidade_id uuid, p_data_aula date, p_horario_aula time without time zone, p_status_origem text, p_curso_nome text, p_turma_nome text, p_sala_nome text, p_sincronizado_em timestamp with time zone, p_registro_presenca text default null)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_id uuid;
  v_atual public.aluno_presenca%rowtype;
  v_raw text := lower(coalesce(nullif(btrim(p_status_origem), ''), 'ausente'));
  v_status text;
  v_status_presenca text;
  v_status_atual text;
  v_mudou_raw boolean;
  v_mudou_registro boolean;
  v_registro text := nullif(btrim(lower(coalesce(p_registro_presenca, ''))), '');
  v_emusys_decisao text;
begin
  if v_raw not in ('presente', 'ausente') then
    v_raw := 'ausente';
  end if;

  v_status := case when v_raw = 'presente' then 'presente' else 'ausente' end;
  v_status_presenca := case
    when v_raw = 'presente' then 'presente'
    when v_registro = 'registrado' then 'falta'
    else null
  end;
  -- decisao efetiva do Emusys: presente | falta (ausente+registrado) | null (inconclusivo)
  v_emusys_decisao := case
    when v_raw = 'presente' then 'presente'
    when v_registro = 'registrado' then 'falta'
    else null
  end;

  select * into v_atual
    from public.aluno_presenca
   where aluno_id = p_aluno_id
     and aula_emusys_id = p_aula_emusys_id
   for update;

  if not found then
    insert into public.aluno_presenca (
      aluno_id, aula_emusys_id, professor_id, unidade_id, data_aula, horario_aula,
      status, status_presenca, curso_nome, turma_nome, sala_nome,
      respondido_por, respondido_em, emusys_presenca_bruta,
      emusys_presenca_bruta_anterior, emusys_presenca_alterada_em,
      sincronizado_emusys_em, espelhado_de_presenca_id,
      emusys_registro_presenca
    ) values (
      p_aluno_id, p_aula_emusys_id, p_professor_id, p_unidade_id, p_data_aula,
      p_horario_aula, v_status, v_status_presenca, p_curso_nome, p_turma_nome,
      p_sala_nome, 'emusys', null, v_raw, null, coalesce(p_sincronizado_em, now()),
      coalesce(p_sincronizado_em, now()), null, v_registro
    ) returning id into v_id;
    return v_id;
  end if;

  v_id := v_atual.id;
  v_mudou_raw := v_atual.emusys_presenca_bruta is distinct from v_raw;
  v_mudou_registro := v_atual.emusys_registro_presenca is distinct from v_registro;
  v_status_atual := coalesce(
    v_atual.status_presenca,
    case v_atual.status when 'presente' then 'presente' when 'ausente' then 'falta' end
  );

  update public.aluno_presenca
     set professor_id = p_professor_id,
         unidade_id = p_unidade_id,
         data_aula = p_data_aula,
         horario_aula = p_horario_aula,
         curso_nome = p_curso_nome,
         turma_nome = p_turma_nome,
         sala_nome = p_sala_nome,
         emusys_presenca_bruta_anterior = case
           when v_mudou_raw then v_atual.emusys_presenca_bruta
           else aluno_presenca.emusys_presenca_bruta_anterior
         end,
         emusys_presenca_bruta = v_raw,
         emusys_presenca_alterada_em = case
           when v_mudou_raw then coalesce(p_sincronizado_em, now())
           else aluno_presenca.emusys_presenca_alterada_em
         end,
         emusys_registro_presenca_anterior = case
           when v_mudou_registro then v_atual.emusys_registro_presenca
           else aluno_presenca.emusys_registro_presenca_anterior
         end,
         emusys_registro_presenca = v_registro,
         emusys_registro_presenca_alterada_em = case
           when v_mudou_registro then coalesce(p_sincronizado_em, now())
           else aluno_presenca.emusys_registro_presenca_alterada_em
         end,
         sincronizado_emusys_em = coalesce(p_sincronizado_em, now())
   where id = v_id;

  if public.fn_presenca_e_forte(v_atual.respondido_por) then
    if v_emusys_decisao = 'presente' and v_status_atual in ('falta', 'falta_justificada') then
      perform public.fn_registrar_conflito_presenca(
        v_id, null, 'emusys', 'decisao_humana_vs_emusys',
        v_status_atual, v_atual.respondido_por, 'presente', 'emusys',
        jsonb_build_object('raw_anterior', v_atual.emusys_presenca_bruta, 'raw_atual', v_raw)
      );
    elsif v_emusys_decisao = 'falta' and v_status_atual = 'presente' then
      -- Divergencia emusys-falta-registrada x humano-presente: NAO escreve em
      -- aluno_presenca_conflitos (tabela legada, instrumento falso — regra do
      -- desenho conjunto). Fica derivavel nas colunas para a superficie
      -- canonica do item 4: forte presente + registro='registrado' + bruta='ausente'.
      null;
    else
      update public.aluno_presenca_conflitos
         set estado = 'resolvido', resolvido_em = now(),
             resolucao = 'raw_emusys_deixou_de_divergir', atualizado_em = now()
       where aluno_presenca_id = v_id and chave = 'emusys' and estado = 'aberto';
    end if;
    return v_id;
  end if;

  -- Uma presença positiva recebida pela aula irmã é terminal. O "ausente"
  -- próprio desta aula ainda é inconclusivo e, portanto, não pode apagá-la.
  if v_atual.espelhado_de_presenca_id is not null
     and v_raw = 'ausente'
     and public.fn_presenca_fecha_chamada(v_status_atual, v_atual.respondido_por, v_atual.emusys_registro_presenca) then
    return v_id;
  end if;

  update public.aluno_presenca
     set status = v_status,
         status_presenca = v_status_presenca,
         respondido_por = 'emusys',
         respondido_em = null,
         espelhado_de_presenca_id = null
   where id = v_id;

  update public.aluno_presenca_conflitos
     set estado = 'resolvido', resolvido_em = now(),
         resolucao = 'decisao_automatica_atualizada', atualizado_em = now()
   where aluno_presenca_id = v_id and chave = 'emusys' and estado = 'aberto';

  return v_id;
end
$function$;

-- 4. vw_aluno_presenca_semantica_v1 (+emusys_registro_presenca)
create or replace view public.vw_aluno_presenca_semantica_v1 as
 WITH evidencia AS NOT MATERIALIZED (
         SELECT ap.id,
            ap.aluno_id,
            ap.professor_id,
            ap.unidade_id,
            ap.data_aula,
            ap.horario_aula,
            ap.status,
            ap.respondido_por,
            ap.respondido_em,
            ap.mensagem_uazapi_id,
            ap.token,
            ap.created_at,
            ap.aula_emusys_id,
            ap.curso_nome,
            ap.turma_nome,
            ap.sala_nome,
            ap.status_presenca,
            ap.emusys_presenca_bruta,
            ap.emusys_registro_presenca,
            ap.sincronizado_emusys_em,
            COALESCE(NULLIF(lower(ap.emusys_presenca_bruta), ''::text), lower((ap.status)::text)) AS estado_emusys_bruto,
            ae.emusys_id AS aula_emusys_evento_id,
            ae.cancelada AS aula_cancelada,
            ae.justificada AS aula_justificada,
            ae.categoria AS aula_categoria,
            ae.tipo AS aula_tipo,
            ae.data_hora_inicio,
            lower(NULLIF(ae.professor_presenca, ''::text)) AS professor_presenca_emusys,
                CASE
                    WHEN (ap.aula_emusys_id IS NOT NULL) THEN bool_or(((ap.status)::text = 'presente'::text)) OVER (PARTITION BY ap.aula_emusys_id)
                    ELSE ((ap.status)::text = 'presente'::text)
                END AS evento_tem_aluno_presente,
            politica.id AS politica_confiabilidade_id,
            politica.ausencia_emusys_resultado,
            politica.exige_revisao_operacional,
            politica.evidencia AS politica_evidencia,
            revisao.status AS revisao_status
           FROM (((aluno_presenca ap
             LEFT JOIN aulas_emusys ae ON ((ae.id = ap.aula_emusys_id)))
             LEFT JOIN LATERAL ( SELECT p.id,
                    p.unidade_id,
                    p.data_inicio,
                    p.data_fim,
                    p.ausencia_emusys_resultado,
                    p.exige_revisao_operacional,
                    p.decidido_em,
                    p.decidido_por,
                    p.evidencia,
                    p.regra_versao,
                    p.ativa,
                    p.created_at
                   FROM presenca_politicas_confiabilidade p
                  WHERE ((p.unidade_id = ap.unidade_id) AND p.ativa AND (ap.data_aula >= p.data_inicio) AND (ap.data_aula <= p.data_fim))
                  ORDER BY p.data_inicio DESC, p.created_at DESC, p.id
                 LIMIT 1) politica ON (true))
             LEFT JOIN aluno_presenca_revisoes_operacionais revisao ON ((revisao.aluno_presenca_id = ap.id)))
        ), classificada AS (
         SELECT e.id,
            e.aluno_id,
            e.professor_id,
            e.unidade_id,
            e.data_aula,
            e.horario_aula,
            e.status,
            e.respondido_por,
            e.respondido_em,
            e.mensagem_uazapi_id,
            e.token,
            e.created_at,
            e.aula_emusys_id,
            e.curso_nome,
            e.turma_nome,
            e.sala_nome,
            e.status_presenca,
            e.emusys_presenca_bruta,
            e.emusys_registro_presenca,
            e.sincronizado_emusys_em,
            e.estado_emusys_bruto,
            e.aula_emusys_evento_id,
            e.aula_cancelada,
            e.aula_justificada,
            e.aula_categoria,
            e.aula_tipo,
            e.data_hora_inicio,
            e.professor_presenca_emusys,
            e.evento_tem_aluno_presente,
            e.politica_confiabilidade_id,
            e.ausencia_emusys_resultado,
            e.exige_revisao_operacional,
            e.politica_evidencia,
            e.revisao_status,
            lower((COALESCE(e.status, 'desconhecido'::character varying))::text) AS estado_origem,
                CASE
                    WHEN ((e.respondido_por)::text = 'professor_la_teacher'::text) THEN 'la_teacher'::text
                    WHEN ((e.respondido_por)::text = 'fabio_audio'::text) THEN 'fabio_audio'::text
                    WHEN ((e.respondido_por)::text = 'professor_whatsapp'::text) THEN 'professor_whatsapp'::text
                    WHEN ((e.respondido_por)::text = 'agenda_secretaria'::text) THEN 'agenda_secretaria'::text
                    WHEN ((e.respondido_por)::text = 'manual'::text) THEN 'manual'::text
                    WHEN ((e.respondido_por)::text = ANY (ARRAY['emusys'::text, 'sistema'::text])) THEN 'emusys'::text
                    ELSE 'desconhecida'::text
                END AS proveniencia,
                CASE
                    WHEN ((e.status)::text = 'presente'::text) THEN 'registrada'::text
                    WHEN (COALESCE(e.aula_cancelada, false) OR COALESCE(e.aula_justificada, false)) THEN 'nao_aplicavel'::text
                    WHEN (fn_presenca_e_forte((e.respondido_por)::text) AND ((e.status)::text = 'ausente'::text)) THEN 'registrada'::text
                    WHEN (((e.respondido_por)::text = ANY (ARRAY['emusys'::text, 'sistema'::text])) AND (e.estado_emusys_bruto = 'ausente'::text) AND (e.ausencia_emusys_resultado = 'falta_confirmada'::text)) THEN 'registrada_atestada'::text
                    WHEN (((e.respondido_por)::text = ANY (ARRAY['emusys'::text, 'sistema'::text])) AND (e.estado_emusys_bruto = 'ausente'::text) AND (e.evento_tem_aluno_presente OR (e.professor_presenca_emusys = 'presente'::text))) THEN 'registrada_inferida'::text
                    ELSE 'indeterminada'::text
                END AS situacao_chamada,
                CASE
                    WHEN ((e.status)::text = 'presente'::text) THEN 'presente'::text
                    WHEN COALESCE(e.aula_cancelada, false) THEN 'aula_cancelada'::text
                    WHEN COALESCE(e.aula_justificada, false) THEN 'aula_justificada'::text
                    WHEN (fn_presenca_e_forte((e.respondido_por)::text) AND ((e.status)::text = 'ausente'::text)) THEN 'falta_confirmada'::text
                    WHEN (((e.respondido_por)::text = ANY (ARRAY['emusys'::text, 'sistema'::text])) AND (e.estado_emusys_bruto = 'ausente'::text) AND (e.ausencia_emusys_resultado = 'falta_confirmada'::text)) THEN 'falta_confirmada'::text
                    WHEN (((e.respondido_por)::text = ANY (ARRAY['emusys'::text, 'sistema'::text])) AND (e.estado_emusys_bruto = 'ausente'::text) AND (e.evento_tem_aluno_presente OR (e.professor_presenca_emusys = 'presente'::text))) THEN 'falta_provavel'::text
                    ELSE 'indeterminado'::text
                END AS resultado_pedagogico
           FROM evidencia e
        )
 SELECT id AS aluno_presenca_id,
    aluno_id,
    professor_id,
    unidade_id,
    aula_emusys_id,
    aula_emusys_evento_id,
    data_aula,
    horario_aula,
    data_hora_inicio,
    curso_nome,
    turma_nome,
    aula_categoria,
    aula_tipo,
    estado_origem,
    respondido_por,
    respondido_em,
    proveniencia,
    situacao_chamada,
    resultado_pedagogico,
        CASE
            WHEN (resultado_pedagogico = ANY (ARRAY['presente'::text, 'aula_cancelada'::text, 'aula_justificada'::text, 'falta_confirmada'::text])) THEN 'confirmada'::text
            WHEN (resultado_pedagogico = 'falta_provavel'::text) THEN 'provavel'::text
            ELSE 'desconhecida'::text
        END AS confianca,
    (resultado_pedagogico = ANY (ARRAY['presente'::text, 'falta_confirmada'::text])) AS considera_frequencia_denominador,
    (resultado_pedagogico = 'presente'::text) AS considera_presenca,
    (resultado_pedagogico = 'falta_confirmada'::text) AS considera_falta,
    (resultado_pedagogico = ANY (ARRAY['aula_cancelada'::text, 'aula_justificada'::text])) AS exclui_por_evento,
    (fn_presenca_e_forte((respondido_por)::text) AND (respondido_em IS NOT NULL)) AS respondido_em_confiavel,
    (((status)::text = 'presente'::text) AND (COALESCE(aula_cancelada, false) OR COALESCE(aula_justificada, false))) AS possui_conflito,
    'presenca-semantica-v1.4'::text AS regra_versao,
    estado_emusys_bruto,
    sincronizado_emusys_em,
    professor_presenca_emusys,
        CASE
            WHEN fn_presenca_e_forte((respondido_por)::text) THEN respondido_em
            ELSE sincronizado_emusys_em
        END AS evidencia_registrada_em,
    politica_confiabilidade_id,
        CASE
            WHEN fn_presenca_e_forte((respondido_por)::text) THEN 'resposta_humana_explicita'::text
            WHEN ((estado_emusys_bruto = 'ausente'::text) AND (politica_confiabilidade_id IS NOT NULL)) THEN politica_evidencia
            WHEN (resultado_pedagogico = 'falta_provavel'::text) THEN 'evidencia_de_que_a_aula_ocorreu'::text
            ELSE 'regra_conservadora_sem_atestado'::text
        END AS fundamento_confianca,
    (COALESCE(exige_revisao_operacional, false) AND (NOT fn_presenca_e_forte((respondido_por)::text)) AND ((respondido_por)::text = ANY (ARRAY['emusys'::text, 'sistema'::text])) AND (estado_emusys_bruto = 'ausente'::text) AND (NOT COALESCE(aula_cancelada, false)) AND (NOT COALESCE(aula_justificada, false))) AS revisao_operacional_exigida,
        CASE
            WHEN (COALESCE(exige_revisao_operacional, false) AND (NOT fn_presenca_e_forte((respondido_por)::text)) AND ((respondido_por)::text = ANY (ARRAY['emusys'::text, 'sistema'::text])) AND (estado_emusys_bruto = 'ausente'::text) AND (NOT COALESCE(aula_cancelada, false)) AND (NOT COALESCE(aula_justificada, false))) THEN COALESCE(revisao_status, 'pendente'::text)
            ELSE 'nao_exigida'::text
        END AS revisao_operacional_status,
    status_presenca,
    emusys_registro_presenca
   FROM classificada c;
-- 5. vw_presenca_slot_canonica_v1 (fecha_chamada com registro + coluna)
create or replace view public.vw_presenca_slot_canonica_v1 as
 WITH linhas AS (
         SELECT v.aluno_presenca_id,
            v.aluno_id,
            v.professor_id,
            v.unidade_id,
            v.aula_emusys_id,
            v.aula_emusys_evento_id,
            v.data_aula,
            v.horario_aula,
            v.data_hora_inicio,
            v.curso_nome,
            v.turma_nome,
            v.aula_categoria,
            v.aula_tipo,
            v.estado_origem,
            v.respondido_por,
            v.respondido_em,
            v.proveniencia,
            v.situacao_chamada,
            v.resultado_pedagogico,
            v.confianca,
            v.considera_frequencia_denominador,
            v.considera_presenca,
            v.considera_falta,
            v.exclui_por_evento,
            v.respondido_em_confiavel,
            v.possui_conflito,
            v.regra_versao,
            v.estado_emusys_bruto,
            v.sincronizado_emusys_em,
            v.professor_presenca_emusys,
            v.evidencia_registrada_em,
            v.politica_confiabilidade_id,
            v.fundamento_confianca,
            v.revisao_operacional_exigida,
            v.revisao_operacional_status,
            v.status_presenca,
            v.emusys_registro_presenca,
            ae.data_hora_fim,
            count(*) OVER w AS qtd_linhas_no_slot,
            min(
                CASE
                    WHEN fn_presenca_e_forte((v.respondido_por)::text) THEN v.status_presenca
                    ELSE NULL::text
                END) OVER w AS decisao_forte_min,
            max(
                CASE
                    WHEN fn_presenca_e_forte((v.respondido_por)::text) THEN v.status_presenca
                    ELSE NULL::text
                END) OVER w AS decisao_forte_max,
            bool_or(v.possui_conflito) OVER w AS conflito_em_alguma_linha,
            bool_or((v.resultado_pedagogico = 'aula_cancelada'::text)) OVER w AS slot_cancelado,
            bool_or((v.resultado_pedagogico = 'aula_justificada'::text)) OVER w AS slot_justificado,
            row_number() OVER (PARTITION BY v.aluno_id, v.unidade_id, v.professor_id, v.data_hora_inicio, ae.data_hora_fim, v.curso_nome ORDER BY (fn_presenca_fecha_chamada(v.status_presenca, (v.respondido_por)::text, v.emusys_registro_presenca)) DESC, (fn_presenca_e_forte((v.respondido_por)::text)) DESC, v.respondido_em DESC NULLS LAST,
                CASE
                    WHEN ((v.aula_tipo)::text = 'turma'::text) THEN 0
                    ELSE 1
                END, v.aluno_presenca_id) AS posicao_no_slot
           FROM (vw_aluno_presenca_semantica_v1 v
             LEFT JOIN aulas_emusys ae ON ((ae.id = v.aula_emusys_id)))
          WINDOW w AS (PARTITION BY v.aluno_id, v.unidade_id, v.professor_id, v.data_hora_inicio, ae.data_hora_fim, v.curso_nome)
        ), resolvido AS (
         SELECT l.aluno_presenca_id,
            l.aluno_id,
            l.professor_id,
            l.unidade_id,
            l.aula_emusys_id,
            l.aula_emusys_evento_id,
            l.data_aula,
            l.horario_aula,
            l.data_hora_inicio,
            l.curso_nome,
            l.turma_nome,
            l.aula_categoria,
            l.aula_tipo,
            l.estado_origem,
            l.respondido_por,
            l.respondido_em,
            l.proveniencia,
            l.situacao_chamada,
            l.resultado_pedagogico,
            l.confianca,
            l.considera_frequencia_denominador,
            l.considera_presenca,
            l.considera_falta,
            l.exclui_por_evento,
            l.respondido_em_confiavel,
            l.possui_conflito,
            l.regra_versao,
            l.estado_emusys_bruto,
            l.sincronizado_emusys_em,
            l.professor_presenca_emusys,
            l.evidencia_registrada_em,
            l.politica_confiabilidade_id,
            l.fundamento_confianca,
            l.revisao_operacional_exigida,
            l.revisao_operacional_status,
            l.status_presenca,
            l.emusys_registro_presenca,
            l.data_hora_fim,
            l.qtd_linhas_no_slot,
            l.decisao_forte_min,
            l.decisao_forte_max,
            l.conflito_em_alguma_linha,
            l.slot_cancelado,
            l.slot_justificado,
            l.posicao_no_slot,
                CASE
                    WHEN l.slot_cancelado THEN 'aula_cancelada'::text
                    WHEN l.slot_justificado THEN 'aula_justificada'::text
                    ELSE l.resultado_pedagogico
                END AS resultado_do_slot
           FROM linhas l
          WHERE (l.posicao_no_slot = 1)
        )
 SELECT aluno_presenca_id,
    aluno_id,
    professor_id,
    unidade_id,
    aula_emusys_id,
    aula_emusys_evento_id,
    data_aula,
    data_hora_inicio,
    data_hora_fim,
    horario_aula,
    curso_nome,
    turma_nome,
    aula_categoria,
    aula_tipo,
    estado_origem,
    status_presenca,
    respondido_por,
    respondido_em,
    proveniencia,
        CASE
            WHEN (resultado_do_slot = ANY (ARRAY['aula_cancelada'::text, 'aula_justificada'::text])) THEN 'nao_aplicavel'::text
            ELSE situacao_chamada
        END AS situacao_chamada,
    resultado_do_slot AS resultado_pedagogico,
        CASE
            WHEN (resultado_do_slot = ANY (ARRAY['presente'::text, 'aula_cancelada'::text, 'aula_justificada'::text, 'falta_confirmada'::text])) THEN 'confirmada'::text
            WHEN (resultado_do_slot = 'falta_provavel'::text) THEN 'provavel'::text
            ELSE 'desconhecida'::text
        END AS confianca,
    (resultado_do_slot = ANY (ARRAY['presente'::text, 'falta_confirmada'::text])) AS considera_frequencia_denominador,
    (resultado_do_slot = 'presente'::text) AS considera_presenca,
    (resultado_do_slot = 'falta_confirmada'::text) AS considera_falta,
    (resultado_do_slot = ANY (ARRAY['aula_cancelada'::text, 'aula_justificada'::text])) AS exclui_por_evento,
    estado_emusys_bruto,
    professor_presenca_emusys,
    evidencia_registrada_em,
    fundamento_confianca,
    revisao_operacional_exigida,
    revisao_operacional_status,
    qtd_linhas_no_slot,
    (qtd_linhas_no_slot > 1) AS slot_geminado_no_emusys,
    (decisao_forte_min IS DISTINCT FROM decisao_forte_max) AS tem_divergencia,
        CASE
            WHEN (resultado_do_slot = ANY (ARRAY['aula_cancelada'::text, 'aula_justificada'::text])) THEN NULL::text
            WHEN fn_presenca_fecha_chamada(status_presenca, (respondido_por)::text, emusys_registro_presenca) THEN status_presenca
            ELSE NULL::text
        END AS presenca_afirmada,
    ((resultado_do_slot <> ALL (ARRAY['aula_cancelada'::text, 'aula_justificada'::text])) AND fn_presenca_fecha_chamada(status_presenca, (respondido_por)::text, emusys_registro_presenca)) AS chamada_fechada,
    'presenca-slot-canonica-v1.1'::text AS regra_versao,
    COALESCE(conflito_em_alguma_linha, false) AS possui_conflito
   FROM resolvido r;
-- 6. vw_presenca_pendencia (fecha_chamada com registro)
create or replace view public.vw_presenca_pendencia as
 SELECT ae.unidade_id,
    u.nome AS unidade_nome,
    ae.professor_id,
    p.nome AS professor_nome,
    ae.id AS aula_id,
    ae.tipo,
    ae.data_aula,
    ae.data_hora_inicio,
    ae.data_hora_fim,
    to_char((ae.data_hora_inicio AT TIME ZONE 'America/Sao_Paulo'::text), 'HH24:MI'::text) AS hora,
    ae.curso_nome,
    ae.turma_nome,
    r.aluno_id,
    al.nome AS aluno_nome,
    split_part(btrim((al.nome)::text), ' '::text, 1) AS aluno_primeiro_nome,
    COALESCE(adm.justificada, false) AS justificada,
    (floor((EXTRACT(epoch FROM (now() - ae.data_hora_fim)) / (86400)::numeric)))::integer AS dias_em_atraso
   FROM (((((aulas_emusys ae
     JOIN aula_alunos_emusys r ON (((r.aula_emusys_id = ae.id) AND (r.aluno_id IS NOT NULL) AND r.ativo_operacional)))
     JOIN alunos al ON ((al.id = r.aluno_id)))
     JOIN unidades u ON ((u.id = ae.unidade_id)))
     LEFT JOIN professores p ON ((p.id = ae.professor_id)))
     LEFT JOIN aluno_presenca_administrativo adm ON (((adm.aula_emusys_id = ae.id) AND (adm.aluno_id = r.aluno_id))))
  WHERE ((ae.id = fn_aula_operacional_id(ae.id)) AND (COALESCE(ae.cancelada, false) = false) AND (ae.professor_id IS NOT NULL) AND (ae.data_hora_fim < now()) AND (ae.data_aula >= (CURRENT_DATE - 45)) AND fn_presenca_pendencia_elegivel(ae.unidade_id, r.aluno_id, ae.data_aula, ae.matricula_disciplina_id, (ae.curso_nome)::text) AND (NOT (EXISTS ( SELECT 1
           FROM aluno_presenca ap
          WHERE ((ap.aula_emusys_id = ae.id) AND (ap.aluno_id = r.aluno_id) AND fn_presenca_fecha_chamada(COALESCE(ap.status_presenca,
                CASE ap.status
                    WHEN 'presente'::text THEN 'presente'::text
                    WHEN 'ausente'::text THEN 'falta'::text
                    ELSE NULL::text
                END), (ap.respondido_por)::text, ap.emusys_registro_presenca))))));
-- 7. consumidores internos do fecha_chamada
CREATE OR REPLACE FUNCTION public.app_registro_completo(p_registro_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_prof   integer := public.fn_professor_do_usuario();
  v_tronco jsonb;
  v_fatias jsonb;
  v_aula   jsonb;
  v_ja     jsonb;
  v_aula_id integer;
begin
  if v_prof is null then return jsonb_build_object('erro','sem_professor'); end if;

  select to_jsonb(r) into v_tronco from public.fabio_registros_aula r
   where r.id = p_registro_id and r.parent_id is null and r.professor_id = v_prof;
  if v_tronco is null then return jsonb_build_object('erro','nao_encontrado'); end if;

  v_aula_id := (v_tronco->>'aula_id')::integer;

  select coalesce(jsonb_agg(
           to_jsonb(r)
           || jsonb_build_object(
                'aluno_nome',          a.nome,
                'aluno_primeiro_nome', split_part(btrim(a.nome), ' ', 1),
                'aluno_foto_url',      a.foto_url,
                'aula_id_alvo',        case when r.aluno_id is not null
                                            then public.fn_aula_individual_do_aluno(r.aula_id, r.aluno_id) end,
                -- Presença JÁ lançada (secretaria/Emusys/professor). Só leitura:
                -- o cliente mostra com carimbo e bloqueia a edição quando
                -- `presenca_travada` é true.
                'presenca_lancada',    pres.presenca,
                'presenca_fonte',      pres.respondido_por,
                'presenca_travada',    coalesce(pres.fecha_chamada, false)
              )
           order by a.nome), '[]'::jsonb)
    into v_fatias
    from public.fabio_registros_aula r
    left join public.alunos a on a.id = r.aluno_id
    left join lateral (
      select
        coalesce(ap.status_presenca,
          case ap.status when 'presente' then 'presente'
                         when 'ausente'  then 'falta' end) as presenca,
        ap.respondido_por,
        public.fn_presenca_fecha_chamada(
          coalesce(ap.status_presenca,
            case ap.status when 'presente' then 'presente'
                           when 'ausente'  then 'falta' end),
          ap.respondido_por, ap.emusys_registro_presenca) as fecha_chamada
        from public.aluno_presenca ap
       where r.aluno_id is not null
         and ap.aluno_id = r.aluno_id
         and ap.aula_emusys_id in (v_aula_id, r.aula_id)
       order by public.fn_presenca_fecha_chamada(
                  coalesce(ap.status_presenca,
                    case ap.status when 'presente' then 'presente'
                                   when 'ausente'  then 'falta' end),
                  ap.respondido_por, ap.emusys_registro_presenca) desc,
                ap.respondido_em desc nulls last,
                ap.aula_emusys_id
       limit 1
    ) pres on true
   where r.parent_id = p_registro_id;

  select jsonb_build_object(
           'data_aula', v.data_aula, 'hora', v.horario_inicio_brt,
           'turma', v.turma_nome, 'curso', v.curso_nome, 'tipo', v.aula_tipo)
    into v_aula
    from public.vw_fabio_aulas_contexto v
   where v.aula_local_id = v_aula_id limit 1;

  v_ja := public.fn_aula_ja_registrada(v_aula_id);

  return jsonb_build_object(
    'tronco', v_tronco,
    'fatias', v_fatias,
    'aula',   v_aula,
    'aula_ja_registrada', (jsonb_array_length(v_ja) > 0),
    'ja_registrados', v_ja,
    -- o front DEVE mandar 'substituir' ou 'complementar' quando aula_ja_registrada = true.
    -- Se mandar 'novo', o banco recusa (nao destroi o trabalho do professor).
    'modo_exigido', case when jsonb_array_length(v_ja) > 0 then 'substituir|complementar' else 'novo' end
  );
end $function$;

CREATE OR REPLACE FUNCTION public.fabio_aulas_candidatas(p_professor_id integer, p_fluxo text, p_referencia timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_candidatas jsonb;
begin
  if p_fluxo not in ('registro', 'chamada') then
    return jsonb_build_object('ok', false, 'codigo', 'fluxo_invalido', 'candidatas', '[]'::jsonb);
  end if;
  if not exists (select 1 from public.professores p where p.id = p_professor_id) then
    return jsonb_build_object('ok', false, 'codigo', 'professor_nao_encontrado', 'candidatas', '[]'::jsonb);
  end if;

  if p_fluxo = 'registro' then
    with passado as (
      select
        v.aula_ancora_id as aula_id,
        max(v.data_aula) as data_aula,
        max(v.data_hora_inicio) as data_hora_inicio,
        max(v.curso_nome) as curso,
        max(v.turma_nome) as turma,
        max(v.tipo) as tipo,
        max(v.dias_em_atraso) as dias_em_atraso,
        bool_or(v.data_hora_fim >= p_referencia - (public.fn_janela_registro_dias() || ' days')::interval)
          as na_janela,
        jsonb_agg(distinct jsonb_build_object(
          'aluno_id', v.aluno_id,
          'nome', v.aluno_nome,
          'aula_alvo_id', v.aula_alvo_id
        ) order by jsonb_build_object(
          'aluno_id', v.aluno_id,
          'nome', v.aluno_nome,
          'aula_alvo_id', v.aula_alvo_id
        )) as alunos
      from public.vw_registro_pendencia v
      where v.professor_id = p_professor_id
        and v.data_hora_fim <= p_referencia
        -- 10/09/2026: além da janela, a DÍVIDA (cobrável de qualquer idade),
        -- decisão do Alf. `na_janela` separa as duas: o casador do WhatsApp
        -- procura primeiro na janela e só olha a dívida velha quando o
        -- professor diz o DIA (fabio_whatsapp_actions._reduzir_em_camadas).
        and (v.data_hora_fim >= p_referencia - (public.fn_janela_registro_dias() || ' days')::interval
             or v.cobravel)
      group by v.aula_ancora_id
    ), futuro_por_aluno as (
      select distinct on (ae.unidade_id, ae.data_hora_inicio, ae.professor_id, r.aluno_id)
        public.fn_aula_operacional_id(ae.id) as aula_id,
        ae.data_aula,
        ae.data_hora_inicio,
        ae.curso_nome as curso,
        ae.turma_nome as turma,
        ae.tipo,
        0 as dias_em_atraso,
        jsonb_build_array(jsonb_build_object(
          'aluno_id', r.aluno_id,
          'nome', al.nome,
          'aula_alvo_id', public.fn_aula_operacional_id(ae.id)
        )) as alunos_item
      from public.aulas_emusys ae
      join public.aula_alunos_emusys r on r.aula_emusys_id = ae.id
      join public.alunos al on al.id = r.aluno_id
      where ae.professor_id = p_professor_id
        and coalesce(ae.cancelada, false) = false
        and ae.data_hora_inicio > p_referencia
        and ae.data_hora_inicio <= p_referencia + interval '15 minutes'
        and nullif(btrim(coalesce(
              (select alvo.anotacoes_fabio from public.aulas_emusys alvo
                where alvo.id = public.fn_aula_operacional_id(ae.id)), '')), '') is null
      order by ae.unidade_id, ae.data_hora_inicio, ae.professor_id, r.aluno_id,
               case when ae.tipo = 'turma' then 0 else 1 end, ae.id
    ), futuro as (
      select aula_id,
             max(data_aula) as data_aula,
             max(data_hora_inicio) as data_hora_inicio,
             max(curso) as curso,
             max(turma) as turma,
             max(tipo) as tipo,
             0 as dias_em_atraso,
             true as na_janela,
             jsonb_agg(alunos_item->0 order by alunos_item->0->>'nome') as alunos
      from futuro_por_aluno
      group by aula_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'aula_id', x.aula_id,
      'data', x.data_aula,
      'hora', to_char(x.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI'),
      'curso', x.curso,
      'turma', x.turma,
      'tipo', x.tipo,
      'dias_em_atraso', x.dias_em_atraso,
      'na_janela', x.na_janela,
      'alunos', x.alunos
    ) order by x.data_hora_inicio desc), '[]'::jsonb)
      into v_candidatas
    from (select * from passado union all select * from futuro) x;
  else
    with roster as (
      select distinct on (ae.unidade_id, ae.data_hora_inicio, ae.professor_id, r.aluno_id)
        public.fn_aula_operacional_id(ae.id) as aula_id,
        ae.data_aula,
        ae.data_hora_inicio,
        ae.curso_nome as curso,
        ae.turma_nome as turma,
        ae.tipo,
        r.aluno_id,
        al.nome,
        not exists (
          select 1
          from public.aulas_emusys gem
          join public.aluno_presenca ap
            on ap.aula_emusys_id = gem.id
           and ap.aluno_id = r.aluno_id
          where gem.unidade_id = ae.unidade_id
            and gem.data_hora_inicio = ae.data_hora_inicio
            and gem.professor_id is not distinct from ae.professor_id
            and coalesce(gem.cancelada, false) = false
            and public.fn_presenca_fecha_chamada(
              coalesce(ap.status_presenca,
                case ap.status when 'presente' then 'presente' when 'ausente' then 'falta' end),
              ap.respondido_por, ap.emusys_registro_presenca
            )
        ) as sem_presenca_fechada
      from public.aulas_emusys ae
      join public.aula_alunos_emusys r on r.aula_emusys_id = ae.id and r.aluno_id is not null
      join public.alunos al on al.id = r.aluno_id
      where ae.professor_id = p_professor_id
        and coalesce(ae.cancelada, false) = false
        and ae.data_hora_inicio <= p_referencia + interval '15 minutes'
        and coalesce(ae.data_hora_fim, ae.data_hora_inicio) >= p_referencia - (public.fn_janela_registro_dias() || ' days')::interval
      order by ae.unidade_id, ae.data_hora_inicio, ae.professor_id, r.aluno_id,
               case when ae.tipo = 'turma' then 0 else 1 end, ae.id
    ), por_aula as (
      select aula_id, max(data_aula) as data_aula, max(data_hora_inicio) as data_hora_inicio,
             max(curso) as curso, max(turma) as turma, max(tipo) as tipo,
             jsonb_agg(jsonb_build_object('aluno_id', aluno_id, 'nome', nome)
                       order by nome) filter (where sem_presenca_fechada) as alunos,
             count(*) filter (where sem_presenca_fechada) as faltantes
      from roster group by aula_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'aula_id', aula_id,
      'data', data_aula,
      'hora', to_char(data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI'),
      'curso', curso,
      'turma', turma,
      'tipo', tipo,
      -- Mantém a chave pública existente; a régua por trás dela agora é o
      -- resolvedor canônico, não só origem humana.
      'alunos_sem_presenca_forte', coalesce(alunos, '[]'::jsonb)
    ) order by data_hora_inicio desc), '[]'::jsonb)
      into v_candidatas
    from por_aula where faltantes > 0;
  end if;

  return jsonb_build_object(
    'ok', true,
    'codigo', 'candidatas_prontas',
    'professor_id', p_professor_id,
    'fluxo', p_fluxo,
    'candidatas', coalesce(v_candidatas, '[]'::jsonb)
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.fn_sincronizar_gemeos_presenca(p_aula_ancora_id integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_fonte record;
  v_gemeo public.aulas_emusys%rowtype;
  v_destino public.aluno_presenca%rowtype;
  v_status_fonte text;
  v_status_destino text;
  v_sincronizados integer := 0;
begin
  for v_fonte in
    select ap.*, ae.tipo as aula_tipo, ae.data_hora_inicio
      from public.aluno_presenca ap
      join public.aulas_emusys ae on ae.id = ap.aula_emusys_id
     where ap.espelhado_de_presenca_id is null
       and (p_aula_ancora_id is null or ap.aula_emusys_id = p_aula_ancora_id)
       and public.fn_presenca_e_forte(ap.respondido_por)
       and public.fn_presenca_fecha_chamada(
         coalesce(ap.status_presenca,
           case ap.status when 'presente' then 'presente' when 'ausente' then 'falta' end),
         ap.respondido_por, ap.emusys_registro_presenca
       )
  loop
    v_status_fonte := coalesce(
      v_fonte.status_presenca,
      case v_fonte.status when 'presente' then 'presente' when 'ausente' then 'falta' end
    );

    select i.* into v_gemeo
      from public.aulas_emusys i
      join public.aula_alunos_emusys ri
        on ri.aula_emusys_id = i.id and ri.aluno_id = v_fonte.aluno_id
     where i.tipo = case when v_fonte.aula_tipo = 'turma' then 'individual' else 'turma' end
       and i.unidade_id = v_fonte.unidade_id
       and i.data_hora_inicio = v_fonte.data_hora_inicio
       and i.professor_id is not distinct from v_fonte.professor_id
       and coalesce(i.cancelada, false) = false
     order by i.id
     limit 1;

    if not found then
      continue;
    end if;

    select * into v_destino
      from public.aluno_presenca
     where aluno_id = v_fonte.aluno_id and aula_emusys_id = v_gemeo.id
     for update;

    if not found then
      insert into public.aluno_presenca (
        aluno_id, aula_emusys_id, professor_id, unidade_id, data_aula, horario_aula,
        status, status_presenca, curso_nome, turma_nome, sala_nome,
        respondido_por, respondido_em, espelhado_de_presenca_id
      ) values (
        v_fonte.aluno_id, v_gemeo.id, v_gemeo.professor_id, v_gemeo.unidade_id,
        v_gemeo.data_aula,
        (v_gemeo.data_hora_inicio at time zone 'America/Sao_Paulo')::time,
        v_fonte.status, v_status_fonte, v_gemeo.curso_nome, v_gemeo.turma_nome,
        v_gemeo.sala_nome, v_fonte.respondido_por, v_fonte.respondido_em, v_fonte.id
      );
      v_sincronizados := v_sincronizados + 1;
      continue;
    end if;

    v_status_destino := coalesce(
      v_destino.status_presenca,
      case v_destino.status when 'presente' then 'presente' when 'ausente' then 'falta' end
    );

    if v_destino.espelhado_de_presenca_id is null
       and public.fn_presenca_e_forte(v_destino.respondido_por) then
      if v_status_destino is distinct from v_status_fonte then
        perform public.fn_registrar_conflito_presenca(
          v_destino.id, v_fonte.id, 'gemeo:' || v_fonte.id::text,
          'decisoes_gemeas_divergentes', v_status_destino, v_destino.respondido_por,
          v_status_fonte, v_fonte.respondido_por,
          jsonb_build_object('aula_origem_id', v_fonte.aula_emusys_id, 'aula_destino_id', v_gemeo.id)
        );
      end if;
      continue;
    end if;

    if lower(coalesce(v_destino.emusys_presenca_bruta, '')) = 'presente'
       and v_status_fonte in ('falta', 'falta_justificada') then
      perform public.fn_registrar_conflito_presenca(
        v_destino.id, v_fonte.id, 'gemeo:' || v_fonte.id::text,
        'decisao_humana_vs_emusys', v_status_fonte, v_fonte.respondido_por,
        'presente', 'emusys',
        jsonb_build_object('aula_origem_id', v_fonte.aula_emusys_id, 'aula_destino_id', v_gemeo.id)
      );
      continue;
    end if;

    if v_destino.espelhado_de_presenca_id is not distinct from v_fonte.id
       and v_status_destino is not distinct from v_status_fonte
       and v_destino.respondido_por is not distinct from v_fonte.respondido_por then
      continue;
    end if;

    update public.aluno_presenca
       set status = v_fonte.status,
           status_presenca = v_status_fonte,
           respondido_por = v_fonte.respondido_por,
           respondido_em = v_fonte.respondido_em,
           espelhado_de_presenca_id = v_fonte.id
     where id = v_destino.id;
    v_sincronizados := v_sincronizados + 1;
  end loop;

  return v_sincronizados;
end
$function$;

CREATE OR REPLACE FUNCTION public.trg_sincronizar_gemeos_presenca()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_status_novo text;
begin
  if current_setting('app.presenca_v2_em_execucao', true) = 'on' then
    return new;
  end if;

  v_status_novo := coalesce(
    new.status_presenca,
    case new.status
      when 'presente' then 'presente'
      when 'ausente' then 'falta'
    end
  );

  if new.espelhado_de_presenca_id is null
     and public.fn_presenca_e_forte(new.respondido_por)
     and public.fn_presenca_fecha_chamada(v_status_novo, new.respondido_por, new.emusys_registro_presenca)
     and (
       tg_op = 'INSERT'
       or old.status is distinct from new.status
       or old.status_presenca is distinct from new.status_presenca
       or old.respondido_por is distinct from new.respondido_por
       or old.espelhado_de_presenca_id is distinct from new.espelhado_de_presenca_id
     ) then
    perform public.fn_sincronizar_gemeos_presenca(new.aula_emusys_id);
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION public.reconciliar_grade_snapshot_emusys_v1_base(p_unidade_id uuid, p_data_inicio date, p_data_fim date, p_snapshot jsonb, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_snapshot_aulas integer := 0;
  v_detalhe jsonb := '[]'::jsonb;
  v_aulas_cancelar integer[] := array[]::integer[];
  v_vinculos_remover bigint[] := array[]::bigint[];
  v_aulas_canceladas_aplicadas integer := 0;
  v_vinculos_removidos_aplicados integer := 0;
begin
  if p_unidade_id is null or p_data_inicio is null or p_data_fim is null
     or p_data_fim < p_data_inicio then
    return jsonb_build_object(
      'status', 'abortado',
      'motivo', 'janela_ou_unidade_invalida',
      'alteracoes_aplicadas', 0
    );
  end if;

  -- Esta rotina Ã© proteÃ§Ã£o operacional de hoje em diante. O webhook individual
  -- v2 continua responsÃ¡vel pela pequena janela de ontem, evitando reescrever
  -- histÃ³ria antiga com uma fotografia corrente.
  if p_data_inicio < v_hoje or p_data_fim > v_hoje + 60 then
    return jsonb_build_object(
      'status', 'abortado',
      'motivo', 'janela_fora_do_limite_operacional',
      'hoje', v_hoje,
      'alteracoes_aplicadas', 0
    );
  end if;

  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'array'
     or jsonb_array_length(p_snapshot) = 0 then
    return jsonb_build_object(
      'status', 'abortado',
      'motivo', 'fotografia_vazia_ou_invalida',
      'alteracoes_aplicadas', 0
    );
  end if;

  -- Falhar fechado em vez de inferir que uma forma nova/incompleta do provedor
  -- significa que toda a grade deixou de existir.
  if exists (
    select 1
    from jsonb_array_elements(p_snapshot) as item(valor)
    where jsonb_typeof(item.valor) <> 'object'
       or coalesce(item.valor ->> 'emusys_id', '') !~ '^[1-9][0-9]*$'
       or jsonb_typeof(item.valor -> 'aluno_chaves') <> 'array'
  ) then
    return jsonb_build_object(
      'status', 'abortado',
      'motivo', 'fotografia_com_estrutura_invalida',
      'alteracoes_aplicadas', 0
    );
  end if;

  select count(distinct (item.valor ->> 'emusys_id')::integer)
    into v_snapshot_aulas
  from jsonb_array_elements(p_snapshot) as item(valor);

  if v_snapshot_aulas = 0 then
    return jsonb_build_object(
      'status', 'abortado',
      'motivo', 'fotografia_sem_aulas_normais',
      'alteracoes_aplicadas', 0
    );
  end if;

  with
  snapshot_bruto as (
    select
      (item.valor ->> 'emusys_id')::integer as emusys_id,
      item.valor -> 'aluno_chaves' as aluno_chaves_json
    from jsonb_array_elements(p_snapshot) as item(valor)
  ),
  snapshot as (
    select
      sb.emusys_id,
      coalesce(
        array_agg(distinct chaves.valor order by chaves.valor)
          filter (where chaves.valor is not null and chaves.valor <> ''),
        array[]::text[]
      ) as aluno_chaves,
      -- Nome e nascimento sao apenas fallback de reconciliacao assistida;
      -- nao provam que a ausencia de um vinculo local corresponde a remocao
      -- no Emusys. Se a aula tiver ao menos um participante sem id Emusys,
      -- ou se a fonte nao trouxe participante algum, toda remocao automatica
      -- de roster daquela aula fica bloqueada.
      coalesce(
        bool_and(chaves.valor ~ '^emusys:[1-9][0-9]*$')
          filter (where chaves.valor is not null and chaves.valor <> ''),
        false
      ) as participantes_com_identidade_estavel
    from snapshot_bruto sb
    left join lateral jsonb_array_elements_text(sb.aluno_chaves_json) as chaves(valor)
      on true
    group by sb.emusys_id
  ),
  -- Trava os fatos locais antes de julgar a ausencia. Se uma sincronizacao mais
  -- nova chegar em paralelo, seu upsert espera esta decisao e depois reativa a
  -- aula com a fotografia mais recente, em vez de ser sobrescrito pela antiga.
  aulas_locais as (
    select a.id, a.emusys_id, a.data_aula
    from public.aulas_emusys a
    where a.unidade_id = p_unidade_id
      -- Categoria desconhecida nao e prova de aula normal: preservar para
      -- revisao em vez de cancelar uma linha legada/ambigua automaticamente.
      and a.categoria = 'normal'
      and coalesce(a.cancelada, false) = false
      and a.data_aula between p_data_inicio and p_data_fim
    for update of a
  ),
  aulas_ausentes as (
    select
      a.id as aula_local_id,
      a.emusys_id,
      null::bigint as vinculo_id,
      case
        when exists (
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
              ap.respondido_por, ap.emusys_registro_presenca
            )
        ) then 'preservar_marcacao_fechada'
        else 'cancelar_aula_ausente'
      end as acao
    from aulas_locais a
    where not exists (
      select 1
      from snapshot s
      where s.emusys_id = a.emusys_id
    )
  ),
  vinculos_ausentes as (
    select
      a.id as aula_local_id,
      a.emusys_id,
      aa.id as vinculo_id,
      case
        when not s.participantes_com_identidade_estavel
          then 'preservar_identidade_ambigua'
        -- Linhas legadas podem trazer aluno_chave=local:<id> embora jÃ¡ tenham
        -- aluno_emusys_id. A comparaÃ§Ã£o abaixo reconhece esse caso. Sem uma
        -- identidade local e externa completa, nÃ£o hÃ¡ como provar que uma
        -- decisÃ£o humana nÃ£o ficaria Ã³rfÃ£: preservar e deixar para revisÃ£o.
        when aa.aluno_id is null or aa.aluno_emusys_id is null
          then 'preservar_identidade_ambigua'
        when exists (
          select 1
          from public.aluno_presenca ap
          where ap.aula_emusys_id = aa.aula_emusys_id
            and ap.aluno_id = aa.aluno_id
            and public.fn_presenca_fecha_chamada(
              coalesce(
                ap.status_presenca,
                case ap.status
                  when 'presente' then 'presente'
                  when 'ausente' then 'falta'
                  else null
                end
              ),
              ap.respondido_por, ap.emusys_registro_presenca
            )
        ) then 'preservar_marcacao_fechada'
        else 'remover_vinculo_ausente'
      end as acao
    from aulas_locais a
    join snapshot s
      on s.emusys_id = a.emusys_id
    join public.aula_alunos_emusys aa
      on aa.aula_emusys_id = a.id
     and aa.unidade_id = p_unidade_id
    where not (
      aa.aluno_chave = any(s.aluno_chaves)
      or (
        aa.aluno_emusys_id is not null
        and ('emusys:' || aa.aluno_emusys_id::text) = any(s.aluno_chaves)
      )
    )
    for update of aa
  ),
  julgadas as (
    select * from aulas_ausentes
    union all
    select * from vinculos_ausentes
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'acao', j.acao,
          'aula_local_id', j.aula_local_id,
          'emusys_aula_id', j.emusys_id,
          'vinculo_id', j.vinculo_id
        )
        order by j.aula_local_id, j.vinculo_id nulls first, j.acao
      ),
      '[]'::jsonb
    ),
    coalesce(
      array_agg(j.aula_local_id) filter (where j.acao = 'cancelar_aula_ausente'),
      array[]::integer[]
    ),
    coalesce(
      array_agg(j.vinculo_id) filter (where j.acao = 'remover_vinculo_ausente'),
      array[]::bigint[]
    )
  into v_detalhe, v_aulas_cancelar, v_vinculos_remover
  from julgadas j;

  if not p_dry_run then
    if cardinality(v_aulas_cancelar) > 0 then
      update public.aulas_emusys a
         set cancelada = true,
             cancelada_origem = 'sync_ausente_emusys'
       where a.id = any(v_aulas_cancelar)
         and a.unidade_id = p_unidade_id
         and coalesce(a.cancelada, false) = false
         and not exists (
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
              ap.respondido_por, ap.emusys_registro_presenca
            )
         );
      get diagnostics v_aulas_canceladas_aplicadas = row_count;
    end if;

    if cardinality(v_vinculos_remover) > 0 then
      delete from public.aula_alunos_emusys aa
       where aa.id = any(v_vinculos_remover)
         and aa.unidade_id = p_unidade_id
         and aa.aluno_id is not null
         and not exists (
           select 1
          from public.aluno_presenca ap
          where ap.aula_emusys_id = aa.aula_emusys_id
            and ap.aluno_id = aa.aluno_id
            and public.fn_presenca_fecha_chamada(
              coalesce(
                ap.status_presenca,
                case ap.status
                  when 'presente' then 'presente'
                  when 'ausente' then 'falta'
                  else null
                end
              ),
              ap.respondido_por, ap.emusys_registro_presenca
            )
         );
      get diagnostics v_vinculos_removidos_aplicados = row_count;
    end if;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'dry_run', p_dry_run,
    'unidade_id', p_unidade_id,
    'janela', jsonb_build_object('inicio', p_data_inicio, 'fim', p_data_fim),
    'fotografia_aulas', v_snapshot_aulas,
    'aulas_canceladas', cardinality(v_aulas_cancelar),
    'vinculos_removidos', cardinality(v_vinculos_remover),
    'aulas_canceladas_aplicadas', v_aulas_canceladas_aplicadas,
    'vinculos_removidos_aplicados', v_vinculos_removidos_aplicados,
    'alteracoes_aplicadas', v_aulas_canceladas_aplicadas + v_vinculos_removidos_aplicados,
    'detalhe', v_detalhe
  );
end;
$function$;

