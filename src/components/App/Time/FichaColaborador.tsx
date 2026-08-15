import { useState } from 'react';
import { ArrowLeft, Check, Copy, Link2, Loader2, MessageCircle } from 'lucide-react';
import { useFichaColaborador } from '@/hooks/useFichaColaborador';
import { copyTextToClipboard } from '@/lib/clipboard';
import { normalizarTelefone } from '@/lib/normalizarTelefone';
import { formatarDataGeracaoFicha, montarLinkWhatsAppFicha } from '@/lib/fichaLink';
import {
  PERFIS_TEXTOS,
  VALORIZACAO_TEXTOS,
  VALORIZACAO_EVITE,
  PERFIS_COBRAR,
  PERFIL_NOMES,
  VALORIZACAO_NOMES,
  PERFIL_CORES,
  RIDER_CAMPOS,
  FALLBACK_PERFIL,
  FALLBACK_VALORIZACAO,
  FALLBACK_EVITE,
  FALLBACK_COBRAR,
  COR_PADRAO,
  nomeDoValor,
  fraseDoValor,
  corDoPerfil,
  perfilPrimario,
  perfilSecundario,
  valorizacaoPrimaria,
  valorizacaoSecundaria,
  valorizacaoEvite,
  formatarCodinome,
} from '@/data/perfilTextos';
import type { FichaColaborador as FichaType } from './types';
import { differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface FichaColaboradorProps {
  colaboradorId: number;
  onVoltar: () => void;
}

/** Formata a idade da atualização do Rider: 0=hoje, 1=ontem, N=há N dias */
function formatarDiasRider(dias: number): string {
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  return `há ${dias} dias`;
}

export function FichaColaborador({ colaboradorId, onVoltar }: FichaColaboradorProps) {
  const {
    ficha,
    isLoading,
    tokenError,
    emitindoToken,
    emitirLink,
    refetch,
  } = useFichaColaborador(colaboradorId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!ficha) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-slate-400 mb-4">Colaborador não encontrado.</p>
        <button
          onClick={onVoltar}
          className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
        >
          Voltar
        </button>
      </div>
    );
  }

  return (
    <FichaConteudo
      ficha={ficha}
      onVoltar={onVoltar}
      onEmitirLink={emitirLink}
      emitindoToken={emitindoToken}
      tokenError={tokenError}
      onReconsultar={refetch}
    />
  );
}

