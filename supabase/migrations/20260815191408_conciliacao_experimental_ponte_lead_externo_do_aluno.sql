-- Campo Grande, ago/2026: taxa experimental -> matricula travada (pendencias_taxa_exp_mat=1)
-- por UM caso — Luana Ferreira de Souza (lead 12160, experimental 1933, aula Emusys 741038).
--
-- ROOT CAUSE (nao e bug do Emusys):
--   A Luana ja era aluna (alunos 244, emusys_student_id=3089) quando fez a experimental.
--   Por isso o GET /aulas devolve o participante com id_lead=0 e id_aluno=3089. O raw
--   preserva isso corretamente (emusys_lead_id=NULL, emusys_aluno_id=3089).
--
--   A matricula local GUARDA a ponte do lead externo: alunos.emusys_lead_id='8663', e a
--   experimental tambem: lead_experimentais.emusys_lead_id=8663. O que a conciliacao NAO
--   fazia era atravessar essa ponte — o lateral raw_emusys so casava o raw por (lead externo)
--   ou (aluno externo -> aluno LOCAL via id=coalesce(le.aluno_id, l.aluno_id, al_origem.id)).
--   Como a Luana nao tinha le.aluno_id nem lead_origem_id, o raw nao casava, e o item caia
--   em 'realizada_sem_presenca_confirmada' => pendencia => taxa bloqueada.
--
--   O agregado (raw_por_unidade) JA a classificava como interna via P10C
--   (emusys_lead_id NULL + emusys_aluno_id set + sem matricula nova/sem passaporte) e a
--   excluia do denominador — por isso denominador=15 com raw_realizadas=16. A divergencia
--   era so o ITEM (classificacao individual) nao enxergar a mesma interna.
--
-- CORRECAO (aditiva, sem tocar no raw nem inventar decisao humana):
--   No lateral raw_emusys de get_conciliacao_experimentais_snapshot_v1, quando o raw so tem
--   id_aluno (id_lead=0 do Emusys), resolve o lead experimental pela matricula local
--   (alunos.emusys_lead_id). Assim o raw casa e a P10C (que ja existe) classifica o item como
--   experimental interna, tirando-o da fila sem mudar numerador nem denominador.
--
--   A taxa sai de 20.0% bloqueada para 20.0% publicavel (numero inalterado).
--
-- Replace guardado no corpo da funcao (nao transcreve os ~800 linhas a mao), com trava que
-- aborta se a ancora nao for encontrada exatamente uma vez.
do $mig$
declare
  v_def text;
  v_ancora text := $anc$
        -- Compatibilidade somente por chaves relacionais legadas materializadas.
        or r.lead_experimental_id = le.id
$anc$;
  v_novo text := $nov$
        -- Ponte externa do lead: o Emusys manda id_lead=0 quando a pessoa ja e aluno e
        -- entrega so id_aluno. Resolve o lead experimental pela matricula local
        -- (alunos.emusys_lead_id), sem criar relacao nem sobrescrever o raw.
        or (
          r.emusys_lead_id is null
          and r.emusys_aluno_id is not null
          and exists (
            select 1
            from public.alunos a_bridge
            where a_bridge.unidade_id = r.unidade_id
              and a_bridge.emusys_student_id = r.emusys_aluno_id::text
              and nullif(btrim(a_bridge.emusys_lead_id), '') in (
                le.emusys_lead_id::text,
                l.emusys_lead_id::text
              )
          )
        )
        -- Compatibilidade somente por chaves relacionais legadas materializadas.
        or r.lead_experimental_id = le.id
$nov$;
  v_ocorrencias integer;
begin
  v_def := pg_get_functiondef(
    'public.get_conciliacao_experimentais_snapshot_v1(uuid,integer,integer,text,date)'::regprocedure
  );

  if v_def is null then
    raise exception 'ABORTADO: funcao get_conciliacao_experimentais_snapshot_v1 nao encontrada';
  end if;

  if length(v_ancora) = 0 then
    raise exception 'ABORTADO: ancora vazia';
  end if;

  v_ocorrencias := (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora);

  if v_ocorrencias <> 1 then
    raise exception 'ABORTADO: esperava 1 ocorrencia da ancora, achei %', v_ocorrencias;
  end if;

  v_def := replace(v_def, v_ancora, v_novo);

  execute v_def;

  raise notice 'get_conciliacao_experimentais_snapshot_v1: ponte lead-externo do aluno aplicada';
end
$mig$;
