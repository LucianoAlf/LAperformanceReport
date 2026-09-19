import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { criarEvento, useUnidadesParaEvento } from '@/hooks/useEventos';

interface Props {
  aberto: boolean;
  /** null = consolidado; ai a unidade e escolhida no formulario */
  unidadeAtual: string | null;
  onFechar: () => void;
  onCriado: () => void;
}

export function ModalNovoEvento({ aberto, unidadeAtual, onFechar, onCriado }: Props) {
  const unidades = useUnidadesParaEvento();
  const [unidadeId, setUnidadeId] = useState('');
  const [titulo, setTitulo] = useState('');
  const [data, setData] = useState('');
  const [horario, setHorario] = useState('09:00');
  const [local, setLocal] = useState('');
  const [salvando, setSalvando] = useState(false);

  // O evento e SEMPRE de uma unidade. Com filtro ativo ela ja esta decidida; no
  // consolidado o usuario escolhe, porque "as tres" nao e um evento valido.
  useEffect(() => {
    if (aberto) {
      setUnidadeId(unidadeAtual ?? '');
      setTitulo('');
      setData('');
      setHorario('09:00');
      setLocal('');
    }
  }, [aberto, unidadeAtual]);

  async function salvar() {
    if (!unidadeId) {
      toast.error('Escolha a unidade do evento');
      return;
    }
    if (!titulo.trim()) {
      toast.error('Dê um título ao evento');
      return;
    }
    if (!data) {
      toast.error('Informe a data do evento');
      return;
    }

    setSalvando(true);
    const { error } = await criarEvento({
      unidade_id: unidadeId,
      titulo: titulo.trim(),
      data_evento: data,
      horario_inicio: horario,
      local: local.trim() || null,
    });
    setSalvando(false);

    if (error) {
      toast.error('Erro ao criar evento', { description: error.message });
      return;
    }
    onCriado();
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo evento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!unidadeAtual && (
            <div className="space-y-2">
              <Label>Unidade</Label>
              <Select value={unidadeId} onValueChange={setUnidadeId}>
                <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
                <SelectContent>
                  {unidades.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[12px] text-slate-500">
                Cada unidade tem o seu recital, com data própria.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="evento-titulo">Título</Label>
            <Input
              id="evento-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Recital de Fim de Ano 2026"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="evento-data">Data</Label>
              <Input
                id="evento-data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="evento-horario">Início</Label>
              <Input
                id="evento-horario"
                type="time"
                value={horario}
                onChange={(e) => setHorario(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="evento-local">Local (opcional)</Label>
            <Input
              id="evento-local"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              placeholder="Ex.: Teatro da unidade"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? 'Criando…' : 'Criar evento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
