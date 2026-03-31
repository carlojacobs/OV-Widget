#!/usr/bin/env python3
"""
Tram tracker for Amsterdam, Waalstraat (stop 09082)
Shows next arrivals for tram 12 → Amstelstation
"""

import time
import urllib.request
import json
from datetime import datetime, timezone

API_URL = "https://ovzoeker.nl/api/arrivals/3258885"
REFRESH_SECONDS = 30


def fetch_arrivals():
    req = urllib.request.Request(
        API_URL,
        headers={
            "Accept": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": "https://ovzoeker.nl/halte/9d4dd6d7e6f8d66db38190048aa36a0f",
            "User-Agent": "Mozilla/5.0",
        },
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def format_time(seconds):
    if seconds < 60:
        return f"{seconds}s"
    mins, secs = divmod(seconds, 60)
    if mins < 60:
        return f"{mins}m {secs:02d}s"
    hours, mins = divmod(mins, 60)
    return f"{hours}h {mins:02d}m {secs:02d}s"


def display(data):
    now = int(time.time())
    stop = data["stop"]["stop_name"]
    arrivals = data["arrivals"]

    print(f"\n{'─' * 40}")
    print(f"  {stop}")
    print(f"  {datetime.now().strftime('%H:%M:%S')}")
    print(f"{'─' * 40}")

    shown = 0
    for a in arrivals:
        secs_away = a["ts"] - now
        if secs_away < -60:
            continue  # already departed

        line = a["route_short_name"]
        dest = a["trip_headsign"]
        eta = format_time(secs_away) if secs_away >= 0 else "now"
        kind = "live" if a["type"] == "actual" else "sched"
        delay = a["punctuality"]
        sign = "+" if delay > 0 else "-"
        delay_str = f"  ({sign}{format_time(abs(delay))})" if delay != 0 else ""

        print(f"  {line:>3}  {dest:<20}  {eta:>7}  [{kind}]{delay_str}")
        shown += 1

    if shown == 0:
        print("  No upcoming arrivals found.")

    print(f"{'─' * 40}\n")


def main():
    print("Tram tracker started. Press Ctrl+C to quit.")
    while True:
        try:
            data = fetch_arrivals()
            display(data)
        except Exception as e:
            print(f"  Error: {e}")
        time.sleep(REFRESH_SECONDS)


if __name__ == "__main__":
    main()
