// eslint-disable-next-line import/no-extraneous-dependencies
import { contextBridge } from 'electron';

import api from './api';
console.log(api)

contextBridge.exposeInMainWorld('Workbench', api);
