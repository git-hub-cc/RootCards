// =================================================================================
// 全局撤销管理器 (Global Undo Manager) - v1.1 (集成音效)
// ---------------------------------------------------------------------------------
// 职责:
// 1. 提供一个全局的、单例的“撤销”操作通知UI。
// 2. 管理5秒倒计时，并在时间结束后执行确认操作。
// 3. 处理用户点击“撤销”的逻辑，并触发音效。
// =================================================================================

import * as UI from '../ui.js';

// --- 模块内部状态 ---
const state = {
    timeoutId: null,      // 用于存储 setTimeout 的 ID，以便可以清除它
    onConfirmCallback: null, // 倒计时结束后执行的回调
    onUndoCallback: null,    // 点击“撤销”时执行的回调
};

// --- 模块内部DOM元素缓存 ---
const elements = {};

/**
 * 缓存所有相关的DOM元素，增强鲁棒性。
 * @returns {boolean} 成功返回 true，失败返回 false。
 */
function cacheElements() {
    // 防止重复缓存
    if (elements.toast) return true;

    elements.toast = document.getElementById('undo-toast');
    elements.message = document.getElementById('undo-message');
    elements.actionBtn = document.getElementById('undo-action-btn');
    elements.progressBar = document.getElementById('undo-progress-bar');

    // 鲁棒性检查：确保所有关键元素都存在于HTML中
    for (const key in elements) {
        if (!elements[key]) {
            console.error(`撤销管理器初始化失败：未找到DOM元素 #${key}`);
            return false;
        }
    }
    return true;
}

/**
 * 隐藏通知栏并重置其状态。
 */
function hide() {
    elements.toast.classList.remove('is-visible');
    // 移除动画类，以便下次可以重新触发动画
    elements.progressBar.classList.remove('is-running');
}

/**
 * 处理用户点击“撤销”按钮的事件。
 */
function handleUndo() {
    // 1. 播放撤销音效
    UI.playUiSound('undo');

    // 2. 清除即将执行的“真实删除”计时器
    if (state.timeoutId) {
        clearTimeout(state.timeoutId);
        state.timeoutId = null;
    }

    // 3. 执行传入的撤销逻辑（例如，恢复UI元素的显示）
    if (typeof state.onUndoCallback === 'function') {
        try {
            state.onUndoCallback();
        } catch (e) {
            console.error('执行 onUndoCallback 时出错:', e);
        }
    }

    // 4. 隐藏通知栏
    hide();
}

/**
 * 显示并启动撤销通知。
 * @param {object} options - 配置对象
 * @param {string} options.message - 显示在通知中的文本信息。
 * @param {function} options.onConfirm - 5秒倒计时结束后执行的回调函数（例如，执行真实删除）。
 * @param {function} options.onUndo - 用户点击“撤销”时执行的回调函数（例如，恢复UI）。
 */
export function show({ message, onConfirm, onUndo }) {
    if (!elements.toast) {
        console.error("撤销管理器未初始化或初始化失败，无法显示通知。");
        // 即使UI无法显示，也应立即执行确认操作，避免数据不一致
        if (typeof onConfirm === 'function') onConfirm();
        return;
    }

    // **核心鲁棒性**: 如果上一个撤销操作还在倒计时，立即清除它并执行其确认操作。
    // 这能防止用户快速连续删除时，只有最后一个操作被记住，而之前的操作被“遗忘”在待删除状态。
    if (state.timeoutId) {
        clearTimeout(state.timeoutId);
        if (typeof state.onConfirmCallback === 'function') {
            try {
                state.onConfirmCallback();
            } catch (e) {
                console.error('快速操作时，执行上一个 onConfirmCallback 出错:', e);
            }
        }
    }

    // 1. 更新状态和UI内容
    state.onConfirmCallback = onConfirm;
    state.onUndoCallback = onUndo;
    elements.message.textContent = message;

    // 2. 显示通知栏
    elements.toast.classList.add('is-visible');

    // 3. 重置并启动进度条动画
    //    先移除类，强制浏览器重绘，再添加类，确保动画每次都从头播放
    elements.progressBar.classList.remove('is-running');
    // void 语句是一种可靠的触发重绘（reflow）的技巧
    void elements.progressBar.offsetWidth;
    elements.progressBar.classList.add('is-running');


    // 4. 设置5秒后执行的“真实删除”操作
    state.timeoutId = setTimeout(() => {
        if (typeof state.onConfirmCallback === 'function') {
            try {
                state.onConfirmCallback();
            } catch (e) {
                console.error('执行 onConfirmCallback 时出错:', e);
            }
        }
        hide();
        state.timeoutId = null; // 清理ID
    }, 5000);
}

/**
 * 初始化模块，绑定永久性的事件监听器。
 */
export function init() {
    if (!cacheElements()) {
        // 如果关键DOM元素缺失，模块将无法工作
        return;
    }
    // 绑定“撤销”按钮的点击事件
    elements.actionBtn.addEventListener('click', handleUndo);
}