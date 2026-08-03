import { AlertTriangle, CheckCircle2, PencilLine } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { PreviewWhatsAppFormatado } from '@/lib/whatsappFormat';

interface EditorMensagemPesquisaEvasaoProps {
  mensagemOriginal: string;
  mensagem: string;
  desabilitado: boolean;
  onMensagemChange: (mensagem: string) => void;
}

export function EditorMensagemPesquisaEvasao({
  mensagemOriginal,
  mensagem,
  desabilitado,
  onMensagemChange,
}: EditorMensagemPesquisaEvasaoProps) {
  const totalCaracteres = Array.from(mensagem).length;
  const vazio = mensagem.trim().length === 0;
  const excedente = Math.max(0, totalCaracteres - 2_000);
  const editado = mensagem !== mensagemOriginal;
  const possuiErro = vazio || excedente > 0;
  const descricaoId = possuiErro
    ? 'pesquisa-evasao-editor-ajuda pesquisa-evasao-editor-erro'
    : 'pesquisa-evasao-editor-ajuda';

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <label
            htmlFor="pesquisa-evasao-mensagem-final"
            className="flex items-center gap-2 text-sm font-semibold text-slate-100"
          >
            <PencilLine className="h-4 w-4 text-violet-300" />
            Texto da mensagem
          </label>
          <p id="pesquisa-evasao-editor-ajuda" className="mt-1 text-xs text-slate-400">
            Você pode ajustar o texto antes de enviar.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {editado && (
            <span className="inline-flex items-center gap-1 rounded-full border border-violet-400/25 bg-violet-400/10 px-2.5 py-1 font-medium text-violet-200">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Texto editado
            </span>
          )}
          <span
            className={
              possuiErro
                ? 'font-semibold text-rose-300'
                : 'text-slate-400'
            }
          >
            {totalCaracteres.toLocaleString('pt-BR')} / 2.000 caracteres
          </span>
        </div>
      </div>

      <Textarea
        id="pesquisa-evasao-mensagem-final"
        value={mensagem}
        disabled={desabilitado}
        aria-invalid={possuiErro}
        aria-describedby={descricaoId}
        onChange={(event) => onMensagemChange(event.target.value)}
        className="min-h-64 resize-y border-slate-600 bg-slate-950/70 font-mono text-sm leading-6 text-slate-100 focus-visible:ring-violet-400"
      />

      {possuiErro && (
        <div
          id="pesquisa-evasao-editor-erro"
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {vazio
              ? 'A mensagem não pode ficar vazia.'
              : `Reduza ${excedente.toLocaleString('pt-BR')} caractere${excedente === 1 ? '' : 's'} para continuar.`}
          </span>
        </div>
      )}

      <section
        aria-labelledby="pesquisa-evasao-aparencia-whatsapp"
        className="overflow-hidden rounded-xl border border-emerald-400/15 bg-emerald-950/15"
      >
        <h4
          id="pesquisa-evasao-aparencia-whatsapp"
          className="border-b border-emerald-400/15 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-200"
        >
          Como aparecerá no WhatsApp
        </h4>
        <PreviewWhatsAppFormatado
          texto={mensagem}
          className="px-4 py-4 text-[15px] leading-7 text-slate-200"
        />
      </section>
    </div>
  );
}
