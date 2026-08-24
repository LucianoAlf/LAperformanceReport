-- A Gabi saiu da empresa. E a troca revelou que o nome da equipe morava em DOIS lugares
-- que já discordavam entre si.
--
-- Fontes encontradas (24/08/2026):
--   1. `unidades.farmers_nomes`  -> cabeçalho do relatório diário ("👥 Gabriela e Jhonatan")
--   2. `get_programa_fideliza_dados` -> hardcoded num CASE, alimenta o Fideliza+
--   3. `staff_unidade` -> carrossel de boas-vindas ao aluno novo
--
-- ⚠️ AS DUAS PRIMEIRAS JÁ DIVERGIAM: `farmers_nomes` dizia Recreio = "Fernanda e Vitória"
-- e o Fideliza+ dizia "Fernanda e Daiana". É a mesma doença que gerou a rachadura de
-- presença hoje — dois lugares guardando o mesmo fato. Por isso a correção não é trocar
-- nos dois: é o Fideliza+ passar a LER de `unidades`, que vira a fonte única.
--
-- ⚠️ O apelido não existia em `unidades` (o Fideliza+ mostra "Gabi & Jhon", não o nome
-- completo), então entra como coluna nova em vez de se perder na unificação.
--
-- ⚠️ NÃO reescrevi histórico: os relatórios de julho em `fila_relatorios_whatsapp` dizem
-- "Gabriela e Jhonatan" e continuam dizendo — naquele dia era verdade. Também ficaram
-- intactos `caixas_diarios.observacoes` e `inventario.observacoes` (registro de fato
-- ocorrido), a pesquisa de evasão (fala de uma ALUNA Gabriela) e as 479 mensagens de
-- campanha (leads chamados Gabi, outras pessoas).

alter table public.unidades add column if not exists farmers_apelidos text[];

comment on column public.unidades.farmers_apelidos is
  'Apelidos da dupla administrativa, na mesma ordem de farmers_nomes. Usado pelo Fideliza+. Fonte UNICA junto com farmers_nomes — nao hardcodar nome de equipe em funcao (get_programa_fideliza_dados fazia isso e divergiu do relatorio diario).';

update public.unidades
   set farmers_nomes = array['Mayra','Jhonatan'],
       farmers_apelidos = array['Mayra','Jhon']
 where id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';

-- ⚠️ Recreio fica com o que `farmers_nomes` diz (Fernanda e Vitória). O Fideliza+ dizia
-- "Fernanda e Daiana" — uma das duas estava errada, e a de `unidades` é a que alimenta o
-- relatório que a equipe lê todo dia. Se a dupla certa for outra, corrige aqui, num lugar só.
update public.unidades set farmers_apelidos = array['Fefe','Vi']
 where id = '95553e96-971b-4590-a6eb-0201d013c14d';

update public.unidades set farmers_apelidos = array['Duda','Arthur']
 where id = '368d47f5-2d88-4475-bc14-ba084a9a348e';

do $mig$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_programa_fideliza_dados';

  if position('farmers_apelidos' in v_def) > 0 then
    raise notice 'fideliza ja le da unidade'; return;
  end if;

  -- ⚠️ Troca o CASE INTEIRO (abertura + WHENs + ELSE + END). Tirar só os WHENs deixa
  -- `CASE mt.unidade_id ELSE ... END`, que nao compila.
  -- ⚠️ A unidade e' `mt.unidade_id` (a linha do resultado), NAO `p_unidade_id`, que vem
  -- NULL no consolidado e faria todas as unidades mostrarem "Equipe".
  v_new := replace(v_def,
$a$    'farmers', CASE mt.unidade_id
      WHEN '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid THEN jsonb_build_object('nomes', 'Gabriela e Jhonatan', 'apelidos', 'Gabi & Jhon')
      WHEN '95553e96-971b-4590-a6eb-0201d013c14d'::uuid THEN jsonb_build_object('nomes', 'Fernanda e Daiana', 'apelidos', 'Fefe & Dai')
      WHEN '368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid THEN jsonb_build_object('nomes', 'Eduarda e Arthur', 'apelidos', 'Duda & Arthur')
      ELSE jsonb_build_object('nomes', 'Equipe', 'apelidos', 'Equipe')
    END,$a$,
$a$    'farmers', (
      select jsonb_build_object(
        'nomes', coalesce(nullif(array_to_string(un.farmers_nomes, ' e '), ''), 'Equipe'),
        'apelidos', coalesce(nullif(array_to_string(un.farmers_apelidos, ' & '), ''),
                             nullif(array_to_string(un.farmers_nomes, ' & '), ''), 'Equipe'))
      from public.unidades un where un.id = mt.unidade_id
    ),$a$);

  if v_new = v_def then raise exception 'ancora do CASE de farmers nao encontrada'; end if;
  execute v_new;
end $mig$;

-- Carrossel de boas-vindas: a Gabi sai de cena agora.
-- ⚠️ NAO renomeei a linha para Mayra de proposito: `foto_url` e' NOT NULL e apontava para
-- `staff-fotos/cg/gabi.jpg` — renomear poria o rosto da Gabi sob o nome da Mayra, pior que
-- o problema original. A Mayra entra quando a foto dela existir no bucket.
update public.staff_unidade set ativo = false
 where id = '8b8cbbc9-004f-4fa7-8edf-2448eeb7f666';
