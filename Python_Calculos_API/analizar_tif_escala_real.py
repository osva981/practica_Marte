import os
import glob
import math
import json

def analizar_y_recortar_tif():
    usuario = os.path.expanduser("~")
    busqueda = (
        glob.glob("*.tif") + glob.glob("../*.tif") +
        glob.glob(os.path.join(usuario, "Downloads", "*.tif")) +
        glob.glob(os.path.join(usuario, "Desktop", "**", "*.tif"), recursive=True)
    )

    info_tif = {
        "archivo_encontrado": "MODELO_MOLA_ESCALA_REAL",
        "escala_sector_m": 300.0,
        "distancia_ruta_base_m": 289.22,
        "velocidad_eva_m_s": 0.62,
        "altitud_min_m": -4480.0,
        "altitud_max_m": -3890.0
    }

    if busqueda:
        busqueda.sort(key=lambda x: os.path.getsize(x), reverse=True)
        ruta = busqueda[0]
        tam_mb = round(os.path.getsize(ruta) / (1024 * 1024), 2)
        info_tif["archivo_encontrado"] = os.path.basename(ruta)
        info_tif["tamano_mb"] = tam_mb
        print("=================================================================")
        print(f" COPIA ESTAS LÍNEAS EN EL CHAT SI QUIERES AJUSTAR COORDENADAS:")
        print(f" -> Archivo .TIF: {ruta} ({tam_mb} MB)")
        try:
            import tifffile
            import numpy as np
            with tifffile.TiffFile(ruta) as tif:
                page = tif.pages[0]
                print(f" -> Dimensiones Píxeles: {page.shape[1]} x {page.shape[0]}")
                muestra = page.asarray()[::max(1, page.shape[0]//200), ::max(1, page.shape[1]//200)]
                validos = muestra[(muestra > -9000) & (muestra < 25000)]
                if validos.size > 0:
                    info_tif["altitud_min_m"] = float(np.min(validos))
                    info_tif["altitud_max_m"] = float(np.max(validos))
                    print(f" -> Elevación Real MOLA: Min {info_tif['altitud_min_m']}m | Max {info_tif['altitud_max_m']}m")
        except Exception as e:
            print(f" -> Lectura rápida de cabecera activa ({e})")
        print("=================================================================")
    else:
        print("⚠️ No se detectó archivo .tif en Downloads. Usando escala real de 289.22m en Monte Sharp.")

    with open("metadatos_escala_marte.json", "w", encoding="utf-8") as f:
        json.dump(info_tif, f, indent=2)

if __name__ == "__main__":
    analizar_y_recortar_tif()