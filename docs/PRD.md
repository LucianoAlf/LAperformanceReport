# PRD - LA MUSIC PERFORMANCE REPORT 2026

> **Versão:** 1.0  
> **Data:** 18/01/2026  
> **Autor:** Alf (Owner) + Claude (AI Assistant)  
> **Status:** Em Implementação

---

## 1. VISÃO GERAL

### 1.1 O que é

O **LA Music Performance Report** é uma plataforma de gestão de KPIs e acompanhamento de metas para a rede de escolas de música LA Music. O sistema substitui as planilhas Excel utilizadas atualmente, oferecendo entrada de dados simplificada, cálculos automáticos, alertas inteligentes e relatórios via WhatsApp.

### 1.2 Objetivo

- Substituir planilhas manuais por sistema inteligente
- Calcular KPIs automaticamente (LTV, Churn, Ticket Médio, etc.)
- Gerar alertas de tendência e metas
- Facilitar o preenchimento diário pela equipe
- Educar a equipe sobre leitura de indicadores
- Enviar relatórios formatados via WhatsApp

### 1.3 Unidades

| Unidade | Código | Status |
|---------|--------|--------|
| Campo Grande | CG | ✅ Ativa |
| Recreio | REC | ✅ Ativa |
| Barra | BAR | ✅ Ativa |

### 1.4 Números Atuais

| Métrica | Valor |
|---------|-------|
| Total de Alunos Ativos | ~911 |
| Professores Cadastrados | 44 |
| Cursos Oferecidos | 16 |
| Evasões Históricas (2025) | 619 |

### 1.5 Stack Tecnológica

| Componente | Tecnologia |
|------------|------------|
| Frontend | React + Vite + TypeScript |
| Backend | Supabase (PostgreSQL) |
| Autenticação | Supabase Auth |
| Hospedagem | Vercel / Supabase |
| ERP Externo | EMUSYS (cadastro de alunos) |

---

## 2. GLOSSÁRIO

### 2.1 Termos do Negócio

| Termo | Significado |
|-------|-------------|
| **EMLA** | Escola de Música LA (público adulto) |
| **LAMK** | LA Music Kids (público infantil) |
| **Hunters** | Equipe Comercial (captação de alunos) |
| **Farmers** | Equipe de Retenção/Administrativo |
| **Passaporte** | Taxa de matrícula (valor pago no ato) |
| **Parcela** | Mensalidade do aluno |
| **EMUSYS** | Sistema ERP atual de gestão de alunos |

### 2.2 Tipos de Saída

| Tipo | Código | Descrição |
|------|--------|-----------|
| **Interrompido** | INTERROMPIDO | Cancelou no meio do contrato de 12 meses |
| **Não Renovou** | NAO_RENOVOU | Contrato venceu e não renovou |
| **Aviso Prévio** | AVISO_PREVIO | Avisou que vai sair (paga mês atual + próximo) |
| **Transferência** | TRANSFERENCIA | Mudou de unidade |

### 2.3 Tipos de Matrícula

| Tipo | Código | Descrição |
|------|--------|-----------|
| **Regular** | REGULAR | Aluno pagante normal (EMLA ou LAMK) |
| **Segundo Curso** | SEGUNDO_CURSO | Aluno que faz dois cursos |
| **Bolsista Integral** | BOLSISTA_INT | Não paga nada |
| **Bolsista Parcial** | BOLSISTA_PARC | Paga valor reduzido |
| **Banda** | BANDA | Matrícula em projeto de banda |

### 2.4 Canais de Origem (Leads)

| Canal | Descrição |
|-------|-----------|
| Instagram | Rede social |
| Facebook | Rede social |
| Google | Busca orgânica ou ads |
| Site | Site institucional |
| Ligação | Contato telefônico |
| Visita/Placa | Passou na frente da escola |
| Indicação | Indicado por aluno/conhecido |
| Ex-aluno | Aluno que está retornando |
| Convênios | Parcerias empresariais |

### 2.5 Formas de Pagamento

| Forma | Código |
|-------|--------|
| Crédito Recorrente | CR |
| Cheque | CHEQUE |
| Pix | PIX |
| Dinheiro | DINHEIRO |
| Link de Pagamento | LINK |

