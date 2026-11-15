import java.util.*;

public class GrafoPlanetarioMarte {
    private Map<String, NodoMarte> nodos = new LinkedHashMap<>();
    private Map<String, List<AristaMarte>> adyacencia = new HashMap<>();
    private List<String[]> listaConexiones = new ArrayList<>();
    private List<AnalizadorCrateresMarte.CraterDetectado> crateresDetectados = new ArrayList<>();
    private List<int[]> peligrosWazeActivos = new ArrayList<>(); // [svgX, svgY, radio]
    private BitacoraRutaUrgencia bitacora = new BitacoraRutaUrgencia();
    private String zonaActual = "MOLA_463M_USGS_SIM3292";
    private int contadorEscapes = 1;

    public static class ResultadoCalculo {
        public String decisionTactica;
        public String codigoAccion;
        public List<NodoMarte> nodosRuta;
        public List<NodoMarte> nodosRutaAlternativa;
        public double distanciaTotalM;
        public double distanciaAlternativaM;
        public double desnivelPositivoM;
        public double dosisTramoUSv;
        public String alertaTerreno;
        public String objetivoCientifico;
    }

    public GrafoPlanetarioMarte() {
        cargarZonaPlanetaria("MOLA_463M_USGS_SIM3292");
    }

    public void cargarZonaPlanetaria(String codigoZona) {
        this.zonaActual = codigoZona;
        nodos.clear();
        adyacencia.clear();
        listaConexiones.clear();
        peligrosWazeActivos.clear();
        contadorEscapes = 1;
        crateresDetectados = AnalizadorCrateresMarte.detectarCrateresEnMapa();

        // 1. Ruta A: Valle Central (Canal Fluvial USGS Hto)
        int[][] rutaCentralValle = {
            {32, 126}, {78, 128}, {122, 122}, {168, 160},
            {216, 138}, {268, 134}, {318, 112}, {368, 122}
        };
        String[] idsCentrales = {"N0", "C1", "C2", "C3", "C4", "C5", "C6", "META"};
        for (int i = 0; i < idsCentrales.length; i++) {
            String id = idsCentrales[i];
            agregarNodo(new NodoMarte(
                id, "Valle Central [" + id + "]", codigoZona,
                id.equals("N0") ? "BASE" : id.equals("META") ? "CIMA" : "RUTA",
                "VALLE_CENTRAL_MOLA", "Canal Fluvial (USGS Hto)", -55.0, i,
                -4.50, 137.40 + (i * 0.001), -3242.0 + (i * 5.2), 1.0, 0.85,
                rutaCentralValle[i][0], rutaCentralValle[i][1], false
            ));
        }

        // 2. Ruta B: Corredor Volcánico Seguro Superior (Planicie Basáltica USGS lHv)
        int[][] corredorSeguroAlto = {
            {72, 68}, {128, 72}, {175, 74}, {218, 68}, {265, 46}, {316, 78}
        };
        for (int i = 0; i < corredorSeguroAlto.length; i++) {
            String id = "S" + (i + 1);
            agregarNodo(new NodoMarte(
                id, "Corredor Volcánico [" + id + "]", codigoZona, "REFUGIO",
                "RUTA_SEGURA_NORTE", "Planicie Volcánica (USGS lHv)", -53.0, i + 1,
                -4.49, 137.41 + (i * 0.001), -3218.0 + (i * 3.2), 0.15, 1.05,
                corredorSeguroAlto[i][0], corredorSeguroAlto[i][1], false
            ));
        }

        // 3. Anillos exteriores alrededor de los 6 cráteres (Unidades de Impacto USGS AHi)
        for (AnalizadorCrateresMarte.CraterDetectado cr : crateresDetectados) {
            int puntos = 8;
            double radioSeg = cr.radioSvg * 1.34;
            for (int k = 0; k < puntos; k++) {
                double ang = (k / (double) puntos) * Math.PI * 2.0;
                int rx = Math.max(24, Math.min(376, (int) Math.round(cr.centroSvgX + Math.cos(ang) * radioSeg)));
                int ry = Math.max(38, Math.min(220, (int) Math.round(cr.svgY + Math.sin(ang) * radioSeg)));

                boolean chocaOtro = false;
                for (AnalizadorCrateresMarte.CraterDetectado otro : crateresDetectados) {
                    if (!otro.id.equals(cr.id) && Math.hypot(rx - otro.centroSvgX, ry - otro.centroSvgY) < otro.radioSvg * 1.20) {
                        chocaOtro = true;
                        break;
                    }
                }
                if (!chocaOtro) {
                    String idRing = cr.id + "_R" + k;
                    agregarNodo(new NodoMarte(
                        idRing, "Contorno " + idRing, codigoZona, "RUTA",
                        "FALDA_CRATER_SEGURA", "Unidad Borde (USGS lHv)", -54.0, rx / 45,
                        -4.51, 137.41, -3230.0, 0.65, 1.20, rx, ry, false
                    ));
                }
            }
        }

        conectarRedSegura();
        for (int i = 0; i < idsCentrales.length - 1; i++) conectar(idsCentrales[i], idsCentrales[i + 1]);
        conectar("N0", "S1");
        for (int i = 1; i < 6; i++) conectar("S" + i, "S" + (i + 1));
        conectar("S6", "C6");
        conectar("S6", "META");
        conectar("C1", "S2");
        conectar("C2", "S2");
        conectar("C2", "S3");
        conectar("C4", "S4");
        conectar("C5", "S6");
    }

