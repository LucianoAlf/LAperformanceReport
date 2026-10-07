import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import {
  contarChips,
  fichaDoProduto,
  filtrarProdutos,
  formatarPreco,
  nivelDeEstoque,
  subtituloDoProduto,
  SUBABAS_NO_COMPUTADOR,
  type FiltrosLike,
  type NivelEstoque,
  type ProdutoLike,
  type StatusFiltro,
} from '@/lib/lojinhaMobile';
import { FolhaMobile } from '@/mobile/FolhaMobile';
import { cn } from '@/lib/utils';

/**
 * Os produtos da Lojinha no celular: uma linha por produto, a ficha no toque.
 *
 * O recorte e os números que o motivam estão em `@/lib/lojinhaMobile`.
 * Resumindo: a tabela do computador já vira cartão aqui, mas empilha as nove
 * colunas como nove linhas — **326px por produto**, 20 produtos, 6.520px de
 * rolagem. No balcão a pergunta é *tem? quanto custa?*, e três campos
 * respondem.
 *
 * ⚠️ Esta tela **não busca nada e não escreve nada**. Recebe os produtos já
 * carregados pela `TabProdutos` e devolve, por callback, qual modal abrir —
 * os MESMOS do computador, que já cabem no telefone.
 */

interface Props {
  produtos: ProdutoLike[];
  categorias: Array<{ id: number; nome: string }>;
  /** Abre o modal de edição do computador. */
  onEditar: (produtoId: number) => void;
  /** Abre o modal de produto novo. */
  onNovo: () => void;
}

const CLASSE_PILULA: Record<NivelEstoque, string> = {
  sem: 'bg-rose-500/15 text-rose-400',
  baixo: 'bg-amber-500/15 text-amber-400',
  ok: 'bg-emerald-500/15 text-emerald-400',
};

export function ProdutosMobile({ produtos, categorias, onEditar, onNovo }: Props) {
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState<StatusFiltro>('todos');
  const [categoriaId, setCategoriaId] = useState<number | null>(null);
  const [aberto, setAberto] = useState<ProdutoLike | null>(null);

  const chips = useMemo(() => contarChips(produtos), [produtos]);

  const filtros: FiltrosLike = { busca, categoria_id: categoriaId, status };
  const lista = useMemo(() => filtrarProdutos(produtos, filtros), [produtos, busca, categoriaId, status]);

  // 🔴 "Sem estoque" NÃO é um `status` do filtro do computador (lá o
  // `estoque_baixo` já inclui o zerado). Ele é recorte próprio desta tela,
  // aplicado DEPOIS — no balcão, "acabou" e "está acabando" pedem conversas
  // diferentes com o aluno que está na frente.
  const [soSemEstoque, setSoSemEstoque] = useState(false);
  const visiveis = useMemo(
    () => (soSemEstoque ? lista.filter((p) => nivelDeEstoque(p) === 'sem') : lista),
    [lista, soSemEstoque],
  );

  return (
    <div className="flex flex-col gap-3 pb-4">
      {/* ⚠️ A altura mínima vai no INPUT, não só na caixa: medido, o campo
          nascia com 20px de alvo dentro de um contêiner maior — quem mede
          alvo de toque mede o elemento que recebe o toque. */}
      <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3">
        <Search className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar produto ou SKU"
          className="min-h-[44px] min-w-0 flex-1 bg-transparent text-[13px] text-slate-100 outline-none placeholder:text-slate-500"
        />
      </div>

      {/* Trilho de recortes. ⚠️ A contagem é sobre a lista INTEIRA: um chip que
          mostra o tamanho do próprio recorte não ajuda a decidir se vale
          tocá-lo. */}
      <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Chip
          ativo={!soSemEstoque && status === 'todos' && categoriaId === null}
          onClick={() => { setSoSemEstoque(false); setStatus('todos'); setCategoriaId(null); }}
          rotulo="Todos"
          n={chips.todos}
        />
        <Chip
          ativo={soSemEstoque}
          onClick={() => { setSoSemEstoque((v) => !v); setStatus('todos'); }}
          rotulo="Sem estoque"
          n={chips.semEstoque}
        />
        <Chip
          ativo={status === 'estoque_baixo'}
          onClick={() => { setSoSemEstoque(false); setStatus((v) => (v === 'estoque_baixo' ? 'todos' : 'estoque_baixo')); }}
          rotulo="Estoque baixo"
          n={chips.estoqueBaixo}
        />
        {categorias.map((c) => (
          <Chip
            key={c.id}
            ativo={categoriaId === c.id}
            onClick={() => { setSoSemEstoque(false); setCategoriaId((v) => (v === c.id ? null : c.id)); }}
            rotulo={c.nome}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={onNovo}
        className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 text-[13px] font-semibold text-cyan-300 active:bg-cyan-500/20"
      >
        <Plus className="h-4 w-4" aria-hidden />
        Novo produto
      </button>

      {visiveis.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">
          Nenhum produto neste recorte.
        </p>
      ) : (
        <div className="flex flex-col">
          {visiveis.map((p) => (
            <LinhaProduto key={p.id} produto={p} onAbrir={() => setAberto(p)} />
          ))}
        </div>
      )}

      <p className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2.5 text-[11.5px] leading-relaxed text-slate-400">
        {SUBABAS_NO_COMPUTADOR.join(' e ')} ficam no computador.
      </p>

      <FolhaMobile
        aberto={aberto !== null}
        onFechar={() => setAberto(null)}
        titulo={aberto?.nome ?? ''}
        subtitulo={aberto ? subtituloDoProduto(aberto) : undefined}
      >
        {aberto && <FichaProduto produto={aberto} onEditar={() => { onEditar(aberto.id); setAberto(null); }} />}
      </FolhaMobile>
    </div>
  );
}

function Chip({
  ativo,
  onClick,
  rotulo,
  n,
}: {
  ativo: boolean;
  onClick: () => void;
  rotulo: string;
  n?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        // ⚠️ 44px, não 36: medido no navegador, o trilho nascia com DEZ alvos
        // abaixo do mínimo de toque. Chip é o controle mais tocado desta tela.
        'flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[11.5px] font-semibold',
        ativo
          ? 'border-slate-200 bg-slate-200 text-slate-950'
          : 'border-slate-700 bg-slate-800 text-slate-400',
      )}
    >
      {rotulo}
      {typeof n === 'number' && (
        <span className={cn('tabular-nums', ativo ? 'text-slate-600' : 'text-slate-500')}>{n}</span>
      )}
    </button>
  );
}

