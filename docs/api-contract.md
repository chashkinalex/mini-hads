# API Contract

## Auth

### `POST /auth/platform-login`

Request:

```json
{
  "platform": "max",
  "launchData": {
    "raw": "..."
  }
}
```

Response:

```json
{
  "doctor": {
    "id": "doc_123",
    "platform": "max",
    "displayName": "Dr. Example"
  },
  "accessToken": "jwt-or-session-token"
}
```

## Sessions

### `POST /sessions`

Creates a QR-bound survey session for the authenticated doctor.

### `GET /sessions/:token`

Returns public session info for the patient flow.

### `POST /sessions/:token/open`

Marks that a patient opened the questionnaire.

### `POST /sessions/:token/submit`

Request:

```json
{
  "answers": {
    "q1": 2,
    "q2": 1
  }
}
```

Response:

```json
{
  "result": {
    "anxietyScore": 9,
    "depressionScore": 6,
    "anxietyLevel": "borderline",
    "depressionLevel": "normal"
  }
}
```

## Doctor data

### `GET /doctors/me/sessions`

Returns active and recent sessions.

### `GET /doctors/me/results`

Returns recent HADS submissions for the doctor.
