import { useMemo, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, Award, Eye, FileText, GraduationCap, Speaker, Table2, Users } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  diasDoEvento,
  formatarDataCurta,
  montarListaDeChegada,
  selecionarParaCertificado,
  type PublicoDoCertificado,
} from '@/lib/eventos';
import {
  abrirDocumento,
  baixarArquivo,
  gerarCertificadosHtml,
  gerarFolhaDePalcoHtml,
  gerarListaDeConvidadosHtml,
  gerarPlanilhaCsv,
  gerarProgramaHtml,
  marcaDaClassificacao,
  nomeDoArquivo,
  ETAPA_DA_FORMATURA,
  type ConvidadosDoAlunoParaImprimir,
  type MarcaDoAluno,
  type TipoDeCertificado,
  type TipoDeFormatura,
} from '@/lib/eventosImpressao';
import {
  marcarCertificadosEmitidos,
  useCheckinDoEvento,
  useConvidadosDoEvento,
  type EventoComResumo,
} from '@/hooks/useEventos';
import { useRevisaoDoEvento } from './useRevisaoDoEvento';
import { entradaDaChegada } from './entradaDaChegada';
import { PreviaDoDocumento } from './PreviaDoDocumento';
import { BotaoComMola, MOLA_CURTA, Segmentado } from './ControlesComMovimento';

/**
 * Documentos do recital — reunião de 08/10/2026 (Recreio + Barra).
 *
 * Os papéis estavam espalhados: programação, folha de palco e planilha dentro da Revisão,
 * certificados dentro do Check-in. Quem procura "imprimir" não pensa em "revisar". Aqui fica
 * tudo que sai do sistema em papel ou arquivo, com o mesmo recorte por bloco.
 *
 * Movimento inspirado em uiarc.dev (botão que afunda ~0,97 numa mola curta, pílula que desliza
 * entre opções), na paleta do sistema. `useReducedMotion` desliga tudo para quem pediu menos
 * movimento — a informação não depende da animação.
 */
