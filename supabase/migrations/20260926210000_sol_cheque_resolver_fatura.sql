-- Sol cheques: resolve emitente do cheque -> fatura candidata.
-- Por que: a Sol passa a ler o PDF do lote de cheques no grupo do financeiro
-- (pedido Alf 26/09, contrato Docs/handoffs/2026-09-26-sol-cheques-lote-deposito
-- no Super Folha). Para mandar emusys_fatura_id no POST cheques-sol ela precisa
-- resolver, no nosso lado: emitente (nome impresso ou CPF/CNPJ em HMAC) -> pessoa
-- -> fatura. Esta RPC devolve as candidatas rankeadas; a decisao de qual mandar
-- (ou mandar sem) fica no runtime.
--
-- Sinais, em ordem de forca:
--   1) documento: hash HMAC do CPF do emitente -> private.emusys_cpf_hmac_vinculos
--      + emusys_pessoas_documentos (cpf cru hasheado na hora, guard CASE p/ CNPJ).
--      Nao usa resolver_emusys_cpf_hmac porque ela exige service_role e a Sol
--      entra como sol_acesso_restrito.
--   2) recebimento: lancamento 'entrada' sem conta ("<Emitente> (Cheque Pre
--      Datado <bom_para>)") -> emusys_fatura_id direto (pre-datado registrado).
--   3) nome: emitente ~ responsavel_nome/aluno_nome em emusys_pessoas_documentos
--      e alunos (todos os status — pagador de ex-aluno tambem paga com cheque).
--   4) fallback: emitente nao achou -> candidatas = faturas da unidade com valor
--      proximo (cheque paga recente ou aberta), p/ a Sol listar "de quem e?".
--
-- Situacao NAO e decidida aqui: fatura 'paga' volta com ja_quitada=true para o
-- Super Folha decidir retirar_do_malote — cheque cobrindo parcela ja quitada
-- por outro meio e caso real (Pix posterior).

