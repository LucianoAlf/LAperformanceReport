import { AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ModalConfirmacaoProps {
  aberto: boolean;
  onClose: () => void;
  onConfirmar: () => void;
  titulo: string;
  mensagem: string;
  tipo?: 'info' | 'warning' | 'danger' | 'success';
  textoConfirmar?: string;
  textoCancelar?: string;
  carregando?: boolean;
}

export function ModalConfirmacao({
  aberto,
  onClose,
  onConfirmar,
  titulo,
  mensagem,
  tipo = 'warning',
  textoConfirmar = 'Confirmar',
  textoCancelar = 'Cancelar',
  carregando = false,
}: ModalConfirmacaoProps) {
  const icones = {
    info: <Info className="w-6 h-6 text-blue-400" />,
    warning: <AlertTriangle className="w-6 h-6 text-amber-400" />,
    danger: <XCircle className="w-6 h-6 text-red-400" />,
    success: <CheckCircle className="w-6 h-6 text-emerald-400" />,
  };

  const cores = {
    info: 'from-blue-500 to-blue-600',
    warning: 'from-amber-500 to-orange-500',
    danger: 'from-red-500 to-rose-600',
    success: 'from-emerald-500 to-green-600',
  };

  const coresBotao = {
    info: 'bg-blue-600 hover:bg-blue-500',
    warning: 'bg-amber-600 hover:bg-amber-500',
    danger: 'bg-red-600 hover:bg-red-500',
    success: 'bg-emerald-600 hover:bg-emerald-500',
  };

  return (
    <Dialog open={aberto} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${cores[tipo]} flex items-center justify-center`}>
              {icones[tipo]}
            </div>
            <DialogTitle className="text-lg">{titulo}</DialogTitle>
          </div>
          <DialogDescription className="text-slate-300 text-base leading-relaxed">
            {mensagem}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={carregando}
            className="flex-1"
          >
            {textoCancelar}
          </Button>
          <Button
            type="button"
            onClick={onConfirmar}
            disabled={carregando}
            className={`flex-1 ${coresBotao[tipo]}`}
          >
            {carregando ? 'Processando...' : textoConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