---

## 3. REGRAS DE NEGÓCIO

### 3.1 Contrato

| Regra | Valor |
|-------|-------|
| Duração do contrato | 12 meses |
| Aviso prévio | Paga mês atual + próximo |
| Renovação | Ao final dos 12 meses |

### 3.2 Quem Entra nos Cálculos

| Tipo de Aluno | Ticket Médio | LTV | Churn | Conta como Pagante |
|---------------|:------------:|:---:|:-----:|:------------------:|
| Regular (EMLA/LAMK) | ✅ | ✅ | ✅ | ✅ |
| Segundo Curso | ✅ (eleva) | ✅ | ✅ | ✅ (conta como 1) |
| Bolsista Integral | ❌ | ❌ | ❌ | ❌ |
| Bolsista Parcial | ❌ | ❌ | ❌ | ❌ |
| Matrícula em Banda | ❌ | ❌ | ❌ | ❌ |

> **Importante:** Bolsistas e alunos em Banda **NÃO** entram em cálculos financeiros (Ticket Médio, LTV, Churn). São contabilizados apenas para controle interno.

### 3.3 Professores

| Contexto | Campo | Descrição |
|----------|-------|-----------|
| Matrícula | `professor_experimental_id` | Professor que deu a aula experimental |
| Matrícula | `professor_atual_id` | Professor que vai dar aulas (pode ser diferente) |
| Evasão | `professor_id` | Professor que dava aula (o fixo, não o experimental) |

> **Nota:** O professor experimental e o professor fixo podem ser diferentes. Na aula experimental pode haver disponibilidade de um professor, mas na matrícula o aluno pode ser alocado com outro.

### 3.4 Aluno com Segundo Curso

- Conta como **1 aluno** (não duplica)
- **Eleva o Ticket Médio** (paga duas mensalidades)
- Entra em **Churn** e **LTV** normalmente

---

## 4. KPIs E MÉTRICAS

### 4.1 Fórmulas Principais

| KPI | Fórmula |
|-----|---------|
| **Total Pagantes** | `Ativos - Bolsistas - Banda` |
| **Ticket Médio** | `Faturamento Realizado ÷ Pagantes` |
| **LTV** | `Tempo Permanência × Ticket Médio` (só alunos com 4+ meses) |
| **Churn Rate** | `(Evasões ÷ Total Ativos) × 100` |
| **Faturamento Previsto** | `Pagantes × Ticket Médio` |
| **Inadimplência** | `Faturamento Previsto - Faturamento Realizado` |
| **Inadimplência %** | `(Inadimplência ÷ Previsto) × 100` |
| **Taxa Renovação** | `(Renovações ÷ Previstas) × 100` |
| **Taxa Conversão Exp→Mat** | `(Matrículas ÷ Experimentais) × 100` |
| **Taxa Conversão Lead→Exp** | `(Experimentais ÷ Leads) × 100` |

### 4.2 KPIs de Gestão (Financeiro)

| KPI | Tipo | Descrição |
|-----|------|-----------|
| Total Alunos Ativos | 📥 Entrada | Quantidade total matriculados |
| Total Alunos Pagantes | 🔢 Cálculo | Ativos - Bolsistas - Banda |
| Total Bolsistas | 📥 Entrada | Integral + Parcial |
| Matrículas Ativas | 📥 Entrada | Total (inclui 2º curso) |
| Matrículas em Banda | 📥 Entrada | Alunos em projeto de banda |
| Matrículas 2º Curso | 📥 Entrada | Alunos com dois cursos |
| Ticket Médio Parcelas | 🔢 Cálculo | Faturamento ÷ Pagantes |
| Faturamento Previsto | 🔢 Cálculo | Pagantes × Ticket Médio |
| Faturamento Realizado | 📥 Entrada | Valor efetivamente recebido |
| Inadimplência (R$) | 🔢 Cálculo | Previsto - Realizado |
| Inadimplência (%) | 🔢 Cálculo | (Inadimplência ÷ Previsto) × 100 |
| LTV | 🔢 Cálculo | Tempo Permanência × Ticket Médio |
| Tempo Permanência Médio | 🔢 Cálculo | Média de meses (só 4+) |

