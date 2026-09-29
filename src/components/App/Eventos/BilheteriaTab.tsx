import { useState } from 'react';
import {
  Ticket,
  LayoutDashboard,
  ReceiptText,
  Settings2,
  HandCoins,
  Landmark,
  AlertTriangle,
  Armchair,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

import { PageTabs, type PageTab } from '@/components/ui/page-tabs';
import { KPICard } from '@/components/ui/KPICard';
import { KPIGrid } from '@/components/ui/KPIGrid';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useBilheteria,
  type EventoComResumo,
} from '@/hooks/useEventos';
import { BilheteriaVendas } from './BilheteriaVendas';
import { BilheteriaConfig } from './BilheteriaConfig';

type SubAba = 'painel' | 'vendas' | 'config';

const SUB_ABAS: PageTab<SubAba>[] = [
  { id: 'painel', label: 'Painel', shortLabel: 'Painel', icon: LayoutDashboard },
  { id: 'vendas', label: 'Vendas', shortLabel: 'Vendas', icon: ReceiptText },
  { id: 'config', label: 'Configuração', shortLabel: 'Config', icon: Settings2 },
];

export const moeda = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function BilheteriaTab({ evento }: { evento: EventoComResumo }) {
  const [subAba, setSubAba] = useState<SubAba>('painel');
  const dados = useBilheteria(evento.id);

  if (dados.loading && dados.vendas.length === 0) {
    return <p className="p-8 text-center text-sm text-slate-400">Carregando bilheteria…</p>;
  }
  if (dados.erro) {
    return (
      <p className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-[13px] text-rose-200">
        Não foi possível carregar a bilheteria: {dados.erro}
      </p>
    );
  }

  const vendidos =
    dados.vendas
      .filter((v) => v.status === 'pago' || v.status === 'pendente')
      .reduce((s, v) => s + v.quantidade, 0);
  const faturado = dados.vendas
    .filter((v) => v.status === 'pago')
    .reduce((s, v) => s + Number(v.valor_final), 0);
  const aReceber = dados.vendas
    .filter((v) => v.status === 'pendente')
    .reduce((s, v) => s + Number(v.valor_final), 0);
  const divergentes = dados.vendas.filter((v) => v.conciliacao_status === 'divergente').length;
  const aConciliar = dados.vendas.filter(
    (v) => v.status === 'pago' && v.conciliacao_status === 'pendente',
  ).length;

  return (
    <div className="space-y-4">
      <PageTabs tabs={SUB_ABAS} activeTab={subAba} onTabChange={setSubAba} />

      {subAba === 'painel' && (
        <div className="space-y-4">
          <KPIGrid columns={4} gap="sm">
            <KPICard
              title="Cortesias distribuídas"
              icon={Ticket}
              value={dados.cortesiasUsadas}
              variant="violet"
              subvalue={
                dados.config?.cortesias_por_aluno != null
                  ? `cota de ${dados.config.cortesias_por_aluno} por aluno`
                  : 'sem cota configurada'
              }
            />
            <KPICard title="Ingressos vendidos" icon={Armchair} value={vendidos} variant="cyan" />
            <KPICard
              title="Faturado (pago)"
              icon={HandCoins}
              value={faturado}
              format="currency"
              variant="emerald"
            />
            <KPICard
              title="A receber (pendente)"
              icon={Landmark}
              value={aReceber}
              format="currency"
              variant={aReceber > 0 ? 'amber' : 'default'}
            />
          </KPIGrid>

          {divergentes > 0 && (
            <p className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-[13px] text-rose-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {divergentes} venda(s) divergente(s) na conciliação — verificar com o financeiro.
            </p>
          )}
          {aConciliar > 0 && divergentes === 0 && (
            <p className="rounded-xl border border-slate-700 bg-slate-800/40 p-3 text-[12.5px] text-slate-400">
              {aConciliar} venda(s) paga(s) aguardando a conciliação da Sol no caixa do Super Folha.
            </p>
          )}

          <section className="rounded-xl border border-slate-700 bg-slate-800/40">
            <header className="border-b border-slate-700/60 px-4 py-2.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Lotação por bloco
              </h3>
            </header>
            <div className="divide-y divide-slate-700/40">
              {dados.blocos.map((b) => {
                const lot = dados.lotacao.find((l) => l.bloco_id === b.id);
                const livres = lot?.livres ?? null;
                const ocupados = (lot?.cortesias ?? 0) + (lot?.vendidos_pagos ?? 0) + (lot?.pendentes ?? 0);
                const pct =
                  b.capacidade && b.capacidade > 0
                    ? Math.min(100, Math.round((ocupados / b.capacidade) * 100))
                    : null;
                const cor =
                  pct === null ? 'bg-slate-500' : pct >= 100 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500';
                return (
                  <div key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <div className="min-w-32">
                      <p className="text-[13px] font-medium text-slate-200">{b.nome}</p>
                      <p className="text-[11.5px] text-slate-500">
                        {b.data ? format(parseISO(b.data), 'dd/MM') : '—'}
                        {b.horario_inicial ? ` · ${b.horario_inicial.slice(0, 5)}` : ''}
                      </p>
                    </div>
                    <div className="flex-1">
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-700/60">
                        {pct !== null && <div className={`h-full ${cor}`} style={{ width: `${pct}%` }} />}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-[12px] text-slate-400">
                      <span>
                        {b.capacidade == null ? (
                          'sem teto'
                        ) : livres === 0 ? (
                          <Badge variant="error">lotado</Badge>
                        ) : (
                          <span className="text-slate-300">{livres} livres</span>
                        )}
                      </span>
                      <span className="text-slate-500">
                        {lot?.cortesias ?? 0} cortesias · {lot?.vendidos_pagos ?? 0} pagos
                        {(lot?.pendentes ?? 0) > 0 ? ` · ${lot?.pendentes} pend.` : ''}
                        {b.capacidade != null ? ` / ${b.capacidade}` : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
              {dados.blocos.length === 0 && (
                <p className="px-4 py-6 text-center text-[12.5px] text-slate-500">
                  Nenhum bloco cadastrado — monte a grade primeiro.
                </p>
              )}
            </div>
          </section>
        </div>
      )}

      {subAba === 'vendas' && <BilheteriaVendas evento={evento} dados={dados} />}
      {subAba === 'config' && <BilheteriaConfig evento={evento} dados={dados} />}
    </div>
  );
}

export default BilheteriaTab;
