# Fix: Lead duplicado ao registrar aula experimental

## Problema

Quando o usuário registra uma aula experimental pelo "Lançamento em Lote de Experimentais", o sistema **cria um novo registro** na tabela `leads` em vez de **atualizar o registro existente**. Isso resulta em leads duplicados no banco de dados.

**Impacto:**
- 80 nomes duplicados, 177 registros duplicados ativos no banco
- Leads fantasmas aparecem no CRM como se ainda precisassem ser trabalhados
- Total de leads inflado nas views `vw_funil_conversao_mensal` e `vw_leads_comercial`
- Taxas de conversão artificialmente menores (denominador inflado)

**Regra de negocio:** Nao faz sentido cadastrar um lead direto como experimental. O lead precisa existir como "novo" antes de agendar uma experimental. O formulario de experimentais deve **apenas atualizar leads existentes**, nunca criar novos.

## Causa Raiz

**Arquivo:** `src/components/App/Comercial/ComercialPage.tsx`

1. O `onSelectSugestao` preenche nome/canal/curso mas **nao salva o `sugestao.id`** (linhas 3325-3337)
2. A interface `LoteLinha` (linha 268) **nao tem campo `lead_id`**
3. `handleSaveLoteExperimentais()` (linha 899) faz **sempre `.insert()`**

## Solucao

### 1. Adicionar `lead_id` ao `LoteLinha` (linha 268)

```typescript
interface LoteLinha {
  id: string;
  lead_id?: number | null;  // ID do lead existente no banco
  aluno_nome?: string;
  // ... resto igual
}
```

### 2. Salvar `sugestao.id` no `onSelectSugestao` (linha 3325)

```typescript
onSelectSugestao={(sugestao) => {
  setLoteExperimentais(prev => prev.map(l =>
    l.id === linha.id
      ? {
          ...l,
          lead_id: sugestao.id,
          aluno_nome: sugestao.nome,
          canal_origem_id: sugestao.canal_origem_id || l.canal_origem_id,
          curso_id: sugestao.curso_id || l.curso_id,
        }
      : l
  ));
}}
```

### 3. Limpar `lead_id` se o nome for editado manualmente (linha 3324)

```typescript
onChange={(nome) => {
  updateLinhaExperimental(linha.id, 'aluno_nome', nome);
  updateLinhaExperimental(linha.id, 'lead_id', null);
}}
```

### 4. Reescrever `handleSaveLoteExperimentais()` (linhas 883-914)

So UPDATE, nunca INSERT. Validar que todas as linhas tem `lead_id`.

```typescript
const handleSaveLoteExperimentais = async () => {
  if (!unidadeParaSalvar) {
    toast.error('Selecione uma unidade no filtro acima');
    return;
  }

  const linhasValidas = loteExperimentais.filter(l => l.aluno_nome && l.aluno_nome.trim().length > 0);
  if (linhasValidas.length === 0) {
    toast.error('Preencha pelo menos uma experimental');
    return;
  }

  // Validar que todas as linhas tem um lead vinculado
  const linhasSemLead = linhasValidas.filter(l => !l.lead_id);
  if (linhasSemLead.length > 0) {
    toast.error(`${linhasSemLead.length} linha(s) nao estao vinculadas a um lead existente. Selecione um lead da lista de sugestoes.`);
    return;
  }

  setSaving(true);
  try {
    const dataLancamento = loteData.toISOString().split('T')[0];

    for (const linha of linhasValidas) {
      const { error } = await supabase
        .from('leads')
        .update({
          status: linha.status_experimental || 'experimental_agendada',
          professor_experimental_id: linha.professor_id,
          sabia_preco: linha.sabia_preco,
          canal_origem_id: linha.canal_origem_id,
          curso_interesse_id: linha.curso_id,
        })
        .eq('id', linha.lead_id);
      if (error) throw error;
    }

    toast.success(`${linhasValidas.length} experimental(is) atualizada(s)!`);
    setModalOpen(null);
    resetForm();
    loadData();
    loadSugestoesLeads();
  } catch (error) {
    console.error('Erro ao salvar experimentais:', error);
    const errMsg = (error as any)?.message || (error as any)?.code || 'Erro desconhecido';
    toast.error(`Erro ao salvar experimentais: ${errMsg}`);
  } finally {
    setSaving(false);
  }
};
```

### 5. Filtro de sugestoes (linha 3338)

Ja existe o filtro correto:
```typescript
sugestoes={sugestoesLeads.filter(s => ['novo','agendado','lead'].includes(s.tipo))}
```
Manter assim — so mostra leads que ainda nao foram convertidos/experimentais.

## Verificacao

1. Ir ao lote de experimentais e tentar digitar um nome manualmente (sem selecionar sugestao)
2. Ao salvar, deve mostrar erro: "linha(s) nao estao vinculadas a um lead existente"
3. Selecionar um lead existente pela sugestao e salvar
4. Verificar no Supabase que o lead foi **atualizado** (nao criou novo):
   ```sql
   SELECT id, nome, status, created_at, updated_at FROM leads WHERE nome = 'NOME_TESTE' ORDER BY created_at;
   ```
5. O resultado deve ter apenas 1 registro com status atualizado

## Limpeza de duplicatas existentes (opcional)

Apos aplicar o fix, rodar no Supabase para identificar duplicatas a limpar:
```sql
SELECT nome, telefone, unidade_id, COUNT(*) as qtd,
  array_agg(id ORDER BY created_at) as ids,
  array_agg(status ORDER BY created_at) as statuses
FROM leads
WHERE arquivado IS NOT TRUE
GROUP BY nome, telefone, unidade_id
HAVING COUNT(*) > 1
ORDER BY qtd DESC;
```
