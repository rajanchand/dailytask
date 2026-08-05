#!/usr/bin/env python3
"""Create/reuse a Discord webhook for #dailyflow and upsert into Postgres."""

from __future__ import annotations

import json
import os
import subprocess
import uuid
import urllib.error
import urllib.request

ENV_PATH = os.environ.get("DAILYTASK_ENV", "/opt/dailytask/.env")
COMPOSE = os.environ.get(
    "DAILYTASK_COMPOSE",
    "docker compose -f /opt/dailytask/docker-compose.prod.yml",
)


def load_token() -> str:
    with open(ENV_PATH) as f:
        for line in f:
            if line.startswith("DISCORD_BOT_TOKEN="):
                return line.split("=", 1)[1].strip().strip("\"'")
    raise SystemExit("DISCORD_BOT_TOKEN missing in .env")


def api(method: str, path: str, token: str, data: dict | None = None):
    body = None if data is None else json.dumps(data).encode()
    req = urllib.request.Request(
        f"https://discord.com/api/v10{path}",
        data=body,
        headers={
            "Authorization": f"Bot {token}",
            "Content-Type": "application/json",
            "User-Agent": "DailytaskBot (https://dailytask.zero-trust-security.org, 1.0)",
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            raw = res.read().decode()
            return res.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        raise SystemExit(f"Discord API {e.code} {path}: {err[:800]}") from e


def preferred_channel(channels: list[dict]) -> dict | None:
    names = {"dailyflow", "daily-flow", "dailytask", "reports", "general"}
    text = [c for c in channels if c.get("type") == 0]
    for c in text:
        if c.get("name", "").lower() in names:
            return c
    return text[0] if text else None


def psql(sql: str) -> str:
    cmd = f"{COMPOSE} exec -T postgres psql -U dailyflow -d dailyflow -v ON_ERROR_STOP=1 -Atc {json.dumps(sql)}"
    return subprocess.check_output(cmd, shell=True, text=True).strip()


def main() -> None:
    token = load_token()
    _, me = api("GET", "/users/@me", token)
    print(f"bot={me.get('username')}#{me.get('discriminator')}")

    _, guilds = api("GET", "/users/@me/guilds", token)
    if not guilds:
        raise SystemExit("Bot is not in any guild")

    target_guild = None
    target_channel = None
    for g in guilds:
        _, channels = api("GET", f"/guilds/{g['id']}/channels", token)
        print(f"guild={g['name']} text_channels={[c['name'] for c in channels if c.get('type')==0]}")
        ch = preferred_channel(channels)
        if ch and ch.get("name", "").lower() in {"dailyflow", "daily-flow", "dailytask", "reports"}:
            target_guild, target_channel = g, ch
            break
        if target_channel is None and ch:
            target_guild, target_channel = g, ch

    if not target_guild or not target_channel:
        raise SystemExit("No text channel found")

    print(f"target=#{target_channel['name']} guild={target_guild['name']}")

    _, hooks = api("GET", f"/channels/{target_channel['id']}/webhooks", token)
    hook = next(
        (h for h in hooks if (h.get("name") or "").lower() in {"dailytask", "dailyflow"}),
        None,
    )
    if not hook:
        _, hook = api(
            "POST",
            f"/channels/{target_channel['id']}/webhooks",
            token,
            {"name": "Daily Task"},
        )
        print(f"created_webhook id={hook['id']}")
    else:
        print(f"reusing_webhook id={hook['id']}")

    webhook_url = f"https://discord.com/api/webhooks/{hook['id']}/{hook['token']}"
    team_id = psql("SELECT id FROM teams LIMIT 1;")
    if not team_id:
        raise SystemExit("No team in database")

    iid = str(uuid.uuid4())
    server = target_guild["name"].replace("'", "''")
    channel = ("#" + target_channel["name"]).replace("'", "''")
    wu = webhook_url.replace("'", "''")
    events = (
        '{"taskCreated": true, "taskAssigned": true, "statusChanged": true, '
        '"taskCompleted": true, "taskOverdue": true, "morningReminder": true, '
        '"dailySummary": true}'
    )
    sql = f"""
INSERT INTO discord_integrations (id, team_id, webhook_url, server_name, channel_name, enabled, event_types)
VALUES (
  '{iid}',
  '{team_id}',
  '{wu}',
  '{server}',
  '{channel}',
  true,
  '{events}'::jsonb
)
ON CONFLICT (team_id) DO UPDATE SET
  webhook_url = EXCLUDED.webhook_url,
  server_name = EXCLUDED.server_name,
  channel_name = EXCLUDED.channel_name,
  enabled = true,
  event_types = EXCLUDED.event_types,
  updated_at = now();
"""
    psql(sql)
    row = psql(
        "SELECT server_name || '|' || channel_name || '|' || enabled::text FROM discord_integrations LIMIT 1;"
    )
    print(f"db_row={row}")

    # Post a confirmation message
    data = json.dumps(
        {
            "content": (
                "✅ Daily Task Managing System webhook restored — Send Report on /reports will post here."
            )
        }
    ).encode()
    req = urllib.request.Request(
        webhook_url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as res:
        print(f"test_post={res.status}")

    print("OK")


if __name__ == "__main__":
    main()
