"""Client GitHub : token optionnel, ETag (requêtes conditionnelles = 304 gratuits), throttling,
backoff exponentiel et gestion des rate limits primaire et secondaire."""
from __future__ import annotations

import logging
import os
import re
import time
from typing import Any, Callable

import httpx

from .cache import Cache
from .models import RepoMeta

log = logging.getLogger("crawler.github")
API = "https://api.github.com"
RAW = "https://raw.githubusercontent.com"


class RateLimited(Exception):
    """Limite atteinte et attente trop longue : on abandonne proprement cette requête."""


class GitHubClient:
    def __init__(
        self,
        token: str | None = None,
        cache: Cache | None = None,
        client: httpx.Client | None = None,
        sleep: Callable[[float], None] = time.sleep,
        max_wait: float = 90.0,
        max_retries: int = 4,
        search_interval: float = 2.2,
        code_search_interval: float = 6.5,
    ):
        self.token = token if token is not None else os.environ.get("GITHUB_TOKEN") or None
        headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "agent-hub-crawler"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        self.http = client or httpx.Client(headers=headers, timeout=30, follow_redirects=True)
        if client is not None:
            self.http.headers.update(headers)
        self.cache = cache
        self.sleep = sleep
        self.max_wait = max_wait
        self.max_retries = max_retries
        self._last: dict[str, float] = {}
        self._intervals = {"search": search_interval, "code": code_search_interval}
        self.requests = 0
        self.last_headers: dict[str, str] = {}

    # ── bas niveau ──────────────────────────────────────────────────────────
    def _throttle(self, kind: str | None) -> None:
        if not kind:
            return
        wait = self._intervals[kind] - (time.monotonic() - self._last.get(kind, 0.0))
        if wait > 0:
            self.sleep(wait)
        self._last[kind] = time.monotonic()

    def get(self, url: str, params: dict[str, Any] | None = None, kind: str | None = None, use_etag: bool = True) -> Any | None:
        """GET JSON avec cache ETag. Retourne None si 404/403 définitif (loggé)."""
        ck = url + "?" + "&".join(f"{k}={v}" for k, v in sorted((params or {}).items()))
        cached = self.cache.get("http", ck) if (self.cache and use_etag) else None
        headers = {"If-None-Match": cached["etag"]} if cached and cached.get("etag") else {}
        for attempt in range(self.max_retries + 1):
            self._throttle(kind)
            try:
                r = self.http.get(url, params=params, headers=headers)
                self.requests += 1
            except httpx.TransportError as e:
                if attempt == self.max_retries:
                    log.warning("réseau indisponible pour %s : %s", url, e)
                    return None
                self.sleep(2 ** attempt)
                continue
            if r.status_code == 304 and cached:
                return cached["body"]
            if r.status_code == 200:
                body = r.json()
                self.last_headers = dict(r.headers)
                if self.cache and use_etag and r.headers.get("etag"):
                    self.cache.set("http", ck, {"etag": r.headers["etag"], "body": body})
                return body
            if r.status_code in (403, 429):
                wait = self._rate_limit_wait(r)
                if wait is None:
                    log.warning("403 sans rate limit sur %s : %s", url, r.text[:120])
                    return None
                if wait > self.max_wait:
                    raise RateLimited(f"rate limit : attente de {wait:.0f}s > {self.max_wait:.0f}s")
                log.info("rate limit : pause %.0fs", wait)
                self.sleep(wait)
                continue
            if r.status_code >= 500:
                if attempt < self.max_retries:  # pas de pause inutile après le dernier essai
                    self.sleep(2 ** attempt)
                continue
            if r.status_code in (404, 410, 422, 451):
                return None
            log.warning("HTTP %s sur %s", r.status_code, url)
            return None
        log.warning("abandon après %d tentatives : %s", self.max_retries + 1, url)
        return None

    @staticmethod
    def _rate_limit_wait(r: httpx.Response) -> float | None:
        if (ra := r.headers.get("retry-after")) and ra.isdigit():
            return float(ra) + 1
        if r.headers.get("x-ratelimit-remaining") == "0":
            reset = float(r.headers.get("x-ratelimit-reset", time.time() + 60))
            return max(1.0, reset - time.time()) + 1
        if "rate limit" in r.text.lower():  # limite secondaire
            return 30.0
        return None

    def raw(self, repo: str, ref: str, path: str, max_bytes: int = 200_000) -> str | None:
        """Contenu brut d'un fichier (raw.githubusercontent.com, hors quota API). Tronqué à max_bytes."""
        for attempt in range(3):
            try:
                r = self.http.get(f"{RAW}/{repo}/{ref}/{path}", headers=None)
                self.requests += 1
            except httpx.TransportError:
                self.sleep(2 ** attempt)
                continue
            if r.status_code == 200:
                return r.content[:max_bytes].decode("utf-8", errors="replace")
            if r.status_code in (429, 500, 502, 503):
                self.sleep(2 ** attempt)
                continue
            return None
        return None

    # ── haut niveau ─────────────────────────────────────────────────────────
    def repo(self, full_name: str) -> RepoMeta | None:
        d = self.get(f"{API}/repos/{full_name}")
        return parse_repo(d) if d else None

    def first_commit_date(self, full_name: str, path: str, branch: str) -> str | None:
        """Date du plus ancien commit touchant `path` (2 requêtes : on lit le lien `last` de la pagination)."""
        url = f"{API}/repos/{full_name}/commits"
        base = {"sha": branch, "path": path, "per_page": 1}
        d = self.get(url, base, use_etag=False)
        if not d:
            return None
        link = self.last_headers.get("link", "")
        m = re.search(r'[?&]page=(\d+)[^>]*>;\s*rel="last"', link)
        if m and m.group(1) != "1":
            d = self.get(url, {**base, "page": m.group(1)}, use_etag=False)
            if not d:
                return None
        c = d[-1].get("commit", {})
        return (c.get("committer") or c.get("author") or {}).get("date")

    def tree(self, full_name: str, branch: str) -> tuple[list[str], bool]:
        d = self.get(f"{API}/repos/{full_name}/git/trees/{branch}", {"recursive": 1}, use_etag=False)
        if not d:
            return [], False
        return [t["path"] for t in d.get("tree", []) if t.get("type") == "blob"], bool(d.get("truncated"))

    def search_repos(self, query: str, pages: int = 1) -> list[RepoMeta]:
        out: list[RepoMeta] = []
        for page in range(1, pages + 1):
            d = self.get(f"{API}/search/repositories", {"q": query, "sort": "stars", "order": "desc", "per_page": 100, "page": page}, kind="search", use_etag=False)
            if not d or not d.get("items"):
                break
            out += [parse_repo(i) for i in d["items"]]
            if len(d["items"]) < 100:
                break
        return out

    def search_code(self, query: str, pages: int = 1) -> list[str]:
        repos: list[str] = []
        for page in range(1, pages + 1):
            d = self.get(f"{API}/search/code", {"q": query, "per_page": 100, "page": page}, kind="code", use_etag=False)
            if not d or not d.get("items"):
                break
            repos += [i["repository"]["full_name"] for i in d["items"]]
            if len(d["items"]) < 100:
                break
        return list(dict.fromkeys(repos))


def parse_repo(d: dict[str, Any]) -> RepoMeta:
    lic = (d.get("license") or {}).get("spdx_id")
    return RepoMeta(
        full_name=d["full_name"], stars=d.get("stargazers_count", 0), archived=bool(d.get("archived")),
        fork=bool(d.get("fork")), pushed_at=d.get("pushed_at") or "", license=None if lic in (None, "NOASSERTION") else lic,
        default_branch=d.get("default_branch") or "main", description=d.get("description"), topics=d.get("topics") or [],
        created_at=d.get("created_at"),
    )
