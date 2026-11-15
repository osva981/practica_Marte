import java.util.*;

public class BitacoraRutaUrgencia {
    private Stack<String> pilaPasosRecorridos = new Stack<>();
    private LinkedList<String> eventosEmergencia = new LinkedList<>();
    private List<NodoMarte> nodosCreadosEnUrgencia = new ArrayList<>();

    public BitacoraRutaUrgencia() {
        pilaPasosRecorridos.push("N0");
        eventosEmergencia.add("SOL 145 [INICIO EVA]: Sistemas de mapeo autónomo activos en N0.");
    }

    public void registrarPasoAstronauta(String nodoId, String razon) {
        if (pilaPasosRecorridos.isEmpty() || !pilaPasosRecorridos.peek().equals(nodoId)) {
            pilaPasosRecorridos.push(nodoId);
            String registro = String.format("PASO REGISTRADO -> Nodo %s (%s)", nodoId, razon);
            agregarEvento(registro);
        }
    }

    public void registrarNuevoNodoUrgencia(NodoMarte nuevoNodo, String nodoOrigenId, String causaUrgencia) {
        nodosCreadosEnUrgencia.add(nuevoNodo);
        pilaPasosRecorridos.push(nuevoNodo.id);
        String alerta = String.format(
            "¡NUEVA RUTA GENERADA! Nodo autónomo [%s] creado desde [%s] por %s (Alt: %.0fm, Terreno: %s)",
            nuevoNodo.id, nodoOrigenId, causaUrgencia, nuevoNodo.altitudM, nuevoNodo.tipoTerreno
        );
        agregarEvento(alerta);
    }

    private void agregarEvento(String texto) {
        eventosEmergencia.addFirst(texto);
        if (eventosEmergencia.size() > 12) {
            eventosEmergencia.removeLast();
        }
    }

    public List<String> obtenerRutaRetornoInmediato() {
        List<String> inversa = new ArrayList<>(pilaPasosRecorridos);
        Collections.reverse(inversa);
        return inversa;
    }

    public List<NodoMarte> getNodosCreadosEnUrgencia() {
        return nodosCreadosEnUrgencia;
    }

    public String toJsonBitacora() {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < eventosEmergencia.size(); i++) {
            sb.append("\"").append(eventosEmergencia.get(i).replace("\"", "'")).append("\"");
            if (i < eventosEmergencia.size() - 1) sb.append(",");
        }
        sb.append("]");
        return sb.toString();
    }
}