    public synchronized void registrarPeligroWaze(int svgX, int svgY, int radio, String tipoAlerta) {
        peligrosWazeActivos.add(new int[]{svgX, svgY, radio});
        bitacora.registrarPasoAstronauta("ALERTA_WAZE", tipoAlerta + " en (" + svgX + "," + svgY + ")");
    }

    private void conectarRedSegura() {
        listaConexiones.clear();
        for (List<AristaMarte> l : adyacencia.values()) l.clear();

        List<NodoMarte> todos = new ArrayList<>(nodos.values());
        for (int i = 0; i < todos.size(); i++) {
            NodoMarte a = todos.get(i);
            for (int j = i + 1; j < todos.size(); j++) {
                NodoMarte b = todos.get(j);
                if (Math.hypot(a.svgX - b.svgX, a.svgY - b.svgY) <= 68.0 &&
                    !aristaTocaCraterEstricto(a.svgX, a.svgY, b.svgX, b.svgY)) {
                    conectar(a.id, b.id);
                }
            }
        }
    }

    private boolean aristaTocaCraterEstricto(int x1, int y1, int x2, int y2) {
        for (AnalizadorCrateresMarte.CraterDetectado c : crateresDetectados) {
            for (int s = 0; s <= 20; s++) {
                double t = s / 20.0;
                double px = x1 + t * (x2 - x1);
                double py = y1 + t * (y2 - y1);
                if (Math.hypot(px - c.centroSvgX, py - c.centroSvgY) < c.radioSvg * 1.15) {
                    return true;
                }
            }
        }
        return false;
    }

    public void agregarNodo(NodoMarte n) {
        nodos.put(n.id, n);
        adyacencia.putIfAbsent(n.id, new ArrayList<>());
    }

    public void conectar(String id1, String id2) {
        NodoMarte n1 = nodos.get(id1);
        NodoMarte n2 = nodos.get(id2);
        if (n1 == null || n2 == null) return;
        adyacencia.get(id1).add(new AristaMarte(n1, n2));
        adyacencia.get(id2).add(new AristaMarte(n2, n1));
        listaConexiones.add(new String[]{id1, id2});
    }

