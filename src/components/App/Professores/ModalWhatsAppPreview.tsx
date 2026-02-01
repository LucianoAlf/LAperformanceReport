import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MessageSquare, Copy, Send, Check, ExternalLink } from 'lucide-react';

interface ToleranciaInfo {
  ocorrencia_numero: number;
  tolerancia_total: number;
  tolerancia_esgotada: boolean;
  ultima_tolerancia: boolean;
  pontos_descontados: number;
}

interface ModalWhatsAppPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  professorNome: string;
  professorWhatsApp: string | null;
  tipoOcorrencia: string;
  dataOcorrencia: string;
  unidadeNome: string;
  registradoPor: string;
  descricao: string | null;
  toleranciaInfo?: ToleranciaInfo | null;
  minutosAtraso?: number | null;
  atrasoGrave?: boolean;
}

export function ModalWhatsAppPreview({
  open,
  onOpenChange,
  professorNome,
  professorWhatsApp,
  tipoOcorrencia,
  dataOcorrencia,
  unidadeNome,
  registradoPor,
  descricao,
  toleranciaInfo,
  minutosAtraso,
  atrasoGrave,
}: ModalWhatsAppPreviewProps) {
  const [copiado, setCopiado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  // Formatar data para exibição
  const dataFormatada = new Date(dataOcorrencia + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  // Gerar texto de tempo de atraso
  const getAtrasoTexto = () => {
    if (!minutosAtraso) return '';
    return `⏱️ *Tempo de atraso:* ${minutosAtraso >= 60 ? '1 hora ou mais' : `${minutosAtraso} minutos`}\n`;
  };

  // Gerar texto de tolerância/atraso grave
  const getToleranciaTexto = () => {
    // Se atraso grave, mostrar mensagem específica
    if (atrasoGrave) {
      return `\n❌ *Atraso acima de 10 minutos!* Pontuação descontada: -${toleranciaInfo?.pontos_descontados || 0} pts (sem tolerância)\n`;
    }
    
    if (!toleranciaInfo) return '';
    
    if (toleranciaInfo.tolerancia_esgotada) {
      return `\n❌ *Tolerância esgotada!* Pontuação descontada: -${toleranciaInfo.pontos_descontados} pts\n`;
    } else if (toleranciaInfo.ultima_tolerancia) {
      return `\n⚠️ *Atenção:* Esta foi sua última tolerância (${toleranciaInfo.ocorrencia_numero}/${toleranciaInfo.tolerancia_total}). A próxima ocorrência descontará pontos.\n`;
    } else {
      return `\nℹ️ *Tolerância:* ${toleranciaInfo.ocorrencia_numero}/${toleranciaInfo.tolerancia_total} (ainda dentro da tolerância)\n`;
    }
  };

  // Gerar mensagem formatada
  const mensagem = `🔔 *LA Music - Avaliação 360°*

Olá, ${professorNome.split(' ')[0]}!

Uma ocorrência foi registrada em seu perfil:

📋 *Tipo:* ${tipoOcorrencia}
${getAtrasoTexto()}📅 *Data:* ${dataFormatada}
🏢 *Unidade:* ${unidadeNome}
👤 *Registrado por:* ${registradoPor}${getToleranciaTexto()}${descricao ? `
📝 *Observação:*
${descricao}
` : ''}
---
Em caso de dúvidas, procure a coordenação.`;

  // Copiar mensagem
  const handleCopiar = async () => {
    try {
      await navigator.clipboard.writeText(mensagem);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch (err) {
      console.error('Erro ao copiar:', err);
    }
  };

  // Abrir WhatsApp Web com a mensagem
  const handleEnviarWhatsApp = () => {
    if (!professorWhatsApp) return;
    
    setEnviando(true);
    
    // Formatar número (garantir que tem apenas números)
    const numero = professorWhatsApp.replace(/\D/g, '');
    
    // Codificar mensagem para URL
    const mensagemCodificada = encodeURIComponent(mensagem);
    
    // Abrir WhatsApp Web
    window.open(`https://wa.me/${numero}?text=${mensagemCodificada}`, '_blank');
    
    // Feedback visual e fechar modal após um breve delay
    setTimeout(() => {
      setEnviando(false);
      onOpenChange(false);
    }, 500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <MessageSquare className="h-5 w-5 text-emerald-400" />
            Notificar Professor via WhatsApp
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Status do WhatsApp */}
          {professorWhatsApp ? (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
              <p className="text-sm text-emerald-400 flex items-center gap-2">
                <Check className="h-4 w-4" />
                WhatsApp cadastrado: {professorWhatsApp}
              </p>
            </div>
          ) : (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <p className="text-sm text-amber-400">
                ⚠️ Professor sem WhatsApp cadastrado. Copie a mensagem e envie manualmente.
              </p>
            </div>
          )}

          {/* Preview da Mensagem */}
          <div className="space-y-2">
            <label className="text-sm text-slate-400">Mensagem:</label>
            <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg">
              <pre className="text-sm text-white whitespace-pre-wrap font-sans leading-relaxed">
                {mensagem}
              </pre>
            </div>
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            className="flex-1"
          >
            Fechar
          </Button>
          
          <Button 
            variant="outline"
            onClick={handleCopiar}
            className="flex-1 gap-2"
          >
            {copiado ? (
              <>
                <Check className="h-4 w-4 text-emerald-400" />
                Copiado!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copiar
              </>
            )}
          </Button>

          {professorWhatsApp && (
            <Button 
              onClick={handleEnviarWhatsApp}
              disabled={enviando}
              className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-70"
            >
              {enviando ? (
                <>
                  <Check className="h-4 w-4 animate-pulse" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Enviar
                  <ExternalLink className="h-3 w-3" />
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ModalWhatsAppPreview;
