import {createRoot} from 'react-dom/client';
import App from '../src/App';
import '../src/index.css';
// This entry point is exclusive to the isolated preview, never the production build.
(window as Window & {houseFixture?:string}).houseFixture=new URLSearchParams(location.search).get('fixture')||'territory';
createRoot(document.getElementById('root')!).render(<App/>);
// No service worker is installed by this preview.
