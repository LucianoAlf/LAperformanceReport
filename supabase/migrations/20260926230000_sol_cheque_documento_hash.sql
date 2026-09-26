-- Sol cheques: hash do CPF/CNPJ do emitente, sem o documento sair em claro (26/09/2026)
--
-- A Sol lê o CPF/CNPJ impresso no cheque e precisa mandá-lo como HMAC-SHA256 com a
-- chave `emusys_cpf_hmac_key_v1` — é o que `sol_cheque_resolver_fatura_v1` compara
-- (p_emitente_documento_hash) e o que o Super Folha aceita (emitente_documento_hash;
-- ele recusa CPF em claro). A chave mora no Vault e a Sol não a tem, de propósito:
-- guardar a chave na VPS espalharia o segredo que protege a base inteira de CPFs.
-- Esta função recebe o documento em trânsito (TLS, PostgREST), devolve só o digest
-- e não grava nada — o mesmo padrão do spec 2026-09-19 (CPF normalizado enviado de
-- forma transitória a uma RPC restrita a service_role).
--
-- ⚠️ CPF (11) usa `private.calcular_emusys_cpf_hmac` — é o MESMO digest que já está
--    em `emusys_cpf_hmac_vinculos`, senão o resolver nunca casaria.
-- ⚠️ CNPJ (14) usa a mesma chave e o mesmo algoritmo, inline: a função privada
--    recusa 14 dígitos, e empresa também emite cheque.
-- ⚠️ Documento inválido devolve NULL (nunca erro com o valor na mensagem: erro de
--    RPC vai para log do PostgREST).
-- ⚠️ Só service_role. `sol_acesso_restrito` (login direto da Sol) não precisa:
--    o runtime do caixa entra com a service key.
-- Custo: uma chamada por cheque lido; lote típico tem 2-6 cheques, poucos lotes/semana.

create or replace function public.sol_cheque_documento_hash_v1(p_documento text)
returns text
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'private', 'vault', 'extensions'
as $function$
declare
  v_dig text := regexp_replace(coalesce(p_documento, ''), '\D', '', 'g');
  v_secret text;
begin
  if v_dig ~ '^[0-9]{11}$' then
    return private.calcular_emusys_cpf_hmac(v_dig);
  end if;
  if v_dig !~ '^[0-9]{14}$' then
    return null;
  end if;
  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'emusys_cpf_hmac_key_v1'
   limit 1;
  if v_secret is null or v_secret !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  return encode(extensions.hmac(convert_to(v_dig, 'UTF8'), decode(v_secret, 'hex'), 'sha256'), 'hex');
end;
$function$;

revoke all on function public.sol_cheque_documento_hash_v1(text) from public, anon, authenticated;
grant execute on function public.sol_cheque_documento_hash_v1(text) to service_role;

comment on function public.sol_cheque_documento_hash_v1(text) is
  'HMAC-SHA256 (chave emusys_cpf_hmac_key_v1) do CPF/CNPJ lido no cheque pela Sol. Nao grava; devolve NULL para documento invalido. So service_role.';

-- Prova no mesmo passo: a ACL ficou restrita.
do $prova$
declare v_acl text;
begin
  select proacl::text into v_acl from pg_proc where oid = 'public.sol_cheque_documento_hash_v1(text)'::regprocedure;
  if v_acl ~ '(^|[{,])(anon|authenticated)=' or v_acl ~ '(^|[{,])=X' then
    raise exception 'PROVA: ACL aberta demais: %', v_acl;
  end if;
end $prova$;

notify pgrst, 'reload schema';
