# ModZero Electron Client

A Twingate-style desktop client for the ModZero Zero Trust Security Platform.  Runs in the system tray, lists available resources, and provides troubleshooting tools.

## Features

- **Login** — Username/password authentication via Controller `/api/auth/login`
- **Resources** — Lists resources from `GET /api/client/resources`; click to open in default browser
- **Network Switching** — Select network from `GET /api/client/networks`
- **Start at Login** — `app.setLoginItemSettings` toggle
- **Troubleshoot menu** — View Logs, Upload Logs (zip + POST), Copy Version Details
- **Settings** — Controller URL, Secure DNS toggle, crash reports, detailed logging
- **Real-time** — Socket.IO connection for resource updates, force-logout, policy changes
- **Security** — Token stored via `electron-store`, sanitized log output (JWT/secrets redacted), `contextIsolation: true`

## Project Structure

```
electron-client/
├── src/
│   ├── main/                  # Main process (Node.js)
│   │   ├── main.ts            # Entry point: tray, window, IPC, Socket.IO
│   │   ├── preload.ts         # contextBridge IPC bridge + type declarations
│   │   ├── api-client.ts      # Axios client: login, resources, networks, access-link
│   │   ├── device-info.ts     # System info via systeminformation + PowerShell
│   │   ├── logger.ts          # Sanitized rotating file logger
│   │   ├── log-uploader.ts    # Zip + upload log archives
│   │   └── socket-manager.ts  # Socket.IO client for real-time events
│   │
│   └── renderer/              # Renderer process (React + Tailwind)
│       ├── App.tsx            # Pages: Login, Resources, Troubleshoot, Settings
│       ├── index.css          # Tailwind base styles + scrollbar + animations
│       ├── index.html         # HTML shell with CSP
│       └── main.tsx           # React entry point
│
├── assets/                    # Tray icon, app icon
├── package.json               # Scripts + dependencies
├── vite.config.ts             # Vite config for renderer
├── tsconfig.json              # TypeScript config (renderer)
├── tsconfig.main.json         # TypeScript config (main process)
├── tailwind.config.js
└── postcss.config.js
```

## Development

### Prerequisites

- Node.js 18+
- Controller running at `http://localhost:8000` (or configure in Settings)

### Setup

```bash
cd electron-client

# Install dependencies
npm install

# Start dev mode (renderer hot-reload + main process watch)
npm run dev

# In another terminal, start Electron
npm run electron
```

### Build

```bash
# Build for Windows
npm run package:win

# Build for all platforms
npm run package
```

## Controller API Endpoints (New)

The following endpoints were added to the backend to support the client:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/client/me` | Current user profile |
| `GET` | `/api/client/resources` | Resources available to user (optional `?network=` filter) |
| `GET` | `/api/client/networks` | Available networks with connector/resource counts |
| `POST` | `/api/client/access-link` | Generate one-time URL for a resource |
| `POST` | `/api/client/logs/upload` | Receive zip archive of client logs |

All endpoints require `Authorization: Bearer <token>`.

## Tray Menu Layout

```
admin@modzero.com           (disabled — shows user email)
Connected                   (disabled — socket status)
─────────────────────────
Resources                   → opens Resources page
─────────────────────────
☑ Start at Login            → app.setLoginItemSettings
Troubleshoot              ▸
  View Logs                 → shell.openPath(logDir)
  ☐ Share Crash Reports     → toggle
  ☐ Collect Detailed Logs   → logger.setLevel('debug')
  Upload Logs               → zip + POST /api/client/logs/upload
  Copy Version Details      → clipboard
─────────────────────────
☐ Secure DNS                → toggle
─────────────────────────
Log out & disconnect        → clear token, disconnect Socket.IO
Quit ModZero                → app.quit()
```

## Security

- **Token storage**: `electron-store` in `%APPDATA%/modzero-electron-client/`
- **Context isolation**: `contextIsolation: true`, `nodeIntegration: false`
- **Log sanitization**: Bearer tokens, JWTs, long opaque strings, and JSON secret fields are redacted before writing to disk
- **No tokens in UI**: Tokens never sent to renderer process
- **CSP**: Content-Security-Policy in index.html restricts connections to localhost in dev

## Configuration

Settings stored in `%APPDATA%/modzero-electron-client/config.json`:

| Key | Default | Description |
|-----|---------|-------------|
| `serverUrl` | `http://localhost:8000` | Controller URL |
| `autoStart` | `false` | Launch on OS startup |
| `minimizeToTray` | `true` | Minimize to tray on close |
| `secureDns` | `false` | Secure DNS toggle |
| `shareCrashReports` | `false` | Send crash reports |
| `collectDetailedLogs` | `false` | Enable debug-level logging |

## License

MIT
