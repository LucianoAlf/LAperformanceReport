import React, { useState, useEffect } from 'react';
import { Edit3, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOcorrenciasComLog, Ocorrencia360Completa, Criterio360 } from '@/hooks/useProfessor360';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';

interface ModalEditarOcorrenciaProps {
  isOpen: boolean;
  onClose: () => void;
  ocorrencia: Ocorrencia360Completa | null;
  criterios: Criterio360[];
  onSuccess?: () => void;
}

export default function ModalEditarOcorrencia({
  isOpen,
  onClose,
  ocorrencia,
  criterios,
  onSuccess,
}: ModalEditarOcorrenciaProps) {
  const { user, profile } = useAuth();
  const { editarOcorrencia, loading } = useOcorrenciasComLog();
  
  const [dataOcorrencia, setDataOcorrencia] = useState<Date | undefined>();
  const [descricao, setDescricao] = useState('');
  const [minutosAtraso, setMinutosAtraso] = useState<string>('');
  const [justificativa, setJustificativa] = useState('');

  // Carregar dados da ocorrência quando abrir
  useEffect(() => {
    if (isOpen && ocorrencia) {
      setDataOcorrencia(ocorrencia.data_ocorrencia ? parseISO(ocorrencia.data_ocorrencia) : undefined);
      setDescricao(ocorrencia.descricao || '');
      setMinutosAtraso(ocorrencia.minutos_atraso?.toString() || '');
      setJustificativa('');
    }
  }, [isOpen, ocorrencia]);

  // Verificar se é critério de pontualidade
  const isPontualidade = ocorrencia?.criterio?.codigo === 'atrasos';

  // Obter nome do critério
  const getNomeCriterio = () => {
    if (ocorrencia?.criterio) {
      return ocorrencia.criterio.nome;
    }
    const criterio = criterios.find(c => c.id === ocorrencia?.criterio_id);
    return criterio?.nome || 'Critério desconhecido';
  };

  // Validar formulário
  const isValid = justificativa.trim().length >= 10;

  // Salvar alterações
  const handleSalvar = async () => {
    if (!ocorrencia || !isValid) return;

    try {
      await editarOcorrencia(
        ocorrencia.id,
        user?.id || null,
        profile?.nome || user?.email || 'Usuário',
        justificativa,
        {
          data_ocorrencia: dataOcorrencia ? format(dataOcorrencia, 'yyyy-MM-dd') : undefined,
          descricao: descricao || undefined,
          minutos_atraso: minutosAtraso ? parseInt(minutosAtraso) : undefined,
        }
      );

      toast.success('Ocorrência editada com sucesso!');
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Erro ao editar ocorrência:', err);
      toast.error('Erro ao editar ocorrência');
    }
  };

  if (!ocorrencia) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Edit3 className="w-5 h-5 text-amber-400" />
            Editar Ocorrência
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Info da ocorrência */}
          <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
            <p className="text-sm text-slate-400">Critério</p>
            <p className="font-medium text-white">{getNomeCriterio()}</p>
          </div>

          {/* Data da Ocorrência */}
          <div className="space-y-2">
            <Label className="text-slate-300">Data da Ocorrência</Label>
            <DatePicker
              date={dataOcorrencia}
              onDateChange={setDataOcorrencia}
            />
          </div>

          {/* Minutos de Atraso (apenas para Pontualidade) */}
          {isPontualidade && (
            <div className="space-y-2">
              <Label className="text-slate-300">Minutos de Atraso</Label>
              <Select value={minutosAtraso} onValueChange={setMinutosAtraso}>
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20, 25, 30, 45, 60].map(m => (
                    <SelectItem key={m} value={m.toString()}>
                      {m} {m === 1 ? 'minuto' : 'minutos'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Descrição */}
          <div className="space-y-2">
            <Label className="text-slate-300">Descrição</Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Detalhes sobre a ocorrência..."
              className="bg-slate-800 border-slate-700 min-h-[80px]"
            />
          </div>

          {/* Justificativa (obrigatória) */}
          <div className="space-y-2">
            <Label className="text-slate-300">
              Justificativa da Edição <span className="text-rose-400">*</span>
            </Label>
            <Textarea
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder="Explique o motivo da edição (mínimo 10 caracteres)..."
              className="bg-slate-800 border-slate-700 min-h-[80px]"
            />
            {justificativa.length > 0 && justificativa.length < 10 && (
              <p className="text-xs text-rose-400">
                Mínimo de 10 caracteres ({justificativa.length}/10)
              </p>
            )}
          </div>

          {/* Aviso */}
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5" />
              <div className="text-sm text-amber-300">
                <p className="font-medium">Esta ação será registrada</p>
                <p className="text-xs text-amber-400/80 mt-1">
                  Todas as alterações ficam salvas no histórico com sua identificação e justificativa.
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handleSalvar}
            disabled={!isValid || loading}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {loading ? 'Salvando...' : 'Salvar Alterações'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