### 4.3 KPIs Comerciais (Funil)

| KPI | Tipo | Descrição |
|-----|------|-----------|
| Total Leads | 📥 Entrada | Quantidade de leads no mês |
| Leads por Canal | 📥 Entrada | Instagram, Google, etc. |
| Curso de Interesse | 📥 Entrada | Qual curso o lead quer |
| Experimentais Marcadas | 📥 Entrada | Aulas agendadas |
| Experimentais Realizadas | 📥 Entrada | Aulas que aconteceram |
| Faltaram Experimental | 🔢 Cálculo | Marcadas - Realizadas |
| Novas Matrículas | 📥 Entrada | Quantidade de passaportes |
| Taxa Conversão Lead→Exp | 🔢 Cálculo | (Experimentais ÷ Leads) × 100 |
| Taxa Conversão Exp→Mat | 🔢 Cálculo | (Matrículas ÷ Experimentais) × 100 |
| Faturamento Passaportes | 🔢 Cálculo | Soma dos passaportes |
| Ticket Médio Passaporte | 🔢 Cálculo | Passaportes ÷ Matrículas |

### 4.4 KPIs de Retenção

| KPI | Tipo | Descrição |
|-----|------|-----------|
| Renovações Previstas | 📥 Entrada | Contratos a vencer no mês |
| Renovações Realizadas | 📥 Entrada | Quantos renovaram |
| Renovações Pendentes | 🔢 Cálculo | Previstas - Realizadas - Não Renovações |
| Não Renovações | 📥 Entrada | Não renovaram |
| Taxa Renovação (%) | 🔢 Cálculo | (Renovações ÷ Previstas) × 100 |
| Evasões Total | 📥 Entrada | Interrompidos + Não Renovações |
| Churn Rate (%) | 🔢 Cálculo | (Evasões ÷ Ativos) × 100 |
| MRR Perdido | 🔢 Cálculo | Soma das parcelas dos evadidos |
| Avisos Prévios | 📥 Entrada | Alunos que avisaram que vão sair |

---

## 5. ESTRUTURA DO BANCO DE DADOS

### 5.1 Tabelas Principais

| Tabela | Descrição | Registros |
|--------|-----------|-----------|
| `alunos` | Cadastro de alunos | 911 |
| `evasoes` | Evasões históricas 2025 (read-only) | 619 |
| `evasoes_v2` | Novas evasões 2026+ (com FKs) | 0 |
| `renovacoes` | Renovações de contrato | 0 |
| `leads` | Leads individuais (futuro) | 1 |
| `leads_diarios` | Leads agregados por dia | 0 |
| `relatorios_diarios` | Snapshots diários | 0 |
| `metas` | Metas por unidade/período | Existem |
| `audit_log` | Log de alterações | 174 |

### 5.2 Tabelas Mestras (Dropdowns)

| Tabela | Registros | Conteúdo |
|--------|-----------|----------|
| `unidades` | 3 | Campo Grande, Recreio, Barra |
| `professores` | 44 | Lista de professores |
| `cursos` | 16 | Violão, Guitarra, Piano, etc. |
| `canais_origem` | 9 | Instagram, Google, etc. |
| `motivos_saida` | 12+ | Financeiro, Mudança, etc. |
| `formas_pagamento` | 5 | CR, Cheque, Pix, etc. |
| `tipos_saida` | 3 | Interrompido, Não Renovou, Aviso |
| `tipos_matricula` | 5 | Regular, Bolsista, Banda, etc. |

### 5.3 Campos Importantes - Tabela `alunos`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | INTEGER | PK |
| `nome` | VARCHAR | Nome completo |
| `unidade_id` | UUID | FK → unidades |
| `curso_id` | INTEGER | FK → cursos |
| `professor_atual_id` | INTEGER | FK → professores (quem dá aula) |
| `professor_experimental_id` | INTEGER | FK → professores (quem deu exp.) |
| `tipo_matricula_id` | INTEGER | FK → tipos_matricula |
| `valor_parcela` | NUMERIC | Mensalidade atual |
| `valor_passaporte` | NUMERIC | Taxa de matrícula paga |
| `data_matricula` | DATE | Data da matrícula |
| `data_saida` | DATE | Data de saída (se houver) |
| `status` | VARCHAR | ativo/inativo |
| `is_aluno_retorno` | BOOLEAN | Ex-aluno que voltou |
| `is_segundo_curso` | BOOLEAN | Faz segundo curso |

