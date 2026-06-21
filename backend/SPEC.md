# Backend API Spec — Movement Wellness

Hand this file to Devin as the complete implementation spec.

## Stack
- Python 3.11+, FastAPI, SQLite (via `sqlite3` stdlib), `uvicorn`
- `arize-otel` + `opentelemetry-sdk` for Arize AX tracing
- `python-dotenv` for env vars

## Environment variables (`.env`)
```
ARIZE_API_KEY=...
ARIZE_SPACE_ID=...
```

## SQLite schema

```sql
CREATE TABLE sessions (
  session_id  TEXT PRIMARY KEY,
  game_id     TEXT NOT NULL,
  started_at  INTEGER NOT NULL,   -- unix ms
  ended_at    INTEGER,
  score       INTEGER
);

CREATE TABLE events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL REFERENCES sessions(session_id),
  timestamp   INTEGER NOT NULL,   -- unix ms
  action      TEXT NOT NULL,
  confidence  REAL NOT NULL,
  hip_y       REAL,
  shoulder_y  REAL,
  hip_x       REAL
);
```

## Endpoints

### POST /session/start
```json
// Request
{ "game_id": "runner" }

// Response 201
{ "session_id": "<uuid4>" }
```

### POST /session/{session_id}/events
Batch insert events AND log each to Arize.

```json
// Request
{
  "events": [
    {
      "session_id": "string",
      "timestamp": 1234567890000,
      "action": "jump",
      "confidence": 0.85,
      "hip_y": 0.52,
      "shoulder_y": 0.38,
      "hip_x": 0.49
    }
  ]
}

// Response 200
{ "logged": 42 }
```

Arize AX logging per event (OpenTelemetry spans via `arize-otel`).
Initialise once at startup:
```python
from arize.otel import register
from opentelemetry import trace

register(space_id=ARIZE_SPACE_ID, api_key=ARIZE_API_KEY, model_id="pose-classifier")
tracer = trace.get_tracer(__name__)
```

Then per event batch:
```python
for event in events:
    with tracer.start_as_current_span("pose-prediction") as span:
        span.set_attribute("action",     event["action"])
        span.set_attribute("confidence", event["confidence"])
        span.set_attribute("hip_y",      event["hip_y"])
        span.set_attribute("shoulder_y", event["shoulder_y"])
        span.set_attribute("hip_x",      event["hip_x"])
        span.set_attribute("session_id", event["session_id"])
        span.set_attribute("timestamp",  event["timestamp"])
```

### POST /session/{session_id}/end
```json
// Request
{ "score": 1234 }

// Response 200
{
  "session_id": "...",
  "score": 1234,
  "duration_s": 45.2,
  "event_count": 1350
}
```

### GET /session/{session_id}
```json
// Response 200
{
  "session_id": "...",
  "game_id": "runner",
  "started_at": 1234567890000,
  "ended_at": 1234567935200,
  "score": 1234,
  "events": [ ...all event rows... ]
}
```

### GET /sessions
```json
// Response 200
[
  {
    "session_id": "...",
    "game_id": "runner",
    "started_at": 1234567890000,
    "score": 1234,
    "duration_s": 45.2,
    "event_count": 1350
  }
]
```

## CORS
Allow `http://localhost:5173` (Vite dev) and `http://localhost:5500` (Live Server).

## Arize AX startup (call this once at the top of main.py, before app routes)

```python
import os
from arize.otel import register
from opentelemetry import trace
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

register(
    space_id=os.environ["ARIZE_SPACE_ID"],
    api_key=os.environ["ARIZE_API_KEY"],
    model_id="pose-classifier",
)
tracer = trace.get_tracer(__name__)

# After `app = FastAPI()`:
FastAPIInstrumentor.instrument_app(app)
```

Each event in the `/events` batch endpoint should be wrapped in a span:
```python
for event in body.events:
    with tracer.start_as_current_span("pose-prediction") as span:
        span.set_attribute("action",     event.action)
        span.set_attribute("confidence", event.confidence)
        span.set_attribute("hip_y",      event.hip_y)
        span.set_attribute("shoulder_y", event.shoulder_y)
        span.set_attribute("hip_x",      event.hip_x)
        span.set_attribute("session_id", event.session_id)
        span.set_attribute("timestamp",  event.timestamp)
```

## Run command
```
uvicorn main:app --reload --port 8000
```
