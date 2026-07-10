import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Note: StrictMode is intentionally off — the PixiJS canvas owns real GPU
// resources and dev double-mounting complicates its lifecycle for no benefit
// in this codebase.
createRoot(document.getElementById('root')!).render(<App />);
