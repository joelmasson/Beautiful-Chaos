"""Read-only CSV quality measurements; no player stitching or gap interpolation."""

import argparse
import csv
import hashlib
import json
import math
import statistics
from collections import Counter, defaultdict
from pathlib import Path

X = "Rink Location X (Feet)"
Y = "Rink Location Y (Feet)"
Z = "Rink Location Z (Feet)"


def clock_seconds(value):
    minutes, seconds = value.split(":")
    return int(minutes) * 60 + int(seconds)


def summary(values):
    if not values:
        return None
    ordered = sorted(values)
    return {
        "count": len(values),
        "min": ordered[0],
        "median": statistics.median(values),
        "mean": statistics.mean(values),
        "p95": ordered[math.ceil(0.95 * len(values)) - 1],
        "max": ordered[-1],
    }


def distribution(values):
    bins = Counter()
    for delta in values:
        if delta == 1:
            bins["1 frame"] += 1
        elif delta <= 3:
            bins["2-3 frames"] += 1
        elif delta <= 30:
            bins["4-30 frames"] += 1
        elif delta <= 180:
            bins["31-180 frames"] += 1
        else:
            bins[">180 frames"] += 1
    return dict(bins)


def load(path):
    with Path(path).open(newline="", encoding="utf-8-sig") as file:
        reader = csv.DictReader(file)
        fields = reader.fieldnames
        rows = list(reader)
    if not rows or any(None in row or any(v is None for v in row.values()) for row in rows):
        raise ValueError(f"{path}: empty or incomplete CSV row")
    return fields, rows


