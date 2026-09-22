import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, Loader2, Plus, Search, Trash2, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { RegistroLTV } from '@/hooks/useHistoricoLTV';
import {
  CATEGORIAS_SAIDA_LTV,
  acoesDoRegistroLtv,
  filtrarRegistrosLtv,
  formatarMesesLtv,
  ordenarRegistrosLtv,
  validarNovoRegistroLtv,
  type OrdemLtv,
} from '@/lib/historicoLtv';
import { FolhaMobile } from '@/mobile/FolhaMobile';

import { LinhaExAluno } from './LinhaExAluno';

/**
 * A aba Histórico LTV em tela de telefone.
 *
 * O que não atravessa da tela do computador não é o tamanho: é a FORMA. Lá a
 * resposta mora numa matriz de 7 colunas que o olho varre na horizontal; a
 * 390px cinco dessas colunas caem fora da tela, e o que sobra é o nome —
 * justamente a coluna que sozinha não responde nada.
 *
 * Aqui a mesma resposta vira uma linha por pessoa, com os meses à direita, e
 * tudo que era célula editável ou botão de 28px passa para a folha de baixo,
 * com alvo de 44px.
 *
 * ⚠️ Nenhuma regra nasce aqui: filtro, ordem, formato e validação moram em
 * `@/lib/historicoLtv`, e toda escrita usa as funções do `useHistoricoLTV` que
 * o desktop já usa. Reescrever qualquer uma criaria uma segunda definição de
 * quem entra nesta lista.
 */

/** Quantas linhas montam de uma vez; o resto entra ao chegar no fim. */
const LOTE = 40;

const FONTES = [
  // ⚠️ "Todas as fontes", não "Todas": os dois trilhos ficam um sob o outro e
  // dois chips com a MESMA palavra fazem parecer a mesma pergunta repetida.
  { id: 'todos', label: 'Todas as fontes' },
  { id: 'historico', label: 'Histórico' },
  { id: 'sistema', label: 'Sistema' },
] as const;

const ORDENS: ReadonlyArray<{ id: OrdemLtv; label: string }> = [
  { id: 'mais_tempo', label: 'Mais tempo' },
  { id: 'menos_tempo', label: 'Menos tempo' },
  { id: 'nome', label: 'A-Z' },
];

interface Props {
  registros: RegistroLTV[];
  /** Abre o histórico de passagens da pessoa (chave `nome|unidade_id`). */
  onVerPassagens: (chave: string) => void;
  atualizarRegistro: (id: number, campo: string, valor: string | number | null) => Promise<unknown>;
  excluirRegistro: (id: number) => Promise<unknown>;
  adicionarRegistro: (dados: {
    nome: string;
    tempo_permanencia_meses: number;
    categoria_saida: string;
    mes_saida: string | null;
    unidade_id: string | null;
  }) => Promise<unknown>;
  /** Unidade do lançamento manual; `null` no Consolidado, como no desktop. */
  unidadeParaNovo: string | null;
}

