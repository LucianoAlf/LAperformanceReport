# Gera a migration do contrato_tipo a partir do corpo VIVO (preserva o
# mojibake literal dos like de descricao, que casa com os dados reais).

body = open('.tmp_def_get_faturas_alunos_financeiro_v1_contrato_tipo_20260817.sql', encoding='utf-8').read()

def troca(antigo, novo, nome):
    global body
    n = body.count(antigo)
    assert n == 1, f'{nome}: ancora aparece {n}x'
    body = body.replace(antigo, novo)

# 1. contador novo
troca(
    "  v_source_missing integer := 0;\n  v_identidade integer := 0;",
    "  v_source_missing integer := 0;\n  v_pagamento_detectado integer := 0;\n  v_identidade integer := 0;",
    'declaracao contador',
)

# 2. decisoes humanas cobrem o motivo novo como cobriam source_missing
troca(
    "      (motivo = 'source_missing' and (",
    "      (motivo in ('source_missing', 'pagamento_detectado_fora_origem') and (",
    'filtro decisoes',
)

# 3. conta o motivo novo
troca(
    "      if v_motivo = 'source_missing' then v_source_missing := v_source_missing + 1;",
    "      if v_motivo = 'source_missing' then v_source_missing := v_source_missing + 1;\n      elsif v_motivo = 'pagamento_detectado_fora_origem' then v_pagamento_detectado := v_pagamento_detectado + 1;",
    'contagem motivo',
)

# 4. emite a chave no resumo
troca(
    "    'source_missing', v_source_missing,\n    'identidade_invalida', v_identidade,",
    "    'source_missing', v_source_missing,\n    'pagamento_detectado', v_pagamento_detectado,\n    'identidade_invalida', v_identidade,",
    'resumo json',
)

header = """-- 23/09/2026 — a camada contrato_tipo (a que a pagina consome de verdade via
-- get_faturas_alunos_financeiro_v1) reconstroi o objeto `reconciliation` do
-- zero e descartava a contagem `pagamento_detectado` emitida pela canonica.
--
--   1. conta 'pagamento_detectado_fora_origem' e devolve `pagamento_detectado`;
--   2. o motivo novo respeita as MESMAS decisoes humanas que aposentavam
--      source_missing — decisao da equipe nao e' reaberta pela prova;
--   3. itens com o motivo novo seguem na fila carregando `prova_pagamento`
--      (caixa + lancamentos Emusys) para a tela mostrar a evidencia.
--
-- Corpo reemitido a partir do dump vivo (pg_get_functiondef): preserva os
-- literais de `descricao` exatamente como estao no banco.

"""

post = """
;

do $pos$
declare
  v_sig text := 'public.get_faturas_alunos_financeiro_v1_contrato_tipo_20260817(uuid,integer,integer,text,text,date)';
  v_def text := pg_get_functiondef(v_sig::regprocedure);
  v_falhas text[] := '{}';
begin
  if v_def not like '%pagamento_detectado_fora_origem%' then
    v_falhas := array_append(v_falhas, 'motivo pagamento_detectado_fora_origem ausente');
  end if;
  if v_def not like '%v_pagamento_detectado%' then
    v_falhas := array_append(v_falhas, 'contador v_pagamento_detectado ausente');
  end if;
  -- camada interna: so' service_role chama (o wrapper v1 e' quem expoe a tela);
  -- a ACL viva e' postgres+service_role e nao deve crescer.
  if not has_function_privilege('service_role', v_sig, 'EXECUTE') then
    v_falhas := array_append(v_falhas, 'service_role SEM execute');
  end if;
  if has_function_privilege('anon', v_sig, 'EXECUTE')
     or has_function_privilege('authenticated', v_sig, 'EXECUTE') then
    v_falhas := array_append(v_falhas, 'ACL cresceu alem de postgres+service_role');
  end if;
  if array_length(v_falhas,1) > 0 then
    raise exception E'POS-CONDICAO contrato_tipo NAO FECHOU:\\n  %', array_to_string(v_falhas, E'\\n  ');
  end if;
  raise notice 'contrato_tipo ok: contador, filtro de decisoes e ACL conferidos';
end $pos$;
"""

out = header + body + post
open('supabase/migrations/20260923180000_reconciliacao_prova_pagamento_contrato_tipo.sql', 'w', encoding='utf-8').write(out)
print('migration reescrita:', len(out), 'chars')