create or replace function public.sol_cheque_resolver_fatura_v1(
  p_unidade_id uuid,
  p_emitente_nome text default null,
  p_valor numeric default null,
  p_bom_para date default null,
  p_emitente_documento_hash text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_role text := coalesce(auth.role(), '');
  v_emitente text := unaccent(lower(btrim(coalesce(p_emitente_nome, ''))));
  v_sids bigint[] := '{}';
  v_fat_ids bigint[] := '{}';
  v_via text := null;
  v_pessoas jsonb := '[]'::jsonb;
  v_cands jsonb;
begin
  if p_unidade_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'sem_unidade');
  end if;
  if v_role not in ('service_role', 'sol_acesso_restrito')
     and not public.is_admin()
     and not (p_unidade_id in (select public.get_user_unidade_ids())) then
    return jsonb_build_object('ok', false, 'motivo', 'acesso_negado');
  end if;

  -- 1) documento do emitente (hash HMAC-SHA256 do CPF, chave emusys_cpf_hmac_key_v1)
  if coalesce(p_emitente_documento_hash, '') ~ '^[0-9a-f]{64}$' then
    with doc as (
      select v.emusys_aluno_id::bigint as sid
        from private.emusys_cpf_hmac_vinculos v
       where v.unidade_id = p_unidade_id
         and v.cpf_hmac = lower(p_emitente_documento_hash)
         and v.emusys_aluno_id is not null
      union
      select d.emusys_student_id::bigint
        from emusys_pessoas_documentos d
       where d.unidade_id = p_unidade_id
         and d.emusys_student_id ~ '^[0-9]+$'
         and (
           (case when d.responsavel_cpf ~ '^[0-9]{11}$'
                 then private.calcular_emusys_cpf_hmac(d.responsavel_cpf) end)
             = lower(p_emitente_documento_hash)
           or
           (case when d.aluno_cpf ~ '^[0-9]{11}$'
                 then private.calcular_emusys_cpf_hmac(d.aluno_cpf) end)
             = lower(p_emitente_documento_hash)
         )
    )
    select coalesce(array_agg(distinct sid), '{}') into v_sids from doc;
    if cardinality(v_sids) > 0 then v_via := 'documento'; end if;
  end if;

  -- 2) recebimento: entrada sem conta com o emitente na descricao ("<Nome> (Cheque
  --    Pre Datado dd/mm/aaaa)") — carrega fatura_id direto desde ago/2026.
  if length(v_emitente) >= 4 then
    select coalesce(array_agg(distinct l.emusys_fatura_id), '{}')
      into v_fat_ids
      from financeiro_emusys_lancamentos l
     where l.unidade_id = p_unidade_id
       and l.natureza = 'entrada'
       and l.conta_descricao is null
       and l.forma_pagamento_descricao ilike '%cheque%'
       and l.emusys_fatura_id is not null
       and public.sol_nome_mesma_pessoa_v1(
             v_emitente, unaccent(lower(btrim(split_part(l.descricao, '(', 1)))))
       and word_similarity(
             v_emitente, unaccent(lower(btrim(split_part(l.descricao, '(', 1))))) >= 0.45
       and (p_valor is null or abs(l.valor - p_valor) <= 2);
    if cardinality(v_fat_ids) > 0 then v_via := coalesce(v_via, 'recebimento'); end if;
  end if;

  -- 3) nome do emitente = responsavel ou aluno (pessoas_documentos tem todos os
  --    status; alunos complementa quem ainda nao caiu no espelho)
  if length(v_emitente) >= 4 then
    with nom as (
      select d.emusys_student_id::bigint as sid, d.aluno_nome, d.responsavel_nome
        from emusys_pessoas_documentos d
       where d.unidade_id = p_unidade_id
         and d.emusys_student_id ~ '^[0-9]+$'
         and (
           (d.responsavel_nome is not null
             and public.sol_nome_mesma_pessoa_v1(v_emitente, unaccent(lower(d.responsavel_nome)))
             and word_similarity(v_emitente, unaccent(lower(d.responsavel_nome))) >= 0.45)
           or (d.aluno_nome is not null
             and public.sol_nome_mesma_pessoa_v1(v_emitente, unaccent(lower(d.aluno_nome)))
             and word_similarity(v_emitente, unaccent(lower(d.aluno_nome))) >= 0.45)
         )
      union
      select a.emusys_student_id::bigint, a.nome, a.responsavel_nome
        from alunos a
       where a.unidade_id = p_unidade_id
         and a.emusys_student_id ~ '^[0-9]+$'
         and (
           (a.responsavel_nome is not null
             and public.sol_nome_mesma_pessoa_v1(v_emitente, unaccent(lower(a.responsavel_nome)))
             and word_similarity(v_emitente, unaccent(lower(a.responsavel_nome))) >= 0.45)
           or (a.nome_normalizado is not null
             and public.sol_nome_mesma_pessoa_v1(v_emitente, a.nome_normalizado)
             and word_similarity(v_emitente, a.nome_normalizado) >= 0.45)
         )
    )
    select coalesce(v_sids || array_agg(distinct n.sid), v_sids),
           coalesce(jsonb_agg(distinct jsonb_build_object(
                     'aluno_nome', n.aluno_nome, 'responsavel_nome', n.responsavel_nome)),
                    '[]'::jsonb)
      into v_sids, v_pessoas
      from nom n;
    if v_via is null and cardinality(v_sids) > 0 then v_via := 'nome'; end if;
  end if;

  -- 4) faturas candidatas: aluno(s) resolvido(s), fatura direta do recebimento,
  --    ou fallback por valor quando o emitente nao consta no cadastro
  with cand as (
    select
      f.emusys_fatura_id,
      f.id as la_report_fatura_id,
      f.competencia,
      f.data_vencimento,
      f.status,
      f.valor_original,
      f.valor_pago,
      f.data_pagamento,
      f.payload->>'forma_pagamento_transacao' as forma_pagamento,
      al.nome::text as aluno_nome,
      al.responsavel_nome::text as responsavel_nome,
      case when f.emusys_fatura_id = any(v_fat_ids) then 'recebimento'
           else v_via end as via,
      (f.status = 'paga') as ja_quitada,
      round((
        (case when f.emusys_fatura_id = any(v_fat_ids) then 0.55
              when v_via = 'documento' then 0.50
              when v_via = 'nome' then 0.30
              else 0 end)
        + (case when p_valor is not null and abs(f.valor_pago - p_valor) < 0.005 then 0.35
                when p_valor is not null and abs(
                       f.valor_original - coalesce(f.desconto_fixo,0) - coalesce(f.desconto_condicional,0)
                       - p_valor) < 0.005 then 0.30
                when p_valor is not null
                     then greatest(0, 0.10 - abs(coalesce(f.valor_pago, f.valor_original) - p_valor) * 0.01)
                else 0 end)
        + (case when p_bom_para is not null and f.competencia = date_trunc('month', p_bom_para)::date then 0.20
                when p_bom_para is not null and abs(f.data_vencimento - p_bom_para) <= 10 then 0.12
                else 0 end)
        + (case when f.status = 'paga'
                 and f.payload->>'forma_pagamento_transacao' ilike '%cheque%' then 0.10
                else 0 end)
        + (case when f.status = 'aberta' then 0.05 else 0 end)
      )::numeric, 3) as score
    from emusys_faturas f
    left join alunos al
      on al.unidade_id = f.unidade_id
     and al.emusys_student_id = f.emusys_student_id::text
    where f.unidade_id = p_unidade_id
      and (
        f.emusys_fatura_id = any(v_fat_ids)
        or f.emusys_student_id = any(v_sids)
        or (
          cardinality(v_sids) = 0 and cardinality(v_fat_ids) = 0
          and p_valor is not null
          and abs(coalesce(f.valor_pago, f.valor_original) - p_valor) <= 2
          and (f.status = 'aberta'
               or (f.status = 'paga' and f.data_pagamento >= current_date - 90))
        )
      )
  )
  select coalesce(jsonb_agg(row_to_json(c.*) order by c.score desc,
                  c.data_pagamento desc nulls last, c.data_vencimento), '[]'::jsonb)
    into v_cands
    from (select * from cand order by score desc, data_pagamento desc nulls last,
          data_vencimento limit 8) c;

  return jsonb_build_object(
    'ok', true,
    'emitente', jsonb_build_object(
      'resolvido', cardinality(v_sids) > 0 or cardinality(v_fat_ids) > 0,
      'via', v_via,
      'pessoas', v_pessoas
    ),
    'candidatas', v_cands
  );
end;
$function$;

revoke all on function public.sol_cheque_resolver_fatura_v1(uuid, text, numeric, date, text)
  from public, anon;
grant execute on function public.sol_cheque_resolver_fatura_v1(uuid, text, numeric, date, text)
  to service_role, sol_acesso_restrito, authenticated;

comment on function public.sol_cheque_resolver_fatura_v1 is
  'Resolve emitente de cheque (nome/CPF-HMAC/valor/bom-para) a faturas candidatas da unidade. Caminho da Sol p/ preencher emusys_fatura_id no POST cheques-sol do Super Folha. Leitura only.';

notify pgrst, 'reload schema';
