import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { upsertIntegranteBanda, type IntegranteBanda } from '@/hooks/useBandas';

interface ModalIntegranteBandaProps {
  bandaId: number;
  integrante: IntegranteBanda | null;
  onClose: () => void;
  onSalvo: () => void;
}

/**
 * Define instrumento/função do integrante dentro da banda.
 * O roster base vem do canônico (matrícula no curso de banda); aqui gravamos
 * só o overlay por aluno (banda_integrante_upsert).
 */
export function ModalIntegranteBanda({ bandaId, integrante, onClose, onSalvo }: ModalIntegranteBandaProps) {
  const [instrumento, setInstrumento] = useState('');
  const [funcao, setFuncao] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (integrante) {
      setInstrumento(integrante.instrumento || '');
      setFuncao(integrante.funcao || '');
      setObservacoes('');
    }
  }, [integrante]);

  if (!integrante) return null;

  async function handleSalvar() {
    if (!integrante) return;
    setSalvando(true);
    const { error } = await upsertIntegranteBanda({
      bandaId,
      alunoId: integrante.aluno_id,
      instrumento: instrumento.trim() || null,
      funcao: funcao.trim() || null,
      observacoes: observacoes.trim() || null,
    });
    setSalvando(false);
    if (error) {
      toast.error('Erro ao salvar integrante', { description: error.message });
      return;
    }
    toast.success('Integrante atualizado', { description: integrante.nome });
    onSalvo();
  }

  return (
    <Dialog open={!!integrante} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md z-[120]" overlayClassName="z-[120]">
        <DialogHeader>
          <DialogTitle>{integrante.nome}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="integrante-instrumento">Instrumento na banda</Label>
            <Input
              id="integrante-instrumento"
              value={instrumento}
              onChange={(e) => setInstrumento(e.target.value)}
              placeholder="Ex.: Guitarra, Bateria, Voz..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="integrante-funcao">Função</Label>
            <Input
              id="integrante-funcao"
              value={funcao}
              onChange={(e) => setFuncao(e.target.value)}
              placeholder="Ex.: Titular, Backing vocal..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="integrante-observacoes">Observações</Label>
            <Textarea
              id="integrante-observacoes"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Opcional"
              rows={2}
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
