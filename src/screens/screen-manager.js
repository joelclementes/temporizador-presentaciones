import { scopeKey } from '../sync/timer-channel.js';

export class ScreenManager {
  constructor(notify) {
    this.notify = notify;
    this.window = null;
    this.target = null;
    this.name = `pantalla-temporizador-${scopeKey()}`;
  }
  show() {
    if (this.window && !this.window.closed) { this.window.focus(); return true; }
    const screen = this.target;
    const features = screen ? `popup=yes,left=${screen.availLeft},top=${screen.availTop},width=${screen.availWidth},height=${screen.availHeight}` : 'popup=yes,width=1100,height=700';
    this.window = window.open(new URL('display.html', location.href), this.name, features);
    if (!this.window) { this.notify('El navegador bloqueó la ventana. Permite las ventanas emergentes y pulsa Mostrar ventana.'); return false; }
    this.window.focus();
    return true;
  }
  hide() { if (this.window && !this.window.closed) this.window.close(); this.window = null; }
  async getScreens() {
    if (!('getScreenDetails' in window)) throw new Error('Mueve la ventana manualmente con Windows + Mayús + Flecha izquierda o derecha.');
    const details = await window.getScreenDetails();
    return Array.from(details.screens);
  }
  select(screen) {
    this.target = screen;
    if (this.window && !this.window.closed) {
      this.window.moveTo(screen.availLeft, screen.availTop);
      this.window.resizeTo(screen.availWidth, screen.availHeight);
    }
  }
}
