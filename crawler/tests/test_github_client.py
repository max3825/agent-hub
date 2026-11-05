import httpx
import pytest

from crawler.cache import Cache
from crawler.github import GitHubClient, RateLimited, parse_repo


def client(handler, tmp_path, **kw):
    sleeps = []
    gh = GitHubClient(token="t", cache=Cache(tmp_path), client=httpx.Client(transport=httpx.MockTransport(handler)), sleep=sleeps.append, **kw)
    return gh, sleeps


def test_etag_conditional_request(tmp_path):
    calls = []

    def h(req):
        calls.append(req.headers.get("if-none-match"))
        if req.headers.get("if-none-match") == '"v1"':
            return httpx.Response(304)
        return httpx.Response(200, json={"a": 1}, headers={"etag": '"v1"'})

    gh, _ = client(h, tmp_path)
    assert gh.get("https://api.github.com/x") == {"a": 1}
    assert gh.get("https://api.github.com/x") == {"a": 1}        # servi via 304 + cache
    assert calls == [None, '"v1"']


def test_exponential_backoff_on_5xx(tmp_path):
    n = {"c": 0}

    def h(req):
        n["c"] += 1
        return httpx.Response(200, json={"ok": True}) if n["c"] == 4 else httpx.Response(502)

    gh, sleeps = client(h, tmp_path)
    assert gh.get("https://api.github.com/x") == {"ok": True}
    assert sleeps == [1, 2, 4]


def test_gives_up_after_max_retries(tmp_path):
    gh, sleeps = client(lambda r: httpx.Response(500), tmp_path, max_retries=2)
    assert gh.get("https://api.github.com/x") is None and sleeps == [1, 2]


def test_rate_limit_waits_then_retries(tmp_path):
    n = {"c": 0}

    def h(req):
        n["c"] += 1
        if n["c"] == 1:
            return httpx.Response(403, headers={"retry-after": "5"}, text="rate limit")
        return httpx.Response(200, json=[1])

    gh, sleeps = client(h, tmp_path)
    assert gh.get("https://api.github.com/x") == [1] and sleeps == [6.0]


def test_rate_limit_too_long_raises(tmp_path):
    gh, _ = client(lambda r: httpx.Response(403, headers={"retry-after": "3000"}), tmp_path)
    with pytest.raises(RateLimited):
        gh.get("https://api.github.com/x")


def test_404_returns_none_and_search_pagination(tmp_path):
    gh, sleeps = client(lambda r: httpx.Response(404), tmp_path)
    assert gh.get("https://api.github.com/nope") is None

    def h(req):
        page = int(req.url.params["page"])
        items = [{"full_name": f"o/r{page}-{i}", "stargazers_count": 5} for i in range(100 if page == 1 else 3)]
        return httpx.Response(200, json={"items": items})

    gh, sleeps = client(h, tmp_path)
    repos = gh.search_repos("topic:x", pages=3)
    assert len(repos) == 103


def test_raw_truncates_and_handles_missing(tmp_path):
    gh, _ = client(lambda r: httpx.Response(200, content=b"x" * 500) if r.url.path.endswith("ok") else httpx.Response(404), tmp_path)
    assert len(gh.raw("o/r", "main", "ok", max_bytes=100)) == 100
    assert gh.raw("o/r", "main", "missing") is None


def test_parse_repo_license_and_noassertion():
    base = {"full_name": "o/r", "stargazers_count": 3, "default_branch": "dev"}
    assert parse_repo({**base, "license": {"spdx_id": "MIT"}}).license == "MIT"
    assert parse_repo({**base, "license": {"spdx_id": "NOASSERTION"}}).license is None
    assert parse_repo(base).default_branch == "dev"
