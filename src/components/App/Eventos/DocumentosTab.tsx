import { useId, useMemo, useState, type ReactNode } from 'react';
import { motion, useReducedMotion, LayoutGroup } from 'framer-motion';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, Award, FileText, Speaker, Table2 } from 'lucide-react';

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
  gerarPlanilhaCsv,
  gerarProgramaHtml,
  marcaDaClassificacao,
  nomeDoArquivo,
  type MarcaDoAluno,
} from '@/lib/eventosImpressao';
import {
  marcarCertificadosEmitidos,
  useCheckinDoEvento,
  type EventoComResumo,
} from '@/hooks/useEventos';
import { useRevisaoDoEvento } from './useRevisaoDoEvento';
import { entradaDaChegada } from './entradaDaChegada';

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

  const abrirCertificados = async () => {
    const html = gerarCertificadosHtml(
      // O certificado não usa a grade para nada além do repertório, que já vem na lista.
      { ...dadosDaImpressao, blocos: [] },
      recebem.map((p) => ({
        nome: p.nome,
        marca: marcaPorPessoa.get(p.pessoaChave) ?? null,
        // O apresentacaoId viaja para o certificado_status poder ser gravado depois — sem ele,
        // emitir não deixava marca e a gráfica receberia o mesmo lote duas vezes.
        apresentacoes: p.apresentacoes.map((a) => ({
          apresentacaoId: a.apresentacaoId,
          cursoNome: a.cursoNome,
          musica: a.musica,
        })),
      })),
    );
    if (!abrirDocumento(html)) {
      toast.error('O navegador bloqueou a janela. Permita pop-ups para este site e tente de novo.');
      return;
    }
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

        <div className="grid gap-2.5 sm:grid-cols-3">
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
          <BotaoComMola
            onClick={abrirCertificados}
            desabilitado={recebem.length === 0}
            className="bg-amber-500 text-slate-950 hover:bg-amber-400"
          >
            <Award className="h-4 w-4" />
            {totalCertificados === 1 ? '1 certificado' : `${totalCertificados} certificados`}
          </BotaoComMola>
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
    </div>
  );
}

/* ─────────────── peças com movimento ─────────────── */

const MOLA_CURTA = { type: 'spring', stiffness: 600, damping: 34, mass: 0.6 } as const;

const TONS = {
  amber: { tile: 'bg-amber-500/15 text-amber-300', borda: 'hover:border-amber-500/40' },
  sky: { tile: 'bg-sky-500/15 text-sky-300', borda: 'hover:border-sky-500/40' },
  emerald: { tile: 'bg-emerald-500/15 text-emerald-300', borda: 'hover:border-emerald-500/40' },
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

function BotaoComMola({
  children,
  onClick,
  desabilitado,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  desabilitado: boolean;
  className?: string;
}) {
  const reduzir = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      whileTap={reduzir || desabilitado ? undefined : { scale: 0.97 }}
      transition={MOLA_CURTA}
      className={cn(
        'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-[13px] font-semibold sm:min-h-[36px]',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
        'disabled:cursor-not-allowed disabled:opacity-45',
        className,
      )}
    >
      {children}
    </motion.button>
  );
}

/**
 * Controle segmentado com a pílula que desliza até a opção escolhida (padrão das abas do
 * uiarc). O `LayoutGroup` com id próprio isola a pílula: dois segmentados na mesma tela não
 * puxam a pílula um do outro.
 */
function Segmentado<T extends string | number | null>({
  rotulo,
  opcoes,
  valor,
  onMudar,
}: {
  rotulo: string;
  opcoes: { valor: T; rotulo: string }[];
  valor: T;
  onMudar: (v: T) => void;
}) {
  const id = useId();
  const reduzir = useReducedMotion();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[12px] text-slate-500 sm:text-[11px]">{rotulo}:</span>
      <LayoutGroup id={id}>
        <div
          role="radiogroup"
          aria-label={rotulo}
          className="flex max-w-full flex-wrap gap-0.5 rounded-xl border border-slate-700 bg-slate-900/60 p-0.5"
        >
          {opcoes.map((o) => {
            const ativo = o.valor === valor;
            return (
              <button
                key={String(o.valor)}
                type="button"
                role="radio"
                aria-checked={ativo}
                onClick={() => onMudar(o.valor)}
                className={cn(
                  'relative min-h-[40px] rounded-lg px-3 text-[12.5px] transition-colors sm:min-h-[30px] sm:text-[12px]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70',
                  ativo ? 'text-amber-100' : 'text-slate-400 hover:text-slate-200',
                )}
              >
                {ativo && (
                  <motion.span
                    layoutId="pilula"
                    transition={reduzir ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 38 }}
                    className="absolute inset-0 rounded-lg bg-amber-500/20 ring-1 ring-amber-500/40"
                  />
                )}
                <span className="relative">{o.rotulo}</span>
              </button>
            );
          })}
        </div>
      </LayoutGroup>
    </div>
  );
}
