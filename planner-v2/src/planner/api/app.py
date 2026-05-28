import os

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from planner.api.routes import health, me


def create_app() -> FastAPI:
    app = FastAPI(title="planner-v2")
    app.include_router(health.router)
    app.include_router(me.router)

    dist = os.environ.get("MINI_APP_DIST_DIR", "frontend/dist")
    if os.path.isdir(dist):
        app.mount("/app", StaticFiles(directory=dist, html=True), name="miniapp")
    return app


app = create_app()
