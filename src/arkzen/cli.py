"""Small operator CLI for exercising Phase 1 capture and monitoring."""

from __future__ import annotations

import argparse
import asyncio
import logging
from pathlib import Path

from .intent_capture import create_watch_profile_from_input
from .monitoring import SignalMonitor, TwscrapePostSource, load_twscrape_accounts
from .persistence import SQLiteRepository


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="arkzen")
    parser.add_argument("--database", default="arkzen.sqlite3", help="SQLite database path")
    subparsers = parser.add_subparsers(dest="command", required=True)

    capture = subparsers.add_parser("create-profile")
    capture.add_argument("--owner", required=True)
    capture.add_argument("--description", required=True)
    capture.add_argument("--keywords", default="")
    capture.add_argument("--phrases", default="")
    capture.add_argument("--location")
    capture.add_argument("--language")
    capture.add_argument("--paused", action="store_true")

    subparsers.add_parser("list-profiles")
    evidence = subparsers.add_parser("list-evidence")
    evidence.add_argument("--limit", type=int, default=50)
    monitor = subparsers.add_parser("monitor-once")
    monitor.add_argument("--limit", type=int, default=20)
    monitor.add_argument("--pool-database", default="twscrape_accounts.sqlite3")
    return parser


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = build_parser().parse_args(argv)
    repository = SQLiteRepository(Path(args.database))
    try:
        if args.command == "create-profile":
            profile = create_watch_profile_from_input(
                repository,
                owner=args.owner,
                source_description=args.description,
                keywords=args.keywords,
                phrase_patterns=args.phrases,
                location_filter=args.location,
                language_filter=args.language,
                active=not args.paused,
            )
            print(profile.id)
            return 0
        if args.command == "list-profiles":
            for profile in repository.list_watch_profiles():
                state = "active" if profile.active else "paused"
                terms = ", ".join((*profile.keywords, *profile.phrase_patterns))
                print(f"{profile.id}\t{state}\t{profile.owner}\t{terms}")
            return 0
        if args.command == "list-evidence":
            rows = list(repository.list_evidence())[-args.limit :]
            for evidence in rows:
                print(
                    f"{evidence.id}\t{evidence.watch_profile_id}\t"
                    f"{evidence.author_handle}\t{evidence.post_timestamp.isoformat()}\t"
                    f"{evidence.raw_post_content}"
                )
            return 0
        if args.command == "monitor-once":
            accounts = load_twscrape_accounts()
            source = TwscrapePostSource(accounts, pool_database=args.pool_database)
            captured = asyncio.run(
                SignalMonitor(repository, source).poll_once(limit_per_profile=args.limit)
            )
            print(f"captured={captured}")
            return 0
    finally:
        repository.close()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
