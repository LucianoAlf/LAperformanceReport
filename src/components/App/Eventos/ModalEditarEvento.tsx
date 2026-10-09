import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Mic2, Trash2 } from 'lucide-react';

import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { TimePicker24h } from '@/components/ui/time-picker-24h';
import { cn } from '@/lib/utils';
import {
  atualizarEvento,
  excluirEvento,
  EVENTO_STATUS_LABEL,
  type EventoComResumo,
  type EventoStatus,
} from '@/hooks/useEventos';
import { BotaoComMola, Segmentado } from './ControlesComMovimento';

// ISO 'YYYY-MM-DD' → Date LOCAL — `new Date(iso)` interpreta UTC e devolve o dia
// anterior no Brasil (mesma armadilha do modulo de impressao).
function isoParaDate(iso: string): Date | undefined {
  const [a, m, d] = iso.split('-').map(Number);
  return a && m && d ? new Date(a, m - 1, d) : undefined;
}

interface Props {
  aberto: boolean;
  evento: EventoComResumo | null;
  onFechar: () => void;
  /** Chamado depois de salvar — a lista/detalhe se recarrega. */
  onSalvo: () => void;
}

/**
 * Edicao do evento — o que muda DEPOIS de criado.
 *
 * Aqui mora tudo que a equipe precisa mexer sem recriar o recital: data (e o segundo dia,
 * quando o recital ocupa mais de uma — Recreio 13–15/11), local, horario de abertura,
 * duracao padrao, intervalo entre blocos, status e observacoes. A exclusao tambem e daqui:
 * evento apaga blocos, apresentacoes e participacoes em cascata, entao o botao pede o
 * titulo digitado — confirmar com um clique apaga recital inteiro por engano.
 *
 * Redesenho de 09/10/2026 (Hugo: "visivelmente horrível"): seções com título, unidade "min"
 * dentro do campo, status como segmentado com a cor de cada estado, exclusão recolhida e
 * rodapé fixo. Movimento inspirado em uiarc.dev, em `ControlesComMovimento`.
 */
