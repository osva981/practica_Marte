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
  usarCapaMola: boolean = false;
  intensidadTormenta: number = 12;
  nodoActualId: string = 'N1';
  caminataActiva: boolean = true;
  tormentaProgresivaActiva: boolean = false;
  datosMision: any = null;

  // Controles de velocidad y cámara para que la vista derecha sea 100% ajustable y dinámica
  velocidadSimulacion: number = 2.5; // Multiplicador de velocidad (1x, 2.5x, 5x)
  modoVistaDerecha: 'SEGUIMIENTO' | 'PRIMERA_PERSONA' = 'SEGUIMIENTO';
  nivelZoomDerecha: number = 100; // Porcentaje indicador de zoom

  progresoSegmento: number = 0;
  posVector3D = { x: 0, y: 0, z: 0 };
  vectorTangenteHUD = { tx: 0, ty: 0, tz: 0 };
  vectorEscapeBase = { vx: 0, vz: 0, distM: 0 };
  angulosCasco = { rumboGrados: 115, inclinacionGrados: 3.5 };

  private scene!: THREE.Scene;
  private cameraBase!: THREE.PerspectiveCamera;
  private cameraHud!: THREE.PerspectiveCamera;
  private rendererBase!: THREE.WebGLRenderer;
  private rendererHud!: THREE.WebGLRenderer;

  private terrenoMesh!: THREE.Mesh;
  private texturaCuriosity!: THREE.Texture;
  private texturaMola!: THREE.Texture;

  private grupoGrafoOrbital!: THREE.Group;
  private grupoVectoresOrbital!: THREE.Group;
  private grupoMarcadoresHud!: THREE.Group;
  private grupoOndaCalor!: THREE.Group;
  private anillosPulsoCalor: THREE.Line[] = [];
  private balizasCaminoHud: THREE.Mesh[] = [];

  private rutaTuboMesh!: THREE.Mesh;
  private rutaHudMesh!: THREE.Mesh;

  private astronautaMesh!: THREE.Group;
  private piernaIzq!: THREE.Mesh;
  private piernaDer!: THREE.Mesh;
  private brazoIzq!: THREE.Mesh;
  private brazoDer!: THREE.Mesh;
  private flechaTangenteAstro!: THREE.ArrowHelper;

  private tangenteSuave = new THREE.Vector3(1, 0, 0);

  private animFrameId: any;
  private intervaloTormenta: any;
  private reloj = new THREE.Clock();

  // Controles de cámara Izquierda (Monitor Base)
  private arrastrandoBase = false;
  private mousePrevBase = { x: 0, y: 0 };
  private anguloOrbitaBase = { theta: 0.16, phi: 0.72, radio: 145 };
  private centroOrbitaBase = new THREE.Vector3(2, 0, 6);

  // Controles interactivos de cámara Derecha (Visor Casco / Seguimiento 3D)
  private arrastrandoHud = false;
  private mousePrevHud = { x: 0, y: 0 };
  private hudOrbita = {
    yawOffset: 0.0,     // Giro horizontal manual con el mouse
    pitchOffset: 0.32,  // Inclinación vertical manual con el mouse
    distancia: 6.5,     // Zoom de distancia (0 = 1ra persona, 2..28 = seguimiento 3D)
    fov: 60             // Zoom óptico del lente
  };

  private readonly catalogoNodos: any[] = [
    { id: 'N0', nombre: 'Base Bradbury / Pahrump', tipo: 'BASE', orden: 0, altitud: -4480, exp: 0.05, svgX: 48, svgY: 118 },
    { id: 'N1', nombre: 'Planicie Yellowknife', tipo: 'RUTA', orden: 1, altitud: -4472, exp: 0.95, svgX: 68, svgY: 134 },
    { id: 'N2', nombre: 'Borde Dunas Bagnold', tipo: 'RUTA', orden: 2, altitud: -4460, exp: 1.55, svgX: 88, svgY: 150 },
    { id: 'N3', nombre: 'Corredor Dunas Oscuras', tipo: 'RUTA', orden: 3, altitud: -4445, exp: 1.95, svgX: 110, svgY: 166 },
    { id: 'N4', nombre: 'Entrada Murray Buttes', tipo: 'RUTA', orden: 4, altitud: -4422, exp: 2.20, svgX: 134, svgY: 182 },
    { id: 'N5', nombre: 'Paso Hematita Oeste', tipo: 'RUTA', orden: 5, altitud: -4395, exp: 2.35, svgX: 158, svgY: 196 },
    { id: 'N6', nombre: 'Curva Sur Vera Rubin', tipo: 'RUTA', orden: 6, altitud: -4360, exp: 2.45, svgX: 184, svgY: 208 },
    { id: 'N7', nombre: 'Cresta Vera Rubin', tipo: 'RUTA', orden: 7, altitud: -4325, exp: 2.50, svgX: 210, svgY: 214 },
    { id: 'N8', nombre: 'Rampa Glen Torridon', tipo: 'RUTA', orden: 8, altitud: -4285, exp: 2.35, svgX: 236, svgY: 210 },
    { id: 'N9', nombre: 'Cuenca Arcillas', tipo: 'RUTA', orden: 9, altitud: -4240, exp: 2.10, svgX: 260, svgY: 200 },
    { id: 'N10', nombre: 'Base Unidad Sulfatos', tipo: 'RUTA', orden: 10, altitud: -4185, exp: 1.95, svgX: 280, svgY: 186 },
    { id: 'N11', nombre: 'Espolón Central', tipo: 'RUTA', orden: 11, altitud: -4125, exp: 1.80, svgX: 298, svgY: 170 },
    { id: 'N12', nombre: 'Boca Gediz Vallis', tipo: 'RUTA', orden: 12, altitud: -4065, exp: 1.60, svgX: 314, svgY: 154 },
    { id: 'N13', nombre: 'Cañón Superior Gediz', tipo: 'RUTA', orden: 13, altitud: -4005, exp: 1.40, svgX: 328, svgY: 138 },
    { id: 'N14', nombre: 'Cresta Pedimento', tipo: 'RUTA', orden: 14, altitud: -3950, exp: 1.20, svgX: 342, svgY: 122 },
    { id: 'N15', nombre: 'Estación Cima Monte Sharp', tipo: 'CIMA', orden: 15, altitud: -3890, exp: 0.15, svgX: 356, svgY: 106 },

    { id: 'S1', nombre: 'Cañón Lateral Pahrump', tipo: 'REFUGIO', orden: 3, altitud: -4455, exp: 0.08, svgX: 114, svgY: 104 },
    { id: 'S2', nombre: 'Paso Bajo Roca Murray', tipo: 'REFUGIO', orden: 6, altitud: -4405, exp: 0.08, svgX: 172, svgY: 98 },
    { id: 'S3', nombre: 'Túnel Natural Vera Rubin', tipo: 'REFUGIO', orden: 9, altitud: -4335, exp: 0.08, svgX: 232, svgY: 102 },
    { id: 'S4', nombre: 'Búnker Rocoso Gediz', tipo: 'REFUGIO', orden: 12, altitud: -4055, exp: 0.08, svgX: 288, svgY: 110 }
  ];

  private readonly paresAristas: [string, string][] = [
    ['N0','N1'],['N1','N2'],['N2','N3'],['N3','N4'],['N4','N5'],['N5','N6'],['N6','N7'],['N7','N8'],
    ['N8','N9'],['N9','N10'],['N10','N11'],['N11','N12'],['N12','N13'],['N13','N14'],['N14','N15'],
    ['N1','S1'],['S1','S2'],['S2','S3'],['S3','S4'],['S4','N13'],
    ['N2','S1'],['N3','S1'],['N4','S2'],['N5','S2'],['N6','S2'],
    ['N7','S3'],['N8','S3'],['N9','S3'],['N10','S4'],['N11','S4'],['N12','S4']
  ];

  constructor(private cdr: ChangeDetectorRef) {
    this.datosMision = this.calcularRutaOrdenada(this.nodoActualId, this.intensidadTormenta);
  }

  ngOnInit() {
    this.actualizarRutaYTelemetria();
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.inicializarMotor3D();
      this.animarSimulacion3D();
    }, 100);
  }

  ngOnDestroy() {
    if (this.intervaloTormenta) clearInterval(this.intervaloTormenta);
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
  }

  private obtenerParametrosOndaCalor(rad: number) {
    const factor = Math.max(0, (rad - 10) / 80);
    const epicentroSvgX = 105 + factor * 18;
    const epicentroSvgY = 238 - factor * 24;
    const radioExteriorSvg = 24 + factor * 54;
    return { factor, epicentroSvgX, epicentroSvgY, radioExteriorSvg };
  }

  actualizarRutaYTelemetria() {
    this.datosMision = this.calcularRutaOrdenada(this.nodoActualId, this.intensidadTormenta);
    this.reconstruirGrafoYRuta3D();
    this.cdr.detectChanges();

    fetch(`http://localhost:8080/api/telemetria-marte?intensidad_tormenta=${this.intensidadTormenta}&nodo_actual=${this.nodoActualId}`)
      .catch(() => {});
  }

  calcularRutaOrdenada(inicioId: string, rad: number) {
    const mapaNodos = new Map<string, any>();
    this.catalogoNodos.forEach(n => mapaNodos.set(n.id, n));
    if (!mapaNodos.has(inicioId)) inicioId = 'N1';

    const onda = this.obtenerParametrosOndaCalor(rad);

    const buscarDijkstra = (orig: string, dest: string, modo: 'NORMAL' | 'DESVIO' | 'REGRESO') => {
      if (orig === dest) {
        const unico = mapaNodos.get(orig);
        return [{ ...unico, pendiente: 0, rad_nodo: Math.round((9.5 + rad * unico.exp) * 10) / 10 }];
      }

      const costos = new Map<string, number>();
      const previos = new Map<string, string | null>();
      const visitados = new Set<string>();

      this.catalogoNodos.forEach(n => {
        costos.set(n.id, Infinity);
        previos.set(n.id, null);
      });
      costos.set(orig, 0);

      while (visitados.size < this.catalogoNodos.length) {
        let u: string | null = null;
        let minC = Infinity;
        costos.forEach((c, id) => {
          if (!visitados.has(id) && c < minC) {
            minC = c;
            u = id;
          }
        });
        if (!u || u === dest) break;
        visitados.add(u);

        const nodoU = mapaNodos.get(u);
        for (const [a, b] of this.paresAristas) {
          const v = a === u ? b : b === u ? a : null;
          if (!v || visitados.has(v)) continue;
          const nodoV = mapaNodos.get(v);

          const dist = Math.hypot(nodoV.svgX - nodoU.svgX, nodoV.svgY - nodoU.svgY);
          const distAOndaCalor = Math.hypot(nodoV.svgX - onda.epicentroSvgX, nodoV.svgY - onda.epicentroSvgY);
          let penalizacion = 0;

          if (modo === 'NORMAL') {
            if (nodoV.tipo === 'REFUGIO') penalizacion += 140;
            if (nodoV.orden < nodoU.orden) penalizacion += 500;
          } else if (modo === 'DESVIO') {
            if (distAOndaCalor < onda.radioExteriorSvg + 32 && nodoV.tipo !== 'REFUGIO') {
              penalizacion += 950;
            }
            if (nodoV.exp > 1.0) penalizacion += nodoV.exp * 450;
            if (nodoV.orden < nodoU.orden) penalizacion += 400;
          } else if (modo === 'REGRESO') {
            if (nodoV.orden > nodoU.orden) penalizacion += 600;
          }

          const nuevoCosto = costos.get(u)! + dist + penalizacion;
          if (nuevoCosto < costos.get(v)!) {
            costos.set(v, nuevoCosto);
            previos.set(v, u);
          }
        }
      }

      const ruta: any[] = [];
      let paso: string | null = dest;
      while (paso) {
        const n = mapaNodos.get(paso);
        ruta.unshift({
          ...n,
          pendiente: 4.5,
          rad_nodo: Math.round((9.5 + rad * n.exp) * 10) / 10
        });
        paso = previos.get(paso) || null;
      }
      return ruta;
    };

    let codigoAccion = 'AVANZAR';
    let decisionTactica = 'CLIMA ESPACIAL ÓPTIMO: ASCENDIENDO POR VECTORES INICIALES CURIOSITY';
    let rutaElegida: any[] = [];

    if (rad >= 60) {
      codigoAccion = 'REGRESAR';
      if (inicioId === 'N0') {
        decisionTactica = '🛡️ ASTRONAUTA EN BASE BRADBURY (N0): FUERA DEL ALCANCE DE LA ONDA DE CALOR';
      } else {
        decisionTactica = '🛑 ONDA DE CALOR EXPANDIÉNDOSE: INVIRTIENDO VECTORES DE REGRESO A BASE (N0)';
      }
      rutaElegida = buscarDijkstra(inicioId, 'N0', 'REGRESO');
    } else if (rad >= 44) {
      codigoAccion = 'REFUGIO';
      const nodoAct = mapaNodos.get(inicioId);
      const refugioMeta = nodoAct.orden <= 4 ? 'S1' : nodoAct.orden <= 7 ? 'S2' : nodoAct.orden <= 10 ? 'S3' : 'S4';
      if (inicioId === refugioMeta) {
        decisionTactica = `🛡️ RESGUARDADO EN ${nodoAct.nombre.toUpperCase()}: LEJOS DEL FRENTE DE CALOR`;
      } else {
        decisionTactica = `🚨 FRENTE TÉRMICO CERCANO: EVACUANDO VECTORES INICIALES HACIA REFUGIO (${refugioMeta})`;
      }
      rutaElegida = buscarDijkstra(inicioId, refugioMeta, 'DESVIO');
    } else if (rad >= 18) {
      codigoAccion = 'DESVIO';
      decisionTactica = '⚠️ ONDA DE CALOR ACERCÁNDOSE A VECTORES INICIALES: DESVIANDO A CORREDOR SEGURO (S1 ➔ S4)';
      rutaElegida = buscarDijkstra(inicioId, 'N15', 'DESVIO');
    } else {
      codigoAccion = 'AVANZAR';
      rutaElegida = buscarDijkstra(inicioId, 'N15', 'NORMAL');
    }

    let distTotal = 0;
    let desnivelPos = 0;
    for (let i = 0; i < rutaElegida.length - 1; i++) {
      const a = rutaElegida[i];
      const b = rutaElegida[i + 1];
      const d = Math.hypot(b.svgX - a.svgX, b.svgY - a.svgY) * 8.0;
      const dh = Math.abs(b.altitud - a.altitud);
      distTotal += d;
      if (b.altitud > a.altitud) desnivelPos += dh;
      a.pendiente = Math.round(Math.atan2(dh, Math.max(1, d)) * (180 / Math.PI) * 10) / 10;
    }

    const enDestinoSeguro = rutaElegida.length <= 1;
    const velReal = enDestinoSeguro ? 0.0 : rad >= 18 ? 1.32 : 1.05;
    const tiempoLlegadaSeg = enDestinoSeguro ? 0 : Math.max(25, Math.round(distTotal / velReal));
    const distanciaFrenteM = Math.max(120, 1750 - rad * 16.5);
    const velFrente = 0.65 + rad * 0.025;
    const tiempoImpactoSeg = Math.round(distanciaFrenteM / velFrente);

    const nodoActObj = rutaElegida[0];
    const nodoBaseObj = mapaNodos.get('N0');
    const dxBase = nodoBaseObj.svgX - nodoActObj.svgX;
    const dyBase = nodoBaseObj.svgY - nodoActObj.svgY;
    const magBase = Math.max(1, Math.hypot(dxBase, dyBase));
    this.vectorEscapeBase = {
      vx: Math.round((dxBase / magBase) * 100) / 100,
      vz: Math.round((dyBase / magBase) * 100) / 100,
      distM: inicioId === 'N0' ? 0 : Math.round(magBase * 8.0)
    };

    return {
      sol_mision: 145,
      nodo_actual_id: rutaElegida[0].id,
      siguiente_waypoint: rutaElegida.length > 1 ? rutaElegida[1].nombre : 'EN RESGUARDO SEGURO',
      evaluacion_predictiva: {
        eta_cima_seg: 920,
        cima_viable: tiempoImpactoSeg > 920,
        eta_desvio_seg: 610,
        desvio_viable: tiempoImpactoSeg > 610,
        eta_retorno_seg: Math.min(310, tiempoLlegadaSeg),
        retorno_viable: true
      },
      alerta_radiacion: {
        activa: rad >= 18,
        codigo_accion: codigoAccion,
        mensaje_hud: decisionTactica,
        intensidad_tormenta: rad,
        tiempo_para_impacto_seg: tiempoImpactoSeg,
        tiempo_llegada_refugio_seg: tiempoLlegadaSeg,
        margen_supervivencia_seg: tiempoImpactoSeg - tiempoLlegadaSeg
      },
      calculos_fisicos: {
        distancia_total_m: Math.round(distTotal),
        desnivel_positivo_m: Math.round(desnivelPos),
        velocidad_real_m_s: velReal,
        pendiente_promedio_grados: rutaElegida[0].pendiente || 0,
        dosis_traje_uSv_h: rutaElegida[0].rad_nodo,
        dosis_acumulada_uSv: Math.round(rutaElegida[0].rad_nodo * 0.4 * 10) / 10,
        porcentaje_limite_nasa: Math.min(100, Math.round((rad / 95) * 65)),
        esfuerzo_metabolico_w: enDestinoSeguro ? 110 : rad >= 18 ? 265 : 235,
        consumo_o2_l_min: enDestinoSeguro ? 0.65 : 1.95,
        ritmo_cardiaco_bpm: enDestinoSeguro ? 76 : rad >= 60 ? 136 : rad >= 18 ? 115 : 94,
        oxigeno_pct: 96
      },
      ruta_grafo_java: rutaElegida,
      todos_nodos: this.catalogoNodos,
      aristas_mapa: this.paresAristas.map(([id1, id2]) => {
        const o = mapaNodos.get(id1);
        const d = mapaNodos.get(id2);
        return { x1: o.svgX, y1: o.svgY, x2: d.svgX, y2: d.svgY };
      })
    };
  }

  calcularElevacionMonteSharp(x: number, z: number): number {
    const rampaMonte = Math.max(0, (x + 80) * 0.20) + Math.max(0, (25 - z) * 0.08);
    const distCumbre = Math.hypot(x - 68, z + 8);
    const cumbre = 28 * Math.exp(-(distCumbre * distCumbre) / 3200);
    const relieveSuave = Math.sin(x * 0.09) * Math.cos(z * 0.09) * 1.4;
    return rampaMonte + cumbre + relieveSuave - 14;
  }

  svgA3D(svgX: number, svgY: number): THREE.Vector3 {
    const x = (svgX - 200) * 0.5;
    const z = (svgY - 125) * 0.5;
    const y = this.calcularElevacionMonteSharp(x, z);
    return new THREE.Vector3(x, y, z);
  }

  private generarPuntosPegadosAlTerreno(nodos: any[], elevacionExtra: number): THREE.Vector3[] {
    const puntos: THREE.Vector3[] = [];
    for (let i = 0; i < nodos.length - 1; i++) {
      const pA = this.svgA3D(nodos[i].svgX, nodos[i].svgY);
      const pB = this.svgA3D(nodos[i + 1].svgX, nodos[i + 1].svgY);
      const pasos = 16;
      for (let s = 0; s < pasos; s++) {
        const t = s / pasos;
        const x = THREE.MathUtils.lerp(pA.x, pB.x, t);
        const z = THREE.MathUtils.lerp(pA.z, pB.z, t);
        const y = this.calcularElevacionMonteSharp(x, z) + elevacionExtra;
        puntos.push(new THREE.Vector3(x, y, z));
      }
    }
    const ultimo = this.svgA3D(nodos[nodos.length - 1].svgX, nodos[nodos.length - 1].svgY);
    ultimo.y += elevacionExtra;
    puntos.push(ultimo);
    return puntos;
  }

  private crearCapaOndaCalorTerreno(cx: number, cz: number, radioX: number, radioZ: number, colorHex: number, opacidad: number, alturaExtra: number): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(radioX * 2, radioZ * 2, 28, 28);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes['position'];

    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i);
      const lz = pos.getZ(i);
      const norm = Math.hypot(lx / Math.max(0.1, radioX), lz / Math.max(0.1, radioZ));
      const factorRecorte = norm > 1.0 ? 1.0 / norm : 1.0;
      const wx = cx + lx * factorRecorte;
      const wz = cz + lz * factorRecorte;
      const wy = this.calcularElevacionMonteSharp(wx, wz) + alturaExtra;
      pos.setXYZ(i, wx, wy, wz);
    }
    geo.computeVertexNormals();

    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: opacidad,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    return new THREE.Mesh(geo, mat);
  }

  private crearAnilloTermicoTerreno(cx: number, cz: number, radioX: number, radioZ: number, colorHex: number, opacidad: number): THREE.Line {
    const pts: THREE.Vector3[] = [];
    const segmentos = 64;
    for (let i = 0; i <= segmentos; i++) {
      const ang = (i / segmentos) * Math.PI * 2;
      const wx = cx + Math.cos(ang) * radioX;
      const wz = cz + Math.sin(ang) * radioZ;
      const wy = this.calcularElevacionMonteSharp(wx, wz) + 0.28;
      pts.push(new THREE.Vector3(wx, wy, wz));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: opacidad });
    return new THREE.Line(geo, mat);
  }

  private crearEtiquetaSprite(texto: string, colorFondo: string, escala = 1.0): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = colorFondo;
    ctx.beginPath();
    ctx.roundRect(14, 10, 100, 44, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, 64, 33);

    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sprite.scale.set(3.2 * escala, 1.6 * escala, 1);
    return sprite;
  }

  private inicializarMotor3D() {
    const contenedorBase = document.getElementById('canvas-base-3d');
    const contenedorHud = document.getElementById('canvas-hud-3d');
    if (!contenedorBase || !contenedorHud) return;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x160d08);
    this.scene.fog = new THREE.FogExp2(0xb8623d, 0.0032);

    this.scene.add(new THREE.AmbientLight(0xffd8c0, 0.9));
    const sol = new THREE.DirectionalLight(0xfff3e6, 1.65);
    sol.position.set(85, 140, -65);
    this.scene.add(sol);

    const loader = new THREE.TextureLoader();
    this.texturaCuriosity = loader.load('mapa_monte_sharp.jpg');
    this.texturaMola = loader.load('relieve_mola.png');

    const geoTerreno = new THREE.PlaneGeometry(200, 125, 180, 120);
    geoTerreno.rotateX(-Math.PI / 2);
    const posAttr = geoTerreno.attributes['position'];
    for (let i = 0; i < posAttr.count; i++) {
      posAttr.setY(i, this.calcularElevacionMonteSharp(posAttr.getX(i), posAttr.getZ(i)));
    }
    geoTerreno.computeVertexNormals();

    this.terrenoMesh = new THREE.Mesh(
      geoTerreno,
      new THREE.MeshStandardMaterial({ map: this.texturaCuriosity, roughness: 0.88, metalness: 0.06 })
    );
    this.scene.add(this.terrenoMesh);

    // Malla topográfica sutil para dar sensación de velocidad al moverse en el visor derecho
    const mallaVelocidad = new THREE.Mesh(
      geoTerreno.clone(),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true, transparent: true, opacity: 0.07 })
    );
    mallaVelocidad.position.y = 0.05;
    this.scene.add(mallaVelocidad);

    const geoRoca = new THREE.DodecahedronGeometry(1, 1);
    const matRoca = new THREE.MeshStandardMaterial({ color: 0x6e351c, roughness: 0.95 });
    for (let i = 0; i < 150; i++) {
      const rx = (Math.random() - 0.5) * 185;
      const rz = (Math.random() - 0.5) * 115;
      const ry = this.calcularElevacionMonteSharp(rx, rz);
      const roca = new THREE.Mesh(geoRoca, matRoca);
      const esc = 0.14 + Math.random() * 0.28;
      roca.scale.set(esc * 1.3, esc * 0.6, esc);
      roca.position.set(rx, ry + esc * 0.12, rz);
      this.scene.add(roca);
    }

    this.grupoOndaCalor = new THREE.Group();
    this.scene.add(this.grupoOndaCalor);

    // Avatar 3D del Astronauta
    this.astronautaMesh = new THREE.Group();
    const matTraje = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const matVisor = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.8, roughness: 0.2 });
    const matMochila = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.5 });

    this.piernaIzq = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.18), matTraje);
    this.piernaIzq.position.set(-0.14, 0.28, 0);
    this.piernaDer = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.18), matTraje);
    this.piernaDer.position.set(0.14, 0.28, 0);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.32), matTraje);
    torso.position.set(0, 0.82, 0);
    const mochila = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 0.24), matMochila);
    mochila.position.set(0, 0.85, -0.24);

    const casco = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 16), matTraje);
    casco.position.set(0, 1.32, 0);
    const visorOro = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 14), matVisor);
    visorOro.position.set(0, 1.33, 0.08);

    this.brazoIzq = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.15), matTraje);
    this.brazoIzq.position.set(-0.34, 0.8, 0);
    this.brazoDer = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.15), matTraje);
    this.brazoDer.position.set(0.34, 0.8, 0);

    const aroPies = new THREE.Mesh(
      new THREE.RingGeometry(0.65, 0.95, 24),
      new THREE.MeshBasicMaterial({ color: 0x00ff88, side: THREE.DoubleSide })
    );
    aroPies.rotation.x = -Math.PI / 2;
    aroPies.position.y = 0.05;

    this.astronautaMesh.add(this.piernaIzq, this.piernaDer, torso, mochila, casco, visorOro, this.brazoIzq, this.brazoDer, aroPies);
    this.scene.add(this.astronautaMesh);

    this.flechaTangenteAstro = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 3.6, 0xfacc15, 0.95, 0.55);
    this.scene.add(this.flechaTangenteAstro);

    this.grupoGrafoOrbital = new THREE.Group();
    this.grupoVectoresOrbital = new THREE.Group();
    this.grupoMarcadoresHud = new THREE.Group();
    this.scene.add(this.grupoGrafoOrbital);
    this.scene.add(this.grupoVectoresOrbital);
    this.scene.add(this.grupoMarcadoresHud);

    // 1. CÁMARA Y EVENTOS DEL MAPA IZQUIERDO (PANEL 1)
    this.cameraBase = new THREE.PerspectiveCamera(42, contenedorBase.clientWidth / contenedorBase.clientHeight, 0.5, 800);
    this.actualizarCamaraOrbitalBase();

    this.rendererBase = new THREE.WebGLRenderer({ antialias: true });
    this.rendererBase.setSize(contenedorBase.clientWidth, contenedorBase.clientHeight);
    this.rendererBase.setPixelRatio(window.devicePixelRatio);
    contenedorBase.innerHTML = '';
    contenedorBase.appendChild(this.rendererBase.domElement);

    const domBase = this.rendererBase.domElement;
    domBase.addEventListener('mousedown', (e) => {
      this.arrastrandoBase = true;
      this.mousePrevBase = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('mouseup', () => {
      this.arrastrandoBase = false;
      this.arrastrandoHud = false;
    });
    domBase.addEventListener('mousemove', (e) => {
      if (!this.arrastrandoBase) return;
      this.anguloOrbitaBase.theta -= (e.clientX - this.mousePrevBase.x) * 0.009;
      this.anguloOrbitaBase.phi = Math.max(0.18, Math.min(1.45, this.anguloOrbitaBase.phi - (e.clientY - this.mousePrevBase.y) * 0.009));
      this.mousePrevBase = { x: e.clientX, y: e.clientY };
      this.actualizarCamaraOrbitalBase();
    });
    domBase.addEventListener('wheel', (e) => {
      e.preventDefault();
      // Zoom rápido y fluido en el mapa izquierdo
      this.anguloOrbitaBase.radio = Math.max(25, Math.min(250, this.anguloOrbitaBase.radio + e.deltaY * 0.14));
      this.actualizarCamaraOrbitalBase();
    }, { passive: false });

    // 2. CÁMARA Y EVENTOS INTERACTIVOS DEL VISOR DERECHO (PANEL 3 - ZOOM Y GIRO LIBRE)
    this.cameraHud = new THREE.PerspectiveCamera(this.hudOrbita.fov, contenedorHud.clientWidth / contenedorHud.clientHeight, 0.15, 500);
    this.rendererHud = new THREE.WebGLRenderer({ antialias: true });
    this.rendererHud.setSize(contenedorHud.clientWidth, contenedorHud.clientHeight);
    this.rendererHud.setPixelRatio(window.devicePixelRatio);
    contenedorHud.innerHTML = '';
    contenedorHud.appendChild(this.rendererHud.domElement);

    const domHud = this.rendererHud.domElement;
    domHud.addEventListener('mousedown', (e) => {
      this.arrastrandoHud = true;
      this.mousePrevHud = { x: e.clientX, y: e.clientY };
    });
    domHud.addEventListener('mousemove', (e) => {
      if (!this.arrastrandoHud) return;
      const dx = e.clientX - this.mousePrevHud.x;
      const dy = e.clientY - this.mousePrevHud.y;
      // Permite girar 360° e inclinar libremente la cámara de la derecha
      this.hudOrbita.yawOffset -= dx * 0.011;
      this.hudOrbita.pitchOffset = Math.max(-0.35, Math.min(1.35, this.hudOrbita.pitchOffset + dy * 0.009));
      this.mousePrevHud = { x: e.clientX, y: e.clientY };
    });
    domHud.addEventListener('wheel', (e) => {
      e.preventDefault();
      const paso = e.deltaY > 0 ? 1.8 : -1.8;
      this.ajustarZoomDerecha(paso);
    }, { passive: false });

    this.reconstruirGrafoYRuta3D();
  }

  // Controla el zoom de la pantalla derecha (tanto con rueda del mouse como con botones + / -)
  ajustarZoomDerecha(deltaDistancia: number) {
    if (this.modoVistaDerecha === 'SEGUIMIENTO') {
      this.hudOrbita.distancia = Math.max(1.8, Math.min(35.0, this.hudOrbita.distancia + deltaDistancia));
      this.nivelZoomDerecha = Math.round((6.5 / this.hudOrbita.distancia) * 100);
    } else {
      // En modo Primera Persona ajusta el zoom óptico del lente (FOV)
      this.hudOrbita.fov = Math.max(22, Math.min(85, this.hudOrbita.fov + deltaDistancia * 3.5));
      if (this.cameraHud) {
        this.cameraHud.fov = this.hudOrbita.fov;
        this.cameraHud.updateProjectionMatrix();
      }
      this.nivelZoomDerecha = Math.round((60 / this.hudOrbita.fov) * 100);
    }
    this.cdr.detectChanges();
  }

  // Cambia entre ver al astronauta caminando en 3D (Seguimiento) o ver desde adentro de sus ojos (1ra Persona)
  alternarModoVistaDerecha() {
    if (this.modoVistaDerecha === 'SEGUIMIENTO') {
      this.modoVistaDerecha = 'PRIMERA_PERSONA';
      this.hudOrbita.fov = 60;
      this.hudOrbita.yawOffset = 0;
      this.hudOrbita.pitchOffset = 0.08;
      this.nivelZoomDerecha = 100;
    } else {
      this.modoVistaDerecha = 'SEGUIMIENTO';
      this.hudOrbita.distancia = 6.5;
      this.hudOrbita.fov = 60;
      this.hudOrbita.yawOffset = 0;
      this.hudOrbita.pitchOffset = 0.32;
      this.nivelZoomDerecha = 100;
    }
    if (this.cameraHud) {
      this.cameraHud.fov = this.hudOrbita.fov;
      this.cameraHud.updateProjectionMatrix();
    }
    this.cdr.detectChanges();
  }

  recentrarCamaraDerecha() {
    this.hudOrbita.yawOffset = 0;
    this.hudOrbita.pitchOffset = this.modoVistaDerecha === 'SEGUIMIENTO' ? 0.32 : 0.08;
    this.hudOrbita.distancia = 6.5;
    this.hudOrbita.fov = 60;
    this.nivelZoomDerecha = 100;
    if (this.cameraHud) {
      this.cameraHud.fov = 60;
      this.cameraHud.updateProjectionMatrix();
    }
    this.cdr.detectChanges();
  }

  ajustarZoomIzquierda(delta: number) {
    this.anguloOrbitaBase.radio = Math.max(25, Math.min(250, this.anguloOrbitaBase.radio + delta));
    this.actualizarCamaraOrbitalBase();
  }

  enfocarAstronautaIzquierda() {
    if (this.astronautaMesh) {
      this.centroOrbitaBase.copy(this.astronautaMesh.position);
      this.anguloOrbitaBase.radio = 65;
      this.actualizarCamaraOrbitalBase();
    }
  }

  cambiarVelocidad(vel: number) {
    this.velocidadSimulacion = vel;
    this.caminataActiva = true;
  }

  private actualizarCamaraOrbitalBase() {
    if (!this.cameraBase) return;
    const { theta, phi, radio } = this.anguloOrbitaBase;
    this.cameraBase.position.x = this.centroOrbitaBase.x + radio * Math.sin(phi) * Math.sin(theta);
    this.cameraBase.position.y = this.centroOrbitaBase.y + radio * Math.cos(phi);
    this.cameraBase.position.z = this.centroOrbitaBase.z + radio * Math.sin(phi) * Math.cos(theta);
    this.cameraBase.lookAt(this.centroOrbitaBase);
  }

  private reconstruirGrafoYRuta3D() {
    if (!this.scene || !this.datosMision) return;

    while (this.grupoGrafoOrbital.children.length > 0) this.grupoGrafoOrbital.remove(this.grupoGrafoOrbital.children[0]);
    while (this.grupoVectoresOrbital.children.length > 0) this.grupoVectoresOrbital.remove(this.grupoVectoresOrbital.children[0]);
    while (this.grupoMarcadoresHud.children.length > 0) this.grupoMarcadoresHud.remove(this.grupoMarcadoresHud.children[0]);
    while (this.grupoOndaCalor.children.length > 0) this.grupoOndaCalor.remove(this.grupoOndaCalor.children[0]);
    this.anillosPulsoCalor = [];
    this.balizasCaminoHud = [];

    for (const n of this.datosMision.todos_nodos) {
      const pos = this.svgA3D(n.svgX, n.svgY);
      const esRefugio = n.tipo === 'REFUGIO';
      const esActual = n.id === this.nodoActualId;
      const colorHex = esActual ? 0xfacc15 : esRefugio ? 0x38bdf8 : 0x00ff88;

      const meshNodoOrbital = new THREE.Mesh(
        new THREE.SphereGeometry(esActual ? 0.72 : 0.48, 16, 16),
        new THREE.MeshBasicMaterial({ color: colorHex })
      );
      meshNodoOrbital.position.set(pos.x, pos.y + 0.35, pos.z);
      this.grupoGrafoOrbital.add(meshNodoOrbital);

      const anilloBase = new THREE.Mesh(
        new THREE.RingGeometry(0.7, 1.05, 24),
        new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 0.7 })
      );
      anilloBase.rotation.x = -Math.PI / 2;
      anilloBase.position.set(pos.x, pos.y + 0.08, pos.z);
      this.grupoGrafoOrbital.add(anilloBase);

      const etiquetaOrbital = this.crearEtiquetaSprite(
        n.id,
        esActual ? 'rgba(202, 138, 4, 0.95)' : esRefugio ? 'rgba(2, 132, 199, 0.92)' : 'rgba(15, 23, 42, 0.88)',
        1.05
      );
      etiquetaOrbital.position.set(pos.x, pos.y + 2.2, pos.z);
      this.grupoGrafoOrbital.add(etiquetaOrbital);

      const aroHud = new THREE.Mesh(
        new THREE.RingGeometry(0.45, 0.72, 24),
        new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
      );
      aroHud.rotation.x = -Math.PI / 2;
      aroHud.position.set(pos.x, pos.y + 0.06, pos.z);
      this.grupoMarcadoresHud.add(aroHud);

      const etiquetaHud = this.crearEtiquetaSprite(
        `${n.id}`,
        esRefugio ? 'rgba(2, 132, 199, 0.85)' : 'rgba(16, 185, 129, 0.85)',
        0.65
      );
      etiquetaHud.position.set(pos.x, pos.y + 2.4, pos.z);
      this.grupoMarcadoresHud.add(etiquetaHud);
    }

    const matRed = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.52 });
    for (const a of this.datosMision.aristas_mapa) {
      const ptsArista = this.generarPuntosPegadosAlTerreno(
        [{ svgX: a.x1, svgY: a.y1 }, { svgX: a.x2, svgY: a.y2 }],
        0.12
      );
      this.grupoGrafoOrbital.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ptsArista), matRed));
      this.grupoMarcadoresHud.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ptsArista), matRed));
    }

    if (this.rutaTuboMesh) this.scene.remove(this.rutaTuboMesh);
    if (this.rutaHudMesh) this.scene.remove(this.rutaHudMesh);

    const nodosRuta = this.datosMision.ruta_grafo_java;
    const accion = this.datosMision.alerta_radiacion.codigo_accion;
    const colorRuta = accion === 'AVANZAR' ? 0x00ff88 : accion === 'DESVIO' ? 0x38bdf8 : 0xff5500;

    if (nodosRuta && nodosRuta.length >= 2) {
      const puntosSuelo = this.generarPuntosPegadosAlTerreno(nodosRuta, 0.14);
      const curvaSuelo = new THREE.CatmullRomCurve3(puntosSuelo);

      this.rutaTuboMesh = new THREE.Mesh(
        new THREE.TubeGeometry(curvaSuelo, 140, 0.22, 8, false),
        new THREE.MeshBasicMaterial({ color: colorRuta })
      );
      this.grupoGrafoOrbital.add(this.rutaTuboMesh);

      const geoAlfombraHud = new THREE.TubeGeometry(curvaSuelo, 140, 0.6, 4, false);
      geoAlfombraHud.scale(1, 0.04, 1);
      this.rutaHudMesh = new THREE.Mesh(
        geoAlfombraHud,
        new THREE.MeshBasicMaterial({ color: colorRuta, transparent: true, opacity: 0.55 })
      );
      this.scene.add(this.rutaHudMesh);

      // Balizas luminosas animadas a lo largo del camino para que en la pantalla derecha se note la velocidad
      const totalBalizas = 24;
      const geoBaliza = new THREE.ConeGeometry(0.28, 0.75, 4);
      geoBaliza.rotateX(Math.PI / 2);
      for (let b = 0; b < totalBalizas; b++) {
        const t = b / totalBalizas;
        const pt = curvaSuelo.getPointAt(t);
        const tg = curvaSuelo.getTangentAt(t);
        const meshBaliza = new THREE.Mesh(
          geoBaliza,
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })
        );
        meshBaliza.position.set(pt.x, pt.y + 0.15, pt.z);
        meshBaliza.lookAt(pt.x + tg.x, pt.y + tg.y + 0.15, pt.z + tg.z);
        this.grupoMarcadoresHud.add(meshBaliza);
        this.balizasCaminoHud.push(meshBaliza);
      }

      for (let i = 0; i < nodosRuta.length - 1; i++) {
        const pA = this.svgA3D(nodosRuta[i].svgX, nodosRuta[i].svgY);
        const pB = this.svgA3D(nodosRuta[i + 1].svgX, nodosRuta[i + 1].svgY);
        const xm = (pA.x + pB.x) * 0.5;
        const zm = (pA.z + pB.z) * 0.5;
        const ym = this.calcularElevacionMonteSharp(xm, zm) + 0.32;
        const pMedio = new THREE.Vector3(xm, ym, zm);

        pB.y = this.calcularElevacionMonteSharp(pB.x, pB.z) + 0.32;
        const dirUniforme = new THREE.Vector3().subVectors(pB, pMedio).normalize();

        const flechaTramo = new THREE.ArrowHelper(dirUniforme, pMedio, 2.5, colorRuta, 0.8, 0.5);
        this.grupoVectoresOrbital.add(flechaTramo);

        const flechaHud = new THREE.ArrowHelper(dirUniforme, pMedio, 2.2, colorRuta, 0.7, 0.45);
        this.grupoMarcadoresHud.add(flechaHud);
      }
    }

    // Onda de Calor multicapa fuera del camino
    const onda = this.obtenerParametrosOndaCalor(this.intensidadTormenta);
    const centro3D = this.svgA3D(onda.epicentroSvgX, onda.epicentroSvgY);
    const rBaseX = 8.0 + onda.factor * 20.0;
    const rBaseZ = 6.5 + onda.factor * 15.5;

    this.grupoOndaCalor.add(
      this.crearCapaOndaCalorTerreno(centro3D.x, centro3D.z, rBaseX * 1.35, rBaseZ * 1.35, 0xfacc15, 0.14 + onda.factor * 0.12, 0.10),
      this.crearCapaOndaCalorTerreno(centro3D.x, centro3D.z, rBaseX * 1.0, rBaseZ * 1.0, 0xff7700, 0.22 + onda.factor * 0.16, 0.14),
      this.crearCapaOndaCalorTerreno(centro3D.x, centro3D.z, rBaseX * 0.68, rBaseZ * 0.68, 0xff2a00, 0.30 + onda.factor * 0.20, 0.18),
      this.crearCapaOndaCalorTerreno(centro3D.x, centro3D.z, rBaseX * 0.38, rBaseZ * 0.38, 0xdc2626, 0.45, 0.22)
    );

    const anilloAlerta = this.crearAnilloTermicoTerreno(centro3D.x, centro3D.z, rBaseX * 1.35, rBaseZ * 1.35, 0xfacc15, 0.85);
    const anilloMedio = this.crearAnilloTermicoTerreno(centro3D.x, centro3D.z, rBaseX * 1.0, rBaseZ * 1.0, 0xff5500, 0.9);
    this.grupoOndaCalor.add(anilloAlerta, anilloMedio);
    this.anillosPulsoCalor.push(anilloAlerta, anilloMedio);

    const nodosInicialesObjetivo = [
      this.svgA3D(88, 150),
      this.svgA3D(110, 166),
      this.svgA3D(134, 182)
    ];
    for (const obj of nodosInicialesObjetivo) {
      const dirCalor = new THREE.Vector3(obj.x - centro3D.x, 0, obj.z - centro3D.z).normalize();
      const pBordeOnda = new THREE.Vector3(
        centro3D.x + dirCalor.x * (rBaseX * 0.85),
        this.calcularElevacionMonteSharp(centro3D.x + dirCalor.x * (rBaseX * 0.85), centro3D.z + dirCalor.z * (rBaseZ * 0.85)) + 0.35,
        centro3D.z + dirCalor.z * (rBaseZ * 0.85)
      );
      this.grupoOndaCalor.add(new THREE.ArrowHelper(dirCalor, pBordeOnda, 2.8, 0xff3b00, 0.85, 0.55));
    }
  }

  private animarSimulacion3D() {
    this.animFrameId = requestAnimationFrame(() => this.animarSimulacion3D());

    const dt = this.reloj.getDelta();
    const tiempoTotal = this.reloj.getElapsedTime();

    if (this.anillosPulsoCalor.length > 0) {
      const pulso = 0.5 + 0.5 * Math.sin(tiempoTotal * 5.0);
      this.anillosPulsoCalor.forEach((anillo, idx) => {
        const mat = anillo.material as THREE.LineBasicMaterial;
        mat.opacity = idx === 0 ? 0.45 + pulso * 0.5 : 0.55 + (1 - pulso) * 0.4;
      });
    }

    // Efecto de flujo secuencial en las flechas del camino para notar velocidad en la pantalla derecha
    if (this.balizasCaminoHud.length > 0) {
      this.balizasCaminoHud.forEach((b, i) => {
        const mat = b.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.25 + 0.75 * Math.max(0, Math.sin(tiempoTotal * 7.0 - i * 0.7));
      });
    }

    if (this.datosMision && this.datosMision.ruta_grafo_java && this.datosMision.ruta_grafo_java.length > 0) {
      const ruta = this.datosMision.ruta_grafo_java;
      const tieneSiguiente = ruta.length >= 2;
      const enMovimiento = this.caminataActiva && tieneSiguiente;

      const nActual = ruta[0];
      const nSiguiente = tieneSiguiente ? ruta[1] : ruta[0];

      const p0 = this.svgA3D(nActual.svgX, nActual.svgY);
      const p1 = this.svgA3D(nSiguiente.svgX, nSiguiente.svgY);

      if (enMovimiento) {
        const vel = this.datosMision.calculos_fisicos.velocidad_real_m_s || 1.05;
        // Aplica el multiplicador de velocidad elegido por el usuario (1x, 2.5x, 5x)
        this.progresoSegmento += dt * 0.38 * vel * this.velocidadSimulacion;

        if (this.progresoSegmento >= 1.0) {
          this.progresoSegmento = 0;
          this.nodoActualId = nSiguiente.id;
          this.actualizarRutaYTelemetria();
          return;
        }
      }

      const u = tieneSiguiente ? Math.min(1.0, Math.max(0.0, this.progresoSegmento)) : 0;
      const xActual = THREE.MathUtils.lerp(p0.x, p1.x, u);
      const zActual = THREE.MathUtils.lerp(p0.z, p1.z, u);
      const ySuelo = this.calcularElevacionMonteSharp(xActual, zActual);

      this.astronautaMesh.position.set(xActual, ySuelo + 0.06, zActual);

      const uAdelante = Math.min(1.0, u + 0.1);
      const xAdelante = THREE.MathUtils.lerp(p0.x, p1.x, uAdelante);
      const zAdelante = THREE.MathUtils.lerp(p0.z, p1.z, uAdelante);
      const yAdelante = this.calcularElevacionMonteSharp(xAdelante, zAdelante);

      const dirObjetivo = tieneSiguiente
        ? new THREE.Vector3(xAdelante - xActual, yAdelante - ySuelo, zAdelante - zActual).normalize()
        : this.tangenteSuave.clone();

      if (dirObjetivo.lengthSq() > 0.0001) {
        this.tangenteSuave.lerp(dirObjetivo, 0.15).normalize();
      }

      const anguloGiroY = Math.atan2(this.tangenteSuave.x, this.tangenteSuave.z);
      this.astronautaMesh.rotation.y = anguloGiroY;

      if (this.flechaTangenteAstro) {
        this.flechaTangenteAstro.position.set(xActual, ySuelo + 0.65, zActual);
        this.flechaTangenteAstro.setDirection(this.tangenteSuave);
      }

      if (enMovimiento) {
        const freqPaso = 9.0 * Math.sqrt(this.velocidadSimulacion);
        const osc = Math.sin(tiempoTotal * freqPaso) * 0.5;
        this.piernaIzq.rotation.x = osc;
        this.piernaDer.rotation.x = -osc;
        this.brazoIzq.rotation.x = -osc * 0.75;
        this.brazoDer.rotation.x = osc * 0.75;
      } else {
        this.piernaIzq.rotation.x = 0;
        this.piernaDer.rotation.x = 0;
        this.brazoIzq.rotation.x = 0;
        this.brazoDer.rotation.x = 0;
      }

      this.posVector3D = {
        x: Math.round(xActual * 16),
        y: Math.round((ySuelo - 4350) * 10) / 10,
        z: Math.round(zActual * 16)
      };
      this.vectorTangenteHUD = {
        tx: Math.round(this.tangenteSuave.x * 100) / 100,
        ty: Math.round(this.tangenteSuave.y * 100) / 100,
        tz: Math.round(this.tangenteSuave.z * 100) / 100
      };

      // CÁMARA INTERACTIVA DERECHA (Permite rotar con el mouse y hacer zoom en Seguimiento 3D o 1ra Persona)
      const anguloTotalYaw = anguloGiroY + this.hudOrbita.yawOffset;
      const pitch = this.hudOrbita.pitchOffset;

      if (this.modoVistaDerecha === 'SEGUIMIENTO') {
        const dist = this.hudOrbita.distancia;
        const camX = xActual - Math.sin(anguloTotalYaw) * Math.cos(pitch) * dist;
        const camZ = zActual - Math.cos(anguloTotalYaw) * Math.cos(pitch) * dist;
        const pisoCam = this.calcularElevacionMonteSharp(camX, camZ);
        const camY = Math.max(pisoCam + 0.6, ySuelo + 1.2 + Math.sin(pitch) * dist);

        this.cameraHud.position.set(camX, camY, camZ);
        this.cameraHud.lookAt(xActual + this.tangenteSuave.x * 2.2, ySuelo + 1.0, zActual + this.tangenteSuave.z * 2.2);
      } else {
        // Modo 1ra Persona dentro del casco con giro libre de cabeza y zoom óptico
        const bobV = enMovimiento ? Math.abs(Math.sin(tiempoTotal * 10.0)) * 0.045 : 0;
        const camX = xActual;
        const camZ = zActual;
        const camY = ySuelo + 1.68 + bobV;
        this.cameraHud.position.set(camX, camY, camZ);

        const miraX = camX + Math.sin(anguloTotalYaw) * Math.cos(pitch) * 18;
        const miraZ = camZ + Math.cos(anguloTotalYaw) * Math.cos(pitch) * 18;
        const miraY = camY - Math.sin(pitch) * 12;
        this.cameraHud.lookAt(miraX, miraY, miraZ);
      }

      this.angulosCasco = {
        rumboGrados: Math.round((anguloTotalYaw * 180) / Math.PI + 360) % 360,
        inclinacionGrados: Math.round(Math.asin(this.tangenteSuave.y) * (180 / Math.PI) * 10) / 10
      };
    }

    // PASADA 1: Renderiza Monitor Izquierdo
    if (this.rendererBase && this.cameraBase) {
      this.astronautaMesh.visible = true;
      this.flechaTangenteAstro.visible = true;
      this.grupoGrafoOrbital.visible = true;
      this.grupoVectoresOrbital.visible = true;
      this.grupoMarcadoresHud.visible = false;
      this.rendererBase.render(this.scene, this.cameraBase);
    }

    // PASADA 2: Renderiza Visor Derecho (En modo Seguimiento 3D muestra al astronauta caminando; en 1ra Persona oculta el casco para no tapar)
    if (this.rendererHud && this.cameraHud) {
      const mostrarCuerpoEnHud = (this.modoVistaDerecha === 'SEGUIMIENTO');
      this.astronautaMesh.visible = mostrarCuerpoEnHud;
      this.flechaTangenteAstro.visible = mostrarCuerpoEnHud;
      this.grupoGrafoOrbital.visible = false;
      this.grupoVectoresOrbital.visible = false;
      this.grupoMarcadoresHud.visible = true;
      this.rendererHud.render(this.scene, this.cameraHud);
    }
  }

  cambiarTormenta(valor: number) {
    const nuevoValor = Number(valor);
    if (nuevoValor > this.intensidadTormenta) {
      this.caminataActiva = true;
    }
    this.intensidadTormenta = nuevoValor;
    this.progresoSegmento = 0;
    this.actualizarRutaYTelemetria();
  }

  alternarTormentaProgresiva() {
    this.tormentaProgresivaActiva = !this.tormentaProgresivaActiva;
    if (this.intervaloTormenta) clearInterval(this.intervaloTormenta);

    if (this.tormentaProgresivaActiva) {
      if (this.nodoActualId === 'N0' || this.nodoActualId === 'N15') this.nodoActualId = 'N2';
      this.intensidadTormenta = 12;
      this.caminataActiva = true;
      this.progresoSegmento = 0;
      this.actualizarRutaYTelemetria();

      this.intervaloTormenta = setInterval(() => {
        if (this.intensidadTormenta < 80) {
          this.intensidadTormenta += 4;
        } else {
          this.intensidadTormenta = 12;
        }
        this.actualizarRutaYTelemetria();
      }, 2200);
    }
  }

  alternarTexturaMapa() {
    this.usarCapaMola = !this.usarCapaMola;
    if (this.terrenoMesh) {
      const mat = this.terrenoMesh.material as THREE.MeshStandardMaterial;
      mat.map = this.usarCapaMola ? this.texturaMola : this.texturaCuriosity;
      mat.needsUpdate = true;
    }
  }

  seleccionarNodoMapa(id: string) {
    this.nodoActualId = id;
    this.progresoSegmento = 0;
    this.actualizarRutaYTelemetria();
  }

  avanzarPasoAstronauta() {
    if (this.datosMision && this.datosMision.ruta_grafo_java && this.datosMision.ruta_grafo_java.length > 1) {
      this.nodoActualId = this.datosMision.ruta_grafo_java[1].id;
      this.progresoSegmento = 0;
      this.actualizarRutaYTelemetria();
    }
  }

  reiniciarMision() {
    this.tormentaProgresivaActiva = false;
    if (this.intervaloTormenta) clearInterval(this.intervaloTormenta);
    this.nodoActualId = 'N1';
    this.progresoSegmento = 0;
    this.intensidadTormenta = 12;
    this.caminataActiva = true;
    this.centroOrbitaBase.set(2, 0, 6);
    this.anguloOrbitaBase.radio = 145;
    this.actualizarCamaraOrbitalBase();
    this.recentrarCamaraDerecha();
    this.actualizarRutaYTelemetria();
  }

  formatearTiempo(segundos: number): string {
    if (segundos === undefined || segundos === null) return '0m 00s';
    const signo = segundos < 0 ? '-' : '';
    const abs = Math.abs(segundos);
    const min = Math.floor(abs / 60);
    const seg = abs % 60;
    return `${signo}${min}m ${seg < 10 ? '0' : ''}${seg}s`;
  }
}