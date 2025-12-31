// =================================================================================
// 数据与状态管理模块 (State Management Module) - v10.4 (All Types 显示所有单词)
// ---------------------------------------------------------------------------------
// 职责:
// 1. (数据加载) 异步加载所有词汇数据文件。
// 2. (数据处理) 将原始数据处理成应用所需的格式，并动态提取类别。
// 3. (状态管理) 维护全局数据和当前筛选状态 (category, contentType, filter)。
// 4. (用户数据) 管理“已掌握”、“单词本”、“笔记”、“学习活动”和“成就”等。
// 5. (持久化) 负责 localStorage 的读写。
// 6. (动态计算) 实时计算可用的主类别和子类别，自动隐藏无数据的分类。
//
// 修改记录:
// - 修改了数据筛选逻辑：当 Content Type 为 'all' (All Types) 时，不再过滤“已掌握”的单词，
//   而是显示所有单词，实现类似词典的浏览模式。
// - 针对特定类型 (如 Prefix, Suffix) 仍保持仅显示“未掌握”单词的逻辑，维持学习模式体验。
// =================================================================================

import * as NotificationManager from './modules/notificationManager.js';

// --- 模块内常量 ---
const LEARNED_WORDS_KEY = 'etymologyLearnedWords';
const USER_WORDBOOKS_KEY = 'etymologyUserWordbooks';
const USER_NOTES_KEY = 'etymologyUserNotes';
const LEARNING_ACTIVITY_KEY = 'etymologyLearningActivity';
const USER_ACHIEVEMENTS_KEY = 'etymologyUserAchievements';

export const ACHIEVEMENT_DEFINITIONS = [
    { id: 'compiler', name: 'Word Mason (词汇石匠)', description: '连续 7 天完成至少一次学习打卡。', icon: '🧱', condition: 'streak', target: 7 },
    { id: 'refactor_master', name: 'Word Collector (单词收藏家)', description: '累计标记掌握 100 个单词。', icon: '🛠️', condition: 'count', target: 100 },
    { id: 'bug_hunter', name: 'Perfect Speller (完美拼写家)', description: '在拼写模式中一次性连续拼对 20 个单词。', icon: '🎯', condition: 'manual', target: 20 },
    { id: 'full_stack', name: 'Lexicologist (词汇学家)', description: '累计掌握 500 个单词。', icon: '📚', condition: 'count', target: 500 },
    { id: 'legacy_code', name: 'Unwavering Scholar (坚定学者)', description: '连续 30 天坚持学习。', icon: '🏛️', condition: 'streak', target: 30 }
];

// --- 导出的状态变量 ---
export let allVocabularyData = [];
export let currentDataSet = [];
export let currentFilter = 'all';
export let currentCategory = 'middle';
export let currentContentType = 'all';
export let learnedWordsSet = new Set();
export let currentSearchQuery = '';
export let userWordbooks = [];
export let userNotes = new Map();
export let learningActivity = {};
export let userAchievements = {};

// Map 用于快速查找单词数据，以优化计数性能
export let wordDataMap = new Map();

// =================================================================================
// 基础数据加载与保存
// =================================================================================

export function loadLearnedWords() {
    try {
        const storedWords = localStorage.getItem(LEARNED_WORDS_KEY);
        if (storedWords) {
            const wordsArray = JSON.parse(storedWords);
            if (Array.isArray(wordsArray)) learnedWordsSet = new Set(wordsArray);
        }
    } catch (error) {
        console.error('无法从 localStorage 加载学习进度:', error);
        learnedWordsSet = new Set();
    }
}

function saveLearnedWords() {
    try {
        localStorage.setItem(LEARNED_WORDS_KEY, JSON.stringify(Array.from(learnedWordsSet)));
        checkCountAchievements();
    } catch (error) {
        console.error('无法保存学习进度到 localStorage:', error);
    }
}

export function loadUserNotes() {
    try {
        const storedNotes = localStorage.getItem(USER_NOTES_KEY);
        if (storedNotes) userNotes = new Map(Object.entries(JSON.parse(storedNotes)));
    } catch (error) {
        console.error('无法从 localStorage 加载用户笔记:', error);
        userNotes = new Map();
    }
}

