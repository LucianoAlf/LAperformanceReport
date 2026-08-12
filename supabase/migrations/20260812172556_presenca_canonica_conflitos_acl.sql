-- A tabela nasceu com RLS, mas as default privileges do projeto também deram
-- ACL direta a papéis de API. A leitura chega pela RPC SECURITY DEFINER; não
-- há motivo para expor a tabela pelo PostgREST.
revoke all on table public.aluno_presenca_conflitos
  from public, anon, authenticated;

grant all on table public.aluno_presenca_conflitos to service_role;
