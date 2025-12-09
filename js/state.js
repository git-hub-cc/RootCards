// =================================================================================
// 数据与状态管理模块 (State Management Module) - v9.0 (热力图与成就系统)
// ---------------------------------------------------------------------------------
// 主要职责：
// 1. (数据加载) 异步加载所有词汇数据文件。
// 2. (数据处理) 将原始数据处理成应用所需的格式。
// 3. (状态管理) 维护全局数据和当前筛选状态。
// 4. (用户数据) 管理“已掌握”单词、“自定义单词本”以及“用户笔记”的增删改查。
// 5. (新增) 管理“学习热力图”活动数据。
// 6. (新增) 管理“成就系统”状态与解锁逻辑。
// 7. (持久化) 负责 localStorage 的读写。
// =================================================================================

import * as NotificationManager from './modules/notificationManager.js';

// --- 模块内常量 ---
const LEARNED_WORDS_KEY = 'etymologyLearnedWords';
const USER_WORDBOOKS_KEY = 'etymologyUserWordbooks';
const USER_NOTES_KEY = 'etymologyUserNotes';
const LEARNING_ACTIVITY_KEY = 'etymologyLearningActivity'; // 新增：热力图数据 Key
const USER_ACHIEVEMENTS_KEY = 'etymologyUserAchievements'; // 新增：成就数据 Key

// --- 成就定义配置 (硬编码) ---
export const ACHIEVEMENT_DEFINITIONS = [
    {
        id: 'compiler',
        name: 'Compiler (编译器)',
        description: '连续 7 天完成至少一次学习打卡。',
        icon: '⚡',
        condition: 'streak',
        target: 7
    },
    {
        id: 'refactor_master',
        name: 'Refactor Master (重构大师)',
        description: '累计标记掌握 100 个单词。',
        icon: '🛠️',
        condition: 'count',
        target: 100
    },
    {
        id: 'bug_hunter',
        name: 'Bug Hunter (捕虫猎人)',
        description: '在拼写模式中一次性连续拼对 20 个单词。',
        icon: '🐞',
        condition: 'manual', // 手动触发
        target: 20
    },
    {
        id: 'full_stack',
        name: 'Full Stack (全栈)',
        description: '累计掌握 500 个单词。',
        icon: '📚',
        condition: 'count',
        target: 500
    },
    {
        id: 'legacy_code',
        name: 'Legacy Code (遗留代码)',
        description: '连续 30 天坚持学习。',
        icon: '🏛️',
        condition: 'streak',
        target: 30
    }
];

// --- 导出的状态变量 (供其他模块读取和修改) ---
export let allVocabularyData = [];      // 存储所有已加载和处理过的数据
export let currentDataSet = [];         // 当前经过筛选后，需要被渲染的数据集
export let currentFilter = 'all';       // 当前类别筛选器状态
export let currentGrade = 'middle';     // 当前年级筛选器状态
export let currentContentType = 'pre';  // 当前内容类型筛选器状态
export let learnedWordsSet = new Set(); // 存储所有已掌握单词的 Set 集合
export let currentSearchQuery = '';     // 当前搜索框中的关键词
export let userWordbooks = [];          // 存储所有用户创建的单词本
export let userNotes = new Map();       // 存储用户笔记 Map<word, text>
export let learningActivity = {};       // 新增：学习活动记录 { "YYYY-MM-DD": count }
export let userAchievements = {};       // 新增：用户成就状态 { id: { unlocked: bool, progress: num, date: ts } }

// =================================================================================
// 基础数据加载与保存 (保持原逻辑)
// =================================================================================

/**
 * 从 localStorage 加载已掌握的单词列表。
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
        learnedWordsSet = new Set();
    }
}

/**
 * 将已掌握的单词列表保存到 localStorage。
 */
function saveLearnedWords() {
    try {
        const wordsArray = Array.from(learnedWordsSet);
        localStorage.setItem(LEARNED_WORDS_KEY, JSON.stringify(wordsArray));
        // 检查基于数量的成就 (Refactor Master)
        checkCountAchievements();
    } catch (error) {
        console.error('无法保存学习进度到 localStorage:', error);
    }
}

/**
 * 从 localStorage 加载用户笔记。
 */
