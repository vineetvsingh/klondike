import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/fraunces/full.css';
import '@fontsource-variable/plus-jakarta-sans';
import './styles/tokens.css';
import './styles/app.css';
import './styles/cards.css';
import './styles/ui.css';
import './styles/backs.css';
import './styles/features.css';
import './kinetics/kinetics.css';
import './text-effects/text-effects.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
