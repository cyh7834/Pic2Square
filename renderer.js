// 전역 변수
let selectedFiles = [];
let isProcessing = false;
let completedCount = 0;

// DOM 요소
const selectFilesBtn = document.getElementById('selectFilesBtn');
const convertBtn = document.getElementById('convertBtn');
const clearBtn = document.getElementById('clearBtn');
const fileList = document.getElementById('fileList');
const fileCount = document.getElementById('fileCount');
const overallProgress = document.getElementById('overallProgress');
const progressText = document.getElementById('progressText');
const statusText = document.getElementById('statusText');
const loadingOverlay = document.getElementById('loadingOverlay');
const toast = document.getElementById('toast');

// 이벤트 리스너
selectFilesBtn.addEventListener('click', selectFiles);
convertBtn.addEventListener('click', startConversion);
clearBtn.addEventListener('click', clearAllFiles);

// 진행률 업데이트 이벤트 리스너
window.electronAPI.onConversionProgress((data) => {
    updateFileProgress(data.filePath, data.progress);
});

// 윈도우 컨트롤 이벤트
document.addEventListener('DOMContentLoaded', () => {
    const minimizeBtn = document.querySelector('.window-control.minimize');
    const maximizeBtn = document.querySelector('.window-control.maximize');
    const closeBtn = document.querySelector('.window-control.close');
    
    if (minimizeBtn) {
        minimizeBtn.addEventListener('click', () => {
            if (window.electronAPI && window.electronAPI.minimizeWindow) {
                window.electronAPI.minimizeWindow();
            }
        });
    }
    
    if (maximizeBtn) {
        maximizeBtn.addEventListener('click', () => {
            if (window.electronAPI && window.electronAPI.maximizeWindow) {
                window.electronAPI.maximizeWindow();
            }
        });
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            if (window.electronAPI && window.electronAPI.closeWindow) {
                window.electronAPI.closeWindow();
            }
        });
    }
});

// 파일 선택
async function selectFiles() {
    try {
        const files = await window.electronAPI.selectFiles();
        if (files && files.length > 0) {
            selectedFiles = files;
            await updateFileList();
            updateUI();
            showToast('파일이 선택되었습니다.', 'success');
        }
    } catch (error) {
        showToast('파일 선택 중 오류가 발생했습니다.', 'error');
        console.error('File selection error:', error);
    }
}

