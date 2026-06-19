# Padroes de Codigo — LA Music

## Hooks de Data Fetching
```
const [data, setData] = useState<T | null>(null);
const [isLoading, setIsLoading] = useState(true);
const fetchData = useCallback(async () => {
  setIsLoading(true);
  try {
    const { data, error } = await supabase.from('tabela').select('*');
    if (error) throw error;
    setData(data);
  } catch (err) { setError(err as Error); }
  finally { setIsLoading(false); }
}, [deps]);
useEffect(() => { fetchData(); }, [fetchData]);
return { data, isLoading, error, refetch: fetchData };
```
- Try/catch com fallback quando view falha (tenta tabela raw)
- Exemplos: `useKPIsComercial`, `useMetas`, `useKPIsRetencao`

## Modais (Dialog)
- Props: `open`, `onOpenChange`, `onSuccess`
- Estado `saving` (boolean) para loading com `Loader2 animate-spin`
- Submit: validar → supabase insert/update → reset form → `onSuccess()`
- Exemplos: `ModalRenovacao`, `ModalNovoLead`, `ModalNovoPerfil`

## Edicao Inline (CelulaEditavelInline)
- Click → modo edicao, Blur → salva. Enter = salvar, Escape = cancelar
- `onChange` e async (Promise). Indicador: Loader2 (salvando) → Check (salvo)
- Tipos: `texto`, `numero`, `moeda`, `select`, `data`
- `moeda` exibe "R$ 100,00" mas salva como number
- Componente em `src/components/ui/CelulaEditavelInline.tsx`
- **Nested fields (outros_cursos):** helper `aplicarUpdateLocal()` em `TabelaAlunos.tsx` faz busca recursiva em `aluno.outros_cursos[]` para optimistic update de campos do segundo curso

## Filtros
- **Unidade:** `useUnidadeFiltro` — admin ve consolidado (null), unidade travada
- **Competencia:** `useCompetenciaFiltro` — mensal/trimestral/semestral/anual, retorna `range`

## Toasts (Sonner)
```typescript
import { toast } from 'sonner';
toast.success('Salvo com sucesso!');
toast.error('Erro ao salvar');
```

## Queries Supabase
- Select com joins: `.select('*, unidades(codigo), professores:professor_id(nome)')`
- Count: `.select('*', { count: 'exact', head: true })`
- Insert: `.insert({...}).select().single()`
- Upsert: `.upsert({...}, { onConflict: 'col1,col2' })`
- Erro `23505` = violacao unique constraint

## Componentes UI (shadcn)
- `cn()` de `src/lib/utils.ts` para merge de classes Tailwind
- Dark mode: `bg-slate-800/50`, borders `border-slate-700`
- Gradientes nos cards: `bg-gradient-to-br from-X-500 to-Y-500`
- Icones: Lucide React (`lucide-react`)

## Combobox/Command (cmdk)
- Componente em `src/components/ui/command.tsx` (shadcn wrapping cmdk)
- Usado quando select tem muitas opcoes (ex: professores) — permite busca por texto
- Padrao: `Command > CommandInput > CommandList > CommandEmpty > CommandGroup > CommandItem`
- `onSelect` no CommandItem para capturar selecao
- Mostrar selecionado abaixo com `<p className="text-[10px] text-violet-400">`

## Popover com Acoes
- Usado para menus de acao contextual (ex: mover etapa de lead)
- `Popover > PopoverTrigger (botao) > PopoverContent (opcoes)`
- Cada opcao como `<Button variant="ghost" size="sm" onClick={handler}>`
- Formularios inline dentro do popover (ex: selecionar professor + data)

## Batch/Lote
- Arrays de `LoteLinha[]` com funcoes `addLinha()`, `removeLinha()`, `updateLinha()`
- `handleSaveLote*()`: loop sequencial com supabase insert/update por item
- Selecao em lote: `Set<number>` para IDs selecionados + checkbox individual + "selecionar todos"
- Exclusao em lote: confirmation dialog → optimistic update (remove do state sem reload, mantem scroll)
- Busca cross-period: resultados de outros meses exibidos com badge amber

## invokeWithRetry (Edge Function Retry)
- Utility em `src/lib/supabase.ts` (~linhas 16-53)
- Retry automatico com refresh de JWT ao detectar 401, `unauthorized`, `invalid jwt`, `jwt expired`, `relay error`
- Fluxo: invoke → se erro auth → `supabase.auth.refreshSession()` → retry 1x
- Usado em `useAdminMensagens` para envio de mensagens admin

## Edge Functions (Deno)
```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = { 'Access-Control-Allow-Origin': '*', ... };
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try { /* logica */ }
  catch (error) { return new Response(JSON.stringify({ error }), { status: 500, headers: corsHeaders }); }
});
```

## Nomenclatura
- Variaveis, funcoes, comentarios em portugues
- Componentes: PascalCase, Hooks: `use` + camelCase
- Paginas: `*Page.tsx`, Modais: `Modal*.tsx`, Tabs: `Tab*.tsx`

## Formatação de mensagens WhatsApp
- `formatarWhatsApp(texto)` em `src/lib/whatsappFormat.tsx` converte marcação do WhatsApp (`*negrito*` `_itálico_` `~tachado~` ` ```mono``` `) em JSX, para o painel mostrar a mensagem como o cliente recebe (não os asteriscos crus). Parser recursivo tolerante, suporta aninhamento.
- Usado nos painéis de chat de cliente: AdminChatPanel, PreAtendimento/chat/ChatBubble, Campanhas/ConversasTab (no ramo sem busca; com `searchTerm` mantém HighlightText).

## Avatar com fallback de foto (React)
- **NUNCA** manipular DOM direto no `onError` da `<img>` (`style.display`, `classList.remove`). Quebra com re-render (ex: listas com Realtime), causando avatares de tamanho/alinhamento inconsistente.
- Padrão correto: componente com `useState(imgError)` que renderiza **OU** a foto **OU** o fallback (iniciais/ícone), nunca os dois. Garante tamanho fixo e alinhamento estável. Ref: `AvatarContato` em `AdminInboxList.tsx`.
- URLs de foto de perfil do WhatsApp/UAZAPI expiram → o `onError` precisa ser robusto.
- `bg-gradient-to-br` sem `from-`/`to-` definidos = gradiente sem cor; só aplicar a classe quando houver as cores do gradiente.
