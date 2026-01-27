# 📋 INSTRUÇÕES - MIGRAÇÃO DE SINCRONIZAÇÃO AUTOMÁTICA

## 🎯 Objetivo
Implementar sincronização automática entre a página **Administrativo** e as tabelas históricas para que os comparativos funcionem corretamente.

---

## ⚠️ IMPORTANTE - LEIA ANTES DE EXECUTAR

Esta migração cria **triggers automáticos** que sincronizam dados entre tabelas. Execute com cuidado e siga os passos na ordem.

---

## 📝 PASSO A PASSO

### **PASSO 1: Backup de Segurança** ✅

Antes de executar qualquer migração, faça backup das tabelas:

```sql
-- Backup das tabelas (opcional, mas recomendado)
CREATE TABLE movimentacoes_admin_backup AS SELECT * FROM movimentacoes_admin;
CREATE TABLE evasoes_backup AS SELECT * FROM evasoes;
CREATE TABLE renovacoes_backup AS SELECT * FROM renovacoes;
```

### **PASSO 2: Executar Migração Principal** 🚀

Abra o Supabase SQL Editor e execute o arquivo:

```
supabase/migrations/20260127_sync_movimentacoes_admin.sql
```

**O que essa migração faz:**
- ✅ Cria função `sync_evasao_to_historico()`
- ✅ Cria função `sync_renovacao_to_historico()`
- ✅ Cria trigger `tr_sync_evasao`
- ✅ Cria trigger `tr_sync_renovacao`
- ✅ Valida criação dos triggers

**Resultado esperado:**
```
NOTICE: ✅ Triggers criados com sucesso
NOTICE: ✅ Funções criadas com sucesso
NOTICE: ✅ MIGRAÇÃO CONCLUÍDA COM SUCESSO
```

### **PASSO 3: Executar Testes Automatizados** 🧪

Execute o arquivo de testes:

```
supabase/migrations/20260127_test_sync.sql
```

**O que esse script testa:**
1. ✅ Inserir renovação → Verifica se aparece em `renovacoes`
2. ✅ Inserir evasão → Verifica se aparece em `evasoes` (tipo: Interrompido)
3. ✅ Inserir não renovação → Verifica se aparece em `evasoes` (tipo: Não Renovação)

**Resultado esperado:**
```
NOTICE: ✅ TESTE 1 PASSOU: Renovação sincronizada com sucesso
NOTICE: ✅ TESTE 2 PASSOU: Evasão sincronizada com sucesso
NOTICE: ✅ TESTE 3 PASSOU: Não Renovação sincronizada com tipo correto
NOTICE: ✅ TODOS OS TESTES PASSARAM
```

### **PASSO 4: Teste Manual na Interface** 🖱️

1. Acesse a página **Administrativo**
2. Registre uma **Renovação** de teste:
   - Aluno: "Teste Sincronização"
   - Valor anterior: R$ 100
   - Valor novo: R$ 110
   - Data: Hoje

3. Verifique no banco se foi sincronizado:
```sql
-- Verificar se apareceu em renovacoes
SELECT * FROM renovacoes 
WHERE agente ILIKE '%teste%' 
ORDER BY created_at DESC LIMIT 1;

-- Verificar se apareceu em movimentacoes_admin
SELECT * FROM movimentacoes_admin 
WHERE aluno_nome ILIKE '%teste%' 
ORDER BY created_at DESC LIMIT 1;
```

4. Registre um **Cancelamento** de teste:
   - Aluno: "Teste Cancelamento"
   - Valor parcela: R$ 150
   - Motivo: "Teste"

5. Verifique no banco:
```sql
-- Verificar se apareceu em evasoes
SELECT * FROM evasoes 
WHERE aluno ILIKE '%teste%' 
ORDER BY created_at DESC LIMIT 1;
```

### **PASSO 5: Validar Comparativos no Analytics** 📊

1. Acesse **Analytics → Gestão**
2. Selecione um mês que tenha dados (ex: Abr/2025)
3. Verifique se os cards mostram comparativos:
   - "vs Mês Anterior" (deve aparecer)
   - "vs Ano Anterior" (deve aparecer)

