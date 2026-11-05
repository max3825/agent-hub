from pathlib import Path

import pytest

FIX = Path(__file__).parent / "fixtures"


@pytest.fixture
def fx():
    return lambda name: (FIX / name).read_text("utf-8")


@pytest.fixture
def tree(fx):
    return fx("tree.txt").split()