    public synchronized NodoMarte generarNodoAutonomoEnCaminata(String nodoOrigenId, String causaUrgencia) {
        NodoMarte origen = nodos.getOrDefault(nodoOrigenId, nodos.get("C2"));
        String nuevoId = "ESC_" + contadorEscapes++;

        int escX = Math.max(65, Math.min(330, origen.svgX + 18));
        int escY = Math.max(52, Math.min(92, origen.svgY - 42));

        for (AnalizadorCrateresMarte.CraterDetectado c : crateresDetectados) {
            double d = Math.hypot(escX - c.centroSvgX, escY - c.centroSvgY);
            if (d < c.radioSvg * 1.32) {
                double ang = Math.atan2(escY - c.centroSvgY, escX - c.centroSvgX);
                escX = (int) Math.round(c.centroSvgX + Math.cos(ang) * c.radioSvg * 1.38);
                escY = Math.max(48, (int) Math.round(c.centroSvgY + Math.sin(ang) * c.radioSvg * 1.38));
            }
        }

        NodoMarte nodoEscape = new NodoMarte(
            nuevoId, "Salida Rápida " + nuevoId, this.zonaActual, "REFUGIO", "SALIDA_EMERGENCIA",
            "Puente Escape Anti-Radiación (USGS lHv)", -53.0, origen.orden + 1,
            origen.lat + 0.0004, origen.lon + 0.0005, origen.altitudM + 3.0,
            0.05, 0.80, escX, escY, true
        );

        agregarNodo(nodoEscape);
        conectar(origen.id, nuevoId);

        for (int i = 1; i <= 6; i++) {
            NodoMarte s = nodos.get("S" + i);
            if (s != null && Math.hypot(s.svgX - escX, s.svgY - escY) <= 95.0) {
                conectar(nuevoId, s.id);
            }
        }

        bitacora.registrarNuevoNodoUrgencia(nodoEscape, origen.id, causaUrgencia);
        return nodoEscape;
    }

    public ResultadoCalculo ejecutarDijkstraMulticriterio(String inicioId, String destinoId, double radSolar,
                                                          double pesoTotalKg, double vientoKmh, boolean roverApoyo, String modo) {
        if (!nodos.containsKey(inicioId)) inicioId = "N0";
        if (!nodos.containsKey(destinoId)) destinoId = "META";

        NodoMarte nodoMeta = nodos.get(destinoId);
        Map<String, Double> gScore = new HashMap<>();
        Map<String, Double> fScore = new HashMap<>();
        Map<String, Double> distAcum = new HashMap<>();
        Map<String, String> previos = new HashMap<>();

        PriorityQueue<String> abiertos = new PriorityQueue<>(Comparator.comparingDouble(id -> fScore.getOrDefault(id, Double.MAX_VALUE)));
        for (String id : nodos.keySet()) {
            gScore.put(id, Double.MAX_VALUE);
            fScore.put(id, Double.MAX_VALUE);
            distAcum.put(id, 0.0);
        }

        gScore.put(inicioId, 0.0);
        fScore.put(inicioId, 0.0);
        abiertos.add(inicioId);

        double factorOnda = Math.max(0.0, (radSolar - 10.0) / 80.0);
        double epicentroX = 185.0;
        double epicentroY = 230.0 - factorOnda * 70.0;
        double radioOnda = 28.0 + factorOnda * 68.0;

        while (!abiertos.isEmpty()) {
            String u = abiertos.poll();
            if (u.equals(destinoId)) break;
            NodoMarte nodoU = nodos.get(u);

            for (AristaMarte arista : adyacencia.get(u)) {
                NodoMarte vecino = arista.destino;
                double distEscalaM = Math.hypot(vecino.svgX - nodoU.svgX, vecino.svgY - nodoU.svgY) * 0.785;
                double penalizacion = 0.0;

                // Penaliza cualquier Pin de Peligro Waze colocado en el mapa
                for (int[] waze : peligrosWazeActivos) {
                    if (Math.hypot(vecino.svgX - waze[0], vecino.svgY - waze[1]) < waze[2] + 22.0) {
                        penalizacion += 45000.0;
                    }
                }

                if (modo.equals("FORZAR_ALTERNATIVA_NORTE") || radSolar >= 26.0) {
                    double distVecinoOnda = Math.hypot(vecino.svgX - epicentroX, vecino.svgY - epicentroY);
                    if (distVecinoOnda < radioOnda + 35.0) penalizacion += 50000.0;
                    if (vecino.svgY > 105 && !vecino.id.equals(destinoId)) {
                        penalizacion += (vecino.svgY - 90) * 85.0;
                    }
                } else {
                    if (vecino.svgY < 90 && !vecino.id.equals(destinoId)) penalizacion += 450.0;
                }

                double tentativoG = gScore.get(u) + (distEscalaM * vecino.riesgoTerreno) + penalizacion;
                if (tentativoG < gScore.get(vecino.id)) {
                    previos.put(vecino.id, u);
                    gScore.put(vecino.id, tentativoG);
                    double heuristica = Math.hypot(vecino.svgX - nodoMeta.svgX, vecino.svgY - nodoMeta.svgY) * 0.785;
                    fScore.put(vecino.id, tentativoG + heuristica);
                    distAcum.put(vecino.id, distAcum.get(u) + distEscalaM);
                    abiertos.add(vecino.id);
                }
            }
        }

        ResultadoCalculo res = new ResultadoCalculo();
        res.nodosRuta = new ArrayList<>();
        String paso = destinoId;
        while (paso != null) {
            res.nodosRuta.add(0, nodos.get(paso));
            paso = previos.get(paso);
        }
        if (res.nodosRuta.isEmpty()) res.nodosRuta.add(nodos.get(inicioId));

        res.distanciaTotalM = Math.round(distAcum.getOrDefault(destinoId, 289.22) * 100.0) / 100.0;
        res.desnivelPositivoM = 42.0;
        res.dosisTramoUSv = Math.round((9.5 + radSolar * 0.28) * 10.0) / 10.0;
        res.alertaTerreno = res.nodosRuta.get(0).datoQuimico;
        res.objetivoCientifico = "Google Maps Marte: Multi-Ruta A* + Alertas Waze";
        return res;
    }

