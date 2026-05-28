from planner.bot.handlers.capture import classify_text


def test_classify_url():
    assert classify_text("https://habr.com/x") == "link"
    assert classify_text("смотри тут http://a.b/c круто") == "link"


def test_classify_plain_text():
    assert classify_text("купить молоко") == "text"
