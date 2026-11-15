public class AristaMarte {
    public static final double RADIO_MARTE_M = 3389500.0;

    public NodoMarte origen;
    public NodoMarte destino;
    public double distanciaHorizontalM;
    public double distancia3DM;
    public double pendienteGrados;
    public double vectorUnitX;
    public double vectorUnitZ;

    public AristaMarte(NodoMarte origen, NodoMarte destino) {
        this.origen = origen;
        this.destino = destino;
        this.distanciaHorizontalM = calcularHaversineMarte(origen.lat, origen.lon, destino.lat, destino.lon);
        double deltaH = Math.abs(destino.altitudM - origen.altitudM);
        this.distancia3DM = Math.sqrt(Math.pow(distanciaHorizontalM, 2) + Math.pow(deltaH, 2));
        this.pendienteGrados = Math.toDegrees(Math.atan2(deltaH, Math.max(1.0, distanciaHorizontalM)));

        double dx = destino.svgX - origen.svgX;
        double dz = destino.svgY - origen.svgY;
        double mag = Math.max(0.001, Math.hypot(dx, dz));
        this.vectorUnitX = Math.round((dx / mag) * 100.0) / 100.0;
        this.vectorUnitZ = Math.round((dz / mag) * 100.0) / 100.0;
    }

    public static double calcularHaversineMarte(double lat1, double lon1, double lat2, double lon2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                 + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                 * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return RADIO_MARTE_M * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
    }
}