import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.util.*;

public class ServidorJavaMarte {

    private static GrafoPlanetarioMarte motorGrafo = new GrafoPlanetarioMarte();
    private static String nodoActualGlobal = "N0";
    private static double radSolarGlobal = 12.0;
    private static double pesoTotalGlobalKg = 150.0;
    private static double vientoGlobalKmh = 22.0;
    private static boolean roverApoyoGlobal = false;

    public static void main(String[] args) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress("0.0.0.0", 8081), 0);
        server.createContext("/calcular-ruta", new CalcularRutaHandler());
        server.createContext("/registrar-urgencia", new UrgenciaAutonomaHandler());
        server.createContext("/cambiar-zona", new CambiarZonaHandler());
        server.setExecutor(null);
        server.start();

        System.out.println("==========================================================================");
        System.out.println(" ARES SAFE-ROUTE | MOTOR JAVA A* (SIN VENTANA EXTERNA) ACTIVO EN :8081");
        System.out.println(" -> Conectado en tiempo real con Python (:8080) y Angular 3D/AR (:4200)");
        System.out.println("==========================================================================");
    }

    static class CalcularRutaHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            Map<String, String> params = leerParametros(exchange.getRequestURI().getQuery());
            if (params.containsKey("rad")) radSolarGlobal = Double.parseDouble(params.get("rad"));
            if (params.containsKey("nodo")) nodoActualGlobal = params.get("nodo");
            if (params.containsKey("peso")) pesoTotalGlobalKg = Double.parseDouble(params.get("peso"));
            if (params.containsKey("viento")) vientoGlobalKmh = Double.parseDouble(params.get("viento"));
            if (params.containsKey("rover")) roverApoyoGlobal = Boolean.parseBoolean(params.get("rover"));

            GrafoPlanetarioMarte.ResultadoCalculo res = motorGrafo.decidirRutaAutonoma(
                nodoActualGlobal, radSolarGlobal, pesoTotalGlobalKg, vientoGlobalKmh, roverApoyoGlobal
            );
            enviarJson(exchange, construirJsonRespuesta(res));
        }
    }

    static class UrgenciaAutonomaHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            Map<String, String> params = leerParametros(exchange.getRequestURI().getQuery());
            if (params.containsKey("nodo")) nodoActualGlobal = params.get("nodo");
            if (params.containsKey("rad")) radSolarGlobal = Double.parseDouble(params.get("rad"));
            String causa = params.getOrDefault("causa", "EMERGENCIA_TERRENO_Y_RADIACION");

            NodoMarte nuevoNodo = motorGrafo.generarNodoAutonomoEnCaminata(nodoActualGlobal, causa);
            nodoActualGlobal = nuevoNodo.id;
            if (radSolarGlobal < 25.0) radSolarGlobal = 32.0;

            GrafoPlanetarioMarte.ResultadoCalculo res = motorGrafo.decidirRutaAutonoma(
                nodoActualGlobal, radSolarGlobal, pesoTotalGlobalKg, vientoGlobalKmh, roverApoyoGlobal
            );
            res.codigoAccion = "URGENCIA";
            res.decisionTactica = "🚨 RUTA DE URGENCIA CREADA EN JAVA: NODO AUTÓNOMO [" + nuevoNodo.id + "] REGISTRADO";
            enviarJson(exchange, construirJsonRespuesta(res));
        }
    }

    static class CambiarZonaHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            Map<String, String> params = leerParametros(exchange.getRequestURI().getQuery());
            String nuevaZona = params.getOrDefault("zona", "GALE_SHARP");
            motorGrafo.cargarZonaPlanetaria(nuevaZona);
            nodoActualGlobal = "N0";
            GrafoPlanetarioMarte.ResultadoCalculo res = motorGrafo.decidirRutaAutonoma(
                nodoActualGlobal, radSolarGlobal, pesoTotalGlobalKg, vientoGlobalKmh, roverApoyoGlobal
            );
            enviarJson(exchange, construirJsonRespuesta(res));
        }
    }

    private static String construirJsonRespuesta(GrafoPlanetarioMarte.ResultadoCalculo res) {
        StringBuilder json = new StringBuilder();
        json.append(String.format(Locale.US,
            "{\"version\":\"v6_3d_crateres\",\"zona_planetaria\":\"%s\",\"nodo_global\":\"%s\"," +
            "\"rad_global\":%.1f,\"peso_global_kg\":%.1f,\"viento_global_kmh\":%.1f,\"rover_activo\":%b," +
            "\"decision_tactica\":\"%s\",\"codigo_accion\":\"%s\",\"alerta_terreno\":\"%s\"," +
            "\"objetivo_cientifico\":\"%s\",\"distancia_total_m\":%.1f,\"desnivel_positivo_m\":%.1f," +
            "\"dosis_tramo_uSv\":%.2f,\"total_nodos_urgencia\":%d,\"bitacora_urgencias\":%s,",
            motorGrafo.getZonaActual(), nodoActualGlobal, radSolarGlobal, pesoTotalGlobalKg,
            vientoGlobalKmh, roverApoyoGlobal, res.decisionTactica, res.codigoAccion,
            res.alertaTerreno, res.objetivoCientifico, res.distanciaTotalM, res.desnivelPositivoM,
            res.dosisTramoUSv, motorGrafo.getBitacora().getNodosCreadosEnUrgencia().size(),
            motorGrafo.getBitacora().toJsonBitacora()
        ));

        // Envía los 6 cráteres detectados a Angular para esculpirlos en 3D y en AR
        json.append("\"crateres_detectados\":[");
        List<AnalizadorCrateresMarte.CraterDetectado> crateres = motorGrafo.getCrateresDetectados();
        for (int i = 0; i < crateres.size(); i++) {
            json.append(crateres.get(i).toJson());
            if (i < crateres.size() - 1) json.append(",");
        }
        json.append("],");

        json.append("\"nodos_ruta\":[");
        for (int i = 0; i < res.nodosRuta.size(); i++) {
            NodoMarte n = res.nodosRuta.get(i);
            double pend = 3.5;
            if (i < res.nodosRuta.size() - 1) {
                pend = Math.round(new AristaMarte(n, res.nodosRuta.get(i + 1)).pendienteGrados * 10.0) / 10.0;
            }
            json.append(n.toJson(radSolarGlobal, pend));
            if (i < res.nodosRuta.size() - 1) json.append(",");
        }

        json.append("],\"todos_nodos\":[");
        int idx = 0;
        for (NodoMarte n : motorGrafo.getNodos().values()) {
            json.append(n.toJson(radSolarGlobal, 3.5));
            if (++idx < motorGrafo.getNodos().size()) json.append(",");
        }

        json.append("],\"aristas_mapa\":[");
        List<String[]> aristas = motorGrafo.getListaConexiones();
        for (int i = 0; i < aristas.size(); i++) {
            NodoMarte o = motorGrafo.getNodos().get(aristas.get(i)[0]);
            NodoMarte d = motorGrafo.getNodos().get(aristas.get(i)[1]);
            json.append(String.format("{\"x1\":%d,\"y1\":%d,\"x2\":%d,\"y2\":%d}", o.svgX, o.svgY, d.svgX, d.svgY));
            if (i < aristas.size() - 1) json.append(",");
        }
        json.append("]}");
        return json.toString();
    }

    private static Map<String, String> leerParametros(String query) {
        Map<String, String> map = new HashMap<>();
        if (query == null) return map;
        for (String param : query.split("&")) {
            String[] kv = param.split("=");
            if (kv.length == 2) map.put(kv[0], kv[1]);
        }
        return map;
    }

    private static void enviarJson(HttpExchange exchange, String json) throws IOException {
        byte[] response = json.getBytes("UTF-8");
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.sendResponseHeaders(200, response.length);
        OutputStream os = exchange.getResponseBody();
        os.write(response);
        os.close();
    }
}