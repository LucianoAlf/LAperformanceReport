#!/usr/bin/env node
// Duas metades da mesma regra: com card na mesa, "e' saida" CORRIGE em vez de recomecar.
//
// (1) REGRESSAO que eu mesmo criei minutos antes: ao ensinar o fluxo de texto puro a
//     reconhecer despesa/compra/retirada, ele passou a capturar tambem a FRASE DE
//     CORRECAO que vem depois de um card. No caso Mayra/CG (#229) o "Sol, foi saida"
//     virava um lancamento NOVO sem valor -> "falta o valor", e o lancamento original
//     morria. O fluxo de saida por texto so pode abrir caso NOVO quando nao ha
//     pendencia aberta no grupo.
//
// (2) O buraco que sobrava do caso Rose+Vitoria (Recreio 28/08): com o card errado na
//     tela, a Vitoria escreveu "Sol, foi saida de dinheiro e a categoria e despesa" —
//     a frase mais explicita possivel — e levou "Nao entendi essa". Nao existia
//     correcao tardia de TIPO: da' para corrigir nome, valor e forma, mas nao da' para
//     dizer "isso e' saida, nao recebimento". Agora da'.
//
// ⚠️ A conversao zera o aluno de proposito: saida de caixa nao tem aluno, e era
// justamente o campo que vinha sendo preenchido com lixo ("descricao e refrigerantes
// Pode"). Zerar aqui e' o que faz o card voltar a ser legivel.
const fs = require('fs');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node _patch-corrigir-tipo-para-saida.cjs <caixa-financeiro.cjs>'); process.exit(2); }

let src = fs.readFileSync(alvo, 'utf8');
const antes = src.length;

function trocar(de, para, rotulo) {
  const n = src.split(de).length - 1;
  if (n !== 1) { console.error(`ANCORA "${rotulo}": esperava 1 ocorrencia, achei ${n}`); process.exit(1); }
  src = src.split(de).join(para);
  console.log(`  ok  ${rotulo}`);
}

// ── (1) saida por TEXTO so abre caso novo sem pendencia aberta ───────────────
trocar(
  `      const categoriaTexto = _saidaExplicitaFromCaption(texto) || _categoriaExplicitaFromCaption(texto);`,
  `      // ⚠️ Com card aberto, frase de saida e' CORRECAO (tratada mais abaixo), nunca
      // lancamento novo — senao "Sol, foi saida" abre um caso sem valor e mata o
      // preview original (regressao real do caso Mayra/CG).
      const _pendAbertaTexto = limparVelhos(chatId, Date.now()).length > 0;
      const categoriaTexto = (_pendAbertaTexto ? null : _saidaExplicitaFromCaption(texto))
        || _categoriaExplicitaFromCaption(texto);`,
  'saida por texto nao reinicia com card aberto');

// ── (2) correcao tardia de TIPO: recebimento -> saida ────────────────────────
// Entra logo depois do DESCARTE e antes do nome-tardio: "e' saida" nunca pode ser
// lido como nome de aluno, mesmo motivo pelo qual o descarte vem antes.
trocar(
  `      if (!event.hasMedia && txt && !casarPode(txt).pode) {
        const nomeTardio = _nomeHumanoTardio(txt);`,
  `      // CORRECAO DE TIPO: "Sol, foi saida / e despesa" com card aberto converte o
      // lancamento em saida de caixa, em vez de virar nome de aluno ou "nao entendi".
      if (!event.hasMedia && txt && !casarPode(txt).pode) {
        const _catSaidaCorr = _saidaExplicitaFromCaption(txt);
        if (_catSaidaCorr) {
          const arrS = limparVelhos(chatId, agora);
          let alvoS = null;
          if (event.quotedMessageId) alvoS = arrS.find((p) => p.previewId === event.quotedMessageId) || null;
          if (!alvoS && arrS.length === 1) alvoS = arrS[0];
          if (alvoS && !categoriaEhSaida(alvoS.categoria)) {
            alvoS.categoria = _catSaidaCorr;
            alvoS.aluno = null;              // saida nao tem aluno
            alvoS.competencia = null;
            alvoS.parcela = null;
            alvoS.canonica = null;
            alvoS.composto = null;
            alvoS.multiplas = false;
            alvoS.responsavelFinanceiro = null;
            alvoS.candidatosAluno = null;
            alvoS.bloqueiaLancamento = false;
            alvoS.descricao = _descricaoSaidaTexto(alvoS.legenda || txt, _catSaidaCorr) || null;
            alvoS.ts = agora;
            let textoS = 'Corrigi — isso e saida de caixa:\\n\\n' + montarPreview({
              unidadeNome: alvoS.nome, valor: alvoS.valor, forma: alvoS.forma,
              categoria: alvoS.categoria, aluno: null, competencia: null, parcela: null,
              confiancaBaixa: false, responsavelFinanceiro: null, formaIncerta: alvoS.formaIncerta,
              cartaoModalidade: alvoS.cartaoModalidade, cartaoParcelas: alvoS.cartaoParcelas,
              multiplas: false, alunoViaPagador: null, pagadorNome: null, candidatosAluno: null,
              canonica: null, duplicata: null, quitacao: null, faturaIndisponivel: false,
              composto: null, bloqueiaLancamento: false,
            });
            if (dryRun) textoS += '\\n\\n_(modo teste — nada será gravado no caixa)_';
            alvoS.previewId = await sendFn(chatId, textoS);
            await vincularPreviewRemontadoV3({
              event, grupo: grp, pendencia: alvoS, previewId: alvoS.previewId, texto: textoS,
              result: { acao: 'preview_tipo_corrigido_saida', categoria: alvoS.categoria },
            });
            log({ acao: 'preview_tipo_corrigido_saida', chatId, categoria: alvoS.categoria, valor: alvoS.valor });
            return { acao: 'preview_tipo_corrigido_saida', categoria: alvoS.categoria };
          }
        }
        const nomeTardio = _nomeHumanoTardio(txt);`,
  'correcao tardia de tipo para saida');

fs.writeFileSync(alvo, src, 'utf8');
console.log(`\npatch aplicado: ${antes} -> ${src.length} bytes (+${src.length - antes})`);
