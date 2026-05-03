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

    const systemPrompt = `你是一位拥有10年经验的顶级商业演示顾问，曾为世界500强企业设计过数百场高管汇报。

你的任务是生成一份结构严谨、内容丰富、可以直接用来制作PPT的详细大纲。

【输出格式】
只返回合法 JSON，不要加任何其他文字、不要用 markdown 代码块。
{
  "title": "演示标题（精炼有力，不超过15字）",
  "slides": [
    {
      "title": "页面标题（10字以内）",
      "subtitle": "副标题（一句话点明本页核心）",
      "desc": "本页设计意图说明（告诉演讲者这一页要传达什么）",
      "points": ["要点1", "要点2", "要点3"],
      "visual": "建议的视觉元素（如：柱状图、时间轴、对比表格、图标矩阵等）",
      "speaker_note": "演讲者备注（讲述要点、过渡语、时间分配建议）"
    }
  ]
}

【大纲质量要求】

1. 结构逻辑：
   - 遵循「钩子→问题→分析→方案→行动」的叙事弧线
   - 每页之间有清晰的逻辑过渡，不能是孤立的信息堆砌
   - 前3页必须抓住注意力，最后1页必须有明确的行动号召

2. 内容深度：
   - 每页的 points 不少于3个，不多于6个
   - 要点必须具体、可执行，禁止空泛描述
   - 尽可能给出具体数据建议（如"同比提升12%"、"行业平均值为X"）
   - 每个要点控制在15-25字，适合放在PPT页面上

3. 视觉建议：
   - 每页必须建议一种视觉呈现方式
   - 数据页建议图表类型（柱状图/折线图/饼图/漏斗图等）
   - 流程页建议流程图/时间轴
   - 对比页建议矩阵/并排对比
   - 避免连续多页使用同一种视觉形式

4. 演讲者备注：
   - 每页提供50-80字的演讲要点
   - 包含本页到下一页的过渡语
   - 标注建议停留时间（如"此页停留2分钟"）

5. 风格适配：
   - 商务汇报：数据驱动，结论先行，每页一个核心观点
   - 产品路演：故事驱动，痛点→方案→价值→愿景
   - 学术答辩：严谨规范，文献支撑，方法论清晰
   - 培训分享：互动设计，案例丰富，循序渐进

6. 页面数量与节奏：
   - 严格按照用户要求的页数范围生成
   - 内容页占比不低于70%（封面+目录+结尾不超过3页）
   - 关键数据页和核心结论页应安排在演示的前60%位置`;

    const userPrompt = `请为以下场景生成一份专业的 PPT 大纲：

【主题】${topic}
${description ? `【补充说明】${description}` : ''}
【页数范围】${pages} 页
【目标受众】${audience}
【风格】${style}

【额外要求】
- 受众是${audience}，语言风格要匹配（对高层要结论先行、对投资人要数据说话、对学生要通俗易懂）
- 每页标题控制在10字以内，适合放在PPT页面顶部
- 如果是商务汇报，第一页之后建议加一页"汇报目录/议程"
- 最后一页除了总结，还要有明确的"下一步行动"或"联系方式"

严格只输出 JSON。`;

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
                max_tokens: 4000
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

        if (!outline?.title || !Array.isArray(outline?.slides) || outline.slides.length === 0) {
            return res.status(502).json({ error: 'AI输出格式异常' });
        }

        // 补全缺失字段，保证前端不会出错
        outline.slides = outline.slides.map(s => ({
            title: s.title || '未命名页面',
            subtitle: s.subtitle || '',
            desc: s.desc || '',
            points: Array.isArray(s.points) ? s.points : [],
            visual: s.visual || '',
            speaker_note: s.speaker_note || ''
        }));

        return res.status(200).json({ success: true, outline, usage: data.usage || {} });

    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: '生成失败' });
    }
}
