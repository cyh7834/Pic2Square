const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

let mainWindow;

function createWindow() {
  // 메인 윈도우 생성
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: 'hidden',
    frame: false,
    show: false,
    backgroundColor: '#1e1e1e'
  });

  // 윈도우 제목 설정
  mainWindow.setTitle('Pic2Square - 정방형 이미지 변환기');

  // HTML 파일 로드
  mainWindow.loadFile('index.html');

  // 윈도우가 준비되면 표시
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 개발 모드에서 DevTools 열기
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // 윈도우가 닫힐 때
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 앱이 준비되면 윈도우 생성
app.whenReady().then(createWindow);

// 모든 윈도우가 닫혔을 때
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 파일 선택 다이얼로그
ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '이미지 파일', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'tiff', 'tif', 'webp'] },
      { name: 'JPEG 파일', extensions: ['jpg', 'jpeg'] },
      { name: 'PNG 파일', extensions: ['png'] },
      { name: '모든 파일', extensions: ['*'] }
    ]
  });

  if (!result.canceled) {
    return result.filePaths;
  }
  return [];
});

// 출력 폴더 열기 (원본 파일이 있는 폴더)
ipcMain.handle('open-output-folder', async (event, filePath) => {
  if (filePath) {
    const outputDir = path.dirname(filePath);
    shell.openPath(outputDir);
  }
});

// 이미지 변환 처리 (진행률 포함)
ipcMain.handle('convert-image', async (event, filePath) => {
  try {
    let currentProgress = 0;
    let rampTimer = null;

    const stopRamp = () => {
      if (rampTimer) {
        clearInterval(rampTimer);
        rampTimer = null;
      }
    };

    const setProgress = (p) => {
      currentProgress = Math.max(0, Math.min(99, Math.floor(p)));
      updateProgress(currentProgress);
    };

    const rampTo = (target, durationMs = 2000, tickMs = 100) => {
      stopRamp();
      const start = currentProgress;
      const targetClamped = Math.max(start + 1, Math.min(99, target));
      const startTime = Date.now();
      rampTimer = setInterval(() => {
        const t = Math.min(1, (Date.now() - startTime) / durationMs);
        const value = Math.floor(start + (targetClamped - start) * t);
        if (value > currentProgress) {
          setProgress(value);
        }
        if (t >= 1 || currentProgress >= targetClamped) {
          stopRamp();
        }
      }, tickMs);
    };
    const fileName = path.basename(filePath);
    const nameWithoutExt = path.parse(fileName).name;
    const outputFileName = `${nameWithoutExt}_square.jpg`;
    const outputPath = path.join(path.dirname(filePath), outputFileName);

    // 진행률 업데이트 함수
    const updateProgress = (progress) => {
      event.sender.send('conversion-progress', {
        filePath: filePath,
        progress: progress
      });
    };

    // 초기 진행률
    setProgress(5);
    rampTo(15, 400, 80);

    // 이미지 메타데이터 가져오기
    const metadata = await sharp(filePath).metadata();
    const { width, height, orientation } = metadata;
    
    setProgress(20);
    rampTo(28, 500, 80);

    // EXIF Orientation 값에 따른 실제 이미지 크기 계산
    let actualWidth = width;
    let actualHeight = height;
    let isRotated = false;

    // Orientation 값에 따라 실제 표시되는 크기 결정
    if (orientation && orientation >= 5 && orientation <= 8) {
      // 90도 또는 270도 회전된 경우 (세로 사진이 가로로 표시되거나 그 반대)
      actualWidth = height;
      actualHeight = width;
      isRotated = true;
    }

    // 이미 정사각형인지 확인 (실제 표시 크기 기준)
    if (actualWidth === actualHeight) {
      throw new Error('이미 정사각형입니다');
    }

    // 정사각형 크기 계산 (실제 표시 크기 기준)
    const squareSize = Math.max(actualWidth, actualHeight);

    // 원본 이미지의 모든 메타데이터 가져오기
    const originalImage = sharp(filePath);
    const originalMetadata = await originalImage.metadata();
    
    // 원본 DPI 정보 추출 (더 정확한 방법)
    let originalDensity = originalMetadata.density;
    let originalXDensity = originalMetadata.xDensity;
    let originalYDensity = originalMetadata.yDensity;
    
    // DPI 정보가 없는 경우 기본값 설정
    if (!originalDensity) {
      originalDensity = 72; // 기본값 72 DPI
    }
    if (!originalXDensity) {
      originalXDensity = originalDensity;
    }
    if (!originalYDensity) {
      originalYDensity = originalDensity;
    }
    
    console.log(`원본 DPI 정보: ${originalDensity} (X: ${originalXDensity}, Y: ${originalYDensity})`);
    
    setProgress(30);
    // 이미지 처리 구간은 시간이 길 수 있으므로 30 -> 75까지 부드럽게 램프업
    rampTo(75, 4000, 120);

    // 이미지 변환 (Orientation 자동 처리 + DPI 보존)
    await originalImage
      .rotate() // EXIF Orientation 정보에 따라 자동 회전
      .resize(squareSize, squareSize, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 },
        withoutEnlargement: false // 크기 확대 허용
      })
      .jpeg({ 
        quality: 95,
        mozjpeg: true, // 메타데이터 최적화
        progressive: true, // 점진적 JPEG
        optimizeScans: true, // 스캔 최적화
        trellisQuantisation: true, // 트렐리스 양자화
        overshootDeringing: true, // 오버슈트 디링잉
        optimizeScans: true // 스캔 최적화
      })
      .withMetadata({
        // DPI 정보 명시적 보존
        density: originalDensity,
        xDensity: originalXDensity,
        yDensity: originalYDensity
      })
      .toFile(outputPath);
    
    // 디스크 기록 직후 고정 진척도
    stopRamp();
    setProgress(85);
    rampTo(92, 800, 100);

    // 출력 파일 정보
    const outputStats = fs.statSync(outputPath);
    const outputMetadata = await sharp(outputPath).metadata();
    
    console.log(`변환 후 DPI 정보: ${outputMetadata.density} (X: ${outputMetadata.xDensity}, Y: ${outputMetadata.yDensity})`);
    console.log(`DPI 보존 상태: ${outputMetadata.density === originalDensity ? '성공' : '실패'}`);
    
    stopRamp();
    updateProgress(100);
    
    return {
      success: true,
      outputPath: outputPath,
      fileName: outputFileName,
      fileSize: outputStats.size,
      originalSize: { 
        width: actualWidth, 
        height: actualHeight,
        rawWidth: width,
        rawHeight: height,
        orientation: orientation,
        isRotated: isRotated,
        density: originalDensity,
        xDensity: originalXDensity,
        yDensity: originalYDensity,
        space: originalMetadata.space,
        channels: originalMetadata.channels
      },
      newSize: { 
        width: squareSize, 
        height: squareSize,
        density: outputMetadata.density,
        xDensity: outputMetadata.xDensity,
        yDensity: outputMetadata.yDensity
      },
      metadataPreserved: {
        exif: !!originalMetadata.exif,
        icc: !!originalMetadata.icc,
        iptc: !!originalMetadata.iptc,
        xmp: !!originalMetadata.xmp,
        density: originalDensity,
        densityPreserved: outputMetadata.density === originalDensity,
        hasProfile: !!originalMetadata.hasProfile,
        orientation: !!originalMetadata.orientation,
        space: originalMetadata.space,
        channels: originalMetadata.channels,
        // 실제 보존된 메타데이터 확인
        actualPreserved: {
          exif: !!outputMetadata.exif,
          icc: !!outputMetadata.icc,
          iptc: !!outputMetadata.iptc,
          xmp: !!outputMetadata.xmp,
          hasProfile: !!outputMetadata.hasProfile
        }
      }
    };

  } catch (error) {
    // 실패 시 진행률 램프 중지
    try { /* best-effort */ clearInterval(rampTimer); } catch (_) {}
    return {
      success: false,
      error: error.message
    };
  }
});

