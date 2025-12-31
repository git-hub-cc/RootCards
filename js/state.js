// =================================================================================
// 数据与状态管理模块 (State Management Module) - v10.5 (优化介绍卡片显示逻辑)
// ---------------------------------------------------------------------------------
//
// [中文注释]
// 职责:
// 1. (数据加载) 异步加载所有词汇数据文件。
// 2. (数据处理) 将原始数据处理成应用所需的格式，并动态提取类别。
// 3. (状态管理) 维护全局数据和当前筛选状态 (category, contentType, filter)。
// 4. (用户数据) 管理“已掌握”、“单词本”、“笔记”、“学习活动”和“成就”等。
// 5. (持久化) 负责 localStorage 的读写。
// 6. (动态计算) 实时计算可用的主类别和子类别，自动隐藏无数据的分类。
//
// 本次修改 (v10.5):
// - 【核心修改】在 filterAndPrepareDataSet 函数中增加逻辑，实现“介绍卡片”
//   (如前缀介绍、词汇包介绍) 仅在用户选择了对应的最小分类时才显示，
//   在“All”等宽泛视图下则隐藏，以优化浏览体验。
//
// =================================================================================

import * as NotificationManager from './modules/notificationManager.js';

// --- 模块内常量 (Module Constants) ---

// localStorage 的键名，用于持久化用户数据
const LEARNED_WORDS_KEY = 'etymologyLearnedWords';
const USER_WORDBOOKS_KEY = 'etymologyUserWordbooks';
const USER_NOTES_KEY = 'etymologyUserNotes';
const LEARNING_ACTIVITY_KEY = 'etymologyLearningActivity';
const USER_ACHIEVEMENTS_KEY = 'etymologyUserAchievements';

// 成就系统的定义
export const ACHIEVEMENT_DEFINITIONS = [
    { id: 'compiler', name: 'Word Mason (词汇石匠)', description: '连续 7 天完成至少一次学习打卡。', icon: '🧱', condition: 'streak', target: 7 },
    { id: 'refactor_master', name: 'Word Collector (单词收藏家)', description: '累计标记掌握 100 个单词。', icon: '🛠️', condition: 'count', target: 100 },
    { id: 'bug_hunter', name: 'Perfect Speller (完美拼写家)', description: '在拼写模式中一次性连续拼对 20 个单词。', icon: '🎯', condition: 'manual', target: 20 },
    { id: 'full_stack', name: 'Lexicologist (词汇学家)', description: '累计掌握 500 个单词。', icon: '📚', condition: 'count', target: 500 },
    { id: 'legacy_code', name: 'Unwavering Scholar (坚定学者)', description: '连续 30 天坚持学习。', icon: '🏛️', condition: 'streak', target: 30 }
];

// --- 导出的状态变量 (Exported State Variables) ---

export let allVocabularyData = [];    // 存储所有已加载和处理过的数据
export let currentDataSet = [];       // 当前根据筛选条件过滤后，需要渲染的数据集
export let currentFilter = 'all';     // 当前子分类筛选器状态 (e.g., 'ab_away', 'all')
export let currentCategory = 'middle';// 当前主分类筛选器状态 (e.g., 'middle', 'high')
export let currentContentType = 'all';// 当前内容类型筛选器状态 (e.g., 'pre', 'suf', 'special_learned')
export let learnedWordsSet = new Set(); // 存储所有已掌握单词的集合，便于快速查找
export let currentSearchQuery = '';   // 当前搜索框的输入值
export let userWordbooks = [];        // 用户创建的所有单词本
export let userNotes = new Map();     // 用户的单词笔记 (Map: word -> note)
export let learningActivity = {};     // 学习活动日历数据 (Object: 'YYYY-MM-DD' -> count)
export let userAchievements = {};     // 用户的成就进度

// Map 用于通过单词快速查找其完整数据，以优化计数等性能
export let wordDataMap = new Map();

// =================================================================================
// 基础数据加载与保存 (Base Data Load/Save)
// =================================================================================

/**
 * 从 localStorage 加载“已掌握”的单词列表。
 */
export function loadLearnedWords() {
    try {
        const storedWords = localStorage.getItem(LEARNED_WORDS_KEY);
        if (storedWords) {
            const wordsArray = JSON.parse(storedWords);
            if (Array.isArray(wordsArray)) learnedWordsSet = new Set(wordsArray);
        }
    } catch (error) {
        console.error('无法从 localStorage 加载学习进度:', error);
        learnedWordsSet = new Set(); // 出错时重置，保证鲁棒性
    }
}

