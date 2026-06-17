import React from 'react';

/**
 * Converte a marcação de formatação do WhatsApp em JSX, para que o painel de
 * conversas mostre a mensagem como o cliente realmente a recebe (negrito de
 * verdade em vez de `*asteriscos*` crus).
 *
 * Marcadores suportados (iguais ao WhatsApp):
 *   *negrito*      _itálico_      ~tachado~      ```monoespaçado```
 *
 * O parsing é tolerante (não exige bordas de palavra) porque as mensagens
 * tratadas aqui são bem-formadas. Aninhamento é suportado (ex: *_negrito itálico_*).
 */

interface Marcador {
  marca: string;
  /** monoespaçado não interpreta marcadores internos */
  literal?: boolean;
  envolver: (filhos: React.ReactNode) => React.ReactNode;
}

// Ordem importa só para empate de índice; ``` precede ` para casar o bloco inteiro.
const MARCADORES: Marcador[] = [
  { marca: '```', literal: true, envolver: (f) => <code className="font-mono text-[0.85em] bg-black/20 rounded px-1 py-0.5">{f}</code> },
  { marca: '*', envolver: (f) => <strong className="font-semibold">{f}</strong> },
  { marca: '_', envolver: (f) => <em>{f}</em> },
  { marca: '~', envolver: (f) => <del>{f}</del> },
];

function parseSegmento(texto: string): React.ReactNode {
  const nos: React.ReactNode[] = [];
  let resto = texto;

  while (resto.length > 0) {
    // Escolhe o marcador de abertura mais à esquerda que possua um par de fechamento.
    let escolhido: { marc: Marcador; abre: number; fecha: number } | null = null;
    for (const marc of MARCADORES) {
      const abre = resto.indexOf(marc.marca);
      if (abre === -1) continue;
      const fecha = resto.indexOf(marc.marca, abre + marc.marca.length);
      if (fecha === -1 || fecha === abre + marc.marca.length) continue; // sem par ou conteúdo vazio
      if (!escolhido || abre < escolhido.abre) escolhido = { marc, abre, fecha };
    }

    if (!escolhido) {
      nos.push(resto);
      break;
    }

    const { marc, abre, fecha } = escolhido;
    if (abre > 0) nos.push(resto.slice(0, abre));
    const interno = resto.slice(abre + marc.marca.length, fecha);
    nos.push(marc.envolver(marc.literal ? interno : parseSegmento(interno)));
    resto = resto.slice(fecha + marc.marca.length);
  }

  return nos.map((no, i) => <React.Fragment key={i}>{no}</React.Fragment>);
}

export function formatarWhatsApp(texto: string | null | undefined): React.ReactNode {
  if (!texto) return texto ?? null;
  if (!/[*_~`]/.test(texto)) return texto; // atalho: nada para formatar
  return parseSegmento(texto);
}
