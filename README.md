# Temporizador de Presentaciones

PWA en español para controlar presentaciones, debates y preguntas desde una laptop y mostrar el tiempo al público en una ventana independiente. Funciona en un solo monitor o con Windows en escritorio extendido y una pantalla HDMI. Después de preparar sus recursos, opera sin Internet y sin un servidor de aplicaciones.

## Requisitos

- Windows 10 u 11 y una versión estable reciente de Microsoft Edge o Google Chrome para operación e instalación.
- Para desarrollar o compilar: Node.js 22.12 o posterior y npm. Las pruebas se han ejecutado con Node 22.
- Conexión inicial para descargar las dependencias, o para abrir e instalar la aplicación desde un alojamiento HTTPS.
- HTTPS o `http://localhost` / `http://127.0.0.1` para Service Worker, Web Locks e instalación. Abrir el HTML por `file://` no funciona como distribución.
- HDMI es opcional; la aplicación no exige detectar dos pantallas.

## Inicio rápido

Desde este directorio:

```bash
npm install
npm run dev
```

Abre la dirección que muestre Vite (normalmente `http://127.0.0.1:5173`). El modo de desarrollo no registra el Service Worker. Para comprobar la aplicación completa:

```bash
npm run build
npm run preview
```

Abre la dirección de preview (normalmente `http://127.0.0.1:4173`). `dist/` contiene la distribución estática completa, incluidas ambas páginas, manifiesto, iconos y Service Worker. No se necesita Node.js en la laptop operadora si la PWA se instala desde un alojamiento HTTPS.

## Tecnologías y organización

JavaScript con módulos ES, HTML y CSS, sin framework y sin dependencias de ejecución de terceros. Vite compila las dos páginas. IndexedDB guarda datos; BroadcastChannel transmite instantáneas; Web Locks impide que dos paneles controlen simultáneamente la misma instalación. Se utilizan fuentes del sistema, sin CDN ni descargas de fuentes.

```text
index.html                  Panel del operador
display.html                Pantalla pública
public/
  manifest.webmanifest      Identidad, alcance e instalación
  icons/                    Iconos PNG 192/512, maskable y SVG
src/
  core/                     Validación, formato y máquina de estados del reloj
  storage/                  IndexedDB y analizador CSV estricto
  sync/                     Canal, versiones y proyección de instantáneas
  screens/                  Apertura y selección opcional de monitor
  ui/                       Interfaces, ajuste de texto y registro PWA
  styles/                   Estilos de las dos ventanas
scripts/
  service-worker.js         Plantilla del Service Worker generado
  generate-icons.mjs        Generación reproducible de iconos geométricos
  serve-subpath.mjs         Servidor local para comprobar una subcarpeta
tests/
  unit/                     Vitest y fake-indexeddb
  e2e/                      Playwright sobre la compilación de producción
docs/
  VALIDACION.md             Evidencia y límites de las comprobaciones
vite.config.js              Entradas HTML y generación de precache
playwright.config.js        Servidor y navegador de las pruebas
```

Las herramientas de desarrollo principales son Vite, Vitest, Playwright y fake-indexeddb. Las versiones están fijadas en `package.json` y `package-lock.json`; `npm ci` permite reproducir la instalación. No hay analítica, autenticación, cuentas, solicitudes de datos a terceros ni backend. El origen HTTPS sólo distribuye archivos estáticos y sus actualizaciones.

### Reloj y estados

El panel es la única autoridad. El motor recibe un reloj inyectable (`performance.now()` en producción) y calcula el tiempo restante a partir de una referencia monotónica. Los intervalos y la animación actualizan la vista, sin restar segundos al estado.

| Estado | Acciones válidas |
| --- | --- |
| Listo | Lanzar, Reiniciar |
| Ejecutando | Pausar, Detener, Reiniciar, Finalizar al llegar a cero |
| Pausado | Continuar, Detener, Reiniciar; Lanzar otra actividad con confirmación |
| Detenido | Lanzar desde la duración original, Reiniciar |
| Finalizado | Lanzar desde la duración original, Reiniciar |

Lanzar la misma actividad en ejecución o pausa reutiliza su sesión y no la reinicia. Para reanudar una pausa se pulsa **Continuar**. Para sustituir otra sesión en ejecución o pausa se pide confirmación. Reiniciar devuelve el tiempo original y deja el estado Listo, sin avanzar. Finalizar muestra cero y color rojo; no hay sonido.

Cada sesión mantiene una copia del título y la duración originales. Editar o eliminar la actividad no altera esa copia. Volver a lanzar esa misma sesión después de detenerla, reiniciarla o finalizarla conserva su duración original. Para cargar una configuración editada como nueva sesión, lanza otra actividad y después la editada.

