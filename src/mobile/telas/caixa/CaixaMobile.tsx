import { useEffect, useState, type ReactNode } from 'react';
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, History, Lock, MessageSquare, Pencil, Plus, Trash2, Unlock } from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatarMoedaCaixa } from '@/lib/caixaFinanceiro';
import { destaqueDoCofre, linhaExtratoCaixa, rotuloDiaCaixa } from '@/lib/caixaMobile';
import type { CaixaCategoria as CaixaCategoriaRecord } from '@/lib/caixaCategorias';
import { FolhaMobile } from '@/mobile/FolhaMobile';
import type { CaixaMovimentacao, CaixaResumo } from '@/types/caixa';

/**
 * O Caixa no celular (LAPE-32, 06/10/2026).
 *
 * Saldo do cofre em destaque, lançamentos como extrato e as ações em folhas.
 * Lançar, editar, fechar, reabrir e a mensagem do WhatsApp são os MESMOS
 * componentes do computador, montados na `CaixaFinanceiroTab` e recebidos
 * aqui prontos.
 *
 * ⚠️ Esta tela **não busca nada e não escreve nada** — só chama o que recebe.
 */

type Folha = 'lancar' | 'fechar' | 'whatsapp' | 'historico' | 'lancamento';

interface Props {
  dataCaixa: string;
  podeVoltar: boolean;
  podeAvancar: boolean;
  onMudarDia: (delta: number) => void;
  caixaFechado: boolean;
  ehHoje: boolean;
  saldoConferido: number | null;
  resumo: CaixaResumo;
  movimentos: CaixaMovimentacao[];
  categorias: CaixaCategoriaRecord[];
  /** Edição bloqueada (salvando ou caixa fechado) — mesma regra do computador. */
  bloqueado: boolean;
  onEditarSaldoInicial?: () => void;
  /** Mensagem de status do computador; aparece também dentro da folha aberta. */
  mensagem: ReactNode;
  onAbrirFolha: () => void;
  blocos: {
    faixaFechado: ReactNode;
    editarSaldo: ReactNode;
    conferencia: ReactNode;
    whatsapp: ReactNode;
    historico: (aoEscolher: () => void) => ReactNode;
    lancar: (aoSalvar: () => void) => ReactNode;
    editar: (mov: CaixaMovimentacao, aoSalvar: () => void) => ReactNode;
  };
  /** Devolve `true` quando excluiu. */
  onExcluir: (id: string) => Promise<boolean>;
  /**
   * Carregando, ou dia sem caixa aberto: o corpo é este (o mesmo formulário de
   * abrir do computador) e a linha do dia continua em cima, para navegar.
   */
  corpoSemCaixa?: ReactNode;
}

const TITULO: Record<Folha, string> = {
  lancar: 'Nova movimentação',
  fechar: 'Fechar caixa',
  whatsapp: 'Mensagem do fechamento',
  historico: 'Histórico de caixas',
  lancamento: 'Lançamento',
};

