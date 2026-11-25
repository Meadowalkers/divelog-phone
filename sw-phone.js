"use strict";
/* The service worker for the PHONE'S STATIC COPY of the dive log -- the one
   hosted with no data in it, that reads a snapshot file (docs/phone.md). The
   laptop never serves this file; it serves sw.js, and the reasons sw.js gives
   for being network-first are reasons that apply to the laptop's page:

   1. The laptop's page carries a per-run write token. This copy has none --
      its placeholders are never substituted -- so a cached copy cannot hand it
      a stale one.
   2. On the laptop, a cached page could show yesterday's log while the live
      one sat there reachable. Here the log is not in the page at all: it is
      the snapshot in IndexedDB, and the page says on screen which snapshot,
      and from when. Caching the shell cannot make the log any staler.

   So this one is CACHE-FIRST for everything it holds. That is the point of it:
   the app has to open from the home screen on a boat with no signal.

   It is kept fresh by its version. build_phone_shell.py stamps VERSION with a
   hash of the shell's files, so publishing a changed shell changes the bytes
   of this file, the browser installs the new worker, and the old cache is
   dropped on activate. Paths are relative, so the shell works from a
   subfolder (GitHub Pages serves a project from /<repo>/). */

const VERSION = "divelog-phone-03e41db294c0";
const SHELL = ["./", "index.html", "manifest.webmanifest",
               "icon-180.png", "icon-192.png", "icon-512.png"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names.filter(n => n !== VERSION).map(n => caches.delete(n))))
      .then(() => self.clients.claim()));
});

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const copy = response.clone();
      caches.open(VERSION).then(cache => cache.put(request, copy)).catch(() => {});
    }
    return response;
  } catch (error) {
    /* Offline and not cached. A navigation still gets the app, which is what
       a home-screen launch is. */
    if (request.mode === "navigate") {
      const shell = await caches.match("./");
      if (shell) return shell;
    }
    throw error;
  }
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  /* The page answers /api/ itself from the snapshot and never sends one;
     should one ever arrive here there is nothing to serve it from. */
  if (url.pathname.includes("/api/")) return;
  event.respondWith(request.mode === "navigate"
    ? cacheFirst(new Request("./"))
    : cacheFirst(request));
});
