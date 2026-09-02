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

  const temClipboardApi =
    typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function';

  // A Clipboard API vem primeiro onde existe: ela não depende de foco nem de
  // seleção, então atravessa o focus trap dos modais. O caminho antigo, que
  // depende dos dois, é justamente o que falha dentro de um Dialog do Radix —
  // o FocusScope devolve o foco durante a cópia e o texto não vai para lugar
  // nenhum (medido em Chromium, 2026-09-02).
  if (temClipboardApi) {
    try {
      await navigator.clipboard.writeText(text);
      return { ok: true, method: 'clipboard' };
    } catch (error) {
      copyError = error;
    }
  }

  // Sem Clipboard API — caso do browser incorporado (WebView) — este é o único
  // caminho, e nada assíncrono pode ter rodado antes: uma tentativa negada
  // consome a ativação do clique e impede a cópia síncrona logo depois.
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

      // Se o foco foi roubado (focus trap de modal), execCommand não copiaria o
      // textarea — e pior, copiaria a seleção que estivesse ativa na página,
      // sobrescrevendo a área de transferência do usuário com outra coisa.
      // Ele devolve `true` nos dois casos, então o retorno não serve de prova.
      if (document.activeElement !== textarea) {
        throw new Error('foco perdido antes da copia (focus trap de modal?)');
      }

      const selecionouTudo = textarea.selectionEnd - textarea.selectionStart === text.length;
      if (!selecionouTudo) {
        throw new Error('selecao incompleta antes da copia');
      }

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

  return { ok: false, error: copyError };
}

export function getManualCopyShortcut(): string {
  if (typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')) {
    return 'Cmd+C';
  }

  return 'Ctrl+C';
}
