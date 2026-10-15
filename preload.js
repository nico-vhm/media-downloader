'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const call = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);
const on = (ch) => (cb) => ipcRenderer.on(ch, (e, ...a) => cb(...a));

contextBridge.exposeInMainWorld('api', {
  init: call('init'),
  resolve: call('resolve'),
  add: call('queue:add'),
  cancel: call('queue:cancel'),
  cancelAll: call('queue:cancel-all'),
  pause: call('queue:pause'),
  resume: call('queue:resume'),
  pauseAll: call('queue:pause-all'),
  resumeAll: call('queue:resume-all'),
  retry: call('queue:retry'),
  remove: call('queue:remove'),
  clear: call('queue:clear'),
  open: call('file:open'),
  show: call('file:show'),
  set: call('settings:set'),
  pickDir: call('settings:dir'),
  version: call('tools:version'),
  update: call('tools:update'),
  retrySetup: call('setup:retry'),
  clipboard: call('clipboard'),
  disk: call('disk'),
  openFolder: call('folder:open'),
  win: (cmd) => ipcRenderer.send('win', cmd),
  cancelShutdown: call('shutdown:cancel'),
  onShutdown: on('shutdown'),
  onQueue: on('queue'),
  onPartial: on('partial'),
  onSetup: on('setup'),
  onFocus: on('focus'),
  onMaximized: on('maximized'),
});
