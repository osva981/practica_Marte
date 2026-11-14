import { Injectable } from '@angular/core';
import { RespuestaPython, RespuestaJava } from './backend-types';

@Injectable({ providedIn: 'root' })
export class BackendService {
  private readonly PYTHON_BASE = 'http://localhost:8080';
  private readonly JAVA_BASE = 'http://localhost:8081';
  private readonly MAX_RETRIES = 3;
  private readonly BASE_DELAY = 500;
  private readonly TIMEOUT = 5000;

  async consultarPython(intensidadTormenta: number, nodoActual: string): Promise<RespuestaPython> {
    const url = `${this.PYTHON_BASE}/api/telemetria-marte?intensidad_tormenta=${intensidadTormenta}&nodo_actual=${nodoActual}`;
    return this.fetchConRetry<RespuestaPython>(url);
  }

  async consultarJava(rad: number, nodo: string): Promise<RespuestaJava> {
    const url = `${this.JAVA_BASE}/calcular-ruta?rad=${rad}&nodo=${nodo}`;
    return this.fetchConRetry<RespuestaJava>(url);
  }

  private async fetchConRetry<T>(url: string, intento = 0): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (err) {
      clearTimeout(timeoutId);
      if (intento < this.MAX_RETRIES) {
        const delay = this.BASE_DELAY * Math.pow(2, intento);
        await new Promise((r) => setTimeout(r, delay));
        return this.fetchConRetry<T>(url, intento + 1);
      }
      throw err;
    }
  }
}