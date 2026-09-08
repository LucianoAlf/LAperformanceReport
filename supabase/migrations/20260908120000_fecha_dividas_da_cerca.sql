-- Fecha três dívidas deixadas em aberto pelas Fatias 0-3 (08/09/2026).
--
-- ═══ 1. `unidades` voltou a ser legível pelo papel da Sol ═══════════════════
--
-- ⚠️ A cerca da Fatia 0 revogou SELECT em 360 tabelas e levou `unidades` junto.
--    Só que ela é tabela de REFERÊNCIA de 3 linhas com nome de escola, e a
--    política `anon_select_unidades` já a expõe ao papel ANÔNIMO com
--    `using (true)` — ou seja, fechá-la para a Sol não protegia nada e ainda
--    criou incoerência: `mila_acesso_restrito`, `fabio_agent` e
--    `lia_acesso_restrito` continuavam lendo, só a Sol não.
--
--    Sintoma medido: qualquer SQL da Sol que resolvesse unidade por NOME
--    (`where nome='Campo Grande'`) morria com `permission denied`. As RPCs do
--    caixa não sentiram porque são todas SECURITY DEFINER — mas isso é sorte
--    de arquitetura, não desenho.
--
-- ⚠️ Devolver `unidades` NÃO afrouxa a cerca: as 359 tabelas com dado de
--    aluno, financeiro e conversa seguem fechadas. Referência pública ≠ dado.
--
-- ═══ 2. R18 deixa de ser fail-open permanente ═══════════════════════════════
--
-- ⚠️ `radar_detectar_calor_atendimento_v1` é função SQL, não edge — dava para
--    entrar na rodada desde o começo e eu deixei de fora, então R18 ("lead
--    preso no bot") ficava `vigente` para sempre por falta de prova de rodada.
--    Entrando na rodada, ela passa a sanar como as outras.
--
-- ⚠️ Ela tem parâmetro (`p_horas_minimas`); o laço da rodada chama com o
--    default, que é o mesmo que o cron horário dela já usa.
--
-- ═══ 3. Quem atende a REDE deixa de ser recusado ════════════════════════════
--
-- 🔴 ERRO DE LEITURA MEU, corrigido com dado. Eu tratei "colaborador
--    administrativo sem unidade" como CADASTRO INCOMPLETO e fiz o resolvedor
--    recusar (fail-closed). Fui checar quem são: **Fabi Valdevino e Jessyca
--    Viana** — e a Fabi já recebe o relatório de presença CONSOLIDADO das 3
--    unidades. Sem unidade ali não significa "faltou preencher", significa
--    **atende a rede**. Sucesso do Aluno não é de uma unidade.
--
--    Fail-closed contra dado ausente é certo; fail-closed contra dado que
--    significa outra coisa é só recusar trabalho legítimo.
--
-- ⚠️ Isso NÃO lhes dá o placar da unidade: `sol_porta_numeros_da_unidade_v1`
--    recusa por NÍVEL (`acima_do_seu_papel`), não por escopo — as duas seguem
--    `operacional` e continuam bloqueadas lá. O que ganham é a lista de
--    trabalho com aluno, que é literalmente o que elas fazem.

-- ── 1 ──────────────────────────────────────────────────────────────────────
grant select on table public.unidades to sol_acesso_restrito;

-- ── 2 ──────────────────────────────────────────────────────────────────────
do $rodada$
declare v_def text; n int; velho text;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc
   where proname='radar_rodada_diaria_v1' and pronamespace='public'::regnamespace;

  velho := '      (''matricula_sem_anamnese'', ''radar_detectar_matricula_sem_anamnese_v1()'')';
  n := (length(v_def) - length(replace(v_def, velho, ''))) / greatest(length(velho),1);
  if n <> 1 then raise exception 'ANCORA do laco de detectores: esperava 1, achei %', n; end if;

  v_def := replace(v_def, velho,
    velho || ',' || chr(10) ||
    '      (''calor_atendimento'',      ''radar_detectar_calor_atendimento_v1()'')');

  execute v_def;
  raise notice 'radar_rodada_diaria_v1: calor_atendimento entrou na rodada';
end $rodada$;

revoke all on function public.radar_rodada_diaria_v1() from public, anon;
grant execute on function public.radar_rodada_diaria_v1() to service_role;

-- ⚠️ O mapa regra→detector é DERIVADO do corpo das funções; a sincronização
--    agora encontra R18 sozinha, mas o apelido precisa constar do laço acima
--    (é a única parte escrita à mão, e é o que a rodada de fato chama).
do $sync$
declare v_def text; n int; velho text;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc
   where proname='radar_sincronizar_detectores_v1' and pronamespace='public'::regnamespace;

  velho := '    (''radar_detectar_matricula_sem_anamnese_v1'', ''matricula_sem_anamnese'')';
  n := (length(v_def) - length(replace(v_def, velho, ''))) / greatest(length(velho),1);
  if n <> 1 then raise exception 'ANCORA da lista de detectores: esperava 1, achei %', n; end if;

  v_def := replace(v_def, velho,
    velho || ',' || chr(10) ||
    '    (''radar_detectar_calor_atendimento_v1'',      ''calor_atendimento'')');

  -- a guarda de órfãs não precisa mais abrir exceção para `sql_atendimento`
  velho := '    and r.origem not in (''llm_conversa'', ''sql_atendimento'')';
  n := (length(v_def) - length(replace(v_def, velho, ''))) / greatest(length(velho),1);
  if n <> 1 then raise exception 'ANCORA da guarda de orfas: esperava 1, achei %', n; end if;
  v_def := replace(v_def, velho, '    and r.origem <> ''llm_conversa''');

  execute v_def;
  raise notice 'radar_sincronizar_detectores_v1: R18 passa a ser classificada';
end $sync$;

revoke all on function public.radar_sincronizar_detectores_v1() from public, anon;
grant execute on function public.radar_sincronizar_detectores_v1() to service_role;

select public.radar_sincronizar_detectores_v1();

-- ── 3 ──────────────────────────────────────────────────────────────────────
do $escopo$
declare v_def text; n int; velho text;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc
   where proname='sol_resolver_escopo_v1' and pronamespace='public'::regnamespace;

  velho := '      elsif v_quem.unidade_id is null then';
  n := (length(v_def) - length(replace(v_def, velho, ''))) / greatest(length(velho),1);
  if n <> 1 then raise exception 'ANCORA do ramo sem unidade: esperava 1, achei %', n; end if;

  v_def := replace(v_def, velho,
    '      elsif v_quem.unidade_id is null and v_pedida is null then' || chr(10) ||
    '        -- 🔴 Sem unidade no cadastro NAO significa cadastro incompleto: significa' || chr(10) ||
    '        --    que a pessoa ATENDE A REDE. Sao a Fabi e a Jessyca (Sucesso do Aluno),' || chr(10) ||
    '        --    e a Fabi ja recebe o relatorio de presenca CONSOLIDADO das 3 unidades.' || chr(10) ||
    '        --    A versao anterior as recusava — fail-closed contra dado que significa' || chr(10) ||
    '        --    outra coisa e so recusar trabalho legitimo.' || chr(10) ||
    '        -- ⚠️ Isto NAO lhes da o placar: `sol_porta_numeros_da_unidade_v1` recusa' || chr(10) ||
    '        --    por NIVEL (`acima_do_seu_papel`), nao por escopo. Seguem operacional.' || chr(10) ||
    '        v_uid := null;' || chr(10) ||
    '        v_unome := ''Rede (3 unidades)'';' || chr(10) ||
    '        v_out := null;' || chr(10) ||
    '      elsif v_quem.unidade_id is null then');

  execute v_def;
  raise notice 'sol_resolver_escopo_v1: quem atende a rede deixa de ser recusado';
end $escopo$;

revoke all on function public.sol_resolver_escopo_v1(text, text) from public, anon;
grant execute on function public.sol_resolver_escopo_v1(text, text)
  to service_role, sol_operacional, sol_tatico, sol_estrategico;

-- ── prova ──────────────────────────────────────────────────────────────────
do $prova$
declare t_rede text; t_op text; v jsonb; v_r18 text; v_sem_det int;
begin
  -- 1. `unidades` legível pelo papel da Sol
  if not has_table_privilege('sol_acesso_restrito','unidades','SELECT') then
    raise exception 'sol_acesso_restrito continua sem ler unidades';
  end if;
  -- e a cerca segue de pé onde importa
  if has_table_privilege('sol_acesso_restrito','alunos','SELECT') then
    raise exception 'a cerca caiu: o papel restrito voltou a ler `alunos`';
  end if;

  -- 2. R18 classificada e nenhuma regra ativa com sinal aberto sem detector
  select detector into v_r18 from radar_regras where codigo='R18';
  if v_r18 is distinct from 'calor_atendimento' then
    raise exception 'R18 devia apontar para calor_atendimento, aponta para %', coalesce(v_r18,'(nulo)');
  end if;
  select jsonb_array_length(radar_sincronizar_detectores_v1()->'sem_detector_com_sinal_aberto')
    into v_sem_det;
  if v_sem_det > 0 then raise exception '% regra(s) ainda sem detector', v_sem_det; end if;

  -- 3. quem atende a rede passa, e continua sem o placar
  select telefone into t_rede from governanca.agente_usuarios
   where nome='Fabi Valdevino' limit 1;
  v := sol_resolver_escopo_v1(t_rede, null);
  if not coalesce((v->>'ok')::bool,false) then
    raise exception 'quem atende a rede continua recusado: %', v;
  end if;
  if v->>'escopo' <> 'rede' or v->>'publico' <> 'operacional' then
    raise exception 'escopo/publico inesperado: % / %', v->>'escopo', v->>'publico';
  end if;
  v := sol_porta_numeros_da_unidade_v1(t_rede, null, null, null);
  if v->>'motivo' is distinct from 'acima_do_seu_papel' then
    raise exception 'o placar deveria seguir bloqueado para operacional, veio: %', v;
  end if;

  -- e quem TEM unidade continua preso a ela
  select telefone into t_op from governanca.agente_usuarios
   where lower(departamento)='administrativo' and lower(nivel)='colaborador'
     and unidade_id is not null and coalesce(ativo,true) limit 1;
  v := sol_resolver_escopo_v1(t_op, null);
  if v->>'escopo' <> 'unidade' then
    raise exception 'quem tem unidade virou rede — o ramo novo vazou: %', v;
  end if;

  raise notice 'prova: unidades legivel (alunos NAO) · R18=% · rede passa como operacional e segue sem placar · unidade unica intacta', v_r18;
end $prova$;
