// 把「用户存档文件读写」暴露给渲染进程（游戏本体）
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('furyStore', {
  load: () => ipcRenderer.invoke('users:load'),
  save: (users) => ipcRenderer.invoke('users:save', users),
});
