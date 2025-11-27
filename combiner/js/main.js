// =================================================================================
// 应用控制器 (Application Controller)
// ---------------------------------------------------------------------------------
// 核心职责：
// 1. 导入核心转换模块 `svg-converter.js`。
// 2. 获取所有需要操作的 DOM 元素的引用。
// 3. 绑定事件监听器到按钮上（转换、复制）。
// 4. 定义事件处理函数，协调用户输入、逻辑处理和界面更新。
// 5. 提供用户反馈，如成功或错误信息。
// 6. 确保在页面加载完成后才执行脚本。
// =================================================================================

// 1. 从我们的逻辑模块中导入核心转换函数
import { convertSvgToSinglePath } from './svg-converter.js';

// 2. DOMContentLoaded 事件确保在整个 HTML 文档加载并解析完毕后才执行脚本
document.addEventListener('DOMContentLoaded', () => {

    // 3. 获取所有需要交互的 DOM 元素的引用
    const svgInput = document.getElementById('svg-input');
    // 【修改】获取两个新的输出文本框
    const svgOutputFull = document.getElementById('svg-output-full');
    const svgOutputPath = document.getElementById('svg-output-path');
    const convertBtn = document.getElementById('convert-btn');
    // 【修改】获取两个新的复制按钮
    const copyBtnFull = document.getElementById('copy-btn-full');
    const copyBtnPath = document.getElementById('copy-btn-path');
    const statusMessage = document.getElementById('status-message');

    // --- 鲁棒性检查：确保所有关键元素都存在 ---
    // 【修改】更新了检查列表以包含所有新元素
    if (!svgInput || !svgOutputFull || !svgOutputPath || !convertBtn || !copyBtnFull || !copyBtnPath || !statusMessage) {
        console.error('页面初始化失败：一个或多个关键DOM元素未找到。');
        document.body.innerHTML = '<h1 style="color: red; text-align: center; padding-top: 50px;">页面加载错误，请检查HTML结构是否完整。</h1>';
        return;
    }

    /**
     * 显示状态信息的辅助函数
     * @param {string} message - 要显示的消息文本
     * @param {'success' | 'error'} type - 消息类型，用于应用不同的CSS样式
     */
    function showStatus(message, type = 'success') {
        statusMessage.textContent = message;
        statusMessage.className = type;

        setTimeout(() => {
            statusMessage.textContent = '';
            statusMessage.className = '';
        }, 5000);
    }

    /**
     * 处理“转换”按钮点击事件的核心函数
     */
    function handleConvert() {
        const inputSvg = svgInput.value.trim();

        // 【修改】清空两个输出框的内容
        svgOutputFull.value = '';
        svgOutputPath.value = '';

        if (!inputSvg) {
            showStatus('输入框不能为空。', 'error');
            return;
        }

        try {
            // 【修改】调用核心转换逻辑，现在返回一个对象
            const result = convertSvgToSinglePath(inputSvg);

            // 【修改】将返回对象中的数据分别填充到两个输出框
            svgOutputFull.value = result.fullSvg;
            svgOutputPath.value = result.pathD;

            showStatus('转换成功！', 'success');

        } catch (error) {
            console.error('转换失败:', error);
            showStatus(`转换失败: ${error.message}`, 'error');
        }
    }

    /**
     * 【新增】处理“复制”按钮点击事件的通用函数
     * @param {HTMLTextAreaElement} sourceTextarea - 从哪个文本框复制内容
     * @param {HTMLButtonElement} buttonElement - 被点击的那个按钮元素
     */
    async function handleCopy(sourceTextarea, buttonElement) {
        const textToCopy = sourceTextarea.value;
        if (!textToCopy) {
            showStatus('没有内容可以复制。', 'error');
            return;
        }

        try {
            await navigator.clipboard.writeText(textToCopy);

            // 提供视觉反馈
            const originalText = buttonElement.textContent;
            buttonElement.textContent = '已复制!';
            showStatus('已成功复制到剪贴板！', 'success');

            // 2秒后恢复按钮文本
            setTimeout(() => {
                buttonElement.textContent = originalText;
            }, 2000);

        } catch (error) {
            console.error('复制失败:', error);
            showStatus('复制失败，请手动复制。', 'error');
        }
    }


    // 4. 为按钮绑定事件监听器
    convertBtn.addEventListener('click', handleConvert);

    // 【修改】为两个复制按钮分别绑定事件，并调用通用的 handleCopy 函数
    copyBtnFull.addEventListener('click', () => handleCopy(svgOutputFull, copyBtnFull));
    copyBtnPath.addEventListener('click', () => handleCopy(svgOutputPath, copyBtnPath));
});