export function ModalEditarEvento({ aberto, evento, onFechar, onSalvo }: Props) {
  const navigate = useNavigate();
  const [titulo, setTitulo] = useState('');
  const [data, setData] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [horario, setHorario] = useState('09:00');
  const [local, setLocal] = useState('');
  const [status, setStatus] = useState<EventoStatus>('rascunho');
  const [duracaoMin, setDuracaoMin] = useState('5');
  const [intervaloMin, setIntervaloMin] = useState('45');
  const [observacoes, setObservacoes] = useState('');
  const [confirmacaoExcluir, setConfirmacaoExcluir] = useState('');
  const [excluindoAberto, setExcluindoAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const reduzir = useReducedMotion();

  useEffect(() => {
    if (aberto && evento) {
      setTitulo(evento.titulo);
      setData(evento.data_evento);
      setDataFim(evento.data_fim ?? '');
      setHorario(evento.horario_inicio?.slice(0, 5) ?? '09:00');
      setLocal(evento.local ?? '');
      setStatus(evento.status);
      setDuracaoMin(String(Math.round(evento.duracao_padrao_segundos / 60)));
      setIntervaloMin(String(Math.round((evento.intervalo_entre_blocos_segundos ?? 2700) / 60)));
      setObservacoes(evento.observacoes ?? '');
      setConfirmacaoExcluir('');
      setExcluindoAberto(false);
    }
  }, [aberto, evento]);

  async function salvar() {
    if (!evento) return;
    if (!titulo.trim()) {
      toast.error('O evento precisa de um título');
      return;
    }
    if (!data) {
      toast.error('Informe a data do evento');
      return;
    }
    if (dataFim && dataFim < data) {
      toast.error('O último dia não pode ser antes do primeiro');
      return;
    }
    const duracao = Number(duracaoMin);
    const intervalo = Number(intervaloMin);

    setSalvando(true);
    const { error } = await atualizarEvento(evento.id, {
      titulo: titulo.trim(),
      data_evento: data,
      // Campo vazio = recital de um dia. data_fim nunca fica menor que data_evento —
      // o CHECK do banco tambem garante, mas o toast explica antes de bater la.
      data_fim: dataFim || null,
      horario_inicio: horario,
      local: local.trim() || null,
      status,
      duracao_padrao_segundos: duracao > 0 ? duracao * 60 : evento.duracao_padrao_segundos,
      intervalo_entre_blocos_segundos: intervalo >= 0 ? intervalo * 60 : evento.intervalo_entre_blocos_segundos,
      observacoes: observacoes.trim() || null,
    });
    setSalvando(false);

    if (error) {
      toast.error('Não consegui salvar o evento', { description: error.message });
      return;
    }
    toast.success('Evento atualizado');
    onSalvo();
    onFechar();
  }

  async function excluir() {
    if (!evento) return;
    setSalvando(true);
    const { error } = await excluirEvento(evento.id);
    setSalvando(false);
    if (error) {
      toast.error('Não consegui excluir o evento', { description: error.message });
      return;
    }
    toast.success(`"${evento.titulo}" excluído`);
    onFechar();
    navigate('/app/eventos');
    onSalvo();
  }

  // Excluir exige o titulo digitado — e a unica barreira entre um clique errado e a
  // grade inteira indo embora em cascata.
  const podeExcluir = confirmacaoExcluir.trim().toLowerCase() === (evento?.titulo ?? '').toLowerCase();

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent
        // Cabeçalho e rodapé fixos, só o meio rola: em tela baixa o "Salvar" nunca some.
        className="flex max-h-[calc(100dvh-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
        // No celular o foco automatico no titulo sobe o teclado e cobre metade do formulario
        // antes de a pessoa escolher o que vai editar.
        onOpenAutoFocus={(e) => {
          if (window.matchMedia('(max-width: 639px)').matches) e.preventDefault();
        }}
      >
        <DialogHeader className="space-y-0 border-b border-slate-800 px-5 pb-4 pt-5 text-left">
          <div className="flex items-center gap-3 pr-6">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white">
              <Mic2 className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-[16px] text-white">Editar evento</DialogTitle>
              <DialogDescription className="text-[12.5px]">
                {evento?.unidade_nome ? `${evento.unidade_nome} · ` : ''}o que muda aqui vale para
                blocos, horários e documentos.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {/* ── evento ── */}
          <Secao titulo="Evento">
            <Campo rotulo="Título" htmlFor="edit-titulo">
              <Input id="edit-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </Campo>
            <Campo rotulo="Status">
              <Segmentado<EventoStatus>
                rotulo="Status"
                ocultarRotulo
                opcoes={(Object.keys(EVENTO_STATUS_LABEL) as EventoStatus[]).map((s) => ({
                  valor: s,
                  rotulo: EVENTO_STATUS_LABEL[s],
                  marcador: <span className={cn('h-1.5 w-1.5 rounded-full', COR_DO_STATUS[s])} />,
                }))}
                valor={status}
                onMudar={setStatus}
              />
            </Campo>
          </Secao>

          {/* ── quando e onde ── */}
          <Secao
            titulo="Quando e onde"
            ajuda="Último dia só quando o recital ocupa mais de uma data — o dia de cada bloco se escolhe em Blocos."
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo rotulo="Primeiro dia">
                <DatePicker
                  date={isoParaDate(data)}
                  onDateChange={(d) => setData(d ? format(d, 'yyyy-MM-dd') : '')}
                  placeholder="Primeiro dia"
                />
              </Campo>
              <Campo rotulo="Último dia" opcional>
                <DatePicker
                  date={isoParaDate(dataFim)}
                  onDateChange={(d) => setDataFim(d ? format(d, 'yyyy-MM-dd') : '')}
                  minDate={isoParaDate(data)}
                  placeholder="Um dia só"
                />
              </Campo>
              <Campo rotulo="Abertura da casa">
                <TimePicker24h value={horario} onChange={setHorario} />
              </Campo>
              <Campo rotulo="Local" htmlFor="edit-local">
                <Input
                  id="edit-local"
                  value={local}
                  onChange={(e) => setLocal(e.target.value)}
                  placeholder="Ex.: Teatro da unidade"
                />
              </Campo>
            </div>
          </Secao>

          {/* ── ritmo ── */}
          <Secao
            titulo="Ritmo do recital"
            ajuda="Vale para as apresentações sem tempo próprio. Mudar recalcula os horários dos blocos."
          >
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Tempo por apresentação" htmlFor="edit-duracao">
                <CampoMinutos id="edit-duracao" min={1} valor={duracaoMin} onMudar={setDuracaoMin} />
              </Campo>
              <Campo rotulo="Intervalo entre blocos" htmlFor="edit-intervalo">
                <CampoMinutos id="edit-intervalo" min={0} valor={intervaloMin} onMudar={setIntervaloMin} />
              </Campo>
            </div>
          </Secao>

          {/* ── observações ── */}
          <Secao titulo="Observações">
            <Textarea
              id="edit-obs"
              aria-label="Observações"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Bilheteria, ensaio geral, o que a equipe precisa saber…"
              rows={3}
              className="resize-none"
            />
          </Secao>

          {/* ── excluir: recolhido. Aberto o tempo todo, competia com o formulário. ── */}
          <div className="border-t border-slate-800 pt-4">
            {!excluindoAberto && (
              <button
                type="button"
                onClick={() => setExcluindoAberto(true)}
                className="flex min-h-[40px] items-center gap-1.5 rounded-lg px-1 text-[12.5px] text-slate-500 transition-colors hover:text-rose-300 sm:min-h-0 sm:py-1"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Excluir este evento…
              </button>
            )}
            <AnimatePresence initial={false}>
              {excluindoAberto && (
                <motion.div
                  key="excluir"
                  initial={reduzir ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  animate={reduzir ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
                  exit={reduzir ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 38 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-2.5 rounded-xl border border-rose-500/30 bg-rose-500/[0.06] p-3">
                    <p className="text-[12.5px] text-rose-200">
                      Apaga blocos, apresentações e confirmações junto. Para confirmar, digite{' '}
                      <strong className="font-semibold text-rose-100">{evento?.titulo}</strong>.
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        value={confirmacaoExcluir}
                        onChange={(e) => setConfirmacaoExcluir(e.target.value)}
                        placeholder={evento?.titulo ?? ''}
                        aria-label="Título do evento para confirmar a exclusão"
                        className="h-10 flex-1 border-rose-500/30 text-[16px] sm:h-9 sm:text-[13px]"
                      />
                      <div className="flex gap-2">
                        <BotaoComMola
                          onClick={() => {
                            setExcluindoAberto(false);
                            setConfirmacaoExcluir('');
                          }}
                          desabilitado={salvando}
                          className="border border-slate-700 font-medium text-slate-300 hover:bg-slate-800"
                        >
                          Voltar
                        </BotaoComMola>
                        <BotaoComMola
                          onClick={excluir}
                          desabilitado={!podeExcluir || salvando}
                          className="bg-rose-500 text-white hover:bg-rose-400"
                        >
                          <Trash2 className="h-4 w-4" />
                          Excluir
                        </BotaoComMola>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-800 bg-slate-900/95 px-5 py-3">
          <BotaoComMola
            onClick={onFechar}
            desabilitado={salvando}
            className="border border-slate-700 font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            Cancelar
          </BotaoComMola>
          <BotaoComMola
            onClick={salvar}
            desabilitado={salvando}
            className="bg-emerald-500 text-white hover:bg-emerald-400"
          >
            {salvando ? 'Salvando…' : 'Salvar'}
          </BotaoComMola>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const COR_DO_STATUS: Record<EventoStatus, string> = {
  rascunho: 'bg-amber-400',
  publicado: 'bg-sky-400',
  realizado: 'bg-emerald-400',
  cancelado: 'bg-rose-400',
};

function Secao({ titulo, ajuda, children }: { titulo: string; ajuda?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">{titulo}</h3>
        {ajuda && <p className="mt-0.5 text-[12px] leading-snug text-slate-500">{ajuda}</p>}
      </div>
      {children}
    </section>
  );
}

function Campo({
  rotulo,
  htmlFor,
  opcional,
  children,
}: {
  rotulo: string;
  htmlFor?: string;
  opcional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="flex items-baseline gap-1.5 text-[13px] text-slate-300">
        {rotulo}
        {opcional && <span className="text-[11.5px] font-normal text-slate-500">opcional</span>}
      </Label>
      {children}
    </div>
  );
}

/** Número em minutos com a unidade DENTRO do campo — solta ao lado, desalinhava a linha. */
function CampoMinutos({
  id,
  min,
  valor,
  onMudar,
}: {
  id: string;
  min: number;
  valor: string;
  onMudar: (v: string) => void;
}) {
  return (
    <div className="relative">
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        value={valor}
        onChange={(e) => onMudar(e.target.value)}
        className="pr-12 tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-slate-500">
        min
      </span>
    </div>
  );
}
