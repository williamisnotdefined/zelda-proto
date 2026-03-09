import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './monitoring/ErrorBoundary';
import { installGlobalErrorLogging } from './monitoring/errorLogger';
import { initPwaUpdatePrompt } from './pwa/updatePrompt';

initPwaUpdatePrompt();
installGlobalErrorLogging();

const root = createRoot(document.getElementById('root')!);
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
