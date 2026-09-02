#!/usr/bin/env node
// Auditoria do dia 02/09 no FINANCEIRO de CG — 3 defeitos, nenhum de gramatica.
// Nada aqui adiciona regex de dialogo: S1 e' ESTADO, S2 e' traducao de motivo
// estruturado que a RPC ja devolve, S3 e' texto de confirmacao.
//
// S1  A PERGUNTA DA FORMA NAO GUARDAVA ESTADO. "Sol, pagamento semanal do
//     seguranca - R$100,00" abriu a pergunta "me diz a forma" e o handler fez
//     sendFn + return SEM criar pendencia (`pendencias:0` no log do shadow).
//     Medido: "Dinheiro" caiu em `nada`; "Sol, foi no dinheiro" e "Sol, foi
//     dinheiro" cairam 2x em `correcao_forma_sem_alvo` (o caminho de corrigir
//     lancamento JA GRAVADO, que nao acha alvo porque nao havia lancamento);
//     so destravou quando o Jhon repetiu a frase inteira com o valor, 2 min
//     depois. E o roteador V4 ficou cego pelo mesmo motivo: sem pendencia,
//     recebeu "Dinheiro" sem contexto e devolveu `conversa` conf 0.2. Uma raiz,
//     dois cegos — e' o argumento mais forte a favor do estado explicito.
//     Fix: a pergunta cria pendencia `aguardando_forma_saida`; a resposta
//     RECONSTITUI a frase completa e re-despacha (exatamente o que o humano fez
//     na mao), reusando o fluxo inline que ja existe — sem duplicar preview.
//
// S2  FAIL-CLOSED MENTIA O MOTIVO. A mesma legenda da Mayra falhou as 16:23 e
//     passou as 16:50. A RPC devolveu `alocacao_nao_derivavel`: ela deriva o
//     valor de fatura PAGA nos ultimos 7 dias, e as 16:23 o espelho do Emusys
//     ainda tinha as duas faturas ABERTAS (sync a cada 15 min; marcou paga
//     entre 16:33 e 16:48). O sistema agiu certo — a MENSAGEM mandou "confere
//     aluno, competencia e valor de cada um", tudo estava certo, e a equipe
//     ficou 27 min procurando erro inexistente. Agora cada motivo vira frase
//     verdadeira e acionavel. Os nomes de motivo sao os REAIS da RPC (conferidos
//     em pg_get_functiondef), nao inventados.
//
// S3  CONFIRMACAO NAO DIZIA DE QUEM. "Lancei no caixa da Campo Grande:
//     Parcela — R$ 357,00 (pix)" — o dado no banco estava certo (Raul Fonseca
//     Silva, com fatura), mas pelo grupo ninguem confere. A confirmacao do LOTE
//     ja lista nomes; a do lancamento unico nao listava. Foi conferindo pelo
//     grupo que o Jhon pegou o lote incompleto de 01/09.
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-estado-e-diagnostico-02set.cjs <caixa-financeiro.cjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo, esperado = 1) {
  const n = src.split(de).length - 1;
  if (n !== esperado) { console.error('ANCORA "' + rotulo + '": esperava ' + esperado + ', achei ' + n); process.exit(1); }
  src = src.split(de).join(para);
  console.log('  ok  ' + rotulo);
}

