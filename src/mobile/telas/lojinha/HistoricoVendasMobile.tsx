import { ChevronRight, Search } from 'lucide-react';
import {
  formatarDiaCurto,
  formatarReais,
  type ResumoHistorico,
  type VendaHistorico,
} from '@/lib/lojinhaHistorico';
import { cn } from '@/lib/utils';

/**
 * O Histórico de Vendas da Lojinha no celular (LAPE-32).
 *
 * A tabela de 8 colunas vira uma linha por venda: o que foi vendido e o valor
 * na primeira linha, dia · forma · quem vendeu na segunda. Os três cartões do
 * computador viram uma faixa só — hoje, mês e ticket cabem numa linha e não
 * empurram a lista para baixo da dobra.
 *
 * Venda do PDV abre o mesmo modal de detalhes do computador (de onde sai o
 * estorno). Venda lançada no caixa pela Sol não abre nada: ela se corrige no
 * Caixa, e a linha diz isso em vez de ser um botão que não responde.
 *
 * ⚠️ Esta tela **não busca nada e não escreve nada**: recebe o que a
 * `TabVendas` já leu e montou por `@/lib/lojinhaHistorico`.
 */

interface Props {
  carregando: boolean;
  vendas: VendaHistorico[];
  /** Quantas há sem a busca — separa "não tem venda" de "a busca não achou". */
  totalSemFiltro: number;
  resumo: ResumoHistorico;
  busca: string;
  onBusca: (texto: string) => void;
  onAbrirVenda: (venda: VendaHistorico) => void;
}

export function HistoricoVendasMobile({
  carregando,
  vendas,
  totalSemFiltro,
  resumo,
  busca,
  onBusca,
  onAbrirVenda,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Numero rotulo="Hoje" valor={formatarReais(resumo.hojeTotal)} nota={qtdVendas(resumo.hojeQtd)} cor="text-emerald-400" />
        <Numero rotulo={resumo.mesRotulo} valor={formatarReais(resumo.mesTotal)} nota={qtdVendas(resumo.mesQtd)} cor="text-sky-400" />
        <Numero rotulo="Ticket médio" valor={formatarReais(resumo.ticketMedio)} nota="no mês" cor="text-amber-400" />
      </div>

      <label className="relative block">
        <span className="sr-only">Buscar venda</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
        <input
          type="search"
          value={busca}
          onChange={(e) => onBusca(e.target.value)}
          placeholder="Buscar produto, cliente ou vendedor"
          className="min-h-[44px] w-full rounded-xl border border-slate-700 bg-slate-900 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
        />
      </label>

      <p className="px-1 text-[11px] text-slate-500">
        Últimos 3 meses · vendas do PDV e as lançadas no caixa pela Sol
      </p>

      {vendas.length === 0 ? (
        <p className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-6 text-center text-sm text-slate-400">
          {carregando
            ? 'Carregando…'
            : totalSemFiltro > 0 && busca.trim()
              ? `Nenhuma venda com “${busca.trim()}”.`
              : 'Nenhuma venda nos últimos 3 meses.'}
        </p>
      ) : (
        <ul className="divide-y divide-slate-800 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
          {vendas.map((v) => (
            <li key={v.chave}>
              <LinhaVenda venda={v} onAbrir={onAbrirVenda} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function qtdVendas(n: number): string {
  return `${n} ${n === 1 ? 'venda' : 'vendas'}`;
}

function Numero({ rotulo, valor, nota, cor }: { rotulo: string; valor: string; nota: string; cor: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-900/60 px-2.5 py-2">
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400">{rotulo}</p>
      <p className={cn('truncate font-mono text-[13px] font-bold tabular-nums', cor)}>{valor}</p>
      <p className="truncate text-[10px] text-slate-500">{nota}</p>
    </div>
  );
}

function LinhaVenda({ venda, onAbrir }: { venda: VendaHistorico; onAbrir: (v: VendaHistorico) => void }) {
  const titulo = venda.cliente ?? venda.detalhe;
  const sub = venda.cliente ? venda.detalhe : null;
  const meta = [formatarDiaCurto(venda.dia), venda.forma, venda.vendedor].filter(Boolean).join(' · ');

  const conteudo = (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={cn('min-w-0 flex-1 text-[13px] font-semibold text-white', venda.estornada && 'text-slate-400')}>
            {titulo}
          </span>
          <span
            className={cn(
              'shrink-0 font-mono text-[13px] font-bold tabular-nums',
              venda.estornada ? 'text-slate-500 line-through' : 'text-emerald-400',
            )}
          >
            {formatarReais(venda.total)}
          </span>
        </span>
        {sub && <span className="mt-0.5 block text-[12px] text-slate-300">{sub}</span>}
        <span className="mt-0.5 block text-[11px] text-slate-500">
          {meta}
          {venda.estornada && <span className="ml-1 font-semibold text-rose-400">· Estornada</span>}
          {/* A marca vai na EXCEÇÃO: quase toda venda hoje vem do caixa, e um
              selo que acende em quase toda linha vira fundo. */}
          {venda.origem === 'pdv' && <span className="ml-1 text-slate-400">· PDV</span>}
        </span>
      </span>
    </>
  );

  if (!venda.vendaPdv) {
    return <div className="flex min-h-[56px] items-start gap-2 px-3 py-2.5">{conteudo}</div>;
  }
  return (
    <button
      type="button"
      onClick={() => onAbrir(venda)}
      className="flex min-h-[56px] w-full items-start gap-2 px-3 py-2.5 text-left active:bg-slate-800/60"
    >
      {conteudo}
      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
    </button>
  );
}
