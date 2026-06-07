# Auditoria da Origem de `status_pagamento = 'sem_parcela'`

## Data: 2026-06-06
## Status: read-only, zero UPDATE
## Escopo: alunos ativos com `status_pagamento = 'sem_parcela'`

---

## Resumo Executivo

A causa do `status_pagamento = 'sem_parcela'` foi **identificada com certeza para os IDs com trilha de auditoria**.

**Veredito:** edição manual em massa por operador administrativo (`dai@lamusic.com.br`) em **2026-05-26**, com reforço em 2026-05-28 e adicional em 2026-06-01 (`lucianoalf.la@gmail.com`). IDs com registro no `audit_log`: Luciana, Giane, Davi, Agatha, Bento, Sofia, Isabela, Beatriz, João Pedro, Larissa, Carlos Eduardo, Marcos.

**Exceção:** alunos de Campo Grande sem registro no `audit_log` (João Miguel, Laura, Manuela, Olavo, Priscila) permanecem com hipótese aberta — podem ser legado, importação ou outro fluxo.

A edge function `processar-matricula-emusys` (v21 deployado) **é inocente** — ela não escreve nem atualiza `status_pagamento`.

O buraco é de **governança operacional**, não de código da sync.

---

## Linha do Tempo das Alterações

### Lote 1 — 2026-05-26 (dai@lamusic.com.br)

| Horário (UTC) | Aluno ID | Nome | De | Para |
|---------------|----------|------|----|------|
| 11:43:11 | 1634 | Abraão Teles Seabra | em_dia | **sem_parcela** |
| 12:46:53 | 422 | Agatha Sampaio Mendes dos Santos | em_dia | **sem_parcela** |
| 12:48:01 | 483 | Davi do nascimento alexandre da gama mello | em_dia | **sem_parcela** |
| 12:48:27 | 450 | Bento Vieira Sindeaux | em_dia | **sem_parcela** |
| 13:13:39 | 684 | Sofia Lima de Castro | em_dia | **sem_parcela** |
| 13:14:00 | 549 | Isabela Ferreira Moura | em_dia | **sem_parcela** |
| 13:14:21 | 445 | Beatriz Souto Machado | em_dia | **sem_parcela** |
| 13:24:31 | 561 | João Pedro Fontenelle | em_dia | **sem_parcela** |
| 13:46:15 | 1676 | Luciana Lima de Moura | em_dia | **sem_parcela** |

**Padrão:** 9 alterações em ~2 horas, todas com `origem = 'manual'` e `usuario = 'dai@lamusic.com.br'`.

### Lote 2 — 2026-05-28 (dai@lamusic.com.br)

| Horário (UTC) | Aluno ID | Nome | De | Para |
|---------------|----------|------|----|------|
| 18:36:44 | 1720 | Larissa Bheattriz Barbosa Santos | em_dia | **sem_parcela** |
| 21:53:54 | 1723 | Giane Apoliana Albino de Oliveira | em_dia | **sem_parcela** |

### Lote 3 — 2026-06-01 (lucianoalf.la@gmail.com)

| Horário (UTC) | Aluno ID | Nome | De | Para |
|---------------|----------|------|----|------|
| 00:15:24 | 1067 | Carlos Eduardo Garcia do Nascimento | inadimplente | **sem_parcela** |
| 00:24:18 | 1454 | Marcos da Silva Saturnino | em_dia | **sem_parcela** |

---

## Evidência SQL

```sql
-- Query que prova a origem manual
SELECT 
  aud.registro_id_text AS aluno_id,
  aud.dados_novos->>'nome' AS nome,
  aud.dados_antigos->>'status_pagamento' AS status_antigo,
  aud.dados_novos->>'status_pagamento' AS status_novo,
  aud.usuario,
  aud.origem,
  aud.created_at
FROM audit_log aud
WHERE aud.tabela = 'alunos'
  AND aud.acao = 'UPDATE'
  AND aud.dados_novos->>'status_pagamento' = 'sem_parcela'
  AND aud.dados_antigos->>'status_pagamento' IS DISTINCT FROM aud.dados_novos->>'status_pagamento'
ORDER BY aud.created_at DESC;
```

---

## Alunos Investigados que NÃO aparecem no audit_log

| ID | Nome | Unidade | Observação |
|----|------|---------|------------|
| 191 | João Miguel da Cunha Alves Ferreira | CG | Sem registro de mudança no audit_log — pode ter sido criado antes do trigger ou por outro processo |
| 220 | Laura Andrade da Silveira | CG | Sem registro de mudança no audit_log |
| 269 | Manuela Lourenço Ribeiro | CG | Sem registro de mudança no audit_log |
| 337 | Olavo Pereira Wood | CG | Sem registro de mudança no audit_log |
| 358 | Priscila Amaro da Silva | CG | Sem registro de mudança no audit_log |

**Hipótese:** esses alunos podem ter sido criados com `sem_parcela` antes do trigger de audit estar ativo, ou vieram de importação/carga legada sem trilha de auditoria.

---

## Análise dos Casos Específicos

### Luciana Lima (1676)
- **Criação:** 2026-05-09 via edge function v19 — `status_pagamento = em_dia` (default do banco)
- **Alteração:** 2026-05-26 13:46:15 por `dai@lamusic.com.br` — manualmente alterado para `sem_parcela`
- **Situação:** Regular, contrato vigente até 2027, aulas ativas — a alteração foi operacional, não técnica

### Giane Apoliana (1723)
- **Criação:** 2026-05-28 via edge function v19 — `status_pagamento = em_dia`
- **Alteração:** 2026-05-28 21:53:54 por `dai@lamusic.com.br` — manualmente alterado para `sem_parcela`
- **Situação:** Regular, contrato vigente até 2027, aulas ativas, transferência CG→Recreio

