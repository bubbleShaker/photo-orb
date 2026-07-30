// renderer に見せる API の全部。ここに書いたものしか renderer から呼べない。
// ipcRenderer 自体は公開しない（公開すると任意のチャンネルを叩けてしまう）。

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('photoOrb', {
  /**
   * フォルダを選ばせ、中の写真を返す。
   * 戻り値: { folderName, limit, photos: [{ id, name, url }] } / キャンセル時は null
   * url は photo-file://p/<uuid> 形式で、実パスは含まれない。
   */
  pickFolder: () => ipcRenderer.invoke('photo:pick-folder'),
});
