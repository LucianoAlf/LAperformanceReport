#!/usr/bin/env python3
"""Lembrete diario de aviso previo — Sol.

NAO e um relatorio: e um lembrete curto, no espirito do aviso de presenca.
Mostra so a janela de 3 dias — quem encerrou ontem, quem encerra hoje e quem
encerra amanha. Serve para uma coisa so: a recepcao esquece de FINALIZAR a
matricula no Emusys quando o aviso previo acaba e ninguem renova.

Monta uma mensagem por unidade e enfileira em `fila_relatorios_sol_hermes`,
que o `process-sol-report-queue.py` drena a cada minuto.

O QUE ESTE SCRIPT DECIDE, E O QUE ELE NAO DECIDE
------------------------------------------------
A RPC `aviso_previo_pendencias(unidade)` devolve quem esta na janela. O veredito
de "essa matricula ainda esta ativa?" e feito AQUI, consultando
`GET /matriculas` do Emusys ao vivo. Aviso removido e resolvido pelo webhook
`matricula_aviso_previo_removido`; a API de pull nao expoe o aviso atual.

Por que nao usar o espelho local: `emusys_matriculas_estado_atual` so re-consulta
matricula ATIVA (sync diario, escopo "operacional"); a varredura completa rodou
3x na vida, a ultima em 12/08/2026. Medido em 28/08/2026: das 7 "pendencias" que
o espelho apontava, 2 ja estavam concluidas e 2 eram alunos que renovaram. Ligar
o cron em cima do espelho faria a Sol cobrar 4 conclusoes erradas no 1o dia.

⚠️ Aviso previo NAO e consultavel na API (nao existe endpoint, e `GET /matriculas`
nao tem o campo — matricula com aviso vigente vem `status=ativa`). Portanto este
script NAO infere cancelamento por agenda/presenca. Esses sinais tambem existem
durante um aviso real e produziram falso "parece cancelado" em 05/09/2026.

    inativa .................................. saiu — resolvido, fora da lista
    ativa + contrato comeca DEPOIS do aviso .. renovou — foi retido, fora da lista
    ativa + contrato engloba/antecede ........ aviso vigente — ENTRA na lista

Registro legado sem `emusys_aviso_previo_id` nao permite saber se o aviso ainda
existe na fonte. Ele fica fora da cobranca automatica e aparece no resumo tecnico
como `legado_sem_fonte`; nunca vira pendencia por suposicao.

Autenticacao Emusys segue o contrato oficial por query string `?token=`.

Uso:
    send-aviso-previo-sol.py --dry-run            # so imprime, nao enfileira
    send-aviso-previo-sol.py --destino <jid>      # manda pra um numero, nao pro grupo
    send-aviso-previo-sol.py --send               # producao: grupos cadastrados
"""

import argparse
import http.client
import json
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib import error, parse, request

ENV_CANDIDATES = [
    Path('/opt/LA-Organizer/.env'),
    Path('/home/sol/.openclaw/gateway.systemd.env'),
]
EMUSYS_ENV = Path('/home/sol/.openclaw/secrets/emusys.env')
SUPABASE_FALLBACK_URL = 'https://ouqwbbermlzqqvtqwlul.supabase.co'
QUEUE_TABLE = 'fila_relatorios_sol_hermes'
TIPO_RELATORIO = 'aviso_previo'
EMUSYS_HOST = 'api.emusys.com.br'

TOKEN_POR_UNIDADE = {
    'Campo Grande': 'EMUSYS_TOKEN_CG',
    'Barra': 'EMUSYS_TOKEN_BARRA',
    'Recreio': 'EMUSYS_TOKEN_RECREIO',
}

DIAS = ('segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira',
        'sexta-feira', 'sábado', 'domingo')


# ── infra ────────────────────────────────────────────────────────────────