export function DocumentosTab({ evento }: { evento: EventoComResumo }) {
  const { blocos, resumo, impedimentos, dadosDaImpressao, carregando, erro } =
    useRevisaoDoEvento(evento);
  const { participacoes, loading: carregandoCheckin, erro: erroCheckin } = useCheckinDoEvento(
    evento.id,
  );
  const { convidados, erro: erroConvidados } = useConvidadosDoEvento(evento.id);

  // `null` = recital inteiro. O recorte é de EXIBIÇÃO: o horário de cada bloco continua sendo
  // o real dentro do recital, porque o cálculo roda sobre a grade completa.
  const [blocoEscolhido, setBlocoEscolhido] = useState<number | null>(null);
  const variosDias = diasDoEvento(evento.data_evento, evento.data_fim).length > 1;

  const semApresentacao = resumo.apresentacoes === 0;

  const abrir = (qual: 'programa' | 'palco') => {
    const apenas = blocoEscolhido ?? undefined;
    const html =
      qual === 'programa'
        ? gerarProgramaHtml(dadosDaImpressao, apenas)
        : gerarFolhaDePalcoHtml(dadosDaImpressao, apenas);
    if (!abrirDocumento(html)) {
      toast.error('O navegador bloqueou a janela. Permita pop-ups para este site e tente de novo.');
    }
  };

  const baixarPlanilha = () => {
    const apenas = blocoEscolhido ?? undefined;
    baixarArquivo(
      nomeDoArquivo(dadosDaImpressao, apenas === undefined ? 'blocos.csv' : 'bloco.csv'),
      gerarPlanilhaCsv(dadosDaImpressao, apenas),
      'text/csv;charset=utf-8',
    );
    toast.success('Planilha baixada. Abre no Excel com dois cliques.');
  };

  /* ── convidados por aluno ── */
  // Agrupado por PESSOA: irmãos que dividem um convidado aparecem os dois, cada um com ele.
  const convidadosPorAluno = useMemo<ConvidadosDoAlunoParaImprimir[]>(() => {
    const porPessoa = new Map<string, ConvidadosDoAlunoParaImprimir>();
    for (const p of participacoes) {
      if (p.status !== 'participa' && p.convidados === 0) continue;
      porPessoa.set(p.pessoa_chave, { aluno: p.nome, leva: p.convidados, convidados: [] });
    }
    for (const c of convidados) {
      for (const chave of c.pessoas) {
        const grupo = porPessoa.get(chave);
        if (grupo) grupo.convidados.push({ nome: c.nome, tipo: c.tipo_entrada, bloco_id: c.bloco_id });
      }
    }
    return [...porPessoa.values()];
  }, [participacoes, convidados]);
  const totalConvidadosComNome = convidados.length;

  const abrirConvidados = () => {
    if (erroConvidados) {
      toast.error(`Não consegui ler os convidados: ${erroConvidados}`);
      return;
    }
    const html = gerarListaDeConvidadosHtml(dadosDaImpressao, convidadosPorAluno, blocoEscolhido ?? undefined);
    if (!abrirDocumento(html)) {
      toast.error('O navegador bloqueou a janela. Permita pop-ups para este site e tente de novo.');
    }
  };

  /* ── certificados ── */
  const lista = useMemo(
    () => montarListaDeChegada(entradaDaChegada(evento, blocos, participacoes)),
    [evento, blocos, participacoes],
  );
  // Marca da PESSOA: a participação cobre quem não subiu ao palco; a grade cobre quem subiu.
  const marcaPorPessoa = useMemo(() => {
    const m = new Map<string, MarcaDoAluno | null>();
    for (const p of participacoes) m.set(p.pessoa_chave, marcaDaClassificacao(p.classificacao));
    for (const b of blocos) {
      for (const a of b.apresentacoes) {
        if (!m.get(a.pessoa_chave)) m.set(a.pessoa_chave, marcaDaClassificacao(a.aluno_classificacao));
      }
    }
    return m;
  }, [participacoes, blocos]);

  const [publicoCert, setPublicoCert] = useState<PublicoDoCertificado>('chegou');
  const recebem = useMemo(
    () => selecionarParaCertificado(lista.pessoas, publicoCert),
    [lista.pessoas, publicoCert],
  );
  // Um papel por apresentação: quem não subiu conta 1 (o genérico), quem subiu conta os
  // cursos — o número do botão é o número de folhas que saem da impressora.
  const totalCertificados = useMemo(
    () => recebem.reduce((s, p) => s + Math.max(1, p.apresentacoes.length), 0),
    [recebem],
  );

  /* ── formatura: um certificado por formando ── */
  const formaturaPorPessoa = useMemo(
    () => new Map(participacoes.map((p) => [p.pessoa_chave, p.formatura_tipo] as const)),
    [participacoes],
  );
  const [publicoFormatura, setPublicoFormatura] = useState<PublicoDoCertificado>('todos');
  const formandos = useMemo(
    () =>
      selecionarParaCertificado(lista.pessoas, publicoFormatura).filter((p) =>
        Boolean(formaturaPorPessoa.get(p.pessoaChave)),
      ),
    [lista.pessoas, publicoFormatura, formaturaPorPessoa],
  );
  const formandosPorEtapa = useMemo(() => {
    const contagem: Partial<Record<TipoDeFormatura, number>> = {};
    for (const p of formandos) {
      const etapa = formaturaPorPessoa.get(p.pessoaChave);
      if (etapa) contagem[etapa] = (contagem[etapa] ?? 0) + 1;
    }
    return contagem;
  }, [formandos, formaturaPorPessoa]);

  /**
   * Sem ninguém para receber ainda, a PRÉVIA mostra o modelo com um aluno de exemplo — a
   * prévia é para ver o papel (pedido do Hugo, 09/10). Gerar continua exigindo gente de verdade.
   */
  const semNinguem = (tipo: TipoDeCertificado) => (tipo === 'formatura' ? formandos : recebem).length === 0;
  const EXEMPLO = [
    {
      nome: 'Nome do Aluno (exemplo)',
      marca: 'school' as MarcaDoAluno,
      formatura: 'kids' as TipoDeFormatura,
      apresentacoes: [{ apresentacaoId: 0, cursoNome: 'Violão', musica: 'Asa Branca' }],
    },
  ];

  const htmlDosCertificados = (tipo: TipoDeCertificado) => {
    const pessoas = tipo === 'formatura' ? formandos : recebem;
    if (pessoas.length === 0) {
      return gerarCertificadosHtml({ ...dadosDaImpressao, blocos: [] }, EXEMPLO, tipo);
    }
    return gerarCertificadosHtml(
      // O certificado não usa a grade para nada além do repertório, que já vem na lista.
      { ...dadosDaImpressao, blocos: [] },
      pessoas.map((p) => ({
        nome: p.nome,
        marca: marcaPorPessoa.get(p.pessoaChave) ?? null,
        formatura: formaturaPorPessoa.get(p.pessoaChave) ?? null,
        // O apresentacaoId viaja para o certificado_status poder ser gravado depois — sem ele,
        // emitir não deixava marca e a gráfica receberia o mesmo lote duas vezes.
        apresentacoes: p.apresentacoes.map((a) => ({
          apresentacaoId: a.apresentacaoId,
          cursoNome: a.cursoNome,
          musica: a.musica,
        })),
      })),
      tipo,
    );
  };

  /** Qual prévia está aberta. A prévia nunca marca nada como emitido. */
  const [previa, setPrevia] = useState<TipoDeCertificado | null>(null);

  const gerarCertificados = async (tipo: TipoDeCertificado) => {
    if (!abrirDocumento(htmlDosCertificados(tipo))) {
      toast.error('O navegador bloqueou a janela. Permita pop-ups para este site e tente de novo.');
      return;
    }
    setPrevia(null);
    // A marca de emitido é do certificado de PARTICIPAÇÃO (por curso, `certificado_status`).
    // O de formatura não tem coluna própria — gerá-lo não toca nessa marca.
    if (tipo !== 'participacao') return;
    // Marca como emitido DEPOIS da janela abrir: marcar antes de o papel existir deixaria o
    // sistema dizendo "já saiu" de um certificado que o navegador bloqueou.
    const ids = recebem.flatMap((p) =>
      p.apresentacoes.map((a) => a.apresentacaoId).filter((x): x is number => x !== undefined),
    );
    if (ids.length > 0) {
      const { error } = await marcarCertificadosEmitidos(ids);
      if (error) toast.error(`Certificados gerados, mas não gravei a marca de emitido: ${error.message}`);
    }
  };

  const falha = erro ?? erroCheckin;
  if (falha) {
    return (
      <p className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-[13px] text-rose-200">
        Não foi possível carregar os documentos: {falha}
      </p>
    );
  }
  if (carregando || (carregandoCheckin && participacoes.length === 0 && blocos.length === 0)) {
    return <p className="p-8 text-center text-sm text-slate-400">Carregando documentos…</p>;
  }

  const opcoesRecorte = [
    { valor: null as number | null, rotulo: 'Recital inteiro' },
    ...blocos.map((b) => ({
      valor: b.id as number | null,
      // Evento de 2+ dias: dois "Bloco 3" (um por data) só se distinguem pelo dia.
      rotulo: variosDias ? `${b.nome} · ${formatarDataCurta(b.data ?? evento.data_evento)}` : b.nome,
    })),
  ];

  return (
    <div className="space-y-5">
      {/* ── recital: programação, folha, planilha ── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-400 sm:text-[11px]">
              Recital
            </h3>
            <p className="mt-0.5 text-[12px] text-slate-500">
              Abrem numa aba nova, com botão para salvar em PDF. O horário de cada bloco é o
              real dentro do recital, mesmo imprimindo um bloco só.
            </p>
          </div>
        </div>

        {blocos.length > 1 && (
          <Segmentado<number | null>
            rotulo="Imprimir"
            opcoes={opcoesRecorte}
            valor={blocoEscolhido}
            onMudar={setBlocoEscolhido}
          />
        )}

        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <CartaoDocumento
            icone={<FileText className="h-4 w-4" />}
            tom="amber"
            titulo="Programação"
            publico="para a plateia"
            descricao="Ordem das apresentações com horário, aluno, curso e música."
            acao="Abrir"
            desabilitado={semApresentacao}
            onClick={() => abrir('programa')}
          />
          <CartaoDocumento
            icone={<Speaker className="h-4 w-4" />}
            tom="sky"
            titulo="Folha de palco"
            publico="para a produção"
            descricao="O que cada número pede no palco, bloco a bloco."
            acao="Abrir"
            desabilitado={semApresentacao}
            onClick={() => abrir('palco')}
          />
          <CartaoDocumento
            icone={<Table2 className="h-4 w-4" />}
            tom="emerald"
            titulo="Planilha"
            publico="para a equipe"
            descricao="Uma linha por apresentação, para conferir no Excel."
            acao="Baixar"
            desabilitado={semApresentacao}
            onClick={baixarPlanilha}
          />
          <CartaoDocumento
            icone={<Users className="h-4 w-4" />}
            tom="violet"
            titulo="Convidados por aluno"
            publico="para a porta"
            descricao={
              totalConvidadosComNome > 0
                ? `${totalConvidadosComNome} com nome, agrupados por aluno, com caixinha para riscar.`
                : 'Ainda sem nomes — cadastre em Alunos, no botão "nomes".'
            }
            acao="Abrir"
            desabilitado={totalConvidadosComNome === 0 && !convidadosPorAluno.some((g) => g.leva > 0)}
            onClick={abrirConvidados}
          />
        </div>

        {semApresentacao && (
          <p className="text-[12px] text-slate-500">
            Os documentos do recital liberam quando houver apresentação em algum bloco.
          </p>
        )}

        {/* ⚠️ Avisa, nunca BLOQUEIA: imprimir uma prévia com pendência conhecida é uso
            legítimo — quem monta o recital precisa do papel na mão para conferir. */}
        {impedimentos.length > 0 && !semApresentacao && (
          <p className="flex items-start gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/5 px-2.5 py-1.5 text-[12px] text-rose-200/90 sm:text-[11.5px]">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-rose-400" />
            <span>
              {impedimentos.length === 1
                ? 'Há 1 pendência que sai errada no papel'
                : `Há ${impedimentos.length} pendências que saem erradas no papel`}{' '}
              (veja na Revisão) — dá para abrir assim mesmo, é prévia.
            </span>
          </p>
        )}
      </section>

      {/* ── certificados ── */}
      <section className="space-y-3 rounded-2xl border border-slate-700 bg-slate-800/40 p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-400 sm:text-[11px]">
              <Award className="h-3.5 w-3.5 text-amber-400" />
              Certificados de participação
            </h3>
            <p className="mt-0.5 max-w-xl text-[12px] text-slate-500">
              Um por curso, em A4 deitado — quem sobe duas vezes recebe dois. Aluno Kids sai com
              o logo da Kids; os demais, com o da School.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <BotaoComMola
              onClick={() => setPrevia('participacao')}
              desabilitado={false}
              className="border border-slate-600 text-slate-200 hover:bg-slate-700/60"
            >
              <Eye className="h-4 w-4" />
              Ver prévia
            </BotaoComMola>
            <BotaoComMola
              onClick={() => gerarCertificados('participacao')}
              desabilitado={recebem.length === 0}
              className="bg-amber-500 text-slate-950 hover:bg-amber-400"
            >
              <Award className="h-4 w-4" />
              {totalCertificados === 1 ? 'Gerar 1 certificado' : `Gerar ${totalCertificados} certificados`}
            </BotaoComMola>
          </div>
        </div>

        <Segmentado<PublicoDoCertificado>
          rotulo="Emitir para"
          opcoes={[
            { valor: 'chegou' as PublicoDoCertificado, rotulo: `Quem chegou (${lista.resumo.chegaram})` },
            { valor: 'todos' as PublicoDoCertificado, rotulo: `Todos os esperados (${lista.resumo.esperados})` },
          ]}
          valor={publicoCert}
          onMudar={setPublicoCert}
        />

        {/* Diz por que está vazio em vez de só desabilitar: "quem chegou" com zero check-in é o
            estado normal antes do dia, e um botão morto sem explicação parece defeito. */}
        {recebem.length === 0 && (
          <p className="text-[12px] text-amber-200/80 sm:text-[11.5px]">
            {publicoCert === 'chegou'
              ? 'Ninguém com check-in ainda. Marque as chegadas no Check-in ou emita para todos os esperados.'
              : 'Ninguém na lista do dia.'}
          </p>
        )}

        <p className="text-[12px] text-slate-500 sm:text-[11px]">
          Modelo genérico, sem carga horária nem número de registro — o texto ainda vai ser
          definido.
        </p>
      </section>

      {/* ── certificados de formatura ── */}
      <section className="space-y-3 rounded-2xl border border-violet-500/25 bg-violet-500/[0.04] p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-400 sm:text-[11px]">
              <GraduationCap className="h-3.5 w-3.5 text-violet-300" />
              Certificados de formatura
            </h3>
            <p className="mt-0.5 max-w-xl text-[12px] text-slate-500">
              Só para quem tem o selo de formando (aba Alunos). Um por pessoa, com a etapa que ela
              concluiu e a próxima.
            </p>
            {formandos.length > 0 && (
              <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-slate-400">
                {(Object.keys(ETAPA_DA_FORMATURA) as TipoDeFormatura[])
                  .filter((etapa) => formandosPorEtapa[etapa])
                  .map((etapa) => (
                    <span key={etapa}>
                      <strong className="tabular-nums text-violet-200">{formandosPorEtapa[etapa]}</strong>{' '}
                      {etapa === 'kids' ? 'Kids → School' : etapa === 'bebes' ? 'Bebês → Preparatória' : 'formandos'}
                    </span>
                  ))}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <BotaoComMola
              onClick={() => setPrevia('formatura')}
              desabilitado={false}
              className="border border-slate-600 text-slate-200 hover:bg-slate-700/60"
            >
              <Eye className="h-4 w-4" />
              Ver prévia
            </BotaoComMola>
            <BotaoComMola
              onClick={() => gerarCertificados('formatura')}
              desabilitado={formandos.length === 0}
              className="bg-violet-500 text-white hover:bg-violet-400"
            >
              <GraduationCap className="h-4 w-4" />
              {formandos.length === 1 ? 'Gerar 1 certificado' : `Gerar ${formandos.length} certificados`}
            </BotaoComMola>
          </div>
        </div>

        <Segmentado<PublicoDoCertificado>
          rotulo="Emitir para"
          opcoes={[
            { valor: 'todos' as PublicoDoCertificado, rotulo: 'Todos os formandos' },
            { valor: 'chegou' as PublicoDoCertificado, rotulo: 'Formandos que chegaram' },
          ]}
          valor={publicoFormatura}
          onMudar={setPublicoFormatura}
        />

        {formandos.length === 0 && (
          <p className="text-[12px] text-amber-200/80 sm:text-[11.5px]">
            {publicoFormatura === 'chegou'
              ? 'Nenhum formando com check-in ainda.'
              : 'Nenhum formando marcado neste recital. O selo fica na aba Alunos.'}
          </p>
        )}

        <p className="text-[12px] text-slate-500 sm:text-[11px]">
          Modelo genérico: título, etapa concluída e próxima etapa. O texto final ainda vai ser
          definido.
        </p>
      </section>

      <PreviaDoDocumento
        aberto={previa !== null}
        onFechar={() => setPrevia(null)}
        titulo={previa === 'formatura' ? 'Prévia — certificados de formatura' : 'Prévia — certificados de participação'}
        descricao={
          previa && semNinguem(previa)
            ? 'Modelo com um aluno de exemplo — ninguém para receber ainda neste filtro.'
            : previa === 'formatura'
            ? `${formandos.length} ${formandos.length === 1 ? 'certificado' : 'certificados'}, um por formando.`
            : `${totalCertificados} ${totalCertificados === 1 ? 'certificado' : 'certificados'}, um por curso.`
        }
        html={previa ? htmlDosCertificados(previa) : ''}
        acaoGerar={
          previa && !semNinguem(previa) && (
            <BotaoComMola
              onClick={() => gerarCertificados(previa)}
              desabilitado={false}
              className={
                previa === 'formatura'
                  ? 'bg-violet-500 text-white hover:bg-violet-400'
                  : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
              }
            >
              {previa === 'formatura' ? <GraduationCap className="h-4 w-4" /> : <Award className="h-4 w-4" />}
              Gerar e abrir para imprimir
            </BotaoComMola>
          )
        }
      />
    </div>
  );
}

/* ─────────────── peças com movimento ─────────────── */

const TONS = {
  amber: { tile: 'bg-amber-500/15 text-amber-300', borda: 'hover:border-amber-500/40' },
  sky: { tile: 'bg-sky-500/15 text-sky-300', borda: 'hover:border-sky-500/40' },
  emerald: { tile: 'bg-emerald-500/15 text-emerald-300', borda: 'hover:border-emerald-500/40' },
  violet: { tile: 'bg-violet-500/15 text-violet-300', borda: 'hover:border-violet-500/40' },
} as const;

function CartaoDocumento({
  icone,
  tom,
  titulo,
  publico,
  descricao,
  acao,
  desabilitado,
  onClick,
}: {
  icone: ReactNode;
  tom: keyof typeof TONS;
  titulo: string;
  publico: string;
  descricao: string;
  acao: string;
  desabilitado: boolean;
  onClick: () => void;
}) {
  const reduzir = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      // Hover só levanta com ponteiro de mouse: o framer-motion ignora o hover emulado do
      // toque, então o cartão não fica "suspenso" depois de um toque no celular.
      whileHover={reduzir || desabilitado ? undefined : { y: -2 }}
      whileTap={reduzir || desabilitado ? undefined : { scale: 0.97 }}
      transition={MOLA_CURTA}
      className={cn(
        'group flex min-h-[44px] flex-col gap-2 rounded-2xl border border-slate-700 bg-slate-800/40 p-3.5 text-left',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70',
        'disabled:cursor-not-allowed disabled:opacity-45',
        !desabilitado && TONS[tom].borda,
        !desabilitado && 'hover:bg-slate-800/70',
      )}
    >
      <span className="flex items-center gap-2.5">
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', TONS[tom].tile)}>
          {icone}
        </span>
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold text-white">{titulo}</span>
          <span className="block text-[11.5px] text-slate-500">{publico}</span>
        </span>
      </span>
      <span className="text-[12.5px] leading-snug text-slate-400">{descricao}</span>
      <span className="mt-auto flex items-center gap-1 text-[12px] font-medium text-slate-300">
        {acao}
        <ArrowRight
          className={cn(
            'h-3.5 w-3.5 transition-transform duration-200',
            !reduzir && !desabilitado && 'group-hover:translate-x-0.5',
          )}
        />
      </span>
    </motion.button>
  );
}
