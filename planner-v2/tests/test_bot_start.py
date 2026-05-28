from planner.bot.handlers.start import greeting_text, is_owner


def test_is_owner():
    assert is_owner(555, owner_id=555) is True
    assert is_owner(999, owner_id=555) is False


def test_greeting_mentions_name():
    txt = greeting_text("Sasha")
    assert "Sasha" in txt