// ── S1: a pergunta da forma vira ESTADO ──────────────────────────────────────
trocar(
  [
    '        if (!forma) {',
    '          await sendFn(chatId, `Entendi que é saída de ${categoriaTexto}. Me diz a forma: *dinheiro*.`);',
    '          log({ acao: \'saida_texto_sem_forma\', chatId, categoria: categoriaTexto, valor });',
    '          return { acao: \'saida_texto_sem_forma\' };',
    '        }',
  ].join('\n'),
  [
    '        if (!forma) {',
    '          // Perguntar sem guardar estado deixa a resposta orfa (02/09): o',
    '          // "Dinheiro" caiu em `nada` e o "Sol, foi dinheiro" foi parar no',
    '          // caminho de CORRIGIR lancamento gravado, sem alvo, 2x. A pendencia',
    '          // e o que liga a resposta a pergunta — e o que da contexto ao',
    '          // roteador V4, que sem ela recebeu "Dinheiro" solto e chutou.',
    '          const askId = await sendFn(chatId, `Entendi que é saída de ${categoriaTexto} de ${fmtBRL(valor)}. Me diz a forma: *dinheiro*, *pix*, *cartão* ou *transferência*.`);',
    '          const arrF = limparVelhos(chatId, agora);',
    '          arrF.push({',
    '            previewId: askId, tipoOperacao: \'aguardando_forma_saida\',',
    '            unidade_id: grp.unidade_id, nome: grp.nome,',
    '            valor, forma: null, categoria: categoriaTexto,',
    '            descricao: _descricaoSaidaTexto(texto, categoriaTexto),',
    '            aluno: null, competencia: null, formaIncerta: true,',
    '            origem: event.messageId, idemKey: `${chatId}:${event.messageId}:aguarda-forma`,',
    '            msgIds: [askId], autorPhone: event.senderPhone || null,',
    '            textoOriginal: texto, ts: agora,',
    '          });',
    '          pendentes.set(chatId, arrF);',
    '          log({ acao: \'saida_texto_sem_forma\', chatId, categoria: categoriaTexto, valor, pendencia: true });',
    '          return { acao: \'saida_texto_sem_forma\' };',
    '        }',
  ].join('\n'),
  'S1 pergunta da forma cria pendencia');

// ── S1b: a resposta reconstitui a frase e re-despacha ────────────────────────
// Reusa o fluxo inline inteiro (preview, V3, pendencia) em vez de duplicar —
// duas fontes de escrita com regras proprias para o mesmo card foi a causa-raiz
// das duplicatas de renovacao. E' literalmente o que o Jhon fez na mao as 16:21.
trocar(
  '      if (!event.hasMedia && txt && !casarPode(txt).pode) {\n        let corrForma = extrairCorrecaoForma(txt);',
  [
    '      // Resposta a pergunta da forma: nao e correcao de nada — e a segunda',
    '      // metade de um lancamento que a propria Sol comecou. So existe enquanto',
    '      // houver pendencia `aguardando_forma_saida` (janela curta, aberta por',
    '      // pergunta explicita dela), entao palavra de forma aqui E a resposta.',
    '      if (!event.hasMedia && txt && !casarPode(txt).pode && !casarNao(txt)) {',
    '        const _aguardando = limparVelhos(chatId, agora).find((p) => p.tipoOperacao === \'aguardando_forma_saida\');',
    '        if (_aguardando) {',
    '          const _f = ((extrairCorrecaoForma(txt) || {}).forma) || extrairForma(txt, null);',
    '          if (_f) {',
    '            pendentes.set(chatId, limparVelhos(chatId, agora).filter((p) => p !== _aguardando));',
    '            log({ acao: \'saida_forma_respondida\', chatId, forma: _f, valor: _aguardando.valor });',
    '            const _rf = await handle({',
    '              ...event, _sintetico: true, hasMedia: false,',
    '              body: `${_aguardando.textoOriginal || \'\'} ${_f}`.trim(),',
    '              messageId: String(event.messageId || \'\') + \'#forma\',',
    '            });',
    '            if (_rf && _rf.acao === \'saida_texto_preview_enviado\') return _rf;',
    '            // Nao remontou: devolve a pendencia (o fallback LLM ainda alcanca)',
    '            // e pede a frase completa em vez de sumir em silencio.',
    '            const _volta = limparVelhos(chatId, agora);',
    '            _volta.push({ ..._aguardando, ts: agora });',
    '            pendentes.set(chatId, _volta);',
    '            await sendFn(chatId, `Anotei *${_f}*, mas não consegui remontar o lançamento. Me manda a linha completa: *${_aguardando.descricao || _aguardando.categoria} — ${fmtBRL(_aguardando.valor)} ${_f}*.`);',
    '            log({ acao: \'saida_forma_remontagem_falhou\', chatId, forma: _f });',
    '            return { acao: \'saida_forma_remontagem_falhou\' };',
    '          }',
    '        }',
    '      }',
    '      if (!event.hasMedia && txt && !casarPode(txt).pode) {',
    '        let corrForma = extrairCorrecaoForma(txt);',
  ].join('\n'),
  'S1b resposta completa a saida');

