# Modal Matrículas e Evasões no Dashboard — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir a view `vw_kpis_gestao_mensal` para contar apenas matrículas passaporte e criar modais de detalhamento nos cards de Matrículas e Evasões do Dashboard.

**Architecture:** Migration SQL para alterar a CTE `matriculas_mes` na view. Componente `ModalDetalheKPI` compartilhado com Dialog + tabela + busca + paginação. Os cards passam `onClick` para abrir o modal, que faz query direta no Supabase.

**Tech Stack:** Supabase (migration SQL), React, shadcn Dialog, Tailwind CSS

---

## Arquivos

- **Criar:** `src/components/App/Dashboard/ModalDetalheKPI.tsx` — modal compartilhado com tabela, busca e paginação
- **Criar:** `supabase/migrations/20260410_fix_matriculas_mes_view.sql` — migration para corrigir a CTE
- **Modificar:** `src/components/App/Dashboard/DashboardPage.tsx` — adicionar onClick nos cards e estado do modal

---

### Task 1: Migration — corrigir CTE `matriculas_mes` na view

**Files:**
- Create: `supabase/migrations/20260410_fix_matriculas_mes_view.sql`

- [ ] **Step 1: Criar a migration**

```sql
-- Recriar a view vw_kpis_gestao_mensal com CTE matriculas_mes corrigida
-- Apenas a CTE matriculas_mes muda: passa a contar da tabela alunos
-- Filtra: sem segundo curso, sem banda, sem coral, sem bolsista
CREATE OR REPLACE VIEW vw_kpis_gestao_mensal AS
WITH matriculas_mes AS (
  SELECT a.unidade_id,
    EXTRACT(year FROM a.data_matricula)::int AS ano,
    EXTRACT(month FROM a.data_matricula)::int AS mes,
    COUNT(*) AS novas_matriculas
  FROM alunos a
    LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
    LEFT JOIN cursos c ON c.id = a.curso_id
  WHERE a.data_matricula IS NOT NULL
    AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)
    AND (c.is_projeto_banda IS NULL OR c.is_projeto_banda = false)
    AND (c.nome IS NULL OR c.nome NOT ILIKE '%canto coral%')
    AND (tm.codigo IS NULL OR tm.codigo NOT IN ('BOLSISTA_INT', 'BOLSISTA_PARC'))
  GROUP BY a.unidade_id, EXTRACT(year FROM a.data_matricula), EXTRACT(month FROM a.data_matricula)
),
-- TODAS AS OUTRAS CTEs PERMANECEM IGUAIS (copiar da view atual)
-- ... (usar pg_get_viewdef para copiar o resto exato)
```

**IMPORTANTE:** Antes de aplicar, executar `SELECT pg_get_viewdef('vw_kpis_gestao_mensal'::regclass, true)` para copiar a definição atual completa e substituir APENAS a CTE `matriculas_mes`. Todas as outras CTEs e o SELECT final permanecem idênticos.

- [ ] **Step 2: Aplicar migration via Supabase MCP**

Usar `mcp__supabase__apply_migration` com o SQL completo da view.

- [ ] **Step 3: Verificar que a view retorna dados corretos**

```sql
SELECT unidade_id, ano, mes, novas_matriculas FROM vw_kpis_gestao_mensal WHERE ano = 2026 AND mes = 4;
```

Esperado: valores menores que antes (sem 2º curso, banda, coral, bolsista).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260410_fix_matriculas_mes_view.sql
git commit -m "fix: CTE matriculas_mes conta só passaporte (sem 2º curso, banda, coral, bolsista)"
```

---

### Task 2: Criar componente ModalDetalheKPI

**Files:**
- Create: `src/components/App/Dashboard/ModalDetalheKPI.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Coluna {
  key: string;
  label: string;
  render?: (valor: any, row: any) => React.ReactNode;
}

interface ModalDetalheKPIProps {
  open: boolean;
  onClose: () => void;
  titulo: string;
  descricao?: string;
  dados: any[];
  colunas: Coluna[];
  carregando?: boolean;
}

const ITENS_POR_PAGINA = 50;

