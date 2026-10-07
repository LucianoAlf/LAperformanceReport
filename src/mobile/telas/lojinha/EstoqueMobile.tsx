import { useMemo, useState } from 'react';
import { AlertTriangle, Download, History, MessageCircle, Search } from 'lucide-react';
import {
  ALERTAS_VISIVEIS,
  filtrarEstoquePorBusca,
  formatarDataMov,
  nivelDaVariacao,
  rotuloPilula,
  rotuloTipoMovimentacao,
  type GrupoEstoque,
  type NivelVariacao,
} from '@/lib/lojinhaEstoque';
import type { AlertaEstoque, LojaMovimentacaoEstoque } from '@/types/lojinha';
import { FolhaMobile } from '@/mobile/FolhaMobile';
import { cn } from '@/lib/utils';

/**
 * O estoque da Lojinha no celular.
 *
 * **A ordem é a do computador**, de propósito: primeiro o que precisa repor,
 * depois a lista inteira. Quem desenhou a tela da mesa decidiu que "o que está
 * acabando" é a primeira coisa a ver, e o celular não tem motivo para inverter.
 * A lista vem inteira, sem filtro escondendo nada — quem abriu a aba para
 * conferir um produto que NÃO está acabando não deveria ter de desligar nada
 * para achá-lo.
 *
 * O que muda é a FORMA:
 * - a tabela de 7 colunas vira uma linha por produto, com cada variação numa
 *   pílula (`P 11 · M 2 · GG 0`) colorida pela régua da coluna Status;
 * - mínimo e última movimentação — as colunas que saem da linha — moram na
 *   ficha, a um toque;
 * - as 20 movimentações recentes ficam atrás de um botão. No computador elas
 *   estão no fim da página e não empurram nada; aqui seriam 20 linhas de
 *   histórico entre a pessoa e o fim da lista.
 *
 * ⚠️ Esta tela **não busca nada e não escreve nada**. Recebe o que a
 * `TabEstoque` já carregou e devolve, por callback, as mesmas ações do
 * computador: alertar um, alertar todos, abrir a entrada em lote.
 */

interface Props {
  carregando: boolean;
  alertas: AlertaEstoque[];
  grupos: GrupoEstoque[];
  movimentacoes: LojaMovimentacaoEstoque[];
  /** "Consolidado", o nome da unidade, ou "Unidade" — nunca um nome inventado. */
  tituloUnidade: string;
  onAlertar: (alerta: AlertaEstoque) => void;
  onAlertarTodos: () => void;
  onEntradaLote: () => void;
}

const CLASSE_NIVEL: Record<NivelVariacao, string> = {
  zerado: 'bg-rose-500/15 text-rose-400',
  atencao: 'bg-amber-500/15 text-amber-400',
  ok: 'bg-emerald-500/15 text-emerald-400',
};

const ROTULO_NIVEL: Record<NivelVariacao, string> = {
  zerado: 'Zerado',
  atencao: 'Atenção',
  ok: 'OK',
};

