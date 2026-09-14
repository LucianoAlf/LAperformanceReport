/**
 * O arquétipo 3 do spec — "ficha" — em tela de telefone.
 *
 * O desktop mostra a ficha num diálogo centrado (`max-w-4xl max-h-[90vh]`).
 * No celular isso vira um retângulo flutuando com margem de todos os lados,
 * dentro do qual o conteúdo real fica espremido — e a ficha do aluno tem 9
 * abas e um formulário inteiro. O padrão de celular é o oposto: a ficha TOMA
 * a tela, com cabeçalho fixo, abas deslizantes e a ação de maior valor na
 * base, na zona do polegar.
 *
 * Aqui ficam só as classes, porque a ficha do aluno, a do professor e a do
 * lead são três telas diferentes que precisam do MESMO enquadramento — e
 * repetir esse punhado de classes em três arquivos é como o filtro de período
 * chegou à tela de Alunos ainda largo depois de resolvido no Dashboard.
 */

/**
 * Faz o `DialogContent` ocupar a tela inteira.
 *
 * ⚠️ Não basta `w-screen h-screen`: o `DialogContent` é `fixed left-[50%]
 * top-[50%] translate-x-[-50%] translate-y-[-50%]`, então sem zerar o
 * deslocamento a ficha fica centrada e metade dela sai da tela. Como o `cn()`
 * usa twMerge, `left-0`/`top-0`/`translate-*-0` vencem as classes de origem —
 * mas só porque vêm depois; não reordenar.
 *
 * ⚠️ `h-[100dvh]`, não `h-screen`: `100vh` no iOS inclui a barra de endereço
 * que se retrai, e o rodapé de ações fica abaixo da dobra justamente enquanto
 * a barra está visível.
 */
export const FICHA_TELA_CHEIA = [
  'left-0 top-0 translate-x-0 translate-y-0',
  'h-[100dvh] max-h-none w-screen max-w-none',
  'rounded-none border-0 p-3 gap-2',
].join(' ');

/**
 * A lista de abas da ficha no celular: deslizante, com rótulo visível.
 *
 * `grid-cols-9` em 375px dá **41px por aba** — abaixo do alvo de toque de
 * 44px, e com o rótulo escondido (`hidden sm:inline`) sobra só um ícone para
 * distinguir "Acadêmico" de "Pedagógico". A faixa deslizante devolve o texto.
 */
export const FICHA_ABAS_CELULAR = [
  'flex w-full justify-start gap-1 overflow-x-auto',
  // A ultima aba visivel some num degrade em vez de terminar seca na borda:
  // faixa que corta reto parece uma lista completa, e ai a rolagem vira
  // informacao escondida — as 5 abas seguintes nunca seriam descobertas.
  '[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]',
].join(' ');

/** Cada aba: largura pelo conteúdo e alvo de toque de verdade. */
export const FICHA_ABA_CELULAR = 'min-h-[44px] flex-none px-3';

/**
 * O rodapé de ações, fixo na base.
 *
 * `env(safe-area-inset-bottom)` porque no iPhone a faixa do gesto de início
 * cobre os últimos ~34px — sem isso o botão "Salvar" fica embaixo dela.
 */
export const FICHA_RODAPE_CELULAR = 'flex-shrink-0 gap-2 border-t border-slate-700 pt-3';

export const ESTILO_RODAPE_CELULAR = {
  paddingBottom: 'calc(0.25rem + env(safe-area-inset-bottom))',
} as const;
