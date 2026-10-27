#!/usr/bin/env python3
"""Merge an original SRT and a translation SRT into the one dual-language VTT the
player reads: each cue carries both lines, the original wrapped in <b>.

    merge-subs.py original.srt translation.srt -o subs.vtt

The two files come from different releases, so their cues are cut differently. The
translation's segmentation becomes the base (it is usually the finer one) and each
original cue is mapped onto it by time overlap — never by index, which breaks on the
first re-cut cue.
"""
import argparse
import re
import sys

CUE = re.compile(
    r"(\d+):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d+):(\d{2}):(\d{2})[,.](\d{1,3})"
)
TAG = re.compile(r"<[^>]*>|\{[^}]*\}")


def seconds(h, m, s, frac):
    return int(h) * 3600 + int(m) * 60 + int(s) + int(frac.ljust(3, "0")) / 1000


def parse(path):
    """[(start, end, text)] — tags, positioning blocks and blank cues dropped."""
    raw = open(path, encoding="utf-8-sig", errors="replace").read().replace("\r\n", "\n")
    cues = []
    for block in re.split(r"\n\s*\n", raw):
        lines = [l for l in block.split("\n") if l.strip()]
        at = next((i for i, l in enumerate(lines) if CUE.search(l)), None)
        if at is None:
            continue
        m = CUE.search(lines[at])
        start, end = seconds(*m.groups()[:4]), seconds(*m.groups()[4:])
        text = " ".join(TAG.sub("", l).strip() for l in lines[at + 1 :])
        text = re.sub(r"\s+", " ", text).strip()
        if text and end > start:
            cues.append((start, end, text))
    return sorted(cues)


def stamp(t):
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02}.{ms:03}"


def fit_warp(base, other, scale_range=(0.97, 1.03), offset_range=(-15.0, 15.0)):
    """Fit `other_time -> base_time` as a line: base = scale * other + offset.

    Files from different releases drift apart, not merely shift, so a constant offset
    leaves seconds of error by the end of an episode. The fit maximises total cue overlap
    over a grid of (scale, offset): a wrong scale spreads the cues apart everywhere and
    scores badly, so the peak is the real alignment rather than a local coincidence.
    """
    if not base or not other:
        return 1.0, 0.0

    def score(scale, offset):
        total = 0.0
        for o_start, o_end, _ in other:
            s, e = scale * o_start + offset, scale * o_end + offset
            for b_start, b_end, _ in base:
                if b_start > e:
                    break
                if b_end > s:
                    total += min(e, b_end) - max(s, b_start)
        return total

    coarse = (1.0, 0.0)
    best = -1.0
    steps = 60
    for i in range(steps + 1):
        scale = scale_range[0] + (scale_range[1] - scale_range[0]) * i / steps
        for j in range(31):
            offset = offset_range[0] + (offset_range[1] - offset_range[0]) * j / 30
            got = score(scale, offset)
            if got > best:
                best, coarse = got, (scale, offset)

    # Refine around the coarse peak, then reject the fit if it is not better than no warp.
    scale0, offset0 = coarse
    for span_s, span_o, steps in ((0.002, 1.0, 20), (0.0004, 0.2, 20)):
        best = -1.0
        for i in range(steps + 1):
            scale = scale0 - span_s + 2 * span_s * i / steps
            for j in range(steps + 1):
                offset = offset0 - span_o + 2 * span_o * j / steps
                got = score(scale, offset)
                if got > best:
                    best, (scale0, offset0) = got, (scale, offset)

    if score(1.0, 0.0) >= best:
        return 1.0, 0.0
    return round(scale0, 5), round(offset0, 2)


def merge(base, other, tolerance=0.15):
    """Attach to each base cue the text of every `other` cue it overlaps in time."""
    out = []
    j = 0
    for start, end, text in base:
        parts = []
        # `other` is sorted, so walk it once; back up one cue in case it started earlier.
        k = max(j - 1, 0)
        while k < len(other) and other[k][0] < end + tolerance:
            o_start, o_end, o_text = other[k]
            if o_end > start - tolerance and o_start < end + tolerance:
                parts.append(o_text)
            k += 1
        j = k
        out.append((start, end, text, " ".join(parts)))
    return out


def write(cues, path, bold="other"):
    """`bold` names which of the two lines is the original, marked with <b>.

    merge() keeps the arguments in the order it received them, so the caller decides:
    the CLI passes (base=translation, other=original) and wants "other"; relink-subs.py
    passes (base=original, other=translation) and wants "base".
    """
    lines = ["WEBVTT", ""]
    for i, (start, end, base, other) in enumerate(cues, 1):
        original, translation = (other, base) if bold == "other" else (base, other)
        lines += [str(i), f"{stamp(start)} --> {stamp(end)}"]
        lines.append(f"<b>{original}</b>" if translation else original)
        if translation:
            lines.append(translation)
        lines.append("")
    open(path, "w", encoding="utf-8").write("\n".join(lines))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("original", nargs="?", help="original-language SRT (becomes the <b> line)")
    ap.add_argument("translation", help="translation SRT")
    ap.add_argument("-o", "--out", default="subs.vtt")
    ap.add_argument(
        "--base",
        choices=("translation", "original"),
        default="translation",
        help="whose cue boundaries the merged file uses (default: translation)",
    )
    ap.add_argument(
        "--no-warp",
        action="store_true",
        help="keep the original timings as they are — correct when both files share a timeline",
    )
    args = ap.parse_args()

    base_file = args.translation if args.base == "translation" else args.original
    other_file = args.original if args.base == "translation" else args.translation
    if not base_file:
        sys.exit("--base original needs an original file")
    base = parse(base_file)
    if not base:
        sys.exit(f"no cues in {base_file}")
    other = parse(other_file) if other_file else []
    if other:
        if args.no_warp:
            scale, offset = 1.0, 0.0
        else:
            scale, offset = fit_warp(base, other)
            other = [(scale * s + offset, scale * e + offset, t) for s, e, t in other]
        merged = merge(base, other)
    else:
        scale, offset = 1.0, 0.0
        merged = [(s, e, t, "") for s, e, t in base]
    write(merged, args.out)

    paired = sum(1 for c in merged if c[3])
    fit = ""
    if other and not args.no_warp and (abs(scale - 1) > 0.001 or abs(offset) > 0.05):
        fit = f", original time-fitted (x{scale:.4f} {offset:+.1f}s)"
    print(f"{args.out}: {len(merged)} cues, {paired} with both languages{fit}")


if __name__ == "__main__":
    main()
