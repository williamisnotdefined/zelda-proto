import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initPwaUpdatePrompt } from './pwa/updatePrompt';

initPwaUpdatePrompt();

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
