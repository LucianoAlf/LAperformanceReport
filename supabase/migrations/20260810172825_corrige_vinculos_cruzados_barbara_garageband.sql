-- As duas matriculas da Barbara Victoria Moreno Ruiz (Recreio) estao com o
-- emusys_matricula_id TROCADO entre si, e a segunda esta com o curso errado.
--
-- No Emusys (GET /matriculas?aluno_id=1415), ela tem duas matriculas ativas:
--   918 -> Bateria,     mensalidade 480 - desconto_condicional 48,80 = 431,20
--   966 -> Garage Band, mensalidade 0 (disciplina_id 23 no Recreio)
--
-- No nosso banco estava:
--   id  442 -> matricula 966 (Garage Band) com valor 431,20 e curso Bateria
--   id 1080 -> matricula 918 (Bateria)     com valor 0,00   e curso Bateria
--
-- Ou seja: os vinculos apontam um para o contrato do outro, e as duas linhas
-- dizem "Bateria". Por isso ela aparece com dois cursos iguais na base -- o que
-- levou a contagem manual de "alunos com 2 cursos" a divergir do sistema.
--
-- O MRR nao muda (431,20 + 0 nos dois arranjos), mas o vinculo errado faz o sync
-- comparar cada linha com o contrato do outro curso, gerando divergencia
-- perpetua na Conciliacao.
--
-- COMO CHEGOU AQUI: em 25/06/2026 a propria Conciliacao aplicou
-- curso_id 38 -> 27 na linha 1080 (matriculas_divergencias id 3032, auto_preview,
-- resolvido). A linha estava CERTA como GarageBand e foi "corrigida" para
-- Bateria. Tres dias antes, o registro id 30 ja avisava
-- `candidatos_emusys_incompativeis_com_tipo_local` para o mesmo aluno.
--
-- ⚠️ O de-para (curso_emusys_depara) esta correto: Recreio + disciplina 23 ->
-- curso 38 (GarageBand, is_projeto_banda). O erro e da aplicacao automatica, nao
-- do mapeamento. Nao mexer no de-para.
--
-- A troca e feita em duas etapas porque emusys_matricula_id precisa ser unico
-- por unidade enquanto os dois valores existirem ao mesmo tempo.
--
-- Depois desta correcao o Recreio fecha: 25 alunos com 2 cursos pela contagem
-- por nome E pela flag is_segundo_curso (antes 26 x 25), 27 matriculas
-- adicionais, 59 de banda, 0 pessoas com flag inconsistente.

do $$
declare
  v_afetados integer;
begin
  -- Etapa 1: libera o 918 usando um valor impossivel como estacionamento.
  update public.alunos set emusys_matricula_id = '__swap_barbara__' where id = 1080;
  get diagnostics v_afetados = row_count;
  if v_afetados <> 1 then
    raise exception 'BARBARA_LINHA_1080_NAO_ENCONTRADA (afetado %)', v_afetados;
  end if;

  -- Etapa 2: 442 assume o contrato de Bateria, que e o valor que ela ja carrega.
  update public.alunos
     set emusys_matricula_id = '918', updated_at = now()
   where id = 442 and emusys_matricula_id = '966';
  get diagnostics v_afetados = row_count;
  if v_afetados <> 1 then
    raise exception 'BARBARA_LINHA_442_ESTADO_INESPERADO (afetado %)', v_afetados;
  end if;

  -- Etapa 3: 1080 vira o Garage Band de verdade (curso 38, projeto de banda).
  update public.alunos
     set emusys_matricula_id = '966',
         curso_id = 38,
         is_segundo_curso = false,
         updated_at = now()
   where id = 1080 and emusys_matricula_id = '__swap_barbara__';
  get diagnostics v_afetados = row_count;
  if v_afetados <> 1 then
    raise exception 'BARBARA_LINHA_1080_ESTADO_INESPERADO (afetado %)', v_afetados;
  end if;
end $$;