export function EstoqueMobile({
  carregando,
  alertas,
  grupos,
  movimentacoes,
  tituloUnidade,
  onAlertar,
  onAlertarTodos,
  onEntradaLote,
}: Props) {
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<GrupoEstoque | null>(null);
  const [verMovimentacoes, setVerMovimentacoes] = useState(false);

  const lista = useMemo(() => filtrarEstoquePorBusca(grupos, busca), [grupos, busca]);
  const alertasVisiveis = alertas.slice(0, ALERTAS_VISIVEIS);
  const alertasOcultos = alertas.length - alertasVisiveis.length;

  return (
    <div className="flex flex-col gap-4 pb-4">
      {alertas.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="estoque-repor">
          <h3 id="estoque-repor" className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-100">
            <AlertTriangle className="h-4 w-4 text-amber-400" aria-hidden />
            Precisa repor
            <span className="tabular-nums text-slate-500">{alertas.length}</span>
          </h3>

          <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/60">
            {alertasVisiveis.map((a) => (
              <div
                key={`${a.produto_id}-${a.variacao_id ?? 'u'}`}
                className="flex items-center gap-2.5 border-b border-slate-800 px-3 py-2 last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-slate-50">
                    {a.produto_nome}
                    {a.variacao_nome && <span className="font-normal text-slate-400"> — {a.variacao_nome}</span>}
                  </span>
                  <span className="block text-[11px] text-slate-400">
                    <strong
                      className={cn(
                        'tabular-nums',
                        a.nivel === 'atencao' ? 'text-amber-400' : 'text-rose-400',
                      )}
                    >
                      {a.quantidade_atual}
                    </strong>{' '}
                    de {a.estoque_minimo} mín.
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onAlertar(a)}
                  aria-label={`Alertar reposição de ${a.produto_nome}${a.variacao_nome ? ` ${a.variacao_nome}` : ''}`}
                  className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 text-[12px] font-semibold text-emerald-400 active:bg-emerald-500/20"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden />
                  Alertar
                </button>
              </div>
            ))}
          </div>

          {/* ⚠️ O computador mostra os 5 primeiros e cala sobre o resto. Aqui a
              tela DIZ que há mais — o botão abaixo alcança todos. */}
          {alertasOcultos > 0 && (
            <p className="text-[11.5px] text-slate-500">
              E mais {alertasOcultos} {alertasOcultos === 1 ? 'item' : 'itens'} abaixo do mínimo.
            </p>
          )}

          <button
            type="button"
            onClick={onAlertarTodos}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-[13px] font-semibold text-emerald-400 active:bg-emerald-500/20"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            Alertar todos ({alertas.length})
          </button>
        </section>
      )}

      <section className="flex flex-col gap-2" aria-labelledby="estoque-lista">
        <h3 id="estoque-lista" className="text-[13px] font-semibold text-slate-100">
          Estoque — {tituloUnidade}
        </h3>

        {/* ⚠️ A altura mínima vai no INPUT, não na caixa: quem mede alvo de
            toque mede o elemento que recebe o toque. */}
        <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3">
          <Search className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto ou tamanho"
            aria-label="Buscar no estoque"
            className="min-h-[44px] min-w-0 flex-1 bg-transparent text-[13px] text-slate-100 outline-none placeholder:text-slate-500"
          />
        </div>

        <button
          type="button"
          onClick={onEntradaLote}
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 text-[13px] font-semibold text-cyan-300 active:bg-cyan-500/20"
        >
          <Download className="h-4 w-4" aria-hidden />
          Entrada em lote
        </button>

        {carregando ? (
          <p className="py-10 text-center text-sm text-slate-400">Carregando...</p>
        ) : lista.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">
            {busca.trim()
              ? `Nenhum produto ou variação com “${busca.trim()}”.`
              : 'Nenhum produto no estoque desta unidade.'}
          </p>
        ) : (
          <div className="flex flex-col">
            {lista.map((g) => (
              <LinhaProduto key={g.produto_id} grupo={g} onAbrir={() => setAberto(g)} />
            ))}
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={() => setVerMovimentacoes(true)}
        className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/60 text-[13px] font-semibold text-slate-300 active:bg-slate-800"
      >
        <History className="h-4 w-4" aria-hidden />
        Ver movimentações recentes ({movimentacoes.length})
      </button>

      <FolhaMobile
        aberto={aberto !== null}
        onFechar={() => setAberto(null)}
        titulo={aberto?.produto_nome ?? ''}
        subtitulo={aberto ? `Estoque — ${tituloUnidade}` : undefined}
      >
        {aberto && <FichaEstoque grupo={aberto} />}
      </FolhaMobile>

      <FolhaMobile
        aberto={verMovimentacoes}
        onFechar={() => setVerMovimentacoes(false)}
        titulo="Movimentações recentes"
        subtitulo={`As últimas ${movimentacoes.length} · ${tituloUnidade}`}
      >
        <ListaMovimentacoes movimentacoes={movimentacoes} />
      </FolhaMobile>
    </div>
  );
}

