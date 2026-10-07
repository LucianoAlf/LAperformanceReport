import { useEffect, useState } from 'react';

/**
 * O movimento das folhas de baixo — a fonte unica.
 *
 * Existe porque a casca da folha estava copiada em SEIS lugares (`FolhaMobile`,
 * `FolhaUnidades`, `MobileMaisSheet`, `SeletorPeriodoMobile`,
 * `SeletorSecaoMobile` e a variante `folha` do `AgendaDrawer`). Escrever a
 * transicao em cada uma daria seis duracoes que se soltam com o tempo — e a
 * folha e' o gesto que mais se repete no celular.
 *
 * ⚠️ So `transform` e `opacity`. As duas entram apenas na etapa de COMPOSICAO
 * do quadro: o navegador desloca uma textura pronta, sem refazer layout nem
 * pintura, e em geral fora da thread do JavaScript. Animar `height`, `top` ou
 * `bottom` produziria o mesmo desenho recalculando o layout 60 vezes por
 * segundo — e' de onde vem a fama de animacao travada.
 *
 * ⚠️ Nada de `backdrop-blur` no veu: desfoque e' recalculado a cada quadro
 * sobre tudo que esta' atras, e e' o efeito mais caro num telefone
 * intermediario. O veu e' cor solida translucida, de proposito.
 */

/**
 * O relogio do desmonte. Precisa bater com os 180ms declarados em
 * `index.css` — se um mudar sem o outro, a folha some antes de terminar de
 * sair, ou fica montada depois de sumir.
 */
export const DURACAO_FOLHA_MS = 180;

/**
 * Classes do veu e do painel.
 *
 * 🔴 Sao nomes ESTAVEIS declarados em `src/index.css`, nunca utilitarios de
 * valor arbitrario. O Tailwind aqui e' o Play CDN, que gera regra em tempo de
 * execucao varrendo o DOM: medido em 29/09, uma classe inedita ainda nao tinha
 * regra no quadro seguinte ao da montagem, e a folha nasceria ABERTA para so'
 * entao correr ate a posicao fechada — desceria em vez de subir, justamente na
 * primeira abertura.
 *
 * O estado vai num `data-entrou`, e nao numa segunda classe, para haver um
 * unico lugar onde "chegou" e' escrito.
 */
export const CLASSE_VEU = 'folha-veu';
export const CLASSE_PAINEL = 'folha-painel';

/** O estado vai num atributo, e nao numa segunda classe: um lugar so' onde
 *  "chegou" e' escrito, e o CSS le os dois estados do mesmo seletor. */
export function dataEntrou(entrou: boolean) {
  return { 'data-entrou': entrou ? '1' : '0' } as const;
}

interface Estado {
  /** Renderiza a folha? Segue verdadeiro durante a saida. */
  montada: boolean;
  /** Chegou ao lugar? E' o que as classes acima leem. */
  entrou: boolean;
}

/**
 * Mantem a folha montada durante a saida e garante um quadro na posicao
 * fechada antes de abrir.
 *
 * ⚠️ O `requestAnimationFrame` nao e' enfeite: montar ja' com a classe final
 * faz o navegador considerar aquele o primeiro estado conhecido, e transicao
 * exige DOIS estados. Sem ele a folha aparece de uma vez — o comportamento que
 * a mudanca existe para corrigir, e que nenhum teste de texto pegaria.
 *
 * ⚠️ O desmonte e' por RELOGIO, nunca por `onTransitionEnd`. Com
 * `prefers-reduced-motion` a classe `motion-reduce:transition-none` apaga a
 * transicao, transicao que nao existe nunca termina, e o evento jamais
 * dispararia — a folha ficaria montada para sempre. E' a mesma armadilha
 * medida no palco da Agenda em 21/09.
 */
export function useFolhaAnimada(aberto: boolean): Estado {
  const [montada, setMontada] = useState(aberto);
  // Comeca fechado MESMO quando ja nasce aberto: ha folha que o pai monta so
  // no instante de abrir (o detalhe da aula na Agenda). Iniciar em `true` ali
  // faria a folha aparecer de uma vez, que e' o defeito a corrigir.
  const [entrou, setEntrou] = useState(false);

  useEffect(() => {
    if (aberto) {
      setMontada(true);
      return undefined;
    }
    setEntrou(false);
    const t = setTimeout(() => setMontada(false), DURACAO_FOLHA_MS);
    return () => clearTimeout(t);
  }, [aberto]);

  useEffect(() => {
    if (!aberto || !montada) return undefined;
    const quadro = requestAnimationFrame(() => setEntrou(true));
    return () => cancelAnimationFrame(quadro);
  }, [aberto, montada]);

  return { montada, entrou };
}

/**
 * Resposta ao toque — o retorno que a barra de baixo nao dava.
 *
 * As rotas do aplicativo sao todas lazy: entre o toque e a tela aparecer, o
 * navegador ainda esta baixando o pedaco de codigo daquele modulo. Sem sinal
 * nenhum nesse intervalo, "eu errei o alvo?" e "esta carregando?" ficam
 * indistinguiveis, e o gesto seguinte e' tocar de novo. 90ms respondem isso.
 *
 * ⚠️ `scale` e nada mais. Encolher com `width`/`padding` daria o mesmo desenho
 * empurrando os vizinhos e refazendo o layout da barra inteira a cada toque.
 *
 * A regra mora em `index.css` pela mesma razao das duas acima: o Play CDN
 * geraria `active:scale-[0.92]` tarde demais, e o primeiro toque do dia nao
 * responderia — o toque que mais precisa responder.
 */
export const CLASSES_TOQUE = 'folha-toque';
