# kubeui

kubeui is a desktop Kubernetes client powered by the `kubectl` already installed on the machine.

## Requirements

- Node.js and npm for development.
- `kubectl` installed and available in `PATH` for using the app.
- A valid kubeconfig, usually:
  - macOS/Linux: `~/.kube/config`
  - Windows: `%USERPROFILE%\.kube\config`

No Python or Go runtime is required.

## Development

macOS:

```bash
./install-macos.command
./start-macos.command
```

Windows:

```bat
install-windows.bat
start-windows.bat
```

Manual commands:

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Package

```bash
npm run dist
```

The app is configured for macOS DMG/ZIP and Windows portable/NSIS targets through Electron Builder.

## Current Features

- Register one or more kubeconfig files.
- Use the default kubeconfig path when available.
- List contexts from the selected kubeconfig set.
- Open multiple independent tabs.
- Each tab has its own context and namespace.
- Commands use `--context` instead of changing the global kubeconfig context.
- List pods, deployments, services, configmaps, secrets, ingress, and nodes.
- View `describe`, YAML, and pod logs.
- Delete resources with confirmation.
- Restart pods and deployments.
- Scale deployments.
- Apply YAML from text or file.
- Run manual non-interactive `kubectl` commands from the terminal section.

Interactive commands such as `kubectl exec -it` and long-running sessions such as `port-forward` should be implemented later with a pseudo-terminal.
