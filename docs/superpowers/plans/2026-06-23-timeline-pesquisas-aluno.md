# Timeline de Pesquisas do Aluno — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma linha do tempo de pesquisas (1ª aula → 3 meses → evasão) na ficha de detalhe do aluno, com nota, comentário e estado "não respondeu", e lançamento/edição manual a partir da própria timeline.

**Architecture:** Reusa `pesquisas_whatsapp` (Abordagem A — sem tabela nova). Duas RPCs (`get_timeline_pesquisas_aluno` leitura, `registrar_resposta_pesquisa_manual` gravação por upsert lógico). Um componente isolado `TimelinePesquisasAluno` embutido em duas fichas. O modal de lançamento ganha modo contextual.

**Tech Stack:** React 19 + TypeScript + Supabase (PostgreSQL RPC + RLS) + Tailwind + Sonner + date-fns + lucide-react.

## Global Constraints

- Idioma do código/UI em português; comentários só para "por quê" não-óbvio.
- Toasts via Sonner (`toast.success`/`toast.error`).
- Todas as operações de banco passam por `src/lib/supabase.ts`.
- Timezone BRT (UTC-3): datas de negócio gravadas como `data @ 12h BRT` = `(data + interval '15 hours') AT TIME ZONE 'UTC'`.
- RLS ativo em `pesquisas_whatsapp` sem policies de acesso direto → gravação/leitura via RPC `SECURITY DEFINER`.
- Migrations versionadas em `supabase/migrations/AAAAMMDD_<slug>.sql` E aplicadas via MCP `apply_migration`.
- **Não** alterar a constraint `UNIQUE (aluno_id, tipo, data_matricula)` nem a edge `enviar-pesquisa-pos-primeira-aula` (quebraria o disparo).
- Régua de marcos: `pos_primeira_aula` (ativo), `tres_meses` e `evasao` (reservados, "Em breve").
- Git author = Luciano, sem `Co-Authored-By`.

---

### Task 1: Migration — colunas, backfill e RPCs

**Files:**
- Create: `supabase/migrations/20260623_timeline_pesquisas_aluno.sql`
- Apply: via MCP `apply_migration` (project `ouqwbbermlzqqvtqwlul`, name `timeline_pesquisas_aluno`)

**Interfaces:**
- Produces:
  - Colunas `pesquisas_whatsapp.comentario text`, `pesquisas_whatsapp.status text`.
  - `get_timeline_pesquisas_aluno(p_aluno_id integer) RETURNS jsonb` — array ordenado `[pos_primeira_aula, tres_meses, evasao]`, cada item `{tipo, label, ativo, nota, comentario, status, respondido_em, enviado_em}`.
  - `registrar_resposta_pesquisa_manual(p_aluno_id integer, p_data date, p_tipo text DEFAULT 'pos_primeira_aula', p_nota integer DEFAULT NULL, p_comentario text DEFAULT NULL, p_nao_respondeu boolean DEFAULT false) RETURNS uuid` (substitui a assinatura antiga de 3 params).

- [ ] **Step 1: Escrever o arquivo de migration**

Conteúdo de `supabase/migrations/20260623_timeline_pesquisas_aluno.sql`:

