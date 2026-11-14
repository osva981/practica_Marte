import { Component, OnInit, AfterViewInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as THREE from 'three';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class App implements OnInit, AfterViewInit, OnDestroy {
  hostBackend: string = 'localhost';

  intensidadTormenta: number = 12;
  nodoActualId: string = 'N0';
  caminataActiva: boolean = true;
  vistaPrimeraPersona: boolean = false;
  datosMision: any = null;

  // Coordenada continua del astronauta que NUNCA se reinicia al cambiar la radiación
  posAstroSvg = { x: 34, y: 126 };
  indiceWaypointObjetivo: number = 1;
  angulosCasco = { rumboGrados: 90, inclinacionGrados: 2.1 };

  // ESCENA 1 (IZQUIERDA): Superficie con Astronauta 3D Articulado + Flecha Verde + Cinta Azul
  private sceneMini!: THREE.Scene;
  private cameraMini!: THREE.PerspectiveCamera;
  private rendererMini!: THREE.WebGLRenderer;
  private actorSuperficieGroup!: THREE.Group;
  private piernaIzq!: THREE.Mesh;
  private piernaDer!: THREE.Mesh;
  private brazoIzq!: THREE.Mesh;
  private brazoDer!: THREE.Mesh;
  private grupoRutaMini!: THREE.Group;
  private grupoOndaMini!: THREE.Group;

  // ESCENA 2 (DERECHA): Mapa MOLA de Cráteres, Nodos y Salida de Escape
  private sceneMapaNodos!: THREE.Scene;
  private cameraMapaNodos!: THREE.PerspectiveCamera;
  private rendererMapaNodos!: THREE.WebGLRenderer;
  private grupoGrafoCompleto!: THREE.Group;
  private grupoCrateresRojos!: THREE.Group;
  private grupoOndaDerecha!: THREE.Group;
  private marcadorAstronautaDerecha!: THREE.Group;

  private animFrameId: any;
  private reloj = new THREE.Clock();
  private tangenteSuave = new THREE.Vector3(1, 0, 0);

  private arrastrandoMini = false;
  private arrastrandoDerecha = false;
  private mousePrev = { x: 0, y: 0 };
  private yawMiniOffset = 0;
  private pitchMiniOffset = 0.38;
  private distMini = 10.5;

  private orbitaDerecha = { theta: 0.0, phi: 0.50, radio: 152 };

  // Los 6 Cráteres reales del escaneo MOLA (Unidades de Impacto USGS AHi)
  private crateresDetectados: any[] = [
    { id: 'CR_1', svgX: 86, svgY: 74, radio: 24, profundidad_m: 950 },
    { id: 'CR_2', svgX: 168, svgY: 118, radio: 29, profundidad_m: 1250 },
    { id: 'CR_3', svgX: 265, svgY: 86, radio: 27, profundidad_m: 1100 },
    { id: 'CR_4', svgX: 118, svgY: 176, radio: 22, profundidad_m: 820 },
    { id: 'CR_5', svgX: 222, svgY: 184, radio: 24, profundidad_m: 940 },
    { id: 'CR_6', svgX: 326, svgY: 154, radio: 26, profundidad_m: 1050 }
  ];

  // Nodos del Valle Central (Con datos exactos MOLA y USGS SIM 3292)
  private readonly nodosValleCentral = [
    { id: 'N0', svgX: 32, svgY: 126, terreno: 'VALLE_CENTRAL', codigo_usgs: 'Hto', unidad: 'Canal de Salida (Hto)', blindaje: 75, alt: -3242.4 },
    { id: 'C1', svgX: 78, svgY: 128, terreno: 'VALLE_CENTRAL', codigo_usgs: 'Hto', unidad: 'Canal Fluvial (Hto)', blindaje: 78, alt: -3236.8 },
    { id: 'C2', svgX: 122, svgY: 122, terreno: 'VALLE_CENTRAL', codigo_usgs: 'HNt', unidad: 'Transición Noeica (HNt)', blindaje: 45, alt: -3231.2 },
    { id: 'C3', svgX: 168, svgY: 160, terreno: 'VALLE_CENTRAL', codigo_usgs: 'HNt', unidad: 'Paso Inter-Cráter (HNt)', blindaje: 35, alt: -3226.5 },
    { id: 'C4', svgX: 216, svgY: 138, terreno: 'VALLE_CENTRAL', codigo_usgs: 'Hto', unidad: 'Cuenca Fluvial (Hto)', blindaje: 65, alt: -3221.0 },
    { id: 'C5', svgX: 268, svgY: 134, terreno: 'VALLE_CENTRAL', codigo_usgs: 'Hto', unidad: 'Valle Central (Hto)', blindaje: 70, alt: -3215.6 },
    { id: 'C6', svgX: 318, svgY: 112, terreno: 'VALLE_CENTRAL', codigo_usgs: 'lHv', unidad: 'Planicie Basáltica (lHv)', blindaje: 50, alt: -3210.1 },
    { id: 'META', svgX: 368, svgY: 122, terreno: 'OBJETIVO_META', codigo_usgs: 'lHv', unidad: 'Afloramiento Boxwork (lHv)', blindaje: 85, alt: -3204.8 }
  ];

  // Nodos del Corredor Seguro Superior (Unidad Volcánica Firme USGS lHv fuera del alcance solar)
  private readonly nodosCorredorSeguro = [
    { id: 'S1', svgX: 72, svgY: 68, terreno: 'RUTA_SEGURA', codigo_usgs: 'lHv', unidad: 'Planicie Volcánica (lHv)', blindaje: 88, alt: -3218.5 },
    { id: 'S2', svgX: 128, svgY: 72, terreno: 'RUTA_SEGURA', codigo_usgs: 'lHv', unidad: 'Flujo Basáltico Firme (lHv)', blindaje: 90, alt: -3214.2 },
    { id: 'S3', svgX: 175, svgY: 74, terreno: 'RUTA_SEGURA', codigo_usgs: 'lHv', unidad: 'Cresta Volcánica (lHv)', blindaje: 86, alt: -3210.7 },
    { id: 'S4', svgX: 218, svgY: 68, terreno: 'RUTA_SEGURA', codigo_usgs: 'lHv', unidad: 'Corredor Protegido (lHv)', blindaje: 92, alt: -3208.3 },
    { id: 'S5', svgX: 265, svgY: 46, terreno: 'RUTA_SEGURA', codigo_usgs: 'lHv', unidad: 'Arco Boreal Seguro (lHv)', blindaje: 94, alt: -3204.0 },
    { id: 'S6', svgX: 316, svgY: 78, terreno: 'RUTA_SEGURA', codigo_usgs: 'lHv', unidad: 'Rampa Basáltica (lHv)', blindaje: 89, alt: -3206.5 }
  ];

  private catalogoNodos: any[] = [];
  private paresAristas: [string, string][] = [];
  private nodosEscapeDinamicos: any[] = [];
  private escapeActivo = false;

  constructor(private cdr: ChangeDetectorRef) {
    if (typeof window !== 'undefined') {
      this.hostBackend = window.location.hostname || 'localhost';
    }
    this.construirRedCompleta();
    this.datosMision = this.recalcularRutaSinReiniciarAstronauta();
  }

  ngOnInit() {
    this.actualizarSistema();
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.inicializarVisoresDuales();
      this.animarSimulacionContinua();
      window.addEventListener('resize', () => this.redimensionarVisores());
    }, 100);
  }

  ngOnDestroy() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
  }

  private aristaTocaCrater(x1: number, y1: number, x2: number, y2: number): boolean {
    for (const c of this.crateresDetectados) {
      for (let s = 0; s <= 20; s++) {
        const t = s / 20.0;
        const px = x1 + t * (x2 - x1);
        const py = y1 + t * (y2 - y1);
        if (Math.hypot(px - c.svgX, py - c.svgY) < c.radio * 1.12) {
          return true;
        }
      }
    }
    return false;
  }

  // Empuja cualquier coordenada fuera del interior de los 6 cráteres
  private asegurarPuntoFueraDeCrateres(x: number, y: number): { x: number; y: number } {
    let rx = x;
    let ry = y;
    for (const c of this.crateresDetectados) {
      const dist = Math.hypot(rx - c.svgX, ry - c.svgY);
      const minSeg = c.radio * 1.28;
      if (dist < minSeg) {
        const ang = Math.atan2(ry - c.svgY, rx - c.svgX);
        rx = c.svgX + Math.cos(ang) * minSeg;
        ry = c.svgY + Math.sin(ang) * minSeg;
      }
    }
    return { x: Math.max(24, Math.min(372, rx)), y: Math.max(36, Math.min(220, ry)) };
  }

  private construirRedCompleta() {
    this.catalogoNodos = [...this.nodosValleCentral, ...this.nodosCorredorSeguro, ...this.nodosEscapeDinamicos];

    for (const cr of this.crateresDetectados) {
      const puntos = 8;
      const radioSeg = cr.radio * 1.35;
      for (let k = 0; k < puntos; k++) {
        const ang = (k / puntos) * Math.PI * 2.0;
        const rx = Math.max(24, Math.min(376, Math.round(cr.svgX + Math.cos(ang) * radioSeg)));
        const ry = Math.max(38, Math.min(220, Math.round(cr.svgY + Math.sin(ang) * radioSeg)));
        let libre = true;
        for (const otro of this.crateresDetectados) {
          if (otro.id !== cr.id && Math.hypot(rx - otro.svgX, ry - otro.svgY) < otro.radio * 1.18) {
            libre = false;
            break;
          }
        }
        if (libre) {
          this.catalogoNodos.push({
            id: `${cr.id}_R${k}`,
            svgX: rx,
            svgY: ry,
            terreno: 'FALDA_CRATER',
            codigo_usgs: 'AHi/lHv',
            unidad: 'Contorno Cráter (lHv)',
            blindaje: 60,
            alt: -3225.0,
            emergencia: false
          });
        }
      }
    }

    this.paresAristas = [];
    for (let i = 0; i < this.catalogoNodos.length; i++) {
      const a = this.catalogoNodos[i];
      for (let j = i + 1; j < this.catalogoNodos.length; j++) {
        const b = this.catalogoNodos[j];
        if (Math.hypot(a.svgX - b.svgX, a.svgY - b.svgY) <= 68 && !this.aristaTocaCrater(a.svgX, a.svgY, b.svgX, b.svgY)) {
          this.paresAristas.push([a.id, b.id]);
        }
      }
    }
  }

  /**
   * RECALCULA LA RUTA DESDE LA POSICIÓN EXACTA ACTUAL DEL ASTRONAUTA (SIN REINICIARLO NUNCA):
   * - Si la radiación sube (o se acerca al astronauta), crea los nodos ★ ESC_1 y ★ ESC_2 justo frente a él hacia la ruta segura.
   * - Si la radiación baja, retoma los nodos del Valle Central que están adelante de su coordenada X actual.
   */
  recalcularRutaSinReiniciarAstronauta() {
    const rad = this.intensidadTormenta;
    const factorOnda = Math.max(0, (rad - 10) / 80);
    const epicentroX = 185;
    const epicentroY = 228 - factorOnda * 65;
    const radioOnda = 26 + factorOnda * 68;

    const ax = this.posAstroSvg.x;
    const ay = this.posAstroSvg.y;
    const distAstroAOnda = Math.hypot(ax - epicentroX, ay - epicentroY);

    // Activa o desactiva la ruta de escape según el nivel de radiación actual, PERO respetando donde está parado el astronauta
    const requiereEscape = rad >= 26 || distAstroAOnda < radioOnda + 34;

    let waypointsAdelante: any[] = [];
    let codigoAccion = 'AVANZAR';
    let mensajeHud = '✅ RUTA VALLE CENTRAL: Avanzando entre cráteres a 0.62 m/s';

    // Punto 0 de la ruta activa: SIEMPRE es la posición exacta donde está el astronauta en este instante
    const nodoPosicionActual = {
      id: this.nodoActualId,
      svgX: ax,
      svgY: ay,
      terreno: requiereEscape ? 'SALIDA_EMERGENCIA' : 'VALLE_CENTRAL',
      codigo_usgs: ay < 95 ? 'lHv' : 'Hto',
      unidad: ay < 95 ? 'Planicie Volcánica (lHv)' : 'Canal Fluvial (Hto)',
      blindaje: ay < 95 ? 90 : 72,
      alt: Math.round((-3242 + (ax / 368) * 38) * 10) / 10,
      emergencia: requiereEscape
    };

    if (!requiereEscape) {
      this.escapeActivo = false;
      this.nodosEscapeDinamicos = [];
      this.construirRedCompleta();

      // Toma únicamente los nodos del Valle Central que están ADELANTE de la posición X actual del astronauta
      waypointsAdelante = this.nodosValleCentral.filter(n => n.svgX > ax + 12);
      if (waypointsAdelante.length === 0) {
        waypointsAdelante = [this.nodosValleCentral[this.nodosValleCentral.length - 1]];
      }
    } else {
      this.escapeActivo = true;
      codigoAccion = 'DESVIO';
      mensajeHud = '🚨 RADIACIÓN EN ALCANCE: Salida rápida [★ ESC_1 ➔ ESC_2] activa desde posición actual';

      // Crea el nodo de escape ★ ESC_1 en la posición actual y ★ ESC_2 saliendo hacia el corredor seguro superior
      const pEsc1 = this.asegurarPuntoFueraDeCrateres(ax, ay);
      let pEsc2 = this.asegurarPuntoFueraDeCrateres(Math.min(340, ax + 26), Math.min(76, ay - 36));
      for (const c of this.crateresDetectados) {
        if (Math.hypot(pEsc2.x - c.svgX, pEsc2.y - c.svgY) < c.radio * 1.32) {
          pEsc2 = { x: c.svgX < 150 ? 128 : c.svgX < 230 ? 218 : 316, y: 70 };
        }
      }

      const esc1 = {
        id: 'ESC_1', svgX: Math.round(pEsc1.x), svgY: Math.round(pEsc1.y),
        terreno: 'SALIDA_EMERGENCIA', codigo_usgs: 'lHv', unidad: 'Salida Escape (USGS lHv)', blindaje: 88, alt: -3224.0, emergencia: true
      };
      const esc2 = {
        id: 'ESC_2', svgX: Math.round(pEsc2.x), svgY: Math.round(pEsc2.y),
        terreno: 'SALIDA_EMERGENCIA', codigo_usgs: 'lHv', unidad: 'Puente Seguro (USGS lHv)', blindaje: 92, alt: -3214.5, emergencia: true
      };

      this.nodosEscapeDinamicos = [esc1, esc2];
      this.construirRedCompleta();

      const segurosAdelante = this.nodosCorredorSeguro.filter(s => s.svgX > esc2.svgX + 8);
      const nodoMeta = this.nodosValleCentral[this.nodosValleCentral.length - 1];
      waypointsAdelante = [esc2, ...segurosAdelante, nodoMeta];
    }

    const rutaCompletaDesdeAstro = [nodoPosicionActual, ...waypointsAdelante];
    this.indiceWaypointObjetivo = 1;

    return this.generarTelemetriaExacta(rutaCompletaDesdeAstro, codigoAccion, mensajeHud);
  }

  // Calcula con precisión científica las Instrucciones al Astronauta y las 3 Capas NASA en cada frame
  private generarTelemetriaExacta(rutaActiva: any[], codigoAccion: string, mensajeHud: string) {
    const rad = this.intensidadTormenta;
    const sigNodo = rutaActiva[Math.min(rutaActiva.length - 1, this.indiceWaypointObjetivo)] || rutaActiva[rutaActiva.length - 1];

    // 1. Distancia real restante y rumbo vectorial al siguiente punto
    const dxSig = sigNodo.svgX - this.posAstroSvg.x;
    const dySig = sigNodo.svgY - this.posAstroSvg.y;
    const distTramoM = Math.max(1.2, Math.round(Math.hypot(dxSig, dySig) * 0.86 * 10) / 10);
    const distMetaM = Math.max(2.0, Math.round(Math.hypot(368 - this.posAstroSvg.x, 122 - this.posAstroSvg.y) * 0.86 * 100) / 100);

    const rumboRad = Math.atan2(dxSig, -dySig);
    const rumboGrados = Math.round(((rumboRad * 180) / Math.PI + 360) % 360);
    const puntosCardinales = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
    const cardinal = puntosCardinales[Math.round(rumboGrados / 22.5) % 16];

    // 2. CAPA 1 — Topografía MOLA Exacta (Altitud y Pendiente en grados)
    const x3D = (this.posAstroSvg.x - 200) * 0.5;
    const z3D = (this.posAstroSvg.y - 125) * 0.5;
    const elevLocal = this.calcularElevacionMarteMOLA(x3D, z3D);
    const elevAdelante = this.calcularElevacionMarteMOLA(x3D + (dxSig / Math.max(1, Math.hypot(dxSig, dySig))), z3D + (dySig / Math.max(1, Math.hypot(dxSig, dySig))));
    const altitudMolaM = Math.round((-3242.0 + (this.posAstroSvg.x / 368.0) * 37.5 + elevLocal * 1.4) * 10) / 10;
    const pendienteGrados = Math.round(Math.atan2(elevAdelante - elevLocal, 1.0) * (180 / Math.PI) * 10) / 10;

    // 3. CAPA 2 — Geología USGS SIM 3292 (Unidad y Velocidad ajustada)
    const enZonaNorte = this.posAstroSvg.y < 96;
    const codigoUsgs = enZonaNorte ? 'lHv' : 'Hto';
    const nombreUnidadUsgs = enZonaNorte ? 'Unidad Volcánica Firme (lHv)' : 'Canal Fluvial de Salida (Hto)';
    const blindajeNaturalPct = enZonaNorte ? 90 : 74;
    const velRealMS = Math.round(0.62 * Math.exp(-0.025 * Math.abs(pendienteGrados)) * (enZonaNorte ? 1.03 : 1.0) * 100) / 100;

    // 4. CAPA 3 — Dosimetría RAD y Clima Atmosférico MEDA
    const factorOnda = Math.max(0, (rad - 10) / 80);
    const epicentroX = 185;
    const epicentroY = 228 - factorOnda * 65;
    const distFrenteSvg = Math.max(8, Math.hypot(this.posAstroSvg.x - epicentroX, this.posAstroSvg.y - epicentroY));
    const factorProximidad = Math.exp(-Math.pow(distFrenteSvg / 95.0, 2));
    const atenuacionTerreno = 1.0 - (blindajeNaturalPct / 140.0);
    const dosisExactaUSv = Math.round((9.5 + rad * 1.35 * factorProximidad * atenuacionTerreno) * 10) / 10;

    const tempAmbienteC = Math.round((-54.0 - (rad - 12) * 0.12 + Math.sin(this.posAstroSvg.x * 0.05) * 1.5) * 10) / 10;
    const vientoKmh = Math.round(18 + (rad - 10) * 0.65);
    const presionHpa = Math.round((7.35 - (altitudMolaM + 3240) * 0.004) * 100) / 100;

    // 5. INSTRUCCIONES TÁCTICAS EN VIVO PARA QUE EL ASTRONAUTA AVANCE AL SIGUIENTE NODO
    const instRumbo = `Dirigirse a ${rumboGrados}° ${cardinal} por ${distTramoM} m (Inclinación rampa: ${pendienteGrados > 0 ? '+' : ''}${pendienteGrados}°).`;
    const instTerreno = enZonaNorte
      ? `Pisar sobre basalto solidificado (${codigoUsgs}); mantener tracción a ${velRealMS} m/s lejos del borde de cráter.`
      : `Avanzar por lecho sedimentario (${codigoUsgs}) a ${velRealMS} m/s aprovechando las paredes del canal.`;
    const instClima = this.escapeActivo
      ? `Frente solar a ${Math.round(distFrenteSvg * 0.86)} m al sur: seguir puente de salida [★ ESC] con ${blindajeNaturalPct}% de blindaje.`
      : `Clima nominal (${dosisExactaUSv} µSv/h): continuar por el Valle Central vigilando actividad solar.`;

    const etaSeg = Math.round((distMetaM / velRealMS) * 10.1);

    return {
      nodo_actual_id: this.nodoActualId,
      siguiente_waypoint: sigNodo.id,
      altitud_actual_m: altitudMolaM,
      pendiente_actual_grados: pendienteGrados,
      codigo_usgs: codigoUsgs,
      unidad_geologica: nombreUnidadUsgs,
      blindaje_pct: blindajeNaturalPct,
      dosis_uSv_h: dosisExactaUSv,
      clima_meda: {
        temp_c: tempAmbienteC,
        viento_kmh: vientoKmh,
        presion_hpa: presionHpa
      },
      instrucciones_eva: {
        paso_rumbo: instRumbo,
        paso_terreno: instTerreno,
        paso_clima: instClima
      },
      total_nodos_urgencia: this.nodosEscapeDinamicos.length,
      alerta_radiacion: {
        activa: this.escapeActivo,
        codigo_accion: codigoAccion,
        mensaje_hud: mensajeHud,
        tiempo_llegada_refugio_seg: etaSeg
      },
      calculos_fisicos: {
        distancia_total_m: distMetaM,
        velocidad_real_m_s: velRealMS
      },
      ruta_grafo_java: rutaActiva,
      todos_nodos: this.catalogoNodos,
      aristas_mapa: this.paresAristas
    };
  }

  calcularElevacionMarteMOLA(x: number, z: number): number {
    const svgX = x * 2.0 + 200.0;
    const svgY = z * 2.0 + 125.0;

    let y = Math.sin(x * 0.06) * Math.cos(z * 0.06) * 0.85;
    const canalY = 128.0 + 32.0 * Math.sin((svgX / 400.0) * 6.2);
    const distCanal = Math.abs(svgY - canalY);
    if (distCanal < 16.0) {
      y -= (1.0 - Math.pow(distCanal / 16.0, 2)) * 2.1;
    }

    for (const c of this.crateresDetectados) {
      const cx = (c.svgX - 200.0) * 0.5;
      const cz = (c.svgY - 125.0) * 0.5;
      const r = c.radio * 0.5;
      const d = Math.hypot(x - cx, z - cz);
      const prof = (c.profundidad_m / 1000.0) * 7.2;

      if (d < r) {
        const t = d / r;
        y -= (1.0 - t * t) * prof;
      } else if (d < r * 1.22) {
        const tRim = (d - r) / (r * 0.22);
        y += Math.sin(tRim * Math.PI) * (prof * 0.25);
      }
    }
    return y;
  }

  svgA3D(svgX: number, svgY: number): THREE.Vector3 {
    const x = (svgX - 200.0) * 0.5;
    const z = (svgY - 125.0) * 0.5;
    const y = this.calcularElevacionMarteMOLA(x, z);
    return new THREE.Vector3(x, y, z);
  }

  private generarPuntosRodeandoCrateres(nodos: any[], alturaExtra: number): THREE.Vector3[] {
    const puntos: THREE.Vector3[] = [];
    for (let i = 0; i < nodos.length - 1; i++) {
      const pA = this.svgA3D(nodos[i].svgX, nodos[i].svgY);
      const pB = this.svgA3D(nodos[i + 1].svgX, nodos[i + 1].svgY);
      const pasos = 20;
      for (let s = 0; s < pasos; s++) {
        const t = s / pasos;
        let x = THREE.MathUtils.lerp(pA.x, pB.x, t);
        let z = THREE.MathUtils.lerp(pA.z, pB.z, t);

        for (const c of this.crateresDetectados) {
          const cx = (c.svgX - 200.0) * 0.5;
          const cz = (c.svgY - 125.0) * 0.5;
          const radioSeguridad3D = c.radio * 0.5 * 1.26;
          const dist = Math.hypot(x - cx, z - cz);
          if (dist < radioSeguridad3D) {
            const ang = Math.atan2(z - cz, x - cx);
            x = cx + Math.cos(ang) * radioSeguridad3D;
            z = cz + Math.sin(ang) * radioSeguridad3D;
          }
        }

        const y = this.calcularElevacionMarteMOLA(x, z) + alturaExtra;
        puntos.push(new THREE.Vector3(x, y, z));
      }
    }
    const ultimo = this.svgA3D(nodos[nodos.length - 1].svgX, nodos[nodos.length - 1].svgY);
    ultimo.y += alturaExtra;
    puntos.push(ultimo);
    return puntos;
  }

  actualizarSistema() {
    this.datosMision = this.recalcularRutaSinReiniciarAstronauta();
    this.reconstruirRutasEnAmbosVisores();
    this.cdr.detectChanges();

    fetch(`http://${this.hostBackend}:8080/api/telemetria-marte?intensidad_tormenta=${this.intensidadTormenta}&nodo_actual=${this.nodoActualId}`).catch(() => {});
  }

  private crearTexturaRegolitoMarte(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.createImageData(512, 512);
    for (let i = 0; i < imgData.data.length; i += 4) {
      const px = (i / 4) % 512;
      const py = Math.floor(i / 4 / 512);
      const variacion = Math.sin(px * 0.08) * Math.cos(py * 0.08) * 14 + (Math.random() - 0.5) * 16;
      imgData.data[i] = Math.min(255, Math.max(0, 196 + variacion));
      imgData.data[i + 1] = Math.min(255, Math.max(0, 110 + variacion * 0.7));
      imgData.data[i + 2] = Math.min(255, Math.max(0, 70 + variacion * 0.5));
      imgData.data[i + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    return tex;
  }

  private crearEtiquetaSprite(texto: string, colorFondo: string, escala = 1.0): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 190;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = colorFondo;
    ctx.beginPath();
    ctx.roundRect(6, 10, 178, 44, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, 95, 33);

    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sprite.scale.set(4.5 * escala, 1.55 * escala, 1);
    return sprite;
  }

  private inicializarVisoresDuales() {
    const divMini = document.getElementById('canvas-mapa-mini');
    const divDerecha = document.getElementById('canvas-vision-3d');
    if (!divMini || !divDerecha) return;

    const texturaSuelo = this.crearTexturaRegolitoMarte();

    const crearMallaTerrenoMOLA = () => {
      const geo = new THREE.PlaneGeometry(200, 125, 220, 140);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes['position'];
      for (let i = 0; i < pos.count; i++) {
        pos.setY(i, this.calcularElevacionMarteMOLA(pos.getX(i), pos.getZ(i)));
      }
      geo.computeVertexNormals();
      return geo;
    };

    // 1. PANEL IZQUIERDO: SUPERFICIE CON ASTRONAUTA 3D ARTICULADO Y FLECHA VERDE
    this.sceneMini = new THREE.Scene();
    this.sceneMini.background = new THREE.Color(0x8c4f32);
    this.sceneMini.fog = new THREE.FogExp2(0x9e5938, 0.007);

    this.sceneMini.add(new THREE.AmbientLight(0xffd8be, 0.85));
    const solMini = new THREE.DirectionalLight(0xfff1e0, 1.65);
    solMini.position.set(-60, 95, -40);
    this.sceneMini.add(solMini);

    const meshSueloMini = new THREE.Mesh(
      crearMallaTerrenoMOLA(),
      new THREE.MeshStandardMaterial({ map: texturaSuelo, roughness: 0.9, metalness: 0.05 })
    );
    this.sceneMini.add(meshSueloMini);

    for (const c of this.crateresDetectados) {
      const centro = this.svgA3D(c.svgX, c.svgY);
      const r3D = c.radio * 0.5;
      const ptsAnillo: THREE.Vector3[] = [];
      for (let i = 0; i <= 48; i++) {
        const ang = (i / 48) * Math.PI * 2;
        const wx = centro.x + Math.cos(ang) * r3D;
        const wz = centro.z + Math.sin(ang) * r3D;
        ptsAnillo.push(new THREE.Vector3(wx, this.calcularElevacionMarteMOLA(wx, wz) + 0.25, wz));
      }
      this.sceneMini.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(ptsAnillo),
          new THREE.LineBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.8 })
        )
      );
    }

    this.actorSuperficieGroup = new THREE.Group();
    const shapeFlecha = new THREE.Shape();
    shapeFlecha.moveTo(0, 1.35);
    shapeFlecha.lineTo(-0.95, -0.85);
    shapeFlecha.lineTo(0, -0.30);
    shapeFlecha.lineTo(0.95, -0.85);
    shapeFlecha.closePath();

    const geoFlecha = new THREE.ExtrudeGeometry(shapeFlecha, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04 });
    geoFlecha.rotateX(Math.PI / 2);
    const meshFlecha = new THREE.Mesh(
      geoFlecha,
      new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x15803d, emissiveIntensity: 0.45, roughness: 0.3 })
    );
    meshFlecha.position.y = 0.22;
    this.actorSuperficieGroup.add(meshFlecha);

    const matTraje = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });
    const matVisor = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.85, roughness: 0.15 });
    const matMochila = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.5 });

    this.piernaIzq = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.50, 0.16), matTraje);
    this.piernaIzq.position.set(-0.12, 0.45, 0);
    this.piernaDer = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.50, 0.16), matTraje);
    this.piernaDer.position.set(0.12, 0.45, 0);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.54, 0.28), matTraje);
    torso.position.set(0, 0.92, 0);
    const mochila = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.46, 0.22), matMochila);
    mochila.position.set(0, 0.94, -0.22);
    const casco = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), matTraje);
    casco.position.set(0, 1.36, 0);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 14), matVisor);
    visor.position.set(0, 1.37, 0.07);
    this.brazoIzq = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.44, 0.14), matTraje);
    this.brazoIzq.position.set(-0.30, 0.90, 0);
    this.brazoDer = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.44, 0.14), matTraje);
    this.brazoDer.position.set(0.30, 0.90, 0);

    this.actorSuperficieGroup.add(this.piernaIzq, this.piernaDer, torso, mochila, casco, visor, this.brazoIzq, this.brazoDer);
    this.sceneMini.add(this.actorSuperficieGroup);

    this.grupoRutaMini = new THREE.Group();
    this.grupoOndaMini = new THREE.Group();
    this.sceneMini.add(this.grupoRutaMini);
    this.sceneMini.add(this.grupoOndaMini);

    this.cameraMini = new THREE.PerspectiveCamera(52, divMini.clientWidth / divMini.clientHeight, 0.2, 350);
    this.rendererMini = new THREE.WebGLRenderer({ antialias: true });
    this.rendererMini.setSize(divMini.clientWidth, divMini.clientHeight);
    this.rendererMini.setPixelRatio(window.devicePixelRatio);
    divMini.innerHTML = '';
    divMini.appendChild(this.rendererMini.domElement);

    const domMini = this.rendererMini.domElement;
    domMini.addEventListener('mousedown', (e) => {
      this.arrastrandoMini = true;
      this.mousePrev = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('mouseup', () => {
      this.arrastrandoMini = false;
      this.arrastrandoDerecha = false;
    });
    domMini.addEventListener('mousemove', (e) => {
      if (!this.arrastrandoMini) return;
      this.yawMiniOffset -= (e.clientX - this.mousePrev.x) * 0.008;
      this.pitchMiniOffset = Math.max(0.15, Math.min(1.25, this.pitchMiniOffset + (e.clientY - this.mousePrev.y) * 0.007));
      this.mousePrev = { x: e.clientX, y: e.clientY };
    });
    domMini.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.distMini = Math.max(4.5, Math.min(35.0, this.distMini + e.deltaY * 0.02));
    }, { passive: false });

    // 2. PANEL DERECHO: MAPA MOLA DE CRÁTERES, NODOS Y SALIDA DE ESCAPE
    this.sceneMapaNodos = new THREE.Scene();
    this.sceneMapaNodos.background = new THREE.Color(0x110a06);

    this.sceneMapaNodos.add(new THREE.AmbientLight(0xffd8be, 0.92));
    const solDer = new THREE.DirectionalLight(0xfff1e0, 1.75);
    solDer.position.set(60, 130, -50);
    this.sceneMapaNodos.add(solDer);

    const meshSueloDerecha = new THREE.Mesh(
      crearMallaTerrenoMOLA(),
      new THREE.MeshStandardMaterial({ map: texturaSuelo, roughness: 0.88, metalness: 0.06 })
    );
    this.sceneMapaNodos.add(meshSueloDerecha);

    this.grupoCrateresRojos = new THREE.Group();
    this.grupoGrafoCompleto = new THREE.Group();
    this.grupoOndaDerecha = new THREE.Group();
    this.sceneMapaNodos.add(this.grupoCrateresRojos);
    this.sceneMapaNodos.add(this.grupoGrafoCompleto);
    this.sceneMapaNodos.add(this.grupoOndaDerecha);

    this.marcadorAstronautaDerecha = new THREE.Group();
    const esferaAstro = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 18, 18),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 })
    );
    const aroRojoAstro = new THREE.Mesh(
      new THREE.RingGeometry(2.3, 3.3, 24),
      new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide })
    );
    aroRojoAstro.rotation.x = -Math.PI / 2;
    this.marcadorAstronautaDerecha.add(esferaAstro, aroRojoAstro);
    this.sceneMapaNodos.add(this.marcadorAstronautaDerecha);

    this.cameraMapaNodos = new THREE.PerspectiveCamera(42, divDerecha.clientWidth / divDerecha.clientHeight, 1, 600);
    this.actualizarCamaraDerecha();

    this.rendererMapaNodos = new THREE.WebGLRenderer({ antialias: true });
    this.rendererMapaNodos.setSize(divDerecha.clientWidth, divDerecha.clientHeight);
    this.rendererMapaNodos.setPixelRatio(window.devicePixelRatio);
    divDerecha.innerHTML = '';
    divDerecha.appendChild(this.rendererMapaNodos.domElement);

    const domDer = this.rendererMapaNodos.domElement;
    domDer.addEventListener('mousedown', (e) => {
      this.arrastrandoDerecha = true;
      this.mousePrev = { x: e.clientX, y: e.clientY };
    });
    domDer.addEventListener('mousemove', (e) => {
      if (!this.arrastrandoDerecha) return;
      this.orbitaDerecha.theta -= (e.clientX - this.mousePrev.x) * 0.009;
      this.orbitaDerecha.phi = Math.max(0.15, Math.min(1.38, this.orbitaDerecha.phi - (e.clientY - this.mousePrev.y) * 0.008));
      this.mousePrev = { x: e.clientX, y: e.clientY };
      this.actualizarCamaraDerecha();
    });
    domDer.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.orbitaDerecha.radio = Math.max(55, Math.min(240, this.orbitaDerecha.radio + e.deltaY * 0.09));
      this.actualizarCamaraDerecha();
    }, { passive: false });

    this.reconstruirRutasEnAmbosVisores();
  }

  private actualizarCamaraDerecha() {
    if (!this.cameraMapaNodos) return;
    const { theta, phi, radio } = this.orbitaDerecha;
    this.cameraMapaNodos.position.x = radio * Math.sin(phi) * Math.sin(theta);
    this.cameraMapaNodos.position.y = radio * Math.cos(phi);
    this.cameraMapaNodos.position.z = radio * Math.sin(phi) * Math.cos(theta);
    this.cameraMapaNodos.lookAt(0, 0, 2);
  }

  private crearDiscoTerreno(cx: number, cz: number, radio: number, colorHex: number, opacidad: number, alturaExtra: number): THREE.Mesh {
    const geo = new THREE.CircleGeometry(radio, 40);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes['position'];
    for (let i = 0; i < pos.count; i++) {
      const wx = cx + pos.getX(i);
      const wz = cz + pos.getZ(i);
      pos.setXYZ(i, wx, this.calcularElevacionMarteMOLA(wx, wz) + alturaExtra, wz);
    }
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: opacidad, side: THREE.DoubleSide, depthWrite: false }));
  }

  private crearAnilloTerreno(cx: number, cz: number, radio: number, colorHex: number): THREE.Line {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 64; i++) {
      const ang = (i / 64) * Math.PI * 2;
      const wx = cx + Math.cos(ang) * radio;
      const wz = cz + Math.sin(ang) * radio;
      pts.push(new THREE.Vector3(wx, this.calcularElevacionMarteMOLA(wx, wz) + 0.35, wz));
    }
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: colorHex }));
  }

  private reconstruirRutasEnAmbosVisores() {
    if (!this.grupoRutaMini || !this.grupoGrafoCompleto || !this.datosMision) return;

    while (this.grupoRutaMini.children.length > 0) this.grupoRutaMini.remove(this.grupoRutaMini.children[0]);
    while (this.grupoOndaMini.children.length > 0) this.grupoOndaMini.remove(this.grupoOndaMini.children[0]);
    while (this.grupoCrateresRojos.children.length > 0) this.grupoCrateresRojos.remove(this.grupoCrateresRojos.children[0]);
    while (this.grupoGrafoCompleto.children.length > 0) this.grupoGrafoCompleto.remove(this.grupoGrafoCompleto.children[0]);
    while (this.grupoOndaDerecha.children.length > 0) this.grupoOndaDerecha.remove(this.grupoOndaDerecha.children[0]);

    const nodosRuta = this.datosMision.ruta_grafo_java;
    if (!nodosRuta || nodosRuta.length < 2) return;

    for (const c of this.crateresDetectados) {
      const centro = this.svgA3D(c.svgX, c.svgY);
      const r3D = c.radio * 0.5;
      this.grupoCrateresRojos.add(this.crearDiscoTerreno(centro.x, centro.z, r3D, 0xdc2626, 0.52, 0.20));

      const etiqueta = this.crearEtiquetaSprite(`⛔ ${c.id}`, 'rgba(185, 28, 28, 0.94)', 0.9);
      etiqueta.position.set(centro.x, centro.y + 3.6, centro.z);
      this.grupoCrateresRojos.add(etiqueta);
    }

    const mapById = new Map<string, any>();
    this.catalogoNodos.forEach(n => mapById.set(n.id, n));
    const matRed = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.26 });
    for (const [id1, id2] of this.paresAristas) {
      const o = mapById.get(id1);
      const d = mapById.get(id2);
      if (o && d) {
        const p1 = this.svgA3D(o.svgX, o.svgY);
        const p2 = this.svgA3D(d.svgX, d.svgY);
        p1.y += 0.22;
        p2.y += 0.22;
        this.grupoGrafoCompleto.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([p1, p2]), matRed));
      }
    }

    for (const n of this.catalogoNodos) {
      const pos = this.svgA3D(n.svgX, n.svgY);
      const esEscape = n.emergencia === true;
      const esRutaSegura = n.terreno === 'RUTA_SEGURA';
      const colorN = esEscape ? 0xfacc15 : esRutaSegura ? 0x38bdf8 : 0x10b981;

      const esferaN = new THREE.Mesh(
        new THREE.SphereGeometry(esEscape ? 1.45 : 0.72, 14, 14),
        new THREE.MeshBasicMaterial({ color: colorN })
      );
      esferaN.position.set(pos.x, pos.y + 0.45, pos.z);
      this.grupoGrafoCompleto.add(esferaN);

      if (esEscape || n.id === 'N0' || n.id === 'META') {
        const texto = esEscape ? `★ ${n.id} SALIDA` : n.id;
        const fondo = esEscape ? 'rgba(202, 138, 4, 0.98)' : 'rgba(15, 23, 42, 0.92)';
        const etiq = this.crearEtiquetaSprite(texto, fondo, esEscape ? 1.05 : 0.85);
        etiq.position.set(pos.x, pos.y + 2.8, pos.z);
        this.grupoGrafoCompleto.add(etiq);
      }
    }

    const factorOnda = Math.max(0, (this.intensidadTormenta - 10) / 80);
    const centroOnda = this.svgA3D(185, 228 - factorOnda * 65);
    const radioOnda3D = (26 + factorOnda * 68) * 0.5;

    this.grupoOndaDerecha.add(this.crearDiscoTerreno(centroOnda.x, centroOnda.z, radioOnda3D, 0xff5500, 0.44, 0.16));
    this.grupoOndaDerecha.add(this.crearAnilloTerreno(centroOnda.x, centroOnda.z, radioOnda3D, 0xfacc15));
    this.grupoOndaMini.add(this.crearDiscoTerreno(centroOnda.x, centroOnda.z, radioOnda3D, 0xff5500, 0.32, 0.12));

    if (this.escapeActivo) {
      const ptsPeligro = this.generarPuntosRodeandoCrateres(this.nodosValleCentral, 0.14);
      const curvaPeligro = new THREE.CatmullRomCurve3(ptsPeligro);
      const geoRojo = new THREE.TubeGeometry(curvaPeligro, 120, 0.45, 6, false);
      this.grupoGrafoCompleto.add(
        new THREE.Mesh(geoRojo, new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.55 }))
      );
    }

    const ptsSeguros = this.generarPuntosRodeandoCrateres(nodosRuta, 0.18);
    const curvaActiva = new THREE.CatmullRomCurve3(ptsSeguros);

    const colorCintaMini = this.escapeActivo ? 0x06b6d4 : 0x2563eb;
    const geoCintaMini = new THREE.TubeGeometry(curvaActiva, 160, 0.92, 6, false);
    geoCintaMini.scale(1, 0.06, 1);
    this.grupoRutaMini.add(new THREE.Mesh(geoCintaMini, new THREE.MeshBasicMaterial({ color: colorCintaMini, transparent: true, opacity: 0.84 })));

    const geoCentroMini = new THREE.TubeGeometry(curvaActiva, 160, 0.24, 6, false);
    geoCentroMini.scale(1, 0.08, 1);
    this.grupoRutaMini.add(new THREE.Mesh(geoCentroMini, new THREE.MeshBasicMaterial({ color: 0x93c5fd })));

    const colorTuboDer = this.escapeActivo ? 0x00ffff : 0x00ff88;
    const geoTuboDer = new THREE.TubeGeometry(curvaActiva, 160, 0.90, 8, false);
    this.grupoGrafoCompleto.add(new THREE.Mesh(geoTuboDer, new THREE.MeshBasicMaterial({ color: colorTuboDer })));

    for (let i = 1; i < nodosRuta.length; i++) {
      const pNodo = this.svgA3D(nodosRuta[i].svgX, nodosRuta[i].svgY);
      const esEsc = nodosRuta[i].emergencia === true;
      const esferaNodoMini = new THREE.Mesh(
        new THREE.SphereGeometry(esEsc ? 0.78 : 0.58, 20, 20),
        new THREE.MeshStandardMaterial({
          color: esEsc ? 0xfacc15 : 0x60a5fa,
          emissive: esEsc ? 0xd97706 : 0x2563eb,
          emissiveIntensity: 0.85,
          roughness: 0.2
        })
      );
      esferaNodoMini.position.set(pNodo.x, pNodo.y + 0.52, pNodo.z);
      this.grupoRutaMini.add(esferaNodoMini);
    }
  }

  // Bucle de movimiento físico directo sobre (posAstroSvg.x, posAstroSvg.y): jamás salta ni se reinicia al cambiar la radiación
  private animarSimulacionContinua() {
    this.animFrameId = requestAnimationFrame(() => this.animarSimulacionContinua());
    const dt = Math.min(0.1, this.reloj.getDelta());
    const tiempoTotal = this.reloj.getElapsedTime();

    if (this.datosMision && this.datosMision.ruta_grafo_java && this.datosMision.ruta_grafo_java.length >= 2) {
      const ruta = this.datosMision.ruta_grafo_java;
      const wpDestino = ruta[Math.min(ruta.length - 1, this.indiceWaypointObjetivo)];

      const dx = wpDestino.svgX - this.posAstroSvg.x;
      const dy = wpDestino.svgY - this.posAstroSvg.y;
      const distAlWaypoint = Math.hypot(dx, dy);

      if (this.caminataActiva) {
        // Velocidad constante en unidades SVG/seg equivalente a ~0.62 m/s
        const pasoSvg = dt * 11.5;
        if (distAlWaypoint <= pasoSvg + 1.5) {
          this.posAstroSvg.x = wpDestino.svgX;
          this.posAstroSvg.y = wpDestino.svgY;
          this.nodoActualId = wpDestino.id;

          if (this.indiceWaypointObjetivo < ruta.length - 1) {
            this.indiceWaypointObjetivo++;
          } else {
            // Solo vuelve a empezar desde N0 cuando llega físicamente hasta la META final
            this.posAstroSvg = { x: 34, y: 126 };
            this.nodoActualId = 'N0';
          }
          this.datosMision = this.recalcularRutaSinReiniciarAstronauta();
          this.reconstruirRutasEnAmbosVisores();
          this.cdr.detectChanges();
        } else {
          const nx = this.posAstroSvg.x + (dx / distAlWaypoint) * pasoSvg;
          const ny = this.posAstroSvg.y + (dy / distAlWaypoint) * pasoSvg;
          // Garantiza que en cada milisegundo bordee el exterior de los cráteres
          const puntoSeguro = this.asegurarPuntoFueraDeCrateres(nx, ny);
          this.posAstroSvg.x = puntoSeguro.x;
          this.posAstroSvg.y = puntoSeguro.y;
        }

        // Verifica en tiempo real si la radiación alcanzó la posición donde va caminando el astronauta
        const factorOnda = Math.max(0, (this.intensidadTormenta - 10) / 80);
        const epicentroY = 228 - factorOnda * 65;
        const radioOnda = 26 + factorOnda * 68;
        if (!this.escapeActivo && Math.hypot(this.posAstroSvg.x - 185, this.posAstroSvg.y - epicentroY) < radioOnda + 32) {
          this.datosMision = this.recalcularRutaSinReiniciarAstronauta();
          this.reconstruirRutasEnAmbosVisores();
          this.cdr.detectChanges();
        }
      }

      // Posición 3D exacta del astronauta sobre el terreno MOLA
      const pos3D = this.svgA3D(this.posAstroSvg.x, this.posAstroSvg.y);
      const posMeta3D = this.svgA3D(wpDestino.svgX, wpDestino.svgY);
      const dirDeseada = new THREE.Vector3().subVectors(posMeta3D, pos3D).normalize();
      if (dirDeseada.lengthSq() > 0.0001) {
        this.tangenteSuave.lerp(dirDeseada, 0.14).normalize();
      }

      this.actorSuperficieGroup.position.set(pos3D.x, pos3D.y + 0.06, pos3D.z);
      const anguloRumbo = Math.atan2(this.tangenteSuave.x, this.tangenteSuave.z);
      this.actorSuperficieGroup.rotation.y = anguloRumbo;
      this.angulosCasco.rumboGrados = Math.round((anguloRumbo * 180) / Math.PI + 360) % 360;

      if (this.caminataActiva) {
        const osc = Math.sin(tiempoTotal * 8.0) * 0.45;
        this.piernaIzq.rotation.x = osc;
        this.piernaDer.rotation.x = -osc;
        this.brazoIzq.rotation.x = -osc * 0.7;
        this.brazoDer.rotation.x = osc * 0.7;
      } else {
        this.piernaIzq.rotation.x = 0;
        this.piernaDer.rotation.x = 0;
        this.brazoIzq.rotation.x = 0;
        this.brazoDer.rotation.x = 0;
      }

      const anguloCam = anguloRumbo + this.yawMiniOffset;
      if (!this.vistaPrimeraPersona) {
        this.actorSuperficieGroup.visible = true;
        const camX = pos3D.x - Math.sin(anguloCam) * Math.cos(this.pitchMiniOffset) * this.distMini;
        const camZ = pos3D.z - Math.cos(anguloCam) * Math.cos(this.pitchMiniOffset) * this.distMini;
        const camY = pos3D.y + Math.sin(this.pitchMiniOffset) * this.distMini + 1.8;

        this.cameraMini.position.lerp(new THREE.Vector3(camX, camY, camZ), 0.14);
        this.cameraMini.lookAt(pos3D.x + this.tangenteSuave.x * 5.0, pos3D.y + 0.4, pos3D.z + this.tangenteSuave.z * 5.0);
      } else {
        this.actorSuperficieGroup.visible = false;
        const balanceo = this.caminataActiva ? Math.abs(Math.sin(tiempoTotal * 8.0)) * 0.05 : 0;
        this.cameraMini.position.set(pos3D.x, pos3D.y + 1.72 + balanceo, pos3D.z);
        this.cameraMini.lookAt(
          pos3D.x + Math.sin(anguloCam) * 14,
          this.calcularElevacionMarteMOLA(pos3D.x + this.tangenteSuave.x * 10, pos3D.z + this.tangenteSuave.z * 10) + 0.8,
          pos3D.z + Math.cos(anguloCam) * 14
        );
      }

      if (this.marcadorAstronautaDerecha) {
        this.marcadorAstronautaDerecha.position.set(pos3D.x, pos3D.y + 0.9, pos3D.z);
      }
    }

    if (this.rendererMini && this.cameraMini) {
      this.rendererMini.render(this.sceneMini, this.cameraMini);
    }
    if (this.rendererMapaNodos && this.cameraMapaNodos) {
      this.rendererMapaNodos.render(this.sceneMapaNodos, this.cameraMapaNodos);
    }
  }

  avanzarPasoManual() {
    if (this.datosMision && this.datosMision.ruta_grafo_java && this.datosMision.ruta_grafo_java.length > 1) {
      const sig = this.datosMision.ruta_grafo_java[1];
      this.posAstroSvg = { x: sig.svgX, y: sig.svgY };
      this.nodoActualId = sig.id;
      this.actualizarSistema();
    }
  }

  dispararNodoEscapeClima() {
    if (this.intensidadTormenta < 28) this.intensidadTormenta = 38;
    this.actualizarSistema();
  }

  // Al cambiar la radiación (subir o bajar), el astronauta NUNCA se reinicia: recalcula desde donde está parado
  cambiarTormenta(valor: number) {
    this.intensidadTormenta = Number(valor);
    this.actualizarSistema();
  }

  reiniciarRecorrido() {
    this.intensidadTormenta = 12;
    this.escapeActivo = false;
    this.nodosEscapeDinamicos = [];
    this.posAstroSvg = { x: 34, y: 126 };
    this.nodoActualId = 'N0';
    this.construirRedCompleta();
    this.actualizarSistema();
  }

  private redimensionarVisores() {
    const divMini = document.getElementById('canvas-mapa-mini');
    const divDer = document.getElementById('canvas-vision-3d');
    if (divMini && this.rendererMini && this.cameraMini && divMini.clientWidth > 0) {
      this.cameraMini.aspect = divMini.clientWidth / divMini.clientHeight;
      this.cameraMini.updateProjectionMatrix();
      this.rendererMini.setSize(divMini.clientWidth, divMini.clientHeight);
    }
    if (divDer && this.rendererMapaNodos && this.cameraMapaNodos && divDer.clientWidth > 0) {
      this.cameraMapaNodos.aspect = divDer.clientWidth / divDer.clientHeight;
      this.cameraMapaNodos.updateProjectionMatrix();
      this.rendererMapaNodos.setSize(divDer.clientWidth, divDer.clientHeight);
    }
  }

  formatearTiempo(segundos: number): string {
    if (!segundos || segundos <= 0) return '0m 00s';
    const min = Math.floor(segundos / 60);
    const seg = segundos % 60;
    return `${min}m ${seg < 10 ? '0' : ''}${seg}s`;
  }
}