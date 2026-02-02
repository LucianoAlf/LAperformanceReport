import React, { useState } from 'react';
import { RotateCcw, AlertTriangle, CheckCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useOcorrenciasComLog, Ocorrencia360Completa, Criterio360 } from '@/hooks/useProfessor360';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ModalReverterOcorrenciaProps {
  isOpen: boolean;
  onClose: () => void;
  ocorrencia: Ocorrencia360Completa | null;
  criterios: Criterio360[];
  modo: 'reverter' | 'restaurar';
  onSuccess?: () => void;
}

export default function ModalReverterOcorrencia({
  isOpen,
  onClose,
  ocorrencia,
  criterios,
  modo,
  onSuccess,
}: ModalReverterOcorrenciaProps) {
  const { user, profile } = useAuth();
  const { reverterOcorrencia, restaurarOcorrencia, loading } = useOcorrenciasComLog();
  
  const [justificativa, setJustificativa] = useState('');

  // Reset ao abrir
  React.useEffect(() => {
    if (isOpen) {
      setJustificativa('');
    }
  }, [isOpen]);

  // Obter nome do critério
  const getNomeCriterio = () => {
    if (ocorrencia?.criterio) {
      return ocorrencia.criterio.nome;
    }
    const criterio = criterios.find(c => c.id === ocorrencia?.criterio_id);
    return criterio?.nome || 'Critério desconhecido';
  };

  // Formatar data
  const formatarData = (data: string) => {
    try {
      return format(parseISO(data), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    } catch {
      return data;
    }
  };

  // Validar formulário
  const isValid = justificativa.trim().length >= 10;

  // Executar ação
  const handleConfirmar = async () => {
    if (!ocorrencia || !isValid) return;

    try {
      const usuarioNome = profile?.nome || user?.email || 'Usuário';

      if (modo === 'reverter') {
        await reverterOcorrencia(
          ocorrencia.id,
          user?.id || null,
          usuarioNome,
          justificativa
        );
        toast.success('Ocorrência revertida com sucesso!');
      } else {
        await restaurarOcorrencia(
          ocorrencia.id,
          user?.id || null,
          usuarioNome,
          justificativa
        );
        toast.success('Ocorrência restaurada com sucesso!');
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      console.error(`Erro ao ${modo} ocorrência:`, err);
      toast.error(`Erro ao ${modo} ocorrência`);
    }
  };

  if (!ocorrencia) return null;

  const isReverter = modo === 'reverter';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            {isReverter ? (
              <>
                <RotateCcw className="w-5 h-5 text-rose-400" />
                Reverter Ocorrência
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5 text-cyan-400" />
                Restaurar Ocorrência
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Info da ocorrência */}
          <div className={`p-4 rounded-lg border ${isReverter ? 'bg-rose-500/10 border-rose-500/30' : 'bg-cyan-500/10 border-cyan-500/30'}`}>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-slate-400">Critério</p>
                <p className="font-medium text-white">{getNomeCriterio()}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Data</p>
                <p className="text-sm text-slate-300">{formatarData(ocorrencia.data_ocorrencia)}</p>
              </div>
              {ocorrencia.descricao && (
                <div>
                  <p className="text-xs text-slate-400">Descrição</p>
                  <p className="text-sm text-slate-300">{ocorrencia.descricao}</p>
                </div>
              )}
            </div>
          </div>

          {/* Explicação */}
          <div className={`p-3 rounded-lg ${isReverter ? 'bg-rose-500/10 border border-rose-500/30' : 'bg-cyan-500/10 border border-cyan-500/30'}`}>
            <div className="flex items-start gap-2">
              <AlertTriangle className={`w-4 h-4 mt-0.5 ${isReverter ? 'text-rose-400' : 'text-cyan-400'}`} />
              <div className={`text-sm ${isReverter ? 'text-rose-300' : 'text-cyan-300'}`}>
                {isReverter ? (
                  <>
                    <p className="font-medium">O que acontece ao reverter?</p>
                    <ul className="text-xs mt-1 space-y-1 opacity-80">
                      <li>• A ocorrência será marcada como "revertida"</li>
                      <li>• Não será mais contabilizada na pontuação</li>
                      <li>• O registro permanece no histórico</li>
                      <li>• Pode ser restaurada posteriormente</li>
                    </ul>
                  </>
                ) : (
                  <>
                    <p className="font-medium">O que acontece ao restaurar?</p>
                    <ul className="text-xs mt-1 space-y-1 opacity-80">
                      <li>• A ocorrência voltará a ser "ativa"</li>
                      <li>• Será contabilizada novamente na pontuação</li>
                      <li>• A ação será registrada no histórico</li>
                    </ul>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Justificativa (obrigatória) */}
          <div className="space-y-2">
            <Label className="text-slate-300">
              Justificativa <span className="text-rose-400">*</span>
            </Label>
            <Textarea
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder={`Explique o motivo ${isReverter ? 'da reversão' : 'da restauração'} (mínimo 10 caracteres)...`}
              className="bg-slate-800 border-slate-700 min-h-[100px]"
            />
            {justificativa.length > 0 && justificativa.length < 10 && (
              <p className="text-xs text-rose-400">
                Mínimo de 10 caracteres ({justificativa.length}/10)
              </p>
            )}
          </div>

          {/* Aviso de registro */}
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5" />
              <p className="text-xs text-amber-300">
                Esta ação será registrada no histórico com sua identificação ({profile?.nome || user?.email}) e justificativa.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmar}
            disabled={!isValid || loading}
            className={isReverter ? 'bg-rose-600 hover:bg-rose-700' : 'bg-cyan-600 hover:bg-cyan-700'}
          >
            {loading ? 'Processando...' : isReverter ? 'Reverter Ocorrência' : 'Restaurar Ocorrência'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
