// Búsqueda binaria sobre medidas reales: considera saltos, alto, ancho y métricas de la fuente instalada.
export function fitText(element, container, { min = 1, max = 1200, singleLine = false } = {}) {
  const width = Math.max(1, container.clientWidth - 4);
  const height = Math.max(1, container.clientHeight - 4);
  let low = min, high = Math.min(max, height);
  element.style.width = singleLine ? 'max-content' : `${width}px`;
  for (let step = 0; step < 16; step += 1) {
    const size = (low + high) / 2;
    element.style.fontSize = `${size}px`;
    const bounds = element.getBoundingClientRect();
    if (bounds.width <= width && bounds.height <= height && element.scrollWidth <= width + 1) low = size;
    else high = size;
  }
  element.style.fontSize = `${Math.floor(low * 100) / 100}px`;
}
