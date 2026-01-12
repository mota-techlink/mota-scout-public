import { createClient } from '@supabase/supabase-js';

export default {
  // --------------------------------------------------------
  // 1. 定时任务入口 (CRON TRIGGER)
  // Cloudflare 会根据 wrangler.toml 里的 crons 配置按时调用这里
  // --------------------------------------------------------
  async scheduled(event, env, ctx) {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

    console.log('[Scout] Waking up...');

    // A. 从 channels 表获取“活跃订阅清单”
    const { data: channels, error } = await supabase
      .from('channels')
      .select('channel_id, name')
      .eq('is_active', true); // 只抓取开启的频道

    if (error || !channels || channels.length === 0) {
      console.log('[Scout] No active channels found or DB error.');
      return;
    }

    console.log(`[Scout] Loaded ${channels.length} active channels. Starting scan...`);

    // B. 遍历清单执行抓取
    // 使用 for 循环串行处理，避免并发过高触发 YouTube 频率限制
    for (const channel of channels) {
      // 使用 ctx.waitUntil 确保 Worker 在异步任务完成前不会被销毁
      ctx.waitUntil(this.scoutChannel(channel, supabase));
    }
  },

  // --------------------------------------------------------
  // 2. 核心抓取逻辑 (Scouting Logic)
  // --------------------------------------------------------
  async scoutChannel(channel, supabase) {
    const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.channel_id}`;
    
    try {
      const response = await fetch(RSS_URL);
      if (response.status !== 200) {
        console.error(`[Error] Failed to fetch RSS for ${channel.name}: ${response.status}`);
        return;
      }
      
      const xml = await response.text();

      // 解析 XML (针对 YouTube RSS 格式的轻量化正则)
      // 注意：这里默认只提取 feed 中的"最新"一条视频，适合高频 Cron (如每小时)
      const videoIdMatch = xml.match(/<yt:videoId>(.*?)<\/yt:videoId>/);
      const titleMatch = xml.match(/<title>(.*?)<\/title>/); // 这里的正则通常会匹配到Feed标题，需小心

      // 更稳健的简单提取逻辑：通常 Feed 的第一个 entry 是最新的
      const entryStart = xml.indexOf('<entry>');
      if (entryStart === -1) return; // 无视频
      
      const entryXml = xml.substring(entryStart);
      const videoId = entryXml.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1];
      const title = entryXml.match(/<title>(.*?)<\/title>/)?.[1];
      
      if (!videoId) return;

      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

      // C. 写入 videos 表 (Upsert: 如果存在则忽略，不存在则插入)
      const { error } = await supabase.from('videos').upsert({
        video_id: videoId,
        title: title,
        url: videoUrl,
        channel_id: channel.channel_id, // 关联外键，对应 channels 表
        status: 'pending',              // 初始状态，等待 4090 处理
        created_at: new Date().toISOString()
      }, { 
        onConflict: 'video_id',         // 根据 video_id 判断重复
        ignoreDuplicates: true          // 如果重复，什么都不做
      });

      if (!error) {
        // 可选：更新 channels 表的“上次侦察时间”
        await supabase.from('channels')
          .update({ last_scouted_at: new Date().toISOString() })
          .eq('channel_id', channel.channel_id);
          
        console.log(`[Scout] Checked ${channel.name}: ${videoId}`);
      } else {
        console.error(`[DB Error] ${error.message}`);
      }

    } catch (err) {
      console.error(`[Exception] Channel ${channel.name}: ${err.message}`);
    }
  },

  // --------------------------------------------------------
  // 3. API 接口 (用于管理后台 CRUD)
  // 允许你通过 HTTP 请求直接管理 channels 表
  // --------------------------------------------------------
  async fetch(request, env) {
    const url = new URL(request.url);
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

    // 简单鉴权：检查 Header 中的密钥
    if (request.headers.get('X-Admin-Key') !== env.ADMIN_SECRET) {
      return new Response('Unauthorized: Missing or Invalid X-Admin-Key', { status: 401 });
    }

    // GET /channels - 列出所有订阅
    if (request.method === 'GET' && url.pathname === '/channels') {
      const { data, error } = await supabase
        .from('channels')
        .select('*')
        .order('created_at', { ascending: false });
      return new Response(JSON.stringify({ data, error }), { headers: { 'Content-Type': 'application/json' }});
    }

    // POST /channels - 新增订阅
    if (request.method === 'POST' && url.pathname === '/channels') {
      try {
        const body = await request.json();
        // 插入新频道，默认 is_active = true
        const { data, error } = await supabase
          .from('channels')
          .insert({
            name: body.name,
            channel_id: body.channel_id,
            is_active: true
          })
          .select();
        return new Response(JSON.stringify({ data, error }), { headers: { 'Content-Type': 'application/json' }});
      } catch (e) {
        return new Response('Invalid JSON', { status: 400 });
      }
    }

    // PATCH /channels - 开关订阅 (暂停/恢复)
    if (request.method === 'PATCH' && url.pathname === '/channels') {
        const body = await request.json();
        const { data, error } = await supabase
            .from('channels')
            .update({ is_active: body.is_active })
            .eq('id', body.id) // 根据 UUID 更新
            .select();
        return new Response(JSON.stringify({ data, error }), { headers: { 'Content-Type': 'application/json' }});
    }

    return new Response('MOTA Scout V2 Active', { status: 200 });
  }
};