import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import type { LojaCarteira } from '@/types/lojinha';
import { FolhaMobile } from '@/mobile/FolhaMobile';
import { formatarSaldo, nomeDaCarteira, ordenarCarteiras, VALOR_LALITA } from '@/lib/lojinhaComissoes';

/**
 * A aba Comissões da Lojinha no celular (LAPE-32).
 *
 * Uma linha por carteira: nome, unidade e saldo. Tocar abre a folha com as
 * ações — as MESMAS do computador, pelos mesmos callbacks, que abrem os
 * mesmos modais (que moram fora da bifurcação, na `TabComissoes`).
 *
 * ⚠️ Recorte declarado (ver `@/lib/lojinhaComissoes`): só o que vem do banco.
 *
 * ⚠️ Esta tela **não busca nada e não escreve nada**.
 */

interface Props {
  carregando: boolean;
  farmers: LojaCarteira[];
  professores: LojaCarteira[];
  onUsarLoja: (c: LojaCarteira) => void;
  onSaque: (c: LojaCarteira) => void;
  onHistorico: (c: LojaCarteira) => void;
  onEnviarRelatorio: (c: LojaCarteira) => void;
}

export function ComissoesMobile({
  carregando,
  farmers,
  professores,
  onUsarLoja,
  onSaque,
  onHistorico,
  onEnviarRelatorio,
}: Props) {
  const [aberta, setAberta] = useState<LojaCarteira | null>(null);

  // A ação abre um modal; a folha fecha antes, senão ficariam duas camadas.
  const agir = (fn: (c: LojaCarteira) => void) => () => {
    if (!aberta) return;
    const c = aberta;
    setAberta(null);
    fn(c);
  };

  return (
    <div className="space-y-4">
      <p className="px-1 text-[11px] text-slate-500">
        No celular: o saldo de cada carteira e as ações sobre ela.
      </p>

      <Grupo titulo="Farmers" carteiras={farmers} carregando={carregando} onAbrir={setAberta} />
      <Grupo titulo="Professores" carteiras={professores} carregando={carregando} onAbrir={setAberta} />

      <FolhaMobile
        aberto={aberta !== null}
        onFechar={() => setAberta(null)}
        titulo={aberta ? nomeDaCarteira(aberta) : ''}
        subtitulo={aberta ? `${aberta.unidades?.nome ?? 'Sem unidade'} · saldo ${formatarSaldo(aberta.saldo)}` : undefined}
      >
        {aberta && (
          <div className="space-y-2 pb-3">
            {aberta.moedas_la > 0 && (
              <p className="flex items-center gap-2 px-1 text-[12px] text-slate-300">
                <img src="/lalita.svg" alt="" className="h-4 w-4" />
                {aberta.moedas_la} {aberta.moedas_la === 1 ? 'Lalita' : 'Lalitas'} ({formatarSaldo(aberta.moedas_la * VALOR_LALITA)})
              </p>
            )}
            <Acao onClick={agir(onUsarLoja)} destaque>💳 Usar na Loja</Acao>
            <Acao onClick={agir(onSaque)}>💸 Registrar Saque</Acao>
            {/* Mesmas ações de cada cartão do computador: farmer tem Histórico,
                professor tem Enviar Relatório. */}
            {aberta.tipo_titular === 'farmer' ? (
              <Acao onClick={agir(onHistorico)}>📋 Histórico</Acao>
            ) : (
              <Acao onClick={agir(onEnviarRelatorio)}>📱 Enviar Relatório</Acao>
            )}
          </div>
        )}
      </FolhaMobile>
    </div>
  );
}

function Grupo({
  titulo,
  carteiras,
  carregando,
  onAbrir,
}: {
  titulo: string;
  carteiras: LojaCarteira[];
  carregando: boolean;
  onAbrir: (c: LojaCarteira) => void;
}) {
  const lista = ordenarCarteiras(carteiras);
  return (
    <section>
      <h3 className="mb-2 px-1 text-[12px] font-bold uppercase tracking-wide text-slate-400">
        {titulo} <span className="font-medium text-slate-500">· {lista.length}</span>
      </h3>
      {lista.length === 0 ? (
        <p className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-4 text-center text-sm text-slate-400">
          {carregando ? 'Carregando…' : 'Nenhuma carteira nesta unidade.'}
        </p>
      ) : (
        <ul className="divide-y divide-slate-800 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
          {lista.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onAbrir(c)}
                className="flex min-h-[56px] w-full items-center gap-3 px-3 py-2.5 text-left active:bg-slate-800/60"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-800 text-sm font-bold text-slate-200">
                  {nomeDaCarteira(c).charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-white">{nomeDaCarteira(c)}</span>
                  <span className="block text-[11px] text-slate-500">
                    {c.unidades?.nome ?? 'Sem unidade'}
                    {c.moedas_la > 0 && ` · ${c.moedas_la} ${c.moedas_la === 1 ? 'Lalita' : 'Lalitas'}`}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[13px] font-bold tabular-nums text-emerald-400">
                  {formatarSaldo(c.saldo)}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Acao({ children, onClick, destaque }: { children: ReactNode; onClick: () => void; destaque?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        destaque
          ? 'flex min-h-[48px] w-full items-center justify-center rounded-xl bg-sky-500 text-sm font-semibold text-slate-950 active:bg-sky-400'
          : 'flex min-h-[48px] w-full items-center justify-center rounded-xl border border-slate-700 bg-slate-800/60 text-sm font-semibold text-slate-100 active:bg-slate-800'
      }
    >
      {children}
    </button>
  );
}
