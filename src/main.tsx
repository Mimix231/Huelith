import { installEffectsWorker } from './editor/effects-worker-client';
import { installExperimentalNativeEffectsAdapter } from './editor/native-effect-preview';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Huelith could not find the application root.');

if(new URLSearchParams(window.location.search).has('video-monitor')){
  void import('./components/VideoMonitorWindow').then(({default:VideoMonitorWindow})=>
    createRoot(root).render(<VideoMonitorWindow/>));
}else{
  installEffectsWorker();
  installExperimentalNativeEffectsAdapter();
  createRoot(root).render(<StrictMode><App/></StrictMode>);
}
