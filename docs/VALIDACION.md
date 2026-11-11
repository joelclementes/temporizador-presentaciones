# Informe técnico de entrega y validación

Fecha: 11 de noviembre de 2026. Trabajo realizado directamente en el directorio del proyecto. No se hicieron commits, pushes, publicaciones ni modificaciones remotas.

## Resultado entregado

Aplicación estática con panel de control y ventana pública independiente. Incluye administración completa de actividades, guardado automático IndexedDB, CSV UTF-8, temporizador monotónico con máquina de estados, sincronización local versionada, recuperación de pantalla, advertencia de desconexión, selección opcional de monitor, pantalla completa y recursos PWA precargados para operación offline.

La arquitectura y el procedimiento completo de instalación, despliegue y operación están en [README.md](../README.md). El código se distribuye entre `src/core`, `src/storage`, `src/sync`, `src/screens`, `src/ui` y `src/styles`. Las entradas son `index.html` y `display.html`; `public/` contiene manifiesto e iconos y `scripts/service-worker.js` es la plantilla de precache generada durante la compilación. No hay dependencias de terceros en ejecución.

## Entorno y herramientas

| Componente | Versión o entorno observado |
| --- | --- |
| Sistema de pruebas | Linux; sin comprobación física de HDMI |
| Node.js | 22.23.4 |
| npm | 10.9.9 |
| Google Chrome | 157.0.8103.50 |
| Vite | 7.2.2 |
| Vitest | 4.0.8 |
| Playwright | 1.56.1 |
| fake-indexeddb | 6.2.4 |

La versión se comprobó mediante `google-chrome --version`. Las pruebas usaron el canal `chrome` instalado en el equipo, en modo headless. No se ejecutó Microsoft Edge.

## Comprobaciones ejecutadas

| Comprobación | Satisfactorias | Fallidas |
| --- | ---: | ---: |
| Motor, transiciones y validaciones de actividades | 35 | 0 |
| CSV | 19 | 0 |
| IndexedDB | 10 | 0 |
| Protocolo de sincronización | 11 | 0 |
| Funcionales de navegador sobre producción | 16 | 0 |
| **Total** | **91** | **0** |

Comandos ejecutados con éxito en la versión entregada:

```bash
npm run test
npm run test:e2e
```

`test:e2e` ejecutó también `npm run build`. Vite procesó 16 módulos y generó correctamente `dist/` con ambas entradas HTML, módulos y CSS con hash, manifiesto, iconos y `sw.js`. No hubo errores de compilación. Las pruebas funcionales se ejecutaron sobre `vite preview`, no sobre el servidor de desarrollo.

### Cobertura unitaria

- Creación, inicio, pausa exacta, pausa prolongada, continuación, detención, reinicio y finalización.
- Estados válidos e inválidos, tiempos superiores a una hora, actualizaciones demoradas y ausencia de valores negativos.
- Cambio de actividad con confirmación; ausencia de reinicio accidental de la misma sesión; copia original independiente de las ediciones.
- Creación, edición, eliminación, orden, reapertura y recuperación de registros; configuración vacía persistente; validación y errores de acceso a IndexedDB.
- CSV sin encabezados: UTF-8, BOM, CRLF, LF, acentos, comas, comillas y campos multilínea; rechazo de archivos vacíos, filas inválidas y CSV mal formado; conservación del orden y de los datos anteriores.
- Compensación de tránsito, proyección local, pausas sincronizadas, generaciones y secuencias antiguas rechazadas, duplicados descartados y recuperación tras desconexión.

### Los 16 escenarios funcionales satisfactorios

1. Agregar, editar, eliminar, reordenar, validar y recuperar actividades después de recargar.
2. Abrir pantalla, sincronizar pausa/continuación/detención/reinicio y reutilizar ventana.
3. Cerrar, reabrir y recargar la visualización recuperando el tiempo vigente.
4. Confirmar o cancelar sustituciones y mantener una sesión al editar o eliminar su actividad.
5. Finalización en `00:00`, color rojo en ambas ventanas y acciones deshabilitadas.
6. Importar/exportar CSV real, conservar comas, acentos y comillas, cancelar reemplazo y rechazar importaciones inválidas sin pérdida.
7. Simular cuota agotada al escribir y comprobar que el error no sustituye los datos anteriores.
8. Impedir un segundo controlador y recuperar la sesión detenida al recargar el panel.
9. Advertir en la pantalla cuando se cierra el controlador.
10. Informar el bloqueo de popups mientras el reloj sigue funcionando.
11. Activar/salir de pantalla completa y ocultar la ventana sin detener la cuenta.
12. Panel sin desbordamiento horizontal a 1366×768, 1920×1080, 3840×2160, 768×1024 y 375×812.
13. Títulos largos y tiempo `180:59` dentro de sus contenedores a 480×300, 1366×768, 1920×1080, 3840×2160 y 320×240.
14. Obtener manifiesto, decodificar los PNG 192/512 y maskable, comprobar control por Service Worker y verificar integridad del precache.
15. Crear un perfil persistente de Chrome, preparar recursos y datos, cerrar el navegador, reiniciarlo sin red y abrir ambas interfaces. Se verificaron persistencia, lanzamiento, pausa sincronizada, recarga pública y CSV offline.
16. Servir la misma compilación bajo `/temporizador/`, abrir ambas ventanas, desconectar la red y recargar panel y pantalla con datos y estado recuperados.

