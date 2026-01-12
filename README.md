# Project Scout: The Inverted Atom's Sentinel (V2.0)

<p align="center">
  <img src="https://raw.githubusercontent.com/mota-techlink/mota-scout-public/main/assets/images/cover.jpg" alt="MOTA Project Scout">
</p>

**Project Scout (V2.0)** is the upgraded edge data gateway of the MOTA ecosystem. Moving beyond hardcoded logic, V2.0 is fully **Database-Driven**, dynamically fetching subscription targets from Supabase and exposing a secure API for management.

> **Structuring the Chaos:** This project is a living implementation of the "Inverted Atom" theory, where digital chaos is captured at the edge and funneled into high-density actionable insights.

---

## 1. Technical Architecture (V2.0)

The Scout acts as a dual-mode Sentinel running on **Cloudflare Workers**:

1.  **Cron Mode (The Watcher):**
    * Wakes up hourly (or as configured).
    * Queries `channels` table for `is_active=true` targets.
    * Scans YouTube RSS feeds.
    * Upserts metadata into the `videos` table.
2.  **API Mode (The Interface):**
    * Exposes secure endpoints to manage subscriptions.
    * Connects with **mota-console** (Back Office).

## 2. Configuration & Setup

### 2.1 Database Schema (Supabase)

Run the following SQL in your Supabase SQL Editor to initialize the system:

```sql
-- 1. Subscription Management Table
create table channels (
  id uuid default uuid_generate_v4() primary key,
  channel_id text not null unique, -- YouTube Channel ID
  name text,                       -- Human readable name
  is_active boolean default true,  -- Toggle for the Scout
  last_scouted_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

-- 2. Asset Queue Table
create table videos (
  id uuid default uuid_generate_v4() primary key,
  video_id text unique,
  title text,
  url text,
  channel_id text references channels(channel_id),
  status text default 'pending', -- pending -> processing -> review_needed -> published
  transcript text,
  summary_markdown text,
  created_at timestamp with time zone default now()
);

-- Enable RLS (Optional but recommended)
alter table channels enable row level security;
alter table videos enable row level security;
```
### 2.2 Environment Variables (Secrets)
For security, sensitive keys must be stored in Cloudflare Secrets (production) or .dev.vars (local).

|Variable Name|Description|Location|
| :--- | :----: | ---: |
|SUPABASE_URL|Your Project URL (e.g., https://xyz.supabase.co)|wrangler.toml (Vars)|
|SUPABASE_KEY|Service Role Secret (Bypasses RLS for backend writing)|Secrets / .dev.vars|
|ADMIN_SECRET|Custom password for API protection (e.g., mota-2026)|Secrets / .dev.vars|
|CLOUDFLARE_API_TOKEN|Cloudfalre Work template|Secrets / .dev.vars|

### 2.3 Install Superbase depencies:
```Bash
# 1. 安装 Supabase SDK (这是解决报错的关键)
npm install @supabase/supabase-js

```

## 3. Development & Deployment
**Wrangler Setup**
```Bash
# 1. 安装 Wrangler (作为开发依赖)
npm install -D wrangler@latest

# 2. 验证安装版本 (确保能正确输出版本号)
npx wrangler --version

# 3. 验证登录状态 (确保 Authentication 正确)
npx wrangler whoami
# 如果显示 "Not logged in"，请运行 npx wrangler login

#4. 实时日志功能
npx wrangler tail
```

**Remote KEY Setup**
```Bash
npx wrangler secret put SUPABASE_KEY
npx wrangler secret put ADMIN_SECRET
```

**Local Development**
To run the worker locally with access to your real Supabase instance:
1. Create a .dev.vars file in the root:
```Plaintext
  SUPABASE_KEY=your_service_role_key
  ADMIN_SECRET=your_custom_password
```
2. Run the dev server:
```Bash
npx wrangler dev --remote --test-scheduled
```

### Production Deployment
The project uses GitHub Actions for CI/CD. Push to main to deploy.Ensure GitHub Repository Secrets are set:
- CLOUDFLARE_API_TOKEN
- SUPABASE_URLSUPABASE_KEY
- ADMIN_SECRET
  
  
## 4. Testing & Usage Guide
Since the API is protected, you cannot simply visit the URL in a browser. Use the methods below.

### Method 1: API Management (via CLI)
Use curl to manage your subscription list. Replace YOUR_DOMAIN and YOUR_ADMIN_SECRET.

Add a new Channel:
```Bash
curl -X POST "https://mota-scout-public.YOUR_DOMAIN.workers.dev/channels" \
     -H "X-Admin-Key: YOUR_ADMIN_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"name": "MKBHD", "channel_id": "UCBJycsmduvYEL83R_U4JriQ"}'
```

List all Channels:
```Bash
curl -X GET "https://mota-scout-public.YOUR_DOMAIN.workers.dev/channels" \
     -H "X-Admin-Key: YOUR_ADMIN_SECRET"
```

Toggle Active Status:
```Bash
curl -X PATCH "https://mota-scout-public.YOUR_DOMAIN.workers.dev/channels" \
     -H "X-Admin-Key: YOUR_ADMIN_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"id": "CHANNEL_UUID", "is_active": false}'
```

Local Test Driven:
```Bash
curl "http://localhost:8787/scheduled?cron=0+*+*+*+*"  \
     -H "X-Admin-Key: YOUR_ADMIN_SECRET!"  \
     -H "Content-Type: application/json"
```

### Method 2: Verifying the Scout (Cron Trigger)

To verify if the Scout is correctly finding videos:
1. Open Real-time Logs:Run this in your terminal:
```Bash
npx wrangler tail
```

2. Trigger the Event:
- Go to Cloudflare Dashboard -> Workers -> Settings -> Triggers.
- Click "Test Cron".
  
3. Observe:You should see logs like [Scout] Checked MKBHD: Found Video....

## 5. API Reference

|Endpoint|Method|Payload|Description|
| :--- | :---- | :--- |:--- |
|/channels|GET|-|List all subscriptions|
/channels|POST|{name, channel_id}|Add a new subscription|
/channels|PATCH|{id, is_active}|Pause/Resume a subscription|


Authentication:All requests must include the header: X-Admin-Key: <YOUR_ADMIN_SECRET>

[MOTA TECHLINK](https://motaiot.com)