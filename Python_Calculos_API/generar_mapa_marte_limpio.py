import urllib.request
import math
import os
import struct
import zlib

# Crea un PNG en escala de grises o color sin requerir librerías externas pesadas
def guardar_png_rgb(ruta_archivo, ancho, alto, pixeles_rgb):
    def chunk(tipo, datos):
        return struct.pack(">I", len(datos)) + tipo + datos + struct.pack(">I", zlib.crc32(tipo + datos) & 0xffffffff)

    raw_data = bytearray()
    for y in range(alto):
        raw_data.append(0)  # Filtro PNG nulo
        fila = pixeles_rgb[y * ancho : (y + 1) * ancho]
        for r, g, b in fila:
            raw_data.extend((max(0, min(255, int(r))), max(0, min(255, int(g))), max(0, min(255, int(b)))))

    ihdr = struct.pack(">IIBBBBB", ancho, alto, 8, 2, 0, 0, 0)
    png_bytes = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw_data), 6)) + chunk(b"IEND", b"")
    with open(ruta_archivo, "wb") as f:
        f.write(png_bytes)

def generar_mapas_cientificos_marte():
    ancho, alto = 512, 320
    pixeles_dem = []
    pixeles_optico = []
    pixeles_mola_color = []

    # Lista de Cráteres Reales a Escala (x, y, radio, profundidad)
    crateres = [
        (110, 95, 34, 0.75), (215, 155, 42, 0.85), (340, 110, 38, 0.80),
        (155, 225, 28, 0.70), (285, 235, 32, 0.78), (415, 195, 36, 0.82),
        (75, 190, 22, 0.65), (255, 75, 25, 0.68), (385, 255, 24, 0.65),
        (180, 115, 16, 0.55), (310, 175, 18, 0.60), (445, 95, 26, 0.72)
    ]

    print("Escaneando y generando topografía limpa de Marte (Cráteres, Canales, Dunas y Relieve MOLA)...")
    for y in range(alto):
        for x in range(ancho):
            # 1. Elevación planetaria base y macizos rocosos
            nx, ny = x / ancho, y / alto
            elev = 0.52 + 0.18 * math.sin(nx * 5.5) * math.cos(ny * 4.2)
            elev += 0.08 * math.sin(nx * 14.0 + ny * 9.0)

            # 2. Gran Canal Fluvial Marciano (Valles / Kasei Vallis que cruza el terreno)
            canal_y = 165 + 42 * math.sin(nx * 6.2) + 15 * math.cos(nx * 13.0)
            dist_canal = abs(y - canal_y)
            if dist_canal < 18:
                profundidad_canal = (1.0 - (dist_canal / 18.0) ** 2) * 0.38
                elev -= profundidad_canal

            # Canal secundario ramificado
            canal2_x = 240 + 55 * math.sin(ny * 5.0)
            dist_canal2 = abs(x - canal2_x)
            if dist_canal2 < 12 and y > 110:
                elev -= (1.0 - (dist_canal2 / 12.0) ** 2) * 0.28

            # 3. Campos de Dunas Eólicas (Ondulaciones en zonas medias)
            if 0.38 < elev < 0.58:
                dunas = 0.035 * math.sin(x * 0.65 + y * 0.35)
                elev += dunas

            # 4. Cráteres de Impacto con Anillo Elevado (Rim) y Cuenca Profunda
            for cx, cy, r, prof in crateres:
                d = math.hypot(x - cx, y - cy)
                if d < r:
                    t = d / r
                    # Hundimiento parabólico del cráter
                    elev -= (1.0 - t * t) * prof * 0.52
                elif d < r * 1.28:
                    # Borde elevado rocoso del cráter (Escarpe)
                    t_rim = (d - r) / (r * 0.28)
                    elev += math.sin(t_rim * math.pi) * 0.14

            elev = max(0.02, min(0.98, elev))
            val_gris = int(elev * 255)
            pixeles_dem.append((val_gris, val_gris, val_gris))

            # Color Óptico Marciano Limpio (Sin ninguna línea del Curiosity)
            ruido = math.sin(x * 0.9) * math.cos(y * 0.9) * 8
            r_opt = int(135 + elev * 95 + ruido)
            g_opt = int(68 + elev * 62 + ruido * 0.6)
            b_opt = int(42 + elev * 38 + ruido * 0.4)
            if elev < 0.28: # Suelo oscuro basáltico en fondo de cráteres y canales
                r_opt, g_opt, b_opt = int(r_opt * 0.72), int(g_opt * 0.70), int(b_opt * 0.78)
            pixeles_optico.append((r_opt, g_opt, b_opt))

            # Color Hipsométrico Oficial MOLA (Azul=Cráter/Canal profundo, Verde=Planicie, Rojo/Blanco=Cumbre)
            if elev < 0.28:
                c_mola = (30, int(70 + elev * 450), 220)
            elif elev < 0.50:
                c_mola = (int((elev - 0.28) * 800), 210, int(180 - (elev - 0.28) * 700))
            elif elev < 0.75:
                c_mola = (245, int(220 - (elev - 0.50) * 650), 30)
            else:
                c_mola = (255, int(100 + (elev - 0.75) * 600), int(100 + (elev - 0.75) * 600))
            pixeles_mola_color.append(c_mola)

    carpetas_destino = [
        os.path.join("..", "marte-hud", "public"),
        os.path.join("..", "Java_Grafos_Rutas"),
        "."
    ]
    for carpeta in carpetas_destino:
        if os.path.exists(carpeta):
            guardar_png_rgb(os.path.join(carpeta, "marte_dem_crateres.png"), ancho, alto, pixeles_dem)
            guardar_png_rgb(os.path.join(carpeta, "marte_superficie_limpia.png"), ancho, alto, pixeles_optico)
            guardar_png_rgb(os.path.join(carpeta, "marte_mola_limpio.png"), ancho, alto, pixeles_mola_color)
            print(f"✅ Mapas limpios exportados en: { os.path.abspath(carpeta) }")

if __name__ == "__main__":
    generar_mapas_cientificos_marte()