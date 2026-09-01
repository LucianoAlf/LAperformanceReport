-- Complemento da migration anterior (20260901213401).
--
-- A derivacao de `tipo_evasao` existe em DUAS funcoes com o mesmo corpo:
--   * get_relatorio_admin_mensal_rico_base_v1        -> leitura (preenche rotulo ausente)
--   * montar_relatorio_admin_mensal_payload_base_v4  -> CAPTURA (congela o rotulo no snapshot)
--
-- Corrigir so a de leitura foi INERTE para agosto/2026: o rotulo 'interrompido' do Arthur
-- Felipe de Mattos (CG, "Minha Banda Para Sempre") ja estava gravado no payload pela captura,
-- e o primeiro ramo do CASE ("valor gravado no item vence") faz curto-circuito antes de
-- qualquer derivacao. Conferido no snapshot: v1 e v2 trazem tipo_evasao = 'interrompido'.
--
-- Mesma correcao aqui: usar o helper canonico `is_atividade_extra_curso` em vez de decidir
-- "e banda?" apenas por `alunos.tipo_matricula_id = 5`. Assim a captura de setembro em diante
-- nasce alinhada ao gerencial, que sempre decidiu pelo CURSO.
--
-- Agosto/2026 ja esta congelado: tratado na migration seguinte (20260901213906).
--
-- Aprovado por Luciano em 01/09/2026.

do $mig$
declare
  v_def text;
  v_ocorr integer;

  c_de constant text :=
$a$                   when coalesce(a.tipo_matricula_id, 0) = 5 then 'interrompido_banda'$a$;

  c_para constant text :=
$b$                   when coalesce(a.tipo_matricula_id, 0) = 5
                     or public.is_atividade_extra_curso(coalesce(m.curso_id, a.curso_id))
                     then 'interrompido_banda'$b$;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'montar_relatorio_admin_mensal_payload_base_v4';

  if v_def is null then
    raise exception 'ANCORA_AUSENTE: montar_relatorio_admin_mensal_payload_base_v4 nao encontrada';
  end if;

  v_ocorr := (length(v_def) - length(replace(v_def, c_de, ''))) / length(c_de);
  if v_ocorr <> 1 then
    raise exception 'ANCORA_BANDA_CAPTURA: esperado 1, achou %', v_ocorr;
  end if;

  v_def := replace(v_def, c_de, c_para);
  execute v_def;
end
$mig$;
