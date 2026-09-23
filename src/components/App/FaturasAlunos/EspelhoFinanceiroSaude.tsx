import { useEffect, useState } from 'react';
import { Database, ShieldCheck, ShieldAlert, Clock3 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

// Saúde do espelho financeiro do Emusys (beta) — decisão Alf 14/09/2026:
// o ledger fica no backend (Super Folha consome); aqui só AGREGADOS de
// controle: varredura por unidade e totais do espelho por mês × natureza.

interface UnidadeResumo {
  unidade_id: string;
  unidade_nome: string;
  janela_inicio: string | null;
  janela_fim: string | null;
  ultima_varredura_completa_em: string | null;
  ultima_tentativa_em: string | null;
  dias_pendentes: number | null;
  catalogos_erro: Record<string, unknown> | null;
  ultimo_erro: string | null;
  atualizado_em: string | null;
}

interface TotalMesNatureza {
  unidade_id: string;
  mes: string;
  natureza: string;
  quantidade: number;
  valor_total: number;
}

interface EspelhoStatus {
  gerado_em: string;
  unidades: UnidadeResumo[];
  totais_por_mes_natureza: TotalMesNatureza[];
  itens_sumidos: number;
  itens_alterados: number;
}

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dataHora = (valor: string | null) =>
  valor ? new Date(valor).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

export function EspelhoFinanceiroSaude() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<EspelhoStatus | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (authLoading || !isAdmin) return;
    let vivo = true;
    supabase.rpc('get_financeiro_espelho_status').then(({ data, error }) => {
      if (!vivo) return;
      if (error) setErro(error.message);
      else setStatus(data as EspelhoStatus);
    });
    return () => { vivo = false; };
  }, [isAdmin, authLoading]);

  if (!isAdmin || authLoading) return null;

  // Saudavel ou nao carregado: uma linha de status. O painel detalhado (unidades,
  // totais por natureza) so abre sob demanda — e telemetria de backend, nao rotina.
  const unidadesSaudaveis = status?.unidades.filter((u) =>
    u.dias_pendentes === 0 && !u.ultimo_erro && !(u.catalogos_erro && Object.keys(u.catalogos_erro).length > 0),
  ).length ?? 0;
  const totalUnidades = status?.unidades.length ?? 0;
  const comProblema = status != null && unidadesSaudaveis < totalUnidades;

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 text-xs text-slate-400">
          <Database className={cn('h-4 w-4', comProblema ? 'text-amber-300' : 'text-slate-500')} />
          <span>
            Espelho Emusys:{' '}
            {erro ? (
              <span className="text-rose-300">falha ao ler status</span>
            ) : !status ? (
              <span>verificando...</span>
            ) : comProblema ? (
              <span className="font-medium text-amber-200">{unidadesSaudaveis}/{totalUnidades} unidades saudáveis</span>
            ) : (
              <span className="text-slate-300">saudável · varredura diária em dia</span>
            )}
          </span>
        </div>
        <button
          onClick={() => setAberto((v) => !v)}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
        >
          {aberto ? 'Fechar detalhes' : 'Ver detalhes'}
        </button>
      </div>

      {erro && <p className="mt-2 text-xs text-rose-300">Falha ao ler o status do espelho: {erro}</p>}

      {aberto && !erro && status && (
        <>
          <p className="mt-3 text-[11px] text-slate-500">
            Cópia dos lançamentos por unidade, revarrida todo dia (mês corrente + 2 anteriores). Alimenta o Super Folha.
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {status.unidades.map((u) => {
              const catalogoErros = u.catalogos_erro ? Object.keys(u.catalogos_erro) : [];
              const saudavel = u.dias_pendentes === 0 && !u.ultimo_erro && catalogoErros.length === 0;
              const Icon = u.dias_pendentes == null ? Clock3 : saudavel ? ShieldCheck : ShieldAlert;
              return (
                <div
                  key={u.unidade_id}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-xs',
                    u.dias_pendentes == null
                      ? 'border-slate-700 bg-slate-900/50 text-slate-400'
                      : saudavel
                        ? 'border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-100'
                        : 'border-amber-500/25 bg-amber-500/[0.06] text-amber-100',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{u.unidade_nome}</span>
                    <Icon className="h-4 w-4 shrink-0" />
                  </div>
                  <div className="mt-1.5 space-y-0.5 opacity-80">
                    <p>Janela: {u.janela_inicio ?? '—'} → {u.janela_fim ?? '—'}</p>
                    <p>Dias pendentes: <span className="tabular-nums">{u.dias_pendentes ?? '—'}</span></p>
                    <p>Última varredura completa: {dataHora(u.ultima_varredura_completa_em)}</p>
                    {catalogoErros.length > 0 && <p>Catálogo com erro na origem: {catalogoErros.join(', ')}</p>}
                    {u.ultimo_erro && <p className="truncate" title={u.ultimo_erro}>Último erro: {u.ultimo_erro}</p>}
                  </div>
                </div>
              );
            })}
            {(status.itens_sumidos > 0 || status.itens_alterados > 0) && (
              <p className="md:col-span-3 text-[11px] text-slate-500">
                Controles do espelho: {status.itens_alterados} itens alterados desde a 1ª captura
                {' · '}{status.itens_sumidos} sumiram da origem (rastro preservado, fora dos totais).
              </p>
            )}
          </div>
        </>
      )}

      {aberto && status && status.totais_por_mes_natureza.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500">
                <th className="py-1.5 pr-3 font-medium">Unidade</th>
                <th className="py-1.5 pr-3 font-medium">Mês</th>
                <th className="py-1.5 pr-3 font-medium">Natureza</th>
                <th className="py-1.5 pr-3 text-right font-medium">Qtd</th>
                <th className="py-1.5 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {status.totais_por_mes_natureza.map((t, i) => (
                <tr key={i} className="text-slate-300">
                  <td className="py-1.5 pr-3">{status.unidades.find((u) => u.unidade_id === t.unidade_id)?.unidade_nome ?? t.unidade_id}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{t.mes}</td>
                  <td className="py-1.5 pr-3">{t.natureza}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{t.quantidade}</td>
                  <td className={cn('py-1.5 text-right tabular-nums', t.valor_total < 0 ? 'text-rose-300' : 'text-emerald-300')}>
                    {moeda.format(t.valor_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
