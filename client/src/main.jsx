import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// iOS hace zoom con el gesto de pellizcar aunque el viewport lo prohíba.
document.addEventListener('gesturestart', (e) => e.preventDefault());

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

createRoot(document.getElementById('root')).render(<App />);