/**
 * 将当前“已掌握”的单词列表保存到 localStorage。
 */
function saveLearnedWords() {
    try {
        localStorage.setItem(LEARNED_WORDS_KEY, JSON.stringify(Array.from(learnedWordsSet)));
        checkCountAchievements(); // 每次保存时检查计数相关的成就
    } catch (error) {
        console.error('无法保存学习进度到 localStorage:', error);
    }
}

/**
 * 从 localStorage 加载用户的笔记。
 */
export function loadUserNotes() {
    try {
        const storedNotes = localStorage.getItem(USER_NOTES_KEY);
        if (storedNotes) userNotes = new Map(Object.entries(JSON.parse(storedNotes)));
    } catch (error) {
        console.error('无法从 localStorage 加载用户笔记:', error);
        userNotes = new Map();
    }
}

/**
 * 将用户笔记保存到 localStorage。
 */
function saveUserNotes() {
    try {
        localStorage.setItem(USER_NOTES_KEY, JSON.stringify(Object.fromEntries(userNotes)));
    } catch (error) {
        console.error('无法保存用户笔记到 localStorage:', error);
    }
}

/**
 * 获取指定单词的用户笔记。
 * @param {string} word - 单词。
 * @returns {string} 笔记内容，如果没有则返回空字符串。
 */
export function getUserNote(word) {
    return userNotes.get(word?.toLowerCase()) || '';
}

/**
 * 保存或删除指定单词的用户笔记。
 * @param {string} word - 单词。
 * @param {string} text - 笔记内容。如果为空，则删除该笔记。
 */
export function saveUserNote(word, text) {
    if (!word) return;
    const key = word.toLowerCase();
    const trimmedText = text?.trim();
    if (trimmedText) {
        userNotes.set(key, trimmedText);
    } else {
        userNotes.delete(key);
    }
    saveUserNotes();
}

/**
 * 从 localStorage 加载用户单词本。
 */
export function loadUserWordbooks() {
    try {
        const storedWordbooks = localStorage.getItem(USER_WORDBOOKS_KEY);
        if (storedWordbooks) {
            const parsedData = JSON.parse(storedWordbooks);
            // 鲁棒性检查，确保数据结构正确
            if (Array.isArray(parsedData) && parsedData.every(wb => typeof wb.name === 'string' && Array.isArray(wb.words))) {
                userWordbooks = parsedData;
            }
        }
    } catch (error) {
        console.error('无法从 localStorage 加载用户单词本:', error);
        userWordbooks = [];
    }
}

/**
 * 将用户单词本保存到 localStorage。
 */
function saveUserWordbooks() {
    try {
        localStorage.setItem(USER_WORDBOOKS_KEY, JSON.stringify(userWordbooks));
    } catch (error) {
        console.error('无法保存用户单词本到 localStorage:', error);
    }
}

/**
 * 根据名称获取一个单词本。
 * @param {string} name - 单词本名称。
 * @returns {object|null} 找到的单词本对象，或 null。
 */
export function getWordbook(name) {
    return userWordbooks.find(wb => wb.name === name) || null;
}

/**
 * 删除一个单词本。
 * @param {string} name - 要删除的单词本名称。
 * @returns {boolean} 是否成功删除。
 */
export function deleteWordbook(name) {
    const initialLength = userWordbooks.length;
    userWordbooks = userWordbooks.filter(wb => wb.name !== name);
    if (userWordbooks.length !== initialLength) {
        saveUserWordbooks();
        return true;
    }
    return false;
}

/**
 * 添加或更新一个单词本。
 * @param {string|null} oldName - 旧名称（如果是编辑模式），或 null（如果是创建模式）。
 * @param {string} newName - 新名称。
 * @param {string[]} words - 单词列表。
 * @returns {boolean} 是否操作成功。
 */
export function addOrUpdateWordbook(oldName, newName, words) {
    if (!newName || !Array.isArray(words)) return false;
    // 检查新名称是否已存在（且不是正在编辑的那个）
    if (userWordbooks.some(wb => wb.name === newName && wb.name !== oldName)) {
        throw new Error(`单词本名称 "${newName}" 已存在。`);
    }
    const index = oldName ? userWordbooks.findIndex(wb => wb.name === oldName) : -1;
    if (index > -1) { // 更新模式
        userWordbooks[index] = { name: newName, words };
    } else { // 创建模式
        userWordbooks.push({ name: newName, words });
    }
    saveUserWordbooks();
    return true;
}

