# Relatório Gerencial com IA - LA Music

## Visão Geral

O Relatório Gerencial é um documento mensal completo que combina **dados estruturados do banco** com **insights gerados por IA** (Gemini). Utiliza uma abordagem **híbrida** onde:

- **Template Fixo**: Todos os KPIs, rankings, metas e comparativos são gerados a partir de dados reais do banco
- **IA (Gemini)**: Gera apenas os insights: resumo executivo, conquistas, pontos de atenção, plano de ação e mensagem final

## Estrutura do Relatório

### Cabeçalho
- Nome da unidade
- Mês/Ano
- Nome do Gerente

### Seções de Dados (Template Fixo)

| Seção | Dados Incluídos |
|-------|-----------------|
| **💰 Financeiro** | MRR, Ticket Médio, Inadimplência |
| **👥 Base de Alunos** | Ativos, Pagantes, Bolsistas, Novos, Permanência, LTV |
| **📚 Matrículas** | Ativas, Em Banda, 2º Curso |
| **📈 Funil Comercial** | Leads, Experimentais, Matrículas, Taxas de Conversão |
| **🎯 Metas Comerciais** | Barras de progresso (Leads, Experimentais, Matrículas) |
| **📉 Retenção** | Churn, Evasões, Não Renovações, MRR Perdido, Taxa Renovação, Reajuste |
| **🔴 Motivos de Evasão** | Top 5 motivos com quantidade e percentual |
| **🏆 Rankings** | Top 3 Professores Retenção, Matriculadores, Presença |
| **🎸 Cursos** | Top 5 cursos mais procurados |
| **📱 Canais** | Top 3 canais com maior conversão |
| **⚖️ Comparativos** | vs Mês Anterior, vs Mesmo Mês Ano Passado |
| **📈 Sazonalidade** | Análise histórica do mês (churn médio histórico) |
| **🎯 Metas do Mês** | Barras de progresso (Alunos, Ticket, Renovação, Churn) |
| **🏆 Fideliza+ LA** | Churn Premiado, Inadimplência Zero, Max Renovação, Reajuste Campeão |
| **🎯 Matriculador+ LA** | Matrícula Plus, Max Indicação, LA Music Family |

### Seções de IA (Geradas pelo Gemini)

| Seção | Descrição |
|-------|-----------|
| **Resumo Executivo** | 2-3 linhas resumindo o mês |
| **✅ Conquistas do Mês** | 3 pontos positivos identificados |
| **⚠️ Pontos de Atenção** | 3 alertas importantes |
| **🎯 Plano de Ação** | 3 ações recomendadas |
| **💬 Mensagem Final** | Mensagem motivacional |

## Gerentes por Unidade

| Unidade | Gerente | Hunter | Farmers |
|---------|---------|--------|---------|
| Campo Grande | Jerêh | Vitória | Gabriela, Jhonatan |
| Recreio | Fabiola/Clayton | Clayton | Fernanda, Daiana |
| Barra | Krissya | Kailane | Eduarda, Arthur |

## Metas do Programa Matriculador+ LA

| Unidade | Matrícula Plus | Max Indicação | LA Music Family |
|---------|----------------|---------------|-----------------|
| Campo Grande | 21 | 5 | 3 |
| Recreio | 17 | 4 | 3 |
| Barra | 14 | 3 | 3 |

## Metas do Programa Fideliza+ LA

| Meta | Critério |
|------|----------|
| Churn Premiado | < 3% |
| Inadimplência Zero | 0% |
| Max Renovação | 100% |
| Reajuste Campeão | > 8,5% |

## Arquitetura Técnica

### Função SQL: `get_dados_relatorio_gerencial`

```sql
get_dados_relatorio_gerencial(
  p_unidade_id uuid,  -- NULL para consolidado
  p_ano integer,      -- Ano do relatório
  p_mes integer       -- Mês do relatório
) RETURNS jsonb
```

