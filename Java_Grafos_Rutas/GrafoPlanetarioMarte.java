import java.util.*;

public class GrafoPlanetarioMarte {
    private Map<String, NodoMarte> nodos = new LinkedHashMap<>();
    private Map<String, List<AristaMarte>> adyacencia = new HashMap<>();
    private List<String[]> listaConexiones = new ArrayList<>();
    private List<AnalizadorCrateresMarte.CraterDetectado> crateresDetectados = new ArrayList<>();
    private BitacoraRutaUrgencia bitacora = new BitacoraRutaUrgencia();
    private String zonaActual = "MOLA_463M_USGS_SIM3292";
    private int contadorEscapes = 1;

    public static class ResultadoCalculo {
        public String decisionTactica;
        public String codigoAccion;
        public List<NodoMarte> nodosRuta;
        public double distanciaTotalM;
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
        contadorEscapes = 1;
        crateresDetectados = AnalizadorCrateresMarte.detectarCrateresEnMapa();

        // 1. CORREDOR CENTRAL PRIMARIO (Por donde camina el astronauta en clima normal, lejos de las orillas)
        int[][] rutaCentralValle = {
            {32, 126},  // N0: Inicio Centro-Izquierda
            {78, 128},  // C1: Valle entre CR_1 y CR_4
            {122, 118}, // C2: Entrada antes de CR_2
            {168, 162}, // C3: Paso central bajo CR_2 y sobre CR_4/CR_5
            {216, 138}, // C4: Cruce central entre CR_2, CR_3 y CR_5
            {268, 134}, // C5: Valle central bajo CR_3
            {318, 112}, // C6: Paso antes de CR_6
            {368, 122}  // META: Destino Centro-Derecha
        };

        String[] idsCentrales = {"N0", "C1", "C2", "C3", "C4", "C5", "C6", "META"};
        for (int i = 0; i < idsCentrales.length; i++) {
            String id = idsCentrales[i];
            int sx = rutaCentralValle[i][0];
            int sy = rutaCentralValle[i][1];
            agregarNodo(new NodoMarte(
                id, "Valle Central [" + id + "]", codigoZona,
                id.equals("N0") ? "BASE" : id.equals("META") ? "CIMA" : "RUTA",
                "VALLE_CENTRAL_MOLA", "Canal Fluvial (USGS Hto)", -55.0, i,
                -4.50, 137.40 + (i * 0.001), -3240.0 + (i * 4.5), 1.0, 0.85, sx, sy, false
            ));
        }

        // 2. CORREDOR DE SALIDA SEGURA SUPERIOR (A media altura, sin pegarse a la orilla del mapa)
        int[][] corredorSeguroAlto = {
            {72, 68},   // S1: Paso Noroeste
            {128, 72},  // S2: Canal Seguro entre CR_1 y CR_2
            {175, 76},  // S3: Mirador Norte sobre CR_2
            {218, 68},  // S4: Puente Seguro entre CR_2 y CR_3
            {265, 46},  // S5: Arco Norte sobre CR_3
            {316, 78}   // S6: Bajada Segura hacia META
        };

        for (int i = 0; i < corredorSeguroAlto.length; i++) {
            String id = "S" + (i + 1);
            int sx = corredorSeguroAlto[i][0];
            int sy = corredorSeguroAlto[i][1];
            agregarNodo(new NodoMarte(
                id, "Ruta Segura [" + id + "]", codigoZona, "REFUGIO",
                "RUTA_SEGURA_NORTE", "Planicie Volcánica (USGS lHv)", -53.0, i + 1,
                -4.49, 137.41 + (i * 0.001), -3220.0 + (i * 4.0), 0.15, 1.15, sx, sy, false
            ));
        }

