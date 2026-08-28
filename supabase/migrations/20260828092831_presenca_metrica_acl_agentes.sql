-- O kernel metrico e interno. Default privileges historicos dos papeis de
-- agentes concedem SELECT a novas views; a leitura operacional deve continuar
-- exclusivamente pelas RPCs governadas por finalidade.

do $acl$
declare
  v_role text;
begin
  for v_role in
    select rolname
    from pg_roles
    where rolname = any (array[
      'sol_acesso_restrito',
      'lia_acesso_restrito',
      'mila_acesso_restrito',
      'fabio_agent'
    ])
  loop
    execute format(
      'revoke select on public.vw_presenca_ocorrencia_metrica_v2 from %I',
      v_role
    );
  end loop;
end
$acl$;

comment on view public.vw_presenca_ocorrencia_metrica_v2 is
  'Kernel metrico service-only. Agentes consomem exclusivamente as RPCs governadas por finalidade; ausencia Emusys nunca e inferida como falta.';
