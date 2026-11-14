import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.util.*;

public class MotorGrafoMarte {

    static final double RADIO_MARTE_M = 3389500.0; // Radio medio real de Marte en metros

    static class NodoMarte {
        String id;
        String nombre;
        String tipo; // "RUTA", "BASE", "CIMA", "REFUGIO"
        double lat;
        double lon;
        double altitudM; // Altitud real MOLA (metros)
        double factorExposicion; // 0.1 (muy protegido por cañón) a 2.5 (cresta expuesta)
        int svgX; // Coordenada X exacta sobre la imagen del Monte Sharp (0-400)
        int svgY; // Coordenada Y exacta sobre la imagen del Monte Sharp (0-250)

        public NodoMarte(String id, String nombre, String tipo, double lat, double lon, double altitudM, double exp, int svgX, int svgY) {
            this.id = id;
            this.nombre = nombre;
            this.tipo = tipo;
            this.lat = lat;
            this.lon = lon;
            this.altitudM = altitudM;
            this.factorExposicion = exp;
            this.svgX = svgX;
            this.svgY = svgY;
        }
    }

    static class Arista {
        NodoMarte origen;
        NodoMarte destino;
        double distanciaHorizontalM;
        double distancia3DM;
        double pendienteGrados;

        public Arista(NodoMarte o, NodoMarte d) {
            this.origen = o;
            this.destino = d;
            this.distanciaHorizontalM = calcularHaversineMarte(o.lat, o.lon, d.lat, d.lon);
            double deltaH = Math.abs(d.altitudM - o.altitudM);
            this.distancia3DM = Math.sqrt(Math.pow(this.distanciaHorizontalM, 2) + Math.pow(deltaH, 2));
            this.pendienteGrados = Math.toDegrees(Math.atan2(deltaH, this.distanciaHorizontalM));
        }
    }

    static class ResultadoRuta {
        String decisionTactica;
        String codigoAccion; // "AVANZAR", "DESVIO", "REGRESAR", "REFUGIO"
        List<NodoMarte> nodos;
        double distanciaTotalM;
        double desnivelTotalM;
        double dosisEstimadaTramo;
        double costoPonderado;
    }

    static Map<String, NodoMarte> nodos = new LinkedHashMap<>();
    static Map<String, List<Arista>> grafo = new HashMap<>();
    static List<String[]> listaConexiones = new ArrayList<>();

    public static void main(String[] args) throws IOException {
        inicializarTopografiaMonteSharp();

        HttpServer server = HttpServer.create(new InetSocketAddress(8081), 0);
        server.createContext("/calcular-ruta", new RutaHandler());
        server.setExecutor(null);
        System.out.println("==================================================================");
        System.out.println(" MOTOR GEOFÍSICO JAVA ACTIVO EN: http://localhost:8081/calcular-ruta");
        System.out.println("==================================================================");
        server.start();
    }

    // Cálculo geodésico real sobre la esfera de Marte
    public static double calcularHaversineMarte(double lat1, double lon1, double lat2, double lon2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                 + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                 * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return RADIO_MARTE_M * c;
    }

