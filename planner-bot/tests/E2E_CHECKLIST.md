# E2E smoke (manual)

Run after deploy runbook completes on the VPS.

1. Both siblings send `/start`. Bot greets each by name.
2. Sasha forwards a URL. Within 5 sec: NocoDB Inbox row appears, .md file
   appears in `_inbox/`, GitHub shows new commit.
3. Sasha presses **Обработать**. Bot proposes project. Sasha accepts.
   File moves to project subfolder. NocoDB row → `status=processed`.
4. Sasha sends a voice note. Whisper transcribes. NocoDB `transcript` filled.
5. Sasha sends a photo with caption. NocoDB row, attachment saved.
6. Seryozha sends `/inbox`. Sees own + shared. Does NOT see Sasha's
   `personal-sasha` items or Ctok items.
7. Seryozha runs `/project ctok`. Bot replies "приватный".
8. Sasha writes "завтра 14:00 созвон с Vesna клиентом". Bot prompts
   quadrant. Sasha picks Q2. Task is created with correct date.
9. Sasha runs `/today` and `/week`. Output matches NocoDB Tasks view.
10. Sasha runs `/find postgresql`. Returns matching items.
11. `/stats` shows non-zero counts and current month's LLM cost.
12. `docker logs planner-bot` shows no exceptions over an hour.
