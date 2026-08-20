-- `automacao_log.status` tem CHECK que so aceita 'ok' | 'warn' | 'erro'. A versao anterior gravava
-- 'aviso', a insercao violava a constraint e caia no exception handler — o alerta de motivo
-- desconhecido nunca era registrado, em silencio, que e exatamente o problema que ele existe para
-- evitar. Pego no teste em transacao com rollback (o INSERT resolvia o motivo certo, mas o caso
-- do motivo desconhecido nao deixava rastro).

create or replace function public.fn_resolver_motivo_saida_movimentacao_admin()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_motivo_id integer;
  v_texto text;
begin
  if new.tipo not in ('evasao', 'nao_renovacao', 'aviso_previo') then
    return new;
  end if;

  -- decisao ja tomada (webhook, formulario ou humano) nao e sobrescrita
  if new.motivo_saida_id is not null then
    return new;
  end if;

  v_texto := nullif(btrim(coalesce(new.motivo, '')), '');

  if v_texto is null then
    return new;
  end if;

  select ms.id
    into v_motivo_id
  from public.motivos_saida ms
  where ms.nome_normalizado = upper(v_texto)
    and ms.ativo = true
  limit 1;

  if v_motivo_id is not null then
    new.motivo_saida_id := v_motivo_id;
    return new;
  end if;

  -- texto sem correspondente no catalogo: segue NULL (comportamento atual), mas deixa rastro.
  -- o log nunca pode derrubar a escrita da movimentacao.
  begin
    insert into public.automacao_log (aluno_nome, aluno_id, evento, acao, status, detalhes)
    values (
      new.aluno_nome,
      new.aluno_id,
      'movimentacao_admin',
      'motivo_saida_desconhecido',
      'warn',
      jsonb_build_object(
        'motivo_texto', v_texto,
        'tipo', new.tipo,
        'movimentacao_id', new.id,
        'unidade_id', new.unidade_id,
        'origem', tg_op,
        'efeito', 'pesquisa de evasao fica bloqueada em motivo_nao_catalogado ate cadastrar o motivo'
      )
    );
  exception when others then
    raise warning 'fn_resolver_motivo_saida_movimentacao_admin: falha ao logar motivo desconhecido (%): %', v_texto, sqlerrm;
  end;

  return new;
end;
$function$;