    public ResultadoCalculo decidirRutaAutonoma(String nodoActual, double radSolar, double pesoKg, double vientoKmh, boolean roverApoyo) {
        if (!nodos.containsKey(nodoActual)) nodoActual = "N0";
        ResultadoCalculo principal = ejecutarDijkstraMulticriterio(nodoActual, "META", radSolar, pesoKg, vientoKmh, roverApoyo, "NORMAL");
        String modoAlt = (radSolar >= 26.0) ? "NORMAL" : "FORZAR_ALTERNATIVA_NORTE";
        ResultadoCalculo alternativa = ejecutarDijkstraMulticriterio(nodoActual, "META", 12.0, pesoKg, vientoKmh, roverApoyo, modoAlt);

        principal.nodosRutaAlternativa = alternativa.nodosRuta;
        principal.distanciaAlternativaM = alternativa.distanciaTotalM;

        if (radSolar >= 26.0) {
            principal.codigoAccion = "DESVIO";
            principal.decisionTactica = "🚨 RADIACIÓN EN VALLE CENTRAL: RUTA B (VOLCÁNICA NORTE lHv) ACTIVA";
        } else {
            principal.codigoAccion = "AVANZAR";
            principal.decisionTactica = "✅ RUTA A (VALLE CENTRAL Hto): AVANZANDO ENTRE CRÁTERES A 0.62 m/s";
        }
        return principal;
    }

    public List<AnalizadorCrateresMarte.CraterDetectado> getCrateresDetectados() { return crateresDetectados; }
    public Map<String, NodoMarte> getNodos() { return nodos; }
    public List<String[]> getListaConexiones() { return listaConexiones; }
    public BitacoraRutaUrgencia getBitacora() { return bitacora; }
    public String getZonaActual() { return zonaActual; }
}