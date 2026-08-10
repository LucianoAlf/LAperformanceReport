-- Anula as 39 renovacoes duplicadas restantes, apuradas contra a API do Emusys.
--
-- CRITERIO: o Emusys abre um CONTRATO novo a cada renovacao, e as parcelas
-- seguintes passam a apontar para ele. Contando contratos que estreiam em 2026
-- por matricula, sai o numero real de renovacoes do aluno no ano.
--
-- Por que nao pelo valor da parcela (criterio da leva anterior, 20260810134205):
--   1. renovacao SEM reajuste nao produz degrau nenhum (Marcello: 417 -> 417);
--   2. juros e multa inflam o valor_pago e criam degrau que nao existe no
--      contrato (Pedro Henrique: 367 -> 456,61 em fev era juros, nao renovacao);
--   3. parcela dividida aparece como duas linhas na mesma competencia
--      (Esther: 406 + 54 em jul).
-- O criterio de contrato e imune aos tres. Rodado sobre os 45 alunos que tinham
-- 2+ renovacoes vigentes em 2026 (93 registros).
--
-- QUAL REGISTRO FICA: o de competencia mais proxima da estreia do contrato novo.
-- Em 24 dos 36 alunos a competencia bate exatamente. Nos outros 12 ela e
-- ANTERIOR -- e renovacao antecipada: a equipe lanca quando negocia, e o
-- contrato so comeca quando o anterior termina. Mesma regra ja aplicada em
-- 20260810134205 (Antonio Jose e Luciene, que tinham 3 registros e ficaram com 2
-- porque aquela leva anulou so um excedente cada -- fechado aqui).
--
-- No empate de competencia, fica o registro mais COMPLETO (valor preenchido e
-- status confirmado). Sem esse desempate a Leticia Vasconcelos perderia o
-- registro confirmado de 420 -> 462 e ficaria com o pendente vazio: os dois sao
-- de fev/2026 e a distancia ate a estreia do contrato (abr) e igual.
--
-- NAO ENTRAM (evidencia insuficiente ou renovacao legitima):
--   * Perola, Gabriel Mello, Kamilly, Maria Clara: tem 2 MATRICULAS e 2
--     contratos novos -- as duas renovacoes sao reais. Perola parecia o caso
--     mais obvio de duplicata (2 registros no mesmo mes, mesmo curso, mesmo
--     valor) e nao era: sao as matriculas 519 e 520 renovando juntas.
--   * Carlos Eduardo, Arthur Quinteiro, Maria Eduarda: bolsistas (mensalidade
--     0 ou 15) -- nao geram parcela, entao nao ha contrato a contar pela fatura.
--   * Daniel Duque: matricula inativa, contrato novo (2572) sem parcela emitida.
-- Esses 5 continuam com 2 registros vigentes, de proposito, e estao listados em
-- docs/auditorias/ para decisao da unidade.
--
-- Evidencia contrato a contrato (serie de parcelas e contratos de cada aluno):
-- docs/auditorias/2026-08-10-duplicatas-renovacao-por-contrato.md
--
-- Nada e deletado: DELETE foi o que produziu o caso Catarina Petrolongo, cuja
-- renovacao o relatorio de julho lista e o banco nao tem mais.

do $$
declare
  v_esperado integer := 39;
  v_afetados integer;
begin
  create temp table _anular (mov_id integer primary key, motivo text) on commit drop;

  insert into _anular (mov_id, motivo) values
  (3132, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-05) = 1 renovacao(oes). Mantido: 2908.'),
  (2781, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-05) = 1 renovacao(oes). Mantido: 3127.'),
  (3137, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-06) = 1 renovacao(oes). Mantido: 3164.'),
  (2829, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-04) = 1 renovacao(oes). Mantido: 2798.'),
  (2457, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-04) = 1 renovacao(oes). Mantido: 2564.'),
  (2870, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-08) = 1 renovacao(oes). Mantido: 3246.'),
  (263, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-02) = 1 renovacao(oes). Mantido: 2440.'),
  (2577, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-04) = 1 renovacao(oes). Mantido: 2725.'),
  (2458, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-03) = 1 renovacao(oes). Mantido: 2559.'),
  (2571, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-04) = 1 renovacao(oes). Mantido: 2710.'),
  (2770, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-06) = 1 renovacao(oes). Mantido: 3067.'),
  (2995, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-06) = 1 renovacao(oes). Mantido: 3067.'),
  (2871, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-07) = 1 renovacao(oes). Mantido: 3225.'),
  (3104, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-07) = 1 renovacao(oes). Mantido: 3225.'),
  (2459, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-04) = 1 renovacao(oes). Mantido: 2557.'),
  (3099, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-09) = 1 renovacao(oes). Mantido: 3245.'),
  (2994, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-07) = 1 renovacao(oes). Mantido: 3376.'),
  (2873, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-08) = 1 renovacao(oes). Mantido: 3243.'),
  (3103, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-08) = 1 renovacao(oes). Mantido: 3242.'),
  (3274, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-09) = 1 renovacao(oes). Mantido: 3142.'),
  (2709, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-03) = 1 renovacao(oes). Mantido: 2569.'),
  (2708, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-03) = 1 renovacao(oes). Mantido: 2567.'),
  (2707, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-03) = 1 renovacao(oes). Mantido: 2568.'),
  (3087, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-05) = 1 renovacao(oes). Mantido: 2848.'),
  (2840, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-08) = 1 renovacao(oes). Mantido: 3100.'),
  (2769, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-08) = 1 renovacao(oes). Mantido: 3117.'),
  (2917, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-08) = 1 renovacao(oes). Mantido: 3117.'),
  (2558, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-02) = 1 renovacao(oes). Mantido: 2455.'),
  (2719, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-03) = 1 renovacao(oes). Mantido: 2573.'),
  (3463, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-09) = 1 renovacao(oes). Mantido: 3525.'),
  (121, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-02) = 1 renovacao(oes). Mantido: 2400.'),
  (3532, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-08) = 1 renovacao(oes). Mantido: 3450.'),
  (3524, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-08) = 1 renovacao(oes). Mantido: 3446.'),
  (3282, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-07) = 1 renovacao(oes). Mantido: 3204.'),
  (3469, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-09) = 1 renovacao(oes). Mantido: 3526.'),
  (227, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-04) = 1 renovacao(oes). Mantido: 2463.'),
  (3324, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-08) = 1 renovacao(oes). Mantido: 3411.'),
  (3523, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-08) = 1 renovacao(oes). Mantido: 3436.'),
  (3465, 'Duplicata: o Emusys abriu 1 contrato(s) novo(s) em 2026 (estreia 2026-09) = 1 renovacao(oes). Mantido: 3527.');

  -- Guarda: so anula o que ainda esta vigente e e mesmo renovacao.
  update public.movimentacoes_admin m
     set anulado = true,
         anulado_motivo = a.motivo,
         anulado_em = now(),
         anulado_por = 'auditoria-emusys-contratos-2026-08-10'
    from _anular a
   where m.id = a.mov_id
     and m.tipo = 'renovacao'
     and not m.anulado;

  get diagnostics v_afetados = row_count;

  if v_afetados <> v_esperado then
    raise exception 'ANULACAO_RENOVACAO_CONTAGEM_INESPERADA: esperado %, afetado %', v_esperado, v_afetados;
  end if;

  raise notice 'Anuladas % renovacoes duplicadas.', v_afetados;
end $$;
