# Validación de modalidades de conteo y advertencia sonora

Fecha: 11 de noviembre de 2026. Implementación sobre el proyecto existente, sin commits, pushes, publicación ni despliegue.

## Diagnóstico previo a la implementación

Se inspeccionaron las entradas `index.html` y `display.html`, módulos de `src`, pruebas, scripts de compilación y documentación antes de editar. El motor existente estaba en `src/core/timer-engine.js`, con transiciones en `timer-state.js`; calculaba tiempo restante desde `performance.now()` y una referencia por transición. El panel obtenía una exclusión Web Locks y publicaba instantáneas BroadcastChannel con generación IndexedDB, secuencia y fecha civil. `SnapshotReceiver` rechazaba mensajes antiguos y proyectaba el tiempo con su propio reloj monotónico, limitando la extrapolación sin comunicación a ocho segundos.

IndexedDB versión 1 almacenaba actividades, sesión y generación en `settings`; las sesiones se recuperaban detenidas. Las interfaces estaban en `control-view.js` y `display-view.js`. Vite compilaba dos páginas y generaba el precache desde los archivos reales. El Service Worker esperaba el cierre de todos los clientes para activar actualizaciones. La cobertura de partida se ejecutó antes de los cambios: **75 unitarias satisfactorias**. Las **16 funcionales originales** también se ejecutaron y pasaron después de integrar las primeras modificaciones.

## Funcionalidades implementadas

- Radios nativos exclusivos con `fieldset`, `legend` y etiquetas en **02 / EN VIVO**, antes de los dígitos. Predeterminado descendente. Texto que indica que la selección se aplica al próximo lanzamiento.
- Preferencia global en localStorage, separada por ruta. Se guarda en el evento de selección de forma síncrona para sobrevivir a una recarga inmediata. Errores de almacenamiento se informan sin impedir el uso de la selección actual.
- Sesiones con `mode: countup | countdown`. Cambiar la preferencia durante una ejecución conserva la modalidad de esa sesión. Se mantiene la protección existente contra relanzar accidentalmente la misma actividad en ejecución o pausa.
- Cronómetro desde cero hasta el límite; cuenta descendente hasta cero. Ambos conservan pausa, continuación, detención, reinicio a Listo y finalización roja. No hay valores negativos ni cronómetros superiores al límite. Se admiten minutos superiores a 59.
- Aviso único de dos tonos al cruzar los 60 segundos restantes, sin sonido al finalizar. Exactamente un minuto solicita el aviso inicial; menos de un minuto lo omite.
- Acción **Probar sonido**, indicadores de habilitación y estado de la advertencia. La ventana pública sólo agrega un control discreto para habilitar/probar audio.
- Recuperación de modalidad, título, tiempo y estado vigente en la pantalla pública. El panel se sigue recuperando detenido. Las sesiones anteriores sin modalidad usan `countdown`.
- Formato CSV, administración de actividades, arquitectura sin backend, dependencias, estrategia de actualización PWA y alcance por ruta conservados.

## Archivos modificados o nuevos

| Archivos | Cambio |
| --- | --- |
| `index.html` | Radios accesibles, texto de límite/duración, prueba e indicadores de audio en sección 02. |
| `display.html` | Habilitación/prueba discreta en la ventana pública. |
| `src/core/timer-engine.js` | Modalidad por sesión, proyección de tiempo visible, aviso por umbral, estados y recuperación compatible. |
| `src/audio/warning-audio.js` (nuevo) | Web Audio inyectable, entrega dirigida y reclamación persistente. |
| `src/storage/preferences.js` (nuevo) | Preferencia síncrona de modalidad con ámbito por ruta. |
| `src/storage/database.js` | Reclamación atómica del identificador de aviso en `settings`, sin cambio de versión ni eliminación de datos. |
| `src/sync/timer-channel.js` | Normalización de modalidades anteriores en el receptor. |
| `src/ui/control-view.js` | Preferencia, lanzamiento, presentación según modalidad, elección de destinatario, permiso, persistencia y resultado de audio. |
| `src/ui/display-view.js` | Proyección ascendente, estado de audio y recepción explícita del permiso. |
| `src/styles/control.css`, `src/styles/display.css` | Integración visual y adaptable de los nuevos controles. |
| `tests/unit/timer.test.js`, `sync.test.js`, `database.test.js` | Cobertura adicional manteniendo las pruebas anteriores. |
| `tests/unit/modes.test.js`, `audio.test.js`, `preferences.test.js` (nuevos) | Representación, API inyectable, restricciones, duplicados, reclamaciones y preferencias. |
| `tests/e2e/app.spec.js` | Se conservan 16 escenarios; radios de actividades se consultan dentro de su tabla. Se amplía la reapertura offline a modalidad y audio. |
| `tests/e2e/modes-audio.spec.js` (nuevo) | Ocho escenarios de interfaz, reloj, sincronización, audio y fallos. |
| `README.md`, `docs/VALIDACION.md`, este informe | Operación, diseño y evidencia actualizada. |