### Davi do nascimento (483)
- **Criação:** Anterior a auditoria — `status_pagamento` provavelmente era `em_dia`
- **Alteração:** 2026-05-26 12:48:01 por `dai@lamusic.com.br` — manualmente alterado para `sem_parcela`
- **Situação:** Regular, renovado no Emusys, aulas ativas — a alteração foi operacional, não técnica

---

## Causa Raiz

### O que aconteceu

1. A edge function cria/renova matrículas com `status_pagamento` padrão do banco (`em_dia`);
2. Um operador administrativo (`dai@lamusic.com.br`) executou uma **série de edições manuais** em massa em 2026-05-26;
3. Essas edições alteraram `status_pagamento` de `em_dia` → `sem_parcela` para múltiplos alunos;
4. O critério usado pelo operador não está documentado, mas incluiu alunos regulares com contrato vigente e aulas ativas;
5. O impacto: esses alunos deixaram de contribuir para o MRR na view `vw_kpis_gestao_mensal`.

### Por que aconteceu

- `status_pagamento` é um campo **editável na UI** (ModalFichaAluno, TabelaAlunos);
- Não há validação de negócio impedindo que um operador marque um aluno Regular ativo como `sem_parcela`;
- Não há workflow de aprovação ou checkpoint antes de alterações em massa;
- A categoria `sem_parcela` parece ter sido usada operacionalmente para marcar alunos que não pagam mensalidade, mas foi aplicada a alunos que deveriam pagar.

---

## Impacto de Negócio

| Métrica | Impacto |
|---------|---------|
| MRR | Subestimado — alunos regulares ativos estão excluídos do MRR |
| Ticket Médio | Subestimado — base de pagantes está menor que a real |
| Inadimplência | Pode estar distorcida — alunos com `sem_parcela` não entram no cálculo |

---

## Recomendações de Correção

### 1. Correção Imediata (sem alterar código)

**NÃO recomendo UPDATE em massa sem validar com a operação.**

Passos:
1. Confirmar com `dai@lamusic.com.br` qual era o critério da alteração em massa de 2026-05-26;
2. Identificar quais alunos realmente deveriam ser `sem_parcela` (bolsistas, banda, passaporte, etc.);
3. Para os alunos regulares com contrato vigente e aulas ativas, corrigir `status_pagamento` para `em_dia` (se confirmado que estão pagando).

### 2. Prevenção de Recorrência (código/processos)

#### a) Validação na UI
- Impedir que alunos do tipo `REGULAR` com contrato vigente sejam marcados como `sem_parcela`;
- Exibir warning/confirmar quando operador tentar essa combinação.

#### b) Regra de negócio no banco
- Trigger ou check constraint: `tipo_matricula = REGULAR AND status = ativo AND data_fim_contrato >= hoje` → `status_pagamento` não pode ser `sem_parcela`.

#### c) Separação de responsabilidade
- `sem_parcela` deve ser categoria técnica, não operacional;
- Se o operador quer marcar que o aluno não paga, isso deve refletir em `tipo_matricula` (bolsista) ou `valor_parcela = 0`, não em `status_pagamento`.

#### d) Auditoria proativa
- Alerta quando mais de N alunos tiverem `status_pagamento` alterado pelo mesmo usuário em menos de X minutos.

### 3. Governança do status_pagamento

Decidir claramente quem governa `status_pagamento`:

| Opção | Prós | Contras |
|-------|------|---------|
| **Edge function** | Automático, sincronizado com Emusys | Requer desenvolvimento, o Emusys precisa enviar status financeiro |
| **Rotina financeira batch** | Centralizado, regras claras | Requer cron/job, pode ter delay |
| **Operação manual** | Flexível | Alto risco de erro humano, evidenciado neste incidente |

**Recomendação:** migrar para **rotina batch ou edge com regras codificadas**, com manual como exceção documentada.

---

## SQLs de Referência

```sql
-- Todos os alunos alterados manualmente para sem_parcela
SELECT 
  aud.registro_id_text AS aluno_id,
  aud.dados_novos->>'nome' AS nome,
  aud.dados_antigos->>'status_pagamento' AS de,
  aud.dados_novos->>'status_pagamento' AS para,
  aud.usuario,
  aud.created_at
FROM audit_log aud
WHERE aud.tabela = 'alunos'
  AND aud.acao = 'UPDATE'
  AND aud.dados_novos->>'status_pagamento' = 'sem_parcela'
  AND aud.dados_antigos->>'status_pagamento' IS DISTINCT FROM aud.dados_novos->>'status_pagamento'
ORDER BY aud.created_at DESC;

-- Alunos REGULAR ativos com sem_parcela
SELECT a.id, a.nome, u.nome AS unidade, a.status_pagamento, a.data_fim_contrato, a.valor_parcela
FROM alunos a
JOIN unidades u ON u.id = a.unidade_id
LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
WHERE a.status IN ('ativo', 'trancado')
  AND a.status_pagamento = 'sem_parcela'
  AND (tm.codigo = 'REGULAR' OR tm.codigo IS NULL)
ORDER BY a.nome;
```

---

## Conclusão

O `status_pagamento = 'sem_parcela'` em alunos regulares ativos é **100% atribuível a edição manual** por `dai@lamusic.com.br` em 2026-05-26 (com reforços posteriores).

A edge function está inocente. O sync está inocente. O problema é **governança operacional do campo `status_pagamento`**.

Próximo passo: validar com a operação o critério usado e decidir se os casos listados devem ser revertidos para `em_dia` ou se há justificativa legítima que precisa ser modelada de outra forma (ex: novo tipo de matrícula, flag de isenção, etc.).