```sql
-- Timeline de pesquisas do aluno: comentário, status e RPCs de leitura/gravação.

-- 1. Colunas novas
ALTER TABLE pesquisas_whatsapp
  ADD COLUMN IF NOT EXISTS comentario text,
  ADD COLUMN IF NOT EXISTS status text;

-- 2. Backfill de status nos registros existentes
UPDATE pesquisas_whatsapp
SET status = CASE WHEN nota IS NOT NULL THEN 'respondida' ELSE 'pendente' END
WHERE status IS NULL;

-- 3. Leitura: régua fixa de marcos com o estado de cada um (1 registro por tipo via DISTINCT ON)
CREATE OR REPLACE FUNCTION public.get_timeline_pesquisas_aluno(p_aluno_id integer)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH regua(ord, tipo, label, ativo) AS (
    VALUES
      (1, 'pos_primeira_aula', '1ª aula', true),
      (2, 'tres_meses', '3 meses', false),
      (3, 'evasao', 'Evasão', false)
  ),
  reg AS (
    SELECT DISTINCT ON (pw.tipo)
      pw.tipo, pw.nota, pw.comentario, pw.status, pw.respondido_em, pw.enviado_em
    FROM pesquisas_whatsapp pw
    WHERE pw.aluno_id = p_aluno_id
    ORDER BY pw.tipo, (pw.nota IS NOT NULL) DESC, pw.respondido_em DESC NULLS LAST, pw.created_at DESC
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'tipo', r.tipo,
      'label', r.label,
      'ativo', r.ativo,
      'nota', reg.nota,
      'comentario', reg.comentario,
      'status', reg.status,
      'respondido_em', reg.respondido_em,
      'enviado_em', reg.enviado_em
    ) ORDER BY r.ord
  ), '[]'::jsonb)
  FROM regua r
  LEFT JOIN reg ON reg.tipo = r.tipo;
$function$;

GRANT EXECUTE ON FUNCTION public.get_timeline_pesquisas_aluno(integer) TO authenticated;

-- 4. Gravação: assinatura nova (a antiga de 3 params some)
DROP FUNCTION IF EXISTS public.registrar_resposta_pesquisa_manual(integer, integer, date);

CREATE OR REPLACE FUNCTION public.registrar_resposta_pesquisa_manual(
  p_aluno_id integer,
  p_data date,
  p_tipo text DEFAULT 'pos_primeira_aula',
  p_nota integer DEFAULT NULL,
  p_comentario text DEFAULT NULL,
  p_nao_respondeu boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_unidade_id uuid;
  v_data_matricula date;
  v_id uuid;
  v_ts timestamptz;
  v_status text;
BEGIN
  IF p_tipo NOT IN ('pos_primeira_aula', 'tres_meses', 'evasao') THEN
    RAISE EXCEPTION 'Tipo de pesquisa inválido: %', p_tipo;
  END IF;
  IF NOT p_nao_respondeu AND (p_nota IS NULL OR p_nota < 1 OR p_nota > 5) THEN
    RAISE EXCEPTION 'Nota deve estar entre 1 e 5 quando respondida (recebido: %)', p_nota;
  END IF;

  SELECT unidade_id, data_inicio_contrato INTO v_unidade_id, v_data_matricula
  FROM alunos WHERE id = p_aluno_id;
  IF v_unidade_id IS NULL THEN
    RAISE EXCEPTION 'Aluno % não encontrado', p_aluno_id;
  END IF;

  v_ts := (p_data::timestamp + interval '15 hours') AT TIME ZONE 'UTC';
  v_status := CASE WHEN p_nao_respondeu THEN 'nao_respondida' ELSE 'respondida' END;

  -- Upsert lógico por (aluno_id, tipo): atualiza o registro mais relevante; só insere se não houver
  SELECT id INTO v_id
  FROM pesquisas_whatsapp
  WHERE aluno_id = p_aluno_id AND tipo = p_tipo
  ORDER BY (nota IS NOT NULL) DESC, respondido_em DESC NULLS LAST, created_at DESC
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE pesquisas_whatsapp
    SET nota = CASE WHEN p_nao_respondeu THEN NULL ELSE p_nota END,
        comentario = p_comentario,
        status = v_status,
        respondido_em = v_ts,
        manual = true
    WHERE id = v_id;
  ELSE
    INSERT INTO pesquisas_whatsapp (
      aluno_id, unidade_id, tipo, data_matricula, enviado_em, enviado_ok,
      nota, comentario, status, respondido_em, manual
    ) VALUES (
      p_aluno_id, v_unidade_id, p_tipo, v_data_matricula, v_ts, true,
      CASE WHEN p_nao_respondeu THEN NULL ELSE p_nota END,
      p_comentario, v_status, v_ts, true
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.registrar_resposta_pesquisa_manual(integer, date, text, integer, text, boolean) TO authenticated;
```

- [ ] **Step 2: Aplicar via MCP**

