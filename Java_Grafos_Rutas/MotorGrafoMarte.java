import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.util.*;

public class MotorGrafoMarte {

    static final double RADIO_MARTE_M = 3389500.0;

    static class NodoMarte {
        String id;
        String nombre;
        String tipo;
        int ordenSubida;
        double lat, lon, altitudM, factorExposicion;
        int svgX, svgY;

        public NodoMarte(String id, String nombre, String tipo, int orden, double lat, double lon, double altitudM, double exp, int svgX, int svgY) {
            this.id = id;
            this.nombre = nombre;
            this.tipo = tipo;
            this.ordenSubida = orden;
            this.lat = lat;
            this.lon = lon;
            this.altitudM = altitudM;
            this.factorExposicion = exp;
            this.svgX = svgX;
            this.svgY = svgY;
        }
    }

    static class Arista {
        NodoMarte origen, destino;
        double distancia3DM, pendienteGrados;

        public Arista(NodoMarte o, NodoMarte d) {
            this.origen = o;
            this.destino = d;
            double dHoriz = calcularHaversineMarte(o.lat, o.lon, d.lat, d.lon);
            double deltaH = Math.abs(d.altitudM - o.altitudM);
            this.distancia3DM = Math.sqrt(dHoriz * dHoriz + deltaH * deltaH);
            this.pendienteGrados = Math.toDegrees(Math.atan2(deltaH, Math.max(1.0, dHoriz)));
        }
    }

    static class ResultadoRuta {
        String decisionTactica;
        String codigoAccion; // "AVANZAR", "DESVIO", "REFUGIO", "REGRESAR"
        List<NodoMarte> nodos;
        double distanciaTotalM;
        double desnivelTotalM;
        double dosisEstimadaTramo;
    }

    static Map<String, NodoMarte> nodos = new LinkedHashMap<>();
    static Map<String, List<Arista>> grafo = new HashMap<>();
    static List<String[]> listaConexiones = new ArrayList<>();

    public static void main(String[] args) throws IOException {
        inicializarTopografiaCuriosity();

        HttpServer server = HttpServer.create(new InetSocketAddress(8081), 0);
        server.createContext("/calcular-ruta", new RutaHandler());
        server.setExecutor(null);
        System.out.println("=========================================================================");
        System.out.println(" MOTOR PREDICTIVO JAVA v3 ACTIVO EN PUERTO 8081");
        System.out.println("=========================================================================");
        server.start();
    }

    public static double calcularHaversineMarte(double lat1, double lon1, double lat2, double lon2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                 + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                 * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return RADIO_MARTE_M * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
    }

