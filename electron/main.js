const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// 用户存档文件：保存在应用数据目录下
function usersFile() {
  return path.join(app.getPath('userData'), 'users.json');
}

function readUsers() {
  try {
    const list = JSON.parse(fs.readFileSync(usersFile(), 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}

function writeUsers(list) {
  try {
    fs.writeFileSync(usersFile(), JSON.stringify(list, null, 2), 'utf8');
    return true;
  } catch (e) { return false; }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 450,
    height: 800,
    resizable: true,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  win.loadFile(path.join(__dirname, '..', 'index.html'));
}

ipcMain.handle('users:load', () => readUsers());
ipcMain.handle('users:save', (e, list) => (Array.isArray(list) ? writeUsers(list) : false));

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
