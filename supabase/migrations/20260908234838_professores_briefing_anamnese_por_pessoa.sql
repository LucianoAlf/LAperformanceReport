-- Quem recebe o briefing de uma anamnese.
--
-- A anamnese e da PESSOA, mas ate aqui o aviso era da MATRICULA: notificar-anamnese
-- lia alunos.professor_atual_id da linha ancorada (a que a recepcao clicou no tablet)
-- e avisava UM professor. Medido em 08/09/2026: em 42 das 302 anamneses vinculadas
-- (14%) algum professor da pessoa ficava sem -- 22 delas com curso regular. Das 13
-- ancoradas em banda, em 9 so o professor de banda soube.
--
-- A regra fica AQUI, no banco, e nao dentro da edge: a resolucao por pessoa ja mora em
-- vw_aluno_pessoa_chave, e reimplementar a juncao na edge criaria a segunda fonte de
-- verdade que produziu as duplicatas de renovacao.
--
-- Custo medido da ampliacao: 303 anamneses viram 348 mensagens -- +45 no total
-- historico, media de 1,15 professor por anamnese, pior caso 4. O receio de enxurrada
-- que motivou a decisao de 01/09 (agosto teve 182 anamneses contra 11 em junho) nao se
-- confirma nesse tamanho. Decisao de reverter: Hugo, 08/09/2026.
--
-- A ancora vem primeiro na ordenacao: e ela que preserva o contrato antigo da edge,
-- onde professor_id/queue_id do retorno eram do professor da matricula clicada
-- (scripts/reenvio-anamnese/reenviar-briefings-anamnese.mjs le queue_id).
create or replace function public.get_professores_briefing_anamnese(p_anamnese_id integer)
returns table (
  professor_id integer,
  nome text,
  telefone_whatsapp text,
  cursos text[],
  e_ancora boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with alvo as (
    select an.aluno_id,
           an.unidade_id,
           an.pessoa_chave,
           (select a.professor_atual_id from public.alunos a where a.id = an.aluno_id) as prof_ancora
      from public.anamneses an
     where an.id = p_anamnese_id
       and an.aluno_id is not null
       and an.pessoa_chave is not null
  ),
  matriculas as (
    -- Matriculas ATIVAS da mesma pessoa na mesma unidade. Banda entra: o professor de
    -- banda tambem da aula ao aluno, e a regra que exclui banda e de KPI e carteira,
    -- nao de comunicacao pedagogica.
    select a.professor_atual_id, c.nome as curso
      from alvo t
      join public.vw_aluno_pessoa_chave v
        on v.pessoa_chave = t.pessoa_chave
       and v.unidade_id = t.unidade_id
      join public.alunos a on a.id = v.aluno_id
      left join public.cursos c on c.id = a.curso_id
     where a.status = 'ativo'
       and a.professor_atual_id is not null
  )
  select m.professor_atual_id,
         p.nome,
         p.telefone_whatsapp,
         array_agg(distinct m.curso) filter (where m.curso is not null),
         bool_or(m.professor_atual_id = (select prof_ancora from alvo))
    from matriculas m
    join public.professores p on p.id = m.professor_atual_id
   group by m.professor_atual_id, p.nome, p.telefone_whatsapp
   order by bool_or(m.professor_atual_id = (select prof_ancora from alvo)) desc, p.nome;
$function$;

-- ALTER DEFAULT PRIVILEGES neste schema concede EXECUTE a anon em funcao nova: o
-- revoke nominal e obrigatorio, `revoke from public` nao basta.
revoke all on function public.get_professores_briefing_anamnese(integer) from public, anon;
grant execute on function public.get_professores_briefing_anamnese(integer) to service_role, authenticated;
