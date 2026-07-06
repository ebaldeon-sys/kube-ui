# kubeui

kubeui es un cliente de escritorio para Kubernetes construido con Electron, React, TypeScript y Vite. La aplicacion no implementa un cliente Kubernetes propio: usa el `kubectl` instalado en la maquina y lo ejecuta con el contexto, namespace y kubeconfig seleccionados desde la interfaz.

## Requerimientos

- Node.js `22.12.0` o superior.
- npm incluido con Node.js.
- `kubectl` instalado y disponible en el `PATH`.
- Uno o mas archivos kubeconfig validos.

Rutas comunes de kubeconfig:

- macOS/Linux: `~/.kube/config`
- Windows: `%USERPROFILE%\.kube\config`

No se requiere Python, Go ni Docker para ejecutar la app en modo desarrollo.

## Instalacion

Todos los scripts de instalacion, arranque y empaquetado viven en `scripts/`,
separados por plataforma:

```text
scripts/
  make-icons.mjs               Regenera los iconos de build/.
  windows/
    install.bat                Valida Node/npm y ejecuta npm ci.
    start.bat                  Arranca la app en modo desarrollo.
    package.bat                Genera el .exe (portable + instalador NSIS).
  macos/
    install.command            Valida Node/npm y ejecuta npm ci.
    start.command              Arranca la app en modo desarrollo.
    package-macos.sh           Empaqueta dmg + zip (sin firma, solo uso local).
    package-windows-docker.sh  Genera el .exe portable desde macOS via Docker.
```

Los scripts se pueden ejecutar con doble clic o desde una terminal; ellos mismos
se ubican en la raiz del proyecto.

### Windows

```bat
scripts\windows\install.bat
scripts\windows\start.bat
```

`install.bat` valida que exista Node.js, npm y que la version de Node sea compatible con Electron 42. Luego ejecuta `npm ci` (instala exactamente lo que dice `package-lock.json`).

### macOS

```bash
./scripts/macos/install.command
./scripts/macos/start.command
```

Si el sistema no permite ejecutarlos, habilita permisos:

```bash
chmod +x scripts/macos/*.command scripts/macos/*.sh
```

### Manual

```bash
npm install
npm run dev
```

El modo desarrollo levanta Vite en `http://127.0.0.1:5173` y abre Electron apuntando a esa URL.

## Configuracion

La app permite registrar uno o varios archivos kubeconfig desde la seccion de configuracion. Esas rutas se guardan en el archivo `settings.json` del directorio de datos de Electron para `kubeui`.

Cuando ejecuta comandos, kubeui arma la variable `KUBECONFIG` con las rutas registradas. Si no hay kubeconfig registrado, la app no usa automaticamente `~/.kube/config`; primero debes agregarlo desde la interfaz.

Cada comando se ejecuta con `--context` y `-n/--namespace` cuando corresponde. Esto evita modificar el contexto global de tu kubeconfig.

## Comandos

```bash
npm run dev
```

Inicia la app en modo desarrollo.

```bash
npm run build
```

Compila Electron, TypeScript y el frontend de Vite.

```bash
npm run preview
```

Sirve el build web generado por Vite.

```bash
npm run dist       # paquetes para el SO actual
npm run dist:win   # portable + instalador NSIS de Windows
npm run dist:mac   # dmg + zip de macOS (sin firma)
```

Genera paquetes con Electron Builder. La salida queda en `release/`.

### Calidad de codigo

```bash
npm run lint          # ESLint sobre src/ y electron/
npm run format        # Formatea con Prettier
npm run format:check  # Verifica formato (usado en CI)
npm run typecheck     # Comprobacion de tipos del renderer
npm test              # Tests con Vitest
npm run make-icons    # Regenera build/icon.ico/.icns desde image/kubeuiimage.png
```

Un hook de `pre-commit` (husky + lint-staged) formatea y valida los archivos
en stage antes de cada commit. La CI (GitHub Actions) corre lint, formato,
typecheck, tests y build en cada push/PR a `main`.

## Funciones principales

- Registro, validacion y apertura de ubicacion de kubeconfigs.
- Listado de contextos desde los kubeconfigs registrados.
- Manejo de multiples pestanas independientes, con limite configurado en `MAX_TABS`.
- Contexto y namespace por pestana.
- Selector de recursos organizado por categorias.
- Filtros independientes por tipo de recurso y por pestana.
- Estado visual por pestana: ejecutando, terminado, detenido o error.
- Ejecucion de comandos sin cambiar el contexto global del usuario.
- Copiado del comando actual desde la barra de contexto/namespace, y copiado de salidas o detalles con notificacion temporal.

