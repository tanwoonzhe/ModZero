# ModZero Electron Client

A Windows desktop client for the ModZero Zero Trust Security Platform. This client runs in the system tray and performs periodic compliance checks on your device.

## Features

- 🔒 **Device Compliance Checking** - Automatically checks device security status
- 🖥️ **System Tray Integration** - Runs quietly in the background
- 🔄 **Auto Updates** - Automatically downloads and installs updates
- 📊 **Real-time Status** - View your compliance score and issues
- ⚙️ **Configurable** - Adjust check intervals and server settings

## Development

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup

```bash
# Install dependencies
npm install

# Run in development mode
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

## Architecture

```
electron-client/
├── src/
│   ├── main/           # Main process (Node.js)
│   │   ├── main.ts     # Entry point, window management, tray
│   │   ├── preload.ts  # Context bridge for IPC
│   │   ├── device-info.ts  # System information gathering
│   │   └── api-client.ts   # Backend API communication
│   │
│   └── renderer/       # Renderer process (React)
│       ├── App.tsx     # Main React component
│       ├── index.css   # Tailwind styles
│       └── main.tsx    # React entry point
│
├── assets/            # Icons and images
└── release/           # Built executables
```

## Security Checks

The client performs the following security checks:

- **Antivirus Status** - Checks if antivirus is installed and active
- **Firewall Status** - Verifies Windows Firewall is enabled
- **Disk Encryption** - Checks BitLocker status
- **Windows Updates** - Checks for recent security updates
- **Disk Space** - Warns if disk space is critically low

## Configuration

Settings are stored in `%APPDATA%/modzero-electron-client/config.json`:

- `serverUrl` - Backend API server URL
- `autoStart` - Launch on Windows startup
- `minimizeToTray` - Minimize to tray instead of closing
- `checkInterval` - Time between compliance checks (milliseconds)

## Auto Updates

The client uses `electron-updater` with GitHub Releases for automatic updates:

1. Tag a new release on GitHub
2. Upload the built artifacts
3. Clients will automatically download and install

## License

MIT
