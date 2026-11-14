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
            distancia_m = max(1.0, datos_java["distancia_total_m"])
            desnivel_m = datos_java["desnivel_positivo_m"]
            codigo_accion = datos_java["codigo_accion"]

            # 1. CINEMÁTICA REAL: Función de Tobler adaptada a trajes EVA en gravedad marciana (3.721 m/s^2)
            pendiente_promedio = sum(n["pendiente"] for n in nodos_ruta) / max(1, len(nodos_ruta))
            pendiente_rad = math.radians(pendiente_promedio)
            v_base_eva = 1.28  # m/s en terreno plano marciano
            velocidad_tobler_m_s = v_base_eva * math.exp(-3.5 * abs(math.tan(pendiente_rad) + 0.05))
            velocidad_real_m_s = max(0.35, round(velocidad_tobler_m_s, 2))

            tiempo_llegada_seg = round(distancia_m / velocidad_real_m_s)

            # 2. PROPAGACIÓN DEL FRENTE SOLAR (Partículas Energéticas Solares - SPE)
            distancia_frente_m = 1650.0 - (intensidad_tormenta * 6.5)
            velocidad_frente_m_s = 0.65 + (intensidad_tormenta * 0.022)
            tiempo_impacto_seg = max(60, round(distancia_frente_m / velocidad_frente_m_s))

            # 3. DOSIMETRÍA RAD Y METABOLISMO (Consumo de O2 en traje presurizado de 145 kg)
            dosis_instantanea_uSv_h = round(sum(n["rad_nodo"] for n in nodos_ruta) / max(1, len(nodos_ruta)), 2)
            dosis_total_acumulada_uSv = datos_java["dosis_tramo_uSv"]
            limite_seguro_eva_uSv = 150.0
            porcentaje_limite_rad = min(100, round((dosis_total_acumulada_uSv / limite_seguro_eva_uSv) * 100, 1))

            # Esfuerzo metabólico y ritmo cardíaco según pendiente y alerta
            esfuerzo_watts = round(180 + (velocidad_real_m_s * 65) + (pendiente_promedio * 18))
            ritmo_cardiaco_bpm = min(165, round(76 + (esfuerzo_watts * 0.18) + (18 if intensidad_tormenta >= 40 else 0)))
            consumo_o2_l_min = round(0.85 + (esfuerzo_watts * 0.0045), 2)
            oxigeno_restante_pct = max(15, round(98 - (tiempo_llegada_seg / 3600.0) * 14.5, 1))

            # 4. VECTOR DE DIRECCIÓN PARA EL HUD DEL CASCO (Azimut hacia el siguiente nodo)
            angulo_giro_hud = 0
            siguiente_waypoint = nodos_ruta[0]["nombre"]
            if len(nodos_ruta) >= 2:
                n_act = nodos_ruta[0]
                n_sig = nodos_ruta[1]
                siguiente_waypoint = n_sig["nombre"]
                dx = n_sig["svgX"] - n_act["svgX"]
                dy = n_act["svgY"] - n_sig["svgY"]
                angulo_giro_hud = round(math.degrees(math.atan2(dx, max(1, dy))))

            resultado = {
                "sol_mision": 145,
                "zona": "Cráter Gale - Ascenso Real Monte Sharp (Aeolis Mons)",
                "nodo_actual_id": nodo_actual,
                "siguiente_waypoint": siguiente_waypoint,
                "alerta_radiacion": {
                    "activa": intensidad_tormenta >= 40.0,
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
                    "oxigeno_pct": oxigeno_restante_pct,
                    "angulo_giro_hud": angulo_giro_hud
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
    print(" MOTOR DE FÍSICA PYTHON ACTIVO EN: http://localhost:8080/api/telemetria-marte")
    print("=================================================================")
    servidor.serve_forever()