def load_env_file(path):
    if not path.exists():
        return {}
    valores = {}
    try:
        conteudo = path.read_text(errors='ignore')
    except (PermissionError, OSError):
        return {}
    for raw in conteudo.splitlines():
        linha = raw.strip()
        if not linha or linha.startswith('#') or '=' not in linha:
            continue
        chave, valor = linha.split('=', 1)
        valores[chave.strip()] = valor.strip().strip('"').strip("'")
    return valores


def load_config():
    env = {}
    for path in ENV_CANDIDATES:
        env.update(load_env_file(path))
    env.update(load_env_file(EMUSYS_ENV))
    base = (env.get('LA_REPORT_SUPABASE_URL') or env.get('SUPABASE_URL')
            or SUPABASE_FALLBACK_URL)
    key = (env.get('LA_REPORT_SERVICE_ROLE_KEY')
           or env.get('SUPABASE_SERVICE_ROLE_KEY')
           or env.get('SUPABASE_SERVICE_KEY'))
    if not key:
        raise SystemExit('missing LA_REPORT_SERVICE_ROLE_KEY/SUPABASE_SERVICE_ROLE_KEY')
    return base.rstrip('/'), key, env


def supabase(method, base, key, caminho, body=None, params=None, prefer=None):
    url = f'{base}/rest/v1/{caminho}'
    if params:
        url = f'{url}?{parse.urlencode(params, doseq=True)}'
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode('utf-8')
    req = request.Request(url, data=data, method=method, headers={
        'apikey': key,
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
        'Prefer': prefer or 'return=representation',
    })
    try:
        with request.urlopen(req, timeout=120) as resp:
            texto = resp.read().decode('utf-8')
            return json.loads(texto) if texto else None
    except error.HTTPError as exc:
        detalhe = exc.read().decode('utf-8', errors='replace')[:500]
        raise RuntimeError(f'supabase_http_{exc.code} {caminho}: {detalhe}') from exc


def _emusys_com_retry(token, caminho, timeout=25, tentativas=3):
    """GET Emusys com retry limitado e autenticacao por query string.

    ⚠️ TENTA DE NOVO ANTES DE DESISTIR. Sem isto, medido em 31/08: a rajada de
    consultas dos vencidos fazia a API recusar, `veredito()` caia no fail-safe
    e a mensagem do Recreio cobrava 9 alunos quando so 1 estava pendente -- os
    outros 8 ja tinham saido (`inativa`). Falha de rede nao pode virar cobranca.
    """
    ultimo = None
    for n in range(tentativas):
        if n:
            # 429 e janela de 60s no Emusys (limit=120, window_seconds=60):
            # backoff de meio segundo nao sai do buraco, so gasta tentativa.
            espera = 20.0 if 'emusys_http_429' in str(ultimo) else 0.5 * (2 ** (n - 1))
            time.sleep(espera)
        try:
            return _emusys_uma_vez(token, caminho, timeout)
        except Exception as e:                   # noqa: BLE001 — relancado abaixo
            ultimo = e
    raise ultimo


def emusys_matriculas(token, emusys_aluno_id, timeout=25, tentativas=3):
    caminho = f'/v1/matriculas?aluno_id={emusys_aluno_id}&status=todas&limite=50'
    return _emusys_com_retry(token, caminho, timeout, tentativas)


def emusys_aulas(token, pessoa_id, inicio, fim, timeout=25, tentativas=3):
    """GET /aulas de uma pessoa, SEMPRE com janela de data.

    ⚠️ Sem `data_hora_inicial/final` o endpoint varre a base inteira e leva
    ~9s; com janela responde em ~0,2s (medido 14/07/2026). E `pessoa_id`
    sozinho, sem data, volta VAZIO -- o que pareceria "nao tem aula".
    """
    caminho = (f'/v1/aulas?pessoa_id={pessoa_id}'
               f'&data_hora_inicial={inicio}T00:00:00'
               f'&data_hora_final={fim}T23:59:59&limite=100')
    return _emusys_com_retry(token, caminho, timeout, tentativas)


