// Preferencia pequeña y global. La escritura síncrona sobrevive a una recarga inmediata.
// La sesión y las actividades siguen en IndexedDB; las rutas de instalación quedan separadas.
const key = (scope) => `temporizador:${scope}:count-mode`;
export const loadMode = (storage, scope) => storage.getItem(key(scope)) === 'countup' ? 'countup' : 'countdown';
export const saveMode = (storage, scope, mode) => storage.setItem(key(scope), mode === 'countup' ? 'countup' : 'countdown');