    private static void inicializarTopografiaMonteSharp() {
        // Nodos reales siguiendo exactamente las curvas de ascenso de Curiosity en la imagen
        agregarNodo(new NodoMarte("N0", "Base Pahrump Hills", "BASE", -4.5895, 137.4417, -4460, 0.15, 72, 165));
        agregarNodo(new NodoMarte("N1", "Entrada Dunas Bagnold", "RUTA", -4.5935, 137.4390, -4442, 1.40, 118, 173));
        agregarNodo(new NodoMarte("N2", "Meseta Naukluft", "RUTA", -4.5975, 137.4355, -4418, 1.95, 156, 179));
        agregarNodo(new NodoMarte("N3", "Paso Murray Buttes", "RUTA", -4.6015, 137.4325, -4390, 1.60, 190, 187));
        agregarNodo(new NodoMarte("N4", "Curva Baja Hematita", "RUTA", -4.6050, 137.4300, -4355, 2.20, 214, 198));
        agregarNodo(new NodoMarte("N5", "Cresta Vera Rubin", "RUTA", -4.6085, 137.4315, -4310, 2.45, 198, 210));
        agregarNodo(new NodoMarte("N6", "Cuenca Glen Torridon", "RUTA", -4.6120, 137.4345, -4275, 1.30, 224, 218));
        agregarNodo(new NodoMarte("N7", "Ascenso Unidad Sulfatos", "RUTA", -4.6160, 137.4375, -4210, 2.30, 232, 233));
        agregarNodo(new NodoMarte("N8", "Horquilla Monte Sharp", "RUTA", -4.6200, 137.4410, -4135, 2.10, 260, 238));
        agregarNodo(new NodoMarte("N9", "Garganta Gediz Vallis", "RUTA", -4.6245, 137.4445, -4040, 0.85, 272, 212));
        agregarNodo(new NodoMarte("N10", "Estación Cima Aeolis", "CIMA", -4.6290, 137.4480, -3940, 0.20, 305, 182));

        // Nodos Alternativos Protegidos (Cañones y Refugios Naturales contra Tormentas Solares)
        agregarNodo(new NodoMarte("S1", "Cañón Rocoso Murray (Refugio)", "REFUGIO", -4.5985, 137.4385, -4405, 0.12, 165, 160));
        agregarNodo(new NodoMarte("S2", "Cornisa Bajo Pedimento (Desvío)", "REFUGIO", -4.6075, 137.4360, -4330, 0.25, 228, 178));
        agregarNodo(new NodoMarte("S3", "Cueva Natural Gediz (Refugio)", "REFUGIO", -4.6185, 137.4435, -4160, 0.10, 262, 198));

        // Curva Principal de Curiosity
        conectar("N0", "N1");
        conectar("N1", "N2");
        conectar("N2", "N3");
        conectar("N3", "N4");
        conectar("N4", "N5");
        conectar("N5", "N6");
        conectar("N6", "N7");
        conectar("N7", "N8");
        conectar("N8", "N9");
        conectar("N9", "N10");

        // Ramales de Evasión de Radiación y Refugios en Roca
        conectar("N1", "S1");
        conectar("S1", "N3");
        conectar("N3", "S2");
        conectar("S2", "N6");
        conectar("S2", "S3");
        conectar("N6", "S3");
        conectar("S3", "N9");
    }

    private static void agregarNodo(NodoMarte n) {
        nodos.put(n.id, n);
        grafo.put(n.id, new ArrayList<>());
    }

    private static void conectar(String id1, String id2) {
        NodoMarte n1 = nodos.get(id1);
        NodoMarte n2 = nodos.get(id2);
        grafo.get(id1).add(new Arista(n1, n2));
        grafo.get(id2).add(new Arista(n2, n1));
        listaConexiones.add(new String[]{id1, id2});
    }

    // Dijkstra Multicriterio: evalúa Distancia 3D + Esfuerzo en Pendiente + Dosis de Radiación
    public static ResultadoRuta calcularRutaOptima(String inicioId, String destinoId, double radSolar) {
        Map<String, Double> costos = new HashMap<>();
        Map<String, Double> distAcum = new HashMap<>();
        Map<String, Double> desnivelAcum = new HashMap<>();
        Map<String, Double> dosisAcum = new HashMap<>();
        Map<String, String> previos = new HashMap<>();

        PriorityQueue<String> cola = new PriorityQueue<>(Comparator.comparingDouble(costos::get));

        for (String id : nodos.keySet()) {
            costos.put(id, Double.MAX_VALUE);
            distAcum.put(id, 0.0);
            desnivelAcum.put(id, 0.0);
            dosisAcum.put(id, 0.0);
        }

        costos.put(inicioId, 0.0);
        cola.add(inicioId);

        while (!cola.isEmpty()) {
            String actualId = cola.poll();
            if (actualId.equals(destinoId)) break;

            for (Arista arista : grafo.get(actualId)) {
                NodoMarte vecino = arista.destino;
                double deltaSubida = Math.max(0.0, vecino.altitudM - arista.origen.altitudM);

                // Dosis en este tramo según exposición topográfica y tormenta solar
                double tasaRadTramo = 9.5 + (radSolar * vecino.factorExposicion);
                double tiempoEstSeg = arista.distancia3DM / 1.1;
                double dosisTramo = tasaRadTramo * (tiempoEstSeg / 3600.0);

                // Si la radiación es alta, penaliza severamente las crestas abiertas
                double factorRiesgoRad = (radSolar >= 45.0) ? Math.pow(vecino.factorExposicion, 2) * radSolar * 14.0 : vecino.factorExposicion * radSolar * 1.5;
                double penalizacionPendiente = (arista.pendienteGrados * 12.0) + (deltaSubida * 4.5);

                double pesoTotal = arista.distancia3DM + penalizacionPendiente + factorRiesgoRad;
                double nuevoCosto = costos.get(actualId) + pesoTotal;

                if (nuevoCosto < costos.get(vecino.id)) {
                    costos.put(vecino.id, nuevoCosto);
                    distAcum.put(vecino.id, distAcum.get(actualId) + arista.distancia3DM);
                    desnivelAcum.put(vecino.id, desnivelAcum.get(actualId) + deltaSubida);
                    dosisAcum.put(vecino.id, dosisAcum.get(actualId) + dosisTramo);
                    previos.put(vecino.id, actualId);
                    cola.add(vecino.id);
                }
            }
        }

        ResultadoRuta res = new ResultadoRuta();
        res.nodos = new ArrayList<>();
        String paso = destinoId;
        while (paso != null) {
            res.nodos.add(0, nodos.get(paso));
            paso = previos.get(paso);
        }
        res.distanciaTotalM = Math.round(distAcum.get(destinoId) * 10.0) / 10.0;
        res.desnivelTotalM = Math.round(desnivelAcum.get(destinoId) * 10.0) / 10.0;
        res.dosisEstimadaTramo = Math.round(dosisAcum.get(destinoId) * 100.0) / 100.0;
        res.costoPonderado = costos.get(destinoId);
        return res;
    }

