from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass

from ..config import Config
from ..github import GitHubClient
from ..models import Candidate


@dataclass
class Context:
    cfg: Config
    gh: GitHubClient
    limit: int  # budget de dépôts à analyser (info pour limiter les appels)


class Adapter(ABC):
    """Interface commune : `discover()` renvoie des dépôts candidats.

    `safe_discover()` ne lève jamais : une source en panne est loggée puis ignorée.
    """
    name = "adapter"
    origin = "github"

    def __init__(self, ctx: Context):
        self.ctx = ctx
        self.error: str | None = None   # renseigné si la source a échoué (page de santé du crawl)
        self.log = logging.getLogger(f"crawler.adapters.{self.name}")

    @abstractmethod
    def discover(self) -> list[Candidate]: ...

    def safe_discover(self) -> list[Candidate]:
        try:
            found = self.discover()
            self.log.info("%s : %d candidat(s)", self.name, len(found))
            return found
        except Exception as e:  # noqa: BLE001 — échec silencieux voulu (voir cahier des charges)
            self.error = f"{type(e).__name__}: {e}"
            self.log.warning("source %s ignorée (%s)", self.name, self.error)
            return []