export function ModalDetalheKPI({ open, onClose, titulo, descricao, dados, colunas, carregando }: ModalDetalheKPIProps) {
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(0);

  const filtrados = useMemo(() => {
    if (!busca.trim()) return dados;
    const termo = busca.toLowerCase();
    return dados.filter(d =>
      colunas.some(col => {
        const val = d[col.key];
        return val && String(val).toLowerCase().includes(termo);
      })
    );
  }, [dados, busca, colunas]);

  const totalPaginas = Math.ceil(filtrados.length / ITENS_POR_PAGINA);
  const paginados = filtrados.slice(pagina * ITENS_POR_PAGINA, (pagina + 1) * ITENS_POR_PAGINA);

  // Reset página quando busca muda
  const handleBusca = (valor: string) => {
    setBusca(valor);
    setPagina(0);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {descricao && <DialogDescription>{descricao}</DialogDescription>}
        </DialogHeader>

        {/* Busca + contador */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar..."
              value={busca}
              onChange={e => handleBusca(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-slate-500"
            />
          </div>
          <span className="text-sm text-slate-400 whitespace-nowrap">
            {filtrados.length} registro{filtrados.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Tabela */}
        <div className="flex-1 overflow-auto">
          {carregando ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              Carregando...
            </div>
          ) : filtrados.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              Nenhum registro encontrado
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-900">
                <tr>
                  {colunas.map(col => (
                    <th key={col.key} className="text-left px-3 py-2 text-slate-400 font-medium border-b border-slate-700">
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginados.map((row, i) => (
                  <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/50">
                    {colunas.map(col => (
                      <td key={col.key} className="px-3 py-2 text-white">
                        {col.render ? col.render(row[col.key], row) : row[col.key] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Paginação */}
        {totalPaginas > 1 && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-700">
            <span className="text-xs text-slate-400">
              Página {pagina + 1} de {totalPaginas}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPagina(p => Math.max(0, p - 1))}
                disabled={pagina === 0}
                className="p-1.5 rounded-lg hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-400"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPagina(p => Math.min(totalPaginas - 1, p + 1))}
                disabled={pagina >= totalPaginas - 1}
                className="p-1.5 rounded-lg hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-400"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/App/Dashboard/ModalDetalheKPI.tsx
git commit -m "feat: componente ModalDetalheKPI com tabela, busca e paginação"
```

---

### Task 3: Integrar modais no DashboardPage

**Files:**
- Modify: `src/components/App/Dashboard/DashboardPage.tsx`

- [ ] **Step 1: Adicionar imports**

Adicionar no topo do arquivo:

```tsx
import { ModalDetalheKPI } from './ModalDetalheKPI';
```

- [ ] **Step 2: Adicionar estados e funções de fetch**

Dentro do componente `DashboardPage`, após os estados existentes, adicionar:

```tsx
// Estados dos modais
const [modalMatriculas, setModalMatriculas] = useState(false);
const [modalEvasoes, setModalEvasoes] = useState(false);
const [dadosModalMatriculas, setDadosModalMatriculas] = useState<any[]>([]);
const [dadosModalEvasoes, setDadosModalEvasoes] = useState<any[]>([]);
const [carregandoModal, setCarregandoModal] = useState(false);

// Fetch matrículas do período
const fetchMatriculas = async () => {
  setCarregandoModal(true);
  try {
    let query = supabase
      .from('alunos')
      .select(`
        nome, data_matricula, valor_parcela,
        unidades:unidade_id!inner(nome),
        cursos:curso_id!left(nome, is_projeto_banda),
        tipos_matricula:tipo_matricula_id!left(codigo)
      `)
      .not('data_matricula', 'is', null)
      .or('is_segundo_curso.is.null,is_segundo_curso.eq.false')
      .gte('data_matricula', `${ano}-${String(mesInicio).padStart(2, '0')}-01`)
      .lt('data_matricula', mesFim === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mesFim + 1).padStart(2, '0')}-01`)
      .order('data_matricula', { ascending: false });

    if (unidade !== 'todos') {
      query = query.eq('unidade_id', unidade);
    }

    const { data } = await query;
    // Filtrar no JS: sem banda, coral, bolsista (filtros de join são complexos no Supabase)
    const filtrados = (data || []).filter((a: any) => {
      const codigo = a.tipos_matricula?.codigo;
      if (codigo === 'BOLSISTA_INT' || codigo === 'BOLSISTA_PARC') return false;
      if (a.cursos?.is_projeto_banda) return false;
      if (a.cursos?.nome?.toLowerCase().includes('canto coral')) return false;
      return true;
    });
    setDadosModalMatriculas(filtrados.map((a: any) => ({
      nome: a.nome,
      unidade: a.unidades?.nome || '—',
      data_matricula: a.data_matricula ? new Date(a.data_matricula + 'T12:00:00').toLocaleDateString('pt-BR') : '—',
      curso: a.cursos?.nome || '—',
      valor: a.valor_parcela ? `R$ ${Number(a.valor_parcela).toLocaleString('pt-BR')}` : '—',
    })));
  } finally {
    setCarregandoModal(false);
  }
};

// Fetch evasões do período
const fetchEvasoes = async () => {
  setCarregandoModal(true);
  try {
    let query = supabase
      .from('movimentacoes_admin')
      .select(`
        aluno_nome, data, motivo, tipo,
        unidades:unidade_id!inner(nome)
      `)
      .in('tipo', ['evasao', 'nao_renovacao'])
      .gte('data', `${ano}-${String(mesInicio).padStart(2, '0')}-01`)
      .lt('data', mesFim === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mesFim + 1).padStart(2, '0')}-01`)
      .order('data', { ascending: false });

    if (unidade !== 'todos') {
      query = query.eq('unidade_id', unidade);
    }

    const { data } = await query;
    setDadosModalEvasoes((data || []).map((m: any) => ({
      nome: m.aluno_nome || '—',
      unidade: m.unidades?.nome || '—',
      data_evasao: m.data ? new Date(m.data + 'T12:00:00').toLocaleDateString('pt-BR') : '—',
      tipo: m.tipo === 'evasao' ? 'Evasão' : 'Não Renovação',
      motivo: m.motivo || '—',
    })));
  } finally {
    setCarregandoModal(false);
  }
};
```

- [ ] **Step 3: Adicionar onClick nos cards**

No card de Matrículas, adicionar onClick:

```tsx
<KPICard
  dataTour="card-matriculas"
  icon={UserPlus}
  label={`Matrículas (${labelPeriodo})`}
  value={dadosGestao?.matriculas_mes ?? '--'}
  target={metas.matriculas}
  format="number"
  subvalue={!dadosGestao ? 'Aguardando dados' : undefined}
  variant="emerald"
  onClick={() => { fetchMatriculas(); setModalMatriculas(true); }}
/>
```

No card de Evasões, adicionar onClick:

```tsx
<KPICard
  dataTour="card-evasoes"
  icon={UserMinus}
  label={`Evasões (${labelPeriodo})`}
  value={dadosGestao?.evasoes_mes ?? '--'}
  subvalue={!dadosGestao ? 'Aguardando dados' : undefined}
  variant="rose"
  inverterCor={true}
  onClick={() => { fetchEvasoes(); setModalEvasoes(true); }}
/>
```

- [ ] **Step 4: Renderizar os modais**

Antes do `</div>` final do componente, adicionar:

```tsx
{/* Modal Matrículas */}
<ModalDetalheKPI
  open={modalMatriculas}
  onClose={() => setModalMatriculas(false)}
  titulo={`Matrículas (${labelPeriodo})`}
  descricao={`Alunos que se matricularam no período — ${unidade === 'todos' ? 'Consolidado' : 'Unidade selecionada'}`}
  dados={dadosModalMatriculas}
  colunas={[
    { key: 'nome', label: 'Aluno' },
    { key: 'unidade', label: 'Unidade' },
    { key: 'data_matricula', label: 'Data Matrícula' },
    { key: 'curso', label: 'Curso' },
    { key: 'valor', label: 'Valor Parcela' },
  ]}
  carregando={carregandoModal}
/>

{/* Modal Evasões */}
<ModalDetalheKPI
  open={modalEvasoes}
  onClose={() => setModalEvasoes(false)}
  titulo={`Evasões (${labelPeriodo})`}
  descricao={`Alunos que saíram no período — ${unidade === 'todos' ? 'Consolidado' : 'Unidade selecionada'}`}
  dados={dadosModalEvasoes}
  colunas={[
    { key: 'nome', label: 'Aluno' },
    { key: 'unidade', label: 'Unidade' },
    { key: 'data_evasao', label: 'Data' },
    { key: 'tipo', label: 'Tipo' },
    { key: 'motivo', label: 'Motivo' },
  ]}
  carregando={carregandoModal}
/>
```

- [ ] **Step 5: Commit**

```bash
git add src/components/App/Dashboard/DashboardPage.tsx
git commit -m "feat: modais de detalhamento nos cards de Matrículas e Evasões"
```

---

### Task 4: Teste manual e verificação

- [ ] **Step 1: Verificar view corrigida**

```sql
SELECT unidade_id, ano, mes, novas_matriculas FROM vw_kpis_gestao_mensal WHERE ano = 2026 AND mes = 4;
```

- [ ] **Step 2: Verificar Dashboard**

1. Abrir Dashboard > Consolidado > Mês Abril
2. Card de Matrículas deve mostrar o novo valor (sem 2º curso, banda, coral, bolsista)
3. Clicar no card — modal abre com a lista de alunos
4. A quantidade de linhas no modal deve bater com o número do card
5. Buscar por nome — filtra corretamente
6. Se > 50 registros, paginação aparece

3. Repetir para Evasões
4. Testar com filtro "Todos" e com unidade específica

- [ ] **Step 3: Commit final se necessário**
