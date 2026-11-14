// Tipos TypeScript para las respuestas de los backends Java (8081) y Python (8080)

export interface NodoRutaJava {
  id: string;
  nombre: string;
  tipo: 'RUTA' | 'BASE' | 'CIMA' | 'REFUGIO';
  lat: number;
  lon: number;
  altitud: number;
  pendiente: number;
  rad_nodo: number;
  svgX: number;
  svgY: number;
}

export interface AristaMapa {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface RespuestaJava {
  decision_tactica: string;
  codigo_accion: 'AVANZAR' | 'DESVIO' | 'REGRESAR' | 'REFUGIO';
  distancia_total_m: number;
  desnivel_positivo_m: number;
  dosis_tramo_uSv: number;
  nodos_ruta: NodoRutaJava[];
  todos_nodos: { id: string; nombre: string; tipo: string; svgX: number; svgY: number; altitud: number }[];
  aristas_mapa: AristaMapa[];
}

export interface CalculosFisicos {
  distancia_total_m: number;
  desnivel_positivo_m: number;
  velocidad_real_m_s: number;
  pendiente_promedio_grados: number;
  dosis_traje_uSv_h: number;
  dosis_acumulada_uSv: number;
  porcentaje_limite_nasa: number;
  esfuerzo_metabolico_w: number;
  consumo_o2_l_min: number;
  ritmo_cardiaco_bpm: number;
  oxigeno_pct: number;
  angulo_giro_hud: number;
}

export interface AlertaRadiacion {
  activa: boolean;
  codigo_accion: string;
  mensaje_hud: string;
  intensidad_tormenta: number;
  tiempo_para_impacto_seg: number;
  tiempo_llegada_refugio_seg: number;
  margen_supervivencia_seg: number;
}

export interface RespuestaPython {
  sol_mision: number;
  zona: string;
  nodo_actual_id: string;
  siguiente_waypoint: string;
  alerta_radiacion: AlertaRadiacion;
  calculos_fisicos: CalculosFisicos;
  ruta_grafo_java: NodoRutaJava[];
  todos_nodos: { id: string; nombre: string; tipo: string; svgX: number; svgY: number; altitud: number }[];
  aristas_mapa: AristaMapa[];
}