### Sincronización y recuperación

Cada autoridad tiene una generación creciente asignada en una transacción IndexedDB. Cada instantánea lleva generación, secuencia creciente, identificador de sesión, versión del motor, estado, duración, tiempo restante y fecha de envío. La pantalla rechaza generaciones y secuencias antiguas. No ejecuta otro motor: proyecta la última instantánea con su propio reloj monotónico; nunca utiliza el `performance.now()` crudo de otra ventana.

Una fecha de envío compatible (`Date.now()`) compensa el tránsito, acotado a ocho segundos. Instantáneas al cambiar el estado, latidos cada dos segundos y solicitudes al abrir, recargar, recuperar foco o visibilidad corrigen la vista. Un cambio del reloj del sistema puede afectar brevemente la compensación del tránsito, pero no la cuenta autoritativa del panel.

Tras ocho segundos sin confirmación, la pantalla muestra **Sin comunicación con el panel · estado sin verificar** y limita la extrapolación al último período de ocho segundos. Un cierre comunicado por el panel muestra la advertencia inmediatamente. El título y tiempo permanecen visibles; la recuperación de comunicación sustituye la referencia por el estado vigente.

La configuración y la última sesión se guardan en IndexedDB. La sesión se guarda en cada acción y aproximadamente cada dos segundos, así que un cierre abrupto puede dejar una referencia algo anterior. Recargar o volver a abrir el panel recupera esa referencia en **Detenido**. Nunca se reanuda por sí sola. La pantalla pública puede recuperar la referencia guardada, pero no la presenta como confirmada hasta recibir al controlador.

Un segundo panel queda deshabilitado y explica cómo recuperar el control. Cierra el primer panel y recarga el segundo. La ruta de instalación separa canales, bloqueos, datos y cachés cuando hay varias copias bajo un origen.

## Operación diaria

### Actividades

La primera apertura crea Presentación (10:00), Preguntas (05:00), Respuestas (05:00) y Réplica (03:00). Selecciona con el círculo junto al título. **Agregar** y el lápiz de **Editar** abren un formulario. Las flechas suben o bajan un registro y la cruz permite eliminarlo con confirmación.

Se requiere un título no vacío y duración positiva `MM:SS`. Los segundos deben estar entre 00 y 59; los minutos pueden superar 59, por ejemplo `120:30`. Se admiten acentos, comas, comillas y títulos largos. No se impone una duración máxima artificial: se exige que los milisegundos sean un entero seguro de JavaScript.

Cada cambio se guarda automáticamente mediante una transacción. Si el navegador no permite guardar, se conserva la lista anterior y se muestra un error. Una lista eliminada por completo permanece vacía: no se vuelven a insertar los ejemplos.

### CSV y respaldo

**Exportar CSV** descarga un archivo UTF-8 con BOM, sin encabezados y con finales de línea CRLF, respetando el orden. Los títulos con comas, comillas o saltos se escapan según CSV; las comillas interiores se duplican.

```csv
Presentación,10:00
"Preguntas, discusión",05:00
"Réplica ""final""",03:00
```

**Importar CSV** exige UTF-8 válido y exactamente dos campos por registro. Acepta BOM, LF o CRLF y campos entre comillas. Valida todo antes de pedir confirmación para reemplazar la configuración. Un archivo vacío, una fila inválida, comillas sin cerrar, segundos mayores a 59 o una duración cero hacen que se rechace el archivo completo. No se cambia parcialmente la lista. Importar no modifica una sesión activa.

Conserva respaldos fuera del navegador. IndexedDB no sustituye a un respaldo: borrar los datos del sitio, usar otro perfil o cambiar de equipo puede eliminar o separar la configuración. Exporta antes de hacerlo. Mantén el mismo origen y perfil durante el evento.

### Temporizador y ventana pública

1. Selecciona una actividad y pulsa **Lanzar**. El temporizador comienza y se abre o recupera una ventana con nombre estable.
2. **Pausar / Continuar**, **Detener** y **Reiniciar** actúan sobre la sesión activa, aunque selecciones otra fila.
3. **Mostrar ventana** permite recuperarla sin tocar el reloj. Si está bloqueada, permite ventanas emergentes para este sitio y vuelve a pulsarlo.
4. **Ocultar ventana** cierra la pantalla pública y mantiene la cuenta en el panel. Se puede volver a abrir.
5. Mueve, minimiza, restaura y maximiza con los controles de Windows. El botón discreto **⛶** de la pantalla solicita pantalla completa y permite salir. También puedes usar Esc.
6. La selección de pantalla aparece sólo si `getScreenDetails()` está disponible. Pulsa **Seleccionar pantalla**, concede el permiso si quieres y elige el monitor. El navegador puede limitar mover/redimensionar ventanas: el traslado manual sigue disponible.