    private static void inicializarTopografiaCuriosity() {
        // Ruta principal del Curiosity (Lado izquierdo/central expuesto a la radiación solar)
        agregarNodo(new NodoMarte("N0", "Base Bradbury / Pahrump", "BASE", 0, -4.5895, 137.4417, -4480, 0.05, 55, 118));
        agregarNodo(new NodoMarte("N1", "Planicie Yellowknife", "RUTA", 1, -4.5918, 137.4402, -4472, 0.80, 76, 134));
        agregarNodo(new NodoMarte("N2", "Borde Dunas Bagnold", "RUTA", 2, -4.5945, 137.4384, -4460, 1.55, 98, 152));
        agregarNodo(new NodoMarte("N3", "Corredor Dunas Oscuras", "RUTA", 3, -4.5972, 137.4365, -4445, 1.85, 122, 168));
        agregarNodo(new NodoMarte("N4", "Entrada Murray Buttes", "RUTA", 4, -4.6001, 137.4342, -4422, 1.95, 148, 182));
        agregarNodo(new NodoMarte("N5", "Paso Hematita Oeste", "RUTA", 5, -4.6030, 137.4322, -4395, 2.20, 174, 196));
        agregarNodo(new NodoMarte("N6", "Curva Sur Vera Rubin", "RUTA", 6, -4.6062, 137.4305, -4360, 2.45, 198, 212));
        agregarNodo(new NodoMarte("N7", "Horquilla Vera Rubin", "RUTA", 7, -4.6088, 137.4318, -4325, 2.50, 182, 228));
        agregarNodo(new NodoMarte("N8", "Rampa Glen Torridon", "RUTA", 8, -4.6115, 137.4342, -4285, 1.90, 210, 236));
        agregarNodo(new NodoMarte("N9", "Cuenca Arcillas", "RUTA", 9, -4.6142, 137.4368, -4240, 1.80, 238, 226));
        agregarNodo(new NodoMarte("N10", "Base Unidad Sulfatos", "RUTA", 10, -4.6168, 137.4392, -4185, 2.25, 252, 206));
        agregarNodo(new NodoMarte("N11", "Espolón Central", "RUTA", 11, -4.6192, 137.4410, -4125, 2.35, 240, 184));
        agregarNodo(new NodoMarte("N12", "Boca Gediz Vallis", "RUTA", 12, -4.6218, 137.4428, -4065, 1.85, 264, 162));
        agregarNodo(new NodoMarte("N13", "Cañón Superior Gediz", "RUTA", 13, -4.6245, 137.4448, -4005, 1.75, 290, 146));
        agregarNodo(new NodoMarte("N14", "Cresta Pedimento", "RUTA", 14, -4.6270, 137.4465, -3950, 2.10, 316, 132));
        agregarNodo(new NodoMarte("N15", "Estación Cima Monte Sharp", "CIMA", 15, -4.6295, 137.4485, -3890, 0.20, 344, 116));

        // Corredor lateral de Cañones y Refugios Protegidos (Alejados del cono de radiación)
        agregarNodo(new NodoMarte("S1", "Cañón Lateral Pahrump", "REFUGIO", 2, -4.5930, 137.4425, -4465, 0.08, 118, 116));
        agregarNodo(new NodoMarte("S2", "Paso Bajo Roca Murray", "REFUGIO", 5, -4.5990, 137.4395, -4410, 0.10, 178, 136));
        agregarNodo(new NodoMarte("S3", "Túnel Natural Vera Rubin", "REFUGIO", 8, -4.6095, 137.4385, -4345, 0.08, 232, 156));
        agregarNodo(new NodoMarte("S4", "Búnker Rocoso Gediz", "REFUGIO", 11, -4.6205, 137.4460, -4045, 0.08, 292, 176));

        String[] rutaPrincipal = {"N0","N1","N2","N3","N4","N5","N6","N7","N8","N9","N10","N11","N12","N13","N14","N15"};
        for (int i = 0; i < rutaPrincipal.length - 1; i++) {
            conectar(rutaPrincipal[i], rutaPrincipal[i + 1]);
        }

        // Corredor continuo de evasión por cañones (S1 -> S2 -> S3 -> S4) y puentes de escape
        conectar("N1", "S1");
        conectar("S1", "S2");
        conectar("S2", "S3");
        conectar("S3", "S4");
        conectar("S4", "N13");

        conectar("N3", "S1");
        conectar("N4", "S2");
        conectar("N6", "S2");
        conectar("N8", "S3");
        conectar("N10", "S3");
        conectar("N11", "S4");
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

    public static ResultadoRuta calcularDijkstra(String inicioId, String destinoId, double radSolar, boolean forzarRetorno) {
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

        // Coordenada actual del centro de la tormenta solar en el mapa SVG
        double avance = Math.max(0.0, (radSolar - 10.0) / 85.0);
        double focoRadX = 215.0 - (avance * 65.0);
        double focoRadY = 215.0 - (avance * 35.0);
        double radioPeligroSvg = 28.0 + (avance * 75.0);

        while (!cola.isEmpty()) {
            String actualId = cola.poll();
            if (actualId.equals(destinoId)) break;

            for (Arista arista : grafo.get(actualId)) {
                NodoMarte vecino = arista.destino;
                double deltaSubida = Math.max(0.0, vecino.altitudM - arista.origen.altitudM);

                // Distancia del nodo al frente móvil de radiación
                double distAlFoco = Math.hypot(vecino.svgX - focoRadX, vecino.svgY - focoRadY);
                boolean dentroDeConoRad = distAlFoco <= radioPeligroSvg;

                double tasaRadTramo = 9.5 + (radSolar * vecino.factorExposicion);
                double dosisTramo = tasaRadTramo * ((arista.distancia3DM / 1.1) / 3600.0);

                // Penalización sensible desde que la radiación sube poquito (rad >= 20)
                double penalizacionRad = 0.0;
                if (radSolar >= 20.0) {
                    penalizacionRad = Math.pow(vecino.factorExposicion, 2) * radSolar * 25.0;
                    if (dentroDeConoRad && !vecino.tipo.equals("REFUGIO")) {
                        penalizacionRad += 15000.0; // Evita cruzar por donde está la mancha roja
                    }
                }

                double pesoTotal = arista.distancia3DM + (arista.pendienteGrados * 8.0) + penalizacionRad;
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
        return res;
    }

    public static ResultadoRuta decidirEstrategiaPredictiva(String nodoActual, double radSolar) {
        if (!nodos.containsKey(nodoActual)) nodoActual = "N4";

        // 1. Si la radiación es prolongada/crítica (>= 62): REGRESAR A LA BASE N0 NODO POR NODO
        if (radSolar >= 62.0) {
            // Si el usuario estaba en N0 al subir la radiación a 62+, lo evaluamos desde N6 para mostrar el regreso completo
            String origenRetorno = nodoActual.equals("N0") ? "N6" : nodoActual;
            ResultadoRuta regresoBase = calcularDijkstra(origenRetorno, "N0", radSolar, true);
            regresoBase.codigoAccion = "REGRESAR";
            regresoBase.decisionTactica = "RETROCESO TÁCTICO ACTIVO: RADIACIÓN AVANZANDO - REGRESANDO NODO POR NODO A BASE N0";
            return regresoBase;
        }

        // 2. Si la radiación está entre 42 y 61: El tiempo ETA a la cima YA NO ALCANZA -> Redirigir a Refugio y hacia abajo
        if (radSolar >= 42.0) {
            String destinoSeguro = nodoActual.equals("S3") ? "S1" : "S3";
            ResultadoRuta rutaRefugio = calcularDijkstra(nodoActual, destinoSeguro, radSolar, false);
            rutaRefugio.codigoAccion = "REFUGIO";
            rutaRefugio.decisionTactica = "TIEMPO INSUFICIENTE PARA CIMA (ETA > IMPACTO): EVACUANDO POR CORREDOR DE REFUGIOS";
            return rutaRefugio;
        }

        // 3. Si la radiación aumenta poquito (20 a 41): Desvío preventivo inmediato por cañones (S1->S2->S3->S4)
        if (radSolar >= 20.0) {
            String origen = nodoActual.equals("N15") ? "N0" : nodoActual;
            ResultadoRuta rutaDesvio = calcularDijkstra(origen, "N15", radSolar, false);
            rutaDesvio.codigoAccion = "DESVIO";
            rutaDesvio.decisionTactica = "ALERTA PREVENTIVA: EVITANDO FRENTE DE RADIACIÓN POR CAÑONES LATERALES (S1-S4)";
            return rutaDesvio;
        }

        // 4. Radiación baja (< 20): Ruta original de Curiosity
        String origen = nodoActual.equals("N15") ? "N0" : nodoActual;
        ResultadoRuta rutaNormal = calcularDijkstra(origen, "N15", radSolar, false);
        rutaNormal.codigoAccion = "AVANZAR";
        rutaNormal.decisionTactica = "CLIMA ESPACIAL ÓPTIMO: ASCENDIENDO POR RUTA ORIGINAL CURIOSITY";
        return rutaNormal;
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

            ResultadoRuta estrategia = decidirEstrategiaPredictiva(nodoActual, nivelRad);

            StringBuilder json = new StringBuilder();
            json.append(String.format(Locale.US,
                "{\"version\":\"v3_predictivo\",\"decision_tactica\":\"%s\",\"codigo_accion\":\"%s\",\"distancia_total_m\":%.1f,\"desnivel_positivo_m\":%.1f,\"dosis_tramo_uSv\":%.2f,",
                estrategia.decisionTactica, estrategia.codigoAccion, estrategia.distanciaTotalM, estrategia.desnivelTotalM, estrategia.dosisEstimadaTramo));

            json.append("\"nodos_ruta\":[");
            for (int i = 0; i < estrategia.nodos.size(); i++) {
                NodoMarte n = estrategia.nodos.get(i);
                double radLocal = Math.round((9.5 + nivelRad * n.factorExposicion) * 10.0) / 10.0;
                double pend = 3.5;
                if (i < estrategia.nodos.size() - 1) {
                    pend = Math.round(new Arista(n, estrategia.nodos.get(i + 1)).pendienteGrados * 10.0) / 10.0;
                }
                json.append(String.format(Locale.US,
                    "{\"id\":\"%s\",\"nombre\":\"%s\",\"tipo\":\"%s\",\"lat\":%.4f,\"lon\":%.4f,\"altitud\":%.0f,\"pendiente\":%.1f,\"rad_nodo\":%.1f,\"svgX\":%d,\"svgY\":%d}",
                    n.id, n.nombre, n.tipo, n.lat, n.lon, n.altitudM, pend, radLocal, n.svgX, n.svgY));
                if (i < estrategia.nodos.size() - 1) json.append(",");
            }
            json.append("],\"todos_nodos\":[");
            int idx = 0;
            for (NodoMarte n : nodos.values()) {
                json.append(String.format(Locale.US,
                    "{\"id\":\"%s\",\"nombre\":\"%s\",\"tipo\":\"%s\",\"svgX\":%d,\"svgY\":%d,\"altitud\":%.0f}",
                    n.id, n.nombre, n.tipo, n.svgX, n.svgY, n.altitudM));
                if (++idx < nodos.size()) json.append(",");
            }
            json.append("],\"aristas_mapa\":[");
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