function LinhaProduto({ grupo, onAbrir }: { grupo: GrupoEstoque; onAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="flex min-h-[44px] items-center gap-2.5 border-b border-slate-800 py-2.5 text-left last:border-b-0 active:bg-slate-900"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-800 text-base" aria-hidden>
        {grupo.icone}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold text-slate-50">{grupo.produto_nome}</span>
        {/* Cada variação numa pílula, colorida pela régua da coluna Status do
            computador. É a única cor da linha: a única coisa que pede ação. */}
        <span className="mt-1 flex flex-wrap gap-1">
          {grupo.variacoes.map((v) => (
            <span
              key={v.variacao_id ?? 'unica'}
              className={cn(
                'rounded-full px-1.5 py-px text-[10.5px] font-bold tabular-nums',
                CLASSE_NIVEL[nivelDaVariacao(v)],
              )}
            >
              {rotuloPilula(v)}
            </span>
          ))}
        </span>
      </span>
      <span className="shrink-0 text-slate-600" aria-hidden>›</span>
    </button>
  );
}

/**
 * As colunas que saíram da linha: mínimo, status por extenso e última
 * movimentação. Uma linha por variação, na ordem da tabela do computador.
 */
function FichaEstoque({ grupo }: { grupo: GrupoEstoque }) {
  return (
    <div className="flex flex-col">
      {grupo.variacoes.map((v) => {
        const nivel = nivelDaVariacao(v);
        return (
          <div
            key={v.variacao_id ?? 'unica'}
            className="flex items-center gap-3 border-b border-slate-800 py-2.5 last:border-b-0"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-semibold text-slate-50">
                {v.variacao_nome || 'Sem variação'}
              </span>
              <span className="block text-[11px] text-slate-400">
                Mínimo {v.minimo} · última mov. {formatarDataMov(v.ultima_mov)}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-grotesk text-lg font-bold tabular-nums text-slate-50">{v.quantidade}</span>
              <span className={cn('rounded-full px-1.5 py-px text-[10px] font-bold', CLASSE_NIVEL[nivel])}>
                {ROTULO_NIVEL[nivel]}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

const CLASSE_TIPO: Record<string, string> = {
  Entrada: 'bg-emerald-500/15 text-emerald-400',
  Venda: 'bg-rose-500/15 text-rose-400',
  Estorno: 'bg-amber-500/15 text-amber-400',
  Ajuste: 'bg-slate-700 text-slate-300',
};

/** As seis colunas do computador — data, produto, tipo, qtd, saldo, por — numa linha de duas alturas. */
function ListaMovimentacoes({ movimentacoes }: { movimentacoes: LojaMovimentacaoEstoque[] }) {
  if (movimentacoes.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">Nenhuma movimentação registrada.</p>;
  }
  return (
    <div className="flex flex-col">
      {movimentacoes.map((m) => {
        const tipo = rotuloTipoMovimentacao(m.tipo);
        const quem = m.colaboradores?.apelido || m.colaboradores?.nome || '—';
        return (
          <div key={m.id} className="flex items-center gap-3 border-b border-slate-800 py-2.5 last:border-b-0">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-semibold text-slate-50">
                {m.loja_produtos?.nome || '—'}
                {m.loja_variacoes?.nome && <span className="font-normal text-slate-400"> ({m.loja_variacoes.nome})</span>}
              </span>
              <span className="block truncate text-[11px] text-slate-400">
                <span className={cn('mr-1.5 rounded-full px-1.5 py-px text-[10px] font-bold', CLASSE_TIPO[tipo])}>
                  {tipo}
                </span>
                {formatarDataMov(m.created_at)} · {quem}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span
                className={cn(
                  'block font-mono text-[13px] font-bold tabular-nums',
                  m.quantidade > 0 ? 'text-emerald-400' : 'text-rose-400',
                )}
              >
                {m.quantidade > 0 ? '+' : ''}
                {m.quantidade}
              </span>
              <span className="block text-[10.5px] tabular-nums text-slate-500">saldo {m.saldo_apos}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default EstoqueMobile;