Aplicar com `mcp__supabase__apply_migration` (project_id `ouqwbbermlzqqvtqwlul`, name `timeline_pesquisas_aluno`, query = conteúdo do arquivo).
Expected: `{"success":true}`.

- [ ] **Step 3: Validar a RPC de leitura (aluno sem pesquisa)**

Run (MCP `execute_sql`): pegar um aluno real e chamar a RPC.
```sql
SELECT get_timeline_pesquisas_aluno((SELECT id FROM alunos LIMIT 1));
```
Expected: array com 3 itens; `pos_primeira_aula` com `ativo=true`/`status=null`, `tres_meses` e `evasao` com `ativo=false`.

- [ ] **Step 4: Validar gravação + upsert (não duplica)**

Run (MCP `execute_sql`, em transação para não sujar):
```sql
BEGIN;
SELECT registrar_resposta_pesquisa_manual((SELECT id FROM alunos LIMIT 1), CURRENT_DATE, 'pos_primeira_aula', 5, 'ótima aula', false);
-- registrar de novo o mesmo aluno/tipo deve ATUALIZAR, não criar 2ª linha
SELECT registrar_resposta_pesquisa_manual((SELECT id FROM alunos LIMIT 1), CURRENT_DATE, 'pos_primeira_aula', 3, 'corrigido', false);
SELECT count(*) AS linhas, max(nota) AS nota, max(comentario) AS comentario
FROM pesquisas_whatsapp
WHERE aluno_id = (SELECT id FROM alunos LIMIT 1) AND tipo = 'pos_primeira_aula';
ROLLBACK;
```
Expected: `linhas = 1`, `nota = 3`, `comentario = 'corrigido'` (upsert atualizou).

- [ ] **Step 5: Validar "não respondeu"**

Run (MCP `execute_sql`):
```sql
BEGIN;
SELECT registrar_resposta_pesquisa_manual((SELECT id FROM alunos LIMIT 1), CURRENT_DATE, 'pos_primeira_aula', NULL, NULL, true);
SELECT nota, status FROM pesquisas_whatsapp
WHERE aluno_id = (SELECT id FROM alunos LIMIT 1) AND tipo = 'pos_primeira_aula'
ORDER BY created_at DESC LIMIT 1;
ROLLBACK;
```
Expected: `nota = NULL`, `status = 'nao_respondida'`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260623_timeline_pesquisas_aluno.sql
git commit -m "feat(pesquisas): colunas comentario/status + RPCs de timeline do aluno"
```

---

### Task 2: Edge `processar-resposta-pesquisa` — gravar status na captura

**Files:**
- Modify: `supabase/functions/processar-resposta-pesquisa/index.ts` (o `.update({ nota, respondido_em })` por volta da linha 136-137)

**Interfaces:**
- Consumes: coluna `status` criada na Task 1.
- Produces: registros capturados por WhatsApp passam a ter `status='respondida'`.

- [ ] **Step 1: Adicionar `status` ao update**

Localizar o bloco:
```ts
      .from('pesquisas_whatsapp')
      .update({ nota, respondido_em: new Date().toISOString() })
```
Trocar para:
```ts
      .from('pesquisas_whatsapp')
      .update({ nota, status: 'respondida', respondido_em: new Date().toISOString() })
```

- [ ] **Step 2: Deploy da edge**

Deploy via MCP `deploy_edge_function` (project `ouqwbbermlzqqvtqwlul`, function `processar-resposta-pesquisa`) com o arquivo completo. `verify_jwt` preservado conforme config atual.
Expected: deploy sem erro.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/processar-resposta-pesquisa/index.ts
git commit -m "feat(pesquisas): captura via WhatsApp grava status=respondida"
```

---

### Task 3: Generalizar `ModalLancarRespostaManual` (modo contextual + comentário + não respondeu)

**Files:**
- Modify: `src/components/App/SucessoCliente/ModalLancarRespostaManual.tsx` (reescrita do componente)

**Interfaces:**
- Consumes: RPC `registrar_resposta_pesquisa_manual` (nova assinatura, Task 1).
- Produces: props novas opcionais `alunoFixo?: { id: number; nome: string }` e `tipoFixo?: string`. Quando `alunoFixo` presente, pula a busca; quando `tipoFixo` presente, fixa o marco. Mantém o modo busca atual (sem essas props).

