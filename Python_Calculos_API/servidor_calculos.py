from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse
import urllib.request
import threading
import hashlib
import base64
import struct
import socket
import math
import time
import json

# Lista de sockets activos para sincronizar celular y PC en tiempo real
CLIENTES_WS = set()
LOCK_ESTADO = threading.Lock()

CONTADOR_ASTRONAUTAS = 0
CONTADOR_PINES_UNICOS = 0
MAPA_DISPOSITIVO_A_ASTRO = {}

# Coordenadas y radios de los 6 crateres principales obtenidos del mapa MOLA
CRATERES_BASE = [
    {"id": "CR_1", "svgX": 82, "svgY": 70, "radio": 22, "prof": 950},
    {"id": "CR_2", "svgX": 162, "svgY": 118, "radio": 25, "prof": 1200},
    {"id": "CR_3", "svgX": 255, "svgY": 82, "radio": 23, "prof": 1100},
    {"id": "CR_4", "svgX": 115, "svgY": 178, "radio": 20, "prof": 820},
    {"id": "CR_5", "svgX": 215, "svgY": 186, "radio": 22, "prof": 940},
    {"id": "CR_6", "svgX": 318, "svgY": 156, "radio": 23, "prof": 1050}
]

# Nodos principales del mapa (Valle Central, Corredor Norte y Zona Sur)
NODOS_RED_BASE = [
    {"id": "N0", "svgX": 28, "svgY": 125},
    {"id": "C1", "svgX": 72, "svgY": 128},
    {"id": "C2", "svgX": 116, "svgY": 132},
    {"id": "C3", "svgX": 164, "svgY": 162},
    {"id": "C4", "svgX": 212, "svgY": 140},
    {"id": "C5", "svgX": 260, "svgY": 134},
    {"id": "C6", "svgX": 304, "svgY": 114},
    {"id": "C7", "svgX": 344, "svgY": 118},
    {"id": "META", "svgX": 374, "svgY": 122},
    {"id": "S1", "svgX": 52, "svgY": 44},
    {"id": "S2", "svgX": 122, "svgY": 50},
    {"id": "S3", "svgX": 172, "svgY": 54},
    {"id": "S4", "svgX": 214, "svgY": 48},
    {"id": "S5", "svgX": 258, "svgY": 42},
    {"id": "S6", "svgX": 308, "svgY": 68},
    {"id": "S7", "svgX": 348, "svgY": 88},
    {"id": "B1", "svgX": 68, "svgY": 182},
    {"id": "B2", "svgX": 165, "svgY": 204},
    {"id": "B3", "svgX": 268, "svgY": 192},
    {"id": "B4", "svgX": 352, "svgY": 172}
]

# Posiciones iniciales para que los astronautas no aparezcan encimados
PUNTOS_SPAWN_SEGUROS = [
    (28.0, 125.0), (52.0, 44.0), (68.0, 182.0), (72.0, 128.0),
    (122.0, 50.0), (116.0, 132.0), (172.0, 54.0), (164.0, 162.0),
    (214.0, 48.0), (260.0, 134.0)
]

DESTINOS_INICIALES = ["META", "S5", "C4", "B2", "N0"]

# Estado compartido entre el dashboard de la PC y los telefonos conectados
ESTADO_VIVO_COMPARTIDO = {
    "sesion_id": 1,
    "rad": 28.0,
    "rad_x": 200.0,
    "rad_y": 205.0,
    "crateres_extra": [],
    "obstaculos_reportados": [],
    "version_mapa": 1,
    "astronautas": {}
}


# Conecta en segundo plano con ServidorJavaMarte.java (puerto 8081)
def notificar_motor_java_async(rad_val, nodo_origen):
    def _llamar():
        try:
            url = f"http://localhost:8081/api/ruta-marte?tormenta={int(rad_val)}&origen={nodo_origen}"
            urllib.request.urlopen(url, timeout=0.15).read()
        except Exception:
            pass
    threading.Thread(target=_llamar, daemon=True).start()


# Junta los crateres fijos, los de meteoritos y los pines marcados como peligro
def obtener_todos_bloqueos_servidor():
    pines_bloqueantes = [p for p in ESTADO_VIVO_COMPARTIDO["obstaculos_reportados"] if p.get("bloquea", False) is True]
    return CRATERES_BASE + ESTADO_VIVO_COMPARTIDO["crateres_extra"] + pines_bloqueantes


# Revisa si la linea entre dos nodos atraviesa algun crater o zona de peligro
def segmento_toca_bloqueo_srv(x1, y1, x2, y2, bloqueos):
    for b in bloqueos:
        r = (b.get("radio", 16)) * 1.12
        bx, by = b["svgX"], b["svgY"]
        for s in range(13):
            t = s / 12.0
            px = x1 + (x2 - x1) * t
            py = y1 + (y2 - y1) * t
            if math.hypot(px - bx, py - by) < r:
                return True
    return False


# Calcula la ruta mas segura usando A* evitando crateres y el circulo de radiacion
def calcular_ruta_astar_servidor(x_ini, y_ini, destino_id, dest_x_custom=None, dest_y_custom=None):
    bloqueos = obtener_todos_bloqueos_servidor()
    radio_rad = 22.0 + ESTADO_VIVO_COMPARTIDO["rad"] * 0.85
    rad_x = ESTADO_VIVO_COMPARTIDO["rad_x"]
    rad_y = ESTADO_VIVO_COMPARTIDO["rad_y"]

    candidatos = [dict(n) for n in NODOS_RED_BASE]
    # Creamos nodos alrededor de cada crater para poder rodearlos
    for b in bloqueos:
        r_seg = (b.get("radio", 16)) * 1.38
        for k in range(8):
            ang = (k / 8.0) * math.pi * 2.0
            rx = max(20, min(380, int(round(b["svgX"] + math.cos(ang) * r_seg))))
            ry = max(22, min(228, int(round(b["svgY"] + math.sin(ang) * r_seg))))
            candidatos.append({"id": f"{b['id']}_R{k}", "svgX": rx, "svgY": ry})

    if dest_x_custom is not None and dest_y_custom is not None:
        nodo_meta = {"id": destino_id, "svgX": int(round(dest_x_custom)), "svgY": int(round(dest_y_custom))}
        candidatos.append(nodo_meta)
    else:
        nodo_meta = next((n for n in NODOS_RED_BASE if n["id"] == destino_id), NODOS_RED_BASE[8])
        if math.hypot(x_ini - nodo_meta["svgX"], y_ini - nodo_meta["svgY"]) < 18.0:
            nodo_meta = NODOS_RED_BASE[0] if destino_id != "N0" else NODOS_RED_BASE[8]

    nodo_inicio = {"id": "POS_INI", "svgX": int(round(x_ini)), "svgY": int(round(y_ini))}
    activos = [nodo_inicio]
    for n in candidatos:
        if n["id"] != nodo_meta["id"] and math.hypot(n["svgX"] - x_ini, n["svgY"] - y_ini) < 12.0:
            continue
        libre = True
        for b in bloqueos:
            if math.hypot(n["svgX"] - b["svgX"], n["svgY"] - b["svgY"]) <= (b.get("radio", 16)) * 1.18:
                if n["id"] != nodo_meta["id"]:
                    libre = False
                    break
        if libre:
            activos.append(n)

    mapa = {n["id"]: n for n in activos}
    g_score = {n["id"]: float("inf") for n in activos}
    f_score = {n["id"]: float("inf") for n in activos}
    previos = {n["id"]: None for n in activos}
    visitados = set()

    g_score["POS_INI"] = 0.0
    f_score["POS_INI"] = 0.0

    while len(visitados) < len(activos):
        u = None
        min_f = float("inf")
        for nid, val in f_score.items():
            if nid not in visitados and val < min_f:
                min_f = val
                u = nid
        if u is None or u == nodo_meta["id"]:
            break
        visitados.add(u)
        nu = mapa[u]

        for vecino in activos:
            vid = vecino["id"]
            if vid in visitados or vid == u:
                continue
            dist = math.hypot(vecino["svgX"] - nu["svgX"], vecino["svgY"] - nu["svgY"])
            max_dist = 120.0 if (u == "POS_INI" or vid == nodo_meta["id"]) else 88.0
            if dist > max_dist:
                continue
            if segmento_toca_bloqueo_srv(nu["svgX"], nu["svgY"], vecino["svgX"], vecino["svgY"], bloqueos):
                continue

            # Si el nodo cae dentro del rango de radiacion le sumamos costo alto para desviarlo
            pen = 0.0
            if math.hypot(vecino["svgX"] - rad_x, vecino["svgY"] - rad_y) < radio_rad + 20.0:
                pen += 25000.0

            tent = g_score[u] + dist + pen
            if tent < g_score[vid]:
                previos[vid] = u
                g_score[vid] = tent
                f_score[vid] = tent + math.hypot(vecino["svgX"] - nodo_meta["svgX"], vecino["svgY"] - nodo_meta["svgY"])

    ruta = []
    paso = nodo_meta["id"]
    while paso is not None and paso in mapa:
        if paso != "POS_INI":
            ruta.insert(0, mapa[paso])
        paso = previos.get(paso)

    if len(ruta) == 0:
        intermedio = min(NODOS_RED_BASE, key=lambda n: math.hypot(n["svgX"] - x_ini, n["svgY"] - y_ini) + math.hypot(n["svgX"] - nodo_meta["svgX"], n["svgY"] - nodo_meta["svgY"]))
        ruta = [intermedio, nodo_meta]

    return ruta