**Dados retornados:**
- `periodo`: ano, mês, unidade
- `gerente_nome`, `hunter_nome`, `farmers_nomes`
- `kpis_gestao`: MRR, ticket, inadimplência, permanência, LTV
- `kpis_retencao`: evasões, renovações, reajuste
- `kpis_comercial`: leads, experimentais, matrículas, taxas
- `metas`: metas cadastradas para o mês
- `matriculas_ativas`, `matriculas_banda`, `matriculas_2_curso`, `total_bolsistas`
- `mes_anterior`: dados do mês anterior para comparativo
- `mesmo_mes_ano_passado`: dados do mesmo mês do ano anterior
- `sazonalidade`: histórico do mesmo mês nos últimos 3 anos
- `motivos_evasao`: top 5 motivos
- `top_professores_retencao`: top 3 por tempo de permanência
- `top_professores_matriculadores`: top 3 por matrículas
- `top_professores_presenca`: top 3 por presença média
- `cursos_mais_procurados`: top 5 cursos
- `canais_maior_conversao`: top 3 canais
- `total_indicacoes`, `total_family_pacotes`
- `permanencia_por_faixa`: distribuição por tempo

### Edge Function: `gemini-relatorio-gerencial`

1. Recebe os dados da função SQL
2. Monta o template fixo com todos os KPIs
3. Chama a API Gemini apenas para gerar insights
4. Substitui os placeholders no template
5. Retorna o relatório completo formatado para WhatsApp

**Modelo utilizado:** `gemini-2.5-flash-preview-05-20`

## Exemplo de Saída

```
━━━━━━━━━━━━━━━━━━━━━━
📊 *RELATÓRIO GERENCIAL - LA MUSIC*
🏢 *BARRA*
📅 *JANEIRO/2026*
👤 Gerente: Krissya
━━━━━━━━━━━━━━━━━━━━━━

> Janeiro foi um mês de transição com desafios no churn, mas a equipe manteve foco na retenção e qualidade do atendimento.

───────────────────────
💰 *FINANCEIRO*
───────────────────────
• MRR Atual: *R$ 97.293,04*
• Ticket Médio: *R$ 440,24*
• Inadimplência: *0,5%*

[... continua com todas as seções ...]

───────────────────────
✅ *CONQUISTAS DO MÊS*
───────────────────────
• Inadimplência próxima de zero - excelente controle financeiro
• Top 3 professores com permanência média acima de 22 meses
• Bateria e Canto continuam liderando a demanda

───────────────────────
⚠️ *PONTOS DE ATENÇÃO*
───────────────────────
• Churn acima da meta do Fideliza+ (7,2% vs 3%)
• Matrículas abaixo do esperado para o mês
• Horário é o principal motivo de evasão - revisar grades

───────────────────────
🎯 *PLANO DE AÇÃO*
───────────────────────
• Intensificar ações de captação nas últimas semanas
• Revisar horários disponíveis para reduzir evasões
• Acompanhar renovações pendentes de perto

───────────────────────
💬 *MENSAGEM FINAL*
───────────────────────
> Janeiro é historicamente desafiador, mas a equipe está no caminho certo. Vamos juntos transformar fevereiro em um mês de conquistas! 🚀🎶

━━━━━━━━━━━━━━━━━━━━━━
📅 Gerado em: 26/01/2026 às 11:30
━━━━━━━━━━━━━━━━━━━━━━
```

## Vantagens da Abordagem Híbrida

| Aspecto | Benefício |
|---------|-----------|
| **Consistência** | Estrutura sempre igual, fácil de comparar |
| **Precisão** | Dados vêm direto do banco, sem erros de interpretação |
| **Insights** | IA analisa contexto e gera recomendações relevantes |
| **Velocidade** | Prompt menor = resposta mais rápida |
| **Custo** | Menos tokens = menor custo de API |
| **Sazonalidade** | Comparativos históricos para contexto |

## Arquivos Relacionados

- `supabase/functions/gemini-relatorio-gerencial/index.ts` - Edge Function
- `supabase/migrations/20260126_update_get_dados_relatorio_gerencial_v2.sql` - Migração SQL
- `src/components/App/Administrativo/ModalRelatorio.tsx` - Frontend que chama a função