Recursos soportados:

- Workloads: Pods, Deployments, StatefulSets, DaemonSets, ReplicaSets, CronJobs, Jobs y HPAs.
- Red: Services e Ingress.
- Configuracion: ConfigMaps y Secrets.
- Almacenamiento: PVCs.
- Cluster: Namespaces y Nodes.

Acciones disponibles segun el recurso:

- Ver `describe`.
- Ver YAML.
- Editar YAML de un recurso existente usando `kubectl replace`.
- Aplicar YAML desde texto o archivo con `kubectl apply`.
- Eliminar recursos con confirmacion.
- Reiniciar Pods, Deployments, StatefulSets y DaemonSets.
- Reiniciar multiples Pods seleccionados.
- Escalar Deployments, StatefulSets y ReplicaSets.
- Ejecutar CronJobs manualmente creando un Job.
- Suspender o reanudar CronJobs.
- Ejecutar comandos manuales no interactivos desde la terminal interna.

## Logs

La vista de logs incluye:

- Modo en vivo con `kubectl logs -f`.
- Modo historico por rango de tiempo.
- Selector de contenedor cuando el Pod tiene mas de un contenedor.
- Modo formateado y modo crudo.
- Busqueda dentro de logs.
- Filtros por nivel en modo formateado: Error, Warn, Info, Debug, Trace y Otros.
- Panel de detalle de linea con tamanio ajustable.
- Vista ampliada.
- Control para detener o reanudar la consulta.
- Corte automatico de streams vivos no fijados al cambiar de pestana o vista.

Limites actuales de logs:

- `MAX_LIVE_LINES`: maximo de lineas retenidas en modo en vivo.
- `MAX_QUERY_LINES`: maximo de lineas retenidas en consultas historicas.
- `MAX_RANGE_DAYS`: ancho maximo permitido para consultas historicas.

Estos valores se configuran en `src/app/constants.ts`.

## Estructura del proyecto

```text
electron/
  main.ts          Proceso principal de Electron e IPC hacia kubectl.
  kubectl-args.ts  Logica pura de construccion/validacion de argumentos.
  preload.cjs      Preload (fuente unica) que expone la API al renderer.

shared/
  types.d.ts       Tipos de IPC compartidos entre main y renderer.

build/
  icon.ico/.icns/.png  Iconos de la app (generados con make-icons).

src/
  App.tsx          Orquestador principal de vistas y acciones.
  main.tsx         Entrada React (con ErrorBoundary).
  types.ts         Tipos del renderer (re-exporta los de shared/).

  app/
    constants.ts   Constantes de UI, logs y pestanas.
    createTab.ts   Creacion del estado inicial de una pestana.
    types.ts       Tipos internos de recursos, tabs, logs y streams.

  components/
    ErrorBoundary.tsx  Captura errores de render y evita la pantalla blanca.
    dialogs/       Modales: confirmacion, input y detalle.
    layout/        TabStrip, SessionBar, Sidebar y StatusBar.
    logs/          Vista y controles de logs.
    output/        Paneles de salida, terminal y apply.
    resources/     Tabla de recursos y acciones por recurso.
    workspace/     Estados vacios, configuracion y errores de bridge.

  config/
    resources.ts   Definicion de recursos Kubernetes, columnas y categorias.

  hooks/
    useClipboard.ts       Copiado y notificaciones temporales.
    useDialogs.ts         Dialogos internos de confirmacion, input y detalle.
    useLogs.ts            Preferencias, ejecucion y estado de logs.
    useResourceActions.ts Acciones de kubectl (delete, scale, edit, apply...).
    useResources.ts       Carga de recursos con `kubectl get -o json`.
    useStream.ts          Ciclo de vida de streams de kubectl.
    useTabs.ts            Estado de pestanas y modo de vista.

  kubectl/
    format.ts      Formateo de comandos, errores y salidas.
    logs.ts        Construccion y procesamiento de comandos de logs.

  resources/
    helpers.ts     Helpers para leer campos comunes de objetos Kubernetes.

  styles/
    app.css              Indice de imports CSS.
    base.css             Reset y base global.
    shell.css            Layout general, pestanas y navegacion.
    resources.css        Tabla y listado de recursos.
    output.css           Paneles de salida.
    logs.css             Componentes principales de logs.
    logs-layout.css      Ajustes de layout ampliado y resizable de logs.
    panels.css           Terminal, apply y estados de carga.
    workspace.css        Configuracion, archivos y estados base.
    theme.css            Tema visual Console Pro Kubernetes.
    resource-details.css Inspector y detalles de recursos.
    dialogs.css          Modales, comandos y toast.
```