// 파일 목록 업데이트
async function updateFileList() {
    fileList.innerHTML = '';
    
    if (selectedFiles.length === 0) {
        fileList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-cloud-upload-alt"></i>
                <p>이미지 파일을 선택하여 변환을 시작하세요</p>
            </div>
        `;
        return;
    }

    for (let i = 0; i < selectedFiles.length; i++) {
        const filePath = selectedFiles[i];
        const fileName = getFileName(filePath);
        
        // 파일 정보 가져오기
        const fileInfo = await window.electronAPI.getFileInfo(filePath);
        
        const fileItem = createFileItem(fileName, filePath, fileInfo, i);
        fileList.appendChild(fileItem);
    }
}

// 파일 아이템 생성
function createFileItem(fileName, filePath, fileInfo, index) {
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';
    fileItem.dataset.index = index;
    fileItem.dataset.filePath = filePath;

    const fileSize = fileInfo ? formatFileSize(fileInfo.size) : '알 수 없음';
    const dimensions = fileInfo ? `${fileInfo.width} × ${fileInfo.height}` : '알 수 없음';
    const format = fileInfo ? fileInfo.format.toUpperCase() : '알 수 없음';
    
           // 메타데이터 정보 숨김 (사용자 요청)
           let orientationInfo = '';
           let dpiInfo = '';
           let colorInfo = '';

    fileItem.innerHTML = `
        <div class="file-header">
            <div class="file-name">
                <i class="fas fa-image"></i>
                ${fileName}
            </div>
            <div class="file-size">${fileSize}</div>
        </div>
        
        <div class="file-details">
            <div class="detail-item">
                <span class="detail-label">크기:</span>
                <span class="detail-value">${dimensions}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">포맷:</span>
                <span class="detail-value">${format}</span>
            </div>
            ${orientationInfo}
            ${dpiInfo}
            ${colorInfo}
        </div>
        
        <div class="file-progress">
            <div class="progress-info">
                <span class="progress-status">대기중</span>
                <span class="progress-percentage">0%</span>
            </div>
            <div class="file-progress-bar">
                <div class="file-progress-fill" style="width: 0%"></div>
            </div>
        </div>
        
        <div class="file-actions">
            <button class="action-btn remove" onclick="removeFileFromList(${index})">
                <i class="fas fa-trash"></i>
                제거
            </button>
        </div>
    `;

    return fileItem;
}

// 파일 목록에서 제거
function removeFileFromList(index) {
    selectedFiles.splice(index, 1);
    updateFileList();
    updateUI();
    showToast('파일 목록이 제거되었습니다.', 'success');
}

// 변환 시작
async function startConversion() {
    if (selectedFiles.length === 0) {
        showToast('변환할 파일을 먼저 선택해주세요.', 'warning');
        return;
    }

    if (isProcessing) {
        showToast('이미 변환이 진행 중입니다.', 'warning');
        return;
    }

    isProcessing = true;
    completedCount = 0;
    updateUI();
    showLoading(true);

    try {
        // 전체 진행률 초기화
        updateOverallProgress(0, selectedFiles.length);

        // 각 파일 변환
        for (let i = 0; i < selectedFiles.length; i++) {
            await convertFile(i);
        }

        showToast(`변환이 완료되었습니다! (${completedCount}/${selectedFiles.length}개 성공)`, 'success');
        
    } catch (error) {
        showToast('변환 중 오류가 발생했습니다.', 'error');
        console.error('Conversion error:', error);
    } finally {
        isProcessing = false;
        showLoading(false);
        updateUI();
    }
}

// 개별 파일 변환
async function convertFile(index) {
    const filePath = selectedFiles[index];
    const fileItem = document.querySelector(`[data-index="${index}"]`);
    
    if (!fileItem) return;

    try {
        // 상태 업데이트
        updateFileStatus(fileItem, '변환중', 0);
        
        // 변환 실행
        const result = await window.electronAPI.convertImage(filePath);
        
        if (result.success) {
            updateFileStatus(fileItem, '완료', 100);
            addOpenButtons(fileItem, result);
            completedCount++;
        } else {
            updateFileStatus(fileItem, `실패: ${result.error}`, 0);
        }
        
    } catch (error) {
        updateFileStatus(fileItem, `오류: ${error.message}`, 0);
        console.error(`File conversion error for ${filePath}:`, error);
    }
    
    // 전체 진행률 업데이트
    updateOverallProgress(completedCount, selectedFiles.length);
}

// 파일 상태 업데이트
function updateFileStatus(fileItem, status, progress) {
    const statusElement = fileItem.querySelector('.progress-status');
    const percentageElement = fileItem.querySelector('.progress-percentage');
    const progressFill = fileItem.querySelector('.file-progress-fill');
    
    statusElement.textContent = status;
    percentageElement.textContent = `${progress}%`;
    progressFill.style.width = `${progress}%`;
    
    // 클래스 업데이트
    fileItem.className = 'file-item';
    if (status === '변환중') {
        fileItem.classList.add('processing');
    } else if (status === '완료') {
        fileItem.classList.add('completed');
    } else if (status.includes('실패') || status.includes('오류')) {
        fileItem.classList.add('error');
    }
}

// 파일 진행률 업데이트 (실시간)
function updateFileProgress(filePath, progress) {
    // 경로에 백슬래시(\\)가 포함되어 CSS attribute selector에서 문제가 될 수 있으므로
    // DOM을 순회하여 dataset.filePath로 직접 매칭한다.
    let fileItem = null;
    const items = document.querySelectorAll('.file-item');
    for (const el of items) {
        if (el.dataset && el.dataset.filePath === filePath) {
            fileItem = el;
            break;
        }
    }
    if (!fileItem) return;

    const statusElement = fileItem.querySelector('.progress-status');
    const percentageElement = fileItem.querySelector('.progress-percentage');
    const progressFill = fileItem.querySelector('.file-progress-fill');

    // 진행률만 업데이트 (상태는 유지)
    percentageElement.textContent = `${progress}%`;
    progressFill.style.width = `${progress}%`;

    // 전체 진행률 계산 (완료된 파일 + 현재 진행 중인 파일들의 평균)
    updateOverallProgressWithCurrent(progress);
}

// 열기 버튼들 추가
function addOpenButtons(fileItem, result) {
    const actionsContainer = fileItem.querySelector('.file-actions');
    
    // 기존 버튼들이 있는지 확인
    const existingOpenFileBtn = actionsContainer.querySelector('.action-btn.open-file');
    const existingOpenFolderBtn = actionsContainer.querySelector('.action-btn.open-folder');
    
    // 파일 열기 버튼이 없으면 생성
    if (!existingOpenFileBtn) {
        const openFileBtn = document.createElement('button');
        openFileBtn.className = 'action-btn open-file';
        openFileBtn.innerHTML = `
            <i class="fas fa-external-link-alt"></i>
            열기
        `;
        openFileBtn.onclick = () => openFile(result.outputPath);
        actionsContainer.insertBefore(openFileBtn, actionsContainer.firstChild);
    }
    
    // 폴더 열기 버튼이 없으면 생성
    if (!existingOpenFolderBtn) {
        const openFolderBtn = document.createElement('button');
        openFolderBtn.className = 'action-btn open-folder';
        openFolderBtn.innerHTML = `
            <i class="fas fa-folder-open"></i>
            폴더 열기
        `;
        openFolderBtn.onclick = () => openFileFolder(result.outputPath);
        actionsContainer.insertBefore(openFolderBtn, actionsContainer.firstChild);
    }
}

// 파일 열기
async function openFile(filePath) {
    try {
        await window.electronAPI.openFile(filePath);
    } catch (error) {
        showToast('파일 열기 중 오류가 발생했습니다.', 'error');
        console.error('Open file error:', error);
    }
}

// 파일이 있는 폴더 열기
async function openFileFolder(filePath) {
    try {
        await window.electronAPI.openFileFolder(filePath);
    } catch (error) {
        showToast('폴더 열기 중 오류가 발생했습니다.', 'error');
        console.error('Open folder error:', error);
    }
}

// 전체 진행률 업데이트
function updateOverallProgress(completed, total) {
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    const progressFill = overallProgress.querySelector('.progress-fill');
    
    progressFill.style.width = `${percentage}%`;
    progressText.textContent = `${completed}/${total} 완료 (${percentage}%)`;
}

// 전체 진행률 업데이트 (현재 진행 중인 파일 포함)
function updateOverallProgressWithCurrent(currentProgress) {
    const totalFiles = selectedFiles.length;
    const completedFiles = completedCount;
    const currentFileProgress = currentProgress / 100; // 0-1 범위로 변환
    
    // 완료된 파일들 + 현재 진행 중인 파일의 진행률
    const totalProgress = (completedFiles + currentFileProgress) / totalFiles;
    const percentage = Math.round(totalProgress * 100);
    
    const progressFill = overallProgress.querySelector('.progress-fill');
    progressFill.style.width = `${percentage}%`;
    progressText.textContent = `${completedFiles}/${totalFiles} 완료 (${percentage}%)`;
}

// UI 업데이트
function updateUI() {
    fileCount.textContent = `${selectedFiles.length}개 파일`;
    convertBtn.disabled = selectedFiles.length === 0 || isProcessing;
    
    if (isProcessing) {
        convertBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 변환 중...';
        statusText.textContent = '변환 중...';
    } else {
        convertBtn.innerHTML = '<i class="fas fa-magic"></i> 변환 시작';
        statusText.textContent = selectedFiles.length > 0 ? '변환 준비됨' : '준비됨';
    }
}

// 전체 파일 목록 지우기
function clearAllFiles() {
    if (isProcessing) {
        showToast('변환이 진행 중일 때는 목록을 지울 수 없습니다.', 'warning');
        return;
    }
    
    selectedFiles = [];
    completedCount = 0;
    updateFileList();
    updateUI();
    updateOverallProgress(0, 0);
    showToast('전체 파일 목록이 제거되었습니다.', 'success');
}


// 로딩 표시
function showLoading(show) {
    if (show) {
        loadingOverlay.classList.remove('hidden');
    } else {
        loadingOverlay.classList.add('hidden');
    }
}

// 토스트 알림 표시
function showToast(message, type = 'success') {
    const toastMessage = toast.querySelector('.toast-message');
    const toastIcon = toast.querySelector('.toast-icon');
    
    toastMessage.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add('show');
    
    // 3초 후 자동 숨김
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// 유틸리티 함수들
function getFileName(filePath) {
    return filePath.split(/[\\/]/).pop();
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 드래그 앤 드롭 지원
document.addEventListener('DOMContentLoaded', () => {
    const fileListContainer = document.querySelector('.file-list-container');
    
    fileListContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileListContainer.style.background = 'rgba(102, 126, 234, 0.1)';
    });
    
    fileListContainer.addEventListener('dragleave', (e) => {
        e.preventDefault();
        fileListContainer.style.background = '';
    });
    
    fileListContainer.addEventListener('drop', async (e) => {
        e.preventDefault();
        fileListContainer.style.background = '';
        
        const files = Array.from(e.dataTransfer.files)
            .filter(file => file.type.startsWith('image/'))
            .map(file => file.path);
        
        if (files.length > 0) {
            selectedFiles = files;
            await updateFileList();
            updateUI();
            showToast(`${files.length}개 파일이 추가되었습니다.`, 'success');
        }
    });
});

// 초기화
document.addEventListener('DOMContentLoaded', () => {
    updateUI();
});
