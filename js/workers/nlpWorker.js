/**
 * =================================================================================
 * NLP 处理工作线程 (NLP Worker)
 * ---------------------------------------------------------------------------------
 * 职责:
 * 1. 在后台线程加载 compromise.js 库。
 * 2. 接收主线程传来的长文本。
 * 3. 执行分词、预清洗、去重。
 * 4. 【核心优化】对去重后的单词列表进行词形还原 (Lemmatization)，提升处理速度。
 * 5. 将处理好的单词数组发回主线程。
 * =================================================================================
 */

// 导入 NLP 库 (路径相对于当前 worker 文件: ../../lib/)
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
        // 3. 执行 NLP 处理逻辑 (性能优化版)

        // 步骤 A: 预处理文本 (正则清洗)
        // 这一步非常快，先保留字母和空格，去除绝大多数标点和数字
        // 这一步不使用 nlp() 库，避免构建庞大的文档对象模型
        const cleanedRawText = text
            .replace(/[^A-Za-z\s-]/g, ' ') // 仅保留字母、空格和连字符
            .toLowerCase();                // 统一转小写

        // 步骤 B: 粗分词 (Split)
        const rawTokens = cleanedRawText.split(/\s+/);

        // 步骤 C: 早期去重 (Early Deduplication) - 【核心性能优化】
        // 假设输入是一本书(10万词)，词汇量可能只有5千。
        // 我们先去重，将后续昂贵的 NLP 运算量减少 95% 以上。
        const uniqueRawTokens = new Set(rawTokens);
        const processedWordsSet = new Set();

        // 步骤 D: 针对唯一单词进行词形还原
        uniqueRawTokens.forEach(token => {
            // 基础过滤: 忽略过短单词或非纯字母组合
            if (!token || token.length < 2 || !/^[a-z]+$/.test(token)) {
                return;
            }

            // 使用 compromise 处理单个单词 (开销极小)
            const doc = nlp(token);

            // 1. 动词还原: 过去式/进行时 -> 原形 (e.g., "running" -> "run", "went" -> "go")
            doc.verbs().toInfinitive();

            // 2. 名词还原: 复数 -> 单数 (e.g., "apples" -> "apple")
            doc.nouns().toSingular();

            // 3. 获取标准化文本
            const lemma = doc.text('normal');

            if (lemma && lemma.length >= 2) {
                processedWordsSet.add(lemma);
            }
        });

        // 步骤 E: 排序并转换回数组
        const sortedWords = [...processedWordsSet].sort();

        // 4. 发送结果回主线程
        self.postMessage({ type: 'EXTRACT_RESULT', words: sortedWords });

    } catch (error) {
        console.error('NLP Worker 处理出错:', error);
        self.postMessage({
            type: 'ERROR',
            message: '文本处理过程中发生错误，请重试。'
        });
    }
};