"""Recherche sémantique « légère » : LSA (TF-IDF + décomposition en valeurs singulières), 100 % statique.

Pourquoi pas de vrais embeddings ? Pas de modèle à télécharger côté navigateur, pas d'API payante, pas de
dépendance lourde : tout tient dans un `semantic.json` d'environ 1 Mo pour 20 000 entrées. Le modèle capte
les co-occurrences du corpus (« relire du SQL » ≈ « optimiser des requêtes »), pas le sens général d'un LLM.
Le corpus mêle français et anglais (summary + summary_en), ce qui relie les deux langues.

Format (lu par web/src/search/search.worker.ts) :
  {k, scale, vocab:[terme], idf:[float], U:b64(int8, V×k), ids:[id], vecs:b64(int8, N×k)}
La tokenisation DOIT rester identique côté JS : minuscules, accents retirés, `[a-z0-9]{2,}`.
"""
from __future__ import annotations

import base64
import re
import unicodedata
from collections import Counter

import numpy as np

from .models import Item

TOKEN = re.compile(r"[a-z0-9]{2,}")
STOP = set("the and for with from your you are this that into over per via les des pour avec dans une sur par est aux ces son ses qui que not can all any use used using".split())
MAX_VOCAB = 3000
K = 48


def tokenize(text: str) -> list[str]:
    t = unicodedata.normalize("NFD", text.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return [w for w in TOKEN.findall(t) if w not in STOP]


def doc_text(it: Item) -> str:
    # le nom compte double (répété) ; les tags et résumés FR/EN complètent
    name = re.sub(r"[-_]", " ", it.name)
    return f"{name} {name} {' '.join(it.tags)} {it.summary} {it.summary_en}"


def _b64(a: np.ndarray) -> str:
    return base64.b64encode(a.astype(np.int8).tobytes()).decode()


def build_model(items: list[Item], k: int = K, max_vocab: int = MAX_VOCAB) -> dict | None:
    """Retourne le modèle sérialisable, ou None si le corpus est trop petit pour être utile."""
    docs = [Counter(tokenize(doc_text(i))) for i in items]
    if len(docs) < 8:
        return None
    df: Counter[str] = Counter()
    for d in docs:
        df.update(d.keys())
    # termes présents dans ≥ 2 documents et pas dans plus de 60 % du corpus
    cands = [(t, n) for t, n in df.items() if n >= 2 and n <= 0.6 * len(docs)]
    vocab = [t for t, _ in sorted(cands, key=lambda x: (-x[1], x[0]))[:max_vocab]]
    if len(vocab) < 12:
        return None
    index = {t: j for j, t in enumerate(vocab)}
    n, v = len(docs), len(vocab)
    idf = np.log((1 + n) / (1 + np.array([df[t] for t in vocab], dtype=np.float64))) + 1.0

    def row(d: Counter) -> np.ndarray:
        r = np.zeros(v, dtype=np.float32)
        for t, c in d.items():
            j = index.get(t)
            if j is not None:
                r[j] = (1 + np.log(c)) * idf[j]
        nrm = np.linalg.norm(r)
        return r / nrm if nrm else r

    # Covariance X^T X par blocs (évite de matérialiser N×V pour de gros corpus)
    cov = np.zeros((v, v), dtype=np.float64)
    X_blocks = []
    for s in range(0, n, 2000):
        B = np.stack([row(d) for d in docs[s : s + 2000]])
        cov += B.T.astype(np.float64) @ B.astype(np.float64)
        X_blocks.append(B)
    k = max(6, min(k, int(v * 0.15), v - 1, n - 1))   # petit corpus → peu de dimensions (force la généralisation)
    w, vecs = np.linalg.eigh(cov)                       # valeurs propres croissantes
    U = vecs[:, np.argsort(w)[::-1][:k]].astype(np.float32)   # V×k : composantes principales
    X = np.concatenate(X_blocks)
    D = X @ U
    nrm = np.linalg.norm(D, axis=1, keepdims=True)
    D = np.divide(D, nrm, out=np.zeros_like(D), where=nrm > 0)

    scale_u, scale_d = float(np.abs(U).max()) or 1.0, 1.0  # D est normalisé : composantes ∈ [-1, 1]
    qU = np.clip(np.round(U / scale_u * 127), -127, 127)
    qD = np.clip(np.round(D * 127), -127, 127)
    return {"k": int(k), "scale": scale_u / 127, "vocab": vocab, "idf": [round(float(x), 3) for x in idf],
            "U": _b64(qU), "ids": [i.id for i in items], "vecs": _b64(qD)}


def encode_query(model: dict, text: str) -> np.ndarray:
    """Référence Python (tests) de ce que fait le worker JS."""
    k, vocab = model["k"], model["vocab"]
    idx = {t: j for j, t in enumerate(vocab)}
    U = np.frombuffer(base64.b64decode(model["U"]), dtype=np.int8).reshape(len(vocab), k).astype(np.float32) * model["scale"]
    r = np.zeros(len(vocab), dtype=np.float32)
    for t, c in Counter(tokenize(text)).items():
        if t in idx:
            r[idx[t]] = (1 + np.log(c)) * model["idf"][idx[t]]
    q = r @ U
    nrm = np.linalg.norm(q)
    return q / nrm if nrm else q


def rank(model: dict, text: str, top: int = 10) -> list[tuple[str, float]]:
    q = encode_query(model, text)
    D = np.frombuffer(base64.b64decode(model["vecs"]), dtype=np.int8).reshape(-1, model["k"]).astype(np.float32) / 127
    sims = D @ q / np.maximum(np.linalg.norm(D, axis=1), 1e-9)
    order = np.argsort(-sims)[:top]
    return [(model["ids"][i], float(sims[i])) for i in order]