def measure(path):
    fields, rows = load(path)
    frames = {}
    tracks = defaultdict(list)
    jerseys = defaultdict(set)
    by_jersey = defaultdict(set)
    identity_counts = Counter()
    jersey_counts = Counter()
    coordinate_missing = Counter()
    ranges = defaultdict(list)
    speeds = []
    duplicate_rows = len(rows) - len({tuple(row.values()) for row in rows})
    for row in rows:
        frame = int(row["Image Id"].rsplit("_", 1)[1])
        signature = (row["Period"], row["Game Clock"])
        if frame in frames and frames[frame] != signature:
            raise ValueError("Inconsistent period/clock within a frame")
        frames[frame] = signature
        kind = row["Player or Puck"]
        if row[X] == "" or row[Y] == "":
            coordinate_missing[kind] += 1
        else:
            for axis in (X, Y):
                ranges[f"{kind}/{axis}"].append(float(row[axis]))
        if kind == "Player":
            key = (row["Team"], row["Player Id"])
            tracks[key].append((frame, row))
            identity_counts[(frame, *key)] += 1
            jersey = row["Player Jersey Number"]
            if jersey and jersey != "n/a":
                jerseys[key].add(jersey)
                by_jersey[(row["Team"], jersey)].add(row["Player Id"])
                jersey_counts[(frame, row["Team"], jersey)] += 1
    frame_ids = sorted(frames)
    frame_deltas = [b - a for a, b in zip(frame_ids, frame_ids[1:])]
    clock_values = [clock_seconds(frames[f][1]) for f in frame_ids if frames[f][1]]
    clock_deltas = [clock_seconds(frames[a][1]) - clock_seconds(frames[b][1])
                    for a, b in zip(frame_ids, frame_ids[1:])
                    if frames[a][1] and frames[b][1]]
    clock_frames = Counter(clock_values)
    track_stats = []
    all_deltas = []
    contiguous_runs = []
    for key, observations in sorted(tracks.items()):
        observations.sort(key=lambda pair: pair[0])
        deltas = [b[0] - a[0] for a, b in zip(observations, observations[1:])]
        all_deltas.extend(deltas)
        run = 1
        for (f1, a), (f2, b) in zip(observations, observations[1:]):
            if (f2 == f1 + 1 and a["Player Jersey Number"] == b["Player Jersey Number"]
                    and all(r[axis] for r in (a, b) for axis in (X, Y))):
                run += 1
            else:
                if all(a[axis] for axis in (X, Y)):
                    contiguous_runs.append(run)
                run = 1
        if all(observations[-1][1][axis] for axis in (X, Y)):
            contiguous_runs.append(run)
        for (f1, a), (f2, b) in zip(observations, observations[1:]):
            if f2 - f1 == 1 and all(r[axis] for r in (a, b) for axis in (X, Y)):
                speeds.append(math.hypot(float(b[X]) - float(a[X]), float(b[Y]) - float(a[Y])) * 30)
        track_stats.append({
            "team": key[0], "id": key[1], "jerseys": sorted(jerseys[key]),
            "samples": len(observations), "first_frame": observations[0][0],
            "last_frame": observations[-1][0], "gaps_gt_1_frame": sum(d > 1 for d in deltas),
            "max_gap_frames": max(deltas, default=0),
            "samples_per_nominal_second_first_last": len(observations) * 30 /
                (observations[-1][0] - observations[0][0] + 1),
        })
    per_frame = Counter(int(r["Image Id"].rsplit("_", 1)[1]) for r in rows if r["Player or Puck"] == "Player")
    goalie_sides = {}
    for team in ("Home", "Away"):
        vals = [float(r[X]) for r in rows if r["Team"] == team and
                r["Player Jersey Number"] == "Go" and r[X]]
        goalie_sides[team] = summary(vals)
    raw_ids = defaultdict(set)
    for team, track in tracks:
        raw_ids[track].add(team)
    missing_slots = sum(max(0, d - 1) for d in all_deltas)
    return {
        "file": Path(path).name, "bytes": Path(path).stat().st_size,
        "sha256": hashlib.sha256(Path(path).read_bytes()).hexdigest(),
        "fields": fields, "records": len(rows),
        "kind_counts": dict(Counter(r["Player or Puck"] for r in rows)),
        "periods": dict(Counter(r["Period"] for r in rows)),
        "empty_by_field": {f: sum(r[f] == "" for r in rows) for f in fields},
        "na_by_field": {f: sum(r[f] == "n/a" for r in rows) for f in fields},
        "unique_frames": len(frames), "unique_clocks": len(clock_frames),
        "frame_span": [frame_ids[0], frame_ids[-1]],
        "clock_span_seconds_remaining": [min(clock_values), max(clock_values)] if clock_values else None,
        "frames_missing_clock": len(frames) - len(clock_values),
        "frames_per_clock_second": summary(list(clock_frames.values())),
        "frames_per_clock_histogram": dict(sorted(Counter(clock_frames.values()).items())),
        "frame_deltas": summary(frame_deltas), "frame_gap_distribution": distribution(frame_deltas),
        "missing_suffix_frames": sum(d - 1 for d in frame_deltas),
        "clock_missing_integer_seconds": max(clock_values) - min(clock_values) + 1 - len(clock_frames) if clock_values else None,
        "clock_backward_transitions": sum(d < 0 for d in clock_deltas),
        "clock_forward_gt_1_second": sum(d > 1 for d in clock_deltas),
        "unique_raw_player_ids": len(raw_ids), "unique_team_track_ids": len(tracks),
        "raw_ids_on_both_teams": sum(len(teams) > 1 for teams in raw_ids.values()),
        "unique_team_jerseys_including_Go": len(by_jersey),
        "missing_player_id_rows": sum(r["Player or Puck"] == "Player" and
                                      r["Player Id"] in ("", "n/a") for r in rows),
        "missing_player_jersey_rows": sum(r["Player or Puck"] == "Player" and
                                          r["Player Jersey Number"] in ("", "n/a") for r in rows),
        "track_multiple_jerseys": [(*key, sorted(v)) for key, v in jerseys.items() if len(v) > 1],
        "duplicate_full_rows": duplicate_rows,
        "duplicate_frame_team_track_extra_rows": sum(n - 1 for n in identity_counts.values() if n > 1),
        "simultaneous_jersey_duplicate_frames": sum(n > 1 for n in jersey_counts.values()),
        "simultaneous_numeric_jersey_duplicates": sum(n > 1 and key[-1] != "Go" for key, n in jersey_counts.items()),
        "tracks_with_multiple_numeric_jerseys": sum(len(v - {"Go"}) > 1 for v in jerseys.values()),
        "coordinate_missing_by_kind": dict(coordinate_missing),
        "coordinate_ranges": {key: [min(v), max(v)] for key, v in ranges.items()},
        "outside_rectangle_rows": sum(bool(r[X] and r[Y]) and
                                       (abs(float(r[X])) > 100 or abs(float(r[Y])) > 42.5) for r in rows),
        "boundary_rows": sum(bool(r[X] and r[Y]) and
                             (abs(float(r[X])) >= 99.9 or abs(float(r[Y])) >= 42.48) for r in rows),
        "z_values": dict(Counter(r[Z] for r in rows)),
        "goal_markers": dict(Counter(r["Goal Score"] for r in rows)),
        "samples_per_track": summary([len(v) for v in tracks.values()]),
        "track_frame_deltas": summary(all_deltas), "track_gap_distribution": distribution(all_deltas),
        "tracks_disappear_reappear": sum(s["gaps_gt_1_frame"] > 0 for s in track_stats),
        "within_first_last_track_missing_slots": missing_slots,
        "conditional_track_coverage": sum(len(v) for v in tracks.values()) /
            (sum(len(v) for v in tracks.values()) + missing_slots),
        "coordinate_valid_same_jersey_run_lengths_frames": summary(contiguous_runs),
        "runs_spanning_six_nominal_seconds": sum(n >= 181 for n in contiguous_runs),
        "samples_in_six_second_runs": sum(n for n in contiguous_runs if n >= 181),
        "players_per_frame": summary([per_frame[f] for f in frame_ids]),
        "frames_without_players": sum(per_frame[f] == 0 for f in frame_ids),
        "goalie_x": goalie_sides,
        "consecutive_speed_ft_s_at_assumed_30fps": summary(speeds),
        "consecutive_speed_over_60ft_s": sum(v > 60 for v in speeds),
        "track_ids_per_team_jersey": {"/".join(key): len(v) for key, v in sorted(by_jersey.items())},
        "tracks": track_stats,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv", type=Path, nargs="+")
    args = parser.parse_args()
    print(json.dumps([measure(path) for path in args.csv], indent=2))
