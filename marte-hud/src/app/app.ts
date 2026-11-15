import { Component, OnInit, AfterViewInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as THREE from 'three';

// Datos de cada astronauta conectado desde su celular
export interface AstronautaDinamico {
  id: string;
  color: string;
  x: number;
  y: number;
  renderX: number;
  renderY: number;
  rumbo: number;
  destino: string;
  destXCustom?: number | null;
  destYCustom?: number | null;
  modoManual: boolean;
  esBot: boolean;
  indiceWp: number;
  vueltas: number;
  nodosEva: any[];
  rutaCalculada: any[];
  firmaRuta: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class App implements OnInit, AfterViewInit, OnDestroy {
  hostBackend: string = 'localhost';

  enlaceCelularActivo: boolean = false;
  private socketClient: WebSocket | null = null;
  private intervaloFastPoll: any;
  private versionMapaServidor: number = 0;
  private bloqueoSyncPinesHasta: number = 0;

  // Lista de astronautas conectados en tiempo real
  private mapaAstronautas = new Map<string, AstronautaDinamico>();
  listaAstronautas: AstronautaDinamico[] = [];
  idAstroEnFoco: string = '';

  get astroEnFoco(): AstronautaDinamico | undefined {
    return this.mapaAstronautas.get(this.idAstroEnFoco) || this.listaAstronautas[0];
  }

  pinSeleccionadoId: string = '';
  etiquetaPinTemporal: string = 'Piedra rara para investigar';

  get pinSeleccionadoObj(): any {
    return this.obstaculosCooperativos.find(p => p.id === this.pinSeleccionadoId) || this.obstaculosCooperativos[this.obstaculosCooperativos.length - 1];
  }

  get totalPinesInformativos(): number {
    return this.obstaculosCooperativos.filter(p => !p.bloquea).length;
  }

  get totalPinesPeligro(): number {
    return this.obstaculosCooperativos.filter(p => p.bloquea === true).length;
  }

  nodoActualId: string = 'N0';
  destinoSeleccionadoId: string = 'META';
  vueltasPlanetaCompletadas: number = 0;
  modoManualJoystick: boolean = false;
  escapeActivo: boolean = false;
  angulosCasco = { rumboGrados: 44, inclinacionGrados: 2.1 };

  herramientaMapaActiva: 'NINGUNA' | 'METEORITO' | 'RADIACION' | 'DESTINO_ASTRO' = 'NINGUNA';
  avisoRutaCraterOClima: string = '';
  private timerAvisoMapa: any;

  intensidadTormenta: number = 28;
  epicentroRadSvg = { x: 200, y: 205 };
  distanciaAstronautaARadiacionM: number = 85;

  caminataActiva: boolean = true;
  vozActiva: boolean = true;
  datosMision: any = null;

  crateresMeteoritoExtra: any[] = [];
  obstaculosCooperativos: any[] = [];
  totalNodosDesactivados: number = 0;

  svgPathLineaElevacion: string = 'M 0,34 L 300,10';
  svgPathAreaElevacion: string = 'M 0,44 L 0,34 L 300,10 L 300,44 Z';
  posCursorPerfil = { x: 20, y: 32 };
  porcentajeProgresoMapa: number = 5;

  // Variables de la escena Top-View 2D en Three.js
  private sceneMapaNodos!: THREE.Scene;
  private cameraMapaNodos!: THREE.PerspectiveCamera;
  private rendererMapaNodos!: THREE.WebGLRenderer;
  private meshSueloDerecha!: THREE.Mesh;
  private grupoGrafoCompleto: THREE.Group = new THREE.Group();
  private grupoCrateresRojos: THREE.Group = new THREE.Group();
  private grupoOndaDerecha: THREE.Group = new THREE.Group();
  private grupoMeteoritoAnim: THREE.Group = new THREE.Group();
  private grupoMarcadoresAstronautas: THREE.Group = new THREE.Group();
  private grupoRutasAstronautas: THREE.Group = new THREE.Group();

  private objetos3DAstronautas = new Map<string, { marcador: THREE.Group; meshRuta?: THREE.Object3D; firmaDibujada: string }>();

  private animFrameId: any;
  private reloj = new THREE.Clock();
  private ultimoMensajeHablado: string = '';

  private meteoritoEnCaida: {
    activo: boolean;
    progreso: number;
    origen3D: THREE.Vector3;
    impacto3D: THREE.Vector3;
    svgX: number;
    svgY: number;
    meshBolaFuego?: THREE.Mesh;
  } = {
    activo: false,
    progreso: 0,
    origen3D: new THREE.Vector3(),
    impacto3D: new THREE.Vector3(),
    svgX: 0,
    svgY: 0
  };

  // Crateres principales del mapa MOLA
  private crateresBase: any[] = [
    { id: 'CR_1', svgX: 82, svgY: 70, radio: 22, profundidad_m: 950 },
    { id: 'CR_2', svgX: 162, svgY: 118, radio: 25, profundidad_m: 1200 },
    { id: 'CR_3', svgX: 255, svgY: 82, radio: 23, profundidad_m: 1100 },
    { id: 'CR_4', svgX: 115, svgY: 178, radio: 20, profundidad_m: 820 },
    { id: 'CR_5', svgX: 215, svgY: 186, radio: 22, profundidad_m: 940 },
    { id: 'CR_6', svgX: 318, svgY: 156, radio: 23, profundidad_m: 1050 }
  ];

  // Nodos del Valle Central (Ruta A)
  private readonly nodosValleCentral: any[] = [
    { id: 'N0', svgX: 28, svgY: 125, terreno: 'VALLE_CENTRAL', codigo_usgs: 'Hto', unidad: 'Canal de Salida (Hto)', blindaje: 75, alt: -3242.4 },
    { id: 'C1', svgX: 72, svgY: 128, terreno: 'VALLE_CENTRAL', codigo_usgs: 'Hto', unidad: 'Canal Fluvial (Hto)', blindaje: 78, alt: -3238.0 },
    { id: 'C2', svgX: 116, svgY: 132, terreno: 'VALLE_CENTRAL', codigo_usgs: 'HNt', unidad: 'Transición Noeica (HNt)', blindaje: 45, alt: -3233.2 },
    { id: 'C3', svgX: 164, svgY: 162, terreno: 'VALLE_CENTRAL', codigo_usgs: 'HNt', unidad: 'Paso Inter-Cráter (HNt)', blindaje: 35, alt: -3228.5 },
    { id: 'C4', svgX: 212, svgY: 140, terreno: 'VALLE_CENTRAL', codigo_usgs: 'Hto', unidad: 'Cuenca Fluvial (Hto)', blindaje: 65, alt: -3222.0 },
    { id: 'C5', svgX: 260, svgY: 134, terreno: 'VALLE_CENTRAL', codigo_usgs: 'Hto', unidad: 'Valle Central (Hto)', blindaje: 70, alt: -3216.6 },
    { id: 'C6', svgX: 304, svgY: 114, terreno: 'VALLE_CENTRAL', codigo_usgs: 'lHv', unidad: 'Planicie Basáltica (lHv)', blindaje: 50, alt: -3211.1 },
    { id: 'C7', svgX: 344, svgY: 118, terreno: 'VALLE_CENTRAL', codigo_usgs: 'lHv', unidad: 'Terraza Oriental (lHv)', blindaje: 68, alt: -3207.4 },
    { id: 'META', svgX: 374, svgY: 122, terreno: 'OBJETIVO_META', codigo_usgs: 'lHv', unidad: 'Afloramiento Boxwork (lHv)', blindaje: 85, alt: -3204.8 }
  ];

  // Nodos del Corredor Norte y Zona Sur (Ruta B)
  private readonly nodosCorredorSeguro: any[] = [
    { id: 'S1', svgX: 52, svgY: 44, terreno: 'RUTA_SEGURA', codigo_usgs: 'lHv', unidad: 'Planicie Volcánica (lHv)', blindaje: 88, alt: -3218.5 },
    { id: 'S2', svgX: 122, svgY: 50, terreno: 'RUTA_SEGURA', codigo_usgs: 'lHv', unidad: 'Flujo Basáltico Firme (lHv)', blindaje: 90, alt: -3214.2 },
    { id: 'S3', svgX: 172, svgY: 54, terreno: 'RUTA_SEGURA', codigo_usgs: 'lHv', unidad: 'Cresta Volcánica (lHv)', blindaje: 86, alt: -3210.7 },
    { id: 'S4', svgX: 214, svgY: 48, terreno: 'RUTA_SEGURA', codigo_usgs: 'lHv', unidad: 'Corredor Protegido (lHv)', blindaje: 92, alt: -3208.3 },
    { id: 'S5', svgX: 258, svgY: 42, terreno: 'RUTA_SEGURA', codigo_usgs: 'lHv', unidad: 'Arco Boreal Seguro (lHv)', blindaje: 94, alt: -3204.0 },
    { id: 'S6', svgX: 308, svgY: 68, terreno: 'RUTA_SEGURA', codigo_usgs: 'lHv', unidad: 'Rampa Basáltica (lHv)', blindaje: 89, alt: -3206.5 },
    { id: 'S7', svgX: 348, svgY: 88, terreno: 'RUTA_SEGURA', codigo_usgs: 'lHv', unidad: 'Paso Nororiental (lHv)', blindaje: 87, alt: -3205.2 },
    { id: 'B1', svgX: 68, svgY: 182, terreno: 'RUTA_SUR', codigo_usgs: 'Hto', unidad: 'Paso Austral (Hto)', blindaje: 76, alt: -3230.0 },
    { id: 'B2', svgX: 165, svgY: 204, terreno: 'RUTA_SUR', codigo_usgs: 'Hto', unidad: 'Cuenca Sur (Hto)', blindaje: 74, alt: -3226.0 },
    { id: 'B3', svgX: 268, svgY: 192, terreno: 'RUTA_SUR', codigo_usgs: 'lHv', unidad: 'Terraza Sur (lHv)', blindaje: 80, alt: -3218.0 },
    { id: 'B4', svgX: 352, svgY: 172, terreno: 'RUTA_SUR', codigo_usgs: 'lHv', unidad: 'Acceso Sur (lHv)', blindaje: 82, alt: -3210.0 }
  ];

  private catalogoNodos: any[] = [];
  private paresAristas: [string, string][] = [];

  constructor(private cdr: ChangeDetectorRef) {
    if (typeof window !== 'undefined') {
      this.hostBackend = window.location.hostname || 'localhost';
    }
    this.construirRedCompleta();
    this.datosMision = this.generarTelemetriaDeFoco();
  }

  ngOnInit() {
    this.iniciarSincronizacionHibridaSinDelay();
    this.actualizarSistema();
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.inicializarMapaTopView2D();
      this.animarSimulacionContinua();
      window.addEventListener('resize', () => this.redimensionarVisor());
    }, 80);
  }

  ngOnDestroy() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    if (this.socketClient) this.socketClient.close();
    if (this.intervaloFastPoll) clearInterval(this.intervaloFastPoll);
  }

  calcularDistanciaMetaAstro(a: AstronautaDinamico): number {
    const meta = a.rutaCalculada[a.rutaCalculada.length - 1] || { svgX: 374, svgY: 122 };
    return Math.max(2, Math.round(Math.hypot(meta.svgX - a.x, meta.svgY - a.y) * 3.1));
  }

  private obtenerTodosBloqueos(): any[] {
    const pinesQueBloquean = this.obstaculosCooperativos.filter(p => p.bloquea === true);
    return [
      ...this.crateresBase,
      ...this.crateresMeteoritoExtra,
      ...pinesQueBloquean
    ];
  }

  // Crea un pin nuevo desde el dashboard para la tableta seleccionada
  colocarPinDesdeTabletaActiva() {
    const f = this.astroEnFoco;
    if (!f) return;
    const radAng = (f.rumbo * Math.PI) / 180.0;
    const ox = Math.max(22, Math.min(375, Math.round(f.x + Math.sin(radAng) * 12)));
    const oy = Math.max(25, Math.min(225, Math.round(f.y - Math.cos(radAng) * 12)));

    const nuevoPin = {
      uid_unico: `uid_pc_${f.id}_${Date.now()}`,
      autor: f.id,
      svgX: ox,
      svgY: oy,
      radio: 16,
      etiqueta: `Hallazgo de ${f.id} (Sin clasificar)`,
      categoria: 'INFO',
      bloquea: false
    };

    fetch(`http://${this.hostBackend}:8080/api/fast-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rol: 'PC', nuevo_obstaculo: nuevoPin })
    })
      .then(r => r.json())
      .then(srv => this.procesarEstadoServidorN(srv))
      .catch(() => {});

    this.mostrarAvisoTemporal(`Pin colocado con la Tableta [${f.id}]. Escribe su descripción arriba.`);
  }

  seleccionarPinParaEditar(idPin: string) {
    this.pinSeleccionadoId = idPin;
    const obj = this.obstaculosCooperativos.find(p => p.id === idPin);
    if (obj) {
      this.etiquetaPinTemporal = obj.etiqueta || 'Piedra rara para investigar';
    }
  }

  // Guarda la descripcion del pin y define si es informativo o peligro a rodear
  clasificarPinDesdePC(debeEvadirse: boolean) {
    const pin = this.pinSeleccionadoObj;
    if (!pin) return;

    if (pin.autor !== this.idAstroEnFoco) {
      this.mostrarAvisoTemporal(`Cambia a la Tableta de [${pin.autor}] arriba para modificar este Pin.`);
      return;
    }

    const nuevaEtiqueta = (this.etiquetaPinTemporal || '').trim() || (debeEvadirse ? 'Zona Peligrosa' : 'Piedra Rara');
    pin.etiqueta = nuevaEtiqueta;
    pin.bloquea = debeEvadirse;
    pin.categoria = debeEvadirse ? 'PELIGRO' : 'INFO';

    this.bloqueoSyncPinesHasta = Date.now() + 700;
    this.versionMapaServidor++;

    this.datosMision = this.recalcularRutasDeTodos();
    this.reconstruirMapaTopView2D();
    this.cdr.detectChanges();

    fetch(`http://${this.hostBackend}:8080/api/fast-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rol: 'PC',
        actualizar_pin: {
          id: pin.id,
          autor_solicitante: this.idAstroEnFoco,
          etiqueta: pin.etiqueta,
          bloquea: pin.bloquea
        }
      })
    }).catch(() => {});

    const msg = debeEvadirse
      ? `Tableta [${this.idAstroEnFoco}] clasificó ${pin.id} como PELIGRO ("${pin.etiqueta}"): Rutas desviadas.`
      : `Tableta [${this.idAstroEnFoco}] actualizó ${pin.id} a "${pin.etiqueta}" en el mapa.`;
    this.mostrarAvisoTemporal(msg);
    this.hablarInstruccionCasco(msg, true);
  }

  eliminarPinDesdePC(idPin: string) {
    const pin = this.obstaculosCooperativos.find(p => p.id === idPin);
    if (!pin || pin.autor !== this.idAstroEnFoco) return;

    this.bloqueoSyncPinesHasta = Date.now() + 700;
    this.obstaculosCooperativos = this.obstaculosCooperativos.filter(p => p.id !== idPin);
    this.pinSeleccionadoId = this.obstaculosCooperativos.length > 0
      ? this.obstaculosCooperativos[this.obstaculosCooperativos.length - 1].id
      : '';
    this.datosMision = this.recalcularRutasDeTodos();
    this.reconstruirMapaTopView2D();
    this.cdr.detectChanges();

    fetch(`http://${this.hostBackend}:8080/api/fast-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rol: 'PC',
        eliminar_pin_id: idPin,
        autor_solicitante: this.idAstroEnFoco
      })
    }).catch(() => {});
  }

  activarAutoRuta() {
    const f = this.astroEnFoco;
    if (f) f.modoManual = !f.modoManual;
    this.modoManualJoystick = f ? f.modoManual : false;
    this.caminataActiva = true;
    this.actualizarSistema();
  }

  seleccionarAstronautaFoco(id: string) {
    if (!this.mapaAstronautas.has(id)) return;
    this.idAstroEnFoco = id;
    this.datosMision = this.generarTelemetriaDeFoco();
    this.reconstruirMapaTopView2D();
    this.cdr.detectChanges();
  }

  cambiarDestinoDeFoco(nuevoDestino: string) {
    const f = this.astroEnFoco;
    if (!f) return;
    f.destino = nuevoDestino;
    f.destXCustom = null;
    f.destYCustom = null;
    this.destinoSeleccionadoId = nuevoDestino;
    f.rutaCalculada = this.calcularRutaIndividualAStar(f);
    f.indiceWp = 0;
    this.actualizarRutaVisualDeAstronauta(f);
    this.enviarEstadoAlServidor();
    this.datosMision = this.generarTelemetriaDeFoco();
    this.mostrarAvisoTemporal(`Ruta de Tableta [${f.id}] asignada hacia [${nuevoDestino}].`);
    this.cdr.detectChanges();
  }

  // Conexion por WebSocket con respaldo HTTP para recibir el movimiento sin retraso
  private iniciarSincronizacionHibridaSinDelay() {
    if (typeof window === 'undefined') return;

    const conectarWS = () => {
      try {
        this.socketClient = new WebSocket(`ws://${this.hostBackend}:8080/ws`);
        this.socketClient.onopen = () => { this.enlaceCelularActivo = true; };
        this.socketClient.onclose = () => { setTimeout(conectarWS, 1200); };
        this.socketClient.onmessage = (ev) => {
          try { this.procesarEstadoServidorN(JSON.parse(ev.data)); } catch {}
        };
      } catch {}
    };
    conectarWS();

    this.intervaloFastPoll = setInterval(async () => {
      try {
        const r = await fetch(`http://${this.hostBackend}:8080/api/fast-sync`);
        const srv = await r.json();
        this.enlaceCelularActivo = true;
        this.procesarEstadoServidorN(srv);
      } catch {
        this.enlaceCelularActivo = false;
      }
    }, 80);
  }

  private procesarEstadoServidorN(estado: any) {
    if (!estado || !estado.astronautas) return;

    let huboCambioGlobalMapa = false;

    if (estado.obstaculos_reportados && Date.now() > this.bloqueoSyncPinesHasta) {
      const mapaUnicos = new Map<string, any>();
      for (const p of estado.obstaculos_reportados) {
        mapaUnicos.set(p.id, p);
      }
      const listaLimpia = Array.from(mapaUnicos.values());

      const firmaSrv = JSON.stringify(listaLimpia);
      const firmaLoc = JSON.stringify(this.obstaculosCooperativos);
      if (firmaSrv !== firmaLoc) {
        const habiaMenos = listaLimpia.length > this.obstaculosCooperativos.length;
        this.obstaculosCooperativos = listaLimpia;
        huboCambioGlobalMapa = true;
        if (habiaMenos && listaLimpia.length > 0) {
          const nuevo = listaLimpia[listaLimpia.length - 1];
          this.pinSeleccionadoId = nuevo.id;
          this.etiquetaPinTemporal = nuevo.etiqueta || 'Piedra rara para investigar';
          this.idAstroEnFoco = nuevo.autor;
        }
      }
    }

    const dicRemoto = estado.astronautas;
    const idsRemotos = new Set(Object.keys(dicRemoto));

    for (const idLocal of Array.from(this.mapaAstronautas.keys())) {
      if (!idsRemotos.has(idLocal)) {
        const reg = this.objetos3DAstronautas.get(idLocal);
        if (reg) {
          this.grupoMarcadoresAstronautas.remove(reg.marcador);
          if (reg.meshRuta) this.grupoRutasAstronautas.remove(reg.meshRuta);
          this.objetos3DAstronautas.delete(idLocal);
        }
        this.mapaAstronautas.delete(idLocal);
        huboCambioGlobalMapa = true;
      }
    }

    for (const id of idsRemotos) {
      const rem = dicRemoto[id];
      let local = this.mapaAstronautas.get(id);

      if (!local) {
        local = {
          id: rem.id || id,
          color: rem.color || '#22c55e',
          x: rem.x ?? 28,
          y: rem.y ?? 125,
          renderX: rem.x ?? 28,
          renderY: rem.y ?? 125,
          rumbo: rem.rumbo || 65,
          destino: rem.destino || 'META',
          modoManual: rem.modo_manual ?? true,
          esBot: false,
          indiceWp: 0,
          vueltas: rem.vueltas_planeta || 0,
          nodosEva: rem.nodos_eva || [],
          rutaCalculada: (rem.ruta_activa_svg || []).filter((n: any) => !String(n.id).startsWith('POS_')),
          firmaRuta: ''
        };
        this.mapaAstronautas.set(id, local);
        if (!this.idAstroEnFoco || !this.mapaAstronautas.has(this.idAstroEnFoco)) {
          this.idAstroEnFoco = id;
        }
        huboCambioGlobalMapa = true;
      } else {
        local.modoManual = rem.modo_manual ?? local.modoManual;
        if (local.modoManual) {
          local.x = rem.x;
          local.y = rem.y;
          local.rumbo = rem.rumbo || local.rumbo;
          local.vueltas = rem.vueltas_planeta || 0;
          local.nodosEva = rem.nodos_eva || [];

          if (rem.ruta_activa_svg && rem.ruta_activa_svg.length >= 1) {
            local.rutaCalculada = rem.ruta_activa_svg.filter((n: any) => !String(n.id).startsWith('POS_'));
          }
          this.actualizarRutaVisualDeAstronauta(local);
        }
      }
    }

    this.listaAstronautas = Array.from(this.mapaAstronautas.values());
    if (this.listaAstronautas.length > 0 && !this.mapaAstronautas.has(this.idAstroEnFoco)) {
      this.idAstroEnFoco = this.listaAstronautas[0].id;
    }

    if (huboCambioGlobalMapa || estado.version_mapa !== this.versionMapaServidor) {
      this.versionMapaServidor = estado.version_mapa || 0;
      this.datosMision = this.recalcularRutasDeTodos();
      this.reconstruirMapaTopView2D();
      this.cdr.detectChanges();
    } else {
      this.datosMision = this.generarTelemetriaDeFoco();
      this.cdr.detectChanges();
    }
  }

  private enviarEstadoAlServidor(datosExtra: any = {}) {
    const syncAstros: any = {};
    for (const a of this.listaAstronautas) {
      syncAstros[a.id] = {
        x: Math.round(a.x * 10) / 10,
        y: Math.round(a.y * 10) / 10,
        rumbo: Math.round(a.rumbo),
        destino: a.destino,
        dest_x_custom: a.destXCustom ?? null,
        dest_y_custom: a.destYCustom ?? null,
        modo_manual: a.modoManual,
        ruta_activa_svg: a.rutaCalculada
          .filter(n => !String(n.id).startsWith('POS_'))
          .map(n => ({ id: n.id, svgX: Math.round(n.svgX), svgY: Math.round(n.svgY) }))
      };
    }

    const payload = {
      rol: 'PC',
      rad: this.intensidadTormenta,
      rad_x: this.epicentroRadSvg.x,
      rad_y: this.epicentroRadSvg.y,
      astronautas_sync: syncAstros,
      ...datosExtra
    };

    fetch(`http://${this.hostBackend}:8080/api/fast-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {});
  }

  seleccionarHerramientaMapa(herramienta: 'METEORITO' | 'RADIACION' | 'DESTINO_ASTRO') {
    if (this.herramientaMapaActiva === herramienta) {
      this.herramientaMapaActiva = 'NINGUNA';
      return;
    }
    this.herramientaMapaActiva = herramienta;
    if (herramienta === 'METEORITO') {
      this.mostrarAvisoTemporal('Haz clic en el mapa para soltar un Meteorito (afectará a todos los astronautas conectados).');
    } else if (herramienta === 'RADIACION') {
      this.mostrarAvisoTemporal('Haz clic o arrastra en el mapa para mover la Radiación (afectará a todos los astronautas).');
    } else {
      this.mostrarAvisoTemporal(`Haz clic en cualquier punto del mapa para fijar el destino de [${this.idAstroEnFoco}].`);
    }
  }

  private mostrarAvisoTemporal(texto: string) {
    this.avisoRutaCraterOClima = texto;
    if (this.timerAvisoMapa) clearTimeout(this.timerAvisoMapa);
    this.timerAvisoMapa = setTimeout(() => {
      this.avisoRutaCraterOClima = '';
      this.cdr.detectChanges();
    }, 5500);
    this.cdr.detectChanges();
  }

  private lanzarMeteoritoEnCoordenadaExacta(impX: number, impY: number) {
    if (this.meteoritoEnCaida.activo) return;

    const impacto3D = this.svgA3D(impX, impY);
    const origen3D = new THREE.Vector3(impacto3D.x - 28, 60, impacto3D.z - 20);

    while (this.grupoMeteoritoAnim.children.length > 0) {
      this.grupoMeteoritoAnim.remove(this.grupoMeteoritoAnim.children[0]);
    }

    const bolaFuego = new THREE.Mesh(
      new THREE.SphereGeometry(2.6, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffaa00 })
    );
    const haloFuego = new THREE.Mesh(
      new THREE.SphereGeometry(4.0, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.6 })
    );
    bolaFuego.add(haloFuego);
    bolaFuego.position.copy(origen3D);
    this.grupoMeteoritoAnim.add(bolaFuego);

    this.meteoritoEnCaida = {
      activo: true,
      progreso: 0,
      origen3D,
      impacto3D,
      svgX: impX,
      svgY: impY,
      meshBolaFuego: bolaFuego
    };
  }

  private finalizarImpactoMeteoritoYDesactivarNodos() {
    const { svgX, svgY } = this.meteoritoEnCaida;
    this.meteoritoEnCaida.activo = false;
    while (this.grupoMeteoritoAnim.children.length > 0) {
      this.grupoMeteoritoAnim.remove(this.grupoMeteoritoAnim.children[0]);
    }

    const nuevoCrater = {
      id: `CR_M${this.crateresMeteoritoExtra.length + 1}`,
      svgX,
      svgY,
      radio: 19,
      profundidad_m: 890
    };
    this.crateresMeteoritoExtra.push(nuevoCrater);

    for (const a of this.listaAstronautas) {
      const seg = this.asegurarPuntoFueraDeCrateres(a.x, a.y, a);
      a.x = seg.x; a.y = seg.y; a.renderX = seg.x; a.renderY = seg.y;
    }

    this.actualizarGeometriaSueloTopView();
    this.actualizarSistema();
    this.enviarEstadoAlServidor({ nuevo_crater: nuevoCrater });

    const msgAlerta = `Impacto global (${nuevoCrater.id}): Cráter enviado a todos los dispositivos conectados.`;
    this.mostrarAvisoTemporal(msgAlerta);
    this.hablarInstruccionCasco(msgAlerta, true);
  }

  hablarInstruccionCasco(texto: string, forzar = false) {
    if (!this.vozActiva || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (!forzar && texto === this.ultimoMensajeHablado) return;
    this.ultimoMensajeHablado = texto;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(texto);
      utterance.lang = 'es-MX';
      utterance.rate = 1.06;
      utterance.pitch = 0.95;
      window.speechSynthesis.speak(utterance);
    } catch {}
  }

  alternarAsistenteVoz() {
    this.vozActiva = !this.vozActiva;
  }

  private aristaTocaCrater(x1: number, y1: number, x2: number, y2: number): boolean {
    for (const c of this.obtenerTodosBloqueos()) {
      const radioBloqueo = c.radio || 16;
      for (let s = 0; s <= 16; s++) {
        const t = s / 16.0;
        const px = x1 + t * (x2 - x1);
        const py = y1 + t * (y2 - y1);
        if (Math.hypot(px - c.svgX, py - c.svgY) < radioBloqueo * 1.12) {
          return true;
        }
      }
    }
    return false;
  }

  private asegurarPuntoFueraDeCrateres(x: number, y: number, astro: AstronautaDinamico): { x: number; y: number } {
    let rx = x;
    let ry = y;
    for (const c of this.obtenerTodosBloqueos()) {
      const dist = Math.hypot(rx - c.svgX, ry - c.svgY);
      const minSeg = (c.radio || 16) * 1.25;
      if (dist < minSeg) {
        const ang = Math.atan2(ry - c.svgY, rx - c.svgX);
        rx = c.svgX + Math.cos(ang) * minSeg;
        ry = c.svgY + Math.sin(ang) * minSeg;
      }
    }

    let dioVuelta = false;
    if (rx > 382) { rx = 18; dioVuelta = true; }
    else if (rx < 18) { rx = 382; dioVuelta = true; }
    if (ry > 232) { ry = 18; dioVuelta = true; }
    else if (ry < 18) { ry = 232; dioVuelta = true; }

    if (dioVuelta) {
      astro.vueltas++;
      this.vueltasPlanetaCompletadas = astro.vueltas;
      astro.renderX = rx;
      astro.renderY = ry;
    }

    return { x: rx, y: ry };
  }

  // Arma la red de nodos y desactiva los que quedan dentro del rango de un crater
  private construirRedCompleta() {
    const base: any[] = [
      ...this.nodosValleCentral.map(n => ({ ...n })),
      ...this.nodosCorredorSeguro.map(n => ({ ...n }))
    ];

    for (const cr of this.obtenerTodosBloqueos()) {
      const puntos = 8;
      const radioSeg = (cr.radio || 16) * 1.38;
      for (let k = 0; k < puntos; k++) {
        const ang = (k / puntos) * Math.PI * 2.0;
        const rx = Math.max(20, Math.min(380, Math.round(cr.svgX + Math.cos(ang) * radioSeg)));
        const ry = Math.max(22, Math.min(228, Math.round(cr.svgY + Math.sin(ang) * radioSeg)));
        base.push({
          id: `${cr.id}_R${k}`,
          svgX: rx,
          svgY: ry,
          terreno: 'FALDA_CRATER',
          codigo_usgs: 'AHi/lHv',
          unidad: 'Desvío Borde (lHv)',
          blindaje: 65,
          alt: -3225.0,
          emergencia: false
        });
      }
    }

    const todosBloqueos = this.obtenerTodosBloqueos();
    let desactivados = 0;
    for (const nodo of base) {
      nodo.desactivadoPorCrater = false;
      for (const c of todosBloqueos) {
        if (Math.hypot(nodo.svgX - c.svgX, nodo.svgY - c.svgY) <= (c.radio || 16) * 1.18) {
          if (!['N0', 'META', 'S5', 'C4', 'B2'].includes(nodo.id)) {
            nodo.desactivadoPorCrater = true;
            desactivados++;
            break;
          }
        }
      }
    }
    this.totalNodosDesactivados = desactivados;
    this.catalogoNodos = base;

    this.paresAristas = [];
    for (let i = 0; i < this.catalogoNodos.length; i++) {
      const a = this.catalogoNodos[i];
      if (a.desactivadoPorCrater) continue;
      for (let j = i + 1; j < this.catalogoNodos.length; j++) {
        const b = this.catalogoNodos[j];
        if (b.desactivadoPorCrater) continue;
        if (Math.hypot(a.svgX - b.svgX, a.svgY - b.svgY) <= 88 && !this.aristaTocaCrater(a.svgX, a.svgY, b.svgX, b.svgY)) {
          this.paresAristas.push([a.id, b.id]);
        }
      }
    }
  }

  // Algoritmo A* para calcular la ruta individual de cada astronauta
  private calcularRutaIndividualAStar(astro: AstronautaDinamico): any[] {
    const radioOnda = 22 + this.intensidadTormenta * 0.85;
    let nodoDestinoFinal: any;

    if (astro.destXCustom != null && astro.destYCustom != null) {
      nodoDestinoFinal = { id: astro.destino, svgX: astro.destXCustom, svgY: astro.destYCustom, desactivadoPorCrater: false };
    } else {
      nodoDestinoFinal =
        this.catalogoNodos.find(n => n.id === astro.destino) ||
        this.nodosValleCentral[this.nodosValleCentral.length - 1];

      if (Math.hypot(astro.x - nodoDestinoFinal.svgX, astro.y - nodoDestinoFinal.svgY) < 18) {
        nodoDestinoFinal = astro.destino !== 'N0' ? this.nodosValleCentral[0] : this.nodosValleCentral[this.nodosValleCentral.length - 1];
      }
    }

    const idInicio = `POS_${astro.id}`;
    const nodoInicioVirtual = { id: idInicio, svgX: astro.x, svgY: astro.y, desactivadoPorCrater: false };

    const nodosGrafo = [
      nodoInicioVirtual,
      ...this.catalogoNodos.filter(n => !n.desactivadoPorCrater && (n.id === nodoDestinoFinal.id || Math.hypot(n.svgX - astro.x, n.svgY - astro.y) >= 12))
    ];
    if (astro.destXCustom != null) {
      nodosGrafo.push(nodoDestinoFinal);
    }

    const mapaNodos = new Map<string, any>();
    nodosGrafo.forEach(n => mapaNodos.set(n.id, n));

    const adyacencia = new Map<string, string[]>();
    nodosGrafo.forEach(n => adyacencia.set(n.id, []));
    for (const [u, v] of this.paresAristas) {
      if (adyacencia.has(u) && adyacencia.has(v)) {
        adyacencia.get(u)!.push(v);
        adyacencia.get(v)!.push(u);
      }
    }
    for (const n of nodosGrafo) {
      if (n.id !== idInicio && Math.hypot(n.svgX - astro.x, n.svgY - astro.y) <= 115 && !this.aristaTocaCrater(astro.x, astro.y, n.svgX, n.svgY)) {
        adyacencia.get(idInicio)!.push(n.id);
      }
      if (astro.destXCustom != null && n.id !== nodoDestinoFinal.id && Math.hypot(n.svgX - nodoDestinoFinal.svgX, n.svgY - nodoDestinoFinal.svgY) <= 115 && !this.aristaTocaCrater(n.svgX, n.svgY, nodoDestinoFinal.svgX, nodoDestinoFinal.svgY)) {
        adyacencia.get(n.id)!.push(nodoDestinoFinal.id);
      }
    }

    const gScore = new Map<string, number>();
    const fScore = new Map<string, number>();
    const previos = new Map<string, string | null>();
    const visitados = new Set<string>();

    nodosGrafo.forEach(n => {
      gScore.set(n.id, Infinity);
      fScore.set(n.id, Infinity);
      previos.set(n.id, null);
    });
    gScore.set(idInicio, 0);
    fScore.set(idInicio, 0);

    while (visitados.size < nodosGrafo.length) {
      let u: string | null = null;
      let minF = Infinity;
      fScore.forEach((val, id) => {
        if (!visitados.has(id) && val < minF) { minF = val; u = id; }
      });
      if (!u || u === nodoDestinoFinal.id) break;
      visitados.add(u);

      const nodoU = mapaNodos.get(u)!;
      for (const v of (adyacencia.get(u) || [])) {
        if (visitados.has(v)) continue;
        const vecino = mapaNodos.get(v)!;
        const dist = Math.hypot(vecino.svgX - nodoU.svgX, vecino.svgY - nodoU.svgY);

        let penalizacion = 0;
        const distVecinoRad = Math.hypot(vecino.svgX - this.epicentroRadSvg.x, vecino.svgY - this.epicentroRadSvg.y);
        if (distVecinoRad < radioOnda + 20) {
          penalizacion += 25000;
        }

        const tent = gScore.get(u)! + dist + penalizacion;
        if (tent < gScore.get(v)!) {
          previos.set(v, u);
          gScore.set(v, tent);
          fScore.set(v, tent + Math.hypot(vecino.svgX - nodoDestinoFinal.svgX, vecino.svgY - nodoDestinoFinal.svgY));
        }
      }
    }

    const ruta: any[] = [];
    let paso: string | null = nodoDestinoFinal.id;
    while (paso && mapaNodos.has(paso)) {
      if (paso !== idInicio) {
        ruta.unshift(mapaNodos.get(paso)!);
      }
      paso = previos.get(paso) || null;
    }
    if (ruta.length === 0) {
      return [this.nodosCorredorSeguro[2], nodoDestinoFinal];
    }
    return ruta;
  }

  recalcularRutasDeTodos() {
    this.construirRedCompleta();
    for (const a of this.listaAstronautas) {
      a.rutaCalculada = this.calcularRutaIndividualAStar(a);
      a.indiceWp = 0;
      this.actualizarRutaVisualDeAstronauta(a);
    }
    return this.generarTelemetriaDeFoco();
  }

  private generarTelemetriaDeFoco() {
    const f = this.astroEnFoco;
    if (!f) {
      return {
        unidad_geologica: 'Canal Fluvial de Salida (Hto)',
        dosis_uSv_h: 9.5,
        alerta_radiacion: {
          tiempo_llegada_refugio_seg: 0,
          mensaje_hud: 'Esperando que los dispositivos móviles se conecten...'
        },
        calculos_fisicos: { distancia_total_m: 0, velocidad_real_m_s: 0.62 }
      };
    }

    const ruta = f.rutaCalculada.length >= 1 ? f.rutaCalculada : this.nodosValleCentral;
    const sig = ruta[Math.min(ruta.length - 1, f.indiceWp)] || ruta[ruta.length - 1];
    const meta = ruta[ruta.length - 1];

    const dx = sig.svgX - f.x;
    const dy = sig.svgY - f.y;
    const distMetaM = Math.max(2, Math.round(Math.hypot(meta.svgX - f.x, meta.svgY - f.y) * 3.1 * 10) / 10);
    const rumbo = Math.round(((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360);

    this.angulosCasco.rumboGrados = rumbo;
    this.vueltasPlanetaCompletadas = f.vueltas || 0;
    this.modoManualJoystick = f.modoManual;
    this.destinoSeleccionadoId = f.destino;

    const radioOnda = 22 + this.intensidadTormenta * 0.85;
    const distRad = Math.hypot(f.x - this.epicentroRadSvg.x, f.y - this.epicentroRadSvg.y);
    this.distanciaAstronautaARadiacionM = Math.max(0, Math.round((distRad - radioOnda) * 0.86));

    const factorProx = Math.exp(-Math.pow(Math.max(5, distRad) / 85.0, 2));
    const dosis = Math.round((9.5 + this.intensidadTormenta * 1.6 * factorProx) * 10) / 10;

    const progresoX = Math.max(0.03, Math.min(0.98, (f.x - 24) / 350));
    this.porcentajeProgresoMapa = Math.round(progresoX * 100);
    this.posCursorPerfil = { x: Math.round(progresoX * 300), y: Math.max(8, Math.min(36, Math.round(36 - progresoX * 24))) };

    const etaSeg = Math.round(distMetaM / 0.62);

    return {
      unidad_geologica: f.y < 96 ? 'Unidad Volcánica Firme (lHv)' : 'Canal Fluvial de Salida (Hto)',
      dosis_uSv_h: dosis,
      alerta_radiacion: {
        tiempo_llegada_refugio_seg: etaSeg,
        mensaje_hud: `${this.listaAstronautas.length} Dispositivo(s) Conectado(s) — Operando Tableta de [${f.id}]`
      },
      calculos_fisicos: {
        distancia_total_m: distMetaM,
        velocidad_real_m_s: 0.62
      }
    };
  }

  // Elevacion del terreno basada en los crateres MOLA
  calcularElevacionMarteMOLA(x: number, z: number): number {
    let y = Math.sin(x * 0.06) * Math.cos(z * 0.06) * 0.5;
    for (const c of [...this.crateresBase, ...this.crateresMeteoritoExtra]) {
      const cx = (c.svgX - 200.0) * 0.5;
      const cz = (c.svgY - 125.0) * 0.5;
      const r = c.radio * 0.5;
      const d = Math.hypot(x - cx, z - cz);
      const prof = ((c.profundidad_m || 900) / 1000.0) * 6.5;
      if (d < r) y -= (1.0 - (d / r) * (d / r)) * prof;
      else if (d < r * 1.22) y += Math.sin(((d - r) / (r * 0.22)) * Math.PI) * (prof * 0.22);
    }
    return y;
  }

  svgA3D(svgX: number, svgY: number): THREE.Vector3 {
    const x = (svgX - 200.0) * 0.5;
    const z = (svgY - 125.0) * 0.5;
    return new THREE.Vector3(x, this.calcularElevacionMarteMOLA(x, z), z);
  }

  private generarPuntosRodeandoCrateres(nodos: any[], alturaExtra: number): THREE.Vector3[] {
    const puntos: THREE.Vector3[] = [];
    for (let i = 0; i < nodos.length - 1; i++) {
      const pA = this.svgA3D(nodos[i].svgX, nodos[i].svgY);
      const pB = this.svgA3D(nodos[i + 1].svgX, nodos[i + 1].svgY);
      const pasos = 14;
      for (let s = 0; s < pasos; s++) {
        const t = s / pasos;
        let x = THREE.MathUtils.lerp(pA.x, pB.x, t);
        let z = THREE.MathUtils.lerp(pA.z, pB.z, t);

        for (const c of this.obtenerTodosBloqueos()) {
          const cx = (c.svgX - 200.0) * 0.5;
          const cz = (c.svgY - 125.0) * 0.5;
          const radioSeguridad3D = (c.radio || 16) * 0.5 * 1.26;
          const dist = Math.hypot(x - cx, z - cz);
          if (dist < radioSeguridad3D) {
            const ang = Math.atan2(z - cz, x - cx);
            x = cx + Math.cos(ang) * radioSeguridad3D;
            z = cz + Math.sin(ang) * radioSeguridad3D;
          }
        }
        puntos.push(new THREE.Vector3(x, this.calcularElevacionMarteMOLA(x, z) + alturaExtra, z));
      }
    }
    const ultimo = this.svgA3D(nodos[nodos.length - 1].svgX, nodos[nodos.length - 1].svgY);
    ultimo.y += alturaExtra;
    puntos.push(ultimo);
    return puntos;
  }

  actualizarSistema() {
    this.datosMision = this.recalcularRutasDeTodos();
    this.reconstruirMapaTopView2D();
    this.enviarEstadoAlServidor();
    this.cdr.detectChanges();
  }

  private crearTexturaRegolitoMarte(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
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
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(5, 5);
    return tex;
  }

  private crearEtiquetaSprite(texto: string, colorFondo: string, escala = 1.0): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 300; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = colorFondo;
    ctx.beginPath();
    ctx.roundRect(6, 10, 288, 44, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto.slice(0, 34), 150, 33);

    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sprite.scale.set(6.2 * escala, 1.55 * escala, 1);
    return sprite;
  }

  private crearPinClasificable3DEnMapa(centro: THREE.Vector3, obs: any): THREE.Group {
    const pin = new THREE.Group();
    const esPeligro = obs.bloquea === true;
    const colorPrincipal = esPeligro ? 0xef4444 : 0x0ea5e9;
    const colorEmisivo = esPeligro ? 0xb91c1c : 0x0284c7;

    const aroBase = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 2.2, 24),
      new THREE.MeshBasicMaterial({ color: esPeligro ? 0xfacc15 : 0x38bdf8, side: THREE.DoubleSide })
    );
    aroBase.rotation.x = -Math.PI / 2;
    aroBase.position.y = 0.25;

    const conoGota = new THREE.Mesh(
      new THREE.ConeGeometry(2.1, 4.8, 20),
      new THREE.MeshStandardMaterial({ color: colorPrincipal, emissive: colorEmisivo, emissiveIntensity: 0.45, roughness: 0.3 })
    );
    conoGota.rotation.x = Math.PI;
    conoGota.position.y = 3.1;

    const cabezaPin = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 20, 20),
      new THREE.MeshStandardMaterial({ color: colorPrincipal, emissive: colorEmisivo, emissiveIntensity: 0.5, roughness: 0.25 })
    );
    cabezaPin.position.y = 5.0;

    const puntoCentro = new THREE.Mesh(
      new THREE.CircleGeometry(1.0, 16),
      new THREE.MeshBasicMaterial({ color: esPeligro ? 0xfef08a : 0xffffff })
    );
    puntoCentro.rotation.x = -Math.PI / 2;
    puntoCentro.position.y = 7.3;

    const bg = esPeligro ? 'rgba(185, 28, 28, 0.96)' : 'rgba(3, 105, 161, 0.96)';
    const textoMostrar = `${obs.id} (${obs.autor}): ${obs.etiqueta || 'Sin clasificar'}`;
    const etiq = this.crearEtiquetaSprite(textoMostrar, bg, 0.95);
    etiq.material.depthTest = false;
    etiq.renderOrder = 999;
    etiq.position.set(0, 10.5, -4.8);

    pin.add(aroBase, conoGota, cabezaPin, puntoCentro, etiq);
    if (esPeligro) {
      const rBloqueo = (obs.radio || 16) * 0.5;
      pin.add(this.crearAnilloTerreno(0, 0, rBloqueo * 1.25, 0xef4444));
    }
    pin.position.copy(centro);
    return pin;
  }

  private obtenerOCrearVisualAstronauta(astro: AstronautaDinamico) {
    if (this.objetos3DAstronautas.has(astro.id)) {
      return this.objetos3DAstronautas.get(astro.id)!;
    }
    const colorThree = new THREE.Color(astro.color);
    const grupo = new THREE.Group();

    const circulo = new THREE.Mesh(new THREE.CircleGeometry(2.4, 20), new THREE.MeshBasicMaterial({ color: colorThree }));
    circulo.rotation.x = -Math.PI / 2;

    const borde = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.3, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    borde.rotation.x = -Math.PI / 2;

    const geoCono = new THREE.ConeGeometry(3.8, 8.5, 12);
    geoCono.rotateX(Math.PI / 2);
    geoCono.translate(0, 0, 4.5);
    const cono = new THREE.Mesh(geoCono, new THREE.MeshBasicMaterial({ color: colorThree, transparent: true, opacity: 0.42 }));

    const etiq = this.crearEtiquetaSprite(astro.id, 'rgba(15, 23, 42, 0.92)', 0.72);
    etiq.position.set(0, 3.2, 0);

    grupo.add(circulo, borde, cono, etiq);
    this.grupoMarcadoresAstronautas.add(grupo);

    const registro: { marcador: THREE.Group; meshRuta?: THREE.Object3D; firmaDibujada: string } = {
      marcador: grupo,
      meshRuta: undefined,
      firmaDibujada: ''
    };
    this.objetos3DAstronautas.set(astro.id, registro);
    return registro;
  }

  private actualizarRutaVisualDeAstronauta(astro: AstronautaDinamico) {
    if (!this.sceneMapaNodos) return;
    if (!astro.rutaCalculada || astro.rutaCalculada.length < 1) {
      astro.rutaCalculada = this.calcularRutaIndividualAStar(astro);
    }
    const reg = this.obtenerOCrearVisualAstronauta(astro);

    const tramosConInicio = [{ id: 'PIES', svgX: astro.x, svgY: astro.y }, ...astro.rutaCalculada];
    const nuevaFirma = `${Math.round(astro.x / 3)},${Math.round(astro.y / 3)}_${astro.rutaCalculada.map(n => n.id).join('-')}_${this.versionMapaServidor}_${this.idAstroEnFoco}`;
    if (reg.firmaDibujada === nuevaFirma) return;
    reg.firmaDibujada = nuevaFirma;

    if (reg.meshRuta) {
      this.grupoRutasAstronautas.remove(reg.meshRuta);
      if ((reg.meshRuta as THREE.Mesh).geometry) (reg.meshRuta as THREE.Mesh).geometry.dispose();
    }

    const pts = this.generarPuntosRodeandoCrateres(tramosConInicio, 0.28);
    if (pts.length >= 2) {
      const curva = new THREE.CatmullRomCurve3(pts);
      const esFoco = astro.id === this.idAstroEnFoco;
      const geoTubo = new THREE.TubeGeometry(curva, 70, esFoco ? 1.05 : 0.65, 6, false);
      const matTubo = new THREE.MeshBasicMaterial({
        color: new THREE.Color(astro.color),
        transparent: true,
        opacity: esFoco ? 0.98 : 0.75
      });
      const mesh = new THREE.Mesh(geoTubo, matTubo);
      this.grupoRutasAstronautas.add(mesh);
      reg.meshRuta = mesh;
    }
  }

  private actualizarGeometriaSueloTopView() {
    if (!this.meshSueloDerecha) return;
    const geo = new THREE.PlaneGeometry(200, 125, 160, 100);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes['position'];
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, this.calcularElevacionMarteMOLA(pos.getX(i), pos.getZ(i)));
    }
    geo.computeVertexNormals();
    this.meshSueloDerecha.geometry.dispose();
    this.meshSueloDerecha.geometry = geo;
  }

  private inicializarMapaTopView2D() {
    const divDerecha = document.getElementById('canvas-vision-3d');
    if (!divDerecha) return;

    const texturaSuelo = this.crearTexturaRegolitoMarte();

    this.sceneMapaNodos = new THREE.Scene();
    this.sceneMapaNodos.background = new THREE.Color(0x110a06);

    this.sceneMapaNodos.add(new THREE.AmbientLight(0xffd8be, 0.95));
    const solDer = new THREE.DirectionalLight(0xfff1e0, 1.75);
    solDer.position.set(40, 150, -30);
    this.sceneMapaNodos.add(solDer);

    const geo = new THREE.PlaneGeometry(200, 125, 160, 100);
    geo.rotateX(-Math.PI / 2);
    this.meshSueloDerecha = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ map: texturaSuelo, roughness: 0.88, metalness: 0.06 })
    );
    this.actualizarGeometriaSueloTopView();
    this.sceneMapaNodos.add(this.meshSueloDerecha);

    this.sceneMapaNodos.add(this.grupoCrateresRojos);
    this.sceneMapaNodos.add(this.grupoGrafoCompleto);
    this.sceneMapaNodos.add(this.grupoOndaDerecha);
    this.sceneMapaNodos.add(this.grupoRutasAstronautas);
    this.sceneMapaNodos.add(this.grupoMarcadoresAstronautas);
    this.sceneMapaNodos.add(this.grupoMeteoritoAnim);

    this.cameraMapaNodos = new THREE.PerspectiveCamera(40, divDerecha.clientWidth / divDerecha.clientHeight, 1, 600);
    this.cameraMapaNodos.position.set(0, 168, 0.01);
    this.cameraMapaNodos.lookAt(0, 0, 0);

    this.rendererMapaNodos = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.rendererMapaNodos.setSize(divDerecha.clientWidth, divDerecha.clientHeight);
    this.rendererMapaNodos.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    divDerecha.innerHTML = '';
    divDerecha.appendChild(this.rendererMapaNodos.domElement);

    const domDer = this.rendererMapaNodos.domElement;

    const obtenerCoordenadaMouseEnMapa = (e: MouseEvent): { svgX: number; svgY: number } | null => {
      const rect = domDer.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, this.cameraMapaNodos);
      const intersects = raycaster.intersectObject(this.meshSueloDerecha);
      if (intersects.length > 0) {
        const pt = intersects[0].point;
        return {
          svgX: Math.max(20, Math.min(380, Math.round(pt.x * 2.0 + 200.0))),
          svgY: Math.max(20, Math.min(230, Math.round(pt.z * 2.0 + 125.0)))
        };
      }
      return null;
    };

    domDer.addEventListener('click', (e) => {
      const coord = obtenerCoordenadaMouseEnMapa(e);
      if (!coord) return;

      if (this.herramientaMapaActiva === 'METEORITO') {
        this.lanzarMeteoritoEnCoordenadaExacta(coord.svgX, coord.svgY);
      } else if (this.herramientaMapaActiva === 'RADIACION') {
        this.epicentroRadSvg = { x: coord.svgX, y: coord.svgY };
        this.actualizarSistema();
      } else if (this.herramientaMapaActiva === 'DESTINO_ASTRO') {
        const f = this.astroEnFoco;
        if (f) {
          f.destXCustom = coord.svgX;
          f.destYCustom = coord.svgY;
          f.destino = `PUNTO_${coord.svgX}_${coord.svgY}`;
          f.rutaCalculada = this.calcularRutaIndividualAStar(f);
          f.indiceWp = 0;
          this.actualizarSistema();
          this.mostrarAvisoTemporal(`Ruta de [${f.id}] trazada hacia (${coord.svgX}, ${coord.svgY}).`);
        }
      }
    });

    domDer.addEventListener('mousemove', (e) => {
      if (this.herramientaMapaActiva === 'RADIACION' && e.buttons === 1) {
        const coord = obtenerCoordenadaMouseEnMapa(e);
        if (coord) {
          this.epicentroRadSvg = { x: coord.svgX, y: coord.svgY };
          this.actualizarSistema();
        }
      }
    });

    this.reconstruirMapaTopView2D();
  }

  private crearDiscoTerreno(cx: number, cz: number, radio: number, colorHex: number, opacidad: number, alturaExtra: number): THREE.Mesh {
    const geo = new THREE.CircleGeometry(radio, 36);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes['position'];
    for (let i = 0; i < pos.count; i++) {
      const wx = cx + pos.getX(i);
      const wz = cz + pos.getZ(i);
      pos.setXYZ(i, wx, this.calcularElevacionMarteMOLA(wx, wz) + alturaExtra, wz);
    }
    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: opacidad, side: THREE.DoubleSide, depthWrite: false }));
  }

  private crearAnilloTerreno(cx: number, cz: number, radio: number, colorHex: number): THREE.Line {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 48; i++) {
      const ang = (i / 48) * Math.PI * 2;
      const wx = cx + Math.cos(ang) * radio;
      const wz = cz + Math.sin(ang) * radio;
      pts.push(new THREE.Vector3(wx, this.calcularElevacionMarteMOLA(wx, wz) + 0.4, wz));
    }
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: colorHex }));
  }

  private reconstruirMapaTopView2D() {
    if (!this.datosMision || !this.sceneMapaNodos) return;

    while (this.grupoCrateresRojos.children.length > 0) this.grupoCrateresRojos.remove(this.grupoCrateresRojos.children[0]);
    while (this.grupoGrafoCompleto.children.length > 0) this.grupoGrafoCompleto.remove(this.grupoGrafoCompleto.children[0]);
    while (this.grupoOndaDerecha.children.length > 0) this.grupoOndaDerecha.remove(this.grupoOndaDerecha.children[0]);

    for (const c of [...this.crateresBase, ...this.crateresMeteoritoExtra]) {
      const centro = this.svgA3D(c.svgX, c.svgY);
      const r3D = c.radio * 0.5;
      const esMeteorito = String(c.id).startsWith('CR_M');
      this.grupoCrateresRojos.add(this.crearDiscoTerreno(centro.x, centro.z, r3D, esMeteorito ? 0xb91c1c : 0xdc2626, 0.62, 0.22));
      this.grupoCrateresRojos.add(this.crearAnilloTerreno(centro.x, centro.z, r3D * 1.25, 0xef4444));

      const etiqueta = this.crearEtiquetaSprite(`${c.id}`, 'rgba(185, 28, 28, 0.95)', 0.78);
      etiqueta.position.set(centro.x, centro.y + 3.6, centro.z);
      this.grupoCrateresRojos.add(etiqueta);
    }

    for (const obs of this.obstaculosCooperativos) {
      const centro = this.svgA3D(obs.svgX, obs.svgY);
      this.grupoCrateresRojos.add(this.crearPinClasificable3DEnMapa(centro, obs));
    }

    const mapById = new Map<string, any>();
    this.catalogoNodos.forEach(n => mapById.set(n.id, n));
    const matRed = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 });
    for (const [id1, id2] of this.paresAristas) {
      const o = mapById.get(id1);
      const d = mapById.get(id2);
      if (o && d) {
        const p1 = this.svgA3D(o.svgX, o.svgY);
        const p2 = this.svgA3D(d.svgX, d.svgY);
        p1.y += 0.22; p2.y += 0.22;
        this.grupoGrafoCompleto.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([p1, p2]), matRed));
      }
    }

    for (const n of this.catalogoNodos) {
      const pos = this.svgA3D(n.svgX, n.svgY);
      const inactivo = n.desactivadoPorCrater === true;
      const esPrincipal = ['N0', 'META', 'S5', 'C4', 'B2'].includes(n.id);

      const colorN = inactivo ? 0x475569 : esPrincipal ? 0xfacc15 : 0x10b981;
      const esferaN = new THREE.Mesh(
        new THREE.SphereGeometry(inactivo ? 0.80 : esPrincipal ? 1.35 : 0.62, 10, 10),
        new THREE.MeshBasicMaterial({ color: colorN })
      );
      esferaN.position.set(pos.x, pos.y + 0.5, pos.z);
      this.grupoGrafoCompleto.add(esferaN);

      if (esPrincipal) {
        const etiq = this.crearEtiquetaSprite(`${n.id}`, 'rgba(15, 23, 42, 0.92)', 0.80);
        etiq.position.set(pos.x, pos.y + 2.6, pos.z);
        this.grupoGrafoCompleto.add(etiq);
      }
    }

    const centroOnda = this.svgA3D(this.epicentroRadSvg.x, this.epicentroRadSvg.y);
    const radioOnda3D = (22 + this.intensidadTormenta * 0.85) * 0.5;
    this.grupoOndaDerecha.add(this.crearDiscoTerreno(centroOnda.x, centroOnda.z, radioOnda3D, 0xff4500, 0.46, 0.18));
    this.grupoOndaDerecha.add(this.crearAnilloTerreno(centroOnda.x, centroOnda.z, radioOnda3D, 0xfacc15));

    for (const a of this.listaAstronautas) {
      this.actualizarRutaVisualDeAstronauta(a);
    }
  }

  private avanzarAstronautaAutomatico(astro: AstronautaDinamico, dt: number): boolean {
    if (astro.modoManual || !this.caminataActiva || astro.rutaCalculada.length < 1) return false;
    const wpDestino = astro.rutaCalculada[Math.min(astro.rutaCalculada.length - 1, astro.indiceWp)];
    const dx = wpDestino.svgX - astro.x;
    const dy = wpDestino.svgY - astro.y;
    const dist = Math.hypot(dx, dy);
    const pasoHumano = dt * 3.6;

    astro.rumbo = Math.round(((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360);

    if (dist <= pasoHumano + 1.2) {
      astro.x = wpDestino.svgX;
      astro.y = wpDestino.svgY;
      this.nodoActualId = wpDestino.id;
      if (astro.indiceWp < astro.rutaCalculada.length - 1) {
        astro.indiceWp++;
      } else {
        astro.destXCustom = null;
        astro.destYCustom = null;
        const destinos = ['META', 'S5', 'C4', 'B2', 'N0'];
        astro.destino = destinos[(destinos.indexOf(astro.destino) + 1) % destinos.length];
        astro.rutaCalculada = this.calcularRutaIndividualAStar(astro);
        astro.indiceWp = 0;
        this.actualizarRutaVisualDeAstronauta(astro);
      }
      return true;
    } else {
      const seg = this.asegurarPuntoFueraDeCrateres(
        astro.x + (dx / dist) * pasoHumano,
        astro.y + (dy / dist) * pasoHumano,
        astro
      );
      astro.x = seg.x;
      astro.y = seg.y;
      return false;
    }
  }

  private animarSimulacionContinua() {
    this.animFrameId = requestAnimationFrame(() => this.animarSimulacionContinua());
    const dt = Math.min(0.1, this.reloj.getDelta());

    if (this.meteoritoEnCaida.activo && this.meteoritoEnCaida.meshBolaFuego) {
      this.meteoritoEnCaida.progreso += dt * 1.65;
      if (this.meteoritoEnCaida.progreso >= 1.0) {
        this.finalizarImpactoMeteoritoYDesactivarNodos();
      } else {
        this.meteoritoEnCaida.meshBolaFuego.position.lerpVectors(
          this.meteoritoEnCaida.origen3D,
          this.meteoritoEnCaida.impacto3D,
          this.meteoritoEnCaida.progreso
        );
      }
    }

    let algunBotCambioTramo = false;
    for (const a of this.listaAstronautas) {
      if (this.avanzarAstronautaAutomatico(a, dt)) {
        algunBotCambioTramo = true;
      }

      if (Math.hypot(a.x - a.renderX, a.y - a.renderY) > 120) {
        a.renderX = a.x;
        a.renderY = a.y;
      } else {
        a.renderX = THREE.MathUtils.lerp(a.renderX, a.x, 0.25);
        a.renderY = THREE.MathUtils.lerp(a.renderY, a.y, 0.25);
      }

      const reg = this.obtenerOCrearVisualAstronauta(a);
      const pos3D = this.svgA3D(a.renderX, a.renderY);
      reg.marcador.position.set(pos3D.x, pos3D.y + 1.2, pos3D.z);
      const rad = (a.rumbo * Math.PI) / 180;
      reg.marcador.rotation.y = Math.atan2(Math.sin(rad), -Math.cos(rad));
    }

    if (algunBotCambioTramo) {
      this.enviarEstadoAlServidor();
    }

    if (this.rendererMapaNodos && this.cameraMapaNodos) {
      this.rendererMapaNodos.render(this.sceneMapaNodos, this.cameraMapaNodos);
    }
  }

  cambiarTormentaDesdePC(valor: number) {
    this.intensidadTormenta = Number(valor);
    this.actualizarSistema();
  }

  reiniciarRecorrido() {
    this.intensidadTormenta = 28;
    this.epicentroRadSvg = { x: 200, y: 205 };
    this.herramientaMapaActiva = 'NINGUNA';
    this.crateresMeteoritoExtra = [];
    this.obstaculosCooperativos = [];
    this.pinSeleccionadoId = '';
    this.idAstroEnFoco = '';
    this.vueltasPlanetaCompletadas = 0;

    for (const reg of this.objetos3DAstronautas.values()) {
      this.grupoMarcadoresAstronautas.remove(reg.marcador);
      if (reg.meshRuta) this.grupoRutasAstronautas.remove(reg.meshRuta);
    }
    this.objetos3DAstronautas.clear();
    this.mapaAstronautas.clear();
    this.listaAstronautas = [];

    this.actualizarGeometriaSueloTopView();
    this.enviarEstadoAlServidor({ reset: true });
    this.actualizarSistema();
    this.mostrarAvisoTemporal('Sistema reiniciado: El mapa está en 0 hasta que los dispositivos móviles inicien nuevamente.');
  }

  private redimensionarVisor() {
    const divDer = document.getElementById('canvas-vision-3d');
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