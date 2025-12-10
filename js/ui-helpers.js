// =================================================================================
// UI 辅助脚本 (UI Helpers)
// ---------------------------------------------------------------------------------
// 职责:
// - 包含从 index.html 迁移出来的、用于处理特定UI交互的轻量级脚本。
// - 确保在 DOM 加载完成后执行，以实现良好的分离和鲁棒性。
// =================================================================================

document.addEventListener('DOMContentLoaded', () => {
    /**
     * 初始化 "DSNR" 音频触发器功能。
     * 这是一个彩蛋功能，通过点击页脚的链接来播放或暂停一个特定的音效。
     */
    function initializeDsnrTrigger() {
        // 懒加载音频对象，仅在首次点击时创建
        let dsnrAudio = null;
        const trigger = document.getElementById('dsnr-trigger');

        // 鲁棒性检查：确保触发器元素存在于页面上
        if (!trigger) {
            // 如果元素不存在，则静默失败，避免在控制台产生不必要的警告
            return;
        }

        trigger.addEventListener('click', (event) => {
            // 阻止 <a> 标签的默认跳转行为
            event.preventDefault();

            // 首次点击时创建 Audio 对象
            if (!dsnrAudio) {
                try {
                    dsnrAudio = new Audio('audio/ui/DSNR.opus');
                } catch (e) {
                    console.error('创建 DSNR 音频对象时出错:', e);
                    return; // 如果创建失败，则中止后续操作
                }
            }

            // 根据当前音频状态，切换播放与暂停
            if (dsnrAudio.paused) {
                // play() 方法返回一个 Promise，最好进行捕获以处理可能的异常
                dsnrAudio.play().catch(console.error);
            } else {
                dsnrAudio.pause();
            }
        });
    }

    // 执行初始化
    initializeDsnrTrigger();
});