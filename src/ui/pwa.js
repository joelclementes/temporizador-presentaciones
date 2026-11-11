export async function setupPWA({ status, installButton, verifyButton }) {
  let installPrompt;
  window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); installPrompt = event; if (installButton) installButton.hidden = false; });
  installButton?.addEventListener('click', async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    installButton.hidden = true;
  });
  window.addEventListener('appinstalled', () => { if (installButton) installButton.hidden = true; });
  if (!('serviceWorker' in navigator)) { if (status) status.textContent = 'Este navegador no permite preparar el modo offline.'; return; }
  if (import.meta.env.DEV) { if (status) status.textContent = 'Desarrollo · prueba offline con npm run build y npm run preview.'; return; }
  try {
    const registration = await navigator.serviceWorker.register(new URL('sw.js', new URL('.', location.href)), { scope: './', updateViaCache: 'none' });
    const verify = async () => {
      const ready = await navigator.serviceWorker.ready;
      const worker = navigator.serviceWorker.controller || ready.active;
      const result = await new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        const timeout = setTimeout(() => reject(new Error('No se pudo verificar el modo offline. Vuelve a intentarlo.')), 6000);
        channel.port1.onmessage = (event) => { clearTimeout(timeout); channel.port1.close(); resolve(event.data); };
        worker.postMessage({ type: 'VERIFY_OFFLINE' }, [channel.port2]);
      });
      if (status) {
        status.textContent = result.ready ? 'Preparada para usar sin conexión' : 'Preparación offline incompleta. Abre la aplicación con conexión.';
        status.dataset.ready = String(result.ready);
      }
      if (registration.waiting && status) status.textContent += ' · Actualización pendiente: cierra ambas ventanas al terminar.';
    };
    const safeVerify = () => verify().catch((error) => { if (status) status.textContent = error.message; });
    verifyButton?.addEventListener('click', safeVerify);
    registration.addEventListener('updatefound', () => {
      registration.installing?.addEventListener('statechange', safeVerify);
    });
    await safeVerify();
  } catch {
    if (status) status.textContent = 'No se pudo preparar el modo offline. Usa HTTPS o localhost y permite el almacenamiento.';
  }
}
