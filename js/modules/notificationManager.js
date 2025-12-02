// =================================================================================
// 全局通知管理器 (Global Notification Manager) - v1.0
// ---------------------------------------------------------------------------------
// 职责:
// 1. 提供一个全局单例，用于显示非阻塞的Toast通知。
// 2. 支持不同类型的通知（成功、错误、信息）。
// 3. 自动处理通知的显示、隐藏和替换，具备良好的鲁棒性。
// =================================================================================

// --- 模块内部状态 ---
const state = {
    timeoutId: null,      // 用于存储 setTimeout 的 ID，以便可以清除它
    isInitialized: false, // 模块是否已成功初始化
};

// --- 模块内部DOM元素缓存 ---
const elements = {};

/**
 * 缓存所有相关的DOM元素，增强鲁棒性。
 * @returns {boolean} 成功返回 true，失败返回 false。
 */
function cacheElements() {
    elements.toast = document.getElementById('notification-toast');
    elements.icon = document.getElementById('notification-icon');
    elements.message = document.getElementById('notification-message');

    // 鲁棒性检查：确保所有关键元素都存在于HTML中
    for (const key in elements) {
        if (!elements[key]) {
            console.error(`通知管理器初始化失败：未找到DOM元素 #${key}`);
            return false;
        }
    }
    return true;
}

/**
 * 隐藏通知栏。
 */
function hide() {
    if (elements.toast) {
        elements.toast.classList.remove('is-visible');
    }
    // 清理定时器ID，表示当前没有正在进行的隐藏计划
    if (state.timeoutId) {
        clearTimeout(state.timeoutId);
        state.timeoutId = null;
    }
}

/**
 * 显示并启动通知。
 * 这是模块对外暴露的核心API。
 * @param {object} options - 配置对象
 * @param {'success'|'error'|'info'} options.type - 通知类型。
 * @param {string} options.message - 显示在通知中的文本信息。
 * @param {number} [options.duration=3000] - 通知显示的毫秒数，默认为3秒。
 */
export function show({ type, message, duration = 3000 }) {
    if (!state.isInitialized) {
        console.error("通知管理器未初始化或初始化失败，无法显示通知。");
        // 作为备用方案，在开发环境中仍然使用原生alert，以防完全丢失信息
        alert(`[${type.toUpperCase()}] ${message}`);
        return;
    }

    // **核心鲁棒性**: 如果上一个通知还在显示，立即清除其隐藏计时器。
    // 这能确保新的通知可以完整地显示其设定的时长，而不是被旧的计时器提前关闭。
    if (state.timeoutId) {
        clearTimeout(state.timeoutId);
    }

    // 1. 更新UI内容和样式
    elements.message.textContent = message;

    // 根据类型设置图标和样式类
    // 移除所有可能的类型类，确保样式干净
    elements.toast.classList.remove('toast--success', 'toast--error', 'toast--info');
    elements.toast.classList.add(`toast--${type}`);

    // 根据类型设置不同的 emoji 图标
    switch (type) {
        case 'success':
            elements.icon.textContent = '✅';
            break;
        case 'error':
            elements.icon.textContent = '❌';
            break;
        case 'info':
            elements.icon.textContent = 'ℹ️';
            break;
        default:
            elements.icon.textContent = ''; // 默认为空
    }

    // 2. 显示通知栏
    elements.toast.classList.add('is-visible');

    // 3. 设置定时器，在指定时间后自动隐藏通知
    state.timeoutId = setTimeout(() => {
        hide();
    }, duration);
}

/**
 * 初始化模块。应在应用启动时调用一次。
 */
export function init() {
    if (cacheElements()) {
        state.isInitialized = true;
        // 允许用户点击通知以提前关闭它
        elements.toast.addEventListener('click', hide);
    }
}