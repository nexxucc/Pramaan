from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.session import Base, engine
from app.db import models  # noqa: F401
from app.api.routes import disputes

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Pramaan — AI Risk Manager")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(disputes.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}
