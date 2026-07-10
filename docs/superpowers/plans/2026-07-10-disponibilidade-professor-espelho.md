# Disponibilidade do professor - Espelho operacional - Plano de implementacao

**Objetivo:** aproveitar `professores_unidades.disponibilidade` como espelho do Emusys e oferecer a coordenacao uma agenda geral e por professor, sem transformar o LA Report na fonte oficial antes da integracao.

**Fonte oficial no MVP:** Emusys. Mila continua lendo o Emusys. A coordenacao opera a mudanca no Emusys e somente depois confirma o espelho manual no LA Report.

---

## Task 1: Corrigir a persistencia existente

**Files:**
- Modify: `src/components/App/Professores/ProfessoresPage.tsx`
- Modify: `src/components/App/Professores/ModalProfessor.tsx`
- Test: `tests/laTeacherInfra.test.mjs`

- [ ] Preservar `emusys_id`, `payload_emusys`, `validacao_status`, `match_score`, `origem`, `last_seen_em` e demais metadados, atualizando somente `disponibilidade` nos vinculos mantidos.
- [ ] Normalizar chaves de dia conhecidas no carregamento (`Sexta-feira` para `Sexta`) sem sobrescrever o registro antes de uma edicao confirmada.
- [ ] Exibir aviso curto de que a disponibilidade e um espelho manual do Emusys.

## Task 2: Workflow de proposta sem dupla fonte

**Files:**
- Create: `supabase/migrations/20260710130000_disponibilidade_professor_espelho.sql`

- [ ] Criar `disponibilidade_professor_propostas` com snapshot vigente, proposta, status, versao e trilha de decisao.
- [ ] Professor apenas propoe; coordenacao aprova ou rejeita.
- [ ] Aprovacao muda para `aprovada_aguardando_emusys`, sem alterar `professores_unidades.disponibilidade`.
- [ ] Criar RPC de coordenacao que confirma a operacao feita no Emusys e entao atualiza somente a coluna `disponibilidade`, marcando a proposta como `efetivada`.
- [ ] Aplicar RLS e guardar RPCs de professor por `fn_professor_do_usuario()`.

## Task 3: Tela da coordenacao

**Files:**
- Modify: `src/components/App/Professores/TabAgendaProfessores.tsx`
- Create: `src/components/App/Professores/GradeDisponibilidadeProfessores.tsx`

- [ ] Manter a agenda de acoes atual em uma subvisao `Acoes`.
- [ ] Adicionar subvisao `Grade e disponibilidade` com modos `Agenda geral` e `Por professor`.
- [ ] Cruzar disponibilidade espelhada com `aulas_emusys` para distinguir livre, com aula e bloqueado.
- [ ] Permitir aprovar/rejeitar propostas e confirmar o espelhamento somente depois da operacao no Emusys.
- [ ] Usar os componentes, cores e densidade visual existentes no modulo de Professores.

## Task 4: Verificacao visual e funcional

- [ ] Cobrir estados vazio, carregando, conflito, aguardando Emusys e efetivado.
- [ ] Validar desktop e mobile sem sobreposicao.
- [ ] Executar testes, build e inspecao no navegador local.