- [ ] **Step 1: Reescrever o componente**

Substituir o conteúdo de `ModalLancarRespostaManual.tsx` por:

```tsx
import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { Star, Search, Loader2, Check, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';

interface AlunoResultado {
  id: number;
  nome: string;
  status?: string | null;
  unidade_nome?: string | null;
}

const LABEL_TIPO: Record<string, string> = {
  pos_primeira_aula: '1ª aula',
  tres_meses: '3 meses',
  evasao: 'Evasão',
};

interface Props {
  open: boolean;
  onClose: () => void;
  unidadeAtual: UnidadeId;
  onSaved: () => void;
  alunoFixo?: { id: number; nome: string };
  tipoFixo?: string;
}

export function ModalLancarRespostaManual({
  open, onClose, unidadeAtual, onSaved, alunoFixo, tipoFixo,
}: Props) {
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<AlunoResultado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [aluno, setAluno] = useState<AlunoResultado | null>(null);
  const [nota, setNota] = useState(0);
  const [hoverNota, setHoverNota] = useState(0);
  const [comentario, setComentario] = useState('');
  const [naoRespondeu, setNaoRespondeu] = useState(false);
  const [data, setData] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [salvando, setSalvando] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const tipo = tipoFixo || 'pos_primeira_aula';

  // Reset ao abrir
  useEffect(() => {
    if (open) {
      setBusca('');
      setResultados([]);
      setAluno(alunoFixo ? { id: alunoFixo.id, nome: alunoFixo.nome } : null);
      setNota(0);
      setHoverNota(0);
      setComentario('');
      setNaoRespondeu(false);
      setData(format(new Date(), 'yyyy-MM-dd'));
    }
  }, [open, alunoFixo]);

  // Busca de aluno por nome (só no modo busca)
  useEffect(() => {
    if (alunoFixo || aluno) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const termo = busca.trim();
    if (termo.length < 2) { setResultados([]); return; }
    debounceRef.current = setTimeout(async () => {
      setBuscando(true);
      try {
        let query = supabase
          .from('alunos')
          .select('id, nome, status, unidades(nome)')
          .ilike('nome', `%${termo}%`)
          .order('nome')
          .limit(20);
        if (unidadeAtual !== 'todos') query = query.eq('unidade_id', unidadeAtual);
        const { data: rows, error } = await query;
        if (error) throw error;
        setResultados((rows || []).map((r: any) => ({
          id: r.id, nome: r.nome, status: r.status, unidade_nome: r.unidades?.nome ?? null,
        })));
      } catch (err: any) {
        toast.error('Erro ao buscar aluno: ' + (err.message || 'desconhecido'));
      } finally {
        setBuscando(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [busca, aluno, alunoFixo, unidadeAtual]);

  const handleSalvar = async () => {
    if (!aluno) { toast.error('Selecione um aluno'); return; }
    if (!naoRespondeu && nota < 1) { toast.error('Selecione a nota (estrelas) ou marque "Não respondeu"'); return; }
    setSalvando(true);
    try {
      const { error } = await supabase.rpc('registrar_resposta_pesquisa_manual', {
        p_aluno_id: aluno.id,
        p_data: data,
        p_tipo: tipo,
        p_nota: naoRespondeu ? null : nota,
        p_comentario: comentario.trim() || null,
        p_nao_respondeu: naoRespondeu,
      });
      if (error) throw error;
      toast.success(
        naoRespondeu
          ? `Marcado: ${aluno.nome} não respondeu (${LABEL_TIPO[tipo]})`
          : `Resposta de ${aluno.nome} registrada (${nota}★)`,
      );
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error('Erro ao registrar: ' + (err.message || 'desconhecido'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-400" />
            Lançar resposta — {LABEL_TIPO[tipo]}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {!alunoFixo && (
            <p className="text-sm text-slate-400">
              Para respostas coletadas fora do sistema.
            </p>
          )}

          {/* Aluno */}
          <div>
            <label className="text-sm font-medium text-slate-300 mb-1.5 block">Aluno</label>
            {aluno ? (
              <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-violet-500/10 border border-violet-500/40">
                <div className="min-w-0">
                  <p className="font-medium text-white truncate">{aluno.nome}</p>
                  {aluno.unidade_nome && (
                    <p className="text-xs text-slate-400">{aluno.unidade_nome}{aluno.status && ` • ${aluno.status}`}</p>
                  )}
                </div>
                {!alunoFixo && (
                  <button
                    onClick={() => { setAluno(null); setBusca(''); }}
                    className="p-1.5 hover:bg-slate-700 rounded-lg transition shrink-0"
                    title="Trocar aluno"
                  >
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    autoFocus
                    placeholder="Buscar aluno por nome..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="pl-9"
                  />
                  {buscando && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-violet-500" />
                  )}
                </div>
                {resultados.length > 0 && (
                  <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-slate-700/50 divide-y divide-slate-700/50">
                    {resultados.map((r) => (
                      <button key={r.id} onClick={() => setAluno(r)} className="w-full text-left px-3 py-2 hover:bg-slate-700/40 transition">
                        <p className="text-sm text-white truncate">{r.nome}</p>
                        <p className="text-xs text-slate-500">{r.unidade_nome || '—'}{r.status && ` • ${r.status}`}</p>
                      </button>
                    ))}
                  </div>
                )}
                {busca.trim().length >= 2 && !buscando && resultados.length === 0 && (
                  <p className="text-xs text-slate-500 mt-2">Nenhum aluno encontrado.</p>
                )}
              </>
            )}
          </div>

          {/* Não respondeu */}
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <Checkbox checked={naoRespondeu} onCheckedChange={(c) => { setNaoRespondeu(!!c); if (c) setNota(0); }} />
            O aluno não respondeu
          </label>

          {/* Nota (oculta se não respondeu) */}
          {!naoRespondeu && (
            <div>
              <label className="text-sm font-medium text-slate-300 mb-1.5 block">Nota</label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setNota(n)}
                    onMouseEnter={() => setHoverNota(n)}
                    onMouseLeave={() => setHoverNota(0)}
                    className="p-1 transition"
                    title={`${n} estrela${n > 1 ? 's' : ''}`}
                  >
                    <Star className={`w-8 h-8 ${n <= (hoverNota || nota) ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`} />
                  </button>
                ))}
                {nota > 0 && <span className="ml-2 text-sm text-slate-400">{nota}/5</span>}
              </div>
            </div>
          )}

          {/* Comentário */}
          <div>
            <label className="text-sm font-medium text-slate-300 mb-1.5 block">Comentário (opcional)</label>
            <Textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Observação do aluno, se houver..."
              rows={3}
            />
          </div>

          {/* Data */}
          <div>
            <label className="text-sm font-medium text-slate-300 mb-1.5 block">Data da resposta</label>
            <Input
              type="date"
              value={data}
              max={format(new Date(), 'yyyy-MM-dd')}
              onChange={(e) => setData(e.target.value)}
              className="w-44"
            />
          </div>

          {/* Ações */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
            <Button
              onClick={handleSalvar}
              disabled={salvando || !aluno || (!naoRespondeu && nota < 1)}
              className="bg-gradient-to-r from-violet-500 to-pink-500 hover:opacity-90"
            >
              {salvando ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</>) : (<><Check className="w-4 h-4 mr-2" /> Registrar</>)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ModalLancarRespostaManual;
```

- [ ] **Step 2: Verificar build/typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "ModalLancarRespostaManual|RespostasPesquisaTab" || echo "OK sem erros nos arquivos"`
Expected: `OK sem erros nos arquivos`.

- [ ] **Step 3: Commit**

```bash
git add src/components/App/SucessoCliente/ModalLancarRespostaManual.tsx
git commit -m "feat(pesquisas): modal de lancamento com comentario, nao-respondeu e modo contextual"
```

---

### Task 4: Componente `TimelinePesquisasAluno`

**Files:**
- Create: `src/components/App/SucessoCliente/TimelinePesquisasAluno.tsx`

**Interfaces:**
- Consumes: RPC `get_timeline_pesquisas_aluno`; componente `ModalLancarRespostaManual` (props `alunoFixo`/`tipoFixo`).
- Produces: `export function TimelinePesquisasAluno({ alunoId, alunoNome }: { alunoId: number; alunoNome?: string })`.

- [ ] **Step 1: Criar o componente**

Conteúdo de `TimelinePesquisasAluno.tsx`:

```tsx
import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Star, MessageSquare, Clock, Plus, Pencil, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { ModalLancarRespostaManual } from './ModalLancarRespostaManual';

export interface MarcoTimeline {
  tipo: string;
  label: string;
  ativo: boolean;
  nota: number | null;
  comentario: string | null;
  status: string | null;
  respondido_em: string | null;
  enviado_em: string | null;
}

interface Props {
  alunoId: number;
  alunoNome?: string;
}

export function TimelinePesquisasAluno({ alunoId, alunoNome }: Props) {
  const [marcos, setMarcos] = useState<MarcoTimeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalTipo, setModalTipo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_timeline_pesquisas_aluno', { p_aluno_id: alunoId });
      if (error) throw error;
      setMarcos((data as MarcoTimeline[]) || []);
    } catch (err: any) {
      toast.error('Erro ao carregar pesquisas: ' + (err.message || 'desconhecido'));
      setMarcos([]);
    } finally {
      setLoading(false);
    }
  }, [alunoId]);

  useEffect(() => { carregar(); }, [carregar]);

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-violet-500" /></div>;
  }

  return (
    <div className="space-y-1">
      {marcos.map((m, i) => (
        <MarcoLinha key={m.tipo} marco={m} ultimo={i === marcos.length - 1} onRegistrar={() => setModalTipo(m.tipo)} />
      ))}

      {modalTipo && (
        <ModalLancarRespostaManual
          open={!!modalTipo}
          onClose={() => setModalTipo(null)}
          unidadeAtual="todos"
          onSaved={carregar}
          alunoFixo={{ id: alunoId, nome: alunoNome || '' }}
          tipoFixo={modalTipo}
        />
      )}
    </div>
  );
}