export function HistoricoLtvMobile({
  registros,
  onVerPassagens,
  atualizarRegistro,
  excluirRegistro,
  adicionarRegistro,
  unidadeParaNovo,
}: Props) {
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('todos');
  const [fonte, setFonte] = useState<'todos' | 'historico' | 'sistema'>('todos');
  const [ordem, setOrdem] = useState<OrdemLtv>('mais_tempo');
  const [visiveis, setVisiveis] = useState(LOTE);

  const [naFolha, setNaFolha] = useState<RegistroLTV | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);

  const lista = useMemo(
    () => ordenarRegistrosLtv(filtrarRegistrosLtv(registros, { busca, categoria, fonte }), ordem),
    [registros, busca, categoria, fonte, ordem],
  );

  // Voltar ao primeiro lote quando o conjunto muda, senão trocar de recorte
  // mantém centenas de linhas montadas de uma lista que ninguém está vendo.
  useEffect(() => {
    setVisiveis(LOTE);
  }, [busca, categoria, fonte, ordem]);

  const sentinela = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const alvo = sentinela.current;
    if (!alvo) return undefined;
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setVisiveis((n) => (n >= lista.length ? n : n + LOTE));
        }
      },
      { rootMargin: '400px' },
    );
    observador.observe(alvo);
    return () => observador.disconnect();
  }, [lista.length]);

  // A folha relê o registro pela lista: depois de editar, o objeto é outro, e
  // guardar o antigo mostraria o valor velho até alguém fechar e reabrir.
  const registroDaFolha = naFolha ? registros.find((r) => r.id === naFolha.id) ?? naFolha : null;

  return (
    <div className="space-y-3 p-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            aria-hidden="true"
          />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome"
            aria-label="Buscar ex-aluno"
            className="min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-900/70 pl-9 pr-9 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca('')}
              aria-label="Limpar busca"
              className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 active:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setNovoAberto(true)}
          aria-label="Lançar ex-aluno"
          className="flex min-h-[44px] w-11 flex-none items-center justify-center rounded-lg bg-cyan-600 text-white active:bg-cyan-700"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {/* Um trilho por pergunta. Empilhar tudo em linhas fixas custaria três
          faixas de altura antes da primeira linha de dado. */}
      <Trilho rotulo="Categoria de saída">
        <Chip ativo={categoria === 'todos'} onClick={() => setCategoria('todos')}>
          Todas as saídas
        </Chip>
        {CATEGORIAS_SAIDA_LTV.map((c) => (
          <Chip key={c.value} ativo={categoria === c.value} onClick={() => setCategoria(c.value)}>
            {c.label}
          </Chip>
        ))}
      </Trilho>

      <Trilho rotulo="Fonte e ordem">
        {FONTES.map((f) => (
          <Chip key={f.id} ativo={fonte === f.id} onClick={() => setFonte(f.id)}>
            {f.label}
          </Chip>
        ))}
        <span className="mx-0.5 w-px flex-none self-stretch bg-slate-800" aria-hidden="true" />
        {ORDENS.map((o) => (
          <Chip key={o.id} tom="ordem" ativo={ordem === o.id} onClick={() => setOrdem(o.id)}>
            {o.label}
          </Chip>
        ))}
      </Trilho>

      <p className="px-1 text-[11px] leading-relaxed text-slate-500">
        {lista.length === 0
          ? 'Nenhum registro neste recorte'
          : `${lista.length.toLocaleString('pt-BR')} ${lista.length === 1 ? 'ex-aluno' : 'ex-alunos'}`}
        <span className="text-slate-600"> · a partir de 4 meses, sem bolsista, banda e 2º curso</span>
      </p>

      <div>
        {lista.slice(0, visiveis).map((reg) => (
          <LinhaExAluno key={reg.passagem_id ?? reg.id} registro={reg} onAbrir={setNaFolha} />
        ))}
      </div>

      <div ref={sentinela} aria-hidden="true" className="h-1" />
      {visiveis < lista.length && (
        <p className="py-2 text-center text-[11px] text-slate-600">carregando mais…</p>
      )}

      {registroDaFolha && (
        <FolhaAcoes
          registro={registroDaFolha}
          onFechar={() => setNaFolha(null)}
          onVerPassagens={() => {
            onVerPassagens(`${registroDaFolha.nome}|${registroDaFolha.unidade_id}`);
            setNaFolha(null);
          }}
          atualizarRegistro={atualizarRegistro}
          excluirRegistro={excluirRegistro}
        />
      )}

      {novoAberto && (
        <FolhaNovo
          onFechar={() => setNovoAberto(false)}
          adicionarRegistro={adicionarRegistro}
          unidadeParaNovo={unidadeParaNovo}
        />
      )}
    </div>
  );
}

function Trilho({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={rotulo}
      className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 scrollbar-hide [mask-image:linear-gradient(to_right,black_calc(100%-20px),transparent)]"
    >
      {children}
    </div>
  );
}

/**
 * ⚠️ Filtro e ordem NAO podem acender da mesma cor. Eles dividem o segundo
 * trilho, e dois chips azuis lado a lado leem-se como dois filtros ligados —
 * quando um deles nao recorta nada, so muda a ordem da lista.
 */
