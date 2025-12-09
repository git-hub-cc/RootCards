// =================================================================================
// 数据与状态管理模块 (State Management Module) - v10.1 (优化单词计数)
// ---------------------------------------------------------------------------------
// 职责:
// 1. (数据加载) 异步加载所有词汇数据文件。
// 2. (数据处理) 将原始数据处理成应用所需的格式，并动态提取类别。
// 3. (状态管理) 维护全局数据和当前筛选状态 (category, contentType, filter)。
// 4. (用户数据) 管理“已掌握”、“单词本”、“笔记”、“学习活动”和“成就”等。
// 5. (持久化) 负责 localStorage 的读写。
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

// 【核心修改】新增一个 Map 用于快速查找单词数据，以优化计数性能
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
 * 【核心修改】新增一个函数来计算已掌握的、非词根类型的单词数量。
 * @returns {number} - 计数值。
 */
export function getLearnedWordCount() {
    let count = 0;
    // 遍历所有已掌握的单词
    for (const word of learnedWordsSet) {
        // 使用 Map 快速查找单词的详细数据
        const data = wordDataMap.get(word.toLowerCase());
        // 如果找到了数据，并且其内容类型不是 'root'，则计数加一
        if (data && data.contentType !== 'root') {
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

/**
 * 从文件路径中动态提取顶层类别 (category)。
 * @param {string} filePath - 数据文件路径，例如 'data/middle/pre/re.json'。
 * @returns {string} - 提取的类别名，例如 'middle'。
 */
function getCategoryFromFilePath(filePath) {
    const parts = filePath.split('/');
    // 路径结构为 'data/category/...'，所以我们取索引为 1 的部分
    return parts.length > 1 ? parts[1] : 'unknown';
}

function getContentTypeFromFilePath(filePath) {
    if (filePath.includes('/pre/')) return 'pre';
    if (filePath.includes('/suf/')) return 'suf';
    if (filePath.includes('/root/')) return 'root';
    return 'category'; // 默认内容类型
}

export async function loadAndProcessData(onProgress) {
    loadLearningActivity();
    loadAchievements();

    if (typeof DATA_FILES === 'undefined' || !Array.isArray(DATA_FILES) || DATA_FILES.length === 0) {
        throw new Error("数据清单 'data/manifest.js' 未找到、格式错误或为空。");
    }

    const categories = new Set();
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
            if (category !== 'unknown') categories.add(category);

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

    // 【核心修改】数据加载完毕后，填充单词查找 Map 以备后用
    wordDataMap.clear();
    allVocabularyData.forEach(item => {
        if (item.cardType === 'word' && item.word) {
            wordDataMap.set(item.word.toLowerCase(), item);
        }
    });


    // 自定义排序，确保类别按期望顺序显示
    const categoryOrder = ['middle', 'high', 'CET-4', 'CET-6'];
    const sortedCategories = Array.from(categories).sort((a, b) => {
        const indexA = categoryOrder.indexOf(a);
        const indexB = categoryOrder.indexOf(b);
        if (indexA === -1 && indexB === -1) return a.localeCompare(b); // 对未指定的类别按字母排序
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
    });

    // 返回动态生成的 categories 列表
    return { categories: sortedCategories };
}

export function filterAndPrepareDataSet() {
    let filteredData;

    // 根据 currentCategory 进行筛选
    if (currentCategory === 'all') {
        filteredData = allVocabularyData;
    } else {
        filteredData = allVocabularyData.filter(item => item.category === currentCategory);
    }

    if (currentContentType !== 'all') {
        filteredData = filteredData.filter(item => item.contentType === currentContentType);
    }

    const userWordbook = userWordbooks.find(wb => wb.name === currentFilter);

    if (currentFilter === 'learned') {
        filteredData = filteredData.filter(item => item.cardType === 'word' && item.isLearned);
    } else if (userWordbook) {
        const wordbookSet = new Set(userWordbook.words.map(w => w.toLowerCase()));
        filteredData = filteredData.filter(item => item.cardType === 'word' && wordbookSet.has(item.word.toLowerCase()));
    } else if (currentFilter === 'all') {
        filteredData = filteredData.filter(item => item.cardType === 'intro' || !item.isLearned);
    } else {
        filteredData = filteredData.filter(item => item.type === currentFilter && (item.cardType === 'intro' || !item.isLearned));
    }

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
        const relevantTypes = new Set(matchingWords.map(item => item.type));
        const relevantIntros = filteredData.filter(item => item.cardType === 'intro' && relevantTypes.has(item.type));
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

/**
 * 获取当前选定 category 和 contentType 下可用的子类别（前缀、后缀、词根等）。
 */
export function getAvailableSubCategories() {
    let categoryFilteredData;
    if (currentCategory === 'all') {
        categoryFilteredData = allVocabularyData;
    } else {
        categoryFilteredData = allVocabularyData.filter(item => item.category === currentCategory);
    }

    let finalFilteredData = (currentContentType !== 'all')
        ? categoryFilteredData.filter(item => item.contentType === currentContentType)
        : categoryFilteredData;

    const categoryMap = new Map();
    finalFilteredData.forEach(item => {
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
    });

    const userWordbookCategories = userWordbooks.map(wb => ({
        filterType: 'user-wordbook',
        meaningId: wb.name,
        displayName: wb.name,
        englishDisplayName: wb.name,
    }));

    return [...Array.from(categoryMap.values()), ...userWordbookCategories];
}

export function getMaskedSentence(sentence, targetWord) {
    if (!sentence || !targetWord) return '';
    const regex = new RegExp(`\\b${targetWord}[a-z]*\\b`, 'gi');
    return sentence.replace(regex, '<span class="masked-word">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>');
}