La pantalla usa fondo oscuro, título centrado y números blancos tabulares; se vuelven rojos al finalizar. `ResizeObserver` y una búsqueda binaria sobre medidas reales ajustan título y tiempo al espacio. Los minutos superiores a 59 permanecen en formato de minutos (`120:00`), sin cambiar a horas.

## Instalación como PWA en Windows

1. Publica o abre la compilación desde un origen HTTPS de confianza o localhost. Utiliza siempre la misma URL y perfil.
2. En Edge o Chrome abre el panel y espera **Preparada para usar sin conexión**.
3. Pulsa **Instalar aplicación** si aparece, o utiliza el icono de instalación de la barra del navegador. En Edge también está disponible en el menú de aplicaciones; su ubicación depende de la versión.
4. Abre la aplicación instalada y pulsa **Mostrar ventana** para comprobar la pantalla independiente.
5. Permite ventanas emergentes para el sitio si el navegador lo solicita.

El manifiesto utiliza `display: standalone`, alcance relativo y ambas ventanas bajo el mismo origen. La ventana pública puede abrirse como ventana normal del navegador aunque el panel esté instalado: es una limitación de la política del navegador. No requiere una segunda instalación. No se ha verificado físicamente la instalación en Windows desde este entorno Linux; sigue el procedimiento y confirma su comportamiento antes del evento.

## Preparación offline y antes de un evento

1. Abre la aplicación con conexión y pulsa **Verificar** en el pie. Espera **Preparada para usar sin conexión**. La comprobación consulta al Service Worker y verifica todos los recursos reales del precache, incluida `display.html`.
2. Configura o importa las actividades; exporta un respaldo CSV.
3. Conecta HDMI. En Windows pulsa **Windows + P → Extender**. En Configuración → Sistema → Pantalla, identifica y ordena las pantallas; ajusta resolución y escala.
4. Pulsa **Mostrar ventana**, trasládala al monitor externo (arrastrándola o con **Windows + Mayús + Flecha izquierda/derecha**) y pulsa **⛶** desde esa ventana.
5. Lanza una actividad corta. Comprueba título, pausa, continuación, detención, reinicio y finalización roja en ambas pantallas.
6. Cierra y vuelve a abrir únicamente la pantalla pública durante una cuenta para comprobar que conserva el tiempo vigente.
7. Cierra **ambas ventanas** y cualquier pestaña del mismo sitio. Desconecta la red y abre de nuevo la PWA instalada. Verifica que se conserva la configuración y abre la pantalla pública. Prueba exportación e importación CSV sin red. Este cierre y reapertura es parte de la verificación offline.
8. Si hubo una sesión previa, debe aparecer detenida. Lanza explícitamente la actividad que corresponda.
9. Antes del evento, conecta alimentación, desactiva temporalmente la suspensión y verifica que las pantallas no se apagarán durante la actividad.

Los recursos se precargan durante la instalación del Service Worker: panel, pantalla, módulos, CSS, manifiesto e iconos. Las fuentes provienen del sistema. No se necesita que la página pública se haya visitado para que quede en caché. Sin embargo, comprobarla manualmente permite confirmar los permisos de ventanas.

Una actualización descarga una caché nueva y espera hasta que todas las ventanas de la versión anterior se cierren. La aplicación no usa `skipWaiting`, no fuerza recargas y avisa de la actualización pendiente. Termina la actividad antes de cerrar para actualizar. La caché antigua se retira al activar la siguiente versión. El navegador puede eliminar datos por decisión del usuario o por falta de espacio; vuelve a verificar antes de cada evento.

## Compilación y despliegue estático

`npm run build` genera `dist/`. Se puede servir en cualquier alojamiento estático HTTPS. No publiques `src/`, `node_modules/` ni herramientas de desarrollo como distribución.

Para GitHub Pages, una opción es cargar el contenido de `dist/` en la rama/carpeta que Pages tenga configurada, o preparar un flujo propio de Pages con Node, `npm ci` y `npm run build`. La publicación requiere autorización aparte y no se ha realizado. Las dos páginas deben permanecer en la misma carpeta y origen.

La configuración `base: './'`, los enlaces del manifiesto y los nombres del precache son relativos; permiten desplegar la misma compilación en `/` o `/temporizador-presentaciones/` sin recompilar. Entra por la ruta de carpeta con `/` final o por `index.html`. El servidor debe servir `sw.js` como JavaScript, sin sustituirlo por HTML, y permitir su revalidación. Se recomienda caché corta/revalidación para HTML, manifiesto y `sw.js`, y caché larga para los módulos con hash.

