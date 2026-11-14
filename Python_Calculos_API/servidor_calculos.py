from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs
import urllib.request
import json
import math

class ServidorCalculosMarte(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed_url = urlparse(self.path)
        
        if parsed_url.path == "/api/telemetria-marte":
            query_params = parse_qs(parsed_url.query)
            intensidad_tormenta = float(query_params.get("intensidad_tormenta", [12.0])[0])
            nodo_actual = query_params.get("nodo_actual", ["N0"])[0]

            try:
                url_java = f"http://localhost:8081/calcular-ruta?rad={intensidad_tormenta}&nodo={nodo_actual}"
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
            distancia_m = max(45.0, datos_java["distancia_total_m"])
            desnivel_m = datos_java["desnivel_positivo_m"]
            codigo_accion = datos_java["codigo_accion"]

            # 1. Velocidad de Tobler en pendiente marciana
            pendiente_promedio = sum(n["pendiente"] for n in nodos_ruta) / max(1, len(nodos_ruta))
            pendiente_rad = math.radians(pendiente_promedio)
            velocidad_real_m_s = max(0.45, round(1.28 * math.exp(-3.2 * abs(math.tan(pendiente_rad) + 0.04)), 2))
            tiempo_llegada_seg = round(distancia_m / velocidad_real_m_s)

            # 2. Tiempo exacto para que el frente de radiación alcance la ruta
            distancia_frente_m = max(140.0, 1750.0 - (intensidad_tormenta * 16.5))
            velocidad_frente_m_s = 0.65 + (intensidad_tormenta * 0.025)
            tiempo_impacto_seg = round(distancia_frente_m / velocidad_frente_m_s)

            # 3. Evaluación Predictiva de las 3 Opciones de Ruta (¿Alcanza a llegar antes del impacto?)
            eta_cima_directa_seg = 920
            eta_desvio_canon_seg = 640
            eta_retorno_base_seg = 310

            evaluacion_predictiva = {
                "eta_cima_seg": eta_cima_directa_seg,
                "cima_viable": tiempo_impacto_seg > eta_cima_directa_seg,
                "eta_desvio_seg": eta_desvio_canon_seg,
                "desvio_viable": tiempo_impacto_seg > eta_desvio_canon_seg,
                "eta_retorno_seg": eta_retorno_base_seg,
                "retorno_viable": True
            }

            dosis_instantanea_uSv_h = round(sum(n["rad_nodo"] for n in nodos_ruta) / max(1, len(nodos_ruta)), 2)
            dosis_total_acumulada_uSv = datos_java["dosis_tramo_uSv"]
            porcentaje_limite_rad = min(100, round((dosis_total_acumulada_uSv / 150.0) * 100, 1))

            esfuerzo_watts = round(185 + (velocidad_real_m_s * 65) + (pendiente_promedio * 16))
            ritmo_cardiaco_bpm = min(165, round(78 + (esfuerzo_watts * 0.17) + (15 if intensidad_tormenta >= 20 else 0)))
            consumo_o2_l_min = round(0.85 + (esfuerzo_watts * 0.0045), 2)
            oxigeno_restante_pct = max(15, round(98 - (tiempo_llegada_seg / 3600.0) * 14.5, 1))

            siguiente_waypoint = nodos_ruta[1]["nombre"] if len(nodos_ruta) >= 2 else nodos_ruta[0]["nombre"]

            resultado = {
                "version": "v3_predictivo",
                "sol_mision": 145,
                "nodo_actual_id": nodos_ruta[0]["id"],
                "siguiente_waypoint": siguiente_waypoint,
                "evaluacion_predictiva": evaluacion_predictiva,
                "alerta_radiacion": {
                    "activa": intensidad_tormenta >= 20.0,
                    "codigo_accion": codigo_accion,
                    "mensaje_hud": datos_java["decision_tactica"],
                    "intensidad_tormenta": intensidad_tormenta,
                    "tiempo_para_impacto_seg": tiempo_impacto_seg,
                    "tiempo_llegada_refugio_seg": tiempo_llegada_seg,
                    "margen_supervivencia_seg": tiempo_impacto_seg - tiempo_llegada_seg
                },
                "calculos_fisicos": {
                    "distancia_total_m": round(distancia_m, 1),
                    "desnivel_positivo_m": round(desnivel_m, 1),
                    "velocidad_real_m_s": velocidad_real_m_s,
                    "pendiente_promedio_grados": round(pendiente_promedio, 2),
                    "dosis_traje_uSv_h": dosis_instantanea_uSv_h,
                    "dosis_acumulada_uSv": dosis_total_acumulada_uSv,
                    "porcentaje_limite_nasa": porcentaje_limite_rad,
                    "esfuerzo_metabolico_w": esfuerzo_watts,
                    "consumo_o2_l_min": consumo_o2_l_min,
                    "ritmo_cardiaco_bpm": ritmo_cardiaco_bpm,
                    "oxigeno_pct": oxigeno_restante_pct
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
        else:
            self.send_response(404)
            self.end_headers()

if __name__ == "__main__":
    servidor = HTTPServer(("localhost", 8080), ServidorCalculosMarte)
    print("=================================================================")
    print(" MOTOR PREDICTIVO PYTHON v3 ACTIVO EN PUERTO 8080")
    print("=================================================================")
    servidor.serve_forever()