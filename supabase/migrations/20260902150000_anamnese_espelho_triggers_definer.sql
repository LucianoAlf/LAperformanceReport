-- LAPE-19 (fix) — os gatilhos do espelho de anamnese rodam como SECURITY DEFINER.
--
-- 20260902093000 revogou fn_sincronizar_anamnese_preenchida_pessoa de public/
-- anon/authenticated de proposito: ela e definer e recebe p_unidade_id do
-- chamador, entao exposta em /rpc/ deixaria qualquer usuario logado marcar
-- aluno de qualquer unidade como anamnese preenchida. O revoke esta certo e
-- fica como esta.
--
-- O que faltou: os tres gatilhos que a chamam eram SECURITY INVOKER, ou seja,
-- rodavam com o role de quem gravou. Fechar a funcao para `authenticated`
-- fechou o proprio gatilho. Em producao, das 18h01 de 01/09 ate 15h de 02/09,
-- todo INSERT feito pelo app quebrou com:
--   permission denied for function fn_sincronizar_anamnese_preenchida_pessoa
-- Atingiu o INSERT em anamneses (app interno grava direto na tabela) e o
-- INSERT em alunos (gatilho da matricula). Zero anamneses salvas no dia 02/09
-- contra ~12/dia na semana anterior.
--
-- Os testes de 20260902093000 nao pegaram porque sao regex sobre o .sql: nenhum
-- caminho de escrita foi exercido como `authenticated`.
--
-- Correcao: os gatilhos viram definer. Funcao que retorna trigger nao e exposta
-- pelo PostgREST, entao isso nao abre superficie nova. Como o dono e `postgres`,
-- que tem o EXECUTE, a chamada passa sem afrouxar a ACL da funcao auxiliar.
--
-- RLS: os dois `update` daqui passam a rodar como dono da tabela e nao sao mais
-- filtrados por policy, mas ambos ja escopam por `unidade_id = new.unidade_id`
-- -- o alcance continua sendo a unidade da linha que disparou o gatilho.
--
-- Corpos identicos aos de 20260902093000; muda so `security definer` +
-- `set search_path` (obrigatorio em definer, contra sequestro de search_path).

create or replace function public.fn_atualizar_aluno_anamnese()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.aluno_id is not null and new.status = 'completa' then
    perform public.fn_sincronizar_anamnese_preenchida_pessoa(new.unidade_id, new.pessoa_chave);
  end if;
  return new;
end;
$function$;

create or replace function public.fn_vincular_anamnese_pendente()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_chave text;
begin
  update public.anamneses set
    aluno_id = new.id,
    vinculo_status = 'vinculado'
  where vinculo_status = 'pendente'
    and aluno_id is null
    and unidade_id = new.unidade_id
    and lower(btrim(nome_aluno)) = lower(btrim(new.nome))
    and tipo_formulario = new.classificacao;

  select pessoa_chave into v_chave
    from public.vw_aluno_pessoa_chave where aluno_id = new.id;

  perform public.fn_sincronizar_anamnese_preenchida_pessoa(new.unidade_id, v_chave);
  return new;
end;
$function$;

create or replace function public.fn_alunos_vinculo_emusys_anamnese()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_chave text;
begin
  select pessoa_chave into v_chave
    from public.vw_aluno_pessoa_chave where aluno_id = new.id;
  perform public.fn_sincronizar_anamnese_preenchida_pessoa(new.unidade_id, v_chave);
  return new;
end;
$function$;
