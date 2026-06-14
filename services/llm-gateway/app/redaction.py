"""PII redaction — strips sensitive patterns before sending to model."""
import re

_PATTERNS = [
    (re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "[SSN]"),               # SSN
    (re.compile(r"\b4[0-9]{12}(?:[0-9]{3})?\b"), "[CARD]"),         # Visa
    (re.compile(r"\b[A-Z]{2}\d{6}[A-Z]\b"), "[PASSPORT]"),          # Passport
    (re.compile(r"\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b"), "[EMAIL]"),
    (re.compile(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"), "[PHONE]"),
]


def redact(text: str) -> str:
    for pattern, replacement in _PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def redact_messages(messages: list[dict]) -> list[dict]:
    return [
        {**m, "content": redact(m["content"]) if isinstance(m.get("content"), str) else m.get("content")}
        for m in messages
    ]
