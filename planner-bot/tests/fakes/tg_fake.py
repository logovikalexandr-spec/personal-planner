"""Minimal Update/Context fakes — only the surface our handlers touch."""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class FakeUser:
    id: int
    full_name: str = ""
    username: str | None = None
    is_bot: bool = False


@dataclass
class FakeChat:
    id: int
    type: str = "private"


@dataclass
class FakeMessage:
    text: str | None = None
    voice: Any = None
    photo: list = field(default_factory=list)
    document: Any = None
    chat: FakeChat = None
    from_user: FakeUser = None
    sent: list = field(default_factory=list)

    async def reply_text(self, text: str, **kwargs):
        self.sent.append({"text": text, **kwargs})


@dataclass
class FakeUpdate:
    update_id: int
    effective_user: FakeUser
    effective_chat: FakeChat
    message: FakeMessage


class FakeContext:
    def __init__(self):
        self.bot_data: dict = {}
        self.user_data: dict = {}
        self.chat_data: dict = {}
        self.args: list[str] = []


def make_update(text: str, user_id: int = 100, chat_id: int = 100,
                full_name: str = "Sasha") -> FakeUpdate:
    user = FakeUser(id=user_id, full_name=full_name)
    chat = FakeChat(id=chat_id)
    msg = FakeMessage(text=text, chat=chat, from_user=user)
    return FakeUpdate(update_id=user_id, effective_user=user,
                      effective_chat=chat, message=msg)
