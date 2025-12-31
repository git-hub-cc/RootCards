/**
 * =================================================================================
 * Service Worker (PWA 核心控制脚本) - v1.6 (UI结构调整)
 * ---------------------------------------------------------------------------------
 * 主要修改:
 * 1. 【核心修改】递增了 CACHE_VERSION 以触发客户端缓存更新，确保新的 UI 布局生效。
 * 2. 之前已添加 icons.js，本次无需再次修改缓存列表。
 * =================================================================================
 */

// 缓存版本号：递增此版本号以强制浏览器更新缓存
const CACHE_VERSION = 'v1.0.6';

// 静态资源缓存（App Shell）
const STATIC_CACHE = `static-${CACHE_VERSION}`;
// 数据资源缓存
const DATA_CACHE = `data-${CACHE_VERSION}`;
// 音频资源缓存
const AUDIO_CACHE = `audio-v1`;

// 需要在安装时立即缓存的核心静态资源
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    './manifest.json',
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
    '/js/ui-helpers.js',
    '/js/config.js',
    '/js/icons.js',
    '/js/modules/themeManager.js',
    '/js/modules/dataManager.js',
    '/js/modules/listeningMode.js',
    '/js/modules/typingMode.js',
    '/js/modules/wordbook.js',
    '/js/modules/undoManager.js',
    '/js/modules/notificationManager.js',
    '/js/modules/dialogueMode.js',

    // Web Workers 和第三方库
    '/js/workers/nlpWorker.js',
    '/lib/compromise.js',

    // 数据清单
    '/data/manifest.js'
];

// --- 1. 安装事件 (Install) ---
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

// --- 2. 激活事件 (Activate) ---
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

// --- 3. 拦截事件 (Fetch) ---
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 排除非 GET 请求和跨域请求
    if (event.request.method !== 'GET') {
        return;
    }

    // --- 策略 A: 音频文件 -> 缓存优先 ---
    if (url.pathname.startsWith('/audio/')) {
        event.respondWith(
            caches.open(AUDIO_CACHE).then(cache => {
                return cache.match(event.request).then(cachedResponse => {
                    if (cachedResponse) return cachedResponse;
                    return fetch(event.request).then(networkResponse => {
                        if (networkResponse.ok && networkResponse.status !== 206) {
                            cache.put(event.request, networkResponse.clone());
                        }
                        return networkResponse;
                    });
                });
            })
        );
        return;
    }

    // --- 策略 B: 数据文件 (JSON) -> 缓存优先，后台更新 ---
    if (url.pathname.startsWith('/data/') && url.pathname.endsWith('.json')) {
        event.respondWith(
            caches.open(DATA_CACHE).then(cache => {
                return cache.match(event.request).then(cachedResponse => {
                    const fetchPromise = fetch(event.request).then(networkResponse => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    }).catch(error => console.warn('后台更新数据失败', error));
                    return cachedResponse || fetchPromise;
                });
            })
        );
        return;
    }

    // --- 策略 C: 默认静态资源 -> 缓存优先 ---
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request);
        })
    );
});