### 5.4 Nova Tabela `evasoes_v2`

```sql
CREATE TABLE evasoes_v2 (
  id SERIAL PRIMARY KEY,
  aluno_id INTEGER REFERENCES alunos(id),
  unidade_id UUID REFERENCES unidades(id) NOT NULL,
  data_evasao DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo_saida_id INTEGER REFERENCES tipos_saida(id) NOT NULL,
  motivo_saida_id INTEGER REFERENCES motivos_saida(id),
  professor_id INTEGER REFERENCES professores(id),
  valor_parcela NUMERIC(10,2),
  situacao_pagamento VARCHAR(20) DEFAULT 'em_dia',
  data_prevista_saida DATE,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by INTEGER REFERENCES usuarios(id)
);
```

### 5.5 Nova Tabela `leads_diarios`

```sql
CREATE TABLE leads_diarios (
  id SERIAL PRIMARY KEY,
  unidade_id UUID REFERENCES unidades(id) NOT NULL,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo VARCHAR(50) NOT NULL,
  canal_origem_id INTEGER REFERENCES canais_origem(id),
  curso_id INTEGER REFERENCES cursos(id),
  quantidade INTEGER NOT NULL DEFAULT 1,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by INTEGER REFERENCES usuarios(id)
);
```

---

## 6. HIERARQUIA DE ACESSO

### 6.1 Perfis de Usuário

| Perfil | Descrição |
|--------|-----------|
| **Admin** | Vê tudo (consolidado + todas as unidades) |
| **Unidade** | Vê apenas sua própria unidade |

### 6.2 Permissões

| Ação | Admin | Unidade |
|------|:-----:|:-------:|
| Ver dados da própria unidade | ✅ | ✅ |
| Ver dados de outras unidades | ✅ | ❌ |
| Ver consolidado | ✅ | ❌ |
| Preencher dados | ✅ | ✅ |
| Alterar metas | ✅ | ❌ |
| Gerenciar dropdowns | ✅ | ❌ |
| Importar base CSV | ✅ | ❌ |

### 6.3 Regra de Isolamento

- Unidades têm **gamificação** entre elas
- Uma unidade **NÃO pode ver** números de outra
- Admin vê **tudo** para análise consolidada
- RLS (Row Level Security) garante isolamento no banco

---

## 7. FLUXOS OPERACIONAIS

### 7.1 Equipes e Responsabilidades

| Equipe | Área | Responsabilidades |
|--------|------|-------------------|
| **Hunters** | Comercial | Leads, Experimentais, Matrículas |
| **Farmers** | Retenção | Renovações, Evasões, Avisos Prévios, Faturamento |

### 7.2 Frequência de Lançamento

| Tipo | Frequência | Dados |
|------|------------|-------|
| **Diário** | Todo dia | Leads, Experimentais, Matrículas, Evasões, Renovações |
| **Mensal** | Fechamento | Faturamento realizado, LTV, Inadimplência |

### 7.3 Fluxo Diário - Hunters (Comercial)

1. Registrar quantidade de leads por canal
2. Registrar experimentais agendadas
3. Registrar experimentais realizadas
4. Registrar novas matrículas (com todos os detalhes)
5. Gerar relatório WhatsApp

### 7.4 Fluxo Diário - Farmers (Retenção)

1. Registrar renovações realizadas
2. Registrar não renovações (com motivo)
3. Registrar evasões/interrupções (com motivo)
4. Registrar avisos prévios
5. Atualizar números gerais (snapshot)
6. Gerar relatório WhatsApp

### 7.5 Fluxo Mensal - Fechamento

1. Validar faturamento realizado vs previsto
2. Calcular inadimplência
3. Calcular LTV e Churn do mês
4. Comparar com metas
5. Gerar relatório mensal consolidado

---

