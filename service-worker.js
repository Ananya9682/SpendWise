
const CACHE_NAME = "spendwise-v2";

const APP_FILES = [
    "./",
    "./index.html",
    "./login.html",
    "./signup.html",
    "./expenses.html",
    "./expense-details.html",
    "./reports.html",
    "./manifest.json",
    "./css/styles.css",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
        "./js/auth.js",
    "./js/config.js",
    "./js/expense-details.js",
    "./js/expenses.js",
    "./js/login.js",
    "./js/pwa.js",
    "./js/reports.js",
    "./js/signup.js",
    "./js/supabaseClient.js",
    "./js/theme.js"
];

// Install and cache the app's static files.
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(APP_FILES);
        })
    );

    self.skipWaiting();
});

// Remove older SpendWise caches.
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter(
                        (name) =>
                            name.startsWith("spendwise-") &&
                            name !== CACHE_NAME
                    )
                    .map((name) => caches.delete(name))
            );
        })
    );

    self.clients.claim();
});

// Handle requests.
self.addEventListener("fetch", (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Only handle same-origin GET requests.
    if (
        request.method !== "GET" ||
        url.origin !== self.location.origin
    ) {
        return;
    }

    // Never cache API-like or authentication requests.
    if (
        url.pathname.startsWith("/auth/") ||
        url.pathname.startsWith("/rest/") ||
        url.pathname.startsWith("/storage/")
    ) {
        return;
    }

    // HTML pages: network first.
    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (response.ok) {
                        const copy = response.clone();

                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(request, copy);
                        });
                    }

                    return response;
                })
                .catch(async () => {
                    const cached = await caches.match(request);

                    if (cached) {
                        return cached;
                    }

                    return new Response(
                        "SpendWise is currently offline. Please reconnect to the internet and try again.",
                        {
                            status: 503,
                            headers: {
                                "Content-Type": "text/plain; charset=utf-8"
                            }
                        }
                    );
                })
        );

        return;
    }

    // Other local files: network first, cached fallback.
    event.respondWith(
        fetch(request)
            .then((response) => {
                if (response.ok) {
                    const copy = response.clone();

                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, copy);
                    });
                }

                return response;
            })
            .catch(async () => {
                const cached = await caches.match(request);

                if (cached) {
                    return cached;
                }

                return Response.error();
            })
    );
});