function MarcoLinha({ marco, ultimo, onRegistrar }: { marco: MarcoTimeline; ultimo: boolean; onRegistrar: () => void }) {
  const respondida = marco.status === 'respondida' && marco.nota != null;
  const naoRespondeu = marco.status === 'nao_respondida';
  const pendente = marco.status === 'pendente';
  const semRegistro = !marco.status;

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-3 h-3 rounded-full mt-1.5 ${
          respondida ? 'bg-amber-400' : naoRespondeu ? 'bg-slate-500' : marco.ativo ? 'bg-violet-500/50' : 'bg-slate-700'
        }`} />
        {!ultimo && <div className="w-px flex-1 bg-slate-700 my-1" />}
      </div>

      <div className="flex-1 pb-5">
        <div className="flex items-center justify-between">
          <span className="font-medium text-white">{marco.label}</span>
          {marco.respondido_em && (
            <span className="text-xs text-slate-500">{format(new Date(marco.respondido_em), 'dd/MM/yy', { locale: ptBR })}</span>
          )}
        </div>

        {respondida && (
          <div className="mt-1">
            <span className="text-amber-400">{'⭐'.repeat(marco.nota!)}</span>
            {marco.comentario && (
              <p className="mt-1 text-sm text-slate-300 flex items-start gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 mt-0.5 text-slate-500 shrink-0" />
                {marco.comentario}
              </p>
            )}
            <button onClick={onRegistrar} className="mt-1 text-xs text-violet-400 hover:text-violet-300 inline-flex items-center gap-1">
              <Pencil className="w-3 h-3" /> Editar
            </button>
          </div>
        )}

        {naoRespondeu && (
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">Não respondeu</span>
            <button onClick={onRegistrar} className="text-xs text-violet-400 hover:text-violet-300 inline-flex items-center gap-1">
              <Pencil className="w-3 h-3" /> Editar
            </button>
          </div>
        )}

        {(pendente || semRegistro) && marco.ativo && (
          <div className="mt-1 flex items-center gap-2">
            {pendente && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 inline-flex items-center gap-1">
                <Clock className="w-3 h-3" /> Aguardando resposta
              </span>
            )}
            <button onClick={onRegistrar} className="text-xs text-violet-400 hover:text-violet-300 inline-flex items-center gap-1">
              <Plus className="w-3 h-3" /> Registrar
            </button>
          </div>
        )}

        {!marco.ativo && <span className="mt-1 inline-block text-xs text-slate-600">Em breve</span>}
      </div>
    </div>
  );
}

export default TimelinePesquisasAluno;
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "TimelinePesquisasAluno" || echo "OK sem erros"`
Expected: `OK sem erros`.

- [ ] **Step 3: Commit**

```bash
git add src/components/App/SucessoCliente/TimelinePesquisasAluno.tsx
git commit -m "feat(pesquisas): componente TimelinePesquisasAluno (regua de marcos)"
```

---

### Task 5: Embutir a timeline em `ModalDetalhesSucessoAluno`

**Files:**
- Modify: `src/components/App/SucessoCliente/ModalDetalhesSucessoAluno.tsx`

**Interfaces:**
- Consumes: `TimelinePesquisasAluno` (Task 4). Recebe `aluno.id` e `aluno.nome` (já no escopo do componente).

- [ ] **Step 1: Importar o componente**

Adicionar no topo, junto aos imports de componentes locais:
```tsx
import { TimelinePesquisasAluno } from './TimelinePesquisasAluno';
```

- [ ] **Step 2: Adicionar a seção de pesquisas**

Logo após o fechamento do bloco "Plano de Ação Inteligente" (o `</div>` que encerra a seção de insights, por volta da linha 789-792, antes do bloco seguinte), inserir uma nova seção em card no mesmo padrão visual:

```tsx
        {/* Pesquisas / Acompanhamento */}
        <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
          <h3 className="font-semibold text-white flex items-center gap-2 mb-4">
            <Star className="w-4 h-4 text-amber-400" /> Pesquisas
          </h3>
          <TimelinePesquisasAluno alunoId={aluno.id} alunoNome={aluno.nome} />
        </div>
```

Garantir que `Star` esteja importado de `lucide-react` neste arquivo (adicionar ao import existente se faltar).

- [ ] **Step 3: Verificar typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "ModalDetalhesSucessoAluno" || echo "OK sem erros"`
Expected: `OK sem erros`.

- [ ] **Step 4: Commit**

```bash
git add src/components/App/SucessoCliente/ModalDetalhesSucessoAluno.tsx
git commit -m "feat(pesquisas): timeline na ficha de detalhe do Sucesso do Aluno"
```

---

### Task 6: Embutir a timeline como aba em `ModalFichaAluno`

**Files:**
- Modify: `src/components/App/Alunos/ModalFichaAluno.tsx`

**Interfaces:**
- Consumes: `TimelinePesquisasAluno` (Task 4). `aluno.id` e `aluno.nome` no escopo.

- [ ] **Step 1: Importar o componente**

Adicionar perto dos imports locais (após `import { ContatosAluno } ...`):
```tsx
import { TimelinePesquisasAluno } from '../SucessoCliente/TimelinePesquisasAluno';
```
E garantir `Star` no import de `lucide-react` (a linha de import já traz vários ícones; adicionar `Star` se faltar).

- [ ] **Step 2: Adicionar o gatilho da aba**

Na `TabsList` (linha ~882), trocar `grid-cols-6` por `grid-cols-7` e adicionar, após o `TabsTrigger value="historico"` (linha ~903-906):
```tsx
            <TabsTrigger value="pesquisas" className="flex items-center gap-2">
              <Star className="w-4 h-4" />
              <span className="hidden sm:inline">Pesquisas</span>
            </TabsTrigger>
```

- [ ] **Step 3: Adicionar o conteúdo da aba**

Após o `</TabsContent>` da aba `historico` (e antes do fechamento do `<div className="flex-1 overflow-y-auto ...">`), inserir:
```tsx
            <TabsContent value="pesquisas" className="space-y-4 mt-0">
              <TimelinePesquisasAluno alunoId={aluno.id} alunoNome={aluno.nome} />
            </TabsContent>
```

- [ ] **Step 4: Verificar build completo**

Run: `npm run build`
Expected: build sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/components/App/Alunos/ModalFichaAluno.tsx
git commit -m "feat(pesquisas): aba Pesquisas na ficha do aluno (modulo Alunos)"
```

---

### Task 7: Memória, docs e push

**Files:**
- Modify: `CLAUDE.md` (linha da Pesquisa NPS — citar a timeline na ficha do aluno)
- Modify: `.claude/memory/integracao-infra.md` (entrada da aba Respostas — citar `TimelinePesquisasAluno` + RPCs + colunas)
- Modify: `daily-notes/2026-06-23.md` (append da feature)

**Interfaces:**
- Consumes: tudo das tasks anteriores.

- [ ] **Step 1: Atualizar CLAUDE.md**

Na linha da "Pesquisa NPS pós-1ª aula", acrescentar que existe a **linha do tempo de pesquisas por aluno** (`TimelinePesquisasAluno`) embutida em `ModalFichaAluno` (aba Pesquisas) e `ModalDetalhesSucessoAluno`, régua 1ª aula → 3 meses → evasão (só 1ª aula ativa), com comentário e "não respondeu", via RPCs `get_timeline_pesquisas_aluno` + `registrar_resposta_pesquisa_manual`.

- [ ] **Step 2: Atualizar memória de integração**

Em `.claude/memory/integracao-infra.md`, na entrada "Aba Respostas", acrescentar bloco sobre a timeline por aluno: colunas `comentario`/`status`, RPC de leitura por régua, RPC de gravação por upsert lógico `(aluno_id,tipo)`, componente embutido nas 2 fichas, edge `processar-resposta-pesquisa` setando `status='respondida'`.

- [ ] **Step 3: Append na daily note**

Em `daily-notes/2026-06-23.md`, adicionar seção "Timeline de pesquisas do aluno" resumindo o que foi entregue, com ponteiros (spec/plano, RPCs, componente, fichas).

- [ ] **Step 4: Commit e push**

```bash
git add CLAUDE.md .claude/memory/integracao-infra.md daily-notes/2026-06-23.md
git commit -m "docs(pesquisas): timeline do aluno (CLAUDE.md, memoria, daily)"
git pull --rebase origin main
git push origin main
```
Expected: push aceito (rebase limpo).

---

## Self-Review

**Cobertura do spec:**
- Colunas `comentario`/`status` → Task 1. ✅
- RPC leitura régua → Task 1. ✅
- RPC gravação upsert (nota/não-respondeu/comentário/marco) → Task 1. ✅
- Edge captura grava `status` → Task 2. ✅
- Modal generalizado (busca + contextual) → Task 3. ✅
- Componente timeline (estados respondida/não-respondeu/pendente/sem-registro/em-breve) → Task 4. ✅
- Encaixe em `ModalDetalhesSucessoAluno` → Task 5; `ModalFichaAluno` → Task 6. ✅
- Fora de escopo (3 meses/evasão ativos, captura de comentário por WhatsApp, unificar evasão) → não implementado, marcos reservados como "Em breve". ✅

**Consistência de tipos:** `MarcoTimeline` (Task 4) bate com o `jsonb` da RPC (Task 1: tipo,label,ativo,nota,comentario,status,respondido_em,enviado_em). Assinatura `registrar_resposta_pesquisa_manual(p_aluno_id, p_data, p_tipo, p_nota, p_comentario, p_nao_respondeu)` idêntica entre Task 1 (SQL) e Task 3 (chamada RPC). Props `alunoFixo`/`tipoFixo` definidas na Task 3 e usadas na Task 4. ✅

**Placeholders:** nenhum TODO/TBD; código completo em cada arquivo novo; modificações com trecho exato a localizar e substituir. ✅
