# DreamTrans Frontend

Real-time speech transcription and translation frontend using React + TypeScript + Vite.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Optional: create `.env` to override backend WS base (usually not needed):
```bash
echo "VITE_BACKEND_WS_URL=ws://localhost:8080" > .env
```

3. Start the development server:
```bash
npm run dev
```

## Connection Behavior

- Default: connects to backend using same-origin WebSocket URL `ws(s)://<page-host>/ws/transcribe`.
- Development: Vite dev server proxies `/ws` to `http://localhost:8080` with WebSocket upgrade.
- Overrides (only if needed):
  - URL query: `?ws=ws://your-host:port`
  - Build-time env: `VITE_BACKEND_WS_URL=ws://your-host:port`

## Features

- Real-time speech-to-text transcription (via backend WS)
- Three-pane UI: Transcript, Translation (placeholder), Summary + Chat (placeholder)
- Robust reconnect and session persistence (IndexedDB)

## Development

This project uses Vite for fast development with HMR (Hot Module Replacement).

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
