begin;

-- Em 05/09/2026 o fornecedor passou a fazer contrato_assinado=true cobrir
-- assinaturas manuais e eletronicas, sem alterar o formato do payload.
-- Preservamos os corpos vigentes das RPCs e trocamos somente o rotulo de false.
do $migration$
declare
  v_assinatura regprocedure;
  v_definicao text;
  v_antigo constant text := 'then ''sem_assinatura_eletronica''';
  v_novo constant text := 'then ''nao_assinado''';
  v_ocorrencias integer;
begin
  foreach v_assinatura in array array[
    'public.get_situacao_alunos_v1(uuid,date,boolean)'::regprocedure,
    'public.get_contrato_assinatura_aluno_v1(integer)'::regprocedure
  ]
  loop
    select pg_get_functiondef(v_assinatura) into v_definicao;
    v_ocorrencias := (
      length(v_definicao) - length(replace(v_definicao, v_antigo, ''))
    ) / length(v_antigo);

    if v_ocorrencias <> 1 then
      raise exception 'contrato_assinado_semantica: esperado 1 estado antigo em %, encontrado %',
        v_assinatura::text, v_ocorrencias;
    end if;

    execute replace(v_definicao, v_antigo, v_novo);
  end loop;
end;
$migration$;

revoke all on function public.get_situacao_alunos_v1(uuid, date, boolean)
  from public, anon;
grant execute on function public.get_situacao_alunos_v1(uuid, date, boolean)
  to authenticated, service_role, sol_acesso_restrito;

revoke all on function public.get_contrato_assinatura_aluno_v1(integer)
  from public, anon;
grant execute on function public.get_contrato_assinatura_aluno_v1(integer)
  to authenticated, service_role, sol_acesso_restrito;

commit;
