-- Ensaio SOMENTE LEITURA da 20260929160000 (o "pode" do lote revalida na janela do preview).
-- Roda contra o banco com a migration aplicada; não escreve nada (a função é STABLE).
-- Caso real: CG 29/09, passaportes 10/2026 pagos em 28/09 (irmãos). Esperado:
--   caso_real=true · mes_corrente=true · troca_de_aluno=snapshot_fatura_nao_encontrada
--   soma_errada=snapshot_soma_divergente
\set u '''2ec861f6-023f-4d7b-9927-3960ad8c2a92''::uuid'
\set itens '''[{"aluno_nome":"Bruno Correa Bastos","canonical_fatura_id":"2fbb4642-1fa4-44ce-84ae-02e47a08dde0","categoria":"passaporte","competencia":"10/2026","valor":200,"fatura":{"status":"paga"}},{"aluno_nome":"Mara Lúcia Argento Tinoco Bastos","canonical_fatura_id":"69e72475-9709-467a-ba86-2ee916dc9497","categoria":"passaporte","competencia":"10/2026","valor":200,"fatura":{"status":"paga"}}]''::jsonb'
\set atual '''[{"aluno_nome":"Bruno Correa Bastos","canonical_fatura_id":"1e73a689-cd71-47b2-9ed7-bcf94e3b2fde","categoria":"parcela","competencia":"09/2026","valor":377,"fatura":{"status":"paga"}},{"aluno_nome":"Mara Lúcia Argento Tinoco Bastos","canonical_fatura_id":"3ab5e175-5455-495c-aa2b-3faedf24d689","categoria":"parcela","competencia":"09/2026","valor":377,"fatura":{"status":"paga"}}]''::jsonb'
\set trocado '''[{"aluno_nome":"Bruno Correa Bastos","canonical_fatura_id":"69e72475-9709-467a-ba86-2ee916dc9497","categoria":"passaporte","competencia":"10/2026","valor":200,"fatura":{"status":"paga"}},{"aluno_nome":"Mara Lúcia Argento Tinoco Bastos","canonical_fatura_id":"2fbb4642-1fa4-44ce-84ae-02e47a08dde0","categoria":"passaporte","competencia":"10/2026","valor":200,"fatura":{"status":"paga"}}]''::jsonb'
select 'caso_real' t, public.sol_caixa_validar_multi_aluno_snapshot_v1(:u, :itens, 400, date '2026-09-29')->>'ok' r
union all select 'mes_corrente', public.sol_caixa_validar_multi_aluno_snapshot_v1(:u, :atual, 754, date '2026-09-29')->>'ok'
union all select 'troca_de_aluno', public.sol_caixa_validar_multi_aluno_snapshot_v1(:u, :trocado, 400, date '2026-09-29')->>'motivo'
union all select 'soma_errada', public.sol_caixa_validar_multi_aluno_snapshot_v1(:u, :itens, 450, date '2026-09-29')->>'motivo';
