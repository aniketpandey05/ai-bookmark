import { render } from 'preact';
import { applyTheme, loadTheme, watchTheme } from '../../core/theme';
import { Popup } from './Popup';
import './popup.css';

void loadTheme().then(applyTheme);
watchTheme(applyTheme);

render(<Popup />, document.getElementById('app')!);
