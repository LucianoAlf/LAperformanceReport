# Auditoria Cruzada v2: Alunos Ativos com `status_pagamento = 'sem_parcela'`

## Data: 2026-06-06
## Status: SELECT-only, nenhum UPDATE executado
## Correções após validação cruzada com Emusys e presenças

---

## Correções da Versão Anterior

| Item | v1 (errado) | v2 (corrigido) |
|------|-------------|----------------|
| **Olavo (337)** | "Provável erro de status" → evadido | **Removido da correção.** Emusys confirma ativo, contrato vigente, pago. `movimentacoes_admin` está contraditória/desatualizada e deve ser tratada como divergência de movimentação |
| **Giane (1723)** | "evasao registrada" | **Evasão pertence a outro `aluno_id` (1026, CG).** ID 1723 (Recreio) é matrícula nova com presença confirmada (2026-06-03). Não tem movimentação de saída própria e configura **transferência interna CG → Recreio** |
| **Alunos "sem movimentação"** | Classificados como passaporte/órfão | **Vários têm presença recente confirmada no banco.** Não são órfãos |
| **Davi (483)** | Falso positivo confirmado | **Mantém:** ativo no Emusys, presença 2026-06-03 |

---

## Evidência de Presenças Recentes (aluno_presenca)

| ID | Aluno | Unidade | Curso | Total Aulas | Última Aula | Aulas 30d | Presentes | Diagnóstico |
|----|-------|---------|-------|-------------|-------------|-----------|-----------|-------------|
| 1676 | Luciana Lima | Recreio | Canto | 6 | **2026-06-06** | 6 | 4 | **ATIVA com aulas** — sync falhou |
| 549 | Isabela Ferreira | Recreio | Canto | 23 | **2026-06-06** | 10 | 21 | **ATIVA com aulas** |
| 445 | Beatriz Souto | Recreio | Teclado | 21 | **2026-06-06** | 16 | 18 | **ATIVA com aulas** |
| 450 | Bento Vieira | Recreio | Musicalização Infantil | 21 | **2026-06-06** | 7 | 14 | **ATIVA com aulas** |
| 1723 | Giane Apoliana | Recreio | Teclado | 2 | **2026-06-03** | 2 | 2 | **ATIVA com aulas** — matrícula nova |
| 483 | Davi do nascimento | Recreio | Musicalização Prep. | 23 | **2026-06-03** | 8 | 12 | **ATIVA com aulas** — sync falhou |
| 269 | Manuela Lourenço | CG | Teclado | 29 | **2026-06-01** | 8 | 6 | **ATIVA com aulas** |
| 191 | João Miguel | CG | Violino | 25 | **2026-05-28** | 6 | 15 | **ATIVA com aulas** |
| 1720 | Larissa Bheattriz | Recreio | Canto | 2 | **2026-05-28** | 2 | 2 | **ATIVA com aulas** — matrícula nova |
| 422 | Agatha Sampaio | Recreio | Canto | 26 | 2026-06-01 | 7 | 12 | **ATIVA com aulas** |
| 358 | Priscila Amaro | CG | Contrabaixo | 16 | 2026-05-26 | 12 | 11 | **ATIVA com aulas** |
| 1498 | Ana Beatriz Paz | Recreio | Canto | 20 | 2026-05-26 | 6 | 17 | **ATIVA com aulas** — bolsista |
| 1019 | Alex Mendes | Recreio | GarageBand | 45 | 2026-05-20 | 4 | 20 | **ATIVA com aulas** — banda |
| 1067 | Carlos Eduardo Garcia | CG | Canto | 48 | 2026-05-16 | 8 | 12 | **ATIVA com aulas** — bolsista |
| 1085 | Caio Vinicius | Recreio | GarageBand | 38 | 2026-05-14 | 8 | 23 | **ATIVA com aulas** — banda |
| 1078 | Arthur Carvalho | Recreio | GarageBand | 38 | 2026-05-13 | 2 | 17 | **ATIVA com aulas** — banda |
| 1369 | Giovanna Alves | Recreio | GarageBand | 21 | 2026-05-11 | 2 | 7 | **ATIVA com aulas** — banda |
| 220 | Laura Andrade | CG | Teclado | 11 | **2026-03-30** | 0 | 0 | Aulas até março, nada desde então — investigar |
| 337 | Olavo Pereira Wood | CG | Bateria | **0** | **null** | 0 | 0 | **Sem aula no LA Report** — mas Emusys mostra ativo/pago. Divergência de sync ou matrícula diferente |