## 8. INTERFACE - PLANILHAS INLINE

### 8.1 Decisão de Design

**Por que planilhas inline e não formulários modais?**

A equipe já usa planilhas Excel no dia a dia. Uma interface de formulários modais criaria resistência e curva de aprendizado. Planilhas editáveis inline (estilo Google Sheets) mantêm a familiaridade enquanto adicionam inteligência (dropdowns, cálculos automáticos, validações).

### 8.2 Planilha Comercial (/app/comercial)

**Tabela:** `leads_diarios`

| Coluna | Tipo | Dropdown |
|--------|------|----------|
| Data | Date Picker | - |
| Tipo | Dropdown | Lead, Exp.Agendada, Exp.Realizada, Exp.Faltou, Visita, Matrícula |
| Canal | Dropdown | canais_origem |
| Curso | Dropdown | cursos |
| Quantidade | Number | - |
| Observações | Text | - |

**Quando Tipo = "Matrícula":** Expande linha com campos adicionais (nome, idade, professores, valores, etc.) e salva em `alunos`.

### 8.3 Planilha Retenção (/app/retencao)

**Tabelas:** `evasoes_v2` + `renovacoes`

| Coluna | Tipo | Dropdown |
|--------|------|----------|
| Data | Date Picker | - |
| Tipo | Dropdown | Evasão-Interrompido, Evasão-NãoRenovou, Renovação, Não Renovação, Aviso Prévio |
| Aluno | Autocomplete | alunos (busca por nome) |
| Professor | Dropdown | professores (auto-preenchido) |
| Motivo | Dropdown | motivos_saida |
| Parcela | Currency | (auto-preenchido) |
| Observações | Text | - |

**Ao selecionar Aluno:** Preenche automaticamente Professor e Valor Parcela.

**Quando Tipo = "Renovação":** Mostra campos de reajuste (valor anterior, novo, % calculado).

### 8.4 Snapshot Diário (/app/snapshot)

**Tabela:** `relatorios_diarios`

**Campos Editáveis:**
- Alunos Ativos
- Bolsistas Integral
- Bolsistas Parcial
- Matrículas em Banda
- Matrículas 2º Curso
- Trancados
- Em Atraso

**Campos Calculados (automático):**
- Alunos Pagantes = Ativos - Bolsistas - Banda
- Ticket Médio
- Faturamento Previsto

**Campos Agregados (das outras planilhas):**
- Leads acumulado
- Experimentais acumulado
- Matrículas acumulado
- Evasões acumulado
- Renovações acumulado

---

## 9. RELATÓRIOS WHATSAPP

### 9.1 Relatório Diário Farmers

```
*UNIDADE:* [Nome da Unidade]
Data: DD/MM/AAAA

● Alunos Ativos: XXX
● Bolsistas: XX+XX (Parcial)
● Pagantes: XXX

● Não pagantes no mês: XX
Bolsistas: XX
Bolsista Parcial: XX

● Matrículas Ativas: XXX
● Matrículas em Banda: XX
● Matrículas de segundo curso: XX

🔸 *RENOVAÇÕES*
* Total previsto no mês: XX
* Renovações realizadas no mês: XX
* Renovações pendentes no mês: XX
* Não renovações: XX

🔸 *AVISOS PRÉVIOS para sair em [MÊS]*
● Total no mês: XX

🔸 *EVASÕES* (Saíram esse mês)
● Total de evasões do mês: XX
* Interrompido: XX
* Não renovou: XX
```

### 9.2 Relatório Diário Hunters

```
*RELATÓRIO DIÁRIO COMERCIAL [UNIDADE]*
☆ Por: [Agente]

*Data: DD/MM/AAAA*

▪︎ Leads novos no mês até hoje: XX
▪︎ Total de Experimentais no mês até hoje: XX
▪︎ Experimentais agendadas hoje: XX
▪︎ Visitas à escola hoje: XX
▪︎ Matrículas no mês até hoje: XX
```

---

## 10. METAS E OKRs

### 10.1 Estrutura de Metas

| Período | Descrição |
|---------|-----------|
| **Mensal** | Meta específica para cada mês |
| **Trimestral** | Q1, Q2, Q3, Q4 |
| **Anual** | Meta total do ano |

