# 📊 Relatório Mensal Administrativo - Documentação

**Data de Implementação:** 26/01/2026  
**Status:** ✅ Completo e Integrado com Banco de Dados

---

## 📋 Estrutura do Relatório

O relatório mensal administrativo foi completamente reformulado para atender às necessidades das Farmers, seguindo o formato que elas já utilizam manualmente.

### **Seções do Relatório:**

1. **Cabeçalho**
   - Nome da Unidade
   - Mês/Ano
   - Nomes dos Farmers (buscados do banco)

2. **👥 Alunos**
   - Ativos
   - Pagantes
   - Não Pagantes
   - Bolsistas
   - Trancados
   - Novos no mês

3. **📚 Matrículas**
   - Matrículas Ativas
   - Matrículas em Banda
   - Matrículas de 2º Curso

4. **💰 KPIs Financeiros**
   - Ticket Médio
   - Faturamento Previsto
   - MRR Atual
   - LTV (Tempo × Ticket)
   - Tempo Permanência

5. **📈 KPIs de Retenção**
   - Churn Rate
   - Taxa de Renovação
   - Reajuste Médio
   - Inadimplência
   - MRR Perdido
   - Total Evasões
   - Não Renovações

6. **🎯 Metas Fideliza+ LA** (com barras visuais)
   - ⭐ Churn Premiado (meta: <3%)
   - ⭐ Inadimplência Zero (meta: 0%)
   - ⭐ Max Renovação (meta: 100%)
   - ⭐ Reajuste Campeão (meta: >8.5%)

7. **🔄 Renovações do Mês**
   - Total previsto
   - Realizadas
   - Porcentagem
   - Lista detalhada (nome, parcela anterior/nova, %, forma de pagamento, agente)

8. **❌ Não Renovações do Mês**
   - Total
   - Porcentagem
   - Lista detalhada (nome, parcela, professor, motivo)

9. **⚠️ Avisos Prévios**
   - Total no mês
   - Lista detalhada (nome, motivo, professor)

10. **🚪 Evasões**
    - Total no mês
    - Breakdown por tipo (Não renovou, Interrompido, 2º Curso, Bolsista, Banda)
    - Lista detalhada (nome, motivo, professor)

---

## 🎯 Barras de Metas (WhatsApp Style)

O relatório inclui barras visuais de progresso que funcionam no WhatsApp:

```
⭐ *Churn Premiado* (meta: <3%)
   ▓▓▓▓▓▓▓▓▓░ 97% ✅
   Atual: *2.5%* | Meta: *<3%*

⭐ *Inadimplência Zero* (meta: 0%)
   ▓▓▓▓▓▓▓▓░░ 85% ⚠️
   Atual: *1.5%* | Meta: *0%*

⭐ *Max Renovação* (meta: 100%)
   ▓▓▓▓▓▓▓▓░░ 80% ⚠️
   Atual: *80.0%* | Meta: *100%*

⭐ *Reajuste Campeão* (meta: >8.5%)
   ▓▓▓▓▓▓▓▓▓▓ 100% ✅
   Atual: *10.5%* | Meta: *>8.5%*
```

---

## 🔗 Integração com Banco de Dados

### **Dados buscados automaticamente:**

| Campo | Tabela | Coluna |
|-------|--------|--------|
| Nome da Unidade | `unidades` | `nome` |
| Farmers | `unidades` | `farmers_nomes` |
| Metas | `metas_kpi` | `tipo`, `valor` |
| Matrículas Ativas | `alunos` | `status = 'ativo'` |
| Matrículas Banda | `alunos` + `cursos` | `cursos.nome LIKE '%banda%'` |
| Matrículas 2º Curso | `alunos` | `is_segundo_curso = true` |

### **KPIs calculados dinamicamente:**

- **LTV** = Tempo Permanência × Ticket Médio
- **MRR Atual** = Alunos Pagantes × Ticket Médio
- **MRR Perdido** = Soma das parcelas dos alunos evadidos
- **Taxa de Renovação** = (Renovações Realizadas / Renovações Previstas) × 100
- **Taxa de Inadimplência** = (Não Pagantes / Ativos) × 100
- **Reajuste Médio** = Média dos percentuais de reajuste das renovações

---

## 📱 Exemplo de Saída

