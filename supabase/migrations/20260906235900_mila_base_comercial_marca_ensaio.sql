-- O LOG DE USO DA BASE NAO SEPARAVA ENSAIO DE PRODUCAO (06/09/2026).
--
-- A migration anterior (mesma data) passou a gravar uma linha por consulta a
-- base. Minutos depois eu percebi o furo: a suite de sombra chama as MESMAS
-- tools com os telefones REAIS das consultoras, e o `DRY` do perfil de sombra
-- so trava a ESCRITA declarada como escrita — consulta e leitura, entao passa.
-- Resultado: cada rodada da suite (24 cenarios) grava dezenas de consultas
-- indistinguiveis das de verdade, e a pergunta "a base esta sendo usada?"
-- passaria a ter uma resposta inflada por mim mesmo.
--
-- 🔴 E EXATAMENTE A CICATRIZ DA SOL, de 31/08: a suite rodava em modo producao
--    sem trocar os registradores, e 62% dos previews do ledger V3 daquela
--    semana (499 de 807) eram artefato de teste, com unidade_id real. Ali o
--    discriminador teve de ser descoberto depois, no formato do message_id.
--    Aqui da para nascer certo — antes de existir a primeira linha suja.
--
-- ⚠️ O parametro novo obriga a DROPAR a assinatura antiga no mesmo commit.
--    `CREATE OR REPLACE` com lista de parametros diferente NAO substitui: cria
--    um overload e deixa a versao antiga orfa. Com DEFAULT no parametro novo,
--    a assinatura nova tambem aceita a lista antiga, as duas viram candidatas e
--    o Postgres recusa com "function is not unique" — foi assim que o
--    `upsert_lead` derrubou o webhook de leads por 21h em 11/08.
--
-- ⚠️ `p_origem` NAO e escolhido pelo modelo: vem do env do processo MCP (o
--    mesmo `DRY` que ja governa as tools de escrita). Modelo nao decide se o
--    que ele esta fazendo conta como producao.

do $patch$
declare
  v_def text; v_novo text; v_n int;
  ANC_SIG constant text := 'mila_base_comercial_v1(p_solicitante_telefone text, p_situacao text DEFAULT NULL::text, p_limite integer DEFAULT 3)';
  SIG_NOVA constant text := 'mila_base_comercial_v1(p_solicitante_telefone text, p_situacao text DEFAULT NULL::text, p_limite integer DEFAULT 3, p_origem text DEFAULT ''producao'')';
  ANC_LOG constant text := '''vazio'', (v_blocos is null)));';
  LOG_NOVO constant text := '''vazio'', (v_blocos is null),' || E'\n' ||
    '            ''origem'', case when lower(coalesce(p_origem,''producao'')) = ''ensaio''' || E'\n' ||
    '                            then ''ensaio'' else ''producao'' end));';
begin
  select pg_get_functiondef(oid) into v_def from pg_proc
   where proname = 'mila_base_comercial_v1' and pronamespace = 'public'::regnamespace;
  if v_def is null then
    raise exception 'mila_base_comercial_v1 nao existe';
  end if;
  if position('p_origem' in v_def) > 0 then
    raise notice 'marca de ensaio ja aplicada — nada a fazer';
    return;
  end if;

  v_n := (length(v_def) - length(replace(v_def, ANC_SIG, ''))) / length(ANC_SIG);
  if v_n <> 1 then
    raise exception 'ancora da assinatura: esperava 1, achei %', v_n;
  end if;
  v_n := (length(v_def) - length(replace(v_def, ANC_LOG, ''))) / length(ANC_LOG);
  if v_n <> 1 then
    raise exception 'ancora do log: esperava 1, achei % (a migration de log rodou?)', v_n;
  end if;

  v_novo := replace(v_def, ANC_SIG, SIG_NOVA);
  v_novo := replace(v_novo, ANC_LOG, LOG_NOVO);
  execute v_novo;

  -- 🔴 dropar a orfa no MESMO commit, senao a proxima chamada por nome cai em
  --    "function is not unique".
  drop function public.mila_base_comercial_v1(text, text, integer);
  raise notice 'assinatura com p_origem criada e a antiga (3 args) dropada';
end $patch$;

revoke all on function public.mila_base_comercial_v1(text, text, integer, text) from public, anon;
grant execute on function public.mila_base_comercial_v1(text, text, integer, text) to service_role;

-- prova
do $prova$
declare v_tel text; v jsonb; v_orig text; v_uma int;
begin
  select telefone into v_tel from governanca.agente_usuarios
   where lower(departamento) = 'comercial' and coalesce(ativo, true) limit 1;

  -- 1) so existe UMA funcao com este nome (a orfa foi dropada de verdade)
  select count(*) into v_uma from pg_proc
   where proname = 'mila_base_comercial_v1' and pronamespace = 'public'::regnamespace;
  if v_uma <> 1 then
    raise exception 'esperava 1 assinatura de mila_base_comercial_v1, achei %', v_uma;
  end if;

  -- 2) chamada de ensaio marca ensaio
  v := mila_base_comercial_v1(v_tel, 'prova de ensaio', 1, 'ensaio');
  if not (v->>'ok')::bool then raise exception 'ensaio falhou: %', v; end if;
  select detalhes->>'origem' into v_orig from automacao_log
   where evento='base_conhecimento' and acao='consulta_base_comercial'
   order by id desc limit 1;
  if v_orig is distinct from 'ensaio' then
    raise exception 'esperava origem=ensaio, veio %', v_orig;
  end if;

  -- 3) chamada sem o parametro continua contando como producao
  v := mila_base_comercial_v1(v_tel, 'prova de producao', 1);
  select detalhes->>'origem' into v_orig from automacao_log
   where evento='base_conhecimento' and acao='consulta_base_comercial'
   order by id desc limit 1;   -- ⚠️ por ID, nao por created_at: as duas provas
                               -- rodam na MESMA transacao e `now()` e fixo nela,
                               -- entao ordenar por tempo e nao-deterministico —
                               -- foi o que reprovou a 1a tentativa desta prova.
  if v_orig is distinct from 'producao' then
    raise exception 'esperava origem=producao por omissao, veio %', v_orig;
  end if;

  raise notice 'marca de ensaio provada nos dois sentidos, 1 assinatura viva';
end $prova$;

-- Limpa as linhas que a suite de sombra ja gravou hoje enquanto o log nascia
-- sem discriminador. Sao artefato conhecido, do intervalo entre as duas
-- migrations desta mesma data — nao ha o que preservar nelas.
delete from automacao_log
 where evento = 'base_conhecimento' and acao = 'consulta_base_comercial'
   and detalhes->>'origem' is null
   and detalhes->>'situacao' not in ('prova de ensaio', 'prova de producao');
