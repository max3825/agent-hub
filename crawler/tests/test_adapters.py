import json

from crawler.adapters.awesome_lists import parse_awesome
from crawler.adapters.base import Adapter, Context
from crawler.adapters.marketplaces import parse_marketplace
from crawler.adapters.skills_sh import extract_repos
from crawler.config import load_config
from crawler.models import Candidate
from crawler.pipeline import merge_candidates


def test_parse_marketplace(fx):
    mk = parse_marketplace(fx("marketplace.json"))
    assert mk["name"] == "demo-market"
    by = {p["name"]: p for p in mk["plugins"]}
    assert set(by) == {"local-plugin", "root-plugin", "remote-gh", "remote-url", "shorthand"}
    assert by["local-plugin"]["path"] == "plugins/local-plugin"
    assert by["root-plugin"]["path"] == "."
    assert by["remote-gh"]["repo"] == "someone/remote-plugin"
    assert by["remote-url"]["repo"] == "other/thing"
    assert by["shorthand"]["repo"] == "acme/shorthand-plugin"


def test_parse_awesome(fx):
    assert parse_awesome(fx("awesome.md"), "me/awesome-list") == ["alice/cool-skills", "bob/hooks-pack", "carol/repo.js"]


def test_skills_sh_extract_handles_unknown_shapes():
    payload = {"skills": [{"name": "a", "repo": "o1/r1"}, {"source": "https://github.com/o2/r2"}, {"x": ["see github.com/o3/r3.git"]}], "junk": 3}
    assert extract_repos(payload) == ["o1/r1", "o2/r2", "o3/r3"]
    assert extract_repos("nothing") == [] and extract_repos(None) == []


def test_merge_candidates_dedupes_and_picks_best_origin():
    out = merge_candidates([Candidate(repo="A/b", origin="github"), Candidate(repo="a/B", origin="marketplace"), Candidate(repo="c/d", origin="awesome")])
    assert [(c.repo, c.origin) for c in out] == [("A/b", "marketplace"), ("c/d", "awesome")]


def test_adapter_failure_is_silent():
    class Boom(Adapter):
        name = "boom"
        def discover(self):
            raise RuntimeError("source down")
    assert Boom(Context(cfg=load_config(), gh=None, limit=1)).safe_discover() == []   # type: ignore[arg-type]
