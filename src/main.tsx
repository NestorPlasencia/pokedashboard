import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { registerServiceWorker } from './services/serviceWorker.ts'

registerServiceWorker()

createRoot(document.getElementById('root')!).render(
    <App />
)
