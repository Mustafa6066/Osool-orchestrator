# Webhook API Specification

All webhooks are `POST` requests with JSON bodies and no authentication (public endpoints).
Each webhook is idempotent — duplicate events are safely deduplicated by the job queue.

Base URL: `POST https://api.osool.ai` (or `http://localhost:4000` in development)

---

## POST /webhook/chat-message

Fired by the frontend when a user sends a chat message.

### Request Body

```json
{
  "sessionId": "string (UUID)",
  "anonymousId": "string (UUID, optional)",
  "message": "string (the user's raw text message)",
  "pageContext": {
    "page": "string (current route, e.g. /developer/palm-hills)",
    "developer": "string (optional, matched entity)",
    "location": "string (optional, matched entity)"
  }
}
```

### Side Effects

1. Parses intent via Claude (`process-intent` BullMQ job)
2. Scores the lead (`score-lead` BullMQ job, 3s delay)
3. Evaluates email triggers (`check-email-triggers` BullMQ job, 5s delay)

### Response

```json
{ "ok": true, "jobId": "string" }
```

---

## POST /webhook/chat-session-end

Fired when a chat session is closed or times out.

### Request Body

```json
{
  "sessionId": "string (UUID)",
  "anonymousId": "string (UUID, optional)",
  "messageCount": 5,
  "durationSeconds": 240,
  "exitPage": "/developer/palm-hills"
}
```

### Side Effects

Full lead pipeline: score → audience sync → email trigger.

---

## POST /webhook/page-view

Fired on every page view (debounced by 500ms on the frontend).

### Request Body

```json
{
  "anonymousId": "string (UUID)",
  "sessionId": "string (UUID, optional)",
  "page": "/developer/sodic",
  "referrer": "https://google.com",
  "userAgent": "string",
  "properties": {
    "developer": "SODIC",
    "location": "Sheikh Zayed"
  }
}
```

### Side Effects

Stores funnel event with stage `discover`. No AI processing.

---

## POST /webhook/signup

Fired when a user submits their email (waitlist, CTA, chat collect).

### Request Body

```json
{
  "anonymousId": "string (UUID)",
  "sessionId": "string (UUID, optional)",
  "email": "user@example.com",
  "name": "Ahmed Hassan",
  "source": "chat_cta | waitlist_form | comparison_cta",
  "segment": "first_time_buyer | investor | upgrader | landlord"
}
```

### Side Effects

1. Stores waitlist entry
2. Triggers immediate lead scoring with `fullPipeline: true` 
3. Ad audience sync to Meta + Google

---

## POST /webhook/ad-click

Fired when a user clicks an ad (via UTM parameter detection or pixel).

### Request Body

```json
{
  "anonymousId": "string (UUID)",
  "platform": "meta | google",
  "campaignId": "string",
  "adSetId": "string",
  "adId": "string",
  "pageUrl": "https://osool.ai/developer/palm-hills",
  "properties": {
    "developer": "Palm Hills",
    "location": "New Cairo"
  }
}
```

### Side Effects

Stores funnel event with stage `discover`, attribution data logged to PostHog.

---

## Error Responses

All errors follow the standard envelope:

```json
{
  "ok": false,
  "error": "string (human-readable message)",
  "code": "VALIDATION_ERROR | INTERNAL_ERROR"
}
```

HTTP status codes: `400` validation, `429` rate limit, `500` internal error.

## Rate Limits

- `/webhook/chat-message`: 10 req/s per IP
- `/webhook/page-view`: 30 req/s per IP
- All others: 20 req/s per IP