`dist/`, `test-results/` y `playwright-report/` son artefactos generados excluidos por `.gitignore`. No se modificaron CSV, dependencias, máquina de transiciones general, selección de monitores ni Service Worker.

## Motor, estados y precisión

Se conserva el tiempo restante como magnitud autoritativa. El transcurrido es `durationMs - remainingMs`. El motor continúa descontando el delta monotónico respecto a su referencia; no se suman segundos en intervalos. La modalidad sólo determina qué valor se muestra: segundos completos transcurridos en ascendente y redondeo hacia arriba existente en descendente. Esto evita que el cronómetro muestre el límite antes del final.

El aviso comienza `pending` para duraciones de al menos un minuto, o `skipped` para las menores. Durante `Ejecutando`, la primera observación de `0 < remainingMs <= 60000` convierte `pending` en `requested` y aumenta la versión. Así se reconoce el cruce sin exigir una actualización exactamente en el segundo 60. Una observación ya vencida finaliza y omite un aviso pendiente. La pausa no descuenta tiempo ni produce avisos.

Estados de aviso:

| Estado | Significado |
| --- | --- |
| `pending` | Umbral todavía pendiente. |
| `requested` | Umbral cruzado, solicitud gestionándose una sola vez. |
| `played` | Los dos tonos terminaron con el contexto de audio activo. No demuestra audibilidad física. |
| `unavailable` | Restricción, fallo, pausa durante solicitud, falta de confirmación o solicitud incierta recuperada. No se reintenta. |
| `skipped` | Duración inferior a un minuto o ejecución ya vencida sin aviso útil. |

Pausar, detener o finalizar una solicitud todavía incierta la cancela y evita reintentos al continuar. Un aviso ya emitido conserva su estado durante la pausa. Reiniciar restablece el tiempo inicial según la modalidad y deja Listo; el siguiente lanzamiento crea otra sesión con otro identificador y otro aviso. Restaurar una sesión no la reanuda; convierte una solicitud incierta en `unavailable`. Los datos antiguos sin `mode` usan descendente.

## Sincronización y coordinación de audio

El protocolo conserva la versión 1 y el rechazo existente por generación/secuencia. Las instantáneas agregan `mode`, `elapsedMs` y `warning: { id, status }`; mantienen identificador de sesión, título, duración, estado, restante, versión y referencia `sentAt`. La pantalla deriva ambas vistas de la misma proyección monotónica. No detecta umbrales ni solicita avisos por su cuenta.

La coordinación sigue este orden:

1. El panel detecta el cruce y registra en memoria que ya gestiona ese identificador.
2. Guarda `requested` en IndexedDB antes de conceder permiso. Si no puede persistir, informa un aviso no disponible y no programa audio.
3. Elige una sola ventana pública con disponibilidad de audio anunciada en los últimos ocho segundos; si no hay ninguna, elige el panel. Un contexto que sólo está abierto no se considera habilitado.
4. Envía `AUDIO_WARNING` únicamente al identificador de esa ventana, con generación, sesión, identificador de aviso, envío y vencimiento a 2,5 segundos. Si eligió el panel usa la misma entrega local.
5. El destinatario comprueba generación, sesión, estado Ejecutando, tiempo todavía positivo, solicitud vigente y permiso no vencido. Reclama el identificador en una transacción IndexedDB de lectura/escritura antes de programar los tonos. Revalida al terminar la transacción.
6. Cada reclamación usa `warning-claim:<id>` en el almacén existente. Sólo una puede prosperar incluso entre ventanas o después de recargar. Los identificadores reclamados se conservan; consumen un registro pequeño por aviso intentado.
7. La ventana responde `AUDIO_RESULT` al terminar la señal o al fallar; el panel valida destinatario, generación e identificador. Si no confirma en 4,5 segundos, marca `unavailable`.

