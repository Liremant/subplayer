#!/usr/bin/env python3
"""Extract entries from a zip whose names the `unzip` CLI mangles (non-ASCII paths).

    unzip-one.py list <archive>                  # video entries, one per line
    unzip-one.py extract <archive> <index> <dst> # stream one entry to dst

Python's zipfile reads the names as the UTF-8 they are; Info-ZIP reports
"filename not matched" on the same archive.
"""
import sys
import zipfile

VIDEO = (".mkv", ".avi", ".mp4", ".m4v", ".webm")


def main():
    cmd = sys.argv[1]
    path = sys.argv[2]
    with zipfile.ZipFile(path) as z:
        entries = [i for i in z.infolist() if not i.is_dir()]
        if cmd == "list":
            for index, info in enumerate(entries):
                if info.filename.lower().endswith(VIDEO):
                    print(f"{index}\t{info.filename}")
            return
        if cmd == "extract":
            index, dst = int(sys.argv[3]), sys.argv[4]
            with z.open(entries[index]) as src, open(dst, "wb") as out:
                while chunk := src.read(1 << 20):
                    out.write(chunk)
            return
    sys.exit(f"unknown command {cmd}")


if __name__ == "__main__":
    main()
