export function parseDuration(value) {
  const match = /^(\d+):([0-5]\d)$/.exec(String(value).trim());
  if (!match) throw new Error('Usa el formato MM:SS; los segundos deben estar entre 00 y 59.');
  const ms = (Number(match[1]) * 60 + Number(match[2])) * 1000;
  if (!Number.isSafeInteger(ms) || ms <= 0) throw new Error('La duración debe ser mayor que cero y estar dentro del rango admitido.');
  return ms;
}

export function formatDuration(ms) {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function validateActivity(activity) {
  if (typeof activity?.title !== 'string' || !activity.title.trim()) throw new Error('Escribe un título para la actividad.');
  if (!Number.isSafeInteger(activity.durationMs) || activity.durationMs <= 0 || activity.durationMs % 1000 !== 0) {
    throw new Error('La duración debe ser un número positivo de segundos completos.');
  }
  return { id: activity.id || crypto.randomUUID(), title: activity.title.trim(), durationMs: activity.durationMs };
}

export const defaultActivities = () => [
  ['Presentación', '10:00'], ['Preguntas', '05:00'], ['Respuestas', '05:00'], ['Réplica', '03:00'],
].map(([title, duration]) => validateActivity({ title, durationMs: parseDuration(duration) }));