export function loadUserNotes() {
    try {
        const storedNotes = localStorage.getItem(USER_NOTES_KEY);
        if (storedNotes) {
            const notesObj = JSON.parse(storedNotes);
            userNotes = new Map(Object.entries(notesObj));
        }
    } catch (error) {
        console.error('无法从 localStorage 加载用户笔记:', error);
        userNotes = new Map();
    }
}

/**
 * 保存用户笔记到 localStorage。
 */
function saveUserNotes() {
    try {
        const notesObj = Object.fromEntries(userNotes);
        localStorage.setItem(USER_NOTES_KEY, JSON.stringify(notesObj));
    } catch (error) {
        console.error('无法保存用户笔记到 localStorage:', error);
    }
}

export function getUserNote(word) {
    if (!word) return '';
    return userNotes.get(word.toLowerCase()) || '';
}

export function saveUserNote(word, text) {
    if (!word) return;
    const key = word.toLowerCase();
    const trimmedText = text ? text.trim() : '';

    if (trimmedText) {
        userNotes.set(key, trimmedText);
    } else {
        userNotes.delete(key);
    }
    saveUserNotes();
}

/**
 * 从 localStorage 加载用户创建的单词本。
 */
export function loadUserWordbooks() {
    try {
        const storedWordbooks = localStorage.getItem(USER_WORDBOOKS_KEY);
        if (storedWordbooks) {
            const parsedData = JSON.parse(storedWordbooks);
            if (Array.isArray(parsedData) && parsedData.every(wb => typeof wb.name === 'string' && Array.isArray(wb.words))) {
                userWordbooks = parsedData;
            } else {
                console.warn('localStorage 中的单词本数据格式不正确，已忽略。');
                userWordbooks = [];
            }
        }
    } catch (error) {
        console.error('无法从 localStorage 加载用户单词本:', error);
        userWordbooks = [];
    }
}

/**
 * 保存用户创建的所有单词本到 localStorage。
 */
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
    if (!newName || !words || !Array.isArray(words)) return false;

    const isDuplicate = userWordbooks.some(wb => wb.name === newName && wb.name !== oldName);
    if (isDuplicate) {
        throw new Error(`单词本名称 "${newName}" 已存在，请使用其他名称。`);
    }

    if (oldName) {
        const index = userWordbooks.findIndex(wb => wb.name === oldName);
        if (index > -1) {
            userWordbooks[index].name = newName;
            userWordbooks[index].words = words;
        } else {
            userWordbooks.push({ name: newName, words });
        }
    } else {
        userWordbooks.push({ name: newName, words });
    }

    saveUserWordbooks();
    return true;
}

export function toggleLearnedStatus(wordData) {
    wordData.isLearned = !wordData.isLearned;
    if (wordData.isLearned) {
        learnedWordsSet.add(wordData.word);
    } else {
        learnedWordsSet.delete(wordData.word);
    }
    saveLearnedWords();
}

export function getLearnedWordsArray() {
    return Array.from(learnedWordsSet).sort();
}

export function importLearnedWords(wordsArray) {
    if (!Array.isArray(wordsArray)) {
        console.error('导入数据格式错误，需要一个数组。');
        return 0;
    }
    const originalSize = learnedWordsSet.size;
    wordsArray.forEach(word => {
        if (typeof word === 'string' && word.trim()) {
            learnedWordsSet.add(word.trim().toLowerCase());
        }
    });

    allVocabularyData.forEach(item => {
        if (item.cardType === 'word' && learnedWordsSet.has(item.word.toLowerCase())) {
            item.isLearned = true;
        }
    });

    saveLearnedWords();
    return learnedWordsSet.size - originalSize;
}

export function clearLearnedWords() {
    learnedWordsSet.clear();
    allVocabularyData.forEach(item => {
        if (item.cardType === 'word') {
            item.isLearned = false;
        }
    });
    saveLearnedWords();
    // 清空进度后，不需要重置热力图，那是历史记录。但可以考虑是否重置某些计数类成就（这里暂时保留成就）。
}

// =================================================================================
// 【新增】热力图数据管理 (Learning Heatmap)
// =================================================================================