/**
 * 切换一个单词的“已掌握”状态。
 * @param {object} wordData - 单词数据对象。
 */
export function toggleLearnedStatus(wordData) {
    wordData.isLearned = !wordData.isLearned;
    if (wordData.isLearned) {
        learnedWordsSet.add(wordData.word.toLowerCase());
    } else {
        learnedWordsSet.delete(wordData.word.toLowerCase());
    }
    saveLearnedWords();
}

/**
 * 获取排序后的“已掌握”单词数组。
 * @returns {string[]}
 */
export function getLearnedWordsArray() {
    return Array.from(learnedWordsSet).sort();
}

/**
 * 从一个数组导入“已掌握”单词。
 * @param {string[]} wordsArray - 要导入的单词数组。
 * @returns {number} 新增的单词数量。
 */
export function importLearnedWords(wordsArray) {
    if (!Array.isArray(wordsArray)) return 0;
    const originalSize = learnedWordsSet.size;
    wordsArray.forEach(word => {
        if (typeof word === 'string' && word.trim()) {
            learnedWordsSet.add(word.trim().toLowerCase());
        }
    });
    // 更新内存中所有单词的 isLearned 状态
    allVocabularyData.forEach(item => {
        if (item.cardType === 'word') {
            item.isLearned = learnedWordsSet.has(item.word.toLowerCase());
        }
    });
    saveLearnedWords();
    return learnedWordsSet.size - originalSize;
}

/**
 * 清空所有“已掌握”的单词记录。
 */
export function clearLearnedWords() {
    learnedWordsSet.clear();
    allVocabularyData.forEach(item => {
        if (item.cardType === 'word') {
            item.isLearned = false;
        }
    });
    saveLearnedWords();
}

/**
 * 计算已掌握的、非词根类型的单词数量。
 * @returns {number} 计数值。
 */
export function getLearnedWordCount() {
    let count = 0;
    // 遍历 Set 中的每个已掌握单词
    for (const word of learnedWordsSet) {
        // 使用预先构建的 Map 快速查找该单词的详细数据
        const data = wordDataMap.get(word.toLowerCase());
        // 如果能找到，说明它是一个有效的单词（而不是其他可能混入的数据），计数加一
        if (data) {
            count++;
        }
    }
    return count;
}


// =================================================================================
// 热力图与成就系统 (Heatmap & Achievement System)
// =================================================================================

export function loadLearningActivity() {
    try {
        learningActivity = JSON.parse(localStorage.getItem(LEARNING_ACTIVITY_KEY)) || {};
    } catch (e) {
        learningActivity = {};
    }
}

export function logLearningActivity(date = new Date(), increment = 1) {
    try {
        const dateKey = date.toISOString().split('T')[0]; // 格式化为 'YYYY-MM-DD'
        learningActivity[dateKey] = (learningActivity[dateKey] || 0) + increment;
        if (learningActivity[dateKey] < 0) learningActivity[dateKey] = 0; // 防止负数
        localStorage.setItem(LEARNING_ACTIVITY_KEY, JSON.stringify(learningActivity));
        checkStreakAchievements(); // 每次记录时检查连续打卡成就
    } catch (e) {
        console.error('保存学习活动失败:', e);
    }
}

export function getLearningActivity() {
    return learningActivity;
}

export function loadAchievements() {
    try {
        userAchievements = JSON.parse(localStorage.getItem(USER_ACHIEVEMENTS_KEY)) || {};
        // 确保所有成就都有一个初始的空状态，防止后续逻辑出错
        ACHIEVEMENT_DEFINITIONS.forEach(def => {
            if (!userAchievements[def.id]) {
                userAchievements[def.id] = { unlocked: false, progress: 0, date: null };
            }
        });
    } catch (e) {
        userAchievements = {};
    }
}

export function unlockAchievement(id) {
    const ach = userAchievements[id];
    const def = ACHIEVEMENT_DEFINITIONS.find(d => d.id === id);
    if (ach && !ach.unlocked && def) {
        ach.unlocked = true;
        ach.date = new Date().toISOString();
        ach.progress = def.target;
        localStorage.setItem(USER_ACHIEVEMENTS_KEY, JSON.stringify(userAchievements));
        NotificationManager.show({ type: 'success', message: `🏆 解锁成就：${def.name}`, duration: 5000 });
    }
}