function LinhaProduto({ produto, onAbrir }: { produto: ProdutoLike; onAbrir: () => void }) {
  const nivel = nivelDeEstoque(produto);
  const total = produto.estoque_total ?? 0;

  return (
    <button
      type="button"
      onClick={onAbrir}
      className="flex min-h-[44px] items-center gap-2.5 border-b border-slate-800 py-2.5 text-left last:border-b-0 active:bg-slate-900"
    >
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-800 text-base"
        aria-hidden
      >
        {produto.loja_categorias?.icone || '📦'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold text-slate-50">
          {produto.nome}
        </span>
        <span className="block truncate text-[11px] text-slate-400">
          {subtituloDoProduto(produto)}
        </span>
      </span>
      {/* O estoque é a ÚNICA coluna que muda de cor, porque é a única que pede
          ação. Colorir mais de uma faria o vocabulário deixar de significar. */}
      <span
        className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums',
          CLASSE_PILULA[nivel],
        )}
      >
        {total}
      </span>
      <span className="shrink-0 text-slate-600" aria-hidden>›</span>
    </button>
  );
}

function FichaProduto({ produto, onEditar }: { produto: ProdutoLike; onEditar: () => void }) {
  const nivel = nivelDeEstoque(produto);
  const linhas = fichaDoProduto(produto);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5">
          <div className="text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
            Preço
          </div>
          <div className="font-grotesk text-xl font-bold tabular-nums text-slate-50">
            {formatarPreco(produto.preco)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5">
          <div className="text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
            Estoque
          </div>
          <div
            className={cn(
              'font-grotesk text-xl font-bold tabular-nums',
              nivel === 'sem' ? 'text-rose-400' : nivel === 'baixo' ? 'text-amber-400' : 'text-emerald-400',
            )}
          >
            {produto.estoque_total ?? 0}
          </div>
        </div>
      </div>

      <dl className="flex flex-col">
        {linhas.map((l) => (
          <div
            key={l.rotulo}
            className="flex items-baseline justify-between gap-3 border-b border-slate-800 py-2 last:border-b-0"
          >
            <dt className="shrink-0 text-[12px] text-slate-400">{l.rotulo}</dt>
            <dd className="m-0 min-w-0 truncate text-right text-[12px] font-semibold text-slate-50">
              {l.valor}
            </dd>
          </div>
        ))}
      </dl>

      <button
        type="button"
        onClick={onEditar}
        className="min-h-[44px] rounded-xl bg-cyan-500 text-[13.5px] font-bold text-slate-950 active:bg-cyan-400"
      >
        Editar produto
      </button>
    </div>
  );
}