/**
 * 加载学习活动记录。
 */
export function loadLearningActivity() {
    try {
        const stored = localStorage.getItem(LEARNING_ACTIVITY_KEY);
        if (stored) {
            learningActivity = JSON.parse(stored);
        } else {
            learningActivity = {};
        }
    } catch (e) {
        console.error('无法加载学习热力图数据:', e);
        learningActivity = {};
    }
}

/**
 * 记录学习活动。
 * @param {Date} date - 日期对象
 * @param {number} increment - 增加的数量（默认为 1），可以是负数用于撤销。
 */
export function logLearningActivity(date = new Date(), increment = 1) {
    try {
        const dateKey = date.toISOString().split('T')[0]; // "YYYY-MM-DD"
        if (!learningActivity[dateKey]) {
            learningActivity[dateKey] = 0;
        }
        learningActivity[dateKey] += increment;

        // 确保不为负数
        if (learningActivity[dateKey] < 0) {
            learningActivity[dateKey] = 0;
        }

        // 移除计数为0的记录，保持数据整洁？或者保留以显示"活跃但无产出"？
        // 这里选择保留，只要有记录就视为当天有活动。

        localStorage.setItem(LEARNING_ACTIVITY_KEY, JSON.stringify(learningActivity));

        // 记录活动后，检查基于连续性的成就
        checkStreakAchievements();

    } catch (e) {
        console.error('保存学习活动失败:', e);
    }
}

/**
 * 获取热力图数据。
 */
export function getLearningActivity() {
    return learningActivity;
}

// =================================================================================
// 【新增】成就系统管理 (Achievement System)
// =================================================================================

/**
 * 加载用户成就。
 */
export function loadAchievements() {
    try {
        const stored = localStorage.getItem(USER_ACHIEVEMENTS_KEY);
        if (stored) {
            userAchievements = JSON.parse(stored);
        } else {
            userAchievements = {};
        }
        // 初始化未获得的成就结构
        ACHIEVEMENT_DEFINITIONS.forEach(def => {
            if (!userAchievements[def.id]) {
                userAchievements[def.id] = { unlocked: false, progress: 0, date: null };
            }
        });
    } catch (e) {
        console.error('无法加载成就数据:', e);
        userAchievements = {};
    }
}

/**
 * 解锁成就的核心函数。
 * @param {string} achievementId - 成就ID
 */
export function unlockAchievement(achievementId) {
    const achievement = userAchievements[achievementId];
    const definition = ACHIEVEMENT_DEFINITIONS.find(d => d.id === achievementId);

    if (achievement && !achievement.unlocked && definition) {
        achievement.unlocked = true;
        achievement.date = new Date().toISOString();
        achievement.progress = definition.target; // 确保进度显示满额

        localStorage.setItem(USER_ACHIEVEMENTS_KEY, JSON.stringify(userAchievements));

        // 触发通知
        NotificationManager.show({
            type: 'success',
            message: `🏆 解锁成就：${definition.name} - ${definition.description}`,
            duration: 5000
        });
    }
}

/**
 * 检查基于数量的成就 (Count-based)。
 * 例如：累计掌握 100 个单词。
 */
function checkCountAchievements() {
    const count = learnedWordsSet.size;
    const targets = ACHIEVEMENT_DEFINITIONS.filter(d => d.condition === 'count');

    targets.forEach(def => {
        const userAch = userAchievements[def.id];
        if (!userAch.unlocked) {
            userAch.progress = count; // 更新进度
            if (count >= def.target) {
                unlockAchievement(def.id);
            }
        }
    });
    localStorage.setItem(USER_ACHIEVEMENTS_KEY, JSON.stringify(userAchievements));
}

/**
 * 检查基于连续天数的成就 (Streak-based)。
 * 例如：连续 7 天学习。
 */
