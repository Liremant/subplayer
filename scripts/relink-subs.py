#!/usr/bin/env python3
"""Rebuilds every episode's subs.vtt from the current subtitle sources.

    relink-subs.py <series-dir> --ger DIR [DIR…] --rus DIR [DIR…]

`--ger` and `--rus` are searched in the order given, so a newer file in the first
directory wins over an older one further down. A directory may be missing entirely.

Russian is the base segmentation: its cues are cut to speech, so pairing the other
language onto them leaves far fewer orphans than the reverse. The German line is the
original and gets the <b> marker.
"""
import argparse
import importlib.util
import os
import sys

spec = importlib.util.spec_from_file_location(
    "merge_subs", os.path.join(os.path.dirname(os.path.abspath(__file__)), "merge-subs.py")
)
ms = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ms)


def matches(path, episode):
    name = os.path.basename(path)
    return f"S02E{episode}" in name and name.lower().endswith(".srt") and "forced" not in name.lower()


def find(sources, episode):
    """First source matching `S02E05`, in the order given.

    A source may be a directory or a single file — a one-off replacement for one episode
    is easier to point at directly than to copy into a folder.
    """
    for source in sources:
        if not source:
            continue
        if os.path.isfile(source):
            if matches(source, episode):
                return source
            continue
        if not os.path.isdir(source):
            continue
        for name in sorted(os.listdir(source)):
            if matches(name, episode):
                return os.path.join(source, name)
    return None


def label(path, fallback):
    """`.../Breaking.Bad.S02.RUS.DUB/Breaking.Bad.S02E05.rus.srt` -> `DUB`."""
    if not path:
        return fallback
    parent = os.path.basename(os.path.dirname(path))
    tail = parent.rsplit(".", 1)[-1]
    return tail if tail and tail not in ("Downloads", "Breaking") else fallback


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("series")
    ap.add_argument("--ger", nargs="+", default=[], help="German subtitle dirs, highest priority first")
    ap.add_argument("--rus", nargs="+", default=[], help="Russian subtitle dirs, highest priority first")
    args = ap.parse_args()

    print(f"{'ep':5} {'base':6} {'cues':>5} {'paired':>7} {'fit':>18}")
    for folder in sorted(os.listdir(args.series)):
        if not folder.startswith("E"):
            continue
        episode = folder[1:]
        ger_path = find(args.ger, episode)
        rus_path = find(args.rus, episode)
        out = os.path.join(args.series, folder, "subs.vtt")

        ger = ms.parse(ger_path) if ger_path else []
        rus = ms.parse(rus_path) if rus_path else []

        if not ger and not rus:
            print(f"{folder:5} no sources, skipped")
            continue
        if not rus:
            # German only: no second line, so no <b> wrapper is written.
            ms.write([(s, e, t, "") for s, e, t in ger], out, bold="other")
            print(f"{folder:5} {'ger':6} {len(ger):>5} {0:>7} {'german only':>18}")
            continue

        if not ger:
            ms.write([(s, e, "", t) for s, e, t in rus], out, bold="other")
            print(f"{folder:5} {'rus':6} {len(rus):>5} {0:>7} {'russian only':>18}")
            continue

        scale, offset = ms.fit_warp(rus, ger)
        mapped = [(scale * s + offset, scale * e + offset, t) for s, e, t in ger]
        merged = ms.merge(rus, mapped)
        ms.write(merged, out, bold="other")

        paired = sum(1 for c in merged if c[3])
        source = label(rus_path, "rus")
        fit = "identical" if (scale, offset) == (1.0, 0.0) else f"x{scale:.4f} {offset:+.1f}s"
        print(f"{folder:5} {source[:6]:6} {len(merged):>5} {paired:>7} {fit:>18}")


if __name__ == "__main__":
    main()