## Flujo interno

1. El renderer llama metodos expuestos en `window.kubeui`.
2. `electron/preload.cjs` envia solicitudes IPC al proceso principal.
3. `electron/main.ts` ejecuta `kubectl` con `spawn`, construye `KUBECONFIG`, agrega `--context` y namespace cuando aplica.
4. El resultado vuelve al renderer como salida estructurada: `ok`, `stdout`, `stderr`, `code` y `command`.
5. Los comandos de logs y terminal usan streams IPC para mostrar salida progresiva.

## Empaquetado

Electron Builder esta configurado en `package.json`. Los iconos se generan desde
`image/kubeuiimage.png` hacia `build/icon.ico` (Windows), `.icns` (macOS) y
`.png` (Linux) con `npm run make-icons`. La salida de los paquetes queda en
`release/`.

Los paquetes **no van firmados** (ni notarizados). Consecuencias:

- Windows: el `.exe` funciona; muestra un aviso de SmartScreen (editor
  desconocido) que se acepta con "Mas informacion > Ejecutar de todos modos".
- macOS: el `.dmg`/`.zip` sirve para uso local (abrir con clic derecho >
  Abrir). No es distribuible a otros Macs sin un Developer ID de Apple.

### Generar el ejecutable de Windows

Hay tres formas, de mas a menos recomendada:

1. **GitHub Actions (recomendada).** El workflow `.github/workflows/release.yml`
   compila en un runner de Windows real con `npm ci`, por lo que nunca hay
   problemas de Wine, arquitectura ni dependencias. Se dispara al pushear un tag
   `v*` (ver "Versionado y releases") y publica `kubeui-portable-<version>-x64.exe`
   y `kubeui-setup-<version>-x64.exe` como GitHub Release. Tambien puede lanzarse
   a mano desde la pestana Actions (workflow_dispatch) y descargar los .exe como
   artifacts.

2. **En una maquina Windows.** Ejecuta `scripts\windows\package.bat` (doble clic
   o terminal). Valida Node 22.12+, corre `npm ci` y `npm run dist:win`, y abre
   la carpeta `release/` al terminar. Genera portable + instalador NSIS.

3. **Desde macOS con Docker.** `scripts/macos/package-windows-docker.sh` compila
   el `.exe` **portable** usando la imagen oficial de electron-builder con Wine,
   sin instalar Wine en el equipo:

   ```bash
   ./scripts/macos/package-windows-docker.sh
   ```

   El resultado queda en `release/`. El instalador NSIS no puede construirse
   bajo la emulacion de Apple Silicon; para eso usa las opciones 1 o 2.

### Generar el paquete de macOS

```bash
./scripts/macos/package-macos.sh    # dmg + zip sin firma
```

Targets configurados: macOS `dmg`/`zip`, Windows `portable`/`nsis` (x64),
Linux `AppImage`/`deb`.

## Versionado y releases

La version unica de la app vive en `package.json` (`version`); electron-builder
la usa para nombrar los artefactos. Para publicar una version:

```bash
npm run release:patch   # 0.1.0 -> 0.1.1 (fixes)
npm run release:minor   # 0.1.0 -> 0.2.0 (funcionalidad nueva)
npm run release:major   # 0.1.0 -> 1.0.0 (cambios incompatibles)
```

Cada comando ejecuta `npm version`, que actualiza `package.json` y
`package-lock.json`, crea un commit y un tag git `vX.Y.Z`. Luego:

```bash
git push --follow-tags
```

Al llegar el tag a GitHub, el workflow de release compila los `.exe` de Windows
y crea el GitHub Release con los binarios adjuntos. El workflow verifica que el
tag coincida con la version de `package.json` antes de publicar.

## Notas y limitaciones

- La terminal interna esta pensada para comandos no interactivos.
- Comandos como `kubectl exec -it`, `attach -it` o `port-forward` requieren soporte de pseudo-terminal y deben ejecutarse desde una terminal externa por ahora.
- Si Electron no descarga su binario durante `npm install`, revisa proxy, certificados corporativos, acceso a internet y version de Node. El proyecto espera Node.js `22.12.0` o superior.
- `scripts/windows/fix-electron-node22.bat` y `scripts/windows/make-ca-bundle.ps1`, si existen en tu entorno, son scripts locales de diagnostico (no versionados) porque contienen rutas especificas de una maquina o certificados corporativos.
