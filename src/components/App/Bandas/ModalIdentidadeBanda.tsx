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
import { ImageCropUpload } from '@/components/ui/ImageCropUpload';
import { atualizarIdentidadeBanda, type BandaResumo } from '@/hooks/useBandas';

interface ModalIdentidadeBandaProps {
  banda: BandaResumo | null;
  /** Quando aberto a partir do detalhe, traz gênero/descrição/logo já gravados */
  inicial?: { genero: string | null; descricao: string | null; logo_url: string | null } | null;
  onClose: () => void;
  onSalvo: () => void;
}

/**
 * Edita a identidade da banda (nome, gênero, descrição, logo).
 * Ao salvar um nome, o backend zera `precisa_revisar_nome` (origem vira 'manual').
 * O logo usa o ImageCropUpload padrão: a imagem recortada (200x200) é salva
 * como data URL direto em `logo_url` — não há bucket de storage para bandas.
 */
export function ModalIdentidadeBanda({ banda, inicial, onClose, onSalvo }: ModalIdentidadeBandaProps) {
  const [nome, setNome] = useState('');
  const [genero, setGenero] = useState('');
  const [descricao, setDescricao] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (banda) {
      setNome(banda.nome);
      setGenero(inicial?.genero || '');
      setDescricao(inicial?.descricao || '');
      setLogoUrl(inicial?.logo_url || null);
    }
  }, [banda, inicial]);

  if (!banda) return null;

  async function handleSalvar() {
    if (!nome.trim()) {
      toast.error('Informe o nome da banda.');
      return;
    }
    if (!banda) return;
    setSalvando(true);
    const { error } = await atualizarIdentidadeBanda({
      bandaId: banda.banda_id,
      nome: nome.trim(),
      genero: genero.trim() || null,
      descricao: descricao.trim() || null,
      logoUrl,
    });
    setSalvando(false);
    if (error) {
      toast.error('Erro ao salvar identidade', { description: error.message });
      return;
    }
    toast.success('Identidade atualizada', { description: nome.trim() });
    onSalvo();
  }

  return (
    <Dialog open={!!banda} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Identidade da banda</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <ImageCropUpload
              currentImage={logoUrl || undefined}
              onImageChange={(dataUrl) => setLogoUrl(dataUrl)}
            />
            <p className="text-xs text-slate-400">
              Logo da banda (opcional). A imagem é recortada em formato quadrado.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="banda-nome">Nome</Label>
            <Input
              id="banda-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome da banda"
            />
            {banda.precisa_revisar_nome && (
              <p className="text-xs text-amber-400">
                Este nome foi gerado automaticamente a partir da turma. Salvar marca como revisado.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="banda-genero">Gênero musical</Label>
            <Input
              id="banda-genero"
              value={genero}
              onChange={(e) => setGenero(e.target.value)}
              placeholder="Ex.: Rock, Pop, MPB..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="banda-descricao">Descrição</Label>
            <Textarea
              id="banda-descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Uma frase sobre a banda (opcional)"
              rows={3}
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
