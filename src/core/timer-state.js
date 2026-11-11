export const STATES = Object.freeze({ READY: 'Listo', RUNNING: 'Ejecutando', PAUSED: 'Pausado', STOPPED: 'Detenido', FINISHED: 'Finalizado' });
export const TRANSITIONS = Object.freeze({
  Listo: { launch: 'Ejecutando', reset: 'Listo' },
  Ejecutando: { pause: 'Pausado', stop: 'Detenido', reset: 'Listo', finish: 'Finalizado' },
  Pausado: { resume: 'Ejecutando', stop: 'Detenido', reset: 'Listo', launch: 'Ejecutando' },
  Detenido: { launch: 'Ejecutando', reset: 'Listo' },
  Finalizado: { launch: 'Ejecutando', reset: 'Listo' },
});
