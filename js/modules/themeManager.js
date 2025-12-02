// =================================================================================
// 主题管理模块 (Theme Management Module) - v1.0
// ---------------------------------------------------------------------------------
// 职责:
// 1. 封装与应用主题（浅色/深色模式）相关的所有逻辑。
// 2. 从 localStorage 读取和保存用户的选择。
// 3. 提供初始化和切换主题的接口。
// =================================================================================

const THEME_KEY = 'etymology-visualizer-theme';

/**
 * 将指定的主题应用到 <body> 元素上，并持久化到 localStorage。
 * @param {string} theme - 要应用的主题 ('dark' 或 'light')。
 */
export function applyTheme(theme) {
    // 使用 toggle 的第二个参数来强制添加或移除类，比 add/remove 更简洁
    document.body.classList.toggle('dark-mode', theme === 'dark');
    try {
        localStorage.setItem(THEME_KEY, theme);
    } catch (e) {
        // 在隐私模式或存储已满时，这可能会失败，但应用应继续正常工作
        console.warn('无法将主题偏好保存到 localStorage:', e);
    }
}

/**
 * 初始化主题。
 * 优先从 localStorage 读取，其次根据系统偏好设置，最后默认为 'light'。
 */
export function init() {
    try {
        const savedTheme = localStorage.getItem(THEME_KEY);
        // 检查用户是否在操作系统级别设置了深色模式偏好
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        // 决定最终主题：优先使用已保存的，其次是系统偏好，最后是默认值
        const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
        applyTheme(initialTheme);
    } catch (e) {
        console.warn('无法读取或应用主题偏好, 将使用默认主题:', e);
        applyTheme('light'); // 保证在出错时有一个确定的主题
    }
}