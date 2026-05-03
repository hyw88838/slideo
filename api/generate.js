export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { topic, description, pages, audience, style } = req.body;
    if (!topic || !topic.trim()) return res.status(400).json({ error: '请输入主题' });

    const API_KEY = process.env.AI_API_KEY;
    const API_URL = process.env.AI_API_URL;
    const MODEL   = process.env.AI_MODEL;

    if (!API_KEY || !API_URL) {
        return res.status(500).json({ error: '服务未配置' });
    }

    const systemPrompt = `你是专业演示文稿大纲策划师。只返回合法JSON，不要加任何其他文字。
JSON结构：{"title":"标题","slides":[{"title":"页标题","desc":"描述","points":["要点1","要点2","要点3"]}]}
规则：每页2-5个要点，内容专业具体，第一页封面，最后一页总结。`;

    const userPrompt = `主题：${topic}
${description ? '补充：' + description : ''}
页数：${pages}页
受众：${audience}
风格：${style}
严格只输出JSON。`;

    try {
        const resp = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + API_KEY
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.7,
                max_tokens: 2500
            })
        });

        if (!resp.ok) {
            const t = await resp.text();
            console.error('API Error:', resp.status, t);
            return res.status(502).json({ error: 'AI服务不可用' });
        }

        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) return res.status(502).json({ error: 'AI未返回内容' });

        let outline;
        try { outline = JSON.parse(content); }
        catch {
            const m = content.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (m) outline = JSON.parse(m[1].trim());
            else {
                const b = content.match(/\{[\s\S]*\}/);
                outline = b ? JSON.parse(b[0]) : null;
            }
        }

        if (!outline?.title || !Array.isArray(outline?.slides)) {
            return res.status(502).json({ error: 'AI输出格式异常' });
        }

        return res.status(200).json({ success: true, outline, usage: data.usage || {} });

    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: '生成失败' });
    }
}