function checkStreakAchievements() {
    const dates = Object.keys(learningActivity).sort();
    if (dates.length === 0) return;

    // 计算当前连续天数
    let streak = 0;
    const today = new Date().toISOString().split('T')[0];
    let currentDateStr = today;

    // 如果今天没有记录，检查昨天（允许今天还没开始学）
    if (!learningActivity[currentDateStr]) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        currentDateStr = yesterday.toISOString().split('T')[0];
    }

    // 回溯检查
    while (learningActivity[currentDateStr] && learningActivity[currentDateStr] > 0) {
        streak++;
        const d = new Date(currentDateStr);
        d.setDate(d.getDate() - 1);
        currentDateStr = d.toISOString().split('T')[0];
    }

    const targets = ACHIEVEMENT_DEFINITIONS.filter(d => d.condition === 'streak');
    targets.forEach(def => {
        const userAch = userAchievements[def.id];
        // 只有当当前 streak 大于记录的最高 streak 时才更新进度
        if (!userAch.unlocked && streak > userAch.progress) {
            userAch.progress = streak;
            if (streak >= def.target) {
                unlockAchievement(def.id);
            }
        }
    });
    localStorage.setItem(USER_ACHIEVEMENTS_KEY, JSON.stringify(userAchievements));
}

/**
 * 更新手动触发类成就的进度 (Manual/Transient)。
 * 例如：Bug Hunter (连续拼写正确)。
 * @param {string} achievementId
 * @param {number} currentVal - 当前值（例如连续答对次数）
 */
export function updateTransientAchievement(achievementId, currentVal) {
    const userAch = userAchievements[achievementId];
    const def = ACHIEVEMENT_DEFINITIONS.find(d => d.id === achievementId);

    if (userAch && !userAch.unlocked && def) {
        // 对于瞬时成就，我们只记录达到过的最大值作为进度展示
        if (currentVal > userAch.progress) {
            userAch.progress = currentVal;
            localStorage.setItem(USER_ACHIEVEMENTS_KEY, JSON.stringify(userAchievements));
        }

        if (currentVal >= def.target) {
            unlockAchievement(achievementId);
        }
    }
}

// =================================================================================
// 原始逻辑保持不变
// =================================================================================

function getGradeFromFilePath(filePath) {
    if (filePath.includes('/CET-4/')) return 'CET-4';
    if (filePath.includes('/CET-6/')) return 'CET-6';
    if (filePath.includes('/middle/')) return 'middle';
    if (filePath.includes('/high/')) return 'high';
    return 'unknown';
}

function getContentTypeFromFilePath(filePath) {
    if (filePath.includes('/pre/')) return 'pre';
    if (filePath.includes('/suf/')) return 'suf';
    if (filePath.includes('/root/')) return 'root';
    return 'category';
}

export async function loadAndProcessData(onProgress) {
    // 增加数据加载：热力图和成就
    loadLearningActivity();
    loadAchievements();

    if (typeof DATA_FILES === 'undefined' || !Array.isArray(DATA_FILES) || DATA_FILES.length === 0) {
        throw new Error("数据清单 'data/manifest.js' 未找到、格式错误或为空。");
    }

    const grades = new Set();
    allVocabularyData = [];

    const totalFiles = DATA_FILES.length;
    let loadedFiles = 0;

    if (typeof onProgress === 'function') {
        onProgress(loadedFiles, totalFiles);
    }

    const promises = DATA_FILES.map(async (file) => {
        try {
            const response = await fetch(file);
            if (!response.ok) throw new Error(`网络错误 (状态 ${response.status})，无法加载文件: ${file}`);
            const dataFile = await response.json();

            if (!dataFile.prefix || !Array.isArray(dataFile.meanings)) {
                console.warn(`文件 ${file} 格式不正确，已跳过。`);
                return null;
            }

            const grade = getGradeFromFilePath(file);
            if (grade !== 'unknown') {
                grades.add(grade);
            }
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
                    grade: grade,
                    contentType: contentType,
                    isLearned: cardType === 'word' ? learnedWordsSet.has(item.word.toLowerCase()) : false,
                    ...(cardType === 'intro' && { visual: meaningGroup.prefixVisual }),
                    ...(cardType === 'word' && { prefixVisual: meaningGroup.prefixVisual || '' })
                });

                if (meaningGroup.prefixIntro) {
                    processedItems.push(processItem(meaningGroup.prefixIntro, 'intro'));
                }
                if (Array.isArray(meaningGroup.words)) {
                    const wordsData = meaningGroup.words.map(word => processItem(word, 'word'));
                    processedItems.push(...wordsData);
                }
            }
            return processedItems;

        } catch (fileError) {
            console.error(`加载或处理文件 ${file} 时出错:`, fileError);
            return null;
        } finally {
            loadedFiles++;
            if (typeof onProgress === 'function') {
                onProgress(loadedFiles, totalFiles);
            }
        }
    });

    const results = await Promise.allSettled(promises);
    results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
            allVocabularyData.push(...result.value);
        }
    });

    const gradeOrder = ['middle', 'high', 'CET-4', 'CET-6'];
    const sortedGrades = Array.from(grades).sort((a, b) => {
        const indexA = gradeOrder.indexOf(a);
        const indexB = gradeOrder.indexOf(b);
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
    });

    return { grades: sortedGrades };
}

