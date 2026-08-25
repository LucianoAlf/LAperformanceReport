-- `vw_aluno_frequencia_canonica_v1` contava REGISTRO do Emusys, não aula real.
--
-- Mesmo defeito que a frequência do PROFESSOR tinha até 24/08, na view irmã do ALUNO:
-- `evento_chave = 'aula:' || aula_emusys_id`. O id da aula É a duplicata — o Emusys emite
-- cada aula como par turma+individual, a gêmea tem outro id, logo virava outro evento.
--
-- ⚠️ COMO QUASE PASSOU: comparado sobre o histórico INTEIRO o fator dá **1,20** e parece
-- ruído. É diluição — a duplicação turma/individual não existia no começo da base. Medido
-- nas janelas onde o efeito vive (Campo Grande):
--     30 dias: view 2.715 x canônica 1.290  ->  fator **2,10**
--     60 dias: view 5.662 x canônica 2.876  ->  fator **1,97**
-- Medir no agregado errado teria arquivado o caso como "não é nada".
--
-- ⚠️ As TAXAS (`taxa_presenca_30d/60d/geral`) sobrevivem à duplicação, porque numerador e
-- denominador dobram juntos. O que estava errado são as CONTAGENS
-- (`total_eventos_evidencia`, `eventos_confirmados_*`, `presencas_confirmadas_*`) — e é
-- delas que sai `confianca_presenca`, que tem corte por tamanho de amostra.
do $mig$
declare v_def text; v_new text;
begin
  select pg_get_viewdef('public.vw_aluno_frequencia_canonica_v1'::regclass, true) into strict v_def;

  if position('vw_presenca_slot_canonica_v1' in v_def) > 0 then
    raise notice 'frequencia do aluno ja le a canonica por slot'; return;
  end if;

  -- 1) fonte, e traz as colunas de slot que a chave nova precisa
  v_new := replace(v_def,
$a$            p.horario_aula,
            p.professor_id,
            p.curso_nome,
            p.resultado_pedagogico,
            p.possui_conflito,
            p.considera_frequencia_denominador
           FROM vw_aluno_presenca_semantica_v1 p$a$,
$a$            p.horario_aula,
            p.data_hora_inicio,
            p.data_hora_fim,
            p.professor_id,
            p.curso_nome,
            p.resultado_pedagogico,
            p.possui_conflito,
            p.considera_frequencia_denominador
           FROM vw_presenca_slot_canonica_v1 p$a$);
  if v_new = v_def then raise exception 'ancora da fonte nao encontrada'; end if;
  v_def := v_new;

  -- 2) a chave do evento passa a ser o SLOT, nao o id do registro
  v_new := replace(v_def,
$b$                    WHEN p.aula_emusys_id IS NOT NULL THEN 'aula:'::text || p.aula_emusys_id::text$b$,
$b$                    WHEN p.data_hora_inicio IS NOT NULL THEN concat_ws(':'::text, 'slot', p.data_hora_inicio::text, p.data_hora_fim::text, COALESCE(p.professor_id::text, 'sem-professor'::text), COALESCE(lower(btrim(p.curso_nome::text)), 'sem-curso'::text))$b$);
  if v_new = v_def then raise exception 'ancora da evento_chave nao encontrada'; end if;

  execute 'create or replace view public.vw_aluno_frequencia_canonica_v1 as ' || v_new;
end $mig$;

-- ⚠️ Conferir a ACL depois de recriar view neste projeto: `ALTER DEFAULT PRIVILEGES` dá
-- todos os privilegios a papeis novos, e view simples e' auto-atualizavel.
revoke all on public.vw_aluno_frequencia_canonica_v1 from public, anon;
grant select on public.vw_aluno_frequencia_canonica_v1 to authenticated, service_role;;