### 10.2 KPIs com Meta

| KPI | Períodos |
|-----|----------|
| Novas Matrículas | Mensal + Trimestral + Anual |
| Taxa Conversão Experimental | Mensal |
| Taxa Renovação | Mensal |
| Churn Rate | Mensal (meta máxima) |
| Faturamento | Mensal + Trimestral + Anual |
| LTV | Anual |
| Ticket Médio | Mensal |
| Total Alunos Ativos | Mensal |

### 10.3 Alertas de Tendência

| Tipo | Cor | Descrição |
|------|-----|-----------|
| No caminho | 🟢 | Projeção indica que vai bater a meta |
| Atenção | 🟡 | Projeção abaixo, mas recuperável |
| Crítico | 🔴 | Projeção indica que não vai bater |

### 10.4 Projeção Automática

O sistema calcula: *"No ritmo atual, vocês vão bater a meta?"*

**Fórmula:** `(Realizado até hoje ÷ Dias passados) × Dias do período`

---

## 11. DECISÕES DE ARQUITETURA

### 11.1 Adaptar vs Começar do Zero

| Decisão | Escolha | Motivo |
|---------|---------|--------|
| Backend | ✅ Adaptar | Supabase já configurado, tabelas existentes |
| Frontend | ✅ Adaptar | React + Vite funcionando |
| Tabelas | 🆕 Criar novas | `evasoes_v2`, `leads_diarios` |

### 11.2 Formulários Modais vs Planilhas Inline

| Decisão | Escolha | Motivo |
|---------|---------|--------|
| Interface | ✅ Planilhas Inline | Equipe já usa Excel, menor resistência |
| Modais existentes | ✅ Manter | Podem ser úteis futuramente |

### 11.3 Leads Individuais vs Agregados

| Decisão | Escolha | Motivo |
|---------|---------|--------|
| Leads | ✅ Agregados | Equipe não rastreia lead por lead |
| Matrículas | ✅ Individuais | Precisa de todos os detalhes |

### 11.4 Evasões Históricas

| Decisão | Escolha | Motivo |
|---------|---------|--------|
| Tabela `evasoes` (2025) | ✅ Manter read-only | 619 registros, estrutura ruim mas dados valiosos |
| Tabela `evasoes_v2` (2026+) | 🆕 Criar | Estrutura correta com FKs |
| Migração | ❌ Não migrar | Risco de perda de dados |

---

## 12. ROADMAP

### 12.1 Fase Atual (Janeiro 2026)

- [x] Definição de KPIs e regras de negócio
- [x] Auditoria do banco de dados
- [x] Decisões de arquitetura
- [ ] Criar tabela `evasoes_v2`
- [ ] Criar tabela `leads_diarios`
- [ ] Criar componentes base (EditableTable)
- [ ] Criar Planilha Comercial
- [ ] Criar Planilha Retenção
- [ ] Criar Snapshot Diário
- [ ] Botão "Copiar para WhatsApp"
- [ ] Ajustar menu lateral

### 12.2 Próximas Fases

**Fase 2 - Fevereiro 2026:**
- Dashboard com KPI Cards
- Gráficos inteligentes
- Comparativo com metas

**Fase 3 - Março 2026:**
- Alertas automáticos
- Notificações WhatsApp
- Relatórios automatizados

**Fase 4 - Futuro:**
- Importação de base CSV (bolsistas, banda)
- Integração com EMUSYS
- Taxa de engajamento (banda)
- App mobile

---

## 13. CONTATOS E RESPONSÁVEIS

| Papel | Nome | Responsabilidade |
|-------|------|------------------|
| Owner | Alf | Decisões de negócio, validação |
| AI Assistant | Claude | Documentação, prompts, arquitetura |
| Desenvolvimento | Windsurf | Implementação |

---

## CHANGELOG

| Data | Versão | Alteração |
|------|--------|-----------|
| 18/01/2026 | 1.0 | Criação do PRD consolidado |

---

*Documento gerado para servir como referência única do projeto LA Music Performance Report 2026. Deve ser atualizado conforme novas decisões são tomadas.*