Se inspeccionaron visualmente las capturas del panel y de la pantalla pública. Se compactó el panel para la altura habitual de laptop. Los títulos extensos permanecen dentro de su zona y los dígitos conservan el área principal.

### Evidencia local reproducible

Después de ejecutar las pruebas:

- `playwright-report/index.html`: informe funcional navegable.
- `test-results/.last-run.json`: estado de la última ejecución (`passed`, sin pruebas fallidas).
- `test-results/panel.png`: captura del panel a 1366 píxeles de ancho.
- `test-results/pantalla.png`: captura de pantalla pública con título largo y más de una hora de duración.
- Vitest informa 4 archivos y 75 pruebas satisfactorias en consola.

Los resultados generados están excluidos mediante `.gitignore`. Se pueden regenerar con los comandos indicados.

## Estado PWA y offline

**Implementado y comprobado automáticamente:** manifiesto relativo con modo standalone, iconos PNG válidos, Service Worker activo, precache completo de las dos páginas y sus recursos, indicador de verificación y reapertura offline tras reiniciar un navegador con el mismo perfil. También se comprobó la subcarpeta.

**Pendiente de verificación manual:** instalar desde el menú real de Edge/Chrome en Windows, abrir desde el acceso instalado, comprobar las políticas de ventanas de esa instalación y usar monitores HDMI reales. Las pruebas headless no equivalen a estas comprobaciones.

Las actualizaciones no usan `skipWaiting` ni fuerzan recargas: esperan al cierre de clientes. Este comportamiento está implementado mediante el ciclo de vida estándar del Service Worker; no se simuló una publicación de una segunda versión sobre una instalación Windows en uso.

## Ejecución e instalación

```bash
npm install
npm run build
npm run preview
```

Abre `http://127.0.0.1:4173`, espera el indicador de preparación y usa **Mostrar ventana**. Para desarrollo, usa `npm run dev`.

Para instalar en Windows sin mantener Node o un servidor local en operación, aloja `dist/` en HTTPS, abre el panel en Edge o Chrome, espera la preparación offline y usa **Instalar aplicación** o el control de instalación del navegador. No se realizó ese alojamiento ni ninguna publicación remota como parte de esta entrega.

## Verificación manual con laptop y HDMI

1. Instalar en el perfil de navegador que se usará durante el evento y verificar **Preparada para usar sin conexión**.
2. Conectar HDMI, pulsar Windows + P → Extender e identificar las pantallas en Configuración de Windows.
3. Abrir la ventana pública, moverla al monitor externo y activar pantalla completa desde ella.
4. Probar una actividad corta y otra de más de 59 minutos. Comprobar título, tamaño y legibilidad en la resolución y escala DPI reales.
5. Ejecutar pausa, continuación, detención y reinicio. Cerrar/reabrir la pantalla durante la cuenta y comprobar que no se reinicia.
6. Esperar el final de una actividad corta y comprobar cero y rojo sin sonido.
7. Exportar CSV, cerrar todas las ventanas, desconectar Internet y volver a abrir desde el acceso instalado. Comprobar ambas interfaces y el CSV.
8. Comprobar permisos opcionales de selección de pantalla; si el navegador los limita, usar traslado manual.
9. Desactivar suspensión para el evento y mantener alimentación. Confirmar que minimizar y recuperar el panel actualiza inmediatamente la pantalla.

## Límites y riesgos pendientes

- Las capacidades de instalación y ventanas dependen de las políticas del navegador; la pantalla puede ser una ventana convencional aun con el panel instalado.
- No se garantiza precisión ante suspensión de Windows, hibernación o congelación del proceso. El reloj autoritativo usa tiempo monotónico; la proyección pública puede corregirse al siguiente mensaje si cambia la hora civil.
- Un controlador muy restringido en segundo plano puede retrasar confirmaciones. La pantalla muestra una advertencia tras ocho segundos sin verificarlas.
- La última referencia persistida puede tener aproximadamente dos segundos de antigüedad tras un cierre abrupto y siempre se restaura detenida.
- El navegador puede eliminar datos y cachés. IndexedDB es almacenamiento local, no un respaldo. Es necesario conservar un CSV externo y repetir la verificación offline antes de cada evento.
- Las confirmaciones nativas de Windows, la selección física de monitores, el escalado DPI de Windows y la instalación en Edge siguen pendientes de comprobación con el equipo final.
