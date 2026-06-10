import { Copy, Send, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { invokeWithRetry } from '@/lib/supabase';
import { formatarRelatorioCaixaWhatsApp } from '@/lib/caixaFinanceiro';
import type { CaixaDiario, CaixaMovimentacao } from '@/types/caixa';

interface CaixaWhatsAppPreviewProps {
  caixa: CaixaDiario | null;
  movimentos: CaixaMovimentacao[];
  unidadeNome: string;
  unidadeCodigo: string;
  conferidoPor: string;
  disabled?: boolean;
  onStatus: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export function CaixaWhatsAppPreview({
  caixa,
  movimentos,
  unidadeNome,
  unidadeCodigo,
  conferidoPor,
  disabled = false,
  onStatus,
}: CaixaWhatsAppPreviewProps) {
  const texto = caixa
    ? formatarRelatorioCaixaWhatsApp({ caixa, movimentos, unidadeNome, unidadeCodigo, conferidoPor })
    : 'Abra o caixa do dia para gerar o preview do WhatsApp.';
  const caixaFechado = caixa?.status === 'fechado';

  async function copiar() {
    await navigator.clipboard.writeText(texto);
    onStatus('Preview copiado para a area de transferencia.', 'success');
  }

  async function enviarDryRun() {
    if (!caixa) return;
    const { data, error } = await invokeWithRetry<{ ok: boolean; texto?: string; error?: string }>('caixa-financeiro-whatsapp', {
      body: {
        caixa_diario_id: caixa.id,
        modo: 'dry_run',
      },
    });

    if (error || data?.error) {
      onStatus(error?.message || data?.error || 'Falha ao validar envio.', 'error');
      return;
    }

    onStatus('Edge Function validada em dry-run. Nenhuma mensagem foi enviada.', 'success');
  }

  async function enviarWhatsApp() {
    if (!caixa) return;
    if (!caixaFechado) {
      onStatus('Feche o caixa antes de enviar o relatorio ao financeiro.', 'error');
      return;
    }

    const confirmado = window.confirm('Enviar o fechamento de caixa para o grupo financeiro desta unidade?');
    if (!confirmado) return;

    const { data, error } = await invokeWithRetry<{ ok: boolean; error?: string }>('caixa-financeiro-whatsapp', {
      body: {
        caixa_diario_id: caixa.id,
        modo: 'send',
      },
    });

    if (error || data?.error) {
      onStatus(error?.message || data?.error || 'Falha ao enviar WhatsApp.', 'error');
      return;
    }

    onStatus('Relatorio enviado ao grupo financeiro.', 'success');
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300">
            <Smartphone className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-white">Preview do WhatsApp</h3>
            <p className="text-xs text-slate-400">Conferencia manual antes do envio ao financeiro.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={!caixa} onClick={() => void copiar()}>
            <Copy className="h-4 w-4" />
            Copiar
          </Button>
          <Button type="button" size="sm" disabled={!caixa || disabled} onClick={() => void enviarDryRun()}>
            <Send className="h-4 w-4" />
            Testar envio
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!caixa || !caixaFechado || disabled}
            onClick={() => void enviarWhatsApp()}
          >
            <Send className="h-4 w-4" />
            Enviar WhatsApp
          </Button>
        </div>
      </div>

      <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap px-4 py-4 text-sm leading-relaxed text-slate-200">
        {texto}
      </pre>
    </div>
  );
}
