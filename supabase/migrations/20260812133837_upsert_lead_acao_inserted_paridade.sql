-- A upsert_lead de 11 args (criada em 20260811160000 junto com data_nascimento) passou a
-- gravar v_action := 'created' onde a versão anterior gravava 'inserted'. Esse valor vai
-- para leads_automacao_log.acao e para o JSON de retorno.
--
-- Quebra a aba Automação de Leads: TabAutomacaoLeads.tsx mapeia ['inserted','lead_inserido']
-- para o badge "Novos" e usa 'inserted' no filtro. Há 1.433 'inserted' no log e ZERO
-- 'created' — a função nova nasceu ambígua e nunca chegou a rodar, então nada depende do
-- valor novo. Restaurar 'inserted' é a mudança de menor risco.
--
-- O corpo NÃO é transcrito à mão: é lido de pg_get_functiondef e reescrito com guarda.
do $migration$
declare
  v_def   text;
  v_novo  text;
  v_oid   oid;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'upsert_lead'
    and pg_get_function_identity_arguments(p.oid) =
        'p_nome text, p_telefone text, p_email text, p_unidade_id uuid, p_curso text, '
        'p_canal text, p_source_id integer, p_source_type text, p_arquivar boolean, '
        'p_data_contato date, p_data_nascimento date';

  if v_oid is null then
    raise exception 'upsert_lead de 11 args não encontrada — abortando sem alterar nada';
  end if;

  v_def := pg_get_functiondef(v_oid);

  if position('v_action := ''created'';' in v_def) = 0 then
    raise exception 'trecho "v_action := ''''created'''';" não encontrado — corpo mudou, abortando';
  end if;

  v_novo := replace(v_def, 'v_action := ''created'';', 'v_action := ''inserted'';');

  if position('v_action := ''created'';' in v_novo) <> 0 then
    raise exception 'sobrou ocorrência de created após o replace — abortando';
  end if;

  execute v_novo;
end
$migration$;
