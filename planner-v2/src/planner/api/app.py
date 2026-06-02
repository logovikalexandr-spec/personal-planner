import os

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles

from planner.api.routes import (
    checkitems,
    counts,
    health,
    inbox,
    me,
    projects,
    reminders,
    tags,
    tasks,
)


def create_app() -> FastAPI:
    app = FastAPI(title="planner-v2")
    app.include_router(health.router)
    app.include_router(me.router)
    app.include_router(projects.router)
    app.include_router(tasks.router)
    app.include_router(checkitems.router)
    app.include_router(reminders.router)
    app.include_router(tags.router)
    app.include_router(inbox.router)
    app.include_router(counts.router)

    # Telegram кэширует Mini App агрессивно. index.html (HTML) не кэшируем,
    # чтобы новые сборки (с новыми hashed-ассетами) всегда подхватывались.
    # Сами ассеты с хэшем в имени можно кэшировать долго.
    @app.middleware("http")
    async def cache_headers(request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        ctype = response.headers.get("content-type", "")
        if path.startswith("/app") and ("text/html" in ctype or path in ("/app", "/app/")):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        elif "/app/assets/" in path:
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response

    dist = os.environ.get("MINI_APP_DIST_DIR", "frontend/dist")
    if os.path.isdir(dist):
        app.mount("/app", StaticFiles(directory=dist, html=True), name="miniapp")
    return app


app = create_app()
