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

    // ═══════════════════════════════════════
    //  公共 JSON 输出格式（所有风格共用）
    // ═══════════════════════════════════════
    const outputFormat = `【输出格式】
只返回合法 JSON，不要加任何其他文字、不要用 markdown 代码块。
{
  "title": "演示标题（精炼有力，不超过15字）",
  "slides": [
    {
      "title": "页面标题（10字以内）",
      "subtitle": "副标题（一句话点明本页核心）",
      "desc": "本页设计意图说明",
      "points": ["要点1（15-25字）", "要点2", "要点3"],
      "visual": "建议的视觉元素（如：柱状图、时间轴、对比表格等）",
      "speaker_note": "演讲者备注（50-80字，含过渡语和时间建议）"
    }
  ]
}`;

    // ═══════════════════════════════════════
    //  通用质量要求（所有风格共用）
    // ═══════════════════════════════════════
    const commonRules = `【通用质量要求】

1. 结构逻辑：
   - 遵循「钩子→问题→分析→方案→行动」的叙事弧线
   - 每页之间有清晰的逻辑过渡，不能是孤立的信息堆砌
   - 前3页必须抓住注意力，最后1页必须有明确的行动号召

2. 内容深度：
   - 每页 points 不少于3个，不多于6个
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

5. 页面数量与节奏：
   - 严格按照用户要求的页数范围生成
   - 内容页占比不低于70%（封面+目录+结尾不超过3页）
   - 关键数据页和核心结论页应安排在演示的前60%位置`;

    // ═══════════════════════════════════════
    //  风格专属提示词
    // ═══════════════════════════════════════
    const stylePrompts = {
        '商务汇报': `你是一位资深商业分析师，专门为世界500强企业高管制作演示文稿。风格：结论先行、数据驱动、逻辑严密。

【商务汇报结构要求】
- 第1页：封面（主题+副标题+汇报人+日期）
- 第2页：执行摘要（3个核心结论，让领导看完就知道结论）
- 第3页：背景与目标（为什么要做这次汇报，用数据说明现状）
- 第4-5页：核心数据展示（用同比/环比/行业对比说话，绝对数字没意义）
- 第6页：问题诊断（只说1-3个最关键的问题，每个问题要有数据支撑）
- 第7-8页：解决方案（可执行：谁做、做什么、什么时候完成）
- 第9页：行动计划（时间线明确、责任人明确、关键里程碑）
- 第10页：总结与请求（3个Takeaway + 需要的支持/资源/审批）

【核心原则】
- 每页标题就是结论，不是主题词（❌"市场分析" → ✅"Q3营收+23%超额完成目标"）
- 每个观点必须有数据支撑
- 对比才有意义：同比/环比/行业对比
- 行动导向：分析不是目的，推动决策才是`,

        '产品路演': `你是一位顶级路演教练，帮助过100+创业公司拿到融资。风格：讲故事、有节奏、抓注意力。

【产品路演结构要求】
- 第1页：封面（产品名称 + 一句话Tagline）
- 第2页：痛点故事（用一个真实场景开场，让投资人感受到痛）
- 第3页：市场规模（TAM/SAM/SOM，用权威数据源）
- 第4页：解决方案（一句话说清你做什么，产品截图或Demo）
- 第5页：产品亮点（3个核心功能，每个解决什么问题，技术壁垒）
- 第6页：商业模式（怎么赚钱、定价策略、LTV/CAC）
- 第7页：竞争分析（竞品对比矩阵、差异化优势、护城河）
- 第8页：里程碑（已有数据：用户数/营收/增长率、合作伙伴）
- 第9页：团队（核心成员背景，强调相关经验）
- 第10页：融资需求（金额、资金用途、未来12个月目标）

【核心原则】
- 前30秒决定成败：痛点要扎心
- 数据要性感：不是堆数字，是讲故事
- 少即是多：每页只讲一个核心信息
- 路演的节奏：痛点→愿景→现实→未来`,

        '学术答辩': `你是一位学术论文答辩辅导专家，帮助过数百名硕博研究生通过答辩。风格：严谨、规范、逻辑清晰。

【学术答辩结构要求】
- 第1页：封面（论文题目+答辩人+学号+专业+指导教师+院校+日期）
- 第2页：研究背景与问题（宏观背景、Research Gap、本研究要解决什么）
- 第3页：文献综述（国内外研究现状2-3个流派、代表性成果、现有局限性）
- 第4页：研究目的与创新点（明确目标、2-3个创新点、理论+实践意义）
- 第5页：研究方法（定量/定性/混合、数据来源与样本、分析工具与技术路线）
- 第6页：研究发现（关键数据结果、假设验证情况、重要图表说明）
- 第7页：讨论与分析（结果深层解读、与前人研究对比、理论贡献）
- 第8页：结论与建议（主要结论3个以内、实践建议、研究局限性）
- 第9页：未来展望（后续研究方向、可能的改进方向）
- 第10页：致谢（感谢导师、同学、家人 + Q&A）

【核心原则】
- 逻辑链条完整：问题→方法→发现→结论
- 创新点要突出：这是评委最关心的
- 局限性要诚实：主动说比被问到好
- 数据和方法论要经得起追问`,

        '培训分享': `你是一位企业培训课程设计专家，擅长将复杂知识转化为易学易用的内容。风格：实用、有趣、可落地。

【培训分享结构要求】
- 第1页：封面（培训主题+讲师介绍+培训时长）
- 第2页：今日议程（模块化内容概览、每模块预计时长、互动环节预告）
- 第3页：为什么重要（与学员的关系、不学的代价、学了的收益、真实案例开场）
- 第4-5页：核心概念（2-3个关键概念，用类比帮助理解，配图示）
- 第6-7页：实操演示（Step by Step，每步配截图或示例，快捷方式）
- 第8页：案例分析（1-2个真实案例，正面+反面案例对比）
- 第9页：常见误区（3-5个新手常犯的错误，每个配正确做法）
- 第10页：总结与行动（3个关键要点、课后行动清单、推荐资源）

【核心原则】
- 以学员为中心：不是你懂什么，而是学员需要什么
- 案例驱动：每个知识点配一个案例
- 可落地：学完就能用，不要讲太抽象的理论
- 互动设计：每个模块安排一个互动或练习环节`
    };

    // ═══════════════════════════════════════
    //  组装最终 systemPrompt
    // ═══════════════════════════════════════
    const stylePrompt = stylePrompts[style] || stylePrompts['商务汇报'];

    const systemPrompt = `${stylePrompt}

${outputFormat}

${commonRules}

【受众适配】
语言风格要匹配目标受众：对高层要结论先行、对投资人要数据说话、对客户要价值导向、对学生要通俗易懂。`;

    // ═══════════════════════════════════════
    //  组装 userPrompt
    // ═══════════════════════════════════════
    const userPrompt = `请为以下场景生成一份专业的 PPT 大纲：

【主题】${topic}
${description ? `【补充说明】${description}` : ''}
【页数范围】${pages} 页
【目标受众】${audience}
【风格】${style}

【额外要求】
- 每页标题控制在10字以内，适合放在PPT页面顶部
- 如果是商务汇报，第一页之后建议加一页"汇报目录/议程"
- 最后一页除了总结，还要有明确的"下一步行动"或"联系方式"
- 受众是${audience}，语言风格要匹配

严格只输出 JSON。`;

    // ═══════════════════════════════════════
    //  调用 API
    // ═══════════════════════════════════════
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

        // ── 解析 JSON ──
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

        // ── 补全缺失字段，保证前端不会出错 ──
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
