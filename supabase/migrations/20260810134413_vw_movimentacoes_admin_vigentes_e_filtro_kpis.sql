-- View que exclui movimentacoes anuladas, e troca da tabela pela view nas
-- funcoes que produzem taxa de renovacao.
--
-- Trocar a REFERENCIA (movimentacoes_admin -> movimentacoes_admin_vigentes) em
-- vez de editar o corpo de funcoes grandes: preserva aliases, joins e toda a
-- logica. Editar corpo grande a mao e o que o CLAUDE.md ja alerta a nao fazer.
--
-- As funcoes referenciam a tabela de duas formas (com e sem `public.`) -- a
-- primeira tentativa desta migration abortou na guarda por so cobrir a forma
-- com schema. O regexp abaixo cobre as duas e ignora movimentacoes_admin_*
-- (matriculas_divergencias_decisoes etc).
--
-- ESCOPO: so as 4 funcoes que produzem taxa de renovacao. As outras ~21 que
-- tocam movimentacoes_admin lidam com evasao, pesquisa e professor, onde
-- anulacao de renovacao nao muda resultado. Se alguma passar a depender disso,
-- trocar a referencia la tambem.

create or replace view public.movimentacoes_admin_vigentes as
  select * from public.movimentacoes_admin where not anulado;

comment on view public.movimentacoes_admin_vigentes is
  'movimentacoes_admin sem as linhas anuladas. Use em KPI; a tabela crua mantem o historico completo, inclusive o que foi desconsiderado.';

revoke all on public.movimentacoes_admin_vigentes from public, anon, authenticated;
grant select on public.movimentacoes_admin_vigentes to authenticated, service_role;

do $$
declare
  r record;
  v_def text;
  v_novo text;
  v_restante integer;
  v_total integer := 0;
begin
  for r in
    select p.oid, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'get_dados_retencao_ia',
        'get_programa_fideliza_dados',
        'get_relatorio_admin_mensal_rico_base_v1',
        'montar_relatorio_admin_mensal_payload_base_v1'
      )
  loop
    v_def := pg_get_functiondef(r.oid);

    -- Guarda: se o alvo nao existe, algo mudou -- aborta em vez de gerar funcao
    -- silenciosamente errada.
    if v_def !~ '\mmovimentacoes_admin(?![_a-z])' then
      raise exception 'ALVO_AUSENTE_EM_%', r.proname;
    end if;

    v_novo := regexp_replace(
      v_def,
      '(public\.)?\mmovimentacoes_admin(?![_a-z])',
      'public.movimentacoes_admin_vigentes',
      'g'
    );

    select count(*) into v_restante
    from regexp_matches(v_novo, '(?<!_)\mmovimentacoes_admin(?![_a-z])', 'g');
    if v_restante > 0 then
      raise exception 'REFERENCIA_CRUA_REMANESCENTE_EM_% (%)', r.proname, v_restante;
    end if;

    execute v_novo;
    v_total := v_total + 1;
    raise notice 'atualizada: %', r.proname;
  end loop;

  if v_total <> 4 then
    raise exception 'ESPERADO_4_FUNCOES_MAS_FORAM_%', v_total;
  end if;
end $$;
