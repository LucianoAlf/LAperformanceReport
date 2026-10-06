import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { diasDoEvento, formatarDataCurta } from '@/lib/eventos';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  salvarPrecoEvento,
  criarPacote,
  removerPacote,
  salvarCapacidadeBloco,
  salvarConfigBilheteria,
  type EventoComResumo,
} from '@/hooks/useEventos';
type Dados = ReturnType<typeof import('@/hooks/useEventos').useBilheteria>;

/** "1234,56" / "1234.56" -> numero; vazio -> null */
function parseMoeda(texto: string): number | null {
  const t = texto.trim().replace(/\./g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function BilheteriaConfig({ evento, dados }: { evento: EventoComResumo; dados: Dados }) {
  const { config, preco, pacotes, blocos, lotacao, recarregar } = dados;
  const multiDia = diasDoEvento(evento.data_evento, evento.data_fim).length > 1;
  const [ocupado, setOcupado] = useState(false);

  const [cota, setCota] = useState(config?.cortesias_por_aluno?.toString() ?? '');
  const [inteira, setInteira] = useState(preco?.preco_unitario?.toString().replace('.', ',') ?? '');
  const [cobrado, setCobrado] = useState(preco?.preco_meia?.toString().replace('.', ',') ?? '');
  const [provedor, setProvedor] = useState(config?.provedor_pagamento ?? '');
  const [conta, setConta] = useState(config?.provedor_conta ?? '');
  const [capacidades, setCapacidades] = useState<Record<number, string>>(() =>
    Object.fromEntries(blocos.map((b) => [b.id, b.capacidade?.toString() ?? ''])),
  );
  const [pacoteQtd, setPacoteQtd] = useState('');
  const [pacotePct, setPacotePct] = useState('');

  const rodar = async (acao: () => Promise<{ error: unknown }>, okMsg: string) => {
    setOcupado(true);
    const { error } = await acao();
    setOcupado(false);
    if (error) {
      toast.error((error as { message?: string }).message ?? 'Não foi possível salvar.');
      return;
    }
    toast.success(okMsg);
    await recarregar();
  };

  return (
    // grid-cols-1 explícito + min-w-0: sem colunas definidas o grid crescia até caber a linha
    // de bloco mais larga e empurrava a página inteira para o lado no celular.
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* preco + cota */}
      <section className="min-w-0 space-y-3 rounded-xl border border-slate-700 bg-slate-800/40 p-4">
        <h3 className="text-[12px] sm:text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Preço e cortesias
        </h3>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cfg-inteira">Preço inteira (referência)</Label>
            <Input
              id="cfg-inteira"
              inputMode="decimal"
              value={inteira}
              onChange={(e) => setInteira(e.target.value)}
              placeholder="100,00"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="cfg-cobrado">Preço cobrado</Label>
            <Input
              id="cfg-cobrado"
              inputMode="decimal"
              value={cobrado}
              onChange={(e) => setCobrado(e.target.value)}
              placeholder="50,00"
              className="mt-1"
            />
          </div>
        </div>
        <p className="text-[12px] sm:text-[11.5px] text-slate-500">
          Todos pagam o <strong className="text-slate-300">preço cobrado</strong>. A inteira fica
          como referência no papel/relatório. Mudanças de preço ficam no audit log.
        </p>

        <div>
          <Label htmlFor="cfg-cota">Cortesias por aluno</Label>
          <Input
            id="cfg-cota"
            type="number"
            min={0}
            value={cota}
            onChange={(e) => setCota(e.target.value)}
            placeholder="2"
            className="mt-1 w-32"
          />
          <p className="mt-1 text-[12px] sm:text-[11.5px] text-slate-500">
            Vazio = sem cota. Acima dela, o restante é ingresso vendido.
          </p>
        </div>

        <Button
          size="sm"
          disabled={ocupado}
          onClick={() => {
            const pInteira = parseMoeda(inteira);
            if (pInteira == null) {
              toast.error('Informe o preço inteira (referência).');
              return;
            }
            const pCobrado = parseMoeda(cobrado);
            const cotaN = cota.trim() === '' ? null : Math.max(0, Math.floor(Number(cota)));
            rodar(async () => {
              const r1 = await salvarPrecoEvento(evento.id, pInteira, pCobrado);
              if (r1.error) return { error: r1.error };
              return salvarConfigBilheteria(evento.id, { cortesias_por_aluno: cotaN });
            }, 'Preço e cota salvos.');
          }}
        >
          Salvar preço e cota
        </Button>
      </section>

      {/* capacidade por bloco */}
      <section className="min-w-0 space-y-3 rounded-xl border border-slate-700 bg-slate-800/40 p-4">
        <h3 className="text-[12px] sm:text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Capacidade por bloco
        </h3>
        <div className="space-y-2">
          {blocos.map((b) => {
            const lot = lotacao.find((l) => l.bloco_id === b.id);
            const ocupados =
              (lot?.cortesias ?? 0) + (lot?.vendidos_pagos ?? 0) + (lot?.pendentes ?? 0);
            const novaCap = capacidades[b.id]?.trim();
            const encolhendo = novaCap !== '' && Number(novaCap) < ocupados;
            return (
              <div key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-slate-700/40 pb-2 last:border-0 sm:flex-nowrap sm:border-0 sm:pb-0">
                <span className="w-full text-[13px] text-slate-300 sm:w-28 sm:truncate">
                  {b.nome}
                  {/* Evento de 2+ dias: dois "Bloco 3" (um por data) só se distinguem pelo dia. */}
                  {multiDia && <span className="text-slate-500"> · {formatarDataCurta(b.data ?? evento.data_evento)}</span>}
                </span>
                <Input
                  type="number"
                  min={1}
                  value={capacidades[b.id] ?? ''}
                  onChange={(e) =>
                    setCapacidades((c) => ({ ...c, [b.id]: e.target.value }))
                  }
                  placeholder="sem teto"
                  className="h-11 w-28 text-[16px] sm:h-8 sm:text-sm"
                  aria-label={`Capacidade do bloco ${b.nome}`}
                />
                <span className="text-[12px] sm:text-[11.5px] text-slate-500">{ocupados} ocupados</span>
                {encolhendo && (
                  <span className="text-[12px] sm:text-[11.5px] text-amber-300">
                    abaixo do já vendido — o bloco fica lotado
                  </span>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto h-11 sm:h-8"
                  disabled={ocupado}
                  onClick={() =>
                    rodar(
                      () =>
                        salvarCapacidadeBloco(
                          b.id,
                          capacidades[b.id]?.trim() === '' ? null : Number(capacidades[b.id]),
                        ),
                      `Capacidade de ${b.nome} salva.`,
                    )
                  }
                >
                  Salvar
                </Button>
              </div>
            );
          })}
          {blocos.length === 0 && (
            <p className="text-[12.5px] text-slate-500">Nenhum bloco cadastrado na grade ainda.</p>
          )}
        </div>
      </section>

      {/* pacotes */}
      <section className="min-w-0 space-y-3 rounded-xl border border-slate-700 bg-slate-800/40 p-4">
        <h3 className="text-[12px] sm:text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Pacotes de desconto
        </h3>
        <div className="space-y-1.5">
          {pacotes.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2 rounded-lg border border-slate-700/60 px-3 py-1.5 text-[13px]"
            >
              <span className="text-slate-200">
                {p.quantidade_minima}+ ingressos → {Number(p.desconto_pct)}% off
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-11 w-11 px-2 text-rose-400 hover:text-rose-300 sm:h-7 sm:w-auto"
                disabled={ocupado}
                onClick={() => rodar(() => removerPacote(p.id), 'Pacote removido.')}
                aria-label={`Remover pacote de ${p.quantidade_minima} ingressos`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {pacotes.length === 0 && (
            <p className="text-[12.5px] text-slate-500">Nenhum pacote — aplica o melhor sozinho quando a quantidade atingir.</p>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="cfg-pacote-qtd">A partir de</Label>
            <Input
              id="cfg-pacote-qtd"
              type="number"
              min={2}
              value={pacoteQtd}
              onChange={(e) => setPacoteQtd(e.target.value)}
              placeholder="4"
              className="mt-1 w-24"
            />
          </div>
          <div>
            <Label htmlFor="cfg-pacote-pct">% desconto</Label>
            <Input
              id="cfg-pacote-pct"
              type="number"
              min={1}
              max={100}
              value={pacotePct}
              onChange={(e) => setPacotePct(e.target.value)}
              placeholder="10"
              className="mt-1 w-24"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-11 gap-1 sm:h-9"
            disabled={ocupado || pacoteQtd === '' || pacotePct === ''}
            onClick={() =>
              rodar(
                () => criarPacote(evento.id, Number(pacoteQtd), Number(pacotePct)),
                'Pacote criado.',
              ).then(() => {
                setPacoteQtd('');
                setPacotePct('');
              })
            }
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar
          </Button>
        </div>
      </section>

      {/* provedor — etiqueta para a Sol, sem integracao */}
      <section className="min-w-0 space-y-3 rounded-xl border border-slate-700 bg-slate-800/40 p-4">
        <h3 className="text-[12px] sm:text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Onde o dinheiro entra
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cfg-provedor">Maquininha/conta</Label>
            <Select value={provedor} onValueChange={setProvedor}>
              <SelectTrigger id="cfg-provedor" className="mt-1">
                <SelectValue placeholder="Não definido" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rede">Rede</SelectItem>
                <SelectItem value="pagbank">PagBank</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="cfg-conta">Identificação da conta</Label>
            <Input
              id="cfg-conta"
              value={conta}
              onChange={(e) => setConta(e.target.value)}
              placeholder="PV / apelido da conta"
              className="mt-1"
            />
          </div>
        </div>
        <p className="text-[12px] sm:text-[11.5px] text-slate-500">
          Só etiqueta para a Sol casar a venda com o relatório da adquirente — sem integração
          automática.
        </p>
        <Button
          size="sm"
          disabled={ocupado}
          onClick={() =>
            rodar(
              () =>
                salvarConfigBilheteria(evento.id, {
                  provedor_pagamento: provedor === '' ? null : provedor,
                  provedor_conta: conta.trim() === '' ? null : conta.trim(),
                }),
              'Provedor salvo.',
            )
          }
        >
          Salvar provedor
        </Button>
      </section>
    </div>
  );
}

export default BilheteriaConfig;
