export type ClipboardCopyMethod = 'clipboard' | 'execCommand';

export interface ClipboardCopyResult {
  ok: boolean;
  method?: ClipboardCopyMethod;
  error?: unknown;
}

export async function copyTextToClipboard(text: string): Promise<ClipboardCopyResult> {
  if (!text) {
    return { ok: false, error: new Error('Texto vazio') };
  }

  let copyError: unknown = new Error('Clipboard indisponivel neste contexto');

  // O fallback tradicional precisa acontecer antes do primeiro await. Em browsers
  // incorporados, uma tentativa assíncrona negada pode consumir a ativação do clique
  // e impedir que execCommand copie depois.
  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea');
    const selection = document.getSelection();
    const selectedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '-9999px';
    textarea.style.width = '1px';
    textarea.style.height = '1px';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';

    document.body.appendChild(textarea);

    try {
      try {
        textarea.focus({ preventScroll: true });
      } catch {
        textarea.focus();
      }

      textarea.select();
      textarea.setSelectionRange(0, text.length);

      const ok = document.execCommand('copy');
      if (!ok) {
        throw new Error('execCommand retornou false');
      }

      return { ok: true, method: 'execCommand' };
    } catch (error) {
      copyError = error;
    } finally {
      document.body.removeChild(textarea);

      if (selection && selectedRange) {
        selection.removeAllRanges();
        selection.addRange(selectedRange);
      }
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return { ok: true, method: 'clipboard' };
    } catch (error) {
      copyError = error;
    }
  }

  return { ok: false, error: copyError };
}

export function getManualCopyShortcut(): string {
  if (typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')) {
    return 'Cmd+C';
  }

  return 'Ctrl+C';
}
