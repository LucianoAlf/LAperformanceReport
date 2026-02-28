import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, CheckCircle2, XCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { WhatsAppCaixa } from '../../types';

type Estado = 'idle' | 'iniciando' | 'aguardando_scan' | 'conectado' | 'erro' | 'expirado';

interface ModalReconectarWhatsAppProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caixa: WhatsAppCaixa | null;
  onReconectado?: () => void;
}

const QR_TIMEOUT_MS = 120_000; // 2 minutos
const POLL_INTERVAL_MS = 3_000; // 3 segundos

export function ModalReconectarWhatsApp({ open, onOpenChange, caixa, onReconectado }: ModalReconectarWhatsAppProps) {
  const [estado, setEstado] = useState<Estado>('idle');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [mensagemErro, setMensagemErro] = useState<string>('');
  const [tempoRestante, setTempoRestante] = useState(0);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiraEmRef = useRef(0);

  const limparIntervals = useCallback(() => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  }, []);

  const iniciarPolling = useCallback((caixaId: number) => {
    pollingRef.current = setInterval(async () => {
      if (Date.now() > expiraEmRef.current) {
        limparIntervals();
        setEstado('expirado');
        return;
      }

      try {
        const { data } = await supabase.functions.invoke('whatsapp-connect', {
          body: { action: 'poll', caixa_id: caixaId },
        });

        if (data?.connected) {
          limparIntervals();
          setEstado('conectado');
          if (data.webhookConfigured === false) {
            toast.warning('Webhook nao configurado automaticamente. Configure manualmente na UAZAPI.');
          }
          onReconectado?.();
          setTimeout(() => onOpenChange(false), 2000);
        } else if (data?.qrcode) {
          setQrCode(data.qrcode);
        }
      } catch {
        // Silenciar erros de polling — proximo tick tenta novamente
      }
    }, POLL_INTERVAL_MS);
  }, [limparIntervals, onReconectado, onOpenChange]);

  const iniciarConexao = useCallback(async () => {
    if (!caixa) return;
    setEstado('iniciando');
    setQrCode(null);
    setMensagemErro('');
    limparIntervals();

    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-connect', {
        body: { action: 'connect', caixa_id: caixa.id },
      });

      if (error || !data?.success) {
        setEstado('erro');
        setMensagemErro(error?.message || data?.error || 'Erro ao iniciar conexao');
        return;
      }

      if (data.connected) {
        setEstado('conectado');
        if (data.webhookConfigured === false) {
          toast.warning('Webhook nao configurado automaticamente. Configure manualmente na UAZAPI.');
        }
        onReconectado?.();
        setTimeout(() => onOpenChange(false), 2000);
        return;
      }

      if (!data.qrcode) {
        setEstado('erro');
        setMensagemErro('UAZAPI nao retornou QR code. Verifique o status da instancia.');
        return;
      }

      setQrCode(data.qrcode);
      setEstado('aguardando_scan');
      expiraEmRef.current = Date.now() + QR_TIMEOUT_MS;
      setTempoRestante(QR_TIMEOUT_MS / 1000);

      // Countdown visual
      countdownRef.current = setInterval(() => {
        const restante = Math.max(0, Math.ceil((expiraEmRef.current - Date.now()) / 1000));
        setTempoRestante(restante);
        if (restante <= 0) {
          limparIntervals();
          setEstado('expirado');
        }
      }, 1000);

      // Polling de status
      iniciarPolling(caixa.id);
    } catch (err: any) {
      setEstado('erro');
      setMensagemErro(err.message || 'Erro de conexao');
    }
  }, [caixa, limparIntervals, iniciarPolling, onReconectado, onOpenChange]);

  // Iniciar quando o modal abre
  useEffect(() => {
    if (open && caixa) {
      iniciarConexao();
    }
    if (!open) {
      limparIntervals();
      setEstado('idle');
      setQrCode(null);
      setMensagemErro('');
    }
    return limparIntervals;
  }, [open, caixa]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatarTempo = (s: number) => {
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-white">
            Reconectar WhatsApp
          </DialogTitle>
        </DialogHeader>

        {caixa && (
          <p className="text-sm text-slate-400">
            Escaneie o QR code com o WhatsApp da caixa <strong className="text-white">{caixa.nome}</strong>
          </p>
        )}

        <div className="flex flex-col items-center gap-4 py-4">
          {/* Iniciando */}
          {estado === 'iniciando' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="w-10 h-10 animate-spin text-violet-400" />
              <p className="text-sm text-slate-400">Gerando QR code...</p>
            </div>
          )}

          {/* Aguardando scan */}
          {estado === 'aguardando_scan' && qrCode && (
            <>
              <div className="bg-white rounded-xl p-3">
                <img
                  src={qrCode}
                  alt="QR Code WhatsApp"
                  className="w-64 h-64"
                />
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span>Expira em:</span>
                <span className={tempoRestante <= 30 ? 'text-amber-400 font-medium' : 'text-white font-medium'}>
                  {formatarTempo(tempoRestante)}
                </span>
              </div>
              <p className="text-xs text-slate-500 text-center">
                Abra o WhatsApp no celular &gt; Dispositivos conectados &gt; Conectar dispositivo
              </p>
            </>
          )}

          {/* Conectado */}
          {estado === 'conectado' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <CheckCircle2 className="w-12 h-12 text-emerald-400" />
              <p className="text-sm font-medium text-emerald-400">Conectado com sucesso!</p>
            </div>
          )}

          {/* Erro */}
          {estado === 'erro' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <XCircle className="w-12 h-12 text-red-400" />
              <p className="text-sm text-red-300">{mensagemErro}</p>
              <button
                onClick={iniciarConexao}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Tentar novamente
              </button>
            </div>
          )}

          {/* Expirado */}
          {estado === 'expirado' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <AlertTriangle className="w-12 h-12 text-amber-400" />
              <p className="text-sm text-amber-300">QR code expirado</p>
              <button
                onClick={iniciarConexao}
                className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Gerar novo QR
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