export function filterAndPrepareDataSet() {
    let filteredData;

    if (currentGrade === 'all') {
        filteredData = allVocabularyData;
    } else {
        filteredData = allVocabularyData.filter(item => item.grade === currentGrade);
    }

    if (currentContentType !== 'all') {
        filteredData = filteredData.filter(item => item.contentType === currentContentType);
    }

    const userWordbook = userWordbooks.find(wb => wb.name === currentFilter);

    if (currentFilter === 'learned') {
        filteredData = filteredData.filter(item => item.cardType === 'word' && item.isLearned);
    } else if (userWordbook) {
        const wordbookSet = new Set(userWordbook.words.map(w => w.toLowerCase()));
        filteredData = filteredData.filter(item =>
            item.cardType === 'word' && wordbookSet.has(item.word.toLowerCase())
        );
    } else if (currentFilter === 'all') {
        filteredData = filteredData.filter(item => item.cardType === 'intro' || !item.isLearned);
    } else {
        filteredData = filteredData.filter(item =>
            item.type === currentFilter && (item.cardType === 'intro' || !item.isLearned)
        );
    }

    if (currentSearchQuery) {
        let searchTerms = [currentSearchQuery];
        if (typeof window.nlp === 'function') {
            try {
                const doc = window.nlp(currentSearchQuery);
                doc.compute('root');
                const rootForm = doc.text('root');
                if (rootForm && rootForm !== currentSearchQuery) {
                    searchTerms.push(rootForm);
                }
            } catch (e) {
                console.warn('NLP processing failed in search:', e);
            }
        }

        const matchingWordCards = filteredData.filter(item => {
            if (item.cardType !== 'word' || !item.word) return false;
            const dbWord = item.word.toLowerCase();
            return searchTerms.some(term =>
                dbWord.includes(term) || term.startsWith(dbWord)
            );
        });

        const relevantCategoryIds = new Set(matchingWordCards.map(item => item.type));

        if (relevantCategoryIds.size > 0) {
            const relevantIntroCards = filteredData.filter(item =>
                item.cardType === 'intro' && relevantCategoryIds.has(item.type)
            );
            currentDataSet = [...relevantIntroCards, ...matchingWordCards];
        } else {
            currentDataSet = [];
        }
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

export function setCurrentFilter(newFilter) { currentFilter = newFilter; }
export function setCurrentGrade(newGrade) { currentGrade = newGrade; }
export function setCurrentContentType(newType) { currentContentType = newType; }
export function setSearchQuery(query) { currentSearchQuery = query.trim().toLowerCase(); }

export function getAvailableCategories() {
    let gradeFilteredData;
    if (currentGrade === 'all') {
        gradeFilteredData = allVocabularyData;
    } else {
        gradeFilteredData = allVocabularyData.filter(item => item.grade === currentGrade);
    }

    let finalFilteredData;
    if (currentContentType !== 'all') {
        finalFilteredData = gradeFilteredData.filter(item => item.contentType === currentContentType);
    } else {
        finalFilteredData = gradeFilteredData;
    }

    const categoryMap = new Map();
    finalFilteredData.forEach(item => {
        if (!categoryMap.has(item.type)) {
            const originalDisplayName = item.displayName;
            let englishDisplayName = originalDisplayName;
            if (item.contentType === 'category') {
                const match = originalDisplayName.match(/\(([^)]+)\)/);
                if (match && match[1]) englishDisplayName = match[1];
            }
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