'use strict';
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { listen } = require(path.join(__dirname, '..', 'src', 'server.js'));

let win;
app.whenReady().then(async () => {
  const { port } = await listen({ port: 0 });
  win = new BrowserWindow({ width: 980, height: 760, title: 'HET → Excel (parallel)', autoHideMenuBar: true, webPreferences: { contextIsolation: true } });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.loadURL(`http://127.0.0.1:${port}/`);
});
app.on('window-all-closed', () => app.quit());
