import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { registerServiceWorker } from './services/serviceWorker.ts'
import { restoreLaunchUrl } from './services/launchUrl.ts'

// Before anything reads window.location: the contexts build their initial state from the
// query string while they mount.
restoreLaunchUrl()
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
    <App />
)
