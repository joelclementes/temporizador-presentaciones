import { defaultActivities, validateActivity } from '../core/activity.js';

export async function openDatabase({ factory = indexedDB, name = 'temporizador-presentaciones-v1' } = {}) {
  const db = await new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('settings');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('No se pudo abrir el almacenamiento local. Revisa los permisos del navegador.'));
    request.onblocked = () => reject(new Error('Cierra las otras ventanas de la aplicación para abrir el almacenamiento.'));
  });
  db.onversionchange = () => db.close();

  function transaction(mode, operation) {
    return new Promise((resolve, reject) => {
      let tx;
      let result;
      try {
        tx = db.transaction('settings', mode);
        const setResult = (value) => { result = value; };
        operation(tx.objectStore('settings'), setResult);
        tx.oncomplete = () => resolve(result);
        tx.onerror = tx.onabort = () => reject(new Error('No se pudieron guardar o recuperar los datos. Exporta un respaldo y revisa el espacio y los permisos del navegador.'));
      } catch (error) {
        tx?.abort();
        reject(new Error('No se pudo acceder al almacenamiento local. Revisa el espacio disponible y los permisos del navegador.', { cause: error }));
      }
    });
  }
  const read = (key) => transaction('readonly', (store, done) => {
    const request = store.get(key);
    request.onsuccess = () => done(request.result);
  });
  const write = (key, value) => transaction('readwrite', (store) => store.put(value, key));
  return {
    async loadActivities() {
      const saved = await read('activities');
      if (saved !== undefined) return saved.map(validateActivity);
      const initial = defaultActivities();
      await write('activities', initial);
      return initial;
    },
    async saveActivities(activities) {
      const clean = activities.map(validateActivity);
      if (new Set(clean.map((item) => item.id)).size !== clean.length) throw new Error('Las actividades tienen identificadores repetidos.');
      await write('activities', clean);
      return clean;
    },
    loadSession: () => read('session'),
    saveSession: (session) => write('session', session),
    // La reclamación se confirma ANTES de programar audio. Incluso otra ventana o una recarga no pueden repetirlo.
    claimWarning: (id) => transaction('readwrite', (store, done) => {
      const key = `warning-claim:${id}`;
      const request = store.get(key);
      request.onsuccess = () => { if (request.result) done(false); else { store.put(true, key); done(true); } };
    }),
    nextEpoch: () => transaction('readwrite', (store, done) => {
      const request = store.get('epoch');
      request.onsuccess = () => { const epoch = (request.result || 0) + 1; store.put(epoch, 'epoch'); done(epoch); };
    }),
    close: () => db.close(),
  };
}