---

## Reclassificação por Grupo

### Grupo A: Contrato VIGENTE + sem_parcela (11 alunos)

| ID | Aluno | Unidade | Tipo | Última Aula | Diagnóstico |
|----|-------|---------|------|-------------|-------------|
| 1370 | Maria Fernanda Sellos | Barra | BANDA | 2026-03-09 | OK — banda |
| 1067 | Carlos Eduardo Garcia | CG | BOLSISTA_INT | 2026-05-16 | OK — bolsista, ativo com aulas |
| 1019 | Alex Mendes | Recreio | BANDA | 2026-05-20 | OK — banda |
| 1498 | Ana Beatriz Paz | Recreio | BOLSISTA_INT | 2026-05-26 | OK — bolsista |
| 1078 | Arthur Carvalho | Recreio | BANDA | 2026-05-13 | OK — banda |
| 1085 | Caio Vinicius | Recreio | BANDA | 2026-05-14 | OK — banda |
| 1369 | Giovanna Alves | Recreio | BANDA | 2026-05-11 | OK — banda |
| 1720 | Larissa Bheattriz | Recreio | BOLSISTA_PARC | 2026-05-28 | OK — bolsista, matrícula nova |
| 1366 | Victor Alexandre | Recreio | BANDA | 2026-06-03 | OK — banda |
| **1676** | **Luciana Lima** | **Recreio** | **REGULAR** | **2026-06-06** | **⚠️ SYNC FALHOU** — Regular, aulas ativas, contrato vigente até 2027 |
| **1723** | **Giane Apoliana** | **Recreio** | **REGULAR** | **2026-06-03** | **⚠️ SYNC FALHOU** — Regular, aulas ativas, contrato vigente até 2027 |

**Conclusão Grupo A:** 9 de 11 explicáveis (banda/bolsista). **2 REGULAR com aulas ativas + contrato vigente = bug de sincronização confirmado.**

---

### Grupo B: Contrato VENCIDO + sem_parcela (4 alunos)

| ID | Aluno | Unidade | Última Aula | Diagnóstico |
|----|-------|---------|-------------|-------------|
| **483** | **Davi do nascimento** | **Recreio** | **2026-06-03** | **FALSO POSITIVO CONFIRMADO** — ativo no Emusys, aulas recentes. Sync de contrato falhou (data_fim_contrato desatualizada) |
| 422 | Agatha Sampaio | Recreio | 2026-06-01 | Contrato vencido em 25/05, renovação registrada 28/05, aulas ativas. Possível atraso de sync |
| 549 | Isabela Ferreira | Recreio | 2026-06-06 | Contrato vencido há 2 anos, mas aulas ativas. Investigar no Emusys |
| 684 | Sofia Lima | Recreio | 2026-06-02 | Contrato vencido há 1 ano, mas aulas ativas. Investigar no Emusys |

**Conclusão Grupo B:** Davi confirmado falso positivo. Isabela e Sofia têm aulas ativas apesar de contrato vencido — possíveis falsos positivos também. Agatha provavelmente sync de renovação atrasada.

---

### Grupo C: Contrato NULO + sem_parcela (13 alunos)

