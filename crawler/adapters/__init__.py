from .awesome_lists import AwesomeListsAdapter
from .base import Adapter, Context
from .github_code_search import GithubCodeSearchAdapter
from .github_topics import GithubTopicsAdapter
from .marketplaces import MarketplacesAdapter
from .skills_sh import SkillsShAdapter

ALL_ADAPTERS: list[type[Adapter]] = [
    GithubTopicsAdapter, MarketplacesAdapter, AwesomeListsAdapter, SkillsShAdapter, GithubCodeSearchAdapter,
]
__all__ = ["ALL_ADAPTERS", "Adapter", "Context"]
