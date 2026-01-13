import { createClient } from '@supabase/supabase-js';
import { XMLParser } from 'fast-xml-parser'; // 🟢 1. 引入解析库

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', 
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
};

export default {
  // --------------------------------------------------------
  // 1. 定时任务入口 (CRON TRIGGER)
  // --------------------------------------------------------
  async scheduled(event, env, ctx) {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

    console.log('[Scout] Waking up...');

    // A. 从 channels 表获取“活跃订阅清单”
    const { data: channels, error } = await supabase
      .from('channels')
      .select('channel_id, name')
      .eq('is_active', true);

    if (error || !channels || channels.length === 0) {
      console.log('[Scout] No active channels found or DB error.');
      return;
    }

    console.log(`[Scout] Loaded ${channels.length} active channels. Starting scan...`);

    // B. 遍历清单执行抓取
    for (const channel of channels) {
      ctx.waitUntil(this.scoutChannel(channel, supabase));
    }
  },

  // --------------------------------------------------------
  // 2. 核心抓取逻辑 (Scouting Logic)
  // 🔴 改造点：增加了返回值，以便 API 能拿到结果
  // --------------------------------------------------------
  async scoutChannel(channel, supabase) {
    const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.channel_id}`;
    const parser = new XMLParser({
        ignoreAttributes: false, // 读取属性，我们需要 yt:videoId
        attributeNamePrefix: "@_" // 属性前缀，防冲突
    });
    
    try {
      const response = await fetch(RSS_URL);
      if (response.status !== 200) {
        const msg = `Failed to fetch RSS for ${channel.name}: ${response.status}`;
        console.error(`[Error] ${msg}`);
        return { success: false, message: msg };
      }
      
      const xml = await response.text();
      const jsonObj = parser.parse(xml);

      // 🟢 2. 获取 Entry 列表 (兼容单个或多个的情况)
      let entries = jsonObj.feed?.entry;
      
      if (!entries) {
        return { success: true, message: 'No videos found in feed', count: 0 };
      }

      // 如果只有一个视频，parser 会解析成对象而不是数组，强制转为数组
      if (!Array.isArray(entries)) {
        entries = [entries];
      }

      // 🟢 3. 准备批量数据
      const videosToUpsert = entries.map((entry) => {
        const videoId = entry['yt:videoId'];
        const title = entry.title;
        const publishedAt = entry.published; // 获取发布时间
        
        return {
            video_id: videoId,
            title: title,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            channel_id: channel.channel_id,
            status: 'pending',
            created_at: publishedAt || new Date().toISOString() // 优先使用发布时间
        };
      });

      if (videosToUpsert.length === 0) {
          return { success: true, message: 'Parse OK but list empty', count: 0 };
      }

      // 🟢 4. 批量 Upsert (有则跳过，无则新增)
      // onConflict: 'video_id' -> 如果 video_id 冲突
      // ignoreDuplicates: true -> 忽略冲突（保留旧数据），只插入新数据
      const { error, count } = await supabase
        .from('videos')
        .upsert(videosToUpsert, { 
            onConflict: 'video_id', 
            ignoreDuplicates: true 
        })
        .select(); // 如果需要返回插入的数据，加上 .select()

      if (!error) {
        // 更新频道的“上次侦察时间”
        await supabase.from('channels')
          .update({ last_scouted_at: new Date().toISOString() })
          .eq('channel_id', channel.channel_id);
          
        // 找出最新的一条用于返回显示 (给前端弹窗用)
        const latestVideo = videosToUpsert[0]; 

        console.log(`[Scout] Processed ${channel.name}: ${videosToUpsert.length} items from RSS.`);
        
        return { 
            success: true, 
            message: 'Scan completed', 
            // 返回处理了多少条 RSS 数据
            rss_count: videosToUpsert.length,
            // 随便返回第一条作为“最新”示例
            video: { id: latestVideo.video_id, title: latestVideo.title } 
        };
      } else {
        console.error(`[DB Error] ${error.message}`);
        return { success: false, message: `DB Error: ${error.message}` };
      }

    } catch (err) {
      console.error(`[Exception] Channel ${channel.name}: ${err.message}`);
      return { success: false, message: `Exception: ${err.message}` };
    }
  },

  // --------------------------------------------------------
  // 3. API 接口
  // --------------------------------------------------------
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

    // 鉴权
    if (request.headers.get('X-Admin-Key') !== env.ADMIN_SECRET) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders } 
      });
    }

    const commonResponse = (data, status = 200) => new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
    
    // GET /channels - 列出频道
    if (request.method === 'GET' && url.pathname === '/channels') {
      const { data, error } = await supabase.from('channels').select('*').order('created_at', { ascending: false });
      return commonResponse({ data, error });
    }

    // POST /channels - 新增订阅
    if (request.method === 'POST' && url.pathname === '/channels') {
      try {
        const body = await request.json();
        const { data, error } = await supabase
          .from('channels')
          .insert({ name: body.name, channel_id: body.channel_id, is_active: true })
          .select();
        return commonResponse({ data, error });
      } catch (e) { return commonResponse({ error: 'Invalid JSON' }, 400); }
    }

    // PATCH /channels - 开关订阅
    if (request.method === 'PATCH' && url.pathname === '/channels') {
        const body = await request.json();
        const { data, error } = await supabase
            .from('channels')
            .update({ is_active: body.is_active })
            .eq('id', body.id)
            .select();
        return commonResponse({ data, error });
    }

    // 🟢 新增路由: POST /scan - 手动触发扫描
    // 前端调用示例: { "channel_id": "UCxxxxx", "name": "MKBHD" }
    if (request.method === 'POST' && url.pathname === '/scan') {
        try {
            const body = await request.json();
            
            if (!body.channel_id) {
                return commonResponse({ error: 'Missing channel_id' }, 400);
            }

            // 构造一个临时的 channel 对象
            const tempChannel = {
                channel_id: body.channel_id,
                name: body.name || 'Manual Trigger'
            };

            // 直接调用核心逻辑
            const result = await this.scoutChannel(tempChannel, supabase);
            
            return commonResponse(result);

        } catch (e) {
            return commonResponse({ error: 'Processing Error: ' + e.message }, 500);
        }
    }
    
    return new Response('Mota Scout Active', { status: 200, headers: corsHeaders });
  }
};