// ── S2: motivo estruturado vira frase verdadeira ─────────────────────────────
trocar(
  "      await sendFn(event.chatId, '⚠️ Entendi a divisão, mas ainda não consegui confirmar todas as faturas oficiais. Não vou lançar parcialmente. Confere aluno, competência e valor de cada um.');",
  [
    '      // 02/09: a mesma legenda falhou as 16:23 e passou as 16:50 — o espelho do',
    '      // Emusys ainda nao tinha as faturas como PAGAS (sync a cada 15 min). A',
    '      // mensagem antiga mandava conferir dados que estavam CERTOS. A RPC ja',
    '      // devolve o motivo estruturado; so faltava contar a verdade.',
    '      const _quem = resolvido && resolvido.aluno_nome ? ` do ${resolvido.aluno_nome}` : \'\';',
    '      const _pedeDivisao = \'me manda a divisão com o valor de cada um: *Nome — R$ valor*\';',
    '      const _motivosMulti = {',
    '        alocacao_nao_derivavel: (resolvido && Number(resolvido.candidatas) > 1)',
    '          ? `achei mais de uma fatura paga${_quem} nos últimos dias e não sei qual é esta — ${_pedeDivisao}.`',
    '          : `ainda não vejo a fatura${_quem} como paga na minha cópia do Emusys (ela atualiza a cada 15 min). Se o pagamento acabou de entrar, me reenvia daqui a pouco — ou ${_pedeDivisao}.`,',
    '        sem_fatura_da_categoria: `não encontrei fatura dessa categoria${_quem} na competência — confere a competência, ou ${_pedeDivisao}.`,',
    '        aluno_nao_encontrado: `não achei${_quem} no cadastro desta unidade — confere o nome completo.`,',
    '        item_sem_aluno: \'não consegui ler o nome de um dos alunos — \' + _pedeDivisao + \'.\',',
    '        competencia_item_divergente: `a competência não bate com a fatura${_quem} — confere o mês.`,',
    '        categoria_item_invalida: \'a categoria de um dos itens não confere com a fatura — confere se é parcela, passaporte ou taxa.\',',
    '        soma_itens_divergente: \'a soma dos alunos não fecha com o valor do comprovante — confere os valores.\',',
    '        item_nao_validado: `não consegui casar um dos itens${_quem} com fatura oficial — ${_pedeDivisao}.`,',
    '        fonte_indisponivel: \'a fonte oficial de faturas está fora do ar agora. Não lanço sem confirmar; tenta de novo em alguns minutos.\',',
    '      };',
    '      const _detalhe = _motivosMulti[resolvido && resolvido.motivo]',
    '        || \'ainda não consegui confirmar todas as faturas oficiais — confere aluno, competência e valor de cada um.\';',
    '      await sendFn(event.chatId, `⚠️ Entendi a divisão, mas ${_detalhe}\\n_Não lanço parcialmente._`);',
  ].join('\n'),
  'S2 motivo real no fail-closed');

// ── S3: confirmacao do lancamento unico diz o aluno ──────────────────────────
trocar(
  '        const confirmMessageId = await sendFn(chatId, `✅ ${verbo} no caixa da ${alvo.nome}: ${cap(payload.categoria)} — ${fmtBRL(r.valor)} (${r.forma}).\\n_${quem} · registrei isso no responsável do lançamento._`);',
  [
    '        // Quem confere o caixa pelo grupo precisa saber DE QUEM foi o dinheiro —',
    '        // foi conferindo assim que o Jhon pegou o lote incompleto de 01/09. A',
    '        // confirmacao do lote ja listava nomes; a do unico dizia so "Parcela".',
    '        const _de = alvo.aluno ? ` · ${alvo.aluno}`',
    '          : (alvo.descricao ? ` · ${alvo.descricao}` : \'\');',
    '        const confirmMessageId = await sendFn(chatId, `✅ ${verbo} no caixa da ${alvo.nome}: ${cap(payload.categoria)} — ${fmtBRL(r.valor)} (${r.forma})${_de}.\\n_${quem} · registrei isso no responsável do lançamento._`);',
  ].join('\n'),
  'S3 confirmacao diz o aluno');

fs.writeFileSync(alvo, src, 'utf8');
console.log('\npatch aplicado: ' + antes + ' -> ' + src.length + ' bytes (+' + (src.length - antes) + ')');
