-- Fonte ÚNICA do escopo do reenvio de briefings de anamnese (2026-09-04).
-- Qualquer consumidor (script, conferência manual, relatório) lê DAQUI.
-- Não reimplementar a regra em outro lugar.
--
-- Definição de "pendente": não existe entrega CONFIRMADA para o par
-- (anamnese, professor atual) nem pela fila nova (fila_anamnese_sol_hermes.status='enviada')
-- nem pelo caminho antigo (notificacao_log.status='enviado', anterior a 04/08/2026).
--
-- Exclusões deliberadas, decididas com o Hugo em 04/09/2026:
--   * professor_atual_id 62 (Adriana Mesquita) e 55 (Fabricio Costa):
--     telefone vazio no Emusys, sem como conferir o número. NÃO ENVIAR.
--   * anamnese 9 (Liv Ribeiro Oliveira, 25/06): a mesma pessoa preencheu de novo
--     em 13/08 (anamnese 126). Vale a mais recente.
--   * professor do OUTRO curso da mesma pessoa: fora de escopo. A Task 7 do
--     LAPE-19 (avisar todos os professores da pessoa) foi descartada em 01/09
--     pelo Luciano; incluí-los aqui seria implementá-la por outra porta.

with alvo as (
  select
    an.id                       as anamnese_id,
    an.nome_aluno,
    an.created_at               as anamnese_criada_em,
    an.tipo_formulario,
    an.diagnosticos,
    an.cuidado_medico,
    an.medicacao_continua,
    an.necessidade_apoio,
    a.professor_atual_id        as professor_id,
    p.nome                      as professor_nome,
    p.telefone_whatsapp         as professor_telefone,
    u.nome                      as unidade
  from anamneses an
  join alunos a
    on a.id = an.aluno_id
   and a.arquivado_em is null
   and lower(coalesce(a.status, '')) = 'ativo'
   and a.professor_atual_id is not null
  join professores p on p.id = a.professor_atual_id
  left join unidades u on u.id = an.unidade_id
  where an.status = 'completa'
),
pendente as (
  select t.*
  from alvo t
  where not exists (
      select 1 from fila_anamnese_sol_hermes f
      where f.anamnese_id = t.anamnese_id
        and f.professor_id = t.professor_id
        and f.status = 'enviada'
    )
    and not exists (
      select 1 from notificacao_log n
      where n.tipo = 'anamnese_professor'
        and n.status = 'enviado'
        and n.destinatario_id = t.professor_id
        and n.mensagem ilike '%' || t.nome_aluno || '%'
    )
    -- Já existe algo VIVO na fila para este par: o fluxo normal está cuidando.
    -- Sem esta guarda, o reenvio duplicaria o envio em andamento.
    and not exists (
      select 1 from fila_anamnese_sol_hermes f
      where f.anamnese_id = t.anamnese_id
        and f.professor_id = t.professor_id
        and f.status in ('sol_pendente', 'sol_enviando')
    )
    -- Rede contra a corrida medida em 04/09/2026: entre a anamnese ser salva e o
    -- worker entregá-la passa cerca de 1 minuto, e nessa janela ela aparece como
    -- "pendente". Anamnese das últimas 48h é assunto do fluxo normal; se ele
    -- falhar, ela entra no lote seguinte — nunca nos dois ao mesmo tempo.
    and t.anamnese_criada_em < now() - interval '48 hours'
),
-- Respostas que a família digita querendo dizer "não há nada aqui". Mesma lista
-- da edge notificar-anamnese (constante NEGATIVAS), acrescida das formas
-- compostas ("não tem", "não toma") que a edge deixa passar.
neg as (
  select '^\s*(n|na|n[aã]o|no|nenhum[a]?|teste|-+|\.+|n/a|nada|n[aã]o (tem|toma|possui|faz|usa|se aplica))\s*[.!]*\s*$' as p
)
select
  pe.anamnese_id,
  pe.nome_aluno,
  pe.anamnese_criada_em,
  pe.tipo_formulario,
  pe.professor_id,
  pe.professor_nome,
  pe.professor_telefone,
  pe.unidade,
  (
       exists (select 1 from jsonb_array_elements_text(coalesce(pe.diagnosticos, '[]'::jsonb)) d
               where btrim(d) <> '' and d !~* (select p from neg))
    or (coalesce(btrim(pe.cuidado_medico), '')     <> '' and pe.cuidado_medico     !~* (select p from neg))
    or (coalesce(btrim(pe.medicacao_continua), '') <> '' and pe.medicacao_continua !~* (select p from neg))
    or (coalesce(btrim(pe.necessidade_apoio), '')  <> '' and pe.necessidade_apoio  !~* (select p from neg))
  ) as tem_info_saude
from pendente pe
where pe.professor_id not in (62, 55)
  and pe.anamnese_id <> 9
order by tem_info_saude desc, pe.anamnese_criada_em desc;