def _emusys_uma_vez(token, caminho, timeout):
    separador = '&' if '?' in caminho else '?'
    caminho_autenticado = f'{caminho}{separador}{parse.urlencode({"token": token})}'
    conn = http.client.HTTPSConnection(EMUSYS_HOST, timeout=timeout)
    try:
        conn.putrequest('GET', caminho_autenticado)
        conn.putheader('User-Agent', 'sol-aviso-previo/1.0')
        conn.endheaders()
        resp = conn.getresponse()
        corpo = resp.read().decode('utf-8', errors='replace')
        if resp.status != 200:
            raise RuntimeError(f'emusys_http_{resp.status}: {corpo[:300]}')
        return (json.loads(corpo) or {}).get('items') or []
    finally:
        conn.close()


# ── formatacao ───────────────────────────────────────────────────────────

def d(iso):
    if not iso:
        return '—'
    try:
        v = datetime.strptime(iso[:10], '%Y-%m-%d').date()
    except ValueError:
        return iso
    return f'{v.day:02d}/{v.month:02d}'


def d_com_ano(iso):
    """Como d(), mas explicita o ano quando nao e o corrente.

    "16 aulas marcadas até 06/02" faz o leitor ler 06/02 DESTE ano -- uma data
    no passado, o oposto do que a linha afirma. As aulas a frente sao
    justamente as que atravessam o ano.
    """
    if not iso:
        return '—'
    try:
        v = datetime.strptime(iso[:10], '%Y-%m-%d').date()
    except ValueError:
        return iso
    if v.year != datetime.now(timezone.utc).astimezone().year:
        return f'{v.day:02d}/{v.month:02d}/{v.year % 100:02d}'
    return f'{v.day:02d}/{v.month:02d}'


def cabecalho(unidade, hoje):
    return (f'*🔔 Avisos Prévios de Finalização de Matrícula · {unidade}*\n'
            f'_{DIAS[hoje.weekday()]}, {hoje.day:02d}/{hoje.month:02d}_')


def rotulo_datas(itens):
    """A(s) data(s) de saida da secao, para o titulo.

    "Encerrou ontem" sozinho obriga o leitor a calcular que dia foi. Com a data
    no titulo, a secao inteira dispensa data por item -- que era repeticao.
    A secao pode ter mais de uma data: na segunda-feira ela cobre sabado E
    domingo (o cron nao roda domingo).
    """
    datas = sorted({(c.get('fim') or '')[:10] for c in itens if c.get('fim')})
    if not datas:
        return None
    if len(datas) == 1:
        return d(datas[0])
    if len(datas) == 2:
        return f'{d(datas[0])} e {d(datas[1])}'
    return f'{d(datas[0])} a {d(datas[-1])}'


def item(c, marcar_estimada=False, mostrar_data=False, mostrar_evidencia=False):
    """Uma linha da lista.

    ⚠️ NUNCA marcar com `*`: no WhatsApp o asterisco e sintaxe de negrito. Um
    `*` solto depois do nome le como erro de digitacao (foi a 1a reacao do
    Hugo ao ver a mensagem) e ainda pode PAREAR com o asterisco do rodape,
    deixando um trecho da lista em negrito por acidente.
    """
    curso = f" — {c['curso']}" if c.get('curso') else ''
    marca = ' (data estimada)' if (marcar_estimada and c.get('estimada')) else ''
    # Data e evidencia num parenteses SO: "(venceu 30/06) (15 aulas...)" vira
    # ruido visual numa lista que a recepcao le no celular.
    partes = []
    if mostrar_data and c.get('fim'):
        partes.append(f'venceu {d(c.get("fim"))}')
    ev = c.get('evidencia') or {}
    if mostrar_evidencia and ev.get('agendadas'):
        n = ev['agendadas']
        ate = f' até {d_com_ano(ev.get("ultima_agendada"))}' if ev.get('ultima_agendada') else ''
        partes.append(f'{n} aula{"s" if n != 1 else ""} marcada{"s" if n != 1 else ""}{ate}')
    extra = f' ({", ".join(partes)})' if partes else ''
    return f"{c['nome']}{curso}{extra}{marca}"