function checkCountAchievements() {
    const count = getLearnedWordCount();
    ACHIEVEMENT_DEFINITIONS.filter(d => d.condition === 'count').forEach(def => {
        const userAch = userAchievements[def.id];
        if (userAch && !userAch.unlocked) {
            userAch.progress = count;
            if (count >= def.target) {
                unlockAchievement(def.id);
            }
        }
    });
    localStorage.setItem(USER_ACHIEVEMENTS_KEY, JSON.stringify(userAchievements));
}

function checkStreakAchievements() {
    const dates = Object.keys(learningActivity).sort();
    if (dates.length === 0) return;
    let streak = 0;
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);
    // 如果今天没打卡，从昨天开始算
    if (!learningActivity[currentDate.toISOString().split('T')[0]]) {
        currentDate.setDate(currentDate.getDate() - 1);
    }
    // 循环向前追溯
    while (learningActivity[currentDate.toISOString().split('T')[0]] > 0) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
    }
    ACHIEVEMENT_DEFINITIONS.filter(d => d.condition === 'streak').forEach(def => {
        const userAch = userAchievements[def.id];
        if (userAch && !userAch.unlocked && streak > userAch.progress) {
            userAch.progress = streak;
            if (streak >= def.target) {
                unlockAchievement(def.id);
            }
        }
    });
    localStorage.setItem(USER_ACHIEVEMENTS_KEY, JSON.stringify(userAchievements));
}

export function updateTransientAchievement(id, currentVal) {
    const userAch = userAchievements[id];
    const def = ACHIEVEMENT_DEFINITIONS.find(d => d.id === id);
    if (userAch && !userAch.unlocked && def) {
        if (currentVal > userAch.progress) {
            userAch.progress = currentVal;
            localStorage.setItem(USER_ACHIEVEMENTS_KEY, JSON.stringify(userAchievements));
        }
        if (currentVal >= def.target) {
            unlockAchievement(id);
        }
    }
}

// =================================================================================
// 核心数据处理与筛选 (Core Data Processing & Filtering)
// =================================================================================

function getCategoryFromFilePath(filePath) {
    const parts = filePath.split('/');
    return parts.length > 1 ? parts[1] : 'unknown';
}

function getContentTypeFromFilePath(filePath) {
    if (filePath.includes('/pre/')) return 'pre';
    if (filePath.includes('/suf/')) return 'suf';
    if (filePath.includes('/root/')) return 'root';
    return 'category';
}

export async function loadAndProcessData(onProgress) {
    // 初始化时加载所有用户相关的本地数据
    loadLearningActivity();
    loadAchievements();

    // 鲁棒性检查：确保数据清单文件已正确加载
    if (typeof DATA_FILES === 'undefined' || !Array.isArray(DATA_FILES) || DATA_FILES.length === 0) {
        throw new Error("数据清单 'data/manifest.js' 未找到、格式错误或为空。");
    }

    allVocabularyData = [];
    const totalFiles = DATA_FILES.length;
    let loadedFiles = 0;
    if (typeof onProgress === 'function') onProgress(loadedFiles, totalFiles);

    // 并行加载所有 JSON 数据文件
    const promises = DATA_FILES.map(async (file) => {
        try {
            const response = await fetch(file);
            if (!response.ok) throw new Error(`网络错误 (状态 ${response.status})，无法加载文件: ${file}`);
            const dataFile = await response.json();

            // 鲁棒性检查：确保文件格式基本正确
            if (!dataFile.prefix || !Array.isArray(dataFile.meanings)) {
                console.warn(`文件 ${file} 格式不正确，已跳过。`);
                return null;
            }

            // 从文件路径中提取元数据
            const category = getCategoryFromFilePath(file);
            const contentType = getContentTypeFromFilePath(file);
            const affixType = dataFile.affixType || 'prefix';

            const processedItems = [];
            // 遍历文件中的每个 meaningGroup (e.g., in- 表示否定，in- 表示进入)
            for (const meaningGroup of dataFile.meanings) {
                // 定义一个通用的处理函数，为每个卡片数据添加公共属性
                const processItem = (item, cardType) => ({
                    ...item,
                    cardType, // 'word' 或 'intro'
                    type: meaningGroup.meaningId, // 唯一标识 (e.g., 'in_negate')
                    displayName: meaningGroup.displayName,
                    prefix: dataFile.prefix,
                    affixType: affixType,
                    themeColor: meaningGroup.themeColor,
                    category: category,
                    contentType: contentType,
                    isLearned: cardType === 'word' ? learnedWordsSet.has(item.word.toLowerCase()) : false,
                    ...(cardType === 'intro' && { visual: meaningGroup.prefixVisual }),
                    ...(cardType === 'word' && { prefixVisual: meaningGroup.prefixVisual || '' })
                });

                // 处理介绍卡片
                if (meaningGroup.prefixIntro) {
                    processedItems.push(processItem(meaningGroup.prefixIntro, 'intro'));
                }
                // 处理单词卡片
                if (Array.isArray(meaningGroup.words)) {
                    processedItems.push(...meaningGroup.words.map(word => processItem(word, 'word')));
                }
            }
            return processedItems;

        } catch (fileError) {
            console.error(`加载或处理文件 ${file} 时出错:`, fileError);
            return null; // 即使单个文件失败，也不中断整个加载过程
        } finally {
            loadedFiles++;
            if (typeof onProgress === 'function') onProgress(loadedFiles, totalFiles);
        }
    });

    // 等待所有文件加载和处理完成
    const results = await Promise.allSettled(promises);
    results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
            allVocabularyData.push(...result.value);
        }
    });

    // 构建单词到数据的快速查找 Map
    wordDataMap.clear();
    allVocabularyData.forEach(item => {
        if (item.cardType === 'word' && item.word) {
            wordDataMap.set(item.word.toLowerCase(), item);
        }
    });

    return { categories: [] };
}