function Chip({
  ativo,
  onClick,
  children,
  tom = 'filtro',
}: {
  ativo: boolean;
  onClick: () => void;
  children: ReactNode;
  tom?: 'filtro' | 'ordem';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        'min-h-[36px] flex-none whitespace-nowrap rounded-full border px-3 text-[12.5px] font-medium',
        !ativo && 'border-slate-700 bg-slate-800/50 text-slate-400',
        ativo && tom === 'filtro' && 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200',
        ativo && tom === 'ordem' && 'border-slate-500 bg-slate-700/70 text-slate-100',
      )}
    >
      {children}
    </button>
  );
}

/** As ações que no desktop são células editáveis e botões de 28px. */
function FolhaAcoes({
  registro,
  onFechar,
  onVerPassagens,
  atualizarRegistro,
  excluirRegistro,
}: {
  registro: RegistroLTV;
  onFechar: () => void;
  onVerPassagens: () => void;
  atualizarRegistro: Props['atualizarRegistro'];
  excluirRegistro: Props['excluirRegistro'];
}) {
  const acoes = acoesDoRegistroLtv(registro);
  const [mes, setMes] = useState(registro.mes_saida ?? '');
  const [salvando, setSalvando] = useState<string | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  const resumo = [
    `${formatarMesesLtv(registro.tempo_permanencia_meses)} meses`,
    registro.categoria_saida,
    registro.mes_saida,
  ]
    .filter(Boolean)
    .join(' · ');

  async function comSalvamento(marca: string, acao: () => Promise<unknown>) {
    setSalvando(marca);
    try {
      await acao();
    } finally {
      setSalvando(null);
    }
  }

  return (
    <FolhaMobile aberto onFechar={onFechar} titulo={registro.nome} subtitulo={resumo}>
      <div className="flex flex-col gap-2">
        {acoes.verPassagens && (
          <button
            type="button"
            onClick={onVerPassagens}
            className="flex min-h-[44px] items-center justify-between rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 text-sm font-semibold text-violet-200 active:bg-violet-500/20"
          >
            Ver as {registro.qtd_passagens_pessoa} passagens
          </button>
        )}

        {acoes.editar && (
          <>
            <p className="mt-1 px-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Categoria de saída
            </p>
            <div className="flex flex-col gap-1">
              {CATEGORIAS_SAIDA_LTV.map((c) => {
                const atual = registro.categoria_saida === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    disabled={salvando !== null}
                    onClick={() =>
                      comSalvamento(c.value, () => atualizarRegistro(registro.id, 'categoria_saida', c.value))
                    }
                    aria-current={atual ? 'true' : undefined}
                    className={cn(
                      'flex min-h-[44px] items-center justify-between rounded-lg px-3 text-left text-sm disabled:opacity-60',
                      atual ? 'bg-slate-800 font-bold text-cyan-400' : 'font-medium text-slate-300 active:bg-slate-800/60',
                    )}
                  >
                    {c.label}
                    {salvando === c.value ? (
                      <Loader2 className="h-4 w-4 flex-none animate-spin" />
                    ) : (
                      atual && <Check className="h-4 w-4 flex-none" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>

            <p className="mt-2 px-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Mês de saída
            </p>
            <div className="flex gap-2">
              <input
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                placeholder="Abril/2026"
                aria-label="Mês de saída"
                className="min-h-[44px] flex-1 rounded-lg border border-slate-700 bg-slate-900/70 px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
              />
              <button
                type="button"
                disabled={salvando !== null || mes === (registro.mes_saida ?? '')}
                onClick={() =>
                  comSalvamento('mes', () => atualizarRegistro(registro.id, 'mes_saida', mes.trim() || null))
                }
                className="min-h-[44px] flex-none rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 text-sm font-semibold text-cyan-200 disabled:opacity-40"
              >
                {salvando === 'mes' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
              </button>
            </div>
          </>
        )}

        {acoes.excluir && (
          <div className="mt-3 border-t border-slate-800 pt-3">
            {confirmandoExclusao ? (
              <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3">
                {/* ⚠️ O texto diz o que some e que não volta: no desktop a mesma
                    ação abre um diálogo de confirmação, e uma folha sem ele
                    tornaria a exclusão um toque MAIS fácil que no computador. */}
                <p className="text-[12.5px] leading-relaxed text-rose-100">
                  Excluir <strong>{registro.nome}</strong> do histórico? O registro é apagado de vez — não há desfazer.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmandoExclusao(false)}
                    className="min-h-[44px] flex-1 rounded-lg border border-slate-700 text-sm font-semibold text-slate-300"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={salvando !== null}
                    onClick={() =>
                      comSalvamento('excluir', async () => {
                        await excluirRegistro(registro.id);
                        onFechar();
                      })
                    }
                    className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-rose-600 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {salvando === 'excluir' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Excluir'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmandoExclusao(true)}
                className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg border border-rose-500/30 text-sm font-semibold text-rose-300 active:bg-rose-500/10"
              >
                <Trash2 className="h-4 w-4" />
                Excluir registro
              </button>
            )}
          </div>
        )}

        {!acoes.editar && (
          <p className="px-1 text-[12px] leading-relaxed text-slate-500">
            Registro vindo do sistema — ele é derivado das matrículas, então a correção é feita no cadastro do aluno, não
            aqui.
          </p>
        )}
      </div>
    </FolhaMobile>
  );
}

/** O lançamento manual — o "+ Novo" do desktop. */
function FolhaNovo({
  onFechar,
  adicionarRegistro,
  unidadeParaNovo,
}: {
  onFechar: () => void;
  adicionarRegistro: Props['adicionarRegistro'];
  unidadeParaNovo: string | null;
}) {
  const [nome, setNome] = useState('');
  const [tempo, setTempo] = useState('');
  const [categoria, setCategoria] = useState<string>(CATEGORIAS_SAIDA_LTV[0].value);
  const [mesSaida, setMesSaida] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    const veredito = validarNovoRegistroLtv({ nome, tempo, categoria, mes_saida: mesSaida });
    if (!veredito.ok) {
      // O desktop recusa em silêncio (um `return` seco): o modal fica aberto e
      // ninguém diz o que faltou. Aqui a recusa fala.
      setErro(veredito.erro ?? 'Confira os campos.');
      return;
    }
    setSalvando(true);
    try {
      await adicionarRegistro({
        nome: nome.trim(),
        tempo_permanencia_meses: Number.parseInt(tempo, 10),
        categoria_saida: categoria,
        mes_saida: mesSaida.trim() || null,
        unidade_id: unidadeParaNovo,
      });
      onFechar();
    } finally {
      setSalvando(false);
    }
  }

  const campo =
    'min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-900/70 px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none';

  return (
    <FolhaMobile aberto onFechar={onFechar} titulo="Novo ex-aluno" subtitulo="Lançamento manual do histórico">
      <div className="flex flex-col gap-2">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome do ex-aluno"
          aria-label="Nome do ex-aluno"
          className={campo}
        />
        <input
          value={tempo}
          onChange={(e) => setTempo(e.target.value)}
          inputMode="numeric"
          placeholder="Meses de permanência"
          aria-label="Meses de permanência"
          className={campo}
        />
        <input
          value={mesSaida}
          onChange={(e) => setMesSaida(e.target.value)}
          placeholder="Mês de saída (Abril/2026)"
          aria-label="Mês de saída"
          className={campo}
        />

        <div className="flex flex-col gap-1 pt-1">
          {CATEGORIAS_SAIDA_LTV.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategoria(c.value)}
              aria-current={categoria === c.value ? 'true' : undefined}
              className={cn(
                'flex min-h-[44px] items-center justify-between rounded-lg px-3 text-left text-sm',
                categoria === c.value ? 'bg-slate-800 font-bold text-cyan-400' : 'font-medium text-slate-300',
              )}
            >
              {c.label}
              {categoria === c.value && <Check className="h-4 w-4 flex-none" aria-hidden="true" />}
            </button>
          ))}
        </div>

        {erro && (
          <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-200">
            {erro}
          </p>
        )}

        <button
          type="button"
          onClick={salvar}
          disabled={salvando}
          className="mt-1 flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-cyan-600 text-sm font-semibold text-white disabled:opacity-60"
        >
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Lançar'}
        </button>
      </div>
    </FolhaMobile>
  );
}

export default HistoricoLtvMobile;