| ID | Aluno | Unidade | Última Aula | Diagnóstico |
|----|-------|---------|-------------|-------------|
| 1066 | Carlos Eduardo Garcia | CG | — | Bolsista (2º curso) |
| 228 | Lavynea dos Anjos | CG | — | Bolsista |
| 1064 | Miguel Gomes Biancamano | CG | — | Bolsista |
| 338 | Olivia Rocha Venturi | CG | — | Bolsista |
| 415 | Willer Arruda Machado | CG | — | Bolsista |
| 1013 | Arthur Quinteiro Artacho | Recreio | — | Bolsista |
| **191** | **João Miguel** | **CG** | **2026-05-28** | **ATIVO com aulas** — possível passaporte/benefício, mas frequenta |
| **220** | **Laura Andrade** | **CG** | **2026-03-30** | **Aulas até março, nada desde** — investigar se trancou/evadiu |
| **269** | **Manuela Lourenço** | **CG** | **2026-06-01** | **ATIVO com aulas** — matrícula recente, possível passaporte com aulas |
| **337** | **Olavo Pereira Wood** | **CG** | **null** | **Sem aula no LA Report** — mas Emusys confirma ativo/pago. Tratar como divergência de movimentação/sync, não como evasão confirmada |
| **358** | **Priscila Amaro** | **CG** | **2026-05-26** | **ATIVO com aulas** — tem outra matrícula (banda), esta pode ser passaporte |
| **445** | **Beatriz Souto** | **Recreio** | **2026-06-06** | **ATIVO com aulas** — tem outra matrícula (2º curso violão), esta pode ser passaporte |
| **450** | **Bento Vieira** | **Recreio** | **2026-06-06** | **ATIVO com aulas** — matrícula recente, frequenta aulas |

**Conclusão Grupo C:** 7 bolsistas = OK. **6 têm aulas confirmadas** — não são órfãos nem passaportes isolados sem frequência. Olavo (337) sem aula no LA Report mas ativo no Emusys — divergência de movimentação/sync a investigar.

---

## Hipótese Atualizada de Sincronização

### Padrão identificado

**Matrículas novas no Recreio (maio/2026) + tipo Regular + contrato vigente → `status_pagamento = 'sem_parcela'`**

| Aluno | Unidade | Data Matrícula | Tipo | Contrato | Aulas | Problema |
|-------|---------|---------------|------|----------|-------|----------|
| Luciana Lima | Recreio | 2026-05-09 | Regular | Vigente até 2027 | 6 aulas | `sem_parcela` — **errado** |
| Giane Apoliana | Recreio | 2026-05-28 | Regular | Vigente até 2027 | 2 aulas | `sem_parcela` — **errado** |
| Larissa Bheattriz | Recreio | 2026-05-27 | Bolsista Parcial | Vigente até 2027 | 2 aulas | `sem_parcela` — esperado para bolsista |

**Possível causa:** A edge function `processar-matricula-emusys` (v12) pode estar atribuindo `status_pagamento = 'sem_parcela'` como default para matrículas novas, em vez de buscar o status real do financeiro no Emusys.

---

## Transferência Entre Unidades

### Regra operacional identificada

**Transferência entre unidades não é evasão global da LA Music.**

- Para a **unidade origem**, conta como saída operacional / transferência de saída.
- Para a **unidade destino**, conta como entrada interna / transferência recebida.
- Para o **consolidado global LA**, **não conta como churn/evasão global**.
- Para **novas vendas**, **não conta como nova venda pura**.

### Caso confirmado: Giane Apoliana

| Papel | Matrícula | Unidade | Status | Data |
|-------|-----------|---------|--------|------|
| Origem | 1026 | Campo Grande | `evadido` | 2026-06-05 |
| Destino | 1723 | Recreio | `ativo` | 2026-05-28 |

**Classificação correta:** transferência interna Campo Grande → Recreio.

### Auditoria inicial de possíveis transferências internas

Query de diagnóstico em `movimentacoes_admin.tipo IN ('evasao', 'nao_renovacao')` com matrícula ativa posterior em outra unidade encontrou estes candidatos:

| Aluno | Origem | Destino | Data saída | Data nova matrícula | Evidência |
|-------|--------|---------|------------|---------------------|-----------|
| Daniel Victor Coutinho de Andrade Santos | Campo Grande | Barra | 2026-06-05 | 2026-06-02 | Matrícula ativa no destino |
| Giane Apoliana Albino de Oliveira | Campo Grande | Recreio | 2026-06-05 | 2026-05-28 | Matrícula ativa no destino |
| Arthur Vargas Caldas | Recreio | Barra | 2026-05-02 | 2026-05-04 | Matrícula ativa no destino |
| Caê Leal Santos | Recreio | Barra | 2025-08-01 | 2025-08-04 | Observação: \"Transferência para Barra\" |
| Pietro Matola Abreu | Recreio | Barra | 2025-08-01 | 2025-08-04 | Observação: \"Transferência para Barra\" |