def bloco(titulo, itens, marcar_estimada=False, data_por_item=False,
          evidencia=False):
    # Datas espalhadas (vencidos de meses diferentes) nao cabem no titulo:
    # "30/06 a 31/07" nao diz de quem e qual. Ai a data vai por item.
    if data_por_item:
        cab = titulo
    else:
        quando = rotulo_datas(itens)
        cab = f'{titulo}, {quando}' if quando else titulo
    linhas = [f'*{cab} · {len(itens)}*']
    for i, c in enumerate(itens, 1):
        linhas.append(f'{i}. {item(c, marcar_estimada, mostrar_data=data_por_item, mostrar_evidencia=evidencia)}')
    return '\n'.join(linhas)


# ── veredito ao vivo ─────────────────────────────────────────────────────

def evidencia_aulas(token, emusys_aluno_id, hoje):
    """Aulas agendadas a frente + ultima presenca, numa chamada so.

    Os DOIS sinais numa requisicao porque `/aulas` ja devolve a presenca de
    cada aluno: pedir a janela que cobre passado recente E futuro sai pelo
    mesmo preco que pedir so o futuro.

    Devolve None quando a consulta falha -- quem chama NAO inventa veredito
    a partir de resposta que nao veio.
    """
    ini = (hoje - timedelta(days=30)).isoformat()
    fim = (hoje + timedelta(days=180)).isoformat()
    try:
        itens = emusys_aulas(token, emusys_aluno_id, ini, fim)
    except Exception as e:                       # noqa: BLE001 — ver docstring
        print(f'[aviso-previo] /aulas falhou aluno={emusys_aluno_id}: '
              f'{type(e).__name__}: {e}', file=sys.stderr)
        return None

    limite = hoje.isoformat()
    agendadas, ultima_agendada, ultima_presenca = 0, None, None
    for a in itens:
        if a.get('cancelada'):
            continue
        dia = (a.get('data_hora_inicio') or '')[:10]
        if not dia:
            continue
        if dia > limite:
            agendadas += 1
            if not ultima_agendada or dia > ultima_agendada:
                ultima_agendada = dia
            continue
        # Aula de turma traz varios alunos: a presenca que importa e a DELE.
        eu = next((al for al in (a.get('alunos') or [])
                   if al.get('id_aluno') == emusys_aluno_id), None)
        if eu and eu.get('presenca') == 'presente':
            if not ultima_presenca or dia > ultima_presenca:
                ultima_presenca = dia
    return {'agendadas': agendadas, 'ultima_agendada': ultima_agendada,
            'ultima_presenca': ultima_presenca}