No se transfiere un permiso fallido o incierto a otro destinatario, porque pudo haber reproducido antes de perder la confirmación. Esto evita duplicados a costa de omitir una advertencia ante fallos. No hay reenvíos por foco, reconexión, duplicados de instantáneas, apertura ni recarga de la pantalla. Las solicitudes persistidas tampoco se reenvían al recuperar el panel. Varias ventanas públicas habilitadas reciben un solo permiso dirigido.

## Señal y restricciones del navegador

Web Audio genera dos senoidales de 740 y 880 Hz, cada una de 220 ms, separadas por 140 ms: 580 ms en total, con una anticipación de programación de 20 ms. La ganancia máxima es 0,12 y tiene entrada/salida gradual para evitar chasquidos. No hay archivos de audio, red ni nuevas dependencias. Se desconectan los nodos al terminar, cancelar o fallar.

El contexto se crea/reanuda desde un clic de prueba. Sólo se considera habilitado si `state === running`; una promesa de `resume()` resuelta no basta. Se manejan rechazos, API ausente, contexto suspendido, fallos de programación y falta de confirmación de finalización. Las esperas tienen límite y no bloquean la interfaz. La prueba no reclama avisos ni cambia la sesión. La advertencia real se cancela al pausar, detener, cambiar sesión o cerrar la ventana.

