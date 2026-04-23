# Plano de Migração - Dados Comerciais 2025

## 📊 Análise do CSV `INDICADOR_MENSAL_MATRICULAS.csv`

### Dados Disponíveis (36 linhas - Jan a Dez/2025 para 3 unidades)

| Campo | Descrição | Exemplo |
|-------|-----------|---------|
| `competencia` | Mês/Ano | 2025-01-01 |
| `unidade` | Nome da unidade | Campo Grande, Recreio, Barra |
| `total_leads` | Total de leads no mês | 245 |
| `aulas_experimentais` | Qtd de experimentais | 19 |
| `professor_experimental` | Ranking de professores | "6 Renan, 6 Caio Araújo, 5 Não teve..." |
| `novas_matriculas` | Total (LAMK + EMLA) | "42 (17 LAMK, 25 EMLA)" |
| `curso_matriculas` | Cursos das matrículas | "9 Musicalização, 8 Teclado, 6 Bateria..." |
| `forma_contato_leads` | Origem dos leads | "219 instagram, 2 ligação, 5 placa..." |
| `caminho_experimentais` | Origem das experimentais | "11 instagram, 2 indicação..." |
| `caminho_matriculas` | Origem das matrículas | "19 indicação, 5 placa faixada..." |
| `ticket_medio_parcelas` | Ticket médio | R$ 373,79 |
| `ticket_medio_passaporte` | Ticket passaporte | R$ 386,21 |
| `faturamento_passaporte` | Faturamento passaporte | R$ 15.586,00 |

---

## 🗄️ Tabelas Existentes no Banco

### 1. `dados_comerciais` ✅ (Perfeita para dados agregados)
```sql
- id, competencia, unidade
- total_leads, aulas_experimentais
- novas_matriculas_total, novas_matriculas_lamk, novas_matriculas_emla
- ticket_medio_parcelas, ticket_medio_passaporte, faturamento_passaporte
```

### 2. `origem_leads` ✅ (Para distribuição por canal)
```sql
- id, competencia, unidade, canal, tipo, quantidade
-- tipo: 'leads', 'experimentais', 'matriculas'
```

### 3. `experimentais_professor_mensal` ✅ (Para ranking de professores)
```sql
- id, professor_id, unidade_id, ano, mes, experimentais
```

### 4. Tabelas de Referência
- `unidades`: Campo Grande, Recreio, Barra (com UUIDs)
- `professores`: 40+ professores cadastrados
- `cursos`: 16 cursos cadastrados
- `canais_origem`: Instagram, Facebook, Google, Site, Ligação, Visita/Placa, Indicação, Ex-aluno, Convênios

---

## 📋 Plano de Migração

### Fase 1: Dados Agregados Mensais → `dados_comerciais`
**36 registros** (12 meses × 3 unidades)

```sql
INSERT INTO dados_comerciais (
  competencia, unidade, total_leads, aulas_experimentais,
  novas_matriculas_total, novas_matriculas_lamk, novas_matriculas_emla,
  ticket_medio_parcelas, ticket_medio_passaporte, faturamento_passaporte
) VALUES ...
```

### Fase 2: Origem dos Leads → `origem_leads`
**~300 registros** (parsing dos campos forma_contato_leads, caminho_experimentais, caminho_matriculas)

Exemplo de parsing:
- "219 instagram, 2 ligação, 5 placa" → 3 registros com tipo='leads'
- "11 instagram, 2 indicação" → 2 registros com tipo='experimentais'
- "19 indicação, 5 placa" → 2 registros com tipo='matriculas'

### Fase 3: Experimentais por Professor → `experimentais_professor_mensal`
**~200 registros** (parsing do campo professor_experimental)

Exemplo de parsing:
- "6 Renan, 6 Caio Araújo, 5 Não teve" → 
  - professor_id=X (Renan), experimentais=6
  - professor_id=Y (Caio Araújo), experimentais=6

### Fase 4: Matrículas por Curso (nova tabela se necessário)
**~150 registros** (parsing do campo curso_matriculas)

---

## 🔧 Mapeamento de Dados

### Unidades
| CSV | UUID no Banco |
|-----|---------------|
| Campo Grande | 2ec861f6-023f-4d7b-9927-3960ad8c2a92 |
| Recreio | 95553e96-971b-4590-a6eb-0201d013c14d |
| Barra | 368d47f5-2d88-4475-bc14-ba084a9a348e |

### Canais de Origem (normalização)
| CSV | Banco |
|-----|-------|
| instagram, Instagram | Instagram |
| google, Google | Google |
| indicação, Indicação, amigo, Amigo | Indicação |
| visita/placa, Visita/Placa, placa faixada, Placa Fachada | Visita/Placa |
| ex aluno, Ex aluno, Ex-aluno | Ex-aluno |
| site, Site, L. Page, Landing Page | Site |
| ligação, Ligação | Ligação |
| facebook, Facebook | Facebook |
| convênios, Convênios, Evento | Convênios |

### Professores (mapeamento parcial - precisa validar)
| CSV | ID no Banco |
|-----|-------------|
| Renan | ? (buscar por nome) |
| Caio Araújo | ? |
| Peterson | ? |
| Gabriel Leão | 8 |
| Daiana | 3 (Daiana Pacífico) |
| Israel | 11 (Israel Rocha) |
| Joel | 13 (Joel de Salles) |
| Letícia | 17 ou 18 |
| Lucas Lisboa | ? |
| Matheus Santos | ? |

---

## ⚠️ Observações Importantes

1. **Dezembro/2025 Campo Grande**: Sem matrículas (0 LAMK, 0 EMLA) - dados incompletos
2. **Professores não cadastrados**: Alguns nomes no CSV podem não existir na tabela `professores`
3. **Cursos não cadastrados**: "Musicalização" genérico precisa mapear para "Musicalização para Bebês" ou "Musicalização Preparatória"
4. **Valores monetários**: Remover "R$" e converter para numeric

---

## 🚀 Próximos Passos

1. [ ] Gerar script SQL para `dados_comerciais`
2. [ ] Criar função de parsing para campos de texto
3. [ ] Gerar script SQL para `origem_leads`
4. [ ] Validar/criar professores faltantes
5. [ ] Gerar script SQL para `experimentais_professor_mensal`
6. [ ] Executar migração em ambiente de teste
7. [ ] Validar dados migrados
8. [ ] Executar em produção

---

## 📈 Resultado Esperado

Após a migração, a aba Comercial terá:
- **Histórico completo de 2025** para todas as 3 unidades
- **Gráficos de evolução** de leads, experimentais e matrículas
- **Ranking de professores** por experimentais realizadas
- **Distribuição por canal** de origem (leads, experimentais, matrículas)
- **Taxas de conversão** calculáveis (leads→experimental→matrícula)
- **Ticket médio** e faturamento de passaporte histórico
