import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
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
  adicionarRepertorio, atualizarRepertorio,
  REPERTORIO_STATUS,
  type RepertorioItem, type RepertorioStatus,
} from '@/hooks/useBandas';

const STATUS_LABEL: Record<RepertorioStatus, string> = {
  ensaiando: 'Ensaiando',
  pronta: 'Pronta',
  tocada: 'Já tocada',
};

interface ModalRepertorioBandaProps {
  bandaId: number;
  /** null = adicionar; preenchido = editar */
  musica: RepertorioItem | null;
  aberto: boolean;
  onClose: () => void;
  onSalvo: () => void;
}

export function ModalRepertorioBanda({ bandaId, musica, aberto, onClose, onSalvo }: ModalRepertorioBandaProps) {
  const [titulo, setTitulo] = useState('');
  const [artista, setArtista] = useState('');
  const [tom, setTom] = useState('');
  const [bpm, setBpm] = useState('');
  const [duracao, setDuracao] = useState('');
  const [status, setStatus] = useState<RepertorioStatus>('ensaiando');
  const [cifraclubUrl, setCifraclubUrl] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (aberto) {
      setTitulo(musica?.titulo || '');
      setArtista(musica?.artista || '');
      setTom(musica?.tom || '');
      setBpm(musica?.bpm != null ? String(musica.bpm) : '');
      setDuracao(musica?.duracao_min != null ? String(musica.duracao_min) : '');
      setStatus(musica?.status || 'ensaiando');
      setCifraclubUrl(musica?.cifraclub_url || '');
    }
  }, [aberto, musica]);

  function numeroOuNull(valor: string): number | null {
    const n = parseInt(valor, 10);
    return valor.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
  }

  async function handleSalvar() {
    if (!titulo.trim()) {
      toast.error('Informe o título da música.');
      return;
    }
    if (bpm.trim() && numeroOuNull(bpm) === null) {
      toast.error('BPM inválido', { description: 'Use um número inteiro maior que zero.' });
      return;
    }
    if (duracao.trim() && numeroOuNull(duracao) === null) {
      toast.error('Duração inválida', { description: 'Use minutos inteiros maiores que zero.' });
      return;
    }

    setSalvando(true);
    const payload = {
      titulo: titulo.trim(),
      artista: artista.trim() || null,
      tom: tom.trim() || null,
      bpm: numeroOuNull(bpm),
      status,
      cifraclubUrl: cifraclubUrl.trim() || null,
      duracaoMin: numeroOuNull(duracao),
    };
    const { error } = musica
      ? await atualizarRepertorio({ id: musica.id, ...payload })
      : await adicionarRepertorio({ bandaId, ...payload });
    setSalvando(false);

    if (error) {
      toast.error('Erro ao salvar música', { description: error.message });
      return;
    }
    toast.success(musica ? 'Música atualizada' : 'Música adicionada', { description: titulo.trim() });
    onSalvo();
  }

  return (
    <Dialog open={aberto} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md z-[120]" overlayClassName="z-[120]">
        <DialogHeader>
          <DialogTitle>{musica ? 'Editar música' : 'Adicionar música'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rep-titulo">Título</Label>
            <Input
              id="rep-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Nome da música"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rep-artista">Artista</Label>
            <Input
              id="rep-artista"
              value={artista}
              onChange={(e) => setArtista(e.target.value)}
              placeholder="Opcional"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="rep-tom">Tom</Label>
              <Input
                id="rep-tom"
                value={tom}
                onChange={(e) => setTom(e.target.value)}
                placeholder="Ex.: C, Am"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rep-bpm">BPM</Label>
              <Input
                id="rep-bpm"
                value={bpm}
                onChange={(e) => setBpm(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                placeholder="120"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rep-duracao">Duração (min)</Label>
              <Input
                id="rep-duracao"
                value={duracao}
                onChange={(e) => setDuracao(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                placeholder="4"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as RepertorioStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPERTORIO_STATUS.map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rep-cifraclub">Link do Cifra Club</Label>
            <Input
              id="rep-cifraclub"
              value={cifraclubUrl}
              onChange={(e) => setCifraclubUrl(e.target.value)}
              placeholder="https://www.cifraclub.com.br/..."
              inputMode="url"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={salvando}>
            <Save className="w-4 h-4 mr-2" />
            {salvando ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