**Leitura:** o banco já tem indícios de transferência misturados com `evasao`. Isso aponta para um **buraco de modelagem** em `movimentacoes_admin`.

---

## Impacto no MRR (reavaliado)

| Aluno | Unidade | Valor | Status no Banco | Status Esperado | Impacto MRR |
|-------|---------|-------|---------------|-----------------|-------------|
| Luciana Lima | Recreio | R$ 385 | `sem_parcela` | `em_dia`/`em_atraso` | **+R$ 385** subestimado |
| Giane Apoliana | Recreio | R$ 357 | `sem_parcela` | `em_dia`/`em_atraso` | **+R$ 357** subestimado |
| Davi do nascimento | Recreio | R$ 459 | `sem_parcela` | `em_dia` | **+R$ 459** subestimado |
| Isabela Ferreira | Recreio | R$ 365 | `sem_parcela` | possívelmente ativo | **+R$ 365**? |
| Sofia Lima | Recreio | R$ 385 | `sem_parcela` | possívelmente ativo | **+R$ 385**? |
| Agatha Sampaio | Recreio | R$ 423,50 | `sem_parcela` | possívelmente ativo | **+R$ 423,50**? |
| João Miguel | CG | R$ 399 | `sem_parcela` | possívelmente ativo | **+R$ 399**? |
| Priscila Amaro | CG | R$ 347 | `sem_parcela` | possívelmente ativo | **+R$ 347**? |
| Beatriz Souto | Recreio | R$ 445,50 | `sem_parcela` | possívelmente ativo | **+R$ 445,50**? |
| Manuela Lourenço | CG | R$ 347 | `sem_parcela` | possívelmente ativo | **+R$ 347**? |
| Bento Vieira | Recreio | R$ 460 | `sem_parcela` | possívelmente ativo | **+R$ 460**? |

**Impacto mínimo confirmado (casos claros de sync):** R$ 742 (Luciana + Giane)
**Impacto potencial (se todos os com aulas forem pagantes):** ~R$ 4.700
**Nota:** Bolsistas e banda (7+ alunos) não afetam MRR. Só os REGULAR e BOLSISTA_PARC podem.

---

## Recomendações Finais

### 1. ZERO UPDATEs de status/status_pagamento

Todos os alunos investigados têm evidência de atividade (aulas no banco ou confirmação no Emusys). Não há caso claro de evasão/não renovação.

### 2. Investigar edge function de sincronização

Foco na função `processar-matricula-emusys` (v12):
- Como o campo `status_pagamento` é determinado na criação de matrícula?
- Por que matrículas novas (maio/2026) vêm com `sem_parcela`?
- A função busca status de pagamento no Emusys ou usa default?
- Como `data_fim_contrato` é sincronizada (Davi = vencida no LA Report, renovada no Emusys)?

### 3. Modelar transferência entre unidades

Auditar e propor modelagem para distinguir:
- `transferencia_unidade_saida`
- `transferencia_unidade_entrada`
- ou `motivo_saida = transferencia`

Sem isso, a operação local pode lançar `evasao`, e o consolidado global acaba distorcendo churn.

### 4. Olavo (337) — caso à parte

- Zero aulas no LA Report, mas Emusys mostra ativo/pago.
- A movimentação atual contradiz o Emusys e deve ser tratada como **movimentação inválida/desatualizada**, não como evasão confirmada.
- Possibilidades: (a) sync de presença falhou, (b) divergência de movimentação administrativa, (c) diferença de vínculo operacional ainda não reconciliada.
- **Não alterar sem validar no Emusys.**

### 5. Laura (220) — investigar

- Última aula em março/2026 (3 meses atrás).
- Pode ter evadido/trancado sem registro no LA Report.
- Verificar no Emusys.

---

## SQLs Utilizados