4. Teste com diferentes períodos:
   - Mês
   - Trimestre
   - Semestre
   - Ano

---

## 🔍 COMO VERIFICAR SE ESTÁ FUNCIONANDO

### **Verificação 1: Triggers Ativos**
```sql
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table
FROM information_schema.triggers
WHERE trigger_name IN ('tr_sync_evasao', 'tr_sync_renovacao');
```

**Resultado esperado:** 2 linhas (1 para cada trigger)

### **Verificação 2: Contadores**
```sql
-- Contar registros em cada tabela
SELECT 
  'movimentacoes_admin' as tabela, COUNT(*) as total FROM movimentacoes_admin
UNION ALL
SELECT 'evasoes' as tabela, COUNT(*) as total FROM evasoes
UNION ALL
SELECT 'renovacoes' as tabela, COUNT(*) as total FROM renovacoes;
```

### **Verificação 3: Logs de Sincronização**

Após inserir dados no Administrativo, verifique os logs do Supabase:
- Deve aparecer: `NOTICE: Renovação sincronizada: [nome] - Reajuste: [%]`
- Deve aparecer: `NOTICE: Evasão sincronizada: [nome] - [tipo] ([data])`

---

## 🚨 PROBLEMAS COMUNS E SOLUÇÕES

### **Problema 1: Trigger não dispara**
**Sintoma:** Dados salvos em `movimentacoes_admin` mas não aparecem em `evasoes`/`renovacoes`

**Solução:**
```sql
-- Verificar se triggers existem
SELECT * FROM pg_trigger WHERE tgname LIKE 'tr_sync%';

-- Se não existir, re-executar migração
```

### **Problema 2: Erro "column does not exist"**
**Sintoma:** Erro ao inserir dados

**Solução:** Verificar se as colunas existem nas tabelas:
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'evasoes';
```

### **Problema 3: Comparativos não aparecem**
**Sintoma:** Cards mostram "—" em vez de valores comparativos

**Causa:** Falta de dados históricos em `dados_mensais`

**Solução:** Os comparativos dependem de `dados_mensais` ter dados dos meses anteriores. A sincronização só afeta `evasoes` e `renovacoes`.

---

## 🔄 ROLLBACK (Se necessário)

Se algo der errado, você pode reverter:

```sql
-- Remover triggers
DROP TRIGGER IF EXISTS tr_sync_evasao ON movimentacoes_admin;
DROP TRIGGER IF EXISTS tr_sync_renovacao ON movimentacoes_admin;

-- Remover funções
DROP FUNCTION IF EXISTS sync_evasao_to_historico();
DROP FUNCTION IF EXISTS sync_renovacao_to_historico();

-- Restaurar backups (se fez)
-- TRUNCATE evasoes;
-- INSERT INTO evasoes SELECT * FROM evasoes_backup;
-- TRUNCATE renovacoes;
-- INSERT INTO renovacoes SELECT * FROM renovacoes_backup;
```

---

## ✅ CHECKLIST FINAL

Antes de considerar a migração completa, verifique:

- [ ] Migração principal executada sem erros
- [ ] Todos os 3 testes automatizados passaram
- [ ] Teste manual de renovação funcionou
- [ ] Teste manual de cancelamento funcionou
- [ ] Dados aparecem em `evasoes` e `renovacoes`
- [ ] Comparativos aparecem no Analytics
- [ ] Farmers conseguem usar o Administrativo normalmente

---

## 📞 SUPORTE

Se encontrar problemas:

1. Verifique os logs do Supabase (SQL Editor → Logs)
2. Execute as queries de verificação acima
3. Consulte a documentação dos triggers criados

---

## 🎉 PRÓXIMOS PASSOS

Após validar que tudo funciona:

1. **Treinar Farmers** para usar o Administrativo
2. **Monitorar** os primeiros dias de uso
3. **Validar** se comparativos estão corretos
4. **Documentar** qualquer ajuste necessário

---

**Data de criação:** 27/01/2026  
**Versão:** 1.0  
**Status:** Pronto para execução