# Registra cada telefono que entra como un astronauta nuevo (ASTRO_1, ASTRO_2, etc.)
def registrar_dispositivo_unico(device_uuid):
    global CONTADOR_ASTRONAUTAS
    with LOCK_ESTADO:
        if device_uuid and device_uuid in MAPA_DISPOSITIVO_A_ASTRO:
            aid_existente = MAPA_DISPOSITIVO_A_ASTRO[device_uuid]
            if aid_existente in ESTADO_VIVO_COMPARTIDO["astronautas"]:
                return ESTADO_VIVO_COMPARTIDO["astronautas"][aid_existente]

        CONTADOR_ASTRONAUTAS += 1
        num = CONTADOR_ASTRONAUTAS
        aid = f"ASTRO_{num}"
        if device_uuid:
            MAPA_DISPOSITIVO_A_ASTRO[device_uuid] = aid

        paleta_colores = ["#22c55e", "#38bdf8", "#f59e0b", "#d946ef", "#fb7185", "#a3e635", "#2dd4bf", "#c084fc"]
        color_hex = paleta_colores[(num - 1) % len(paleta_colores)]

        sx, sy = PUNTOS_SPAWN_SEGUROS[(num - 1) % len(PUNTOS_SPAWN_SEGUROS)]
        sx = sx + ((num - 1) // len(PUNTOS_SPAWN_SEGUROS)) * 6.0
        destino_ini = DESTINOS_INICIALES[(num - 1) % len(DESTINOS_INICIALES)]

        ruta_inicial = calcular_ruta_astar_servidor(sx, sy, destino_ini)
        sig_wp = ruta_inicial[0] if len(ruta_inicial) > 0 else {"svgX": 374, "svgY": 122}
        rumbo_ini = round((math.atan2(sig_wp["svgX"] - sx, -(sig_wp["svgY"] - sy)) * 180.0 / math.pi + 360.0) % 360.0)

        perfil = {
            "id": aid,
            "numero": num,
            "color": color_hex,
            "x": float(sx),
            "y": float(sy),
            "rumbo": float(rumbo_ini),
            "pitch": -0.22,
            "destino": destino_ini,
            "dest_x_custom": None,
            "dest_y_custom": None,
            "modo_manual": True,
            "vueltas_planeta": 0,
            "nodos_eva": [],
            "ruta_activa_svg": ruta_inicial,
            "sesion_id": ESTADO_VIVO_COMPARTIDO["sesion_id"]
        }
        ESTADO_VIVO_COMPARTIDO["astronautas"][aid] = perfil
        ESTADO_VIVO_COMPARTIDO["version_mapa"] += 1
        notificar_motor_java_async(ESTADO_VIVO_COMPARTIDO["rad"], "N0")
        return perfil


def recalcular_rutas_todos_en_servidor():
    for aid, astro in ESTADO_VIVO_COMPARTIDO["astronautas"].items():
        astro["ruta_activa_svg"] = calcular_ruta_astar_servidor(
            astro["x"], astro["y"], astro.get("destino", "META"),
            astro.get("dest_x_custom"), astro.get("dest_y_custom")
        )


# Guarda el pin verificando que no este duplicado en las mismas coordenadas
def agregar_pin_sin_duplicar(obs, autor_defecto):
    global CONTADOR_PINES_UNICOS
    autor = obs.get("autor") or autor_defecto
    ox = int(round(float(obs.get("svgX", 0))))
    oy = int(round(float(obs.get("svgY", 0))))
    uid_cliente = obs.get("uid_unico", "")

    for existente in ESTADO_VIVO_COMPARTIDO["obstaculos_reportados"]:
        if uid_cliente and existente.get("uid_unico") == uid_cliente:
            return
        if existente.get("autor") == autor and math.hypot(existente.get("svgX", 0) - ox, existente.get("svgY", 0) - oy) <= 4:
            return

    CONTADOR_PINES_UNICOS += 1
    nuevo_pin = {
        "id": f"PIN_{CONTADOR_PINES_UNICOS}",
        "uid_unico": uid_cliente or f"u_{CONTADOR_PINES_UNICOS}_{time.time()}",
        "autor": autor,
        "svgX": ox,
        "svgY": oy,
        "radio": int(obs.get("radio", 16)),
        "etiqueta": obs.get("etiqueta") or f"Hallazgo de {autor} (Sin clasificar)",
        "bloquea": bool(obs.get("bloquea", False)),
        "categoria": "PELIGRO" if obs.get("bloquea") else "INFO"
    }
    ESTADO_VIVO_COMPARTIDO["obstaculos_reportados"].append(nuevo_pin)
    ESTADO_VIVO_COMPARTIDO["version_mapa"] += 1


# Interfaz movil en 3D para los telefonos (con las 2 palancas y flechas en el piso)
HTML_DISPOSITIVO_UNICO_ASTRONAUTA = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Visor EVA Marte</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; -webkit-user-select: none; }
  body, html {
    width: 100vw; height: 100vh; overflow: hidden; background: #000;
    font-family: 'Segoe UI', Roboto, sans-serif; color: #fff; touch-action: none;
  }
  #lienzo3d { position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 1; }

  .overlay-reinicio {
    position: fixed; inset: 0; z-index: 50; background: rgba(5, 8, 15, 0.94);
    display: none; flex-direction: column; align-items: center; justify-content: center;
    gap: 16px; padding: 24px; text-align: center;
  }
  .overlay-reinicio.visible { display: flex; }
  .btn-iniciar-eva {
    background: linear-gradient(180deg, #22c55e 0%, #15803d 100%);
    border: 2px solid #fff; color: #000; font-size: 15px; font-weight: 900;
    padding: 14px 28px; border-radius: 24px; cursor: pointer;
    box-shadow: 0 0 25px rgba(34, 197, 94, 0.8);
  }

  .hud-top-stack {
    position: fixed; top: 8px; left: 8px; right: 8px; z-index: 15;
    display: flex; flex-direction: column; gap: 6px; pointer-events: none;
  }
  .fila-hud {
    display: flex; justify-content: space-between; align-items: center; gap: 6px;
    flex-wrap: wrap; pointer-events: none;
  }
  .grupo-top { display: flex; gap: 6px; align-items: center; pointer-events: auto; flex-wrap: wrap; }

  .badge-mi-astronauta {
    background: rgba(15, 23, 42, 0.92); border: 2px solid #22c55e; color: #fff;
    padding: 6px 13px; border-radius: 18px; font-size: 12px; font-weight: 900;
    display: flex; align-items: center; gap: 7px;
  }
  .dot-mi-color { width: 10px; height: 10px; border-radius: 50%; background: #22c55e; }

  .badge-destino {
    background: rgba(15, 23, 42, 0.90); border: 1.5px solid #fbbf24; color: #fde68a;
    padding: 5px 11px; border-radius: 16px; font-size: 11.5px; font-weight: 800;
  }
  .btn-pin {
    background: linear-gradient(180deg, #0284c7 0%, #0369a1 100%);
    border: 1.5px solid #7dd3fc; color: #fff;
    padding: 6px 12px; border-radius: 16px; font-size: 11px; font-weight: 900;
    box-shadow: 0 0 10px rgba(2, 132, 199, 0.7); cursor: pointer;
  }
  .btn-pin:active { transform: scale(0.94); }
  .btn-top {
    background: rgba(15, 23, 42, 0.86); border: 1.5px solid rgba(255,255,255,0.45);
    color: #fff; padding: 6px 10px; border-radius: 16px; font-size: 11px; font-weight: 800;
    cursor: pointer;
  }

  .hud-estado-ruta {
    align-self: center;
    max-width: 96vw; background: rgba(10, 18, 28, 0.84);
    border: 1px solid rgba(74, 222, 128, 0.75);
    border-radius: 16px; padding: 5px 14px; font-size: 11px; font-weight: 800;
    color: #86efac; pointer-events: none; text-align: center;
    white-space: nowrap; backdrop-filter: blur(4px);
  }

  .alerta-visor {
    align-self: center;
    width: 92%; max-width: 480px; pointer-events: none;
    background: rgba(15, 23, 42, 0.92); border: 2px solid #38bdf8;
    border-radius: 12px; padding: 7px 14px; text-align: center;
    box-shadow: 0 0 20px rgba(56, 189, 248, 0.65); display: none;
  }
  .alerta-visor.peligro {
    background: rgba(185, 28, 28, 0.92); border-color: #fde047;
    box-shadow: 0 0 25px rgba(239, 68, 68, 0.85);
  }
  .alerta-visor.visible { display: block; }
  .titulo-alerta { font-size: 12px; font-weight: 900; color: #fef08a; }
  .sub-alerta { font-size: 10.5px; font-weight: 700; color: #fff; margin-top: 2px; }

  .vignette-rad {
    position: fixed; inset: 0; pointer-events: none; z-index: 4;
    box-shadow: inset 0 0 0px rgba(239, 68, 68, 0); transition: box-shadow 0.2s;
  }

  .zona-palanca {
    position: fixed; bottom: 22px; width: 142px; height: 142px; z-index: 20;
    border-radius: 50%; background: rgba(15, 23, 42, 0.30);
    border: 2px solid rgba(251, 191, 36, 0.50);
    display: flex; align-items: center; justify-content: center; touch-action: none;
  }
  .zona-palanca.activa {
    border-color: #4ade80; background: rgba(20, 83, 45, 0.28);
    box-shadow: 0 0 20px rgba(74, 222, 128, 0.4);
  }
  #palancaIzq { left: 20px; }
  #palancaDer { right: 20px; }

  .anillo-interno {
    width: 84px; height: 84px; border-radius: 50%;
    border: 1px dashed rgba(255, 255, 255, 0.32); pointer-events: none;
  }
  .perilla-consola {
    position: absolute; width: 52px; height: 52px; border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #fbbf24, #d97706);
    border: 2px solid #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.8);
    pointer-events: none; display: flex; align-items: center; justify-content: center;
    font-size: 10.5px; font-weight: 900; color: #000;
  }
  #palancaDer .perilla-consola {
    background: radial-gradient(circle at 35% 35%, #38bdf8, #0284c7); color: #fff;
  }
  .etiqueta-palanca {
    position: absolute; top: -20px; font-size: 10px; font-weight: 900;
    color: #fef08a; text-shadow: 0 2px 4px #000; white-space: nowrap; pointer-events: none;
  }
</style>
</head>
<body>

  <div id="lienzo3d"></div>
  <div class="vignette-rad" id="vignetteRad"></div>

  <div class="overlay-reinicio" id="overlayReinicio">
    <h2 style="color:#fbbf24;">Simulación Reiniciada en el Dashboard</h2>
    <p style="color:#cbd5e1; font-size:14px; max-width:340px;">
      Toca el botón de abajo para registrar nuevamente este dispositivo en el mapa.
    </p>
    <button class="btn-iniciar-eva" onclick="conectarDispositivoComoAstronauta()">
      Iniciar Astronauta en Mapa
    </button>
  </div>

  <div class="hud-top-stack">
    <div class="fila-hud">
      <div class="grupo-top">
        <div class="badge-mi-astronauta" id="badgeMiAstro">
          <div class="dot-mi-color" id="dotMiColor"></div>
          <span id="txtMiAstro">CONECTANDO...</span>
          <small id="txtTotalEnMapa" style="color:#94a3b8;">(1 activo)</small>
        </div>
        <div class="badge-destino" id="lblMiDestino">
          Destino: META
        </div>
      </div>

      <div class="grupo-top">
        <button class="btn-pin" onclick="colocarPinRapido()">Poner Pin Aquí</button>
        <button class="btn-top" onclick="apuntarCamaraARuta()">Mirar Ruta</button>
        <button class="btn-top" onclick="activarFullScreen()">Full</button>
      </div>
    </div>

    <div class="hud-estado-ruta" id="badgeRutaActiva">
      >>> SINCRONIZANDO RUTA CON EL DASHBOARD...
    </div>

    <div class="alerta-visor" id="boxAlerta">
      <div class="titulo-alerta" id="txtTituloAlerta">INFORMACIÓN DE CAMPO</div>
      <div class="sub-alerta" id="txtSubAlerta">Sincronizado con el Dashboard</div>
    </div>
  </div>

  <div class="zona-palanca" id="palancaIzq">
    <div class="etiqueta-palanca">PALANCA 1: CAMINAR</div>
    <div class="anillo-interno"></div>
    <div class="perilla-consola" id="perillaIzq">MOV</div>
  </div>

  <div class="zona-palanca" id="palancaDer">
    <div class="etiqueta-palanca">PALANCA 2: MIRAR POV</div>
    <div class="anillo-interno"></div>
    <div class="perilla-consola" id="perillaDer">POV</div>
  </div>

<script>
  let deviceUuid = sessionStorage.getItem('ares_unique_device_uuid');
  if (!deviceUuid) {
    deviceUuid = 'dev_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now();
    sessionStorage.setItem('ares_unique_device_uuid', deviceUuid);
  }

  const colorBaseMiAstro = new THREE.Color(0x22c55e);
  const colorCurvaCoral = new THREE.Color(0xff6b4a);
  const colorTrabajo = new THREE.Color();

  let miPerfil = {
    id: '', color: '#22c55e',
    x: 28.0, y: 125.0, rumbo: 65.0, pitch: -0.22,
    destino: 'META', vueltas_planeta: 0, nodos_eva: [], ruta_activa_svg: [], sesion_id: 1
  };

  let estadoGlobal = {
    sesion_id: 1, rad: 28.0, rad_x: 200.0, rad_y: 205.0,
    crateres_extra: [], obstaculos_reportados: [], version_mapa: 1,
    astronautas: {}
  };

  let registradoActivo = false;
  let pitchCamaraRad = -0.22;
  let ultimoNodoX = 28.0, ultimoNodoY = 125.0;
  let firmaEscenaLocal = '';
  let avisoTemporal = '';
  let esAvisoPeligro = false;
  let timerAviso = null;
  let curvaRutaActiva3D = null;
  let ultimoPinTimestamp = 0;

  const crateresBase = [
    { id: 'CR_1', svgX: 82, svgY: 70, radio: 22, prof: 950 },
    { id: 'CR_2', svgX: 162, svgY: 118, radio: 25, prof: 1200 },
    { id: 'CR_3', svgX: 255, svgY: 82, radio: 23, prof: 1100 },
    { id: 'CR_4', svgX: 115, svgY: 178, radio: 20, prof: 820 },
    { id: 'CR_5', svgX: 215, svgY: 186, radio: 22, prof: 940 },
    { id: 'CR_6', svgX: 318, svgY: 156, radio: 23, prof: 1050 }
  ];

  function obtenerTodosBloqueosFisicos() {
    const pinesPeligrosos = (estadoGlobal.obstaculos_reportados || []).filter(p => p.bloquea === true);
    return [
      ...crateresBase,
      ...(estadoGlobal.crateres_extra || []),
      ...pinesPeligrosos
    ];
  }

  async function conectarDispositivoComoAstronauta() {
    try {
      const r = await fetch('/api/registrar-astronauta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_uuid: deviceUuid })
      });
      const srvPerfil = await r.json();
      miPerfil = { ...miPerfil, ...srvPerfil };
      registradoActivo = true;
      ultimoNodoX = miPerfil.x;
      ultimoNodoY = miPerfil.y;

      document.getElementById('overlayReinicio').classList.remove('visible');
      document.getElementById('txtMiAstro').innerText = miPerfil.id;
      document.getElementById('dotMiColor').style.background = miPerfil.color;
      document.getElementById('badgeMiAstro').style.borderColor = miPerfil.color;
      document.getElementById('lblMiDestino').innerText = `Destino: ${miPerfil.destino}`;
      colorBaseMiAstro.setStyle(miPerfil.color);

      actualizarCurvaDeFlechasEnSuelo();
      apuntarCamaraARuta();
    } catch (e) {
      setTimeout(conectarDispositivoComoAstronauta, 1000);
    }
  }

  function colocarPinRapido() {
    if (!registradoActivo || !miPerfil.id) return;
    if (Date.now() - ultimoPinTimestamp < 600) return;
    ultimoPinTimestamp = Date.now();

    const radAng = (miPerfil.rumbo * Math.PI) / 180.0;
    const ox = Math.max(22, Math.min(375, Math.round(miPerfil.x + Math.sin(radAng) * 12)));
    const oy = Math.max(25, Math.min(225, Math.round(miPerfil.y - Math.cos(radAng) * 12)));

    const nuevoPin = {
      uid_unico: `uid_${miPerfil.id}_${Date.now()}`,
      autor: miPerfil.id,
      svgX: ox,
      svgY: oy,
      radio: 16,
      etiqueta: `Hallazgo de ${miPerfil.id} (Sin clasificar)`,
      categoria: 'INFO',
      bloquea: false
    };

    avisoTemporal = `Pin colocado. Clasifícalo en la Tableta de [${miPerfil.id}] desde el Dashboard.`;
    esAvisoPeligro = false;
    clearTimeout(timerAviso);
    timerAviso = setTimeout(() => { avisoTemporal = ''; }, 5000);
    transmitirEstadoDispositivo(null, nuevoPin, false);
  }

  let ws = null;
  let enviandoHttp = false;

  function conectarSocket() {
    try {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${location.host}/ws`);
      ws.onmessage = (ev) => aplicarEstadoServidor(JSON.parse(ev.data));
    } catch (e) {}
  }
  conectarSocket();

  function aplicarEstadoServidor(srv) {
    if (!srv || !srv.astronautas) return;

    if (registradoActivo && (srv.sesion_id !== miPerfil.sesion_id || !srv.astronautas[miPerfil.id])) {
      registradoActivo = false;
      miPerfil.id = '';
      limpiarAvataresCompaneros();
      document.getElementById('overlayReinicio').classList.add('visible');
      return;
    }

    const habiaMenosCrateres = (srv.crateres_extra || []).length > (estadoGlobal.crateres_extra || []).length;
    const habiaMenosPines = (srv.obstaculos_reportados || []).length > (estadoGlobal.obstaculos_reportados || []).length;

    estadoGlobal.sesion_id = srv.sesion_id;
    estadoGlobal.rad = srv.rad ?? estadoGlobal.rad;
    estadoGlobal.rad_x = srv.rad_x ?? estadoGlobal.rad_x;
    estadoGlobal.rad_y = srv.rad_y ?? estadoGlobal.rad_y;
    estadoGlobal.astronautas = srv.astronautas;

    const totalConectados = Object.keys(srv.astronautas).length;
    document.getElementById('txtTotalEnMapa').innerText = `(${totalConectados} activo${totalConectados === 1 ? '' : 's'})`;

    const miSrv = srv.astronautas[miPerfil.id];
    if (miSrv) {
      if (miSrv.ruta_activa_svg && miSrv.ruta_activa_svg.length >= 1) {
        miPerfil.ruta_activa_svg = miSrv.ruta_activa_svg;
      }
      if (miSrv.destino && miSrv.destino !== miPerfil.destino) {
        miPerfil.destino = miSrv.destino;
        document.getElementById('lblMiDestino').innerText = `Destino: ${miPerfil.destino}`;
        avisoTemporal = `Nueva ruta asignada hacia [${miPerfil.destino}].`;
        esAvisoPeligro = false;
        clearTimeout(timerAviso);
        timerAviso = setTimeout(() => { avisoTemporal = ''; }, 4500);
      }
      if (!joyIzq.activo && !miSrv.modo_manual) {
        miPerfil.x = miSrv.x;
        miPerfil.y = miSrv.y;
        if (!joyDer.activo) miPerfil.rumbo = miSrv.rumbo;
      }
    }

    if (habiaMenosCrateres) {
      avisoTemporal = 'IMPACTO DE METEORITO: Nuevo cráter activo en el mapa.';
      esAvisoPeligro = true;
      clearTimeout(timerAviso);
      timerAviso = setTimeout(() => { avisoTemporal = ''; }, 5500);
    } else if (habiaMenosPines) {
      const ultP = srv.obstaculos_reportados[srv.obstaculos_reportados.length - 1];
      if (ultP && ultP.autor !== miPerfil.id) {
        avisoTemporal = `[${ultP.autor}] colocó un Pin: "${ultP.etiqueta}"`;
        esAvisoPeligro = ultP.bloquea === true;
        clearTimeout(timerAviso);
        timerAviso = setTimeout(() => { avisoTemporal = ''; }, 5500);
      }
    }

    const antes = estadoGlobal.obstaculos_reportados || [];
    const ahora = srv.obstaculos_reportados || [];
    for (const pNuevo of ahora) {
      const pViejo = antes.find(x => x.id === pNuevo.id);
      if (pViejo && (pViejo.etiqueta !== pNuevo.etiqueta || pViejo.bloquea !== pNuevo.bloquea)) {
        avisoTemporal = pNuevo.bloquea
          ? `Pin ${pNuevo.id} (${pNuevo.autor}) marcado como PELIGRO: "${pNuevo.etiqueta}"`
          : `Pin ${pNuevo.id} (${pNuevo.autor}): "${pNuevo.etiqueta}"`;
        esAvisoPeligro = pNuevo.bloquea === true;
        clearTimeout(timerAviso);
        timerAviso = setTimeout(() => { avisoTemporal = ''; }, 5500);
      }
    }

    const nuevaFirma = JSON.stringify(srv.obstaculos_reportados || []) + '_' + JSON.stringify(srv.crateres_extra || []);
    if (nuevaFirma !== firmaEscenaLocal) {
      firmaEscenaLocal = nuevaFirma;
      estadoGlobal.crateres_extra = srv.crateres_extra || [];
      estadoGlobal.obstaculos_reportados = srv.obstaculos_reportados || [];
      reconstruirCrateresYPines3D();
    }
    actualizarCurvaDeFlechasEnSuelo();
  }

  function transmitirEstadoDispositivo(nuevoNodo, nuevoPin, forzarRecalculo = false) {
    if (!registradoActivo || !miPerfil.id) return;
    const paquete = {
      rol: 'CELULAR',
      astro_id: miPerfil.id,
      x: Math.round(miPerfil.x * 100) / 100,
      y: Math.round(miPerfil.y * 100) / 100,
      rumbo: Math.round(miPerfil.rumbo),
      pitch: Math.round(pitchCamaraRad * 100) / 100,
      vueltas_planeta: miPerfil.vueltas_planeta,
      modo_manual: true,
      recalcular_ruta: forzarRecalculo,
      nuevo_nodo: nuevoNodo || null,
      nuevo_obstaculo: nuevoPin || null
    };

    if (nuevoPin) {
      fetch('/api/fast-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paquete),
        keepalive: true
      }).then(r => r.json()).then(srv => aplicarEstadoServidor(srv)).catch(() => {});
      return;
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(paquete));
    }
    if (!enviandoHttp || nuevoNodo || forzarRecalculo) {
      enviandoHttp = true;
      fetch('/api/fast-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paquete),
        keepalive: true
      }).then(r => r.json()).then(srv => {
        aplicarEstadoServidor(srv);
        enviandoHttp = false;
      }).catch(() => { enviandoHttp = false; });
    }
  }

  setInterval(() => {
    if (registradoActivo && !joyIzq.activo && !joyDer.activo) {
      fetch('/api/fast-sync').then(r => r.json()).then(srv => aplicarEstadoServidor(srv)).catch(() => {});
    }
  }, 160);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8c4f32);
  scene.fog = new THREE.FogExp2(0x9e5938, 0.005);
  scene.add(new THREE.AmbientLight(0xffd8be, 0.92));
  const sol = new THREE.DirectionalLight(0xfff1e0, 1.6);
  sol.position.set(-50, 90, -30);
  scene.add(sol);

  function elevacionBase(x, z) {
    return Math.sin(x * 0.05) * Math.cos(z * 0.05) * 0.6;
  }

  function svgA3D(svgX, svgY) {
    const x = (svgX - 200.0) * 0.5;
    const z = (svgY - 125.0) * 0.5;
    return new THREE.Vector3(x, elevacionBase(x, z), z);
  }

  const cvTex = document.createElement('canvas');
  cvTex.width = 128; cvTex.height = 128;
  const ctxT = cvTex.getContext('2d');
  const imgD = ctxT.createImageData(128, 128);
  for (let i = 0; i < imgD.data.length; i += 4) {
    const v = (Math.random() - 0.5) * 16;
    imgD.data[i] = 196 + v; imgD.data[i+1] = 110 + v * 0.7; imgD.data[i+2] = 70 + v * 0.5; imgD.data[i+3] = 255;
  }
  ctxT.putImageData(imgD, 0, 0);
  const texSuelo = new THREE.CanvasTexture(cvTex);
  texSuelo.wrapS = THREE.RepeatWrapping; texSuelo.wrapT = THREE.RepeatWrapping; texSuelo.repeat.set(8, 8);

  const geoSuelo = new THREE.PlaneGeometry(220, 140, 64, 48);
  geoSuelo.rotateX(-Math.PI / 2);
  const posAttr = geoSuelo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    posAttr.setY(i, elevacionBase(posAttr.getX(i), posAttr.getZ(i)));
  }
  geoSuelo.computeVertexNormals();
  scene.add(new THREE.Mesh(geoSuelo, new THREE.MeshStandardMaterial({ map: texSuelo, roughness: 0.9 })));

  const grupoCrateresYPines3D = new THREE.Group();
  const grupoAvataresCompaneros = new THREE.Group();
  scene.add(grupoCrateresYPines3D);
  scene.add(grupoAvataresCompaneros);

  const mapaAvataresOtros = new Map();

  function limpiarAvataresCompaneros() {
    while (grupoAvataresCompaneros.children.length > 0) {
      grupoAvataresCompaneros.remove(grupoAvataresCompaneros.children[0]);
    }
    mapaAvataresOtros.clear();
  }

  function crearSpriteTexto3D(texto, colorFondo) {
    const cv = document.createElement('canvas');
    cv.width = 340; cv.height = 68;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = colorFondo;
    ctx.fillRect(4, 8, 332, 52);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 8, 332, 52);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 17px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto.slice(0, 34), 170, 34);
    const tex = new THREE.CanvasTexture(cv);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sp.scale.set(6.8, 1.4, 1);
    return sp;
  }

  function obtenerOCrearAvatarCompanero(idComp, colorStr) {
    if (mapaAvataresOtros.has(idComp)) return mapaAvataresOtros.get(idComp);
    const g = new THREE.Group();
    const matC = new THREE.MeshStandardMaterial({ color: new THREE.Color(colorStr || '#38bdf8'), roughness: 0.35 });
    const matV = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.8 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.95, 0.42), matC); torso.position.y = 0.95;
    const casco = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 12), matC); casco.position.y = 1.68;
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.29, 10, 10), matV); visor.position.set(0, 1.69, 0.12);
    const etiq = crearSpriteTexto3D(`${idComp}`, 'rgba(15, 23, 42, 0.9)');
    etiq.position.y = 2.65;
    g.add(torso, casco, visor, etiq);
    grupoAvataresCompaneros.add(g);
    mapaAvataresOtros.set(idComp, g);
    return g;
  }

  function crearPinConDescripcion3D(x, y, z, pinObj) {
    const pinGroup = new THREE.Group();
    const esPeligro = pinObj.bloquea === true;
    const colorP = esPeligro ? 0xef4444 : 0x0ea5e9;
    const emiP = esPeligro ? 0x991b1b : 0x0369a1;

    const aguja = new THREE.Mesh(
      new THREE.CylinderGeometry(0.10, 0.03, 2.6, 10),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.8, roughness: 0.2 })
    );
    aguja.position.y = 1.3;

    const conoPin = new THREE.Mesh(
      new THREE.ConeGeometry(0.75, 1.6, 16),
      new THREE.MeshStandardMaterial({ color: colorP, emissive: emiP, emissiveIntensity: 0.45, roughness: 0.3 })
    );
    conoPin.rotation.x = Math.PI;
    conoPin.position.y = 2.4;

    const cabezaPin = new THREE.Mesh(
      new THREE.SphereGeometry(0.75, 16, 16),
      new THREE.MeshStandardMaterial({ color: colorP, emissive: emiP, emissiveIntensity: 0.45, roughness: 0.3 })
    );
    cabezaPin.position.y = 2.95;

    const aroBase = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.15, 24),
      new THREE.MeshBasicMaterial({ color: esPeligro ? 0xef4444 : 0x38bdf8, side: THREE.DoubleSide })
    );
    aroBase.rotation.x = -Math.PI / 2;
    aroBase.position.y = 0.08;

    const bg = esPeligro ? 'rgba(185, 28, 28, 0.92)' : 'rgba(3, 105, 161, 0.92)';
    const letreroPin = crearSpriteTexto3D(`${pinObj.id} (${pinObj.autor}): ${pinObj.etiqueta || ''}`, bg);
    letreroPin.position.y = 4.3;

    pinGroup.add(aguja, conoPin, cabezaPin, aroBase, letreroPin);
    pinGroup.position.set(x, y, z);
    return pinGroup;
  }

  function crearGeometriaChevronPlano() {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.95);
    shape.lineTo(1.25, -0.35);
    shape.lineTo(0.82, -0.75);
    shape.lineTo(0, 0.12);
    shape.lineTo(-0.82, -0.75);
    shape.lineTo(-1.25, -0.35);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(Math.PI / 2);
    return geo;
  }

  const TOTAL_CHEVRONS = 45;
  const poolChevrons = [];
  const geoChevronShared = crearGeometriaChevronPlano();

  for (let i = 0; i < TOTAL_CHEVRONS; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00ff66, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false
    });
    const mesh = new THREE.Mesh(geoChevronShared, mat);
    mesh.visible = false;
    scene.add(mesh);
    poolChevrons.push({ mesh, mat });
  }

  const domoRadiacion3D = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 18),
    new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.34, side: THREE.DoubleSide })
  );
  scene.add(domoRadiacion3D);

  function reconstruirCrateresYPines3D() {
    while (grupoCrateresYPines3D.children.length > 0) grupoCrateresYPines3D.remove(grupoCrateresYPines3D.children[0]);

    for (const c of [...crateresBase, ...(estadoGlobal.crateres_extra || [])]) {
      const pC = svgA3D(c.svgX, c.svgY);
      const r3D = c.radio * 0.5;
      const esMet = String(c.id).startsWith('CR_M');

      const pozo = new THREE.Mesh(new THREE.CircleGeometry(r3D, 32), new THREE.MeshBasicMaterial({ color: esMet ? 0x991b1b : 0x451a03 }));
      pozo.rotation.x = -Math.PI / 2; pozo.position.set(pC.x, pC.y + 0.08, pC.z);
      grupoCrateresYPines3D.add(pozo);

      const pared = new THREE.Mesh(new THREE.TorusGeometry(r3D, 0.85, 10, 32), new THREE.MeshStandardMaterial({ color: esMet ? 0xef4444 : 0x7c2d12, roughness: 0.85 }));
      pared.rotation.x = Math.PI / 2; pared.position.set(pC.x, pC.y + 0.35, pC.z);
      grupoCrateresYPines3D.add(pared);
    }

    for (const obs of (estadoGlobal.obstaculos_reportados || [])) {
      const pO = svgA3D(obs.svgX, obs.svgY);
      grupoCrateresYPines3D.add(crearPinConDescripcion3D(pO.x, pO.y, pO.z, obs));
    }
  }
  reconstruirCrateresYPines3D();

  function actualizarCurvaDeFlechasEnSuelo() {
    const rutaMia = (miPerfil.ruta_activa_svg || []).filter(n => !String(n.id).startsWith('POS_'));

    const nodosTramo = [{ id: 'PIES', svgX: miPerfil.x, svgY: miPerfil.y }];
    for (let i = 0; i < rutaMia.length; i++) {
      if (i < rutaMia.length - 1 && Math.hypot(rutaMia[i].svgX - miPerfil.x, rutaMia[i].svgY - miPerfil.y) < 10) continue;
      nodosTramo.push(rutaMia[i]);
    }
    if (nodosTramo.length < 2) {
      nodosTramo.push({ id: miPerfil.destino || 'META', svgX: 374, svgY: 122 });
    }

    const bloqueosActivos = obtenerTodosBloqueosFisicos();
    const pts3D = [];
    for (let i = 0; i < nodosTramo.length - 1; i++) {
      const a = nodosTramo[i], b = nodosTramo[i + 1];
      const pasos = 16;
      for (let s = 0; s < pasos; s++) {
        const t = s / pasos;
        let sx = a.svgX + (b.svgX - a.svgX) * t;
        let sy = a.svgY + (b.svgY - a.svgY) * t;
        for (const c of bloqueosActivos) {
          const d = Math.hypot(sx - c.svgX, sy - c.svgY);
          const minR = (c.radio || 16) * 1.25;
          if (d < minR) {
            const ang = Math.atan2(sy - c.svgY, sx - c.svgX);
            sx = c.svgX + Math.cos(ang) * minR;
            sy = c.svgY + Math.sin(ang) * minR;
          }
        }
        const p = svgA3D(sx, sy);
        p.y += 0.14;
        pts3D.push(p);
      }
    }
    const ult = svgA3D(nodosTramo[nodosTramo.length - 1].svgX, nodosTramo[nodosTramo.length - 1].svgY);
    ult.y += 0.14;
    pts3D.push(ult);

    if (pts3D.length >= 2) {
      curvaRutaActiva3D = new THREE.CatmullRomCurve3(pts3D);
    }

    const sig = nodosTramo[1] || nodosTramo[nodosTramo.length - 1];
    const dx = sig.svgX - miPerfil.x;
    const dy = sig.svgY - miPerfil.y;
    const rumboRutaGrados = Math.round(((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360);
    document.getElementById('badgeRutaActiva').innerText =
      `>>> [${miPerfil.id || 'EVA'}] RUTA A [${sig.id}] (${rumboRutaGrados}°) | POV ${Math.round(miPerfil.rumbo)}°`;
  }

  function animarFlechasLineaDeCarrera(tiempoTotal) {
    if (!curvaRutaActiva3D) return;

    const pasoEspaciado = 1.0 / TOTAL_CHEVRONS;
    const desplazamientoSuave = (tiempoTotal * 0.009) % pasoEspaciado;

    for (let i = 0; i < TOTAL_CHEVRONS; i++) {
      const obj = poolChevrons[i];
      const u = (i * pasoEspaciado) + desplazamientoSuave;

      if (u < 0.006 || u > 0.99) {
        obj.mesh.visible = false;
        continue;
      }

      obj.mesh.visible = true;
      const pt = curvaRutaActiva3D.getPointAt(u);
      const tg = curvaRutaActiva3D.getTangentAt(u).normalize();

      const uAdelante = Math.min(0.995, u + 0.045);
      const tgAdelante = curvaRutaActiva3D.getTangentAt(uAdelante).normalize();
      const factorCurva = Math.min(1.0, tg.distanceTo(tgAdelante) * 4.2);

      colorTrabajo.copy(colorBaseMiAstro).lerp(colorCurvaCoral, factorCurva);
      obj.mat.color.copy(colorTrabajo);

      const pulso = 0.78 + 0.22 * Math.sin(tiempoTotal * 1.8 - i * 0.35);
      const fadeFin = Math.min(1.0, (1.0 - u) * 6.0);
      obj.mat.opacity = pulso * fadeFin * 0.92;

      const alturaSuelo = elevacionBase(pt.x, pt.z) + 0.14;
      obj.mesh.position.set(pt.x, alturaSuelo, pt.z);
      obj.mesh.lookAt(pt.x + tg.x, alturaSuelo, pt.z + tg.z);
    }
  }

  function apuntarCamaraARuta() {
    const rutaMia = (miPerfil.ruta_activa_svg || []).filter(n => !String(n.id).startsWith('POS_'));
    const sig = rutaMia.length > 0 ? rutaMia[0] : { svgX: 374, svgY: 122 };
    const dx = sig.svgX - miPerfil.x;
    const dy = sig.svgY - miPerfil.y;
    miPerfil.rumbo = Math.round(((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360);
    pitchCamaraRad = -0.22;
    transmitirEstadoDispositivo(null, null, false);
  }

  const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.15, 350);
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(1);
  document.getElementById('lienzo3d').appendChild(renderer.domElement);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const joyIzq = { el: document.getElementById('palancaIzq'), perilla: document.getElementById('perillaIzq'), idTouch: null, activo: false, dx: 0, dy: 0 };
  const joyDer = { el: document.getElementById('palancaDer'), perilla: document.getElementById('perillaDer'), idTouch: null, activo: false, dx: 0, dy: 0 };
  const maxR = 42;

  function moverStick(stick, cx, cy) {
    const r = stick.el.getBoundingClientRect();
    let dx = cx - (r.left + r.width / 2);
    let dy = cy - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > maxR) { dx = (dx / d) * maxR; dy = (dy / d) * maxR; }
    stick.perilla.style.transform = `translate(${dx}px, ${dy}px)`;
    stick.dx = dx / maxR; stick.dy = dy / maxR;
  }

  function soltarStick(stick) {
    stick.activo = false; stick.idTouch = null; stick.dx = 0; stick.dy = 0;
    stick.perilla.style.transform = 'translate(0px, 0px)';
    stick.el.classList.remove('activa');
  }

  [joyIzq, joyDer].forEach(st => {
    st.el.addEventListener('touchstart', e => {
      e.preventDefault();
      const t = e.changedTouches[0];
      st.idTouch = t.identifier; st.activo = true;
      st.el.classList.add('activa');
      moverStick(st, t.clientX, t.clientY);
    }, { passive: false });
    st.el.addEventListener('mousedown', e => {
      e.preventDefault();
      st.activo = true; st.el.classList.add('activa');
      moverStick(st, e.clientX, e.clientY);
    });
  });

  window.addEventListener('touchmove', e => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (joyIzq.activo && t.identifier === joyIzq.idTouch) moverStick(joyIzq, t.clientX, t.clientY);
      if (joyDer.activo && t.identifier === joyDer.idTouch) moverStick(joyDer, t.clientX, t.clientY);
    }
  }, { passive: false });

  window.addEventListener('touchend', e => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (joyIzq.activo && t.identifier === joyIzq.idTouch) soltarStick(joyIzq);
      if (joyDer.activo && t.identifier === joyDer.idTouch) soltarStick(joyDer);
    }
  });
  window.addEventListener('mousemove', e => {
    if (joyIzq.activo && joyIzq.idTouch === null) moverStick(joyIzq, e.clientX, e.clientY);
    if (joyDer.activo && joyDer.idTouch === null) moverStick(joyDer, e.clientX, e.clientY);
  });
  window.addEventListener('mouseup', () => {
    if (joyIzq.idTouch === null) soltarStick(joyIzq);
    if (joyDer.idTouch === null) soltarStick(joyDer);
  });

  function aplicarFisicaCrateresYBordes(nx, ny) {
    for (const c of obtenerTodosBloqueosFisicos()) {
      const dist = Math.hypot(nx - c.svgX, ny - c.svgY);
      const minSeg = (c.radio || 16) * 1.25;
      if (dist < minSeg) {
        const ang = Math.atan2(ny - c.svgY, nx - c.svgX);
        nx = c.svgX + Math.cos(ang) * minSeg;
        ny = c.svgY + Math.sin(ang) * minSeg;
      }
    }
    let dioVuelta = false;
    if (nx > 382) { nx = 18; dioVuelta = true; }
    else if (nx < 18) { nx = 382; dioVuelta = true; }
    if (ny > 232) { ny = 18; dioVuelta = true; }
    else if (ny < 18) { ny = 232; dioVuelta = true; }

    if (dioVuelta) {
      miPerfil.vueltas_planeta = (miPerfil.vueltas_planeta || 0) + 1;
      ultimoNodoX = nx; ultimoNodoY = ny;
      transmitirEstadoDispositivo(null, null, true);
    }
    return { x: nx, y: ny };
  }

  function activarFullScreen() {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }

  conectarDispositivoComoAstronauta();

  const reloj = new THREE.Clock();
  let acumuladorRed = 0;

  function bucle60FPS() {
    requestAnimationFrame(bucle60FPS);
    const dt = Math.min(0.1, reloj.getDelta());
    const tTotal = reloj.getElapsedTime();
    acumuladorRed += dt;

    if (!registradoActivo) {
      renderer.render(scene, camera);
      return;
    }

    let cambioLocal = false;

    if (joyDer.activo && Math.hypot(joyDer.dx, joyDer.dy) > 0.04) {
      miPerfil.rumbo = (miPerfil.rumbo + joyDer.dx * dt * 58.0 + 360.0) % 360.0;
      pitchCamaraRad = Math.max(-0.60, Math.min(0.40, pitchCamaraRad - joyDer.dy * dt * 1.1));
      cambioLocal = true;
    }

    const radRumbo = (miPerfil.rumbo * Math.PI) / 180.0;
    const dirAdelanteX = Math.sin(radRumbo);
    const dirAdelanteZ = -Math.cos(radRumbo);
    const dirDerechaX = Math.cos(radRumbo);
    const dirDerechaZ = Math.sin(radRumbo);

    const magMov = Math.hypot(joyIzq.dx, joyIzq.dy);
    const caminando = joyIzq.activo && magMov > 0.04;
    if (caminando) {
      const factorPrecision = Math.pow(magMov, 1.35);
      const velHumana = dt * 4.6 * factorPrecision;

      const adelante = -joyIzq.dy / magMov;
      const lateral = joyIzq.dx / magMov;

      const nx = miPerfil.x + (dirAdelanteX * adelante + dirDerechaX * lateral) * velHumana;
      const ny = miPerfil.y + (dirAdelanteZ * adelante + dirDerechaZ * lateral) * velHumana;

      const seguro = aplicarFisicaCrateresYBordes(nx, ny);
      miPerfil.x = seguro.x;
      miPerfil.y = seguro.y;
      cambioLocal = true;
      actualizarCurvaDeFlechasEnSuelo();
    }

    if (cambioLocal && acumuladorRed >= 0.05) {
      acumuladorRed = 0;
      let nodoAuto = null;
      let pedirRecalculo = false;
      if (Math.hypot(miPerfil.x - ultimoNodoX, miPerfil.y - ultimoNodoY) >= 18) {
        ultimoNodoX = Math.round(miPerfil.x);
        ultimoNodoY = Math.round(miPerfil.y);
        nodoAuto = { id: `${miPerfil.id}_N${(miPerfil.nodos_eva || []).length + 1}`, svgX: ultimoNodoX, svgY: ultimoNodoY };
        pedirRecalculo = true;
      }
      transmitirEstadoDispositivo(nodoAuto, null, pedirRecalculo);
    }

    const pos3D = svgA3D(miPerfil.x, miPerfil.y);
    const bob = caminando ? Math.sin(tTotal * 5.5) * 0.045 : 0;
    camera.position.set(pos3D.x, pos3D.y + 1.48 + bob, pos3D.z);

    const mX = camera.position.x + dirAdelanteX * Math.cos(pitchCamaraRad) * 20.0;
    const mZ = camera.position.z + dirAdelanteZ * Math.cos(pitchCamaraRad) * 20.0;
    const mY = camera.position.y + Math.sin(pitchCamaraRad) * 20.0;
    camera.lookAt(mX, mY, mZ);

    const idsConectados = new Set(Object.keys(estadoGlobal.astronautas || {}));
    for (const [idGuardado, meshAv] of mapaAvataresOtros.entries()) {
      if (!idsConectados.has(idGuardado) || idGuardado === miPerfil.id) {
        meshAv.visible = false;
      }
    }
    for (const [idOtro, datosOtro] of Object.entries(estadoGlobal.astronautas || {})) {
      if (idOtro === miPerfil.id) continue;
      const av = obtenerOCrearAvatarCompanero(idOtro, datosOtro.color);
      av.visible = true;
      const pO = svgA3D(datosOtro.x, datosOtro.y);
      av.position.set(pO.x, pO.y, pO.z);
    }

    animarFlechasLineaDeCarrera(tTotal);

    const posRad3D = svgA3D(estadoGlobal.rad_x, estadoGlobal.rad_y);
    const radioRadSvg = 22.0 + estadoGlobal.rad * 0.85;
    const radioRad3D = radioRadSvg * 0.5;
    domoRadiacion3D.position.set(posRad3D.x, posRad3D.y, posRad3D.z);
    domoRadiacion3D.scale.set(radioRad3D, radioRad3D * 0.55, radioRad3D);

    let pinCercano = null;
    for (const p of (estadoGlobal.obstaculos_reportados || [])) {
      if (Math.hypot(miPerfil.x - p.svgX, miPerfil.y - p.svgY) < 28.0) {
        pinCercano = p;
        break;
      }
    }

    const distCentroSvg = Math.hypot(miPerfil.x - estadoGlobal.rad_x, miPerfil.y - estadoGlobal.rad_y);
    const distMetros = Math.max(0, Math.round((distCentroSvg - radioRadSvg) * 0.86));

    const boxAlerta = document.getElementById('boxAlerta');
    const vignette = document.getElementById('vignetteRad');

    if (avisoTemporal) {
      boxAlerta.classList.add('visible');
      boxAlerta.classList.toggle('peligro', esAvisoPeligro);
      document.getElementById('txtTituloAlerta').innerText = avisoTemporal;
      document.getElementById('txtSubAlerta').innerText = 'Sincronizado con el Dashboard y los demás dispositivos.';
    } else if (distCentroSvg < radioRadSvg + 44) {
      boxAlerta.classList.add('visible', 'peligro');
      const intRojo = Math.min(0.85, Math.max(0.25, 1.0 - (distMetros / 42.0)));
      vignette.style.boxShadow = `inset 0 0 75px rgba(239, 68, 68, ${intRojo})`;
      document.getElementById('txtTituloAlerta').innerText = distMetros <= 2
        ? 'ALERTA: DENTRO DE ZONA DE RADIACIÓN. SIGUE TUS FLECHAS PARA SALIR'
        : `ALERTA: RADIACIÓN A ${distMetros}m. DESVÍO ACTIVO`;
      document.getElementById('txtSubAlerta').innerText = 'Sigue la secuencia de flechas luminosas en el piso.';
    } else if (pinCercano) {
      boxAlerta.classList.add('visible');
      boxAlerta.classList.toggle('peligro', pinCercano.bloquea === true);
      document.getElementById('txtTituloAlerta').innerText =
        `${pinCercano.id} (${pinCercano.autor}): "${pinCercano.etiqueta}"`;
      document.getElementById('txtSubAlerta').innerText = pinCercano.bloquea
        ? 'Marcado como Peligro en el Dashboard (Ruta desviada).'
        : 'Punto de Interés informativo en el mapa.';
    } else {
      boxAlerta.classList.remove('visible', 'peligro');
      vignette.style.boxShadow = 'inset 0 0 0px rgba(0,0,0,0)';
    }

    renderer.render(scene, camera);
  }
  bucle60FPS();
</script>
</body>
</html>
"""


# Funciones para leer y enviar tramas del socket en tiempo real
def leer_mensaje_ws(sock):
    try:
        cabecera = sock.recv(2)
        if len(cabecera) < 2:
            return None
        b1, b2 = cabecera[0], cabecera[1]
        if (b1 & 0x0f) == 8:
            return None
        masked = b2 & 0x80
        length = b2 & 0x7f
        if length == 126:
            length = struct.unpack(">H", sock.recv(2))[0]
        elif length == 127:
            length = struct.unpack(">Q", sock.recv(8))[0]
        mask = sock.recv(4) if masked else None
        datos = bytearray()
        while len(datos) < length:
            paquete = sock.recv(length - len(datos))
            if not paquete:
                return None
            datos.extend(paquete)
        if masked:
            datos = bytearray(datos[i] ^ mask[i % 4] for i in range(length))
        return datos.decode("utf-8", errors="ignore")
    except Exception:
        return None


def enviar_frame_ws(sock, texto):
    datos = texto.encode("utf-8")
    n = len(datos)
    frame = bytearray([0x81])
    if n < 126:
        frame.append(n)
    elif n < 65536:
        frame.append(126)
        frame.extend(struct.pack(">H", n))
    else:
        frame.append(127)
        frame.extend(struct.pack(">Q", n))
    frame.extend(datos)
    sock.sendall(frame)


def difundir_ws():
    mensaje = json.dumps(ESTADO_VIVO_COMPARTIDO, ensure_ascii=False)
    with LOCK_ESTADO:
        caidos = []
        for c in CLIENTES_WS:
            try:
                enviar_frame_ws(c, mensaje)
            except Exception:
                caidos.append(c)
        for c in caidos:
            CLIENTES_WS.discard(c)


# Recibe los datos del celular o de la PC y actualiza las rutas
def actualizar_estado_memoria(data):
    global CONTADOR_ASTRONAUTAS, CONTADOR_PINES_UNICOS
    rol = data.get("rol", "CELULAR")
    if rol == "CELULAR":
        aid = data.get("astro_id", "")
        if not aid or aid not in ESTADO_VIVO_COMPARTIDO["astronautas"]:
            return

        with LOCK_ESTADO:
            astro = ESTADO_VIVO_COMPARTIDO["astronautas"][aid]
            cambio_recalculo = bool(data.get("recalcular_ruta", False))

            if "x" in data: astro["x"] = float(data["x"])
            if "y" in data: astro["y"] = float(data["y"])
            if "rumbo" in data: astro["rumbo"] = float(data["rumbo"])
            if "pitch" in data: astro["pitch"] = float(data["pitch"])
            if "vueltas_planeta" in data: astro["vueltas_planeta"] = int(data["vueltas_planeta"])
            astro["modo_manual"] = bool(data.get("modo_manual", True))

            if data.get("nuevo_nodo"):
                nn = data["nuevo_nodo"]
                nid = nn["id"]
                if not any(n["id"] == nid for n in astro["nodos_eva"]):
                    astro["nodos_eva"].append({
                        "id": nid, "svgX": int(nn["svgX"]), "svgY": int(nn["svgY"]),
                        "autor": aid, "emergencia": True
                    })
                    ESTADO_VIVO_COMPARTIDO["version_mapa"] += 1
                    cambio_recalculo = True

            if data.get("nuevo_obstaculo"):
                agregar_pin_sin_duplicar(data["nuevo_obstaculo"], aid)

            if cambio_recalculo or not astro.get("ruta_activa_svg") or len(astro["ruta_activa_svg"]) < 1:
                astro["ruta_activa_svg"] = calcular_ruta_astar_servidor(
                    astro["x"], astro["y"], astro["destino"],
                    astro.get("dest_x_custom"), astro.get("dest_y_custom")
                )

    elif rol == "PC":
        with LOCK_ESTADO:
            if data.get("reset"):
                CONTADOR_ASTRONAUTAS = 0
                CONTADOR_PINES_UNICOS = 0
                MAPA_DISPOSITIVO_A_ASTRO.clear()
                ESTADO_VIVO_COMPARTIDO["sesion_id"] += 1
                ESTADO_VIVO_COMPARTIDO["crateres_extra"] = []
                ESTADO_VIVO_COMPARTIDO["obstaculos_reportados"] = []
                ESTADO_VIVO_COMPARTIDO["astronautas"].clear()
                ESTADO_VIVO_COMPARTIDO["version_mapa"] += 1
                difundir_ws()
                return

            recalcular_global = False
            if "rad" in data and abs(float(data["rad"]) - ESTADO_VIVO_COMPARTIDO["rad"]) > 1:
                ESTADO_VIVO_COMPARTIDO["rad"] = float(data["rad"])
                recalcular_global = True
                notificar_motor_java_async(ESTADO_VIVO_COMPARTIDO["rad"], "N0")
            if "rad_x" in data and (abs(float(data["rad_x"]) - ESTADO_VIVO_COMPARTIDO["rad_x"]) > 2 or abs(float(data.get("rad_y", 205)) - ESTADO_VIVO_COMPARTIDO["rad_y"]) > 2):
                ESTADO_VIVO_COMPARTIDO["rad_x"] = float(data["rad_x"])
                ESTADO_VIVO_COMPARTIDO["rad_y"] = float(data["rad_y"])
                recalcular_global = True

            if "astronautas_sync" in data:
                for aid, info in data["astronautas_sync"].items():
                    if aid in ESTADO_VIVO_COMPARTIDO["astronautas"]:
                        target = ESTADO_VIVO_COMPARTIDO["astronautas"][aid]
                        if "destino" in info and (info["destino"] != target.get("destino") or info.get("dest_x_custom") != target.get("dest_x_custom")):
                            target["destino"] = info["destino"]
                            target["dest_x_custom"] = info.get("dest_x_custom")
                            target["dest_y_custom"] = info.get("dest_y_custom")
                            target["ruta_activa_svg"] = calcular_ruta_astar_servidor(
                                target["x"], target["y"], target["destino"],
                                target.get("dest_x_custom"), target.get("dest_y_custom")
                            )
                        if "modo_manual" in info:
                            target["modo_manual"] = bool(info["modo_manual"])
                        if not target["modo_manual"] and "x" in info:
                            target["x"] = float(info["x"])
                            target["y"] = float(info["y"])
                            target["rumbo"] = float(info.get("rumbo", target["rumbo"]))
                        if info.get("ruta_activa_svg") and len(info["ruta_activa_svg"]) >= 1:
                            limpia = [n for n in info["ruta_activa_svg"] if not str(n.get("id", "")).startswith("POS_")]
                            if len(limpia) >= 1:
                                target["ruta_activa_svg"] = limpia

            if data.get("nuevo_obstaculo"):
                obs = data["nuevo_obstaculo"]
                agregar_pin_sin_duplicar(obs, obs.get("autor", "ASTRO_1"))
                if obs.get("bloquea"):
                    recalcular_global = True

            if data.get("actualizar_pin"):
                up = data["actualizar_pin"]
                for pin in ESTADO_VIVO_COMPARTIDO["obstaculos_reportados"]:
                    if pin["id"] == up.get("id"):
                        pin["etiqueta"] = up.get("etiqueta", pin.get("etiqueta", "Punto de Interés"))
                        pin["bloquea"] = bool(up.get("bloquea", False))
                        pin["categoria"] = "PELIGRO" if pin["bloquea"] else "INFO"
                ESTADO_VIVO_COMPARTIDO["version_mapa"] += 1
                recalcular_global = True

            if data.get("eliminar_pin_id"):
                pid = data["eliminar_pin_id"]
                ESTADO_VIVO_COMPARTIDO["obstaculos_reportados"] = [
                    p for p in ESTADO_VIVO_COMPARTIDO["obstaculos_reportados"] if p["id"] != pid
                ]
                ESTADO_VIVO_COMPARTIDO["version_mapa"] += 1
                recalcular_global = True

            if data.get("nuevo_crater"):
                ESTADO_VIVO_COMPARTIDO["crateres_extra"].append(data["nuevo_crater"])
                ESTADO_VIVO_COMPARTIDO["version_mapa"] += 1
                recalcular_global = True

            if recalcular_global:
                recalcular_rutas_todos_en_servidor()

    difundir_ws()


class ServidorCalculosMarte(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):
        return

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self):
        if self.path.startswith("/api/registrar-astronauta"):
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
            try:
                req = json.loads(body)
            except Exception:
                req = {}
            dev_uuid = req.get("device_uuid", "")
            perfil = registrar_dispositivo_unico(dev_uuid)

            resp = json.dumps(perfil, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(resp)))
            self.end_headers()
            self.wfile.write(resp)
            difundir_ws()
            return

        elif self.path.startswith("/api/fast-sync"):
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
            try:
                actualizar_estado_memoria(json.loads(body))
            except Exception:
                pass
            resp = json.dumps(ESTADO_VIVO_COMPARTIDO, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(resp)))
            self.end_headers()
            self.wfile.write(resp)
            return

    def do_GET(self):
        try:
            self.request.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        except Exception:
            pass

        if self.headers.get("Upgrade", "").lower() == "websocket":
            key = self.headers.get("Sec-WebSocket-Key", "")
            magic = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
            accept = base64.b64encode(hashlib.sha1((key + magic).encode("utf-8")).digest()).decode("utf-8")

            self.send_response(101, "Switching Protocols")
            self.send_header("Upgrade", "websocket")
            self.send_header("Connection", "Upgrade")
            self.send_header("Sec-WebSocket-Accept", accept)
            self.end_headers()

            sock = self.request
            with LOCK_ESTADO:
                CLIENTES_WS.add(sock)
            try:
                enviar_frame_ws(sock, json.dumps(ESTADO_VIVO_COMPARTIDO, ensure_ascii=False))
                while True:
                    msg = leer_mensaje_ws(sock)
                    if msg is None:
                        break
                    actualizar_estado_memoria(json.loads(msg))
            except Exception:
                pass
            finally:
                with LOCK_ESTADO:
                    CLIENTES_WS.discard(sock)
            return

        parsed_url = urlparse(self.path)
        if parsed_url.path in ["/", "/celular", "/index.html"]:
            body = HTML_DISPOSITIVO_UNICO_ASTRONAUTA.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        elif parsed_url.path.startswith("/api/fast-sync") or parsed_url.path.startswith("/api/sync-eva"):
            resp = json.dumps(ESTADO_VIVO_COMPARTIDO, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(resp)))
            self.end_headers()
            self.wfile.write(resp)
            return


if __name__ == "__main__":
    servidor = ThreadingHTTPServer(("0.0.0.0", 8080), ServidorCalculosMarte)
    print("Servidor Python iniciado en http://0.0.0.0:8080")
    servidor.serve_forever()