// 파일 정보 가져오기
ipcMain.handle('get-file-info', async (event, filePath) => {
  try {
    const stats = fs.statSync(filePath);
    const metadata = await sharp(filePath).metadata();
    const { width, height, orientation } = metadata;
    
    // EXIF Orientation 값에 따른 실제 이미지 크기 계산
    let actualWidth = width;
    let actualHeight = height;
    let isRotated = false;
    let orientationText = '정상';

    // Orientation 값에 따라 실제 표시되는 크기 결정
    if (orientation && orientation >= 5 && orientation <= 8) {
      // 90도 또는 270도 회전된 경우
      actualWidth = height;
      actualHeight = width;
      isRotated = true;
    }

    // Orientation 값에 따른 텍스트 설명
    if (orientation) {
      switch (orientation) {
        case 1: orientationText = '정상'; break;
        case 2: orientationText = '좌우 반전'; break;
        case 3: orientationText = '180도 회전'; break;
        case 4: orientationText = '상하 반전'; break;
        case 5: orientationText = '90도 회전 + 좌우 반전'; break;
        case 6: orientationText = '90도 시계방향 회전'; break;
        case 7: orientationText = '90도 반시계방향 회전 + 좌우 반전'; break;
        case 8: orientationText = '90도 반시계방향 회전'; break;
        default: orientationText = `Orientation ${orientation}`;
      }
    }
    
    return {
      size: stats.size,
      width: actualWidth,
      height: actualHeight,
      rawWidth: width,
      rawHeight: height,
      format: metadata.format,
      orientation: orientation,
      orientationText: orientationText,
      isRotated: isRotated,
      hasOrientation: !!orientation,
      // DPI 정보
      density: metadata.density,
      xDensity: metadata.xDensity,
      yDensity: metadata.yDensity,
      // 색상 정보
      space: metadata.space,
      channels: metadata.channels,
      hasAlpha: metadata.hasAlpha,
      // 기타 메타데이터
      hasProfile: metadata.hasProfile,
      isAnimated: metadata.isAnimated,
      // EXIF 정보
      exif: metadata.exif,
      icc: metadata.icc
    };
  } catch (error) {
    return null;
  }
});

// 파일 열기
ipcMain.handle('open-file', async (event, filePath) => {
    try {
        shell.openPath(filePath);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// 파일이 있는 폴더 열기
ipcMain.handle('open-file-folder', async (event, filePath) => {
    try {
        shell.showItemInFolder(filePath);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// 윈도우 컨트롤
ipcMain.handle('minimize-window', () => {
    if (mainWindow) {
        mainWindow.minimize();
    }
});

ipcMain.handle('maximize-window', () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }
});

ipcMain.handle('close-window', () => {
    if (mainWindow) {
        mainWindow.close();
    }
});
