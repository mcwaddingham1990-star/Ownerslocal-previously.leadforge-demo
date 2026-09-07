import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Mobile Chrome/Safari can restore a tab from the back-forward cache when the
// user switches apps and returns, instead of doing a real navigation --
// that resumes the exact JS that was already running in memory, so a new
// deploy never takes effect until the tab is fully closed and reopened.
// Force a real reload whenever that happens so the latest build is always
// what's running.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    window.location.reload();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