function saveUserNotes() {
    try {
        localStorage.setItem(USER_NOTES_KEY, JSON.stringify(Object.fromEntries(userNotes)));
    } catch (error) {
        console.error('无法保存用户笔记到 localStorage:', error);
    }
}

export function getUserNote(word) {
    return userNotes.get(word?.toLowerCase()) || '';
}

export function saveUserNote(word, text) {
    if (!word) return;
    const key = word.toLowerCase();
    const trimmedText = text?.trim();
    if (trimmedText) userNotes.set(key, trimmedText);
    else userNotes.delete(key);
    saveUserNotes();
}

export function loadUserWordbooks() {
    try {
        const storedWordbooks = localStorage.getItem(USER_WORDBOOKS_KEY);
        if (storedWordbooks) {
            const parsedData = JSON.parse(storedWordbooks);
            if (Array.isArray(parsedData) && parsedData.every(wb => typeof wb.name === 'string' && Array.isArray(wb.words))) {
                userWordbooks = parsedData;
            }
        }
    } catch (error) {
        console.error('无法从 localStorage 加载用户单词本:', error);
        userWordbooks = [];
    }
}

function saveUserWordbooks() {
    try {
        localStorage.setItem(USER_WORDBOOKS_KEY, JSON.stringify(userWordbooks));
    } catch (error) {
        console.error('无法保存用户单词本到 localStorage:', error);
    }
}

export function getWordbook(name) {
    return userWordbooks.find(wb => wb.name === name) || null;
}

export function deleteWordbook(name) {
    const initialLength = userWordbooks.length;
    userWordbooks = userWordbooks.filter(wb => wb.name !== name);
    if (userWordbooks.length !== initialLength) {
        saveUserWordbooks();
        return true;
    }
    return false;
}

export function addOrUpdateWordbook(oldName, newName, words) {
    if (!newName || !Array.isArray(words)) return false;
    if (userWordbooks.some(wb => wb.name === newName && wb.name !== oldName)) {
        throw new Error(`单词本名称 "${newName}" 已存在。`);
    }
    const index = oldName ? userWordbooks.findIndex(wb => wb.name === oldName) : -1;
    if (index > -1) {
        userWordbooks[index] = { name: newName, words };
    } else {
        userWordbooks.push({ name: newName, words });
    }
    saveUserWordbooks();
    return true;
}

export function toggleLearnedStatus(wordData) {
    wordData.isLearned = !wordData.isLearned;
    wordData.isLearned ? learnedWordsSet.add(wordData.word) : learnedWordsSet.delete(wordData.word);
    saveLearnedWords();
}

export function getLearnedWordsArray() {
    return Array.from(learnedWordsSet).sort();
}

export function importLearnedWords(wordsArray) {
    if (!Array.isArray(wordsArray)) return 0;
    const originalSize = learnedWordsSet.size;
    wordsArray.forEach(word => {
        if (typeof word === 'string' && word.trim()) learnedWordsSet.add(word.trim().toLowerCase());
    });
    allVocabularyData.forEach(item => {
        if (item.cardType === 'word') item.isLearned = learnedWordsSet.has(item.word.toLowerCase());
    });
    saveLearnedWords();
    return learnedWordsSet.size - originalSize;
}

export function clearLearnedWords() {
    learnedWordsSet.clear();
    allVocabularyData.forEach(item => {
        if (item.cardType === 'word') item.isLearned = false;
    });
    saveLearnedWords();
}

/**
 * 计算已掌握的、非词根类型的单词数量。
 * @returns {number} - 计数值。
 */
export function getLearnedWordCount() {
    let count = 0;
    // 遍历所有已掌握的单词
    for (const word of learnedWordsSet) {
        // 使用 Map 快速查找单词的详细数据
        const data = wordDataMap.get(word.toLowerCase());
        // 如果找到了数据，则计数加一
        if (data) {
            count++;
        }
    }
    return count;
}


