-- Sol · caixa: a competência declarada casa também com o mês da DESCRIÇÃO da fatura
-- (28/09/2026, CG 17:16, Mayra — "PG pix parcela 10/2026 aluna Julia Silva de Freitas R$457,73").
--
-- 🔴 O que aconteceu: a fatura existe — "Parcela 10/2026 do curso de Canto", R$ 447 + juros
--    = R$ 457,73 —, mas a `competencia` dela no Emusys é 2026-09-01 (o contrato 3678 numera
--    a parcela pelo mês seguinte ao vencimento). `sol_caixa_resolver_envelope_v1` filtrava
--    só por `to_char(competencia,'MM/YYYY')`, então "10/2026" — exatamente o que a equipe
--    lê na tela do Emusys — devolvia `nenhuma_fatura_aberta`, e "09/2026" achava.
--    Provado antes do fix: r1 (10/2026) = nenhuma_fatura_aberta; r2 (09/2026) = ok.
-- ⚠️ Raro, mas real: das faturas "Parcela MM/AAAA" desde jun/2026, 34 têm mês da descrição
--    diferente da competência (CG 26, Barra 8, Recreio 0). Nas outras ~11 mil os dois são
--    iguais e nada muda.
-- ⚠️ Aceita OS DOIS (descrição OU competência), não troca um pelo outro: quem escreveu
--    "09/2026" para a mesma fatura continua achando. Se isso abrir duas candidatas, quem
--    decide é a combinação ÚNICA no centavo que a função já exige — empate vira pergunta,
--    nunca escolha.
-- ⚠️ Mudança mínima por replace() com guarda de contagem sobre a definição VIVA: o corpo
--    não é transcrito à mão. SET/grants sobrevivem ao CREATE OR REPLACE da mesma assinatura.
-- Custo: zero consulta nova; um substring por fatura do universo (≤ janela de 3 meses).

do $mig$
declare
  v_def  text := pg_get_functiondef('public.sol_caixa_resolver_envelope_v1(uuid,jsonb)'::regprocedure);
  v_de   text := $a$or to_char(w.comp, 'MM/YYYY') in (select jsonb_array_elements_text(f->'competencias'))))$a$;
  v_para text := $b$or to_char(w.comp, 'MM/YYYY') in (select jsonb_array_elements_text(f->'competencias'))
                 or substring(w.descr from '^\s*Parcela\s+(\d{2}/\d{4})') in (select jsonb_array_elements_text(f->'competencias'))))$b$;
  v_n    int;
begin
  v_n := (length(v_def) - length(replace(v_def, v_de, ''))) / length(v_de);
  if v_n <> 1 then
    raise exception 'ancora do filtro de competencia: esperava 1 ocorrencia, achou %', v_n;
  end if;
  execute replace(v_def, v_de, v_para);
end
$mig$;