export function CaixaMobile({
  dataCaixa,
  podeVoltar,
  podeAvancar,
  onMudarDia,
  caixaFechado,
  ehHoje,
  saldoConferido,
  resumo,
  movimentos,
  categorias,
  bloqueado,
  onEditarSaldoInicial,
  mensagem,
  onAbrirFolha,
  blocos,
  onExcluir,
  corpoSemCaixa,
}: Props) {
  const [aberta, setAberta] = useState<Folha | null>(null);
  // A folha desce animada depois de fechar: título e conteúdo ficam até ela sumir.
  const [ultima, setUltima] = useState<Folha>('lancar');
  const [selecionado, setSelecionado] = useState<CaixaMovimentacao | null>(null);
  const [editando, setEditando] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);

  const abrir = (f: Folha) => {
    onAbrirFolha();
    setUltima(f);
    setAberta(f);
  };
  const fechar = () => setAberta(null);

  // Fechou o caixa pela folha de conferência: a folha perdeu o sentido.
  useEffect(() => {
    if (caixaFechado && aberta === 'fechar') setAberta(null);
  }, [caixaFechado, aberta]);

  const abrirLancamento = (mov: CaixaMovimentacao) => {
    setSelecionado(mov);
    setEditando(false);
    setConfirmarExclusao(false);
    abrir('lancamento');
  };

  const linhas = movimentos.map((m) => ({ mov: m, linha: linhaExtratoCaixa(m, categorias) }));
  const qtdVendas = movimentos.filter((m) => m.ambiente === 'venda').length;
  const destaque = destaqueDoCofre({ fechado: caixaFechado, ehHoje, previsto: resumo.saldoFinalCalculado, conferido: saldoConferido });

  function conteudoFolha() {
    switch (ultima) {
      case 'lancar':
        return blocos.lancar(fechar);
      case 'fechar':
        return blocos.conferencia;
      case 'whatsapp':
        return blocos.whatsapp;
      case 'historico':
        return blocos.historico(fechar);
      case 'lancamento': {
        if (!selecionado) return null;
        if (editando) return blocos.editar(selecionado, fechar);
        const l = linhaExtratoCaixa(selecionado, categorias);
        return (
          <div className="space-y-3 px-1">
            <p className="text-sm text-slate-100">{l.descricao}</p>
            <p className="text-xs text-slate-400">{l.detalhe}</p>
            <p className={cn('text-2xl font-bold tabular-nums', l.entrada ? 'text-emerald-300' : 'text-rose-300')}>{l.valor}</p>
            {bloqueado ? (
              <p className="text-xs text-slate-500">
                {caixaFechado ? 'Caixa fechado: para corrigir, reabra o caixa.' : 'Aguarde a gravação terminar.'}
              </p>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditando(true)}
                  className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg border border-slate-700 text-sm font-semibold text-slate-200 active:bg-slate-800"
                >
                  <Pencil className="h-4 w-4" />
                  Editar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirmarExclusao) return setConfirmarExclusao(true);
                    if (await onExcluir(selecionado.id)) fechar();
                  }}
                  className={cn(
                    'flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg border text-sm font-semibold',
                    confirmarExclusao
                      ? 'border-rose-500 bg-rose-600 text-white'
                      : 'border-rose-500/40 text-rose-300 active:bg-rose-500/10',
                  )}
                >
                  <Trash2 className="h-4 w-4" />
                  {confirmarExclusao ? 'Confirmar exclusão' : 'Excluir'}
                </button>
              </div>
            )}
          </div>
        );
      }
    }
  }

  return (
    <div className="space-y-3">
      {/* Dia, situação e histórico numa linha. */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Dia anterior"
          disabled={!podeVoltar}
          onClick={() => onMudarDia(-1)}
          className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-slate-300 active:bg-slate-800 disabled:opacity-30"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="min-w-0 text-center text-sm font-semibold tabular-nums text-slate-100">{rotuloDiaCaixa(dataCaixa)}</span>
        <button
          type="button"
          aria-label="Próximo dia"
          disabled={!podeAvancar}
          onClick={() => onMudarDia(1)}
          className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-slate-300 active:bg-slate-800 disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
        <span
          className={cn(
            'ml-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
            caixaFechado ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
          )}
        >
          {caixaFechado ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          {caixaFechado ? 'Fechado' : 'Aberto'}
        </span>
        <button
          type="button"
          aria-label="Histórico de caixas"
          onClick={() => abrir('historico')}
          className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-slate-300 active:bg-slate-800"
        >
          <History className="h-5 w-5" />
        </button>
      </div>

      {blocos.faixaFechado}
      {aberta === null && mensagem}

      {corpoSemCaixa ?? (
        <>

      {/* O saldo do cofre é a pergunta do balcão; o resto apoia. */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <p className="text-xs font-medium text-slate-400">{destaque.rotulo}</p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-white">{formatarMoedaCaixa(destaque.valor)}</p>
        {destaque.nota && <p className="mt-1 text-xs tabular-nums text-amber-300">{destaque.nota}</p>}
        <div className="mt-2 flex items-center gap-1 text-xs tabular-nums text-slate-400">
          <span>início {formatarMoedaCaixa(resumo.saldoInicialCofre)}</span>
          {onEditarSaldoInicial && (
            <button
              type="button"
              aria-label="Corrigir saldo inicial"
              onClick={onEditarSaldoInicial}
              className="-my-3 flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 active:bg-slate-800"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="mt-1 flex gap-3 text-xs tabular-nums">
          <span className="text-emerald-300">+{formatarMoedaCaixa(resumo.entradasDinheiroCofre)}</span>
          <span className="text-rose-300">−{formatarMoedaCaixa(resumo.saidasDinheiroCofre)}</span>
          <span className="text-slate-500">em dinheiro</span>
        </div>
        <div className="mt-3 flex items-baseline justify-between border-t border-slate-800 pt-3">
          <span className="text-sm text-slate-300">Vendas do dia</span>
          <span className="text-sm font-semibold tabular-nums text-violet-300">
            {formatarMoedaCaixa(resumo.vendasTotal)}
            <span className="ml-1 font-normal text-slate-500">({qtdVendas})</span>
          </span>
        </div>
      </section>

      {blocos.editarSaldo}

      <section>
        <h2 className="mb-2 px-1 font-grotesk text-sm font-bold text-slate-50">
          Lançamentos <span className="font-normal text-slate-500">· {movimentos.length}</span>
        </h2>
        {linhas.length === 0 ? (
          <p className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-6 text-center text-sm text-slate-500">
            Nenhuma movimentação neste caixa.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
            {linhas.map(({ mov, linha }) => {
              const Seta = linha.entrada ? ArrowDownLeft : ArrowUpRight;
              return (
                <li key={linha.id} className="border-b border-slate-800 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => abrirLancamento(mov)}
                    className="flex min-h-[56px] w-full items-start gap-3 px-3 py-2.5 text-left active:bg-slate-800/60"
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full',
                        linha.entrada ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300',
                      )}
                      aria-hidden="true"
                    >
                      <Seta className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm text-slate-100">{linha.descricao}</span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">{linha.detalhe}</span>
                    </span>
                    <span
                      className={cn(
                        'flex-none pt-0.5 text-sm font-semibold tabular-nums',
                        linha.entrada ? 'text-emerald-300' : 'text-rose-300',
                      )}
                    >
                      {linha.valor}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="flex gap-2">
        {!caixaFechado && (
          <button
            type="button"
            disabled={bloqueado}
            onClick={() => abrir('lancar')}
            className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-semibold text-white active:bg-emerald-500 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Lançar
          </button>
        )}
        {!caixaFechado && (
          <button
            type="button"
            disabled={bloqueado}
            onClick={() => abrir('fechar')}
            className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-slate-700 text-sm font-semibold text-slate-100 active:bg-slate-800 disabled:opacity-50"
          >
            <Lock className="h-4 w-4" />
            Fechar caixa
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => abrir('whatsapp')}
        className="flex min-h-[48px] w-full items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-3 text-left text-sm text-slate-200 active:bg-slate-800"
      >
        <MessageSquare className="h-4 w-4 flex-none text-slate-400" />
        <span className="flex-1">Mensagem do fechamento (WhatsApp)</span>
        <ChevronRight className="h-4 w-4 flex-none text-slate-500" />
      </button>
        </>
      )}

      <FolhaMobile aberto={aberta !== null} onFechar={fechar} titulo={TITULO[ultima]}>
        <div className="space-y-3">
          {mensagem}
          {conteudoFolha()}
        </div>
      </FolhaMobile>
    </div>
  );
}

export default CaixaMobile;
