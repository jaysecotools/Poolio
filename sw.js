// Pool Chemist Pro Service Worker v1.0.0
// Cache version - CHANGE THIS WHEN DEPLOYING UPDATES
const CACHE_VERSION = 'v1_0_0';
const CACHE_NAME = `pool-chemist-${CACHE_VERSION}`;
const OFFLINE_FALLBACK = '/offline.html';

// Assets to cache immediately on install
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/sw.js',
    '/offline.html',
    // Icons
    '/icons/icon-72x72.png',
    '/icons/icon-96x96.png',
    '/icons/icon-128x128.png',
    '/icons/icon-144x144.png',
    '/icons/icon-152x152.png',
    '/icons/icon-192x192.png',
    '/icons/icon-384x384.png',
    '/icons/icon-512x512.png',
    '/icons/maskable-icon.png'
];

// Combine all assets to cache
const PRECACHE_ASSETS = [...STATIC_ASSETS];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing new version:', CACHE_VERSION);
    
    // Skip waiting to activate immediately
    self.skipWaiting();
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(PRECACHE_ASSETS);
            })
            .catch((error) => {
                console.error('[SW] Failed to cache assets:', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating new version:', CACHE_VERSION);
    
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // Delete old caches that don't match current version
                    if (cacheName !== CACHE_NAME && cacheName.startsWith('pool-chemist-')) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            // Claim clients to take control immediately
            return self.clients.claim();
        })
    );
});

// Stale-While-Revalidate strategy for most assets
async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    const fetchPromise = fetch(request.clone()).then(async (networkResponse) => {
        // Cache the fresh response for next time
        if (networkResponse && networkResponse.status === 200) {
            await cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    }).catch((error) => {
        console.warn('[SW] Fetch failed:', request.url, error);
        return cachedResponse;
    });
    
    // Return cached response immediately if available, otherwise wait for network
    return cachedResponse || fetchPromise;
}

// Cache First strategy for static assets
async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
        // Background update (don't wait)
        fetch(request.clone()).then(async (networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
                await cache.put(request, networkResponse.clone());
            }
        }).catch(() => {});
        
        return cachedResponse;
    }
    
    // Not in cache, fetch from network
    try {
        const networkResponse = await fetch(request.clone());
        if (networkResponse && networkResponse.status === 200) {
            await cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        console.error('[SW] Cache-first fetch failed:', request.url);
        return null;
    }
}

// Network First strategy for dynamic content
async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request.clone());
        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        console.warn('[SW] Network failed, using cache:', request.url);
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(request);
        return cachedResponse || null;
    }
}

// Main fetch handler
self.addEventListener('fetch', (event) => {
    const url = event.request.url;
    
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }
    
    // Handle navigation requests (HTML pages)
    if (event.request.mode === 'navigate') {
        event.respondWith(
            networkFirst(event.request).then((response) => {
                if (response) return response;
                
                // Fallback to offline page
                return caches.match(OFFLINE_FALLBACK).then((fallback) => {
                    if (fallback) return fallback;
                    return new Response('You are offline. Please reconnect to access this content.', {
                        status: 503,
                        statusText: 'Service Unavailable',
                        headers: new Headers({
                            'Content-Type': 'text/html',
                        })
                    });
                });
            })
        );
        return;
    }
    
    // For static assets (JS, CSS, images), use stale-while-revalidate for speed
    if (event.request.destination === 'script' || 
        event.request.destination === 'style' || 
        event.request.destination === 'image') {
        event.respondWith(staleWhileRevalidate(event.request));
        return;
    }
    
    // For everything else, use network first
    event.respondWith(networkFirst(event.request));
});

// Handle messages from clients (for skipWaiting)
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        console.log('[SW] Skip waiting received, activating new version');
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CHECK_UPDATES') {
        console.log('[SW] Checking for updates...');
        // Force check for updates
        self.registration.update();
    }
});
