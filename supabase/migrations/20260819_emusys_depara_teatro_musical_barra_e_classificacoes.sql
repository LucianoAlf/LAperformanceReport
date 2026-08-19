-- Resolvendo o que o payload do Emusys já responde (Alf, 2026-08-19).

-- ── 1. DE-PARA: disciplina 34 da BARRA = "Teatro Musical" ───────────────────
-- ⚠️ O id de disciplina do Emusys é POR UNIDADE: o mesmo 34 é "Teatro Musical" na Barra
-- e "Teoria Musical IND" no catálogo de Campo Grande. Por isso o de-para tem unidade_id
-- na chave — mapear global daria o curso errado (e `cursos.id = 34` por acaso é
-- "Teoria Musical", uma coincidência de número que tornaria o engano fácil).
-- O contrato do Tito Lapa Cazarim (matrícula 668) tem 3 disciplinas: Musicalização para
-- Bebês (2), Power Kids (22) e Teatro Musical (34). Só a 34 não tinha de-para na Barra.
insert into curso_emusys_depara (unidade_id, emusys_disciplina_id, curso_id, emusys_nome, atualizado_em, status_mapeamento)
select u.id, 34, 41, 'Teatro Musical', now(), 'mapeado'
from unidades u where u.nome = 'Barra'
on conflict (unidade_id, emusys_disciplina_id) do update
   set curso_id = excluded.curso_id,
       emusys_nome = excluded.emusys_nome,
       atualizado_em = now(),
       status_mapeamento = 'mapeado';

update matriculas_divergencias
   set resolvido = true, updated_at = now(),
       analise_sol = 'Resolvida: de-para criado — disciplina 34 da Barra e Teatro Musical (curso 41).'
 where resolvido = false and tipo_divergencia = 'disciplina_nao_mapeada';

-- ── 2. LUCAS ALVES VASCONCELOS: bolsista integral ──────────────────────────
-- Emusys: bolsa = true, valor_total = 0, nr_faturas = 0. Ele já está com parcela 0 aqui,
-- só a CLASSIFICAÇÃO estava REGULAR. O payload responde sozinho.
update alunos a
   set tipo_matricula_id = (select id from tipos_matricula where codigo = 'BOLSISTA_INT'),
       updated_at = now()
 where a.emusys_matricula_id = '2626'
   and coalesce(a.valor_parcela,0) = 0
   and not exists (select 1 from matriculas_campos_fixados f
                    where f.aluno_id = a.id and f.campo = 'tipo_matricula_id');

update matriculas_divergencias md
   set resolvido = true, updated_at = now(),
       analise_sol = 'Resolvida: Emusys marca bolsa=true e valor_total=0; classificado como BOLSISTA_INT.'
 where md.resolvido = false and md.tipo_divergencia = 'classificacao_divergente'
   and exists (select 1 from alunos a join tipos_matricula t on t.id = a.tipo_matricula_id
                where a.id = md.aluno_id and t.codigo = 'BOLSISTA_INT');

-- ── 3. RENATO VITORINO PANDOLPHO: falso positivo de trancado ───────────────
-- Contrato "sem faturas e sem cobranca automatica" é o ESPERADO para matrícula TRANCADA
-- (trancado não gera parcela). O valor de 427 é o valor real do contrato dele e continua
-- correto para quando voltar. Não é divergência — é a regra de trancamento.
update matriculas_divergencias md
   set resolvido = true, updated_at = now(),
       analise_sol = 'Resolvida: matricula TRANCADA nao emite fatura por definicao; nr_faturas=0 e esperado, nao divergencia. Valor do contrato preservado.'
 where md.resolvido = false and md.tipo_divergencia = 'valor_divergente'
   and exists (select 1 from alunos a where a.id = md.aluno_id and a.status = 'trancado');