    // Motor de Decisión: ¿Avanzar a la cima, Desviar por cañón, Regresar a Base o Entrar a Refugio?
    public static ResultadoRuta decidirEstrategiaSupervivencia(String nodoActual, double radSolar) {
        if (!nodos.containsKey(nodoActual)) nodoActual = "N0";

        ResultadoRuta haciaCima = calcularRutaOptima(nodoActual, "N10", radSolar);
        ResultadoRuta haciaBase = calcularRutaOptima(nodoActual, "N0", radSolar);

        // Busca el refugio rocoso más cercano (S1, S2 o S3)
        String[] refugios = {"S1", "S2", "S3"};
        ResultadoRuta mejorRefugio = null;
        for (String ref : refugios) {
            ResultadoRuta r = calcularRutaOptima(nodoActual, ref, radSolar);
            if (mejorRefugio == null || r.dosisEstimadaTramo < mejorRefugio.dosisEstimadaTramo) {
                mejorRefugio = r;
            }
        }

        // Verifica si la ruta a la cima usa los cañones protegidos (S1, S2, S3)
        boolean usaDesvioProtegido = false;
        for (NodoMarte n : haciaCima.nodos) {
            if (n.id.startsWith("S")) {
                usaDesvioProtegido = true;
                break;
            }
        }

        // 1. Tormenta Solar Extrema (>= 75): Evaluar si regresar a la base o meterse a un refugio rocoso
        if (radSolar >= 75.0 && !nodoActual.equals("N10")) {
            if (haciaBase.distanciaTotalM <= 650.0 && haciaBase.dosisEstimadaTramo < haciaCima.dosisEstimadaTramo) {
                haciaBase.codigoAccion = "REGRESAR";
                haciaBase.decisionTactica = "TORMENTA SOLAR SEVERA: ABORTAR ASCENSO Y REGRESAR A BASE PAHRUMP HILLS";
                return haciaBase;
            } else if (mejorRefugio != null && mejorRefugio.dosisEstimadaTramo < haciaCima.dosisEstimadaTramo * 0.65) {
                mejorRefugio.codigoAccion = "REFUGIO";
                mejorRefugio.decisionTactica = "IMPACTO INMINENTE: EVACUACIÓN DE EMERGENCIA A " + mejorRefugio.nodos.get(mejorRefugio.nodos.size() - 1).nombre.toUpperCase();
                return mejorRefugio;
            }
        }

        // 2. Radiación Moderada/Alta (40 a 74): Continuar hacia la cima pero desviando por cañones protegidos
        if (radSolar >= 40.0 || usaDesvioProtegido) {
            haciaCima.codigoAccion = "DESVIO";
            haciaCima.decisionTactica = "RADIACIÓN ELEVADA: RECALCULANDO ASCENSO POR CAÑONES Y CORNISA PROTEGIDA";
            return haciaCima;
        }

        // 3. Condiciones Normales (< 40): Seguir ruta científica original del Curiosity
        haciaCima.codigoAccion = "AVANZAR";
        haciaCima.decisionTactica = "CLIMA ESPACIAL ESTABLE: CONTINUAR RUTA CIENTÍFICA CURIOSITY AL MONTE SHARP";
        return haciaCima;
    }