```
━━━━━━━━━━━━━━━━━━━━━━
📊 *RELATÓRIO MENSAL ADMINISTRATIVO*
🏢 *BARRA*
📅 *JANEIRO/2026*
👥 Por Duda e Arthur
━━━━━━━━━━━━━━━━━━━━━━

👥 *ALUNOS*
━━━━━━━━━━━━━━━━━━━━━━
• Ativos: *222*
• Pagantes: *221*
• Não Pagantes: *1*
• Bolsistas: *1*
• Trancados: *0*
• Novos no mês: *3*

📚 *MATRÍCULAS*
━━━━━━━━━━━━━━━━━━━━━━
• Matrículas Ativas: *249*
• Matrículas em Banda: *10*
• Matrículas de 2º Curso: *10*

💰 *KPIs FINANCEIROS*
━━━━━━━━━━━━━━━━━━━━━━
• Ticket Médio: *R$ 440.24*
• Faturamento Previsto: *R$ 97,293.04*
• MRR Atual: *R$ 97,293.04*
• LTV (Tempo × Ticket): *R$ 5,282.88*
• Tempo Permanência: *12.0 meses*

📈 *KPIs DE RETENÇÃO*
━━━━━━━━━━━━━━━━━━━━━━
• Churn Rate: *7.2%*
• Taxa de Renovação: *80.0%*
• Reajuste Médio: *10.8%*
• Inadimplência: *0.5%*
• MRR Perdido: *R$ 5,840.00*
• Total Evasões: *16*
• Não Renovações: *3*

🎯 *METAS FIDELIZA+ LA*
━━━━━━━━━━━━━━━━━━━━━━
⭐ *Churn Premiado* (meta: <3%)
   ▓▓▓▓▓▓▓▓▓░ 93% ⚠️
   Atual: *7.2%* | Meta: *<3%*

⭐ *Inadimplência Zero* (meta: 0%)
   ▓▓▓▓▓▓▓▓▓▓ 100% ✅
   Atual: *0.5%* | Meta: *0%*

⭐ *Max Renovação* (meta: 100%)
   ▓▓▓▓▓▓▓▓░░ 80% ⚠️
   Atual: *80.0%* | Meta: *100%*

⭐ *Reajuste Campeão* (meta: >8.5%)
   ▓▓▓▓▓▓▓▓▓▓ 100% ✅
   Atual: *10.8%* | Meta: *>8.5%*

🔄 *RENOVAÇÕES DO MÊS*
━━━━━━━━━━━━━━━━━━━━━━
• Total previsto: *15*
• Realizadas: *12*
• Porcentagem: *80%*

1) Nome: *Lucas Antunes*
   Parcela: R$ 395.00 para R$ 477.00 (20.76%)
   Forma de PG: Cartão de Crédito
   Agente: Arthur

[... mais renovações ...]

❌ *NÃO RENOVAÇÕES DO MÊS*
━━━━━━━━━━━━━━━━━━━━━━
• Total: *3*
• Porcentagem: *20%*

1) Nome: *Ana Clara Monteiro*
   Parcela: R$ 365.00 para R$ 402.00 (10.13%)
   Professor: Larissa
   Motivo: irá estudar e horário integral no ano que vem.

[... mais não renovações ...]

⚠️ *AVISOS PRÉVIOS para sair em FEVEREIRO*
━━━━━━━━━━━━━━━━━━━━━━
• Total no mês: *15*

1) Nome: *Lucas Roberto Teixeira*
   Motivo: A mãe não consegue achar um horário que encaixe...
   Prof: Gabriel Antony

[... mais avisos ...]

🚪 *EVASÕES (Saíram no mês)*
━━━━━━━━━━━━━━━━━━━━━━
• Total no mês: *16*
• Não renovou: *3*
• Interrompido: *13*

1) Nome: *Bernardo Dumont*
   Motivo: O pai disse que estava com dificuldade financeira
   Prof: Gabriel Antony

[... mais evasões ...]

━━━━━━━━━━━━━━━━━━━━━━
📅 Gerado em: 26/01/2026 às 10:55
━━━━━━━━━━━━━━━━━━━━━━
```

---

## 🔜 Próximos Passos

O **Relatório Gerencial IA** será implementado separadamente com:
- NPS de Evasões
- Média alunos por Turma
- Presença Média (%)
- Top 3 Professores Retenção
- Top 3 Professores Matriculadores
- Taxa de Conversão Experimental
- Análise de Tendências
- Recomendações Estratégicas
