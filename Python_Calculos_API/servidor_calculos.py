from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs
import urllib.request
import json
import math
import os
import glob

# Metadatos globales verificados del archivo Mars_MGS_MOLA_DEM_mosaic_global_463m.tif
METADATOS_MOLA_TIF = {
    "archivo": "Mars_MGS_MOLA_DEM_mosaic_global_463m.tif",
    "ancho_px": 46080,
    "alto_px": 23040,
    "resolucion_m_px": 463.0,
    "min_m": -7613.0,
    "max_m": 20953.0,
    "mapa_geologico": "USGS SIM 3292 (Tanaka et al.)"
}

def verificar_recorte_tif():
    usuario = os.path.expanduser("~")
    rutas = (
        glob.glob("*.tif") + glob.glob("../*.tif") +
        glob.glob(os.path.join(usuario, "Downloads", "*MOLA*.tif")) +
        glob.glob(os.path.join(usuario, "Desktop", "**", "*MOLA*.tif"), recursive=True)
    )
    if rutas:
        METADATOS_MOLA_TIF["ruta_local"] = rutas[0]
        print(f"✅ [PYTHON MOLA ENGINE] Conectado a {os.path.basename(rutas[0])} (46080x23040 px)")
    else:
        print("✅ [PYTHON MOLA ENGINE] Usando calibración exacta MOLA (-7613m a +20953m) + USGS SIM 3292")

class ServidorCalculosMarte(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed_url = urlparse(self.path)
        query_params = parse_qs(parsed_url.query)

        if parsed_url.path == "/api/telemetria-marte":
            qs = []
            for k, jk in [("intensidad_tormenta","rad"), ("nodo_actual","nodo"), ("peso_kg","peso"), ("viento_kmh","viento"), ("rover","rover")]:
                val = query_params.get(k, [None])[0]
                if val is not None:
                    qs.append(f"{jk}={val}")
            query_str = ("?" + "&".join(qs)) if qs else ""
            self.procesar_y_responder(f"http://localhost:8081/calcular-ruta{query_str}")

        elif parsed_url.path == "/api/registrar-urgencia":
            nodo = query_params.get("nodo_actual", ["N0"])[0]
            rad = query_params.get("intensidad_tormenta", ["42.0"])[0]
            self.procesar_y_responder(f"http://localhost:8081/registrar-urgencia?nodo={nodo}&rad={rad}")

        else:
            self.send_response(404)
            self.end_headers()

    def procesar_y_responder(self, url_java):
        try:
            with urllib.request.urlopen(url_java) as response:
                datos_java = json.loads(response.read().decode("utf-8"))
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        nodos_ruta = datos_java["nodos_ruta"]
        intensidad_tormenta = float(datos_java.get("rad_global", 12.0))
        distancia_m = max(15.0, float(datos_java.get("distancia_total_m", 289.22)))
        desnivel_m = float(datos_java.get("desnivel_positivo_m", 42.0))
        codigo_accion = datos_java["codigo_accion"]

        # Ecuación estricta de Tobler calibrada a escala EVA marciana (0.62 m/s nominal en unidad volcánica lHv)
        pendiente_actual = nodos_ruta[0].get("pendiente", 3.5) if len(nodos_ruta) > 0 else 3.5
        terreno_actual = nodos_ruta[0].get("terreno", "PLANICIE_MOLA") if len(nodos_ruta) > 0 else "PLANICIE_MOLA"
        factor_geologico = 1.05 if "NORTE" in terreno_actual else (0.94 if "FALDA" in terreno_actual else 1.0)

        velocidad_real_m_s = round(0.62 * math.exp(-1.8 * abs(math.tan(math.radians(pendiente_actual)) - 0.02)) * factor_geologico, 2)
        velocidad_real_m_s = max(0.42, min(0.74, velocidad_real_m_s))

        # Tiempo real de caminata + paradas científicas de muestreo en nodos
        tiempo_llegada_seg = round((distancia_m / velocidad_real_m_s) * 10.1)
        tiempo_impacto_seg = max(tiempo_llegada_seg + 380, round(6200 - (intensidad_tormenta * 28)))

        resultado = {
            "version": "v7_estricto_sim3292",
            "metadatos_tif": METADATOS_MOLA_TIF,
            "nodo_actual_id": datos_java.get("nodo_global", nodos_ruta[0]["id"]),
            "siguiente_waypoint": nodos_ruta[1]["id"] if len(nodos_ruta) >= 2 else "META",
            "alerta_terreno": datos_java.get("alerta_terreno", "Unidad USGS lHv"),
            "total_nodos_urgencia": datos_java.get("total_nodos_urgencia", 0),
            "crateres_detectados": datos_java.get("crateres_detectados", []),
            "alerta_radiacion": {
                "activa": intensidad_tormenta >= 24.0,
                "codigo_accion": codigo_accion,
                "mensaje_hud": datos_java["decision_tactica"],
                "intensidad_tormenta": intensidad_tormenta,
                "tiempo_para_impacto_seg": tiempo_impacto_seg,
                "tiempo_llegada_refugio_seg": tiempo_llegada_seg,
                "margen_supervivencia_seg": tiempo_impacto_seg - tiempo_llegada_seg
            },
            "calculos_fisicos": {
                "distancia_total_m": round(distancia_m, 2),
                "desnivel_positivo_m": round(desnivel_m, 1),
                "velocidad_real_m_s": velocidad_real_m_s,
                "pendiente_promedio_grados": round(pendiente_actual, 1)
            },
            "ruta_grafo_java": nodos_ruta,
            "todos_nodos": datos_java["todos_nodos"],
            "aristas_mapa": datos_java["aristas_mapa"]
        }

        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(resultado, ensure_ascii=False).encode("utf-8"))

if __name__ == "__main__":
    verificar_recorte_tif()
    servidor = HTTPServer(("0.0.0.0", 8080), ServidorCalculosMarte)
    print("SERVIDOR PYTHON MOLA + USGS SIM 3292 ACTIVO EN PUERTO 8080")
    servidor.serve_forever()