def veredito(candidato, token, hoje=None):
    """Decide somente o que as fontes sustentam.

    Falha de API e legado sem id do aviso nunca viram cobranca. Quem chama deve
    bloquear o envio da unidade quando houver `falha_consulta`.
    """
    status_local = (candidato.get('status_lareport') or '').lower()
    if status_local in ('evadido', 'inativo', 'trancado'):
        return 'resolvido'
    if not candidato.get('emusys_aviso_previo_id'):
        return 'legado_sem_fonte'
    emusys_aluno_id = candidato.get('emusys_aluno_id')
    if not emusys_aluno_id:
        return 'falha_consulta'
    try:
        itens = emusys_matriculas(token, emusys_aluno_id)
    except Exception as e:                        # noqa: BLE001 — ver docstring
        # Engolir o erro e proposital (nao pode derrubar o lembrete), sumir com
        # ele nao: sem esta linha, throttle do Emusys vira cobranca indevida
        # sem deixar rastro. Foi assim que 8 alunos ja inativos entraram na
        # mensagem do Recreio em 31/08.
        print(f"[aviso-previo] emusys falhou aluno={emusys_aluno_id} "
              f"({candidato.get('nome')}): {type(e).__name__}: {e}",
              file=sys.stderr)
        return 'falha_consulta'
    if not itens:
        return 'falha_consulta'

    # O GET e por aluno e pode devolver varios cursos. O aviso, porem, pertence
    # a uma matricula especifica. Usar "qualquer ativa" faria um segundo curso
    # ou uma renovacao paralela resolver o aviso errado.
    emusys_matricula_id = candidato.get('emusys_matricula_id')
    if not emusys_matricula_id:
        return 'falha_consulta'
    matriculas_alvo = [m for m in itens
                       if str(m.get('id')) == str(emusys_matricula_id)]
    if not matriculas_alvo:
        return 'falha_consulta'

    ativas = [m for m in matriculas_alvo if m.get('status') == 'ativa']
    candidato['matricula_status'] = ('ativa' if ativas
                                     else (matriculas_alvo[0].get('status')
                                           or 'desconhecido'))
    if not ativas:
        # O Emusys ja fechou. Se o LA Report ainda diz "ativo", os dois
        # sistemas discordam — o sync nao pegou a saida, e o aluno segue
        # contando como ativo no relatorio. A acao aqui e o INVERSO da do
        # lembrete: corrigir o LA Report, nao mexer no Emusys.
        if (candidato.get('status_lareport') or '').lower() == 'ativo':
            return 'divergente'
        return 'resolvido'

    fim = (candidato.get('fim') or '')[:10]
    for m in ativas:
        contrato = m.get('contrato_atual') or {}
        inicio = (contrato.get('data_original_primeira_aula') or '')[:10]
        if inicio and fim and inicio > fim:
            return 'resolvido'                    # renovou depois do aviso

    # Matricula ativa nao prova que um aviso foi cancelado. O cancelamento
    # chega pelo webhook de remocao e apaga a movimentacao correspondente.
    return 'cobrar'


def linha_veredito(candidato, situacao):
    """O que a tela do LA Report le -- ela NAO pode perguntar ao Emusys."""
    ev = candidato.get('evidencia') or {}
    return {'movimentacao_id': candidato.get('movimentacao_id'),
            'situacao': situacao,
            'aulas_agendadas': ev.get('agendadas'),
            'ultima_agendada': ev.get('ultima_agendada'),
            'ultima_presenca': ev.get('ultima_presenca'),
            'matricula_status': candidato.get('matricula_status'),
            'verificado_em': datetime.now(timezone.utc).isoformat()}


def publicar_vereditos(base, key, itens):
    """Grava o apurado do dia. NUNCA derruba o lembrete.

    Mesma regra do `followup-metricas.sh`: a peca que observa nao pode
    derrubar a observada. Perder o veredito de um dia e aceitavel -- a tela
    mostra `verificado_em` e o dado velho se denuncia sozinho. Perder EM
    SILENCIO nao e, por isso o log.
    """
    itens = [x for x in itens if x.get('movimentacao_id')]
    if not itens:
        return 0
    try:
        supabase('POST', base, key, 'aviso_previo_veredito', body=itens,
                 params={'on_conflict': 'movimentacao_id'},
                 prefer='resolution=merge-duplicates')
        return len(itens)
    except Exception as e:                       # noqa: BLE001 — ver docstring
        print(f'[aviso-previo] veredito NAO gravado ({len(itens)} itens): '
              f'{type(e).__name__}: {e}', file=sys.stderr)
        return 0


# ── montagem da mensagem ─────────────────────────────────────────────────

def montar(dados, token, hoje):
    janela = dados.get('janela') or []
    vencidos = dados.get('vencidos') or []

    # ⚠️ O cron nao roda domingo. Sem isto, quem encerra no domingo nunca
    # apareceria: na segunda ja seria anteontem e sumiria da janela em silencio.
    inclui_domingo = hoje.weekday() == 0
    limite_passado = hoje - timedelta(days=2 if inclui_domingo else 1)

    encerrou, hoje_, amanha, divergentes, resolvidos = [], [], [], [], 0
    atrasados, vereditos = [], []
    falhas_consulta, legados_sem_fonte = 0, 0
    # `vencidos` entra no MESMO laco: e o veredito ao vivo que impede isto de
    # virar a parede de texto da v1. Medido em 31/08 com este mesmo codigo:
    # 88 vencidos nas 3 unidades -> 3 realmente pendentes (1 por unidade).
    for c in janela + vencidos:
        try:
            fim = datetime.strptime((c.get('fim') or '')[:10], '%Y-%m-%d').date()
        except ValueError:
            continue
        v = veredito(c, token, hoje)
        if v in ('cobrar', 'resolvido', 'divergente'):
            vereditos.append(linha_veredito(c, v))
        # Contrato operacional: 60 req/min por IP, compartilhado com a VPS.
        # Resolvidos locais e legados nao chamam a API; 1,1s protege os demais.
        if v not in ('resolvido', 'legado_sem_fonte'):
            time.sleep(1.1)
        if v == 'resolvido':
            resolvidos += 1
            continue
        if v == 'legado_sem_fonte':
            legados_sem_fonte += 1
            continue
        if v == 'falha_consulta':
            falhas_consulta += 1
            continue
        if v == 'divergente':
            divergentes.append(c)
            continue
        if fim < limite_passado:
            atrasados.append(c)
        elif fim < hoje:
            encerrou.append(c)
        elif fim == hoje:
            hoje_.append(c)
        else:
            amanha.append(c)

    resumo = {'encerrou': len(encerrou), 'hoje': len(hoje_),
              'amanha': len(amanha), 'atrasados': len(atrasados),
              'legados_sem_fonte': legados_sem_fonte,
              'falhas_consulta': falhas_consulta,
              'divergentes': len(divergentes), 'resolvidos': resolvidos}
    if not (encerrou or hoje_ or amanha or atrasados or divergentes):
        return None, resumo, vereditos

    # Quando TODO mundo tem data estimada -- o caso comum, porque aviso
    # lancado pela tela do LA Report nao tem dia exato -- marcar item por item
    # repetiria "(data estimada)" 9 vezes. Uma linha no rodape diz o mesmo.
    # So no caso MISTO a marca precisa ser por item, senao nao da para saber
    # de quem e a ressalva.
    todos = encerrou + hoje_ + amanha + atrasados + divergentes
    algum_estimado = any(c.get('estimada') for c in todos)
    misto = algum_estimado and not all(c.get('estimada') for c in todos)

    blocos = []
    if encerrou:
        titulo = 'Encerrou no fim de semana' if inclui_domingo else 'Encerrou ontem'
        blocos.append(bloco(titulo, encerrou, marcar_estimada=misto))
    if hoje_:
        blocos.append(bloco('Encerra hoje', hoje_, marcar_estimada=misto))
    if amanha:
        blocos.append(bloco('Encerra amanhã', amanha, marcar_estimada=misto))
    if atrasados:
        # Pedido do Luciano (audio de 31/08): "se o pessoal nao finalizar, vai
        # cobrando ate ele finalizar". Antes disto o caso sumia no 2o dia.
        # Vem por ULTIMO: a acao do dia continua sendo a primeira coisa lida.
        blocos.append(bloco('Vencidos — ainda não finalizados', atrasados,
                            marcar_estimada=misto, data_por_item=True))
    if divergentes:
        # Acao INVERSA a das outras secoes: no Emusys ja esta feito, quem
        # esta errado e o LA Report. Por isso vem com o proprio rotulo, e
        # nao somado ao "concluir no Emusys" do rodape.
        # Medido em 28/08: 0 casos em 105 avisos vencidos desde janeiro --
        # esta secao existe para o dia em que o sync quebrar, e ate la nao
        # aparece.
        blocos.append(bloco('Finalizado no Emusys, mas ativo no LA Report',
                            divergentes, marcar_estimada=misto))

    rodape = []
    if encerrou or hoje_ or atrasados:
        # Sem nada vencido, "concluir" mandaria fazer a coisa errada: quem
        # encerra so amanha ainda tem aula hoje.
        rodape.append('*➡️ Concluir a matrícula no Emusys*')
    if atrasados:
        # A data de saida pode ser remarcada no Emusys sem que nada chegue aqui:
        # o webhook `matricula_aviso_previo_editado` existe no catalogo da API
        # desde 03/08/2026 e, em 41 avisos recebidos, NUNCA foi entregue -- e nao
        # ha endpoint de pull que exponha o aviso previo. Sem esta linha a
        # recepcao le "vencido" e vai concluir uma matricula cuja saida a propria
        # escola ja adiou (caso Perola Reis/CG em 10/09/2026: aqui 07/09, no
        # Emusys 14/09). So aparece com a secao de vencidos: quem ainda tem aula
        # nao precisa conferir data nenhuma.
        rodape.append('_Mudou a data no Emusys? Por favor, corrija também em '
                      'Administrativo → Avisos Prévios 🙏_')
    if algum_estimado and not misto:
        rodape.append('_Datas estimadas: o aviso não veio do Emusys, '
                      'então considerei o fim do mês. Confira na ficha._')

    texto = cabecalho(dados['unidade'], hoje) + '\n\n' + '\n\n'.join(blocos)
    if rodape:
        texto += '\n\n' + '\n'.join(rodape)
    return texto, resumo, vereditos


# ── main ─────────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--dry-run', action='store_true', help='imprime, nao enfileira')
    p.add_argument('--send', action='store_true', help='enfileira de verdade')
    p.add_argument('--destino', help='jid unico (teste); sem isso usa os grupos cadastrados')
    p.add_argument('--bridge', metavar='JID',
                   help='TESTE: manda direto pela bridge da Sol (POST /send), sem passar '
                        'pela fila. Existe porque a rota /send-report so aceita grupo da '
                        'allowlist — numero individual leva 403 e cairia no fallback '
                        'UAZAPI, que sai pelo numero da LIA.')
    p.add_argument('--unidade', help='roda so uma unidade, pelo nome')
    p.add_argument('--data', metavar='AAAA-MM-DD',
                   help='TESTE: finge que hoje e esta data, para ver a mensagem de um '
                        'dia que ainda nao chegou. Vale para a janela do banco e para o '
                        'cabecalho — mas a consulta ao Emusys e sempre AO VIVO.')
    args = p.parse_args()

    if not args.dry_run and not args.send:
        raise SystemExit('use --dry-run ou --send')

    base, key, env = load_config()
    if args.data:
        hoje = datetime.strptime(args.data, '%Y-%m-%d').date()
    else:
        hoje = datetime.now(timezone.utc).astimezone().date()

    unidades = supabase('GET', base, key, 'unidades',
                        params={'select': 'id,nome', 'order': 'nome'}) or []
    destinos = supabase('GET', base, key, 'whatsapp_destinatarios_relatorio',
                        params={'select': 'unidade_id,jid,nome,caixa_id,ativo',
                                'tipo': 'eq.relatorio_admin', 'ativo': 'is.true'}) or []
    destino_por_unidade = {x['unidade_id']: x for x in destinos}

    resultado = {'inicio': datetime.now(timezone.utc).isoformat(),
                 'dry_run': args.dry_run, 'unidades': []}

    for u in unidades:
        nome = u['nome']
        if args.unidade and args.unidade.lower() not in nome.lower():
            continue
        chave_token = TOKEN_POR_UNIDADE.get(nome)
        if not chave_token:
            continue
        token = env.get(chave_token)
        if not token:
            resultado['unidades'].append({'unidade': nome, 'status': 'erro',
                                          'motivo': f'{chave_token} ausente'})
            continue

        dados = supabase('POST', base, key, 'rpc/aviso_previo_pendencias',
                         body={'p_unidade_id': u['id'], 'p_ref': args.data})
        texto, resumo, vereditos = montar(dados, token, hoje)
        # `--data` finge o dia e `--dry-run` promete zero escrita: gravar em
        # qualquer dos dois contaminaria a tela com uma execucao de teste.
        if args.data or args.dry_run:
            print(f'[aviso-previo] {nome}: {len(vereditos)} vereditos NAO '
                  f'gravados (execucao de teste)', file=sys.stderr)
        else:
            resumo['vereditos_gravados'] = publicar_vereditos(base, key, vereditos)

        if resumo.get('falhas_consulta'):
            # Relatorio parcial tambem mente: a equipe entende que os ausentes
            # foram resolvidos. Falhou uma consulta, nao enfileira a unidade.
            resultado['unidades'].append({
                'unidade': nome,
                'status': 'erro',
                'motivo': 'consulta Emusys incompleta; mensagem suprimida',
                'resumo': resumo,
            })
            continue

        if texto is None:
            # Silencio no grupo, mas a execucao fica registrada: "nao tinha
            # ninguem" e "o cron morreu" precisam ser distinguiveis depois.
            resultado['unidades'].append({'unidade': nome, 'status': 'sem_conteudo',
                                          'resumo': resumo})
            continue

        if args.bridge:
            corpo = json.dumps({'chatId': args.bridge, 'message': texto},
                               ensure_ascii=False).encode('utf-8')
            req = request.Request('http://127.0.0.1:3000/send', data=corpo,
                                  method='POST',
                                  headers={'Content-Type': 'application/json'})
            with request.urlopen(req, timeout=120) as resp:
                envio = json.loads(resp.read().decode('utf-8'))
            resultado['unidades'].append({'unidade': nome, 'status': 'bridge',
                                          'resumo': resumo,
                                          'message_id': envio.get('messageId')})
            continue

        if args.dry_run:
            print(f'\n===== {nome} =====\n{texto}\n')
            resultado['unidades'].append({'unidade': nome, 'status': 'dry_run',
                                          'resumo': resumo, 'chars': len(texto)})
            continue

        alvo = ({'jid': args.destino, 'nome': 'destino manual', 'caixa_id': None}
                if args.destino else destino_por_unidade.get(u['id']))
        if not alvo:
            resultado['unidades'].append({'unidade': nome, 'status': 'erro',
                                          'motivo': 'sem destinatario cadastrado'})
            continue

        # ⚠️ NAO usar `on_conflict` nesta tabela. O indice unico
        # `idx_fila_sol_hermes_dia_tipo` e PARCIAL (`where status in (...)`) e
        # o Postgres nao consegue inferi-lo pelo ON CONFLICT que o PostgREST
        # monta: devolve `42P10 there is no unique or exclusion constraint
        # matching the ON CONFLICT specification`. Descoberto testando o
        # caminho da fila antes de virar producao -- ate entao todo teste tinha
        # passado pela bridge, e a 1a execucao real teria falhado parecendo
        # "nao tinha ninguem para avisar".
        ja = supabase('GET', base, key, QUEUE_TABLE, params={
            'select': 'id,status',
            'tipo_relatorio': f'eq.{TIPO_RELATORIO}',
            'unidade_id': f'eq.{u["id"]}',
            'jid': f'eq.{alvo["jid"]}',
            'data_dia': f'eq.{hoje.isoformat()}',
            'status': 'in.(sol_pendente,sol_enviando,enviada)',
            'limit': '1',
        }) or []
        if ja:
            resultado['unidades'].append({
                'unidade': nome, 'status': 'ja_enfileirado', 'resumo': resumo,
                'fila_id': ja[0].get('id'), 'fila_status': ja[0].get('status')})
            continue

        linha = supabase('POST', base, key, QUEUE_TABLE, body={
            'tipo_relatorio': TIPO_RELATORIO,
            'origem': 'cron',
            'unidade_id': u['id'],
            'unidade_nome': nome,
            'jid': alvo['jid'],
            'grupo_nome': alvo.get('nome') or nome,
            'texto': texto,
            'metadata': {'resumo': resumo, 'caixa_id': alvo.get('caixa_id')},
        })
        resultado['unidades'].append({
            'unidade': nome, 'status': 'enfileirado', 'resumo': resumo,
            'fila_id': (linha or [{}])[0].get('id'),
        })

    print(json.dumps(resultado, ensure_ascii=False, indent=2))
    if any(x.get('status') == 'erro' for x in resultado['unidades']):
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