// =================================================================================
// 热力图与成就系统
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
        const dateKey = date.toISOString().split('T')[0];
        learningActivity[dateKey] = (learningActivity[dateKey] || 0) + increment;
        if (learningActivity[dateKey] < 0) learningActivity[dateKey] = 0;
        localStorage.setItem(LEARNING_ACTIVITY_KEY, JSON.stringify(learningActivity));
        checkStreakAchievements();
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
    const count = learnedWordsSet.size;
    ACHIEVEMENT_DEFINITIONS.filter(d => d.condition === 'count').forEach(def => {
        const userAch = userAchievements[def.id];
        if (userAch && !userAch.unlocked) {
            userAch.progress = count;
            if (count >= def.target) unlockAchievement(def.id);
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
    if (!learningActivity[currentDate.toISOString().split('T')[0]]) {
        currentDate.setDate(currentDate.getDate() - 1);
    }
    while (learningActivity[currentDate.toISOString().split('T')[0]] > 0) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
    }
    ACHIEVEMENT_DEFINITIONS.filter(d => d.condition === 'streak').forEach(def => {
        const userAch = userAchievements[def.id];
        if (userAch && !userAch.unlocked && streak > userAch.progress) {
            userAch.progress = streak;
            if (streak >= def.target) unlockAchievement(def.id);
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
        if (currentVal >= def.target) unlockAchievement(id);
    }
}

// =================================================================================
// 核心数据处理与筛选
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
    loadLearningActivity();
    loadAchievements();

    if (typeof DATA_FILES === 'undefined' || !Array.isArray(DATA_FILES) || DATA_FILES.length === 0) {
        throw new Error("数据清单 'data/manifest.js' 未找到、格式错误或为空。");
    }

    allVocabularyData = [];
    const totalFiles = DATA_FILES.length;
    let loadedFiles = 0;
    if (typeof onProgress === 'function') onProgress(loadedFiles, totalFiles);

    const promises = DATA_FILES.map(async (file) => {
        try {
            const response = await fetch(file);
            if (!response.ok) throw new Error(`网络错误 (状态 ${response.status})，无法加载文件: ${file}`);
            const dataFile = await response.json();

            if (!dataFile.prefix || !Array.isArray(dataFile.meanings)) {
                console.warn(`文件 ${file} 格式不正确，已跳过。`);
                return null;
            }

            const category = getCategoryFromFilePath(file);
            const contentType = getContentTypeFromFilePath(file);
            const affixType = dataFile.affixType || 'prefix';

            const processedItems = [];
            for (const meaningGroup of dataFile.meanings) {
                const processItem = (item, cardType) => ({
                    ...item,
                    cardType,
                    type: meaningGroup.meaningId,
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

                if (meaningGroup.prefixIntro) {
                    processedItems.push(processItem(meaningGroup.prefixIntro, 'intro'));
                }
                if (Array.isArray(meaningGroup.words)) {
                    processedItems.push(...meaningGroup.words.map(word => processItem(word, 'word')));
                }
            }
            return processedItems;

        } catch (fileError) {
            console.error(`加载或处理文件 ${file} 时出错:`, fileError);
            return null;
        } finally {
            loadedFiles++;
            if (typeof onProgress === 'function') onProgress(loadedFiles, totalFiles);
        }
    });

    const results = await Promise.allSettled(promises);
    results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
            allVocabularyData.push(...result.value);
        }
    });

    wordDataMap.clear();
    allVocabularyData.forEach(item => {
        if (item.cardType === 'word' && item.word) {
            wordDataMap.set(item.word.toLowerCase(), item);
        }
    });

    return { categories: [] };
}

/**
 * 获取当前上下文下可用的主类别 (Main Categories)。
 * 逻辑：
 * 1. 如果 content type 是 'all'，则显示所有内容（无论是否已掌握）。
 * 2. 如果 content type 是特定的（如前缀/后缀），则默认只显示未掌握的（学习模式）。
 * 3. 已掌握和单词本模式保持原样。
 */
export function getAvailableMainCategories() {
    let baseData = allVocabularyData;
    let isLearnedMode = false;

    // 1. 处理 Content Type 过滤逻辑
    if (currentContentType === 'all') {
        // 默认模式：显示所有内容（包括已掌握），模拟词典/浏览模式
        isLearnedMode = false; // 此标志仅用于后续逻辑参考
    } else if (currentContentType === 'special_learned') {
        // 已掌握模式：所有已掌握的单词
        isLearnedMode = true;
    } else if (currentContentType.startsWith('wb_')) {
        // 单词本模式：未掌握的单词 + 属于单词本
        const wbName = currentContentType.substring(3);
        const userWordbook = userWordbooks.find(wb => wb.name === wbName);
        if (userWordbook) {
            const wbSet = new Set(userWordbook.words.map(w => w.toLowerCase()));
            baseData = baseData.filter(item => item.cardType === 'word' && wbSet.has(item.word.toLowerCase()));
        }
        isLearnedMode = false;
    } else {
        // 标准前缀/后缀模式：属于特定类型 + 默认只显示未掌握
        baseData = baseData.filter(item => item.contentType === currentContentType);
        isLearnedMode = false;
    }

    // 2. 过滤出有效的单词
    const validWords = baseData.filter(item => {
        if (item.cardType !== 'word') return false;

        // 【核心修改】如果是 'All Types' 模式，不检查掌握状态，全部通过
        if (currentContentType === 'all') {
            return true;
        }

        // 其他模式（如单词本、前缀学习、已掌握），检查掌握状态
        return item.isLearned === isLearnedMode;
    });

    // 3. 收集这些单词涉及的 categories
    const availableCategories = new Set();
    validWords.forEach(item => {
        if (item.category && item.category !== 'unknown') {
            availableCategories.add(item.category);
        }
    });

    // 4. 排序
    const categoryOrder = ['middle', 'high', 'CET-4', 'CET-6'];
    return Array.from(availableCategories).sort((a, b) => {
        const indexA = categoryOrder.indexOf(a);
        const indexB = categoryOrder.indexOf(b);
        if (indexA === -1 && indexB === -1) return a.localeCompare(b);
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
    });
}

/**
 * 获取可用的子类别（前缀/后缀等）。
 * 逻辑：基于当前选定的主类别（currentCategory）和内容类型（currentContentType）
 * 动态计算出剩余的有效单词，然后提取它们所属的 meaningId。
 */
export function getAvailableSubCategories() {
    let filteredData;

    // 1. 基于主类别过滤
    if (currentCategory === 'all') {
        filteredData = allVocabularyData;
    } else {
        filteredData = allVocabularyData.filter(item => item.category === currentCategory);
    }

    // 2. 基于内容类型进一步过滤数据池
    let isLearnedMode = false;

    if (currentContentType === 'all') {
        // 【核心修改】All Types 模式：不做任何额外过滤，保留所有数据
        // isLearnedMode 保持默认 false，但在下面的遍历中会有特殊处理
    } else if (currentContentType === 'special_learned') {
        isLearnedMode = true;
    } else if (currentContentType.startsWith('wb_')) {
        const wbName = currentContentType.substring(3);
        const userWordbook = userWordbooks.find(wb => wb.name === wbName);
        if (userWordbook) {
            const wbSet = new Set(userWordbook.words.map(w => w.toLowerCase()));
            filteredData = filteredData.filter(item => item.cardType === 'word' && wbSet.has(item.word.toLowerCase()));
        }
        isLearnedMode = false;
    } else {
        // 标准前缀/后缀模式：只保留对应类型
        filteredData = filteredData.filter(item => item.contentType === currentContentType);
        isLearnedMode = false;
    }

    // 3. 准备统计
    const categoryMap = new Map();
    const validMeaningIds = new Set();

    // 4. 遍历数据，建立映射并检查有效性
    filteredData.forEach(item => {
        // 记录子类别元数据
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

        // 检查有效性
        if (item.cardType === 'word') {
            // 【核心修改】如果是 'All Types' 模式，接受所有状态的单词
            if (currentContentType === 'all') {
                validMeaningIds.add(item.type);
            }
            // 否则（学习模式、单词本模式），必须符合当前的掌握状态
            else if (item.isLearned === isLearnedMode) {
                validMeaningIds.add(item.type);
            }
        }
    });

    // 5. 返回有效的预定义子类别
    return Array.from(categoryMap.values())
        .filter(cat => validMeaningIds.has(cat.meaningId));
}

/**
 * 主过滤逻辑
 * 根据 currentCategory, currentContentType 和 currentFilter 筛选最终显示的数据集。
 */
export function filterAndPrepareDataSet() {
    // 1. 第一层过滤：Category (Middle, High, CET-4...)
    let filteredData;
    if (currentCategory === 'all') {
        filteredData = allVocabularyData;
    } else {
        filteredData = allVocabularyData.filter(item => item.category === currentCategory);
    }

    // 2. 第二层过滤：Content Type (All, Learned, Wordbook, Pre, Suf...)
    let isLearnedMode = false;

    if (currentContentType === 'all') {
        // 【核心修改】模式：浏览所有 (Browse All)
        // 不进行任何 Content Type 过滤，也不过滤 isLearned。
        // 这允许用户查看所有单词，包括已掌握的。
    } else if (currentContentType === 'special_learned') {
        // 模式：已掌握
        filteredData = filteredData.filter(item => item.cardType === 'word' && item.isLearned);
        isLearnedMode = true;
    } else if (currentContentType.startsWith('wb_')) {
        // 模式：单词本交集 + 未掌握
        const wbName = currentContentType.substring(3);
        const userWordbook = userWordbooks.find(wb => wb.name === wbName);
        if (userWordbook) {
            const wbSet = new Set(userWordbook.words.map(w => w.toLowerCase()));
            filteredData = filteredData.filter(item =>
                item.cardType === 'word' &&
                wbSet.has(item.word.toLowerCase()) &&
                !item.isLearned
            );
        } else {
            filteredData = []; // 单词本不存在
        }
        isLearnedMode = false;
    } else {
        // 模式：特定类型学习 (Pre/Suf/Root)
        // 过滤特定 Content Type
        filteredData = filteredData.filter(item => item.contentType === currentContentType);

        // 基础过滤：仅显示未掌握的单词 (学习模式)
        filteredData = filteredData.filter(item => {
            // intro 卡片总是显示
            if (item.cardType === 'intro') return true;
            return !item.isLearned;
        });
        isLearnedMode = false;
    }

    // 3. 第三层过滤：Sub-Category Filter (specific prefixes like 'ab-')
    if (currentFilter !== 'all') {
        // 注意：getAvailableSubCategories 已经保证了 currentFilter 是有效的
        // 这里只需要匹配 meaningId (即 item.type)
        filteredData = filteredData.filter(item => item.type === currentFilter);
    }

    // 4. 搜索过滤 (最高优先级)
    if (currentSearchQuery) {
        const searchTerms = [currentSearchQuery];
        if (typeof window.nlp === 'function') {
            try {
                const doc = window.nlp(currentSearchQuery);
                doc.compute('root');
                const rootForm = doc.text('root');
                if (rootForm && rootForm !== currentSearchQuery) searchTerms.push(rootForm);
            } catch (e) {
                console.warn('NLP processing failed in search:', e);
            }
        }
        const matchingWords = filteredData.filter(item => {
            if (item.cardType !== 'word' || !item.word) return false;
            const dbWord = item.word.toLowerCase();
            return searchTerms.some(term => dbWord.includes(term) || term.startsWith(dbWord));
        });
        // 搜索结果中包含相关的 intro 卡片
        const relevantTypes = new Set(matchingWords.map(item => item.type));
        // 注意：如果是 Learned 模式，通常不显示 intro 卡片，除非特意设计
        // 如果是 'All' 模式，也可以显示 intro
        const showIntros = !isLearnedMode || currentContentType === 'all';
        const relevantIntros = showIntros ? filteredData.filter(item => item.cardType === 'intro' && relevantTypes.has(item.type)) : [];

        currentDataSet = [...relevantIntros, ...matchingWords];
    } else {
        currentDataSet = filteredData;
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

// --- 状态设置函数 ---
export function setCurrentFilter(newFilter) { currentFilter = newFilter; }
export function setCurrentCategory(newCategory) { currentCategory = newCategory; }
export function setCurrentContentType(newType) { currentContentType = newType; }
export function setSearchQuery(query) { currentSearchQuery = query.trim().toLowerCase(); }

export function getMaskedSentence(sentence, targetWord) {
    if (!sentence || !targetWord) return '';
    const regex = new RegExp(`\\b${targetWord}[a-z]*\\b`, 'gi');
    return sentence.replace(regex, '<span class="masked-word">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>');
}