import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  atualizarEvento,
  excluirEvento,
  EVENTO_STATUS_LABEL,
  type EventoComResumo,
  type EventoStatus,
} from '@/hooks/useEventos';

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
  const [salvando, setSalvando] = useState(false);

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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar evento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-titulo">Título</Label>
            <Input
              id="edit-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-data">Primeiro dia</Label>
              <Input
                id="edit-data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-data-fim">Último dia (opcional)</Label>
              <Input
                id="edit-data-fim"
                type="date"
                min={data || undefined}
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
              />
              <p className="text-[11.5px] text-slate-500">
                Preencha só quando o recital ocupa mais de uma data. O dia de cada bloco se
                escolhe na Grade.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-horario">Abertura da casa</Label>
              <Input
                id="edit-horario"
                type="time"
                value={horario}
                onChange={(e) => setHorario(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-local">Local</Label>
              <Input
                id="edit-local"
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                placeholder="Ex.: Teatro da unidade"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-duracao">Duração padrão</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  id="edit-duracao"
                  type="number"
                  min={1}
                  value={duracaoMin}
                  onChange={(e) => setDuracaoMin(e.target.value)}
                />
                <span className="text-[11.5px] text-slate-500">min</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-intervalo">Intervalo entre blocos</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  id="edit-intervalo"
                  type="number"
                  min={0}
                  value={intervaloMin}
                  onChange={(e) => setIntervaloMin(e.target.value)}
                />
                <span className="text-[11.5px] text-slate-500">min</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as EventoStatus)}>
                <SelectTrigger id="edit-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(EVENTO_STATUS_LABEL) as EventoStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{EVENTO_STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-obs">Observações</Label>
            <Input
              id="edit-obs"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Bilheteria, ensaio geral, o que a equipe precisa saber…"
            />
          </div>

          <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
            <p className="text-[12px] font-medium text-rose-200">
              Excluir o evento apaga blocos, grade e confirmações junto.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Input
                value={confirmacaoExcluir}
                onChange={(e) => setConfirmacaoExcluir(e.target.value)}
                placeholder={`Digite "${evento?.titulo ?? ''}" para confirmar`}
                className="h-8 flex-1 text-[12.5px]"
              />
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
                disabled={!podeExcluir || salvando}
                onClick={excluir}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Excluir
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
