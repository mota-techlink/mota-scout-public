# Project Scout: The Inverted Atom's Sentinel

<p align="center">
  <img src="https://raw.githubusercontent.com/mota-techlink/mota-scout-public/main/assets/images/cover.jpg" alt="MOTA Project Scout">
</p>

**Project Scout** is the high-efficiency edge data gateway of the MOTA ecosystem. Designed as a "Sentinel," it monitors high-value digital noise—starting with YouTube and RSS feeds—and compresses it into structured signals via Cloudflare Workers and Supabase.

> **Structuring the Chaos:** This project is a living implementation of the "Inverted Atom" theory, where digital chaos is captured at the edge and funneled into high-density actionable insights.

<div align="left">
  <a href="https://zdoc.app/zh/mota-techlink/mota-scout-public">中文</a> | 
  <a href="https://zdoc.app/es/mota-techlink/mota-scout-public">Español</a> |  
  <a href="https://zdoc.app/de/mota-techlink/mota-scout-public">Deutsch</a> | 
  <a href="https://zdoc.app/fr/mota-techlink/mota-scout-public">Français</a> |      
  <a href="https://zdoc.app/pt/mota-techlink/mota-scout-public">Português</a> |   
  <a href="https://zdoc.app/ru/mota-techlink/mota-scout-public">Русский</a> |   
  <a href="https://zdoc.app/ko/mota-techlink/mota-scout-public">한국어</a> |   
  <a href="https://zdoc.app/ja/mota-techlink/mota-scout-public">日本語</a> |     
</div>

<br/>

## 1. Project Vision

In the MOTA architecture, **Scout** represents the sensory system. While most pipelines struggle with manual data entry, Scout automates the "Discovery Phase." 

- **Edge First:** Runs on Cloudflare Workers for 0-ms latency and global distribution.
- **Serverless Persistence:** Integrates with Supabase to maintain a real-time state of the "Digital Frontier."
- **Building in Public:** This module is open-source to showcase how to build a robust, cost-effective data pipeline in 2026.

## 2. Technical Architecture

The pipeline follows a tri-layer structure:
1. **The Scout (Public):** A Cloudflare Worker that polls YouTube/RSS feeds.
2. **The Heart (Private/Public Mix):** Supabase PostgreSQL storing video metadata and processing status.
3. **The Muscle (Private):** A local worker (via Cloudflare Tunnel) that handles heavy-duty transcription and LLM structuring.

## 3. Quick Start (How to Reference)

### a. Setup Supabase
Create a table named `videos` with the following schema:

```sql
create table videos (
  id uuid default uuid_generate_v4() primary key,
  video_id text unique,
  title text,
  url text,
  status text default 'pending', -- pending, processing, completed
  created_at timestamp with time zone default now()
);
```

### b. Deploy the Sentinel
Install Wrangler and deploy the worker to your Cloudflare account:

```Bash
npm install -g wrangler
wrangler deploy
```

### c. Configuration
Ensure you set your environment variables in Cloudflare:

SUPABASE_URL: Your project URL.

SUPABASE_KEY: Your service role key (stored as a Secret).

## 4. Why reference this project?
Unlike generic scrapers, Project Scout is optimized for:

- **Low Cost:** Utilizing Cloudflare's free tier for scheduling.

- **Scalability:** Easily add more channels or data sources by modifying the src/index.js.

- **Content Strategy:** It serves as the "First Breath" of the MOTA Content Engine, feeding data directly into the Digital Human pipeline (dh_pipeline).

## ❓ FAQ
**Q: Can I use this for non-YouTube sources?**  A: Absolutely. The architecture is modular. You can plug in any RSS or API-based source.

**Q: Is it safe to run?** A: Yes. All sensitive keys are handled via Cloudflare Secrets and GitHub Actions.


[MOTA TECHLINK:](https://motaiot.com) **From Bits to Atoms. Inverted.**