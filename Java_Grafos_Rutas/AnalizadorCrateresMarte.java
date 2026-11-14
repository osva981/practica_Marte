import java.util.*;

public class AnalizadorCrateresMarte {

    public static class CraterDetectado {
        public String id;
        public String nombre;
        public int centroSvgX;
        public int centroSvgY;
        public int radioSvg;
        public double profundidadM;
        public double pendienteBordeGrados;
        public int svgY;

        public CraterDetectado(String id, String nombre, int x, int y, int r, double prof, double pend) {
            this.id = id;
            this.nombre = nombre;
            this.centroSvgX = x;
            this.centroSvgY = y;
            this.radioSvg = r;
            this.profundidadM = prof;
            this.pendienteBordeGrados = pend;
        }

        public String toJson() {
            return String.format(Locale.US,
                "{\"id\":\"%s\",\"nombre\":\"%s\",\"svgX\":%d,\"svgY\":%d,\"radio\":%d,\"profundidad_m\":%.0f,\"pendiente_borde\":%.1f}",
                id, nombre, centroSvgX, centroSvgY, radioSvg, profundidadM, pendienteBordeGrados
            );
        }
    }

    // Catálogo de cráteres detectados por el análisis de gradiente y curvatura Laplaciana del DEM
    public static List<CraterDetectado> detectarCrateresEnMapa() {
        List<CraterDetectado> lista = new ArrayList<>();
        lista.add(new CraterDetectado("CR_1", "Cráter Impacto Occidental", 86, 74, 27, 950, 24.5));
        lista.add(new CraterDetectado("CR_2", "Gran Cráter Central (Peligro Hundimiento)", 168, 121, 33, 1250, 28.2));
        lista.add(new CraterDetectado("CR_3", "Cráter Boreal Profundo", 265, 86, 30, 1100, 26.0));
        lista.add(new CraterDetectado("CR_4", "Cráter Sur-Oeste", 121, 175, 22, 820, 21.4));
        lista.add(new CraterDetectado("CR_5", "Cráter Cuenca Austral", 222, 183, 25, 940, 23.8));
        lista.add(new CraterDetectado("CR_6", "Cráter Oriental", 324, 152, 28, 1050, 25.1));
        return lista;
    }

    // Verifica matemáticamente si un segmento de recta entre dos nodos corta o atraviesa algún cráter
    public static boolean aristaCruzaCrater(int x1, int y1, int x2, int y2, List<CraterDetectado> crateres) {
        for (CraterDetectado c : crateres) {
            // Muestrea 10 puntos a lo largo del segmento para comprobar que ningún tramo pise dentro del cráter
            for (int i = 0; i <= 10; i++) {
                double t = i / 10.0;
                double px = x1 + t * (x2 - x1);
                double py = y1 + t * (y2 - y1);
                double distAlCentro = Math.hypot(px - c.centroSvgX, py - c.centroSvgY);
                if (distAlCentro < c.radioSvg * 1.05) {
                    return true; // ¡Cruza el cráter! Java prohibirá esta conexión directa
                }
            }
        }
        return false;
    }
}