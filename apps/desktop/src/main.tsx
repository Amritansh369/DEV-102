import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import './styles/desktop.css';
import App from './App';
import { ErrorBoundary, ToastViewport } from './lib/ui';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root was not found in index.html');

createRoot(container).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <ErrorBoundary>
        <App />
        <ToastViewport />
      </ErrorBoundary>
    </MotionConfig>
  </StrictMode>,
);
