const { contextBridge, ipcRenderer } = require('electron');

// 렌더러 프로세스에서 사용할 수 있는 API 노출
contextBridge.exposeInMainWorld('electronAPI', {
    // 파일 선택
    selectFiles: () => ipcRenderer.invoke('select-files'),
    
    // 출력 폴더 열기
    openOutputFolder: (filePath) => ipcRenderer.invoke('open-output-folder', filePath),
    
    // 이미지 변환
    convertImage: (filePath) => ipcRenderer.invoke('convert-image', filePath),
    
    // 파일 정보 가져오기
    getFileInfo: (filePath) => ipcRenderer.invoke('get-file-info', filePath),
    
    // 파일 열기
    openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
    
    // 파일이 있는 폴더 열기
    openFileFolder: (filePath) => ipcRenderer.invoke('open-file-folder', filePath),
    
    // 진행률 업데이트 이벤트
    onConversionProgress: (callback) => {
        ipcRenderer.on('conversion-progress', (event, data) => callback(data));
    },
    
    // 윈도우 컨트롤
    minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
    maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
    closeWindow: () => ipcRenderer.invoke('close-window')
});