// ---------------------------------------------------------------------------
// CONTEUDO DA FICHA — segue o prototipo visual
// ---------------------------------------------------------------------------
function FichaConteudo({
  ficha,
  onVoltar,
  onEmitirLink,
  emitindoToken,
  tokenError,
  onReconsultar,
}: {
  ficha: FichaType;
  onVoltar: () => void;
  onEmitirLink: () => Promise<void>;
  emitindoToken: boolean;
  tokenError: Error | null;
  onReconsultar: () => Promise<void>;
}) {
  const nome = ficha.apelido || ficha.nome;
  const cor = corDoPerfil(ficha.temperamento_codinome) || COR_PADRAO;
  const primKey = perfilPrimario(ficha.temperamento_codinome);
  const secKey = perfilSecundario(ficha.temperamento_codinome);
  const valPrim = valorizacaoPrimaria(ficha.valorizacao_codinome);
  const valSec = valorizacaoSecundaria(ficha.valorizacao_codinome);
  const valEvite = valorizacaoEvite(ficha.valorizacao_contagem);

  const textoPerfil = primKey ? (PERFIS_TEXTOS[primKey] ?? FALLBACK_PERFIL) : null;
  const textoValPrim = valPrim ? (VALORIZACAO_TEXTOS[valPrim] ?? FALLBACK_VALORIZACAO) : null;
  const textoValSec = valSec ? (VALORIZACAO_TEXTOS[valSec] ?? FALLBACK_VALORIZACAO) : null;
  const textoCobrar = primKey ? (PERFIS_COBRAR[primKey] ?? FALLBACK_COBRAR) : null;
  const textoEvite = valEvite ? (VALORIZACAO_EVITE[valEvite] ?? FALLBACK_EVITE) : null;

  const temPerfil = !!ficha.temperamento_codinome;
  const contagem = ficha.temperamento_contagem;
  const temContagem = contagem && typeof contagem === 'object' && Object.keys(contagem).length > 0;

  // Rider — agrupar por grupo, so campos preenchidos
  const riderRespostas = ficha.rider_respostas || {};
  const riderGrupos: { grupo: string; campos: { id: string; label: string; valor: string }[] }[] = [];
  const grupoMap: Record<string, number> = {};
  for (const campo of RIDER_CAMPOS) {
    const valor = riderRespostas[campo.id];
    if (valor && valor.trim().length >= 3) {
      if (!(campo.grupo in grupoMap)) {
        grupoMap[campo.grupo] = riderGrupos.length;
        riderGrupos.push({ grupo: campo.grupo, campos: [] });
      }
      riderGrupos[grupoMap[campo.grupo]].campos.push({
        id: campo.id,
        label: campo.label,
        valor: valor.trim(),
      });
    }
  }

  const temRider = riderGrupos.length > 0;
  const riderDias = ficha.rider_updated_at
    ? differenceInDays(new Date(), new Date(ficha.rider_updated_at))
    : null;

  return (
    <div
      className="max-w-[1080px] mx-auto"
      style={{ ['--eu' as string]: cor }}
    >
      {/* Breadcrumb + voltar */}
      <button
        onClick={onVoltar}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="uppercase tracking-wider text-xs">Time{ficha.unidade_nome ? ` · ${ficha.unidade_nome}` : ''}</span>
      </button>

      {/* TOPO: retrato + nome */}
      <div className="flex gap-6 items-end mb-2">
        {/* Retrato */}
        <div
          className="w-[132px] h-[132px] flex-none rounded-2xl overflow-hidden flex items-center justify-center"
          style={{
            background: '#16233a',
            boxShadow: `0 0 0 1px #1f2f4a, 0 0 0 4px ${cor}38`,
          }}
        >
          {ficha.foto_url ? (
            <img
              src={ficha.foto_url}
              alt={nome}
              className="w-full h-full object-cover"
              style={{ objectPosition: '50% 22%' }}
            />
          ) : (
            <span className="text-5xl font-bold" style={{ color: cor }}>
              {nome?.charAt(0).toUpperCase() || '?'}
            </span>
          )}
        </div>

        {/* Identidade */}
        <div className="flex-1 min-w-0 pb-1">
          <h1
            className="font-bold leading-none tracking-tight"
            style={{
              fontFamily: '"Space Grotesk", sans-serif',
              fontSize: 'clamp(2rem, 4.4vw, 2.9rem)',
              letterSpacing: '-0.02em',
            }}
          >
            {nome}
          </h1>
          <p className="text-slate-400 mt-2 text-[.95rem]">
            {ficha.cargo || ficha.tipo || ''}
            {ficha.unidade_nome ? ` · ${ficha.unidade_nome}` : ''}
          </p>

          {/* Tags */}
          <div className="flex flex-wrap gap-2 mt-3.5">
            {temPerfil ? (
            <>
              <span
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border"
                style={{ borderColor: `${cor}55`, color: cor, background: `${cor}12` }}
              >
                {formatarCodinome(ficha.temperamento_codinome)}
              </span>
              {ficha.valorizacao_codinome && (
                <span className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 bg-slate-800/50">
                  {ficha.valorizacao_codinome.split('/').map(p => VALORIZACAO_NOMES[p] || p.charAt(0) + p.slice(1).toLowerCase()).join(' · ')}
                </span>
              )}
            </>
          ) : (
            <span className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-700/50 text-slate-500 bg-slate-800/30">
              Ficha pendente
            </span>
          )}
          </div>
        </div>
      </div>

      {/* REGUA DE DISTRIBUICAO */}
      {temContagem && <ReguaDistribuicao contagem={contagem!} />}

      {/* Se nao tem perfil, mostrar estado vazio e parar */}
      {!temPerfil && (
        <div className="mt-8 p-6 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
          <p className="text-slate-400">
            {nome} ainda não respondeu à Ficha Técnica.
          </p>
          <p className="text-slate-500 text-sm mt-1">
            Quando responder, o perfil e o Rider aparecem aqui.
          </p>
          <FichaLinkAcoes
            ficha={ficha}
            nome={nome}
            onEmitirLink={onEmitirLink}
            emitindoToken={emitindoToken}
            tokenError={tokenError}
            onReconsultar={onReconsultar}
          />
        </div>
      )}

      {/* GRID: coluna esquerda + direita */}
      {temPerfil && (
        <div className="grid gap-[18px] items-start mt-8" style={{ gridTemplateColumns: '1.15fr 0.85fr' }}>
          {/* Media query via classe Tailwind para mobile */}
          <div className="col-span-2 lg:col-span-1 space-y-[18px]">
            {/* BRIEFING */}
            {textoPerfil && textoValPrim && textoCobrar && (
              <Briefing
                nome={nome}
                cor={cor}
                reage={textoPerfil.reage}
                pontoCego={textoPerfil.pontoCego}
                reconhecer={textoValPrim.briefing}
                cobrar={textoCobrar}
              />
            )}

            {/* RIDER */}
            <RiderCard
              cor={cor}
              grupos={riderGrupos}
              temRider={temRider}
              riderDias={riderDias}
              nome={nome}
            />
          </div>

          {/* Coluna direita */}
          <div className="col-span-2 lg:col-span-1 space-y-[18px]">
            {/* PERFIL */}
            {textoPerfil && (
              <PerfilCard
                cor={cor}
                codinome={formatarCodinome(ficha.temperamento_codinome) || ''}
                subtitulo={textoPerfil.subtitulo(PERFIL_NOMES[secKey || ''] || '')}
                forca={textoPerfil.forca}
                escorrego={textoPerfil.escorrego}
              />
            )}

            {/* COMO RECONHECER */}
            {textoValPrim && (
              <ComoReconhecerCard
                cor={cor}
                valPrimNome={VALORIZACAO_NOMES[valPrim || ''] || ''}
                valPrimTexto={textoValPrim.reconhecer}
                valSecNome={valSec ? VALORIZACAO_NOMES[valSec] || '' : ''}
                valSecTexto={textoValSec?.reconhecer || ''}
                eviteNome={valEvite ? VALORIZACAO_NOMES[valEvite] || '' : ''}
                eviteTexto={textoEvite || ''}
              />
            )}

            {/* O QUE ELA PRIORIZA — Bloco D (fit cultural) */}
            {ficha.valores_primario && (
              <ValoresCard
                cor={cor}
                primario={ficha.valores_primario}
                secundario={ficha.valores_secundario}
                sacrificado={ficha.valores_sacrificado}
              />
            )}

            {/* TRABALHO — escondido por enquanto (sem colunas no banco) */}
          </div>
        </div>
      )}

      <p className="mt-8 text-center text-xs text-slate-600">
        LA Music Report · Time
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LINK DA FICHA — emissao idempotente para colaborador existente
// ---------------------------------------------------------------------------
function FichaLinkAcoes({
  ficha,
  nome,
  onEmitirLink,
  emitindoToken,
  tokenError,
  onReconsultar,
}: {
  ficha: FichaType;
  nome: string;
  onEmitirLink: () => Promise<void>;
  emitindoToken: boolean;
  tokenError: Error | null;
  onReconsultar: () => Promise<void>;
}) {
  const [copiado, setCopiado] = useState(false);
  const [erroCopia, setErroCopia] = useState<string | null>(null);
  const status = ficha.ficha_token;
  const telefone = normalizarTelefone(ficha.whatsapp);
  const linkWhatsApp = status?.link
    ? montarLinkWhatsAppFicha(nome.split(' ')[0], telefone, status.link)
    : null;
  const dataGeracao = formatarDataGeracaoFicha(status?.gerado_em ?? null);

  async function copiarLink() {
    if (!status?.link) return;
    const result = await copyTextToClipboard(status.link);
    if (!result.ok) {
      setErroCopia('Não foi possível copiar o link.');
      return;
    }
    setErroCopia(null);
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 2000);
  }

  if (!status) {
    return (
      <div className="mt-5 pt-5 border-t border-slate-800">
        <p className="text-sm text-amber-300">Não foi possível consultar o estado do link.</p>
        <button
          type="button"
          onClick={() => void onReconsultar()}
          className="mt-3 text-sm text-cyan-300 hover:text-cyan-200 underline underline-offset-4"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (status.ja_respondeu) {
    return (
      <div className="mt-5 pt-5 border-t border-slate-800">
        <p className="text-sm text-emerald-300">Esta pessoa já respondeu à Ficha Técnica.</p>
      </div>
    );
  }

  return (
    <div className="mt-5 pt-5 border-t border-slate-800 text-left">
      {tokenError && (
        <p className="mb-3 text-sm text-rose-300" role="alert">{tokenError.message}</p>
      )}

      {!status.link ? (
        <button
          type="button"
          onClick={() => void onEmitirLink()}
          disabled={emitindoToken}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {emitindoToken ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
          {emitindoToken ? 'Gerando link...' : 'Gerar link da Ficha'}
        </button>
      ) : (
        <>
          <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">Link da Ficha Técnica</p>
          <a
            href={status.link}
            target="_blank"
            rel="noreferrer"
            className="block break-all rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2 text-sm font-mono text-cyan-300 hover:text-cyan-200"
          >
            {status.link}
          </a>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copiarLink()}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700"
            >
              {copiado ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
              {copiado ? 'Copiado!' : 'Copiar link'}
            </button>
            <button
              type="button"
              onClick={() => linkWhatsApp && window.open(linkWhatsApp, '_blank', 'noopener,noreferrer')}
              disabled={!linkWhatsApp}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-emerald-700/60 bg-emerald-900/30 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-900/50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <MessageCircle className="w-4 h-4" />
              Abrir WhatsApp
            </button>
          </div>

          {dataGeracao && <p className="mt-2 text-xs text-slate-500">Gerado em {dataGeracao}</p>}
          {!telefone && <p className="mt-2 text-xs text-slate-500">WhatsApp não cadastrado — botão desabilitado.</p>}
          {erroCopia && <p className="mt-2 text-xs text-rose-300" role="alert">{erroCopia}</p>}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// REGUA DE DISTRIBUICAO
// ---------------------------------------------------------------------------
function ReguaDistribuicao({ contagem }: { contagem: Record<string, number> }) {
  const entries = Object.entries(contagem).filter(([, v]) => v > 0);
  if (entries.length === 0) return null;
  const total = entries.reduce((s, [, v]) => s + v, 0);

  return (
    <div className="mt-12 mb-14">
      <div className="flex h-2.5 rounded-md overflow-hidden gap-0.5">
        {entries.map(([key, val]) => {
          const cor = PERFIL_CORES[key] || '#5c7093';
          return (
            <div
              key={key}
              className="transition-all duration-400"
              style={{ flex: val, background: cor }}
            />
          );
        })}
      </div>
      <div className="flex mt-2 text-xs text-slate-500 uppercase tracking-wider">
        {entries.map(([key, val]) => {
          const cor = PERFIL_CORES[key] || '#5c7093';
          return (
            <span key={key} className="flex justify-center gap-1" style={{ flex: val }}>
              <b className="font-semibold" style={{ color: cor }}>
                {PERFIL_NOMES[key] || key}
              </b>
              <span>{val}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BRIEFING — "Antes de falar com {nome}"
// ---------------------------------------------------------------------------
function Briefing({
  nome,
  cor,
  reage,
  pontoCego,
  reconhecer,
  cobrar,
}: {
  nome: string;
  cor: string;
  reage: string;
  pontoCego: string;
  reconhecer: string;
  cobrar: string;
}) {
  return (
    <div
      className="rounded-2xl p-5 border"
      style={{
        background: `linear-gradient(180deg, ${cor}1f, #111c2e)`,
        borderColor: `${cor}57`,
      }}
    >
      <div
        className="text-[.7rem] font-bold uppercase tracking-[.18em] flex items-center gap-2.5 mb-4"
        style={{ color: cor }}
      >
        Antes de falar com {nome}
        <span className="flex-1 h-px" style={{ background: `${cor}42` }} />
      </div>

      <p className="text-[1.02rem] leading-relaxed" dangerouslySetInnerHTML={{ __html: reage }} />
      <p className="text-[1.02rem] leading-relaxed mt-3" dangerouslySetInnerHTML={{ __html: pontoCego }} />
      <p className="text-[1.02rem] leading-relaxed mt-3" dangerouslySetInnerHTML={{ __html: reconhecer }} />
      <p className="text-[1.02rem] leading-relaxed mt-3" dangerouslySetInnerHTML={{ __html: cobrar }} />

      <div className="mt-4 pt-3.5 border-t border-slate-700/50 text-xs text-slate-500">
        Montado a partir do perfil, da linguagem de valorização e do Rider. É o mesmo texto que os agentes recebem.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RIDER
// ---------------------------------------------------------------------------
function RiderCard({
  cor,
  grupos,
  temRider,
  riderDias,
  nome,
}: {
  cor: string;
  grupos: { grupo: string; campos: { id: string; label: string; valor: string }[] }[];
  temRider: boolean;
  riderDias: number | null;
  nome: string;
}) {
  return (
    <div className="rounded-2xl p-5 bg-slate-900/60 border border-slate-800">
      <div className="text-[.7rem] font-bold uppercase tracking-[.18em] text-slate-500 flex items-center gap-2.5 mb-4">
        Meu Rider · escrito por {nome}
        <span className="flex-1 h-px bg-slate-800" />
      </div>

      {temRider ? (
        <>
          {grupos.map((g, gi) => (
            <div key={g.grupo} className={gi > 0 ? 'mt-5 pt-4.5 border-t border-slate-800' : ''}>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-[.12em] mb-3">
                {g.grupo}
              </h4>
              {g.campos.map((c) => (
                <div key={c.id} className="mb-3.5">
                  <div className="text-sm text-slate-400 mb-1">{c.label}</div>
                  <div
                    className="pl-3.5 text-slate-200 text-[.94rem]"
                    style={{ borderLeft: `2px solid ${cor}8c` }}
                  >
                    {c.valor}
                  </div>
                </div>
              ))}
            </div>
          ))}

          <div className="mt-4.5 flex items-center gap-2 text-xs text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-none" />
            {riderDias !== null
              ? `Atualizado por ${nome.split(' ')[0].toLowerCase()} ${formatarDiasRider(riderDias)} · sempre editável`
              : 'Sempre editável'}
          </div>
        </>
      ) : (
        <div className="py-8 text-center">
          <p className="text-slate-400 text-sm">
            {nome} ainda não preencheu o Rider.
          </p>
          <p className="text-slate-500 text-xs mt-1">
            Quando preencher, aparece aqui como citação.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PERFIL
// ---------------------------------------------------------------------------
function PerfilCard({
  cor,
  codinome,
  subtitulo,
  forca,
  escorrego,
}: {
  cor: string;
  codinome: string;
  subtitulo: string;
  forca: string;
  escorrego: string;
}) {
  return (
    <div className="rounded-2xl p-5 bg-slate-900/60 border border-slate-800">
      <div className="text-[.7rem] font-bold uppercase tracking-[.18em] text-slate-500 flex items-center gap-2.5 mb-4">
        Perfil
        <span className="flex-1 h-px bg-slate-800" />
      </div>

      <div
        className="text-2xl font-bold tracking-tight"
        style={{ fontFamily: '"Space Grotesk", sans-serif', color: cor }}
      >
        {codinome}
      </div>
      <div className="text-slate-400 text-sm mt-0.5 mb-4">{subtitulo}</div>

      <div className="flex gap-3 items-baseline mb-2 text-sm">
        <span className="w-[74px] flex-none text-slate-500 text-xs uppercase tracking-wider">Força</span>
        <span className="text-slate-200">{forca}</span>
      </div>
      <div className="flex gap-3 items-baseline text-sm">
        <span className="w-[74px] flex-none text-slate-500 text-xs uppercase tracking-wider">Escorrego</span>
        <span className="text-slate-200">{escorrego}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// COMO RECONHECER
// ---------------------------------------------------------------------------
function ComoReconhecerCard({
  cor,
  valPrimNome,
  valPrimTexto,
  valSecNome,
  valSecTexto,
  eviteNome,
  eviteTexto,
}: {
  cor: string;
  valPrimNome: string;
  valPrimTexto: string;
  valSecNome: string;
  valSecTexto: string;
  eviteNome: string;
  eviteTexto: string;
}) {
  return (
    <div className="rounded-2xl p-5 bg-slate-900/60 border border-slate-800">
      <div className="text-[.7rem] font-bold uppercase tracking-[.18em] text-slate-500 flex items-center gap-2.5 mb-4">
        Como reconhecer
        <span className="flex-1 h-px bg-slate-800" />
      </div>

      <div className="flex gap-3 items-start py-3">
        <span
          className="text-xs font-bold text-slate-500 pt-0.5 w-14 flex-none tracking-wider"
          style={{ fontFamily: '"Space Grotesk", sans-serif' }}
        >
          1º
        </span>
        <div>
          <b className="block text-slate-200 font-semibold mb-0.5">{valPrimNome}</b>
          <span className="text-slate-400 text-sm">{valPrimTexto}</span>
        </div>
      </div>

      {valSecNome && valSecTexto && (
        <div className="flex gap-3 items-start py-3 border-t border-slate-800">
          <span
            className="text-xs font-bold text-slate-500 pt-0.5 w-14 flex-none tracking-wider"
            style={{ fontFamily: '"Space Grotesk", sans-serif' }}
          >
            2º
          </span>
          <div>
            <b className="block text-slate-200 font-semibold mb-0.5">{valSecNome}</b>
            <span className="text-slate-400 text-sm">{valSecTexto}</span>
          </div>
        </div>
      )}

      {eviteNome && eviteTexto && (
        <div className="flex gap-3 items-start py-3 border-t border-slate-800">
          <span
            className="text-xs font-bold text-slate-500 pt-0.5 w-14 flex-none tracking-wider"
            style={{ fontFamily: '"Space Grotesk", sans-serif' }}
          >
            Evite
          </span>
          <div>
            <b className="block text-slate-200 font-semibold mb-0.5">{eviteNome}</b>
            <span className="text-slate-400 text-sm">{eviteTexto}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// O QUE ELA PRIORIZA — Bloco D (fit cultural)
// ---------------------------------------------------------------------------
function ValoresCard({
  cor,
  primario,
  secundario,
  sacrificado,
}: {
  cor: string;
  primario: string;
  secundario: string | null;
  sacrificado: string | null;
}) {
  // Blindagem: chave fora dos mapas (CORAGEM/EMPATIA/EXCELENCIA/PAIXAO) mostra
  // fallback em vez de derrubar o bloco — mesmo padrão dos FALLBACK_* do perfil.
  const corSegura = cor || COR_PADRAO;
  const primNome = nomeDoValor(primario);
  const secNome = nomeDoValor(secundario);
  const sacrNome = nomeDoValor(sacrificado);
  const primFrase = fraseDoValor(primario);
  const secFrase = fraseDoValor(secundario);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <h3
        className="text-xs font-bold uppercase tracking-wider mb-4"
        style={{ color: corSegura, fontFamily: '"Space Grotesk", sans-serif' }}
      >
        O que ela prioriza
      </h3>

      {/* Priorizado */}
      <div className="flex gap-3 items-start py-2">
        <span
          className="text-xs font-bold pt-0.5 w-14 flex-none tracking-wider"
          style={{ fontFamily: '"Space Grotesk", sans-serif', color: corSegura }}
        >
          1º
        </span>
        <div>
          <b className="block text-slate-200 font-semibold mb-0.5">{primNome}</b>
          <span className="text-slate-400 text-sm">{primFrase}</span>
        </div>
      </div>

      {secundario && (
        <div className="flex gap-3 items-start py-2 border-t border-slate-800">
          <span
            className="text-xs font-bold text-slate-500 pt-0.5 w-14 flex-none tracking-wider"
            style={{ fontFamily: '"Space Grotesk", sans-serif' }}
          >
            2º
          </span>
          <div>
            <b className="block text-slate-200 font-semibold mb-0.5">{secNome}</b>
            <span className="text-slate-400 text-sm">{secFrase}</span>
          </div>
        </div>
      )}

      {/* Sacrificado — destaque menor */}
      {sacrificado && (
        <div className="flex gap-3 items-start py-2 border-t border-slate-800">
          <span
            className="text-xs font-bold text-slate-600 pt-0.5 w-14 flex-none tracking-wider"
            style={{ fontFamily: '"Space Grotesk", sans-serif' }}
          >
            Sacrifica
          </span>
          <div>
            <b className="block text-slate-400 font-medium mb-0.5 text-sm">{sacrNome}</b>
          </div>
        </div>
      )}

      {/* Linha de leitura */}
      {primNome && secNome && sacrNome && (
        <p className="mt-4 pt-3 border-t border-slate-800 text-sm text-slate-400 italic">
          Prioriza {primNome} e {secNome}. Quando aperta, sacrifica {sacrNome}.
        </p>
      )}
    </div>
  );
}
