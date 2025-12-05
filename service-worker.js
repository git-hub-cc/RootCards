/**
 * =================================================================================
 * Service Worker (PWA 核心控制脚本) - v1.2 (修复音频流缓存问题)
 * ---------------------------------------------------------------------------------
 * 主要职责:
 * 1. (安装 Install) 预缓存 App Shell (应用核心骨架)，确保应用能够离线秒开。
 * 2. (激活 Activate) 清理旧版本的缓存，有效管理存储空间。
 * 3. (拦截 Fetch) 拦截网络请求，并根据资源类型应用不同的缓存策略：
 *    - App Shell 静态资源 -> 缓存优先 (Cache First)
 *    - JSON 数据文件 -> 缓存优先，后台更新 (Stale While Revalidate)
 *    - 音频媒体文件 -> 缓存优先 (Cache First), 并正确处理流式响应
 * =================================================================================
 */

// --- 配置区域 ---

// 缓存版本号：修改此版本号会触发 Service Worker 的更新流程，并清理旧缓存。
const CACHE_VERSION = 'v1.0.2'; // 建议递增版本号以触发更新
// 静态资源缓存（App Shell: HTML, CSS, JS, manifest 等）
const STATIC_CACHE = `static-${CACHE_VERSION}`;
// 数据资源缓存（主要是 JSON 文件）
const DATA_CACHE = `data-${CACHE_VERSION}`;
// 音频资源缓存（MP3 文件），使用独立版本号，因为它们不常变动但体积较大。
const AUDIO_CACHE = `audio-v1`;

// 需要在安装时立即缓存的核心静态资源 (App Shell)
// 确保此列表中的所有路径都是正确且可访问的！
const ASSETS_TO_CACHE = [
    '/', // 网站根目录，通常会映射到 index.html
    '/index.html',
    './manifest.json', // 使用 ./ 增加明确性
    '/favicon.svg',

    // CSS 样式表
    '/css/base.css',
    '/css/layout.css',
    '/css/components.css',
    '/css/card.css',
    '/css/modals.css',
    '/css/feature-listening.css',
    '/css/feature-typing.css',
    '/css/feature-wordbook.css',
    '/css/feature-undo.css',
    '/css/feature-notifications.css',

    // JavaScript 模块
    '/js/app.js',
    '/js/state.js',
    '/js/ui.js',
    '/js/modules/themeManager.js',
    '/js/modules/dataManager.js',
    '/js/modules/listeningMode.js',
    '/js/modules/typingMode.js',
    '/js/modules/wordbook.js',
    '/js/modules/undoManager.js',
    '/js/modules/notificationManager.js',

    // Web Workers 和第三方库
    '/js/workers/nlpWorker.js',
    '/lib/compromise.js', // 确保这个文件存在于项目中！

    // 数据清单
    '/data/manifest.js'
];

// --- 1. 安装事件 (Install): 预缓存静态资源 ---
self.addEventListener('install', (event) => {
    console.log(`[Service Worker] 正在安装新版本: ${CACHE_VERSION}`);
    self.skipWaiting();
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('[Service Worker] 正在预缓存 App Shell...');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .catch(error => {
                console.error('[Service Worker] App Shell 预缓存失败:', error);
            })
    );
});

// --- 2. 激活事件 (Activate): 清理旧缓存 ---
self.addEventListener('activate', (event) => {
    console.log(`[Service Worker] 正在激活新版本: ${CACHE_VERSION}`);
    event.waitUntil(self.clients.claim());
    event.waitUntil(
        caches.keys().then((keyList) => {
            const cacheWhitelist = [STATIC_CACHE, DATA_CACHE, AUDIO_CACHE];
            return Promise.all(
                keyList.map((key) => {
                    if (!cacheWhitelist.includes(key)) {
                        console.log(`[Service Worker] 正在删除旧缓存: ${key}`);
                        return caches.delete(key);
                    }
                })
            );
        })
    );
});

// --- 3. 拦截事件 (Fetch): 应用缓存策略 ---
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
        return;
    }

    // --- 策略 A: 音频文件 -> 缓存优先 (Cache First) ---
    if (url.pathname.startsWith('/audio/')) {
        event.respondWith(
            caches.open(AUDIO_CACHE).then(cache => {
                return cache.match(event.request).then(cachedResponse => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    return fetch(event.request).then(networkResponse => {
                        // ========================================================
                        // 【核心修复】在这里检查响应状态码
                        // ========================================================
                        // 仅当响应是完整的（状态码 200-299）时才进行缓存。
                        // 特别是要排除 206 Partial Content，以允许音频流正常工作。
                        if (networkResponse.ok && networkResponse.status !== 206) {
                            cache.put(event.request, networkResponse.clone());
                        }
                        // 无论是否缓存，都将原始响应返回给浏览器。
                        return networkResponse;
                    });
                });
            })
        );
        return;
    }

    // --- 策略 B: 数据文件 (JSON) -> 缓存优先，后台更新 (Stale While Revalidate) ---
    if (url.pathname.startsWith('/data/') && url.pathname.endsWith('.json')) {
        event.respondWith(
            caches.open(DATA_CACHE).then(cache => {
                return cache.match(event.request).then(cachedResponse => {
                    const fetchPromise = fetch(event.request).then(networkResponse => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    }).catch(error => {
                        console.warn(`[Service Worker] 获取数据文件失败: ${event.request.url}`, error);
                    });
                    return cachedResponse || fetchPromise;
                });
            })
        );
        return;
    }

    // --- 策略 C: 默认策略（App Shell 静态资源） -> 缓存优先 (Cache First) ---
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request).catch(error => {
                console.error(`[Service Worker] 静态资源网络请求失败: ${event.request.url}`, error);
            });
        })
    );
});