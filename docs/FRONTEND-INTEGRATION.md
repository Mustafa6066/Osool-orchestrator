# Frontend Integration Guide

This guide explains how to connect the existing Osool frontend (Next.js on Vercel) to the Osool Orchestrator backend.

**The orchestrator is headless — the frontend is NOT modified. Only webhook calls and data reads are added.**

---

## Overview

```
User Browser
  │
  ├── osool.ai (Next.js / Vercel) ← unchanged consumer frontend
  │     │ sends webhooks
  │     ▼
  └── api.osool.ai (Orchestrator API / Railway)
        │
        ├── PostgreSQL (Neon / Railway Postgres)
        ├── Redis (Upstash / Railway Redis)
        └── BullMQ workers (same process)
```

---

## 1. Environment Variables (Frontend)

Add these to your Vercel project settings:

```bash
NEXT_PUBLIC_ORCHESTRATOR_URL=https://api.osool.ai
ORCHESTRATOR_WEBHOOK_SECRET=your-webhook-secret  # optional HMAC signing
```

---

## 2. Sending Webhooks

### Chat Message Webhook

Call this after every user message (fire-and-forget, non-blocking):

```typescript
// lib/orchestrator.ts (frontend)
const BASE = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL;

export async function trackChatMessage(payload: {
  sessionId: string;
  anonymousId?: string;
  message: string;
  pageContext?: Record<string, unknown>;
}) {
  // Non-blocking — don't await in the critical path
  fetch(`${BASE}/webhook/chat-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {/* Silently ignore — never block the user */});
}
```

### Page View Webhook

```typescript
export function trackPageView(anonymousId: string, sessionId?: string) {
  fetch(`${BASE}/webhook/page-view`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      anonymousId,
      sessionId,
      page: window.location.pathname,
      referrer: document.referrer,
      userAgent: navigator.userAgent,
    }),
    keepalive: true,
  }).catch(() => {});
}
```

### Signup Webhook

```typescript
export async function trackSignup(data: {
  email: string;
  name?: string;
  source: string;
  segment?: string;
  anonymousId: string;
  sessionId?: string;
}) {
  await fetch(`${BASE}/webhook/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
```

---

## 3. Session Management

Use a consistent `sessionId` and `anonymousId` across all webhooks for the same user visit:

```typescript
// lib/session.ts (frontend)
import { randomUUID } from 'crypto';

export function getAnonymousId(): string {
  if (typeof window === 'undefined') return randomUUID();
  let id = localStorage.getItem('osool_anon_id');
  if (!id) {
    id = randomUUID();
    localStorage.setItem('osool_anon_id', id);
  }
  return id;
}

export function getSessionId(): string {
  if (typeof window === 'undefined') return randomUUID();
  let id = sessionStorage.getItem('osool_session_id');
  if (!id) {
    id = randomUUID();
    sessionStorage.setItem('osool_session_id', id);
  }
  return id;
}
```

---

## 4. Chat Widget Integration

Inside your existing chat component, add orchestrator calls:

```typescript
// Minimal integration — add these two lines to existing code
import { trackChatMessage, trackPageView } from '@/lib/orchestrator';
import { getAnonymousId, getSessionId } from '@/lib/session';

// On mount:
useEffect(() => {
  trackPageView(getAnonymousId(), getSessionId());
}, []);

// On message send:
async function handleSend(message: string) {
  await sendToYourExistingChatAPI(message);  // unchanged
  trackChatMessage({                          // add this
    sessionId: getSessionId(),
    anonymousId: getAnonymousId(),
    message,
    pageContext: { page: router.pathname },
  });
}
```

---

## 5. Ad Click Attribution

Add UTM parameter detection to capture ad click data:

```typescript
// In your root layout or _app.tsx
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const utm_source = params.get('utm_source');
  if (utm_source && (utm_source === 'facebook' || utm_source === 'google')) {
    fetch(`${BASE}/webhook/ad-click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        anonymousId: getAnonymousId(),
        platform: utm_source === 'facebook' ? 'meta' : 'google',
        campaignId: params.get('utm_campaign') ?? 'unknown',
        adSetId: params.get('utm_content') ?? 'unknown',
        adId: params.get('utm_term') ?? 'unknown',
        pageUrl: window.location.href,
      }),
      keepalive: true,
    }).catch(() => {});
  }
}, []);
```

---

## 6. Data Endpoints (Optional)

The API exposes public data endpoints for reading developer, property, and SEO content data that you can use from the frontend:

```
GET /data/developers           → developer profiles
GET /data/properties?developerId=xxx
GET /data/keywords             → trending search terms
GET /data/seo-content/:slug    → generated SEO content
GET /data/trending             → real-time trending from Redis cache
GET /data/roi-estimates?location=xxx
```

These are unauthenticated GET endpoints with 1-minute cache headers.

---

## 7. CORS Configuration

The API allows `https://osool-ten.vercel.app` and `https://osool.ai`. If you have a different domain, set `ALLOWED_ORIGINS` in the API `.env`:

```
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
```

---

## 8. Zero-Downtime Rollout Checklist

- [ ] Deploy Orchestrator API to Railway
- [ ] Set `NEXT_PUBLIC_ORCHESTRATOR_URL` in Vercel
- [ ] Add `trackPageView` to layout
- [ ] Add `trackChatMessage` to chat component
- [ ] Add `trackSignup` to email capture forms
- [ ] Run `scripts/simulate-traffic.ts` against staging
- [ ] Verify data appears in Admin Dashboard
- [ ] Enable Meta/Google audience sync in campaigns