    static class RutaHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String query = exchange.getRequestURI().getQuery();
            double nivelRad = 12.0;
            String nodoActual = "N0";

            if (query != null) {
                for (String param : query.split("&")) {
                    String[] kv = param.split("=");
                    if (kv.length == 2) {
                        if (kv[0].equals("rad")) nivelRad = Double.parseDouble(kv[1]);
                        if (kv[0].equals("nodo")) nodoActual = kv[1];
                    }
                }
            }

            ResultadoRuta estrategia = decidirEstrategiaSupervivencia(nodoActual, nivelRad);

            StringBuilder json = new StringBuilder();
            json.append(String.format(Locale.US,
                "{\"decision_tactica\":\"%s\", \"codigo_accion\":\"%s\", \"distancia_total_m\":%.1f, \"desnivel_positivo_m\":%.1f, \"dosis_tramo_uSv\":%.2f, ",
                estrategia.decisionTactica, estrategia.codigoAccion, estrategia.distanciaTotalM, estrategia.desnivelTotalM, estrategia.dosisEstimadaTramo));

            // Nodos de la ruta activa
            json.append("\"nodos_ruta\":[");
            for (int i = 0; i < estrategia.nodos.size(); i++) {
                NodoMarte n = estrategia.nodos.get(i);
                double radLocal = Math.round((9.5 + nivelRad * n.factorExposicion) * 10.0) / 10.0;
                double pendSiguiente = 3.5;
                if (i < estrategia.nodos.size() - 1) {
                    Arista a = new Arista(n, estrategia.nodos.get(i + 1));
                    pendSiguiente = Math.round(a.pendienteGrados * 10.0) / 10.0;
                }
                json.append(String.format(Locale.US,
                    "{\"id\":\"%s\",\"nombre\":\"%s\",\"tipo\":\"%s\",\"lat\":%.4f,\"lon\":%.4f,\"altitud\":%.0f,\"pendiente\":%.1f,\"rad_nodo\":%.1f,\"svgX\":%d,\"svgY\":%d}",
                    n.id, n.nombre, n.tipo, n.lat, n.lon, n.altitudM, pendSiguiente, radLocal, n.svgX, n.svgY));
                if (i < estrategia.nodos.size() - 1) json.append(",");
            }
            json.append("],");

            // Todos los nodos del mapa para dibujar la red topográfica completa
            json.append("\"todos_nodos\":[");
            int idx = 0;
            for (NodoMarte n : nodos.values()) {
                json.append(String.format(Locale.US,
                    "{\"id\":\"%s\",\"nombre\":\"%s\",\"tipo\":\"%s\",\"svgX\":%d,\"svgY\":%d,\"altitud\":%.0f}",
                    n.id, n.nombre, n.tipo, n.svgX, n.svgY, n.altitudM));
                if (++idx < nodos.size()) json.append(",");
            }
            json.append("],");

            // Todas las conexiones de la red para dibujar el grafo en el mapa
            json.append("\"aristas_mapa\":[");
            for (int i = 0; i < listaConexiones.size(); i++) {
                NodoMarte o = nodos.get(listaConexiones.get(i)[0]);
                NodoMarte d = nodos.get(listaConexiones.get(i)[1]);
                json.append(String.format("{\"x1\":%d,\"y1\":%d,\"x2\":%d,\"y2\":%d}", o.svgX, o.svgY, d.svgX, d.svgY));
                if (i < listaConexiones.size() - 1) json.append(",");
            }
            json.append("]}");

            byte[] response = json.toString().getBytes("UTF-8");
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
            exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
            exchange.sendResponseHeaders(200, response.length);
            OutputStream os = exchange.getResponseBody();
            os.write(response);
            os.close();
        }
    }
}