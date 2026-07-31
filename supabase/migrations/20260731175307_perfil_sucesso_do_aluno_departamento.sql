-- Perfil de departamento do Sucesso do Aluno.
-- Complementa (nao substitui) o perfil dedicado `Sucesso do Aluno - Evasao`,
-- que governa a ACAO sensivel de disparo via helper estrito.
-- Este aqui cobre o acesso operacional do dia a dia: ver e operar o aluno nas
-- unidades vinculadas, sem administrar o sistema.
--
-- Deliberadamente FORA: usuarios.*, permissoes.gerenciar, perfis.gerenciar,
-- configuracoes.gerenciar, alunos.excluir, auditoria.ver e escrita do comercial.
-- E o que separa este perfil de Admin/Gerente (ambos com as mesmas 47).
insert into public.perfis (nome, descricao, nivel, icone, cor, sistema, ativo)
values (
  'Sucesso do Aluno',
  'Departamento de Sucesso do Aluno: acompanhamento, retencao e relacionamento com o aluno',
  30,
  '💚',
  '#10b981',
  false,
  true
)
on conflict do nothing;

-- Reaplicacao remove concessoes acrescentadas fora deste contrato antes de repor.
delete from public.perfil_permissoes pp
using public.perfis pf
where pp.perfil_id = pf.id
  and pf.nome = 'Sucesso do Aluno';

insert into public.perfil_permissoes (perfil_id, permissao_id)
select pf.id, p.id
from public.perfis pf
join public.permissoes p
  on p.codigo in (
    -- nucleo: o aluno
    'alunos.ver', 'alunos.ficha', 'alunos.editar', 'alunos.health_score', 'alunos.whatsapp',
    -- acompanhamento e caixa de entrada
    'administrativo.ver', 'administrativo.caixa-entrada', 'administrativo.recados',
    'administrativo.tarefas', 'administrativo.rotinas', 'administrativo.painel_farmer',
    -- dominio direto do departamento
    'evasoes.ver', 'evasoes.registrar',
    'renovacoes.ver', 'renovacoes.registrar',
    'retencao.plano_acao',
    -- contexto pedagogico e de origem
    'professores.ver', 'professores.carteira',
    'comercial.ver', 'comercial.experimentais.ver',
    -- leitura ampla
    'dashboard.ver', 'metas.ver', 'analytics.ver',
    -- ve a rede somada (as 3 unidades)
    'sistema.consolidado'
  )
 and p.ativo = true
where pf.nome = 'Sucesso do Aluno';