La política de reproducción automática puede exigir interacción en cada ventana. Referencias primarias consultadas: [política de Chrome](https://developer.chrome.com/blog/autoplay) y [especificación Web Audio](https://www.w3.org/TR/webaudio/). Contexto activo y finalización de nodos prueban procesamiento de la señal, no altavoces, salida HDMI, volumen ni audibilidad. No se realizó prueba física en Windows ni se afirma que el sonido sea audible allí.

## Pruebas y resultados

Entorno observado: Linux, Node.js 22.23.4, npm 10.9.9, Google Chrome 157.0.8103.50 headless, Vite 7.2.2, Vitest 4.0.8 y Playwright 1.56.1. No se ejecutó Microsoft Edge.

| Comprobación | Satisfactorias | Fallidas |
| --- | ---: | ---: |
| Motor, estados y validaciones (`timer.test.js`) | 61 | 0 |
| Representación de modalidades (`modes.test.js`) | 3 | 0 |
| Audio y entrega (`audio.test.js`) | 26 | 0 |
| Preferencia (`preferences.test.js`) | 3 | 0 |
| CSV (cobertura original íntegra) | 19 | 0 |
| IndexedDB | 11 | 0 |
| Sincronización | 13 | 0 |
| **Unitarias** | **136** | **0** |
| Funcionales originales, ampliadas sin eliminar escenarios | 16 | 0 |
| Funcionales nuevas de modalidades/audio | 8 | 0 |
| **Funcionales** | **24** | **0** |
| **Total** | **160** | **0** |

La ejecución completa de Playwright pasó sobre producción con los 24 escenarios. La compilación final de producción generó ambas páginas y sus recursos en `dist/`, procesó 18 módulos e incluyó los nuevos módulos en el precache. Una comprobación adicional del `sw.js` generado verificó 12 recursos, ambas entradas HTML, el módulo de audio y la ausencia de llamadas a `skipWaiting()`. `git diff --check` no informó problemas de espacios.

Evidencia local reproducible: `playwright-report/index.html`, `test-results/.last-run.json` (`passed`, sin fallidas), `test-results/panel.png` y `test-results/pantalla.png`. Se inspeccionó visualmente la captura del panel con sus nuevos controles. Se conservan las comprobaciones automáticas de adaptación móvil/desktop y ajuste público hasta 4K. Las comprobaciones acústicas siguen pendientes de escucha física.

Comandos de validación:

```bash
npm test
npm run test:e2e
npm run build
git diff --check
```

Se usan relojes y AudioContext inyectables en Vitest. Los escenarios E2E de umbral inyectan desplazamientos de `performance.now()` y un AudioContext simulado observable, sin esperar minutos reales. También hay una prueba de interacción con Web Audio real de Chrome headless y otra sin red tras reiniciar el proceso. Estas últimas verifican contexto y finalización, no sonido físico.

Se mantuvieron todas las pruebas anteriores. Sus consultas genéricas de radios se limitaron a `#activities` para seguir contando las actividades después de agregar los dos controles nuevos. Los nuevos escenarios verifican persistencia inmediata, CSV intacto, inicio y avance ascendente, pausa extensa, cambio de preferencia durante sesión, siguiente lanzamiento, recuperación pública, límite rojo, aviso por cruce en ambas modalidades, fallback al panel, preferencia por una sola pantalla, mensajes duplicados, fallo sin confirmación, autoplay bloqueado y prueba sin cambios de sesión.

Incidencias encontradas y corregidas durante la validación:

- Una prueba nueva detectó pérdida de la modalidad al recargar inmediatamente con guardado asíncrono. Se sustituyó únicamente esa preferencia por localStorage síncrono y se mantuvo la prueba sin esperas añadidas.
- La primera ejecución de Playwright en el sandbox no pudo iniciar servidores locales. Se volvió a ejecutar con permiso para los servidores de prueba y Chrome. No se trata de un fallo de la aplicación.

## Estado offline y actualizaciones

Se conserva la estrategia de precache generado desde los archivos de producción: las nuevas funciones se incluyen automáticamente en los módulos con hash. Las pruebas verifican el precache y el Service Worker, y reinician Chrome con perfil persistente y red deshabilitada. Después de reabrir se comprueban actividades, modalidad ascendente, sincronización, CSV, prueba Web Audio y aviso de un minuto generado localmente. También se mantiene la prueba de ambas ventanas bajo `/temporizador/` sin red.

No se usa `skipWaiting`, no se fuerza recarga y las actualizaciones siguen esperando al cierre de las ventanas. No se simuló la publicación de una segunda versión ni una actualización sobre una instalación real en Windows. El navegador puede eliminar almacenamiento y cachés; antes del evento hay que verificar preparación offline y exportar un respaldo.

## Limitaciones y pruebas manuales pendientes

- Chrome headless en Linux permite verificar API, temporización lógica, permisos simulados y procesamiento; no comprueba la salida física. No se ejecutó Edge ni se probó una instalación PWA en Windows, HDMI o DPI físicos.
- Comprobar ambos tonos y volumen moderado en el equipo real, incluida la selección de salida entre altavoces/HDMI y el mezclador de Windows. Probar el panel solo, una ventana pública habilitada y varias ventanas abiertas.
- Probar `10:00` en ambas modalidades (aviso en `09:00` ascendente y `01:00` descendente), `01:00` (aviso inicial único), `00:30` (sin aviso) y más de 59 minutos. Confirmar final rojo y silencioso.
- Probar pausa antes/después del umbral, continuación, detención, reinicio y nuevo lanzamiento. Si una pausa interrumpe un aviso solicitado, éste no se repite.
- Cerrar y reabrir la ventana pública antes y después del aviso; volver a habilitar su audio y comprobar que no se repiten avisos pasados. Recargar el panel y confirmar la recuperación detenida con modalidad y estado del aviso.
- Instalar en Edge y Chrome de Windows, preparar offline, cerrar todas las ventanas, desconectar red y abrir desde el acceso instalado. Repetir la prueba de audio y CSV.
- Probar restricciones de autoplay, mute del sitio y permisos del perfil real. El mute o el volumen cero pueden producir una señal procesada pero inaudible; la escucha humana sigue siendo necesaria.
- La suspensión del sistema, hibernación, congelación o limitación de pestañas puede retrasar tanto el aviso como los mensajes. No se promete precisión acústica absoluta. Un permiso vencido se omite; no se reintenta una solicitud incierta. Desactivar suspensión y mantener alimentación para el evento.
- La última sesión conserva el límite previo de persistencia: un cierre abrupto puede perder aproximadamente el último latido (dos segundos), y siempre se recupera detenida. Las reclamaciones de audio se conservan sin purgar automáticamente datos anteriores.
