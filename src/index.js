export default {
  // 响应定时任务 (Cron Trigger)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(this.handleSchedule(env));
  },

  // 也支持手动触发调试
  async fetch(request, env) {
    return new Response(await this.handleSchedule(env));
  },

  async handleSchedule(env) {
    const CHANNEL_ID = "UCxxxxxxxxxxxx"; // 替换为你关注的 YouTube 频道 ID
    const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

    try {
      const response = await fetch(RSS_URL);
      const xml = await response.text();

      // 极简解析器：提取第一个视频 ID 和标题 (Worker 环境建议用正则或轻量处理)
      const videoId = xml.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1];
      const title = xml.match(/<title>(.*?)<\/title>/)?.[2]; // 取第二个，第一个通常是频道名
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

      if (!videoId) return "No video found";

      // 写入 Supabase (使用 Upsert 逻辑，防止重复)
      const supabaseResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/videos`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.SUPABASE_KEY}`,
          'apikey': env.SUPABASE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates' // 如果 ID 存在则忽略/合并
        },
        body: JSON.stringify({
          video_id: videoId,
          title: title,
          url: videoUrl,
          status: 'pending', // 标记为待 4090 处理
          created_at: new Date().toISOString()
        })
      });

      return `Successfully scouted: ${title}`;
    } catch (err) {
      return `Error: ${err.toString()}`;
    }
  }
};