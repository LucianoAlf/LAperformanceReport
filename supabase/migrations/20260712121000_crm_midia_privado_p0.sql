-- P0 crm-midia.
-- Aplicar somente depois que o frontend com renovacao de URLs assinadas estiver publicado.

update storage.buckets
set public = false
where id = 'crm-midia';

do $$
declare
  v_policy record;
begin
  for v_policy in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '') ilike '%crm-midia%'
        or coalesce(with_check, '') ilike '%crm-midia%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', v_policy.policyname);
  end loop;
end;
$$;

create policy crm_midia_leitura_autorizada
on storage.objects
for select
to authenticated
using (
  bucket_id = 'crm-midia'
  and public.fn_usuario_atual_tem_permissao('alunos.whatsapp', null)
);

create policy crm_midia_upload_autorizado
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'crm-midia'
  and public.fn_usuario_atual_tem_permissao('alunos.whatsapp', null)
);
