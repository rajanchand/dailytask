#!/usr/bin/env python3
"""Ensure a Discord report channel exists and bot can post (no Manage Webhooks required)."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

ENV_PATH = os.environ.get("DAILYTASK_ENV", "/opt/dailytask/.env")
OUT_PATH = "/tmp/dailytask_channel.json"


def load_token() -> str:
    with open(ENV_PATH) as f:
        for line in f:
            if line.startswith("DISCORD_BOT_TOKEN="):
                return line.split("=", 1)[1].strip().strip("\"'")
    raise SystemExit("DISCORD_BOT_TOKEN missing")


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
        return e.code, {"_error": err}


def upsert_env(key: str, value: str) -> None:
    lines = open(ENV_PATH).read().splitlines()
    found = False
    out = []
    for line in lines:
        if line.startswith(f"{key}="):
            out.append(f"{key}={value}")
            found = True
        else:
            out.append(line)
    if not found:
        out.append(f"{key}={value}")
    with open(ENV_PATH, "w") as f:
        f.write("\n".join(out) + "\n")


def main() -> None:
    token = load_token()
    code, me = api("GET", "/users/@me", token)
    if code != 200:
        raise SystemExit(f"bot auth failed: {me}")
    print(f"bot={me.get('username')}")

    code, guilds = api("GET", "/users/@me/guilds", token)
    if code != 200 or not guilds:
        raise SystemExit(f"no guilds: {guilds}")

    guild = guilds[0]
    guild_id = guild["id"]
    print(f"guild={guild['name']} id={guild_id}")

    code, channels = api("GET", f"/guilds/{guild_id}/channels", token)
    if code != 200:
        raise SystemExit(f"channels failed: {channels}")

    text = [c for c in channels if c.get("type") == 0]
    print("channels=", [c["name"] for c in text])

    preferred_names = ("dailyflow", "daily-flow", "dailytask", "reports")
    channel = next((c for c in text if c.get("name", "").lower() in preferred_names), None)

    if not channel:
        code, created = api(
            "POST",
            f"/guilds/{guild_id}/channels",
            token,
            {"name": "dailyflow", "type": 0},
        )
        if code in (200, 201) and created and created.get("id"):
            channel = created
            print(f"created_channel=#{channel['name']} id={channel['id']}")
        else:
            print(f"create_channel_failed={code} {created}")
            channel = next((c for c in text if c.get("name") == "general"), None) or (
                text[0] if text else None
            )

    if not channel:
        raise SystemExit("No text channel available")

    channel_id = channel["id"]
    channel_name = channel.get("name", "unknown")
    print(f"using=#{channel_name} id={channel_id}")

    code, msg = api(
        "POST",
        f"/channels/{channel_id}/messages",
        token,
        {"content": "✅ Dailytask bot channel linked — Send Report will post here."},
    )
    if code not in (200, 201):
        raise SystemExit(f"cannot post to channel: {code} {msg}")
    print(f"test_message_ok id={msg.get('id')}")

    upsert_env("DISCORD_CHANNEL_ID", channel_id)
    upsert_env("DISCORD_CHANNEL_NAME", f"#{channel_name}")
    upsert_env("DISCORD_SERVER_NAME", guild["name"])

    with open(OUT_PATH, "w") as f:
        json.dump(
            {
                "channelId": channel_id,
                "channelName": f"#{channel_name}",
                "guildId": guild_id,
                "guildName": guild["name"],
            },
            f,
        )
    print("OK wrote", OUT_PATH)


if __name__ == "__main__":
    main()
