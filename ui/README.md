# open-context — Web UI

React + TypeScript + Vite dashboard for [open-context](../README.md).

## Development

```bash
nvm use          # requires Node 25+
npm install
npm run dev      # dev server at http://localhost:5173 (proxies /api → :3000)
npm run build    # production build → dist/
npm run lint     # ESLint
npm test         # Vitest
```

The UI proxies all `/api` requests to the backend server running on port 3000. Start the backend first:

```bash
# from the project root
npm run server
```

## Stack

- **React 19** + **TypeScript**
- **Vite 7** build tool
- **React Router 7** for client-side routing
- **Tailwind CSS v4** + **shadcn/ui** (new-york style, zinc base, pitch black theme)
- **Lucide React** icons
- **Vitest** + **@testing-library/react** for tests

See the [main README](../README.md) for full project documentation.