La caché del Service Worker prevalece durante una sesión: la comprobación de actualización del navegador descarga la versión nueva, pero no la activa sobre un evento en curso. Evita cambiar de dominio, puerto, carpeta o perfil sin exportar antes: los datos se separan por origen y ruta.

## Pruebas

```bash
npm run test
npm run test:watch
npm run test:e2e
npm run test:e2e:ui
```

Las pruebas E2E compilan primero y arrancan `vite preview` en `127.0.0.1:4173`; el puerto debe estar libre. Por defecto utilizan Google Chrome instalado (`channel: chrome`). Si no está instalado:

```bash
npx playwright install chromium
```

Después usa el canal `chromium` para Playwright:

```powershell
# PowerShell
$env:PLAYWRIGHT_CHANNEL="chromium"
npm run test:e2e
```

```bash
# bash
PLAYWRIGHT_CHANNEL=chromium npm run test:e2e
```

Los navegadores de Playwright sólo son una dependencia de las pruebas. La operación de la PWA no los requiere. Consulta [el informe de validación](docs/VALIDACION.md) para resultados concretos y límites. Los informes y trazas se guardan en `playwright-report/` y `test-results/`.

Las pruebas unitarias inyectan un reloj y no esperan duraciones reales. Cubren transiciones, pausas prolongadas, retrasos, estados finales, CSV, persistencia y mensajes antiguos. Las E2E interactúan con ventanas reales de Chrome; la prueba offline utiliza un perfil temporal persistente, cierra el proceso y vuelve a abrirlo con la red deshabilitada.

Para comprobar también el despliegue en subcarpeta, compila, ejecuta `node scripts/serve-subpath.mjs` y visita `http://127.0.0.1:4174/temporizador/`. Es un servidor auxiliar de comprobación local, no una dependencia de operación.

## Limitaciones y solución de problemas

| Problema o condición | Acción / alcance |
| --- | --- |
| No se abre la pantalla pública | Permite ventanas emergentes del sitio y pulsa Mostrar ventana. Lanzar sigue iniciando el reloj aunque el navegador bloquee la apertura. |
| No hay selección de monitor | Usa los controles de Windows y el traslado manual. La API es opcional y depende de permisos y navegador. |
| No funciona pantalla completa | Solicítala desde la propia pantalla pública. Usa maximización manual si el navegador la restringe. |
| Un panel dice que ya hay otro | Cierra el panel anterior y recarga. Sólo una autoridad puede modificar los datos y controlar el reloj. |
| No se puede guardar | Revisa permisos, espacio y restricciones del perfil. Un cambio de actividades fallido conserva la lista anterior. No borres datos sin exportar. |
| La pantalla indica estado sin verificar | Vuelve al panel, recupera foco y comprueba que sigue abierto. Los temporizadores de pestañas inactivas pueden sufrir limitaciones del navegador. |
| Después de reiniciar aparece Detenido | Es intencional: hay que lanzar de nuevo de forma explícita. No se reconstruye automáticamente tiempo transcurrido con la aplicación cerrada. |
| La PWA no carga offline | Abre con conexión, verifica el precache y repite el cierre/reapertura. La instalación por sí sola no demuestra que la caché esté lista. |
| Hay actualización pendiente | Termina la actividad y cierra ambas ventanas y pestañas de ese origen/ruta. Abre de nuevo y verifica offline. |
| Se suspende Windows | No se garantiza la precisión durante suspensión, hibernación o bloqueo del proceso. Revisa y reinicia explícitamente después de un incidente. |
| Cambia la hora del sistema | El reloj del panel sigue siendo monotónico; la proyección pública puede corregirse al siguiente mensaje. |
| Perfil privado o datos eliminados | La persistencia y la instalación pueden estar restringidas. Usa un perfil normal dedicado y conserva el CSV. |

La precisión no depende de la frecuencia de renderizado, pero JavaScript no proporciona una garantía de tiempo real. Un controlador muy limitado en segundo plano puede retrasar las confirmaciones; la pantalla lo advierte. No hay prueba física con HDMI, DPI de Windows, permisos de pantallas ni instalación nativa Windows realizada desde este entorno. Esas verificaciones deben hacerse con el equipo del evento.

## Referencias técnicas

- [Vite: compilación, bases relativas y múltiples páginas](https://vite.dev/guide/build).
- [Service Workers: instalación, actualización y ciclo de vida](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).
- [Chrome: actualizaciones pendientes y cierre de clientes](https://developer.chrome.com/docs/workbox/modules/workbox-window/).
- [Window Management API](https://developer.chrome.com/docs/capabilities/web-apis/window-management).
