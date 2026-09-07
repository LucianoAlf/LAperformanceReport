# Prova hora a hora, DIA A DIA, que script e cron concordam.
HORA_ABRE, FECHA_SEMANA, FECHA_SABADO = 8, 21, 17
CRON = {**{d: range(11, 24) for d in range(0, 5)},   # seg-sex UTC 11-23
        5: range(11, 20),                             # sabado UTC 11-19
        6: range(0)}                                  # domingo: nenhum
DIAS = ["seg","ter","qua","qui","sex","sab","dom"]
ok = True
for d in range(7):
    fecha = 0 if d >= 6 else (FECHA_SABADO if d == 5 else FECHA_SEMANA)
    for h in range(24):
        script = (HORA_ABRE <= h < fecha)
        # ⚠️ a conversao BRT->UTC pode virar o dia; o cron dispara no dia UTC.
        h_utc, vira = (h + 3) % 24, (h + 3) >= 24
        d_cron = (d + 1) % 7 if vira else d
        cron = h_utc in CRON[d_cron]
        if script != cron:
            ok = False
            print(f"  DIVERGE {DIAS[d]} {h:02d}h BRT: script={script} cron={cron}")
    janela = [h for h in range(24) if HORA_ABRE <= h < fecha]
    print(f"  {DIAS[d]}: {janela[0] if janela else '-'}h..{janela[-1] if janela else '-'}h  ({len(janela)}h)")
print("SCRIPT E CRON CONCORDAM NOS 7 DIAS" if ok else "DIVERGEM")