export function getAvailableMainCategories() {
    let baseData = allVocabularyData;
    let isLearnedMode = false;

    if (currentContentType === 'all') {
        // 'All Types' 模式：不过滤任何单词
    } else if (currentContentType === 'special_learned') {
        isLearnedMode = true;
    } else if (currentContentType.startsWith('wb_')) {
        const wbName = currentContentType.substring(3);
        const userWordbook = userWordbooks.find(wb => wb.name === wbName);
        if (userWordbook) {
            const wbSet = new Set(userWordbook.words.map(w => w.toLowerCase()));
            baseData = baseData.filter(item => item.cardType === 'word' && wbSet.has(item.word.toLowerCase()));
        }
        isLearnedMode = false;
    } else {
        baseData = baseData.filter(item => item.contentType === currentContentType);
        isLearnedMode = false;
    }

    const validWords = baseData.filter(item => {
        if (item.cardType !== 'word') return false;
        if (currentContentType === 'all') return true; // 'All Types' 模式下，所有单词都有效
        return item.isLearned === isLearnedMode;
    });

    const availableCategories = new Set(validWords.map(item => item.category).filter(Boolean));

    const categoryOrder = ['middle', 'high', 'CET-4', 'CET-6'];
    return Array.from(availableCategories).sort((a, b) => {
        const indexA = categoryOrder.indexOf(a);
        const indexB = categoryOrder.indexOf(b);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return a.localeCompare(b);
    });
}

export function getAvailableSubCategories() {
    let filteredData = (currentCategory === 'all') ?
        allVocabularyData :
        allVocabularyData.filter(item => item.category === currentCategory);

    let isLearnedMode = false;

    if (currentContentType === 'all') {
        // 'All Types' 模式：不过滤
    } else if (currentContentType === 'special_learned') {
        isLearnedMode = true;
    } else if (currentContentType.startsWith('wb_')) {
        const wbName = currentContentType.substring(3);
        const userWordbook = userWordbooks.find(wb => wb.name === wbName);
        if (userWordbook) {
            const wbSet = new Set(userWordbook.words.map(w => w.toLowerCase()));
            filteredData = filteredData.filter(item => item.cardType === 'word' && wbSet.has(item.word.toLowerCase()));
        } else {
            filteredData = [];
        }
        isLearnedMode = false;
    } else {
        filteredData = filteredData.filter(item => item.contentType === currentContentType);
        isLearnedMode = false;
    }

    const categoryMap = new Map();
    const validMeaningIds = new Set();

    filteredData.forEach(item => {
        if (!categoryMap.has(item.type)) {
            const originalDisplayName = item.displayName;
            let englishDisplayName = (item.contentType === 'category' && originalDisplayName.match(/\(([^)]+)\)/))
                ? originalDisplayName.match(/\(([^)]+)\)/)[1]
                : originalDisplayName;
            categoryMap.set(item.type, {
                filterType: 'pre-defined',
                meaningId: item.type,
                displayName: originalDisplayName,
                englishDisplayName: englishDisplayName,
                prefix: item.prefix,
                themeColor: item.themeColor,
                contentType: item.contentType
            });
        }
        if (item.cardType === 'word' && (currentContentType === 'all' || item.isLearned === isLearnedMode)) {
            validMeaningIds.add(item.type);
        }
    });

    return Array.from(categoryMap.values()).filter(cat => validMeaningIds.has(cat.meaningId));
}

