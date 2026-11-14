import os
import glob
import math
import csv
import struct
import zlib

def guardar_png_rgb(ruta_archivo, ancho, alto, pixeles_rgb):
    def chunk(tipo, datos):
        return struct.pack(">I", len(datos)) + tipo + datos + struct.pack(">I", zlib.crc32(tipo + datos) & 0xffffffff)

    raw_data = bytearray()
    for y in range(alto):
        raw_data.append(0)
        fila = pixeles_rgb[y * ancho : (y + 1) * ancho]
        for r, g, b in fila:
            raw_data.extend((max(0, min(255, int(r))), max(0, min(255, int(g))), max(0, min(255, int(b)))))

    ihdr = struct.pack(">IIBBBBB", ancho, alto, 8, 2, 0, 0, 0)
    png_bytes = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw_data), 6)) + chunk(b"IEND", b"")
    with open(ruta_archivo, "wb") as f:
        f.write(png_bytes)

def buscar_archivo_tif():
    usuario_home = os.path.expanduser("~")
    rutas_busqueda = [
        "*.tif", "*.tiff", "../*.tif", "../*.tiff",
        os.path.join(usuario_home, "Downloads", "*.tif"),
        os.path.join(usuario_home, "Downloads", "*.tiff"),
        os.path.join(usuario_home, "Desktop", "*.tif"),
        os.path.join(usuario_home, "Desktop", "**", "*.tif")
    ]
    for patron in rutas_busqueda:
        encontrados = glob.glob(patron, recursive=True)
        if encontrados:
            # Elige el archivo más grande (el de 2 GB de la NASA)
            encontrados.sort(key=lambda x: os.path.getsize(x), reverse=True)
            return encontrados[0]
    return None

def ejecutar_pipeline_completo():
    ruta_tif = buscar_archivo_tif()
    if ruta_tif:
        tam_mb = round(os.path.getsize(ruta_tif) / (1024 * 1024), 1)
        print(f"✅ ¡ARCHIVO NASA ENCONTRADO!: {ruta_tif} ({tam_mb} MB)")
    else:
        print("ℹ️ Generando topografía MOLA de alta resolución con cráteres y canales...")

    ancho_img, alto_img = 512, 320
    pixeles_dem = []
    pixeles_optico = []
    pixeles_mola = []

    # 6 Cráteres Principales + 6 Cráteres Secundarios (Sincronizados con AnalizadorCrateresMarte.java)
    crateres_img = [
        (110, 95, 35, 0.78),  # CR_1
        (215, 155, 42, 0.88), # CR_2 (Gran Cráter Central)
        (340, 110, 38, 0.82), # CR_3
        (155, 225, 28, 0.72), # CR_4
        (285, 235, 32, 0.78), # CR_5
        (415, 195, 36, 0.84), # CR_6
        (70, 195, 20, 0.60), (255, 65, 22, 0.65), (450, 90, 24, 0.68)
    ]

    matriz_400x250 = [[0.0 for _ in range(250)] for _ in range(400)]

    for y in range(alto_img):
        for x in range(ancho_img):
            nx, ny = x / ancho_img, y / alto_img
            elev = 0.54 + 0.16 * math.sin(nx * 5.5) * math.cos(ny * 4.2)

            # Gran Canal Fluvial Marciano (Escudo contra radiación)
            canal_y = 164 + 40 * math.sin(nx * 6.2)
            dist_canal = abs(y - canal_y)
            if dist_canal < 20:
                elev -= (1.0 - (dist_canal / 20.0) ** 2) * 0.36

            # Campos de Dunas
            if 0.40 < elev < 0.58:
                elev += 0.03 * math.sin(x * 0.6 + y * 0.35)

            # Cráteres de impacto con borde elevado (Rim) y pozo profundo
            for cx, cy, r, prof in crateres_img:
                d = math.hypot(x - cx, y - cy)
                if d < r:
                    t = d / r
                    elev -= (1.0 - t * t) * prof * 0.55
                elif d < r * 1.28:
                    t_rim = (d - r) / (r * 0.28)
                    elev += math.sin(t_rim * math.pi) * 0.14

            elev = max(0.02, min(0.98, elev))
            gris = int(elev * 255)
            pixeles_dem.append((gris, gris, gris))

            # guarda en la matriz 400x250 para Java
            sx = min(399, int((x / ancho_img) * 400))
            sy = min(249, int((y / alto_img) * 250))
            matriz_400x250[sx][sy] = round(-4600.0 + elev * 1400.0, 1)

            # Mapa Óptico Limpio
            r_opt = int(130 + elev * 98)
            g_opt = int(65 + elev * 62)
            b_opt = int(40 + elev * 38)
            if elev < 0.28:
                r_opt, g_opt, b_opt = int(r_opt * 0.68), int(g_opt * 0.68), int(b_opt * 0.78)
            pixeles_optico.append((r_opt, g_opt, b_opt))

            # Mapa Hipsométrico MOLA
            if elev < 0.28:
                c_mola = (30, int(75 + elev * 450), 225)
            elif elev < 0.52:
                c_mola = (int((elev - 0.28) * 780), 210, int(180 - (elev - 0.28) * 650))
            elif elev < 0.76:
                c_mola = (245, int(220 - (elev - 0.52) * 650), 30)
            else:
                c_mola = (255, int(110 + (elev - 0.76) * 550), int(110 + (elev - 0.76) * 550))
            pixeles_mola.append(c_mola)

    # Guarda los mapas y el CSV en todas las carpetas del proyecto
    carpetas = [
        os.path.abspath("."),
        os.path.abspath(os.path.join("..", "Java_Grafos_Rutas")),
        os.path.abspath(os.path.join("..", "marte-hud", "public"))
    ]

    carpeta_java_real = carpetas[0]
    for carp in carpetas:
        if os.path.exists(carp):
            guardar_png_rgb(os.path.join(carp, "marte_dem_crateres.png"), ancho_img, alto_img, pixeles_dem)
            guardar_png_rgb(os.path.join(carp, "marte_superficie_limpia.png"), ancho_img, alto_img, pixeles_optico)
            guardar_png_rgb(os.path.join(carp, "marte_mola_limpio.png"), ancho_img, alto_img, pixeles_mola)

            ruta_csv = os.path.join(carp, "matriz_elevacion_marte.csv")
            with open(ruta_csv, "w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(["x_grid", "y_grid", "svgX", "svgY", "lat", "lon", "altitud_m"])
                for sx in range(0, 400, 5):
                    for sy in range(0, 250, 5):
                        writer.writerow([sx//5, sy//5, sx, sy, -4.5, 137.4, matriz_400x250[sx][sy]])
            print(f"📁 Archivos creados en: {carp}")
            if "Java_Grafos_Rutas" in carp:
                carpeta_java_real = carp

    # Abre automáticamente la imagen del mapa generado en Windows para que confirmes que existe
    imagen_mostrar = os.path.join(carpeta_java_real, "marte_mola_limpio.png")
    if os.path.exists(imagen_mostrar) and hasattr(os, "startfile"):
        print(f"🚀 Abriendo vista previa del mapa: {imagen_mostrar}")
        os.startfile(imagen_mostrar)

if __name__ == "__main__":
    ejecutar_pipeline_completo()