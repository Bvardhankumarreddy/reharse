"""Thin async wrapper around the Anthropic SDK."""
from __future__ import annotations

import json
from typing import AsyncIterator

import anthropic

from ..config import settings

_client: anthropic.AsyncAnthropic | None = None


def get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


async def complete(
    *,
    model: str,
    system: str,
    messages: list[dict],
    max_tokens: int = 4096,
    temperature: float = 1.0,
) -> str:
    """Single-shot completion — returns full text."""
    client = get_client()
    response = await client.messages.create(
        model=model,
        system=system,
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
    )
    block = response.content[0]
    if block.type != "text":
        raise ValueError(f"Unexpected content block type: {block.type}")
    return block.text


async def complete_json(
    *,
    model: str,
    system: str,
    messages: list[dict],
    max_tokens: int = 4096,
) -> dict:
    """Completion that parses the response as JSON."""
    text = await complete(
        model=model,
        system=system,
        messages=messages,
        max_tokens=max_tokens,
        temperature=1.0,
    )
    # Strip markdown code fences if present
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        text = text.rsplit("```", 1)[0]
    return json.loads(text)


async def stream_text(
    *,
    model: str,
    system: str,
    messages: list[dict],
    max_tokens: int = 2048,
) -> AsyncIterator[str]:
    """Streaming completion — yields text deltas."""
    client = get_client()
    async with client.messages.stream(
        model=model,
        system=system,
        messages=messages,
        max_tokens=max_tokens,
    ) as stream:
        async for text in stream.text_stream:
            yield text