        // 3. Malla complementaria y anillos de cráteres para visualización completa del grafo
        for (AnalizadorCrateresMarte.CraterDetectado cr : crateresDetectados) {
            int puntos = 8;
            double radioSeg = cr.radioSvg * 1.34;
            for (int k = 0; k < puntos; k++) {
                double ang = (k / (double) puntos) * Math.PI * 2.0;
                int rx = Math.max(24, Math.min(376, (int) Math.round(cr.centroSvgX + Math.cos(ang) * radioSeg)));
                int ry = Math.max(38, Math.min(220, (int) Math.round(cr.centroSvgY + Math.sin(ang) * radioSeg)));

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
                        -4.51, 137.41, -3230.0, 0.70, 1.25, rx, ry, false
                    ));
                }
            }
        }

        conectarRedSegura();
        // Asegura la conexión directa de la ruta central y del corredor seguro
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

    /**
     * GENERADOR DE NODO DE ESCAPE DINÁMICO EN DIRECCIÓN OPUESTA A LA RADIACIÓN:
     * Crea un nodo de salida rápida justo desde la posición actual del astronauta
     * alejándose del epicentro de la radiación y conectándolo a la ruta segura.
     */
    public synchronized NodoMarte generarNodoAutonomoEnCaminata(String nodoOrigenId, String causaUrgencia) {
        NodoMarte origen = nodos.getOrDefault(nodoOrigenId, nodos.get("C2"));
        String nuevoId = "ESC_" + contadorEscapes++;

        // Vector de repulsión: siempre hacia arriba/adelante (alejándose de la radiación en svgY=225)
        int escX = Math.max(65, Math.min(330, origen.svgX + 18));
        int escY = Math.max(52, Math.min(92, origen.svgY - 42));

        // Si cae cerca de un cráter, lo desplaza al corredor libre entre cráteres
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

        // Conecta el nodo de escape con los nodos seguros del corredor norte (S1..S6) más cercanos
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

        NodoMarte nodoInicio = nodos.get(inicioId);
        double factorOnda = Math.max(0.0, (radSolar - 10.0) / 80.0);
        double epicentroX = 185.0;
        double epicentroY = 230.0 - factorOnda * 70.0;
        double radioOnda = 28.0 + factorOnda * 68.0;

        // Si la radiación va a alcanzar al astronauta en la ruta central, genera automáticamente un nodo de escape ahí mismo
        if (radSolar >= 26.0 && nodoInicio.svgY > 95 && contadorEscapes <= 4) {
            NodoMarte escapeCreado = generarNodoAutonomoEnCaminata(inicioId, "ALCANCE_RADIACION_EN_RUTA");
            conectar(inicioId, escapeCreado.id);
        }

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

        while (!abiertos.isEmpty()) {
            String u = abiertos.poll();
            if (u.equals(destinoId)) break;
            NodoMarte nodoU = nodos.get(u);

            for (AristaMarte arista : adyacencia.get(u)) {
                NodoMarte vecino = arista.destino;
                double distEscalaM = Math.hypot(vecino.svgX - nodoU.svgX, vecino.svgY - nodoU.svgY) * 0.785;
                double penalizacion = 0.0;

                if (radSolar < 26.0) {
                    // EN CLIMA NORMAL (Radiación < 26): Prefiere el Valle Central (C1..C6) y evita irse por la orilla superior
                    if (vecino.svgY < 90) penalizacion += 450.0;
                } else {
                    // CUANDO LA RADIACIÓN SE ACERCA (Radiación >= 26): Bloquea la zona de radiación y usa el Nodo de Escape hacia S1..S6
                    double distVecinoOnda = Math.hypot(vecino.svgX - epicentroX, vecino.svgY - epicentroY);
                    if (distVecinoOnda < radioOnda + 35.0) {
                        penalizacion += 50000.0; // Jamás entra hacia la radiación
                    }
                    if (vecino.svgY > 105 && !vecino.id.equals("META")) {
                        penalizacion += (vecino.svgY - 90) * radSolar * 2.5;
                    }
                    if (vecino.creadoEnUrgencia || vecino.tipoTerreno.equals("RUTA_SEGURA_NORTE")) {
                        penalizacion -= 60.0; // Prioriza el nodo de escape recién creado y la ruta segura
                    }
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
        res.objetivoCientifico = "USGS SIM 3292 + MOLA DEM";
        return res;
    }

    public ResultadoCalculo decidirRutaAutonoma(String nodoActual, double radSolar, double pesoKg, double vientoKmh, boolean roverApoyo) {
        if (!nodos.containsKey(nodoActual)) nodoActual = "N0";
        ResultadoCalculo ruta = ejecutarDijkstraMulticriterio(nodoActual, "META", radSolar, pesoKg, vientoKmh, roverApoyo, "NORMAL");

        if (radSolar >= 26.0) {
            ruta.codigoAccion = "DESVIO";
            ruta.decisionTactica = "🚨 RADIACIÓN ALCANZANDO RUTA CENTRAL: NODO DE ESCAPE CREADO HACIA CORREDOR SEGURO";
        } else {
            ruta.codigoAccion = "AVANZAR";
            ruta.decisionTactica = "✅ RUTA CENTRAL MOLA: AVANZANDO ENTRE CRÁTERES POR VALLE PRINCIPAL (0.62 m/s)";
        }
        return ruta;
    }

    public List<AnalizadorCrateresMarte.CraterDetectado> getCrateresDetectados() { return crateresDetectados; }
    public Map<String, NodoMarte> getNodos() { return nodos; }
    public List<String[]> getListaConexiones() { return listaConexiones; }
    public BitacoraRutaUrgencia getBitacora() { return bitacora; }
    public String getZonaActual() { return zonaActual; }
}