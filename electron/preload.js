const { contextBridge, ipcRenderer } = require('electron');

const invokeChannels = new Set(['export-note', 'export-rtf']);
const listenChannels = new Set(['backend-ready', 'backend-failed', 'backend-diagnostics']);
const listenerMap = new Map();

function trackListener(channel, callback, wrapped) {
  if (!listenerMap.has(channel)) {
    listenerMap.set(channel, new WeakMap());
  }
  listenerMap.get(channel).set(callback, wrapped);
}

function untrackListener(channel, callback) {
  const channelMap = listenerMap.get(channel);
  if (!channelMap) return null;
  const wrapped = channelMap.get(callback);
  if (wrapped) {
    channelMap.delete(callback);
  }
  return wrapped;
}

contextBridge.exposeInMainWorld('electronAPI', {
  invoke(channel, payload) {
    if (!invokeChannels.has(channel)) {
      return Promise.reject(new Error(`Blocked invoke channel: ${channel}`));
    }
    return ipcRenderer.invoke(channel, payload);
  },
  on(channel, callback) {
    if (!listenChannels.has(channel) || typeof callback !== 'function') {
      return () => {};
    }
    const wrapped = (event, ...args) => callback(event, ...args);
    trackListener(channel, callback, wrapped);
    ipcRenderer.on(channel, wrapped);
    return () => {
      ipcRenderer.removeListener(channel, wrapped);
      untrackListener(channel, callback);
    };
  },
  removeListener(channel, callback) {
    if (!listenChannels.has(channel) || typeof callback !== 'function') return;
    const wrapped = untrackListener(channel, callback);
    if (wrapped) {
      ipcRenderer.removeListener(channel, wrapped);
    }
  },
});