```sql
-- Presenças recentes
SELECT a.id, a.nome, u.nome AS unidade, c.nome AS curso,
       COUNT(ap.id) AS total_presencas,
       MAX(ap.data_aula) AS ultima_aula,
       COUNT(ap.id) FILTER (WHERE ap.data_aula >= CURRENT_DATE - INTERVAL '30 days') AS aulas_30d,
       COUNT(ap.id) FILTER (WHERE ap.status = 'presente') AS presentes
FROM alunos a
LEFT JOIN aluno_presenca ap ON ap.aluno_id = a.id
LEFT JOIN unidades u ON u.id = a.unidade_id
LEFT JOIN cursos c ON c.id = a.curso_id
WHERE a.id IN (483, 1723, 450, 445, 191, 269, 358, 337, 422, 1676, 220, 549, 684, 
               1067, 1019, 1498, 1078, 1085, 1369, 1720, 1366)
GROUP BY a.id, a.nome, u.nome, c.nome
ORDER BY MAX(ap.data_aula) DESC NULLS LAST;

-- Verificar se Giane tem evasão no próprio ID (não por nome)
SELECT * FROM movimentacoes_admin 
WHERE aluno_id = 1723 AND tipo = 'evasao';
-- Resultado: empty set (evasão está em aluno_id = 1026)

-- Verificar se Olavo tem evasão no próprio ID
SELECT * FROM movimentacoes_admin 
WHERE aluno_id = 337 AND tipo IN ('evasao','nao_renovacao');
-- Resultado: empty set

-- Auditoria de possíveis transferências internas
WITH saidas AS (
  SELECT m.id AS mov_id, lower(trim(m.aluno_nome)) AS chave_nome, m.aluno_nome,
         m.unidade_id AS unidade_origem_id, m.aluno_id AS aluno_id_origem,
         m.data AS data_saida, m.tipo, m.observacoes
  FROM movimentacoes_admin m
  WHERE m.tipo IN ('evasao', 'nao_renovacao')
),
entradas_ativas AS (
  SELECT a.id AS aluno_id_destino, lower(trim(a.nome)) AS chave_nome,
         a.unidade_id AS unidade_destino_id, a.data_matricula, a.status
  FROM alunos a
  WHERE a.status IN ('ativo', 'trancado')
)
SELECT s.mov_id, s.aluno_nome, s.tipo, s.data_saida,
       s.aluno_id_origem, e.aluno_id_destino, e.data_matricula
FROM saidas s
JOIN entradas_ativas e
  ON e.chave_nome = s.chave_nome
 AND e.unidade_destino_id <> s.unidade_origem_id
 AND e.data_matricula >= s.data_saida - INTERVAL '30 days';
```

---

## Status dos Casos Anteriores (atualizado)

| Caso | Status v1 | Status v2 | Motivo |
|------|-----------|-----------|--------|
| Davi (483) | Falso positivo | **Falso positivo confirmado** | Ativo no Emusys + aulas 2026-06-03 |
| Luciana (1676) | Possível sync errada | **Bug de sync confirmado** | Regular + contrato vigente + aulas ativas + sem_parcela |
| Giane (1723) | Evasão suspeita | **Transferência interna + bug de sync** | Matrícula 1026 saiu de CG, mas 1723 segue ativa no Recreio com aulas e contrato |
| Olavo (337) | Provável evadido | **Removido** | Emusys mostra ativo/pago. Tratar como divergência de movimentação/sync, não evasão |
| Laura (220) | Passaporte? | **Investigar** | Aulas até março/2026, nada desde. Possível evasão não registrada |
| João Miguel (191) | Passaporte? | **Ativo com aulas** | 25 aulas, última 28/05. Não é órfão |
| Manuela (269) | Passaporte? | **Ativo com aulas** | 29 aulas, última 01/06. Matrícula recente com frequência |
| Bento (450) | Passaporte? | **Ativo com aulas** | 21 aulas, última 06/06. Matrícula recente com frequência |
| Priscila (358) | Passaporte vinculado | **Ativo com aulas** | 16 aulas, última 26/05. Frequência confirmada |
| Beatriz (445) | Passaporte vinculado | **Ativo com aulas** | 21 aulas, última 06/06. Frequência confirmada |
