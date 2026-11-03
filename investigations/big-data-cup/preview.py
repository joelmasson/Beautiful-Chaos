"""Loopback-only diagnostic viewer of a user-supplied CSV, never an app importer."""

import argparse
import csv
import hashlib
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from analyze import X, Y, Z, measure


def build_passage(path, start, count):
    frames = {}
    with path.open(newline="", encoding="utf-8-sig") as file:
        for row in csv.DictReader(file):
            frame = int(row["Image Id"].rsplit("_", 1)[1])
            if not start <= frame < start + count:
                continue
            group = frames.setdefault(frame, {
                "frame": frame, "imageId": row["Image Id"], "clock": row["Game Clock"],
                "period": row["Period"], "entities": [],
            })
            group["entities"].append({
                "kind": row["Player or Puck"], "team": row["Team"],
                "id": row["Player Id"], "jersey": row["Player Jersey Number"],
                "x": float(row[X]) if row[X] else None,
                "y": float(row[Y]) if row[Y] else None,
                "z": float(row[Z]) if row[Z] else None,
                "goal": row["Goal Score"],
            })
    if not frames:
        raise ValueError("Selected frame interval contains no source records")
    return {
        "source": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "start": start, "count": count, "assumedFps": 30,
        "frames": [frames.get(i, {"frame": i, "clock": None, "entities": []})
                   for i in range(start, start + count)],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tracking", type=Path, required=True)
    parser.add_argument("--start", type=int, default=65618)
    parser.add_argument("--frames", type=int, default=751)
    parser.add_argument("--port", type=int, default=3041)
    parser.add_argument("--measure", action="store_true", help="Print full-file measurements and exit")
    args = parser.parse_args()
    if args.measure:
        print(json.dumps(measure(args.tracking), indent=2))
        return
    if not 1 <= args.frames <= 1801:
        parser.error("--frames must be between 1 and 1801")
    data = json.dumps(build_passage(args.tracking, args.start, args.frames)).encode()
    html = Path(__file__).with_name("index.html").read_bytes()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path not in ("/", "/data.json"):
                self.send_error(404)
                return
            body = data if self.path == "/data.json" else html
            self.send_response(200)
            self.send_header("Content-Type", "application/json" if self.path == "/data.json" else "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Diagnostic only: http://127.0.0.1:{args.port} (Ctrl+C to stop)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
