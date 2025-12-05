/**
 * =================================================================================
 * NLP 处理工作线程 (NLP Worker)
 * ---------------------------------------------------------------------------------
 * 职责:
 * 1. 在后台线程加载 compromise.js 库。
 * 2. 接收主线程传来的长文本。
 * 3. 执行分词、清洗、去重、排序操作。
 * 4. 将处理好的单词数组发回主线程，避免阻塞 UI。
 * =================================================================================
 */

// 导入 NLP 库 (路径相对于当前 worker 文件: ../../lib/)
// 注意：Service Worker 缓存策略中需确保此文件被缓存
try {
    importScripts('../../lib/compromise.js');
} catch (e) {
    console.error('NLP Worker: 无法加载 compromise.js 库', e);
}

// 监听主线程消息
self.onmessage = function(e) {
    const { type, text } = e.data;

    // 只处理提取请求
    if (type !== 'EXTRACT') return;

    // 1. 基础验证
    if (!text || typeof text !== 'string' || !text.trim()) {
        self.postMessage({ type: 'EXTRACT_RESULT', words: [] });
        return;
    }

    // 2. 检查库是否加载成功
    if (typeof nlp === 'undefined') {
        self.postMessage({
            type: 'ERROR',
            message: 'NLP 核心库未加载，请检查网络或路径配置。'
        });
        return;
    }

    try {
        // 3. 执行 NLP 处理逻辑 (耗时操作)

        // 步骤 A: 预处理文本，保留基础标点以便断句，但移除非单词字符
        // 注意：正则需允许常见标点，防止连字符单词断裂
        const cleanedText = text.replace(/[^A-Za-z0-9\s.,!?'"():;\-]/g, ' ');

        // 步骤 B: 使用 compromise 解析
        const doc = nlp(cleanedText);

        // 步骤 C: 提取标准化单词 (转小写、去除复数/时态还原)
        // .out('normal') 返回空格分隔的字符串
        const normalizedString = doc.terms().out('normal');

        // 步骤 D: 分割为数组
        const wordsArray = normalizedString.split(' ');

        // 步骤 E: 清洗、去重、过滤
        const uniqueWords = [...new Set(wordsArray)]
            .filter(w => {
                // 过滤规则:
                // 1. 必须存在
                // 2. 长度 >= 3 (过滤掉 a, is, to 等无意义短词)
                // 3. 纯字母构成 (防止残留数字或符号)
                return w && w.length >= 3 && /^[a-z]+$/.test(w);
            })
            .sort(); // 字母排序

        // 4. 发送结果回主线程
        self.postMessage({ type: 'EXTRACT_RESULT', words: uniqueWords });

    } catch (error) {
        console.error('NLP Worker 处理出错:', error);
        self.postMessage({
            type: 'ERROR',
            message: '文本处理过程中发生错误，请重试。'
        });
    }
};