/**
 * 主过滤函数，根据当前所有状态筛选出最终要显示的数据集。
 */
export function filterAndPrepareDataSet() {
    // 步骤 1: 根据主分类 (Category) 过滤
    let filteredData = (currentCategory === 'all')
        ? allVocabularyData
        : allVocabularyData.filter(item => item.category === currentCategory);

    // 步骤 2: 根据内容类型 (Content Type) 过滤
    if (currentContentType === 'all') {
        // 'All Types' 模式: 不做任何过滤，保留所有单词（包括已掌握）和介绍卡片
    } else if (currentContentType === 'special_learned') {
        // '已掌握' 模式: 只显示已掌握的单词
        filteredData = filteredData.filter(item => item.cardType === 'word' && item.isLearned);
    } else if (currentContentType.startsWith('wb_')) {
        // '单词本' 模式: 筛选出属于该单词本且未掌握的单词
        const wbName = currentContentType.substring(3);
        const wordbook = getWordbook(wbName);
        if (wordbook) {
            const wbSet = new Set(wordbook.words.map(w => w.toLowerCase()));
            filteredData = filteredData.filter(item =>
                item.cardType === 'word' &&
                wbSet.has(item.word.toLowerCase()) &&
                !item.isLearned
            );
        } else {
            filteredData = []; // 如果单词本不存在，则结果为空
        }
    } else {
        // '前缀/后缀/词根/通用' 等学习模式:
        // a. 筛选出对应的内容类型
        filteredData = filteredData.filter(item => item.contentType === currentContentType);
        // b. 只保留介绍卡片和未掌握的单词
        filteredData = filteredData.filter(item => item.cardType === 'intro' || !item.isLearned);
    }

    // 步骤 3: 根据子分类 (Sub-Category) 过滤
    if (currentFilter !== 'all') {
        filteredData = filteredData.filter(item => item.type === currentFilter);
    }

    // 步骤 4: 根据搜索词过滤 (在前面筛选结果的基础上进行)
    if (currentSearchQuery) {
        const query = currentSearchQuery;
        const matchingWords = filteredData.filter(item =>
            item.cardType === 'word' && item.word.toLowerCase().includes(query)
        );
        const relevantTypes = new Set(matchingWords.map(item => item.type));
        const relevantIntros = filteredData.filter(item =>
            item.cardType === 'intro' && relevantTypes.has(item.type)
        );
        currentDataSet = [...relevantIntros, ...matchingWords];
    } else {
        currentDataSet = filteredData;
    }

    // --- 【核心修改】 ---
    // 步骤 5: 最终处理，决定是否显示介绍卡片
    // 规则：当用户没有搜索，并且子分类选择的是“All”时，隐藏所有介绍卡片。
    // 这能让用户在浏览宽泛列表时，只看到单词卡，体验更纯粹。
    if (!currentSearchQuery && currentFilter === 'all') {
        currentDataSet = currentDataSet.filter(item => item.cardType !== 'intro');
    }
}

function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}

export function shuffleCurrentDataSet() {
    const introCard = currentDataSet.find(item => item.cardType === 'intro');
    const wordCards = currentDataSet.filter(item => item.cardType === 'word');
    const shuffledWords = shuffleArray(wordCards);
    currentDataSet = introCard ? [introCard, ...shuffledWords] : shuffledWords;
}

// --- 状态设置函数 (State Setters) ---
export function setCurrentFilter(newFilter) { currentFilter = newFilter; }
export function setCurrentCategory(newCategory) { currentCategory = newCategory; }
export function setCurrentContentType(newType) { currentContentType = newType; }
export function setSearchQuery(query) { currentSearchQuery = query.trim().toLowerCase(); }

/**
 * 为打字模式生成带掩码的例句。
 * @param {string} sentence - 原始例句。
 * @param {string} targetWord - 需要掩盖的目标单词。
 * @returns {string} - 处理后的 HTML 字符串。
 */
export function getMaskedSentence(sentence, targetWord) {
    if (!sentence || !targetWord) return '';
    const regex = new RegExp(`\\b${targetWord}[a-z]*\\b`, 'gi');
    return sentence.replace(regex, '<span class="masked-word">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>');
}