import io, sys
A = "/home/mila/.openclaw/workspace/scripts/mila-cutucada.py"
s = io.open(A, encoding="utf-8").read()
if "radar_detectar_matricula_sem_anamnese_v1" in s:
    print("a cutucada ja detecta antes de ler"); sys.exit(0)
DE = "    falhas = 0\n"
PARA = ('''    # ⚠️ DETECTA ANTES DE LER. O detector diario (pg_cron 196) roda as 06:10 e
    #    nao serve para "a matricula acabou de entrar" — o Alf pediu aviso na
    #    hora. Chamar daqui garante a ordem detecta->le sem corrida entre dois
    #    crons, e o custo e uma RPC por hora.
    # ⚠️ Falha aqui NAO derruba a cutucada: sem o detector ela ainda entrega os
    #    sinais que ja existem.
    try:
        r = mp.rpc("radar_detectar_matricula_sem_anamnese_v1", {}) or {}
        if r.get("novos"):
            mp.log(f"{r['novos']} matricula(s) sem anamnese detectada(s) agora")
    except Exception as e:  # noqa: BLE001
        mp.log(f"detector de anamnese falhou ({e}) — sigo com os sinais existentes")

''' + DE)
n = s.count(DE)
assert n == 1, f"ancora falhas=0: esperava 1, achei {n}"
s = s.replace(DE, PARA, 1)
io.open(A, "w", encoding="utf-8", newline="\n").write(s)
print("cutucada passa a detectar antes de ler")
