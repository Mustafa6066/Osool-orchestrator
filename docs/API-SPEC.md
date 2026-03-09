# Admin API Reference

All admin endpoints require a valid Bearer JWT in the `Authorization` header.

Obtain a token via `POST /admin/auth/login`.

Base URL: `https://api.osool.ai/admin`

---

## Authentication

### POST /admin/auth/login

```json
// Request
{ "email": "admin@osool.ai", "password": "secret" }

// Response 200
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "expiresIn": 900
}
```

- Access token expires in 15 minutes
- Refresh token valid 7 days

### POST /admin/auth/refresh

```json
// Request
{ "refreshToken": "eyJ..." }

// Response 200
{ "accessToken": "eyJ..." }
```

---

## Dashboard

### GET /admin/dashboard

Returns platform-wide metrics and trending data.

```json
{
  "system": {
    "apiUptime": "PT3H22M",
    "dbStatus": "ok",
    "redisStatus": "ok",
    "queueDepth": 14,
    "lastAgentRun": {
      "nexus": "2025-01-15T10:00:00Z",
      "marketing": "2025-01-15T06:00:00Z"
    }
  },
  "metrics": {
    "totalUsers": 1240,
    "totalChatSessions": 3870,
    "totalIntentSignals": 22140,
    "totalSEOPages": 840,
    "waitlistCount": 312,
    "today": {
      "newUsers": 18,
      "chatSessions": 94,
      "intentSignals": 510,
      "emailsSent": 7,
      "waitlistJoins": 3
    }
  },
  "funnel": {
    "discover": 9200,
    "engage": 3870,
    "qualify": 1540,
    "convert": 312,
    "retain": 98
  },
  "topTrending": {
    "developers": [{ "name": "Palm Hills", "count": 240 }],
    "locations": [{ "name": "New Cairo", "count": 310 }]
  }
}
```

---

## Agents

### GET /admin/agents

Returns all autonomous agent statuses and recent logs.

```json
{
  "agents": [
    {
      "name": "nexus",
      "status": "idle",
      "lastRun": "2025-01-15T10:00:00Z",
      "nextRun": "2025-01-15T11:00:00Z",
      "logs": [
        { "ts": "2025-01-15T10:00:01Z", "message": "▶ nexus starting" },
        { "ts": "2025-01-15T10:00:05Z", "message": "✓ nexus completed" }
      ]
    }
  ]
}
```

---

## Funnel

### GET /admin/funnel

Query: `?startDate=2025-01-01&endDate=2025-01-31`

```json
{
  "stages": [{ "stage": "discover", "count": 9200 }],
  "dailyBreakdown": [{ "date": "2025-01-15", "stage": "engage", "cnt": 94 }]
}
```

---

## Keywords

### GET /admin/keywords

Query: `?page=1&limit=20&search=palm`

```json
{
  "keywords": [{ "id": "uuid", "keyword": "palm hills new cairo", "locale": "en" }],
  "total": 540,
  "page": 1,
  "limit": 20
}
```

---

## Campaigns

### GET /admin/campaigns

```json
{
  "campaigns": [
    {
      "id": "uuid",
      "name": "New Cairo Retargeting",
      "platform": "meta",
      "type": "retargeting",
      "active": true,
      "budget": 50000,
      "spent": 12400,
      "impressions": 180000,
      "clicks": 3200,
      "conversions": 48
    }
  ]
}
```

### POST /admin/campaigns/:id/toggle

```json
// Request
{ "active": false }

// Response
{ "success": true }
```

---

## Intents

### GET /admin/intents

Query: `?page=1&limit=20&intentType=developer_inquiry&startDate=2025-01-01`

```json
{
  "intents": [{
    "id": "uuid",
    "sessionId": "uuid",
    "intentType": "developer_inquiry",
    "segment": "investor",
    "confidence": 87,
    "message": "What is the best developer in New Cairo?",
    "createdAt": "2025-01-15T09:42:00Z"
  }],
  "total": 22140,
  "page": 1,
  "limit": 20
}
```

### GET /admin/intents/heatmap

Query: `?days=30`

```json
{
  "matrix": {
    "developer_inquiry": { "2025-01-15": 42, "2025-01-16": 38 },
    "price_inquiry": { "2025-01-15": 29 }
  },
  "days": 30,
  "since": "2025-01-01T00:00:00Z"
}
```

---

## Leads

### GET /admin/leads

Query: `?page=1&limit=20`

```json
{
  "leads": [{
    "sessionId": "uuid",
    "score": 87,
    "tier": "hot",
    "segment": "investor",
    "intentCount": 12,
    "lastSeen": "2025-01-15T09:42:00Z"
  }],
  "total": 1240,
  "page": 1,
  "limit": 20
}
```

---

## Waitlist

### GET /admin/waitlist

Query: `?page=1&limit=25`

---

## SEO Content

### GET /admin/seo-content

Query: `?page=1&limit=20&status=published`

---

## Feedback Loops

### GET /admin/feedback-loops

Query: `?page=1&limit=25`

```json
{
  "events": [{
    "id": "uuid",
    "loopType": "keyword_seo_sync",
    "eventType": "feedback_loop_completed",
    "source": "feedback-loop-job",
    "summary": "Updated 12 keyword → content mappings",
    "actionsTriggered": ["seo_content_update", "keyword_priority_bump"],
    "createdAt": "2025-01-15T06:00:00Z"
  }],
  "total": 84,
  "page": 1,
  "limit": 25
}
```

---

## Error Format

```json
{
  "error": "Unauthorized",
  "statusCode": 401
}
```
