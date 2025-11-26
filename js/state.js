// =================================================================================
// 数据与状态管理模块 (State Management Module) - v3.0 (支持多意境)
// ---------------------------------------------------------------------------------
// 主要职责：
// 1. (数据加载) 异步加载所有词汇数据文件。
// 2. (数据处理) 将原始数据处理成应用所需的格式，注入主题色和学习状态。
// 3. (状态管理) 维护全局数据、当前筛选器、当前数据集和已掌握单词列表。
// 4. (数据操作) 提供数据筛选、洗牌等功能。
// 5. (状态持久化) 负责从 localStorage 读取和保存用户学习进度。
// =================================================================================

// --- 模块内状态变量 ---
const LEARNED_WORDS_KEY = 'etymologyLearnedWords';

// --- 导出的状态变量 (其他模块可以读取和修改) ---
export let allVocabularyData = [];    // 存储所有JSON文件加载并扁平化的完整数据
export let currentDataSet = [];       // 当前筛选条件下，所有待渲染的数据集合
export let currentFilter = 'all';     // 当前筛选器状态
export let learnedWordsSet = new Set(); // 使用 Set 存储已掌握的单词

/**
 * 从 localStorage 加载已掌握的单词列表。
 * (此函数无修改)
 * @returns {void}
 */
export function loadLearnedWords() {
    try {
        const storedWords = localStorage.getItem(LEARNED_WORDS_KEY);
        if (storedWords) {
            const wordsArray = JSON.parse(storedWords);
            if (Array.isArray(wordsArray)) {
                learnedWordsSet = new Set(wordsArray);
            }
        }
    } catch (error) {
        console.error('无法从 localStorage 加载学习进度:', error);
        learnedWordsSet = new Set(); // 如果数据损坏，则重置
    }
}

/**
 * 将已掌握的单词列表保存到 localStorage。
 * (此函数无修改)
 * @returns {void}
 */
export function saveLearnedWords() {
    try {
        const wordsArray = Array.from(learnedWordsSet);
        localStorage.setItem(LEARNED_WORDS_KEY, JSON.stringify(wordsArray));
    } catch (error) {
        console.error('无法保存学习进度到 localStorage:', error);
    }
}

/**
 * 切换一个单词的“已掌握”状态。
 * (此函数无修改)
 * @param {object} wordData - 要操作的单词对象。
 */
export function toggleLearnedStatus(wordData) {
    wordData.isLearned = !wordData.isLearned;

    if (wordData.isLearned) {
        learnedWordsSet.add(wordData.word);
    } else {
        learnedWordsSet.delete(wordData.word);
    }
    saveLearnedWords();
}


/**
 * 异步加载并处理所有数据文件。
 * 【核心修改】此函数现在能处理新的嵌套式JSON结构。
 * @returns {Promise<Array<Object>>} 返回一个 Promise，解析为所有原始意境对象的数组（用于生成筛选器）。
 * @throws {Error} 如果数据清单 (DATA_FILES) 未定义或为空。
 */
export async function loadAndProcessData() {
    if (typeof DATA_FILES === 'undefined' || !Array.isArray(DATA_FILES) || DATA_FILES.length === 0) {
        throw new Error("数据清单 'data-manifest.js' 未找到或为空。");
    }

    let allRawMeaningGroups = []; // 【新】存储原始的意境分组对象，用于生成筛选按钮
    allVocabularyData = []; // 重置数据

    for (const file of DATA_FILES) {
        try {
            const response = await fetch(file);
            if (!response.ok) throw new Error(`网络错误，无法加载文件: ${file}`);
            const dataFile = await response.json();

            // --- 【核心修改】处理新的嵌套结构 ---
            // 鲁棒性检查：确保文件有 prefix 和 meanings 数组
            if (!dataFile.prefix || !Array.isArray(dataFile.meanings)) {
                console.warn(`文件 ${file} 格式不正确，已跳过。缺少 'prefix' 或 'meanings' 数组。`);
                continue;
            }

            // 【新】遍历文件中的每个意境分组
            for (const meaningGroup of dataFile.meanings) {
                // 1. 将原始意境分组添加到列表中，用于之后创建筛选器
                allRawMeaningGroups.push(meaningGroup);

                const groupData = [];
                // 2. 处理该意境的介绍卡片
                if (meaningGroup.prefixIntro) {
                    groupData.push({
                        ...meaningGroup.prefixIntro,
                        cardType: 'intro',
                        type: meaningGroup.meaningId,     // 使用 meaningId 作为内部筛选类型
                        prefix: dataFile.prefix,          // 注入顶层前缀，用于显示徽章
                        visual: meaningGroup.prefixVisual,
                        themeColor: meaningGroup.themeColor,
                    });
                }

                // 3. 处理该意境的单词列表
                if (Array.isArray(meaningGroup.words)) {
                    const wordsData = meaningGroup.words.map(word => ({
                        ...word,
                        cardType: 'word',
                        type: meaningGroup.meaningId,     // 使用 meaningId 作为内部筛选类型
                        prefix: dataFile.prefix,          // 注入顶层前缀
                        prefixVisual: meaningGroup.prefixVisual || '',
                        themeColor: meaningGroup.themeColor,
                        isLearned: learnedWordsSet.has(word.word)
                    }));
                    groupData.push(...wordsData);
                }
                allVocabularyData.push(...groupData);
            }
        } catch (fileError) {
            console.error(`加载或处理文件 ${file} 时出错:`, fileError);
        }
    }
    return allRawMeaningGroups;
}

/**
 * 根据当前筛选器过滤数据，更新 currentDataSet。
 * 【无修改】此函数设计良好，无需改动即可适应新的筛选ID。
 * @returns {void}
 */
export function filterAndPrepareDataSet() {
    if (currentFilter === 'learned') {
        currentDataSet = allVocabularyData.filter(item => item.cardType === 'word' && item.isLearned);
    } else if (currentFilter === 'all') {
        // 在“全部”视图下，不显示已掌握的单词，但显示所有介绍卡片
        currentDataSet = allVocabularyData.filter(item => item.cardType === 'intro' || !item.isLearned);
    } else {
        // 在特定意境视图下 (例如 're_back')，不显示已掌握的单词
        currentDataSet = allVocabularyData.filter(item =>
            item.type === currentFilter && (item.cardType === 'intro' || !item.isLearned)
        );
    }
}

/**
 * Fisher-Yates 洗牌算法。
 * (此函数无修改)
 * @param {Array<any>} array - 需要被洗牌的数组。
 * @returns {Array<any>} 一个新的被打乱顺序的数组。
 */
function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}

/**
 * 对当前数据集中的单词卡片进行洗牌。
 * (此函数无修改)
 * @returns {void}
 */
export function shuffleCurrentDataSet() {
    const introCard = currentDataSet.find(item => item.cardType === 'intro');
    const wordCards = currentDataSet.filter(item => item.cardType === 'word');
    const shuffledWords = shuffleArray(wordCards);

    currentDataSet = introCard ? [introCard, ...shuffledWords] : shuffledWords;
}

/**
 * 更新当前筛选器状态。
 * (此函数无修改)
 * @param {string} newFilter - 新的筛选器值。
 */
export function setCurrentFilter(newFilter) {
    currentFilter = newFilter;
}