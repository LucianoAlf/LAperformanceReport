-- 5 tabelas em `public` estavam com `anon=arwdDxtm` (TODOS os privilegios, incluindo
-- INSERT/UPDATE/DELETE) e SEM RLS. Sem RLS, a ACL e a unica barreira — entao o papel
-- anonimo podia ler e escrever nelas.
--
-- Origem: o `ALTER DEFAULT PRIVILEGES` deste projeto concede tudo em relacao nova. Esta e a
-- mesma armadilha ja documentada no CLAUDE.md (vale para VIEW e para FUNCTION tambem), e
-- duas destas tabelas foram criadas HOJE pelo proprio trabalho de auditoria — ou seja, o
-- alerta existia e ainda assim o buraco foi reaberto. Por isso a correcao aqui e por lista
-- explicita e conferida, nao por varredura automatica.
--
-- Medido antes: 235 das 322 tabelas de `public` tem `anon=arwdDxtm`. Destas, 207 tem RLS
-- COM policy (a policy segura) e 23 tem RLS sem policy (ninguem le). As 5 abaixo eram as
-- unicas SEM RLS — as unicas de fato expostas.
--
-- ⚠️ `migrations_audit_data_nascimento` guarda DATA DE NASCIMENTO. Dado pessoal legivel por
-- anon era o caso mais grave dos cinco.
--
-- Escolha: revogar a ACL em vez de ligar RLS. Sao tabelas de auditoria/backup, sem consumo
-- pelo app — ninguem alem de `service_role`/`postgres` precisa delas. Ligar RLS exigiria
-- desenhar policy para um consumo que nao existe.
--
-- ⚠️ PENDENTE (decisao do Alf, nao feita aqui): os papeis de agente IA
-- (`sol_acesso_restrito`, `mila_acesso_restrito`, `fabio_agent`, `lia_acesso_restrito`)
-- continuam com LEITURA nas cinco, inclusive na de data de nascimento. Nao foi mexido
-- porque pode ser concessao intencional.
do $mig$
declare
  t text;
  v_restantes int;
  v_alvos constant text[] := array[
    '_auditoria_chave_natural_20260809',
    '_auditoria_reconstrucao_20260809',
    'fechamento_snapshots_backup_20260808',
    'migrations_audit_data_nascimento',
    'health_score_professor_v3_materializacao_execucoes'
  ];
begin
  foreach t in array v_alvos loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                    where n.nspname='public' and c.relname=t and c.relkind='r') then
      raise exception 'ABORTADO: tabela % nao existe', t;
    end if;

    execute format('revoke all on table public.%I from anon', t);
    execute format('revoke all on table public.%I from public', t);
    -- `authenticated` tambem nao precisa: nenhuma delas e consumida pelo app.
    execute format('revoke all on table public.%I from authenticated', t);
    -- Os papeis de agente (Sol/Mila/Fabio/Lia) tinham so leitura; mantida para nao quebra-los.
  end loop;

  -- Prova: nenhuma tabela de public pode ficar com anon podendo escrever e sem RLS.
  select count(*) into v_restantes
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r'
     and not c.relrowsecurity
     and (c.relacl::text like '%anon=arwdDxtm%' or c.relacl::text like '%anon=a%');

  if v_restantes > 0 then
    raise exception 'ABORTADO: ainda restam % tabelas sem RLS com escrita p/ anon', v_restantes;
  end if;
end
$mig$;
