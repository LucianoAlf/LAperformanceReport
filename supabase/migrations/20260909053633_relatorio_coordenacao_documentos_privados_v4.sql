begin;

-- A tabela compartilha dominios com outros relatorios e possui uma politica
-- permissiva historica. Esta politica restritiva protege somente os dois
-- dominios da coordenacao; os demais consumidores permanecem inalterados.
drop policy if exists fechamento_coordenacao_documentos_privados_v4
  on public.fechamento_mensal_snapshots;

create policy fechamento_coordenacao_documentos_privados_v4
  on public.fechamento_mensal_snapshots
  as restrictive
  for all
  to anon, authenticated
  using (
    dominio not in (
      'relatorio_coordenacao',
      'relatorio_coordenacao_ciclo'
    )
  )
  with check (
    dominio not in (
      'relatorio_coordenacao',
      'relatorio_coordenacao_ciclo'
    )
  );

comment on policy fechamento_coordenacao_documentos_privados_v4
  on public.fechamento_mensal_snapshots is
  'Bloqueia acesso direto aos documentos da coordenacao; a leitura autorizada ocorre somente pelas funcoes dedicadas.';

commit;
