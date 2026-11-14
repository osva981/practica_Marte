import java.util.Locale;

public class NodoMarte {
    public String id;
    public String nombre;
    public String zonaPlanetaria;
    public String tipo;           // "BASE", "RUTA", "REFUGIO", "CIMA", "OBJETIVO_BOXWORK"
    public String tipoTerreno;    // "REGOLITO_FIRME", "DUNA_ACTIVA", "ESCARPE_ROCOSO", "RED_BOXWORK", "TUBO_LAVA"
    public String datoQuimico;    // Datos espectrales CRISM/ChemCam
    public double tempSuperficieC;// Datos térmicos THEMIS (°C)
    public int orden;
    public double lat;
    public double lon;
    public double altitudM;
    public double factorExposicion;
    public double riesgoTerreno;
    public int svgX;
    public int svgY;
    public boolean creadoEnUrgencia;
    public Object terreno;

    public NodoMarte(String id, String nombre, String zonaPlanetaria, String tipo, String tipoTerreno,
                     String datoQuimico, double tempSuperficieC, int orden, double lat, double lon,
                     double altitudM, double factorExposicion, double riesgoTerreno,
                     int svgX, int svgY, boolean creadoEnUrgencia) {
        this.id = id;
        this.nombre = nombre;
        this.zonaPlanetaria = zonaPlanetaria;
        this.tipo = tipo;
        this.tipoTerreno = tipoTerreno;
        this.datoQuimico = datoQuimico;
        this.tempSuperficieC = tempSuperficieC;
        this.orden = orden;
        this.lat = lat;
        this.lon = lon;
        this.altitudM = altitudM;
        this.factorExposicion = factorExposicion;
        this.riesgoTerreno = riesgoTerreno;
        this.svgX = svgX;
        this.svgY = svgY;
        this.creadoEnUrgencia = creadoEnUrgencia;
    }

    public String toJson(double radSolar, double pendienteSiguiente) {
        double radLocal = Math.round((9.5 + radSolar * this.factorExposicion) * 10.0) / 10.0;
        return String.format(Locale.US,
            "{\"id\":\"%s\",\"nombre\":\"%s\",\"zona\":\"%s\",\"tipo\":\"%s\",\"terreno\":\"%s\"," +
            "\"quimica\":\"%s\",\"temp_c\":%.1f,\"lat\":%.4f,\"lon\":%.4f,\"altitud\":%.0f," +
            "\"pendiente\":%.1f,\"rad_nodo\":%.1f,\"riesgo_terreno\":%.1f,\"svgX\":%d,\"svgY\":%d,\"emergencia\":%b}",
            id, nombre, zonaPlanetaria, tipo, tipoTerreno,
            datoQuimico, tempSuperficieC, lat, lon, altitudM,
            pendienteSiguiente, radLocal, riesgoTerreno, svgX, svgY, creadoEnUrgencia
        );
    }

    class terreno {

        public terreno() {
        }
    }
}