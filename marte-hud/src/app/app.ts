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
  nodoActualId: string = 'N0';
  caminataActiva: boolean = true;
  datosMision: any = null;

  // Variables de cinemática vectorial r(t) en 3D
  progresoTramo: number = 0; // Parámetro t en [0, 1] entre el nodo actual y el siguiente
  posVector3D = { x: 0, y: 0, z: 0 };
  angulosCasco = { rumboGrados: 45, inclinacionGrados: 4.2 };

  // Escenas WebGL Three.js (Base Orbital 3D + Casco Primera Persona 3D)
  private scene!: THREE.Scene;
  private cameraBase!: THREE.PerspectiveCamera;
  private cameraHud!: THREE.PerspectiveCamera;
  private rendererBase!: THREE.WebGLRenderer;
  private rendererHud!: THREE.WebGLRenderer;

  private terrenoMesh!: THREE.Mesh;
  private texturaCuriosity!: THREE.Texture;
  private texturaMola!: THREE.Texture;
  private grupoGrafo3D!: THREE.Group;
  private rutaTuboMesh!: THREE.Mesh;
  private rutaHudMesh!: THREE.Mesh;
  private astronautaMesh!: THREE.Group;
  private domoRadiacionMesh!: THREE.Mesh;
  private curvaActiva3D: THREE.CatmullRomCurve3 | null = null;

  private animFrameId: any;
  private intervaloBackend: any;
  private reloj = new THREE.Clock();

  // Control de rotación con el mouse para la vista de la Base
  private arrastrandoMapa = false;
  private mousePrev = { x: 0, y: 0 };
  private anguloOrbita = { theta: 0.15, phi: 0.85, radio: 155 };

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.consultarBackendPython();
    this.intervaloBackend = setInterval(() => this.consultarBackendPython(), 2500);
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.inicializarMotor3D();
      this.animarSimulacion3D();
    }, 150);
  }

  ngOnDestroy() {
    if (this.intervaloBackend) clearInterval(this.intervaloBackend);
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
  }

  async consultarBackendPython() {
    try {
      const url = `http://localhost:8080/api/telemetria-marte?intensidad_tormenta=${this.intensidadTormenta}&nodo_actual=${this.nodoActualId}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json && json.ruta_grafo_java) {
        this.datosMision = json;
        this.reconstruirGrafoYRuta3D();
      }
    } catch (e) {
      console.error('Verifica que Java (8081) y Python (8080) estén activos', e);
    }
    this.cdr.detectChanges();
  }

  // Función matemática topográfica: devuelve la elevación 3D exacta del Monte Sharp en cualquier punto (x, z)
  calcularElevacionMonteSharp(x: number, z: number): number {
    // 1. Pendiente general de ascenso hacia Aeolis Mons (Monte Sharp sube hacia la derecha/abajo del mapa)
    const subidaMonte = (x + 80) * 0.16 + (z + 40) * 0.12;
    // 2. Pico principal de Aeolis Mons (Monte Sharp)
    const distPico = Math.hypot(x - 65, z - 25);
    const picoCentral = 34 * Math.exp(-(distPico * distPico) / 2800);
    // 3. Cresta Vera Rubin y rugosidad geológica de cañones (Murray Buttes / Gediz Vallis)
    const rugosidadCañon = Math.sin(x * 0.12) * Math.cos(z * 0.12) * 2.8 + Math.sin(x * 0.28 + z * 0.2) * 1.1;
    // 4. Depresión plana en Pahrump Hills (Base inicial)
    const distBase = Math.hypot(x + 68, z - 10);
    const planicieBase = -8 * Math.exp(-(distBase * distBase) / 1200);

    return subidaMonte + picoCentral + rugosidadCañon + planicieBase - 12;
  }

  // Convierte coordenadas SVG (0-400, 0-250) del grafo de Java al espacio 3D (-100 a +100)
  svgA3D(svgX: number, svgY: number): THREE.Vector3 {
    const x = (svgX - 200) * 0.5;
    const z = (svgY - 125) * 0.5;
    const y = this.calcularElevacionMonteSharp(x, z);
    return new THREE.Vector3(x, y, z);
  }

  private inicializarMotor3D() {
    const contenedorBase = document.getElementById('canvas-base-3d');
    const contenedorHud = document.getElementById('canvas-hud-3d');
    if (!contenedorBase || !contenedorHud) return;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a0f0a);
    this.scene.fog = new THREE.FogExp2(0xc26b45, 0.0045); // Atmósfera marciana con polvo en suspensión

    // Iluminación solar marciana y sombras topográficas
    const luzAmbiente = new THREE.AmbientLight(0xffd4b8, 0.75);
    this.scene.add(luzAmbiente);

    const solMarte = new THREE.DirectionalLight(0xfff0dd, 1.6);
    solMarte.position.set(80, 140, -60);
    this.scene.add(solMarte);

    // Texturas oficiales descargadas de la NASA
    const loader = new THREE.TextureLoader();
    this.texturaCuriosity = loader.load('mapa_monte_sharp.jpg');
    this.texturaMola = loader.load('relieve_mola.png');

    // Construcción de la Malla Topográfica 3D del Monte Sharp (160x100 vértices reales)
    const geoTerreno = new THREE.PlaneGeometry(200, 125, 160, 100);
    geoTerreno.rotateX(-Math.PI / 2);

    const posAttr = geoTerreno.attributes['position'];
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      posAttr.setY(i, this.calcularElevacionMonteSharp(vx, vz));
    }
    geoTerreno.computeVertexNormals();

    const matTerreno = new THREE.MeshStandardMaterial({
      map: this.texturaCuriosity,
      roughness: 0.88,
      metalness: 0.08,
      flatShading: false
    });

    this.terrenoMesh = new THREE.Mesh(geoTerreno, matTerreno);
    this.scene.add(this.terrenoMesh);

    // Malla alámbrica sutil de altimetría científica sobre el terreno
    const geoWire = geoTerreno.clone();
    const matWire = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.08
    });
    const wireMesh = new THREE.Mesh(geoWire, matWire);
    wireMesh.position.y = 0.15;
    this.scene.add(wireMesh);

    // Generación de rocas 3D marcianas a lo largo de las laderas para realismo en el casco
    const geoRoca = new THREE.DodecahedronGeometry(1, 1);
    const matRoca = new THREE.MeshStandardMaterial({ color: 0x7c3f23, roughness: 0.95 });
    for (let i = 0; i < 140; i++) {
      const rx = (Math.random() - 0.5) * 175;
      const rz = (Math.random() - 0.5) * 110;
      const ry = this.calcularElevacionMonteSharp(rx, rz);
      const roca = new THREE.Mesh(geoRoca, matRoca);
      const escala = 0.35 + Math.random() * 1.4;
      roca.scale.set(escala * 1.2, escala * 0.7, escala);
      roca.position.set(rx, ry + escala * 0.25, rz);
      roca.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      this.scene.add(roca);
    }

    // Domo volumétrico 3D de Radiación Solar sobre las crestas expuestas
    const geoDomo = new THREE.SphereGeometry(22, 32, 32);
    const matDomo = new THREE.MeshBasicMaterial({
      color: 0xff3b00,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide
    });
    this.domoRadiacionMesh = new THREE.Mesh(geoDomo, matDomo);
    const posFoco = this.svgA3D(214, 198); // Zona expuesta cerca de N4/N5
    this.domoRadiacionMesh.position.set(posFoco.x, posFoco.y + 4, posFoco.z);
    this.scene.add(this.domoRadiacionMesh);

    // Avatar 3D del Astronauta con baliza luminosa
    this.astronautaMesh = new THREE.Group();
    const cuerpo = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.8, 1.4, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x00ff88, emissiveIntensity: 0.4 })
    );
    cuerpo.position.y = 1.5;
    const aroLuz = new THREE.Mesh(
      new THREE.RingGeometry(1.4, 2.1, 24),
      new THREE.MeshBasicMaterial({ color: 0x00ff88, side: THREE.DoubleSide })
    );
    aroLuz.rotation.x = -Math.PI / 2;
    aroLuz.position.y = 0.3;
    this.astronautaMesh.add(cuerpo, aroLuz);
    this.scene.add(this.astronautaMesh);

    this.grupoGrafo3D = new THREE.Group();
    this.scene.add(this.grupoGrafo3D);

    // Configuración de Cámara 1: Monitor Orbital 3D de la Base
    this.cameraBase = new THREE.PerspectiveCamera(45, contenedorBase.clientWidth / contenedorBase.clientHeight, 1, 800);
    this.actualizarCamaraOrbital();

    this.rendererBase = new THREE.WebGLRenderer({ antialias: true });
    this.rendererBase.setSize(contenedorBase.clientWidth, contenedorBase.clientHeight);
    this.rendererBase.setPixelRatio(window.devicePixelRatio);
    contenedorBase.innerHTML = '';
    contenedorBase.appendChild(this.rendererBase.domElement);

    // Eventos de mouse en el Monitor de Base para rotar y hacer zoom al Monte Sharp 3D
    const domBase = this.rendererBase.domElement;
    domBase.addEventListener('mousedown', (e) => {
      this.arrastrandoMapa = true;
      this.mousePrev = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('mouseup', () => (this.arrastrandoMapa = false));
    domBase.addEventListener('mousemove', (e) => {
      if (!this.arrastrandoMapa) return;
      const dx = e.clientX - this.mousePrev.x;
      const dy = e.clientY - this.mousePrev.y;
      this.anguloOrbita.theta -= dx * 0.008;
      this.anguloOrbita.phi = Math.max(0.25, Math.min(1.45, this.anguloOrbita.phi - dy * 0.008));
      this.mousePrev = { x: e.clientX, y: e.clientY };
      this.actualizarCamaraOrbital();
    });
    domBase.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.anguloOrbita.radio = Math.max(60, Math.min(240, this.anguloOrbita.radio + e.deltaY * 0.08));
      this.actualizarCamaraOrbital();
    });

    // Configuración de Cámara 2: Visor Primera Persona del Casco (AR HUD)
    this.cameraHud = new THREE.PerspectiveCamera(62, contenedorHud.clientWidth / contenedorHud.clientHeight, 0.2, 500);
    this.rendererHud = new THREE.WebGLRenderer({ antialias: true });
    this.rendererHud.setSize(contenedorHud.clientWidth, contenedorHud.clientHeight);
    this.rendererHud.setPixelRatio(window.devicePixelRatio);
    contenedorHud.innerHTML = '';
    contenedorHud.appendChild(this.rendererHud.domElement);

    this.reconstruirGrafoYRuta3D();
  }

  private actualizarCamaraOrbital() {
    if (!this.cameraBase) return;
    const { theta, phi, radio } = this.anguloOrbita;
    this.cameraBase.position.x = radio * Math.sin(phi) * Math.sin(theta);
    this.cameraBase.position.y = radio * Math.cos(phi);
    this.cameraBase.position.z = radio * Math.sin(phi) * Math.cos(theta);
    this.cameraBase.lookAt(0, 2, 15);
  }

  // Dibuja los 14 nodos del Monte Sharp y la curva paramétrica 3D calculada por Java
  private reconstruirGrafoYRuta3D() {
    if (!this.scene || !this.datosMision || !this.datosMision.todos_nodos) return;

    // Limpia nodos previos
    while (this.grupoGrafo3D.children.length > 0) {
      this.grupoGrafo3D.remove(this.grupoGrafo3D.children[0]);
    }

    // 1. Dibuja las esferas 3D de cada nodo sobre el relieve del Monte Sharp
    for (const n of this.datosMision.todos_nodos) {
      const pos = this.svgA3D(n.svgX, n.svgY);
      const esRefugio = n.tipo === 'REFUGIO';
      const esActual = n.id === this.nodoActualId;

      const geoNodo = new THREE.SphereGeometry(esActual ? 1.8 : 1.15, 16, 16);
      const colorNodo = esActual ? 0xfacc15 : esRefugio ? 0x38bdf8 : 0x00ff88;
      const matNodo = new THREE.MeshBasicMaterial({ color: colorNodo });
      const meshNodo = new THREE.Mesh(geoNodo, matNodo);
      meshNodo.position.set(pos.x, pos.y + 1.2, pos.z);
      this.grupoGrafo3D.add(meshNodo);
    }

    // 2. Dibuja las aristas topográficas de todo el grafo en 3D
    if (this.datosMision.aristas_mapa) {
      const matLinea = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 });
      for (const a of this.datosMision.aristas_mapa) {
        const p1 = this.svgA3D(a.x1, a.y1);
        const p2 = this.svgA3D(a.x2, a.y2);
        const pMed = new THREE.Vector3().lerpVectors(p1, p2, 0.5);
        pMed.y = this.calcularElevacionMonteSharp(pMed.x, pMed.z) + 0.6;
        p1.y += 0.6;
        p2.y += 0.6;
        const geoLinea = new THREE.BufferGeometry().setFromPoints([p1, pMed, p2]);
        this.grupoGrafo3D.add(new THREE.Line(geoLinea, matLinea));
      }
    }

    // 3. Construye la Curva Espacial Paramétrica r(t) de la ruta activa de Dijkstra
    const nodosRuta = this.datosMision.ruta_grafo_java;
    if (nodosRuta && nodosRuta.length >= 2) {
      const puntosControl: THREE.Vector3[] = [];
      for (let i = 0; i < nodosRuta.length; i++) {
        const p = this.svgA3D(nodosRuta[i].svgX, nodosRuta[i].svgY);
        p.y += 0.85; // Elevado ligeramente sobre las rocas para que el carril AR brille en el casco
        puntosControl.push(p);

        // Puntos intermedios adaptados a la superficie de la montaña
        if (i < nodosRuta.length - 1) {
          const pSig = this.svgA3D(nodosRuta[i + 1].svgX, nodosRuta[i + 1].svgY);
          const pMid = new THREE.Vector3().lerpVectors(p, pSig, 0.5);
          pMid.y = this.calcularElevacionMonteSharp(pMid.x, pMid.z) + 0.85;
          puntosControl.push(pMid);
        }
      }

      this.curvaActiva3D = new THREE.CatmullRomCurve3(puntosControl);

      // Color según decisión táctica de Java (Verde = Avanzar, Azul = Desvío Cañón, Naranja = Regresar/Refugio)
      const accion = this.datosMision.alerta_radiacion.codigo_accion;
      const colorRuta = accion === 'AVANZAR' ? 0x00ff88 : accion === 'DESVIO' ? 0x38bdf8 : 0xff5500;

      if (this.rutaTuboMesh) this.scene.remove(this.rutaTuboMesh);
      if (this.rutaHudMesh) this.scene.remove(this.rutaHudMesh);

      const geoTubo = new THREE.TubeGeometry(this.curvaActiva3D, 90, 0.65, 8, false);
      const matTubo = new THREE.MeshBasicMaterial({ color: colorRuta });
      this.rutaTuboMesh = new THREE.Mesh(geoTubo, matTubo);
      this.scene.add(this.rutaTuboMesh);

      // Cinta holográfica ancha para que en el Casco AR se vea como un camino luminoso sobre el suelo
      const geoCintaHud = new THREE.TubeGeometry(this.curvaActiva3D, 90, 1.5, 4, false);
      geoCintaHud.scale(1, 0.12, 1);
      const matCintaHud = new THREE.MeshBasicMaterial({
        color: colorRuta,
        transparent: true,
        opacity: 0.48,
        wireframe: false
      });
      this.rutaHudMesh = new THREE.Mesh(geoCintaHud, matCintaHud);
      this.scene.add(this.rutaHudMesh);
    }

    // 4. Ajusta el tamaño del domo 3D de radiación según el deslizador
    if (this.domoRadiacionMesh) {
      const escalaRad = 0.5 + (this.intensidadTormenta / 100) * 1.6;
      this.domoRadiacionMesh.scale.set(escalaRad, escalaRad * 0.6, escalaRad);
      const mat = this.domoRadiacionMesh.material as THREE.MeshBasicMaterial;
      mat.opacity = this.intensidadTormenta >= 40 ? 0.42 : 0.15;
    }
  }

  // Bucle de animación física a 60 FPS: mueve al astronauta y orienta el casco con el vector tangente r'(t)
  private animarSimulacion3D() {
    this.animFrameId = requestAnimationFrame(() => this.animarSimulacion3D());

    const dt = this.reloj.getDelta();
    const tiempoTotal = this.reloj.getElapsedTime();

    if (this.curvaActiva3D && this.datosMision) {
      if (this.caminataActiva) {
        // Avanza el parámetro t según la velocidad de Tobler calculada por Python
        const vel = this.datosMision.calculos_fisicos.velocidad_real_m_s || 1.1;
        this.progresoTramo += dt * 0.055 * vel;

        // Cuando llega al siguiente nodo del grafo, actualiza el nodo actual en Java/Python
        if (this.progresoTramo >= 0.35 && this.datosMision.ruta_grafo_java.length > 2) {
          this.progresoTramo = 0;
          this.nodoActualId = this.datosMision.ruta_grafo_java[1].id;
          this.consultarBackendPython();
        } else if (this.progresoTramo >= 0.95) {
          this.progresoTramo = 0;
          this.nodoActualId = 'N0';
          this.consultarBackendPython();
        }
      }

      const t = Math.min(0.98, Math.max(0.0, this.progresoTramo));
      const posActual = this.curvaActiva3D.getPointAt(t);
      const vectorTangente = this.curvaActiva3D.getTangentAt(t).normalize();

      // Posiciona el avatar 3D en el Monitor de la Base
      const alturaSuelo = this.calcularElevacionMonteSharp(posActual.x, posActual.z);
      this.astronautaMesh.position.set(posActual.x, alturaSuelo, posActual.z);

      // Guarda coordenadas vectoriales para mostrarlas en vivo en la pantalla
      this.posVector3D = {
        x: Math.round(posActual.x * 10) / 10,
        y: Math.round((alturaSuelo - 4350) * 10) / 10,
        z: Math.round(posActual.z * 10) / 10
      };

      // CINEMÁTICA DEL CASCO EN PRIMERA PERSONA (AR HUD)
      // Simula el balanceo biomecánico de los pasos del astronauta (head-bobbing)
      const balanceoVertical = this.caminataActiva ? Math.abs(Math.sin(tiempoTotal * 5.5)) * 0.32 : 0;
      const balanceoLateral = this.caminataActiva ? Math.cos(tiempoTotal * 2.75) * 0.15 : 0;

      // Ojos del astronauta a 2.4 unidades sobre la superficie marciana
      this.cameraHud.position.set(
        posActual.x + balanceoLateral,
        alturaSuelo + 2.4 + balanceoVertical,
        posActual.z
      );

      // El casco mira hacia adelante siguiendo el vector tangente r'(t) de la curva del Monte Sharp
      const puntoMirada = new THREE.Vector3(
        posActual.x + vectorTangente.x * 18,
        this.calcularElevacionMonteSharp(posActual.x + vectorTangente.x * 12, posActual.z + vectorTangente.z * 12) + 1.8,
        posActual.z + vectorTangente.z * 18
      );
      this.cameraHud.lookAt(puntoMirada);

      this.angulosCasco = {
        rumboGrados: Math.round((Math.atan2(vectorTangente.x, vectorTangente.z) * 180) / Math.PI + 180),
        inclinacionGrados: Math.round(Math.asin(vectorTangente.y) * (180 / Math.PI) * 10) / 10
      };
    }

    if (this.rendererBase && this.cameraBase) {
      this.rendererBase.render(this.scene, this.cameraBase);
    }
    if (this.rendererHud && this.cameraHud) {
      this.rendererHud.render(this.scene, this.cameraHud);
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

  cambiarTormenta(valor: number) {
    this.intensidadTormenta = Number(valor);
    this.consultarBackendPython();
  }

  seleccionarNodoMapa(id: string) {
    this.nodoActualId = id;
    this.progresoTramo = 0;
    this.consultarBackendPython();
  }

  avanzarPasoAstronauta() {
    if (this.datosMision && this.datosMision.ruta_grafo_java && this.datosMision.ruta_grafo_java.length > 1) {
      this.nodoActualId = this.datosMision.ruta_grafo_java[1].id;
      this.progresoTramo = 0;
      this.consultarBackendPython();
    }
  }

  reiniciarMision() {
    this.nodoActualId = 'N0';
    this.progresoTramo = 0;
    this.intensidadTormenta = 12;
    this.consultarBackendPython();
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