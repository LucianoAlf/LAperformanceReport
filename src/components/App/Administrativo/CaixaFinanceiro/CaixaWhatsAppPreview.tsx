import { Copy, Send, Smartphone } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { copyTextToClipboard, getManualCopyShortcut } from '@/lib/clipboard';
import { supabase } from '@/lib/supabase';
import { formatarDataCaixa, formatarMoedaCaixa, formatarRelatorioCaixaWhatsApp } from '@/lib/caixaFinanceiro';
import type { CaixaDiario, CaixaMovimentacao } from '@/types/caixa';

interface CaixaWhatsAppPreviewProps {
  caixa: CaixaDiario | null;
  movimentos: CaixaMovimentacao[];
  unidadeNome: string;
  unidadeCodigo: string;
  conferidoPor: string;
  disabled?: boolean;
  onStatus: (message: string, type?: 'success' | 'error' | 'info') => void;
  onEnvioFinalizado?: () => void | Promise<void>;
}

export function CaixaWhatsAppPreview({
  caixa,
  movimentos,
  unidadeNome,
  unidadeCodigo,
  conferidoPor,
  disabled = false,
  onStatus,
  onEnvioFinalizado,
}: CaixaWhatsAppPreviewProps) {
  const texto = caixa
    ? formatarRelatorioCaixaWhatsApp({ caixa, movimentos, unidadeNome, unidadeCodigo, conferidoPor })
    : 'Abra o caixa do dia para gerar o preview do WhatsApp.';
  const caixaFechado = caixa?.status === 'fechado';

  async function copiar() {
    const result = await copyTextToClipboard(texto);

    if (result.ok) {
      onStatus('Preview copiado para a area de transferencia.', 'success');
      return;
    }

    console.error('Erro ao copiar preview do caixa:', result.error);
    onStatus(`Erro ao copiar. Selecione o texto e pressione ${getManualCopyShortcut()}.`, 'error');
  }

  async function enviarDryRun() {
    if (!caixa) return;

    const { data, error } = await supabase.rpc('sol_hermes_caixa_validate', {
      p_caixa_diario_id: caixa.id,
    });

    const result = data as { success?: boolean; error?: string; grupo?: string; destino?: string } | null;

    if (error || result?.success === false) {
      onStatus(error?.message || result?.error || 'Falha ao validar envio.', 'error');
      return;
    }

    onStatus(`Rota Sol/Hermes validada para ${result?.grupo || 'grupo financeiro'}. Nenhuma mensagem foi enviada.`, 'success');
  }

  async function enviarWhatsAppConfirmado() {
    if (!caixa) return;
    if (!caixaFechado) {
      onStatus('Feche o caixa antes de enviar o relatorio ao financeiro.', 'error');
      return;
    }

    const { data, error } = await supabase.rpc('sol_hermes_caixa_enqueue', {
      p_caixa_diario_id: caixa.id,
      p_texto: texto,
    });

    await onEnvioFinalizado?.();

    const result = data as { success?: boolean; error?: string; queued?: number; skipped?: string; grupo?: string } | null;

    if (error || result?.success === false) {
      onStatus(error?.message || result?.error || 'Falha ao enfileirar WhatsApp pela Sol.', 'error');
      return;
    }

    if (result?.queued === 0 || result?.skipped) {
      onStatus('Este caixa ja estava enfileirado ou enviado hoje pela Sol/Hermes.', 'info');
      return;
    }

    onStatus(`Relatorio enfileirado para a Sol enviar no grupo ${result?.grupo || 'financeiro'}.`, 'success');
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
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                size="sm"
                disabled={!caixa || !caixaFechado || disabled}
              >
                <Send className="h-4 w-4" />
                Enviar WhatsApp
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="border-emerald-500/20 bg-slate-950">
              <AlertDialogHeader>
                <AlertDialogTitle>Enviar fechamento para o financeiro?</AlertDialogTitle>
                <AlertDialogDescription>
                  O relatorio sera enviado para o grupo financeiro configurado desta unidade.
                </AlertDialogDescription>
              </AlertDialogHeader>

              {caixa && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 text-sm text-slate-300">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Unidade</p>
                      <p className="font-semibold text-white">{unidadeNome}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Data</p>
                      <p className="font-semibold text-white">{formatarDataCaixa(caixa.data_caixa)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Saldo final</p>
                      <p className="font-semibold text-emerald-300">
                        {formatarMoedaCaixa(caixa.saldo_final_calculado)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-emerald-600 hover:bg-emerald-500 focus:ring-emerald-500"
                  onClick={() => void enviarWhatsAppConfirmado()}
                >
                  Enviar ao grupo
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap px-4 py-4 text-sm leading-relaxed text-slate-200">
        {texto}
      </pre>
    </div>
  );
}
