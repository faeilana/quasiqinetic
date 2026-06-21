import os
import sqlite3
import uuid
import time
from contextlib import contextmanager

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

from arize.otel import register
from opentelemetry import trace
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

# ── Arize AX setup ────────────────────────────────────────────────────────────
register(
    space_id=os.environ["ARIZE_SPACE_ID"],
    api_key=os.environ["ARIZE_API_KEY"],
    project_name="pose-classifier",
)
tracer = trace.get_tracer(__name__)

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(title="QuasiQinetic Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5500", "*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

FastAPIInstrumentor.instrument_app(app)

# ── SQLite ────────────────────────────────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(__file__), "wellness.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS sessions (
                session_id  TEXT PRIMARY KEY,
                game_id     TEXT NOT NULL,
                started_at  INTEGER NOT NULL,
                ended_at    INTEGER,
                score       INTEGER
            );
            CREATE TABLE IF NOT EXISTS events (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id  TEXT NOT NULL REFERENCES sessions(session_id),
                timestamp   INTEGER NOT NULL,
                action      TEXT NOT NULL,
                confidence  REAL NOT NULL,
                hip_y       REAL,
                shoulder_y  REAL,
                hip_x       REAL
            );
        """)

init_db()

# ── Schemas ───────────────────────────────────────────────────────────────────
class StartSessionRequest(BaseModel):
    game_id: str = "runner"

class EventItem(BaseModel):
    session_id:  Optional[str] = None
    timestamp:   int
    action:      str
    confidence:  float
    hip_y:       Optional[float] = None
    shoulder_y:  Optional[float] = None
    hip_x:       Optional[float] = None

class EventsBatch(BaseModel):
    events: List[EventItem]

class EndSessionRequest(BaseModel):
    score: int

# ── Routes ────────────────────────────────────────────────────────────────────
@app.post("/session/start", status_code=201)
def start_session(body: StartSessionRequest):
    session_id = str(uuid.uuid4())
    started_at = int(time.time() * 1000)
    with get_db() as conn:
        conn.execute(
            "INSERT INTO sessions (session_id, game_id, started_at) VALUES (?, ?, ?)",
            (session_id, body.game_id, started_at),
        )
    return {"session_id": session_id}

@app.post("/session/{session_id}/events")
def log_events(session_id: str, body: EventsBatch):
    with get_db() as conn:
        for event in body.events:
            conn.execute(
                """INSERT INTO events
                   (session_id, timestamp, action, confidence, hip_y, shoulder_y, hip_x)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (session_id, event.timestamp, event.action, event.confidence,
                 event.hip_y, event.shoulder_y, event.hip_x),
            )
            with tracer.start_as_current_span("pose-prediction") as span:
                span.set_attribute("action",     event.action)
                span.set_attribute("confidence", event.confidence)
                span.set_attribute("hip_y",      event.hip_y or 0)
                span.set_attribute("shoulder_y", event.shoulder_y or 0)
                span.set_attribute("hip_x",      event.hip_x or 0)
                span.set_attribute("session_id", session_id)
                span.set_attribute("timestamp",  event.timestamp)
    return {"logged": len(body.events)}

@app.post("/session/{session_id}/end")
def end_session(session_id: str, body: EndSessionRequest):
    ended_at = int(time.time() * 1000)
    with get_db() as conn:
        row = conn.execute(
            "SELECT started_at FROM sessions WHERE session_id = ?", (session_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Session not found")
        conn.execute(
            "UPDATE sessions SET ended_at = ?, score = ? WHERE session_id = ?",
            (ended_at, body.score, session_id),
        )
        event_count = conn.execute(
            "SELECT COUNT(*) FROM events WHERE session_id = ?", (session_id,)
        ).fetchone()[0]
    duration_s = (ended_at - row["started_at"]) / 1000
    return {"session_id": session_id, "score": body.score, "duration_s": duration_s, "event_count": event_count}

@app.get("/session/{session_id}")
def get_session(session_id: str):
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM sessions WHERE session_id = ?", (session_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Session not found")
        events = conn.execute(
            "SELECT * FROM events WHERE session_id = ? ORDER BY timestamp", (session_id,)
        ).fetchall()
    return {**dict(row), "events": [dict(e) for e in events]}

@app.get("/sessions")
def list_sessions():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT s.*, COUNT(e.id) as event_count FROM sessions s "
            "LEFT JOIN events e ON s.session_id = e.session_id "
            "GROUP BY s.session_id ORDER BY s.started_at DESC"
        ).fetchall()
    return [
        {**dict(r), "duration_s": (r["ended_at"] - r["started_at"]) / 1000 if r["ended_at"] else None}
        for r in rows
    ]
