import dotenv from 'dotenv'

dotenv.config()

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type ChatResponse = {
  text: string
}

class AIService {
  private readonly apiKey: string
  private readonly apiBaseUrl: string
  private readonly model: string

  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY
    this.apiBaseUrl = process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com'
    this.model = process.env.DEEPSEEK_MODEL || 'deepseek-chat'

    if (!this.apiKey) {
      throw new Error('DEEPSEEK_API_KEY is not set')
    }
  }

  private stripMarkdownFormatting(text: string): string {
    if (!text) return ''
    let cleaned = text
      // remove fenced code blocks
      .replace(/```[\s\S]*?```/g, '')
      // inline code
      .replace(/`([^`]*)`/g, '$1')
      // bold/italic
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      // headings
      .replace(/^#{1,6}\s+/gm, '')
      // list bullets
      .replace(/^\s*[-*•·‣∙◦✔️✓]\s+/gm, '')
      // numbered lists
      .replace(/^\s*\d+[).]\s+/gm, '')
      // stray bullet-like symbols
      .replace(/[•◆◦▪︎▸►–—]+/g, ' ')
      // collapse spaces at EOL
      .replace(/[ \t]+$/gm, '')
      // collapse too many newlines
      .replace(/\n{3,}/g, '\n\n')

    return cleaned.trim()
  }

  private sanitizeListLines(lines: string[]): string[] {
    return lines
      .map(s => s
        .replace(/^[-*•·‣∙◦✔️✓\d).\s]+/, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
      )
      .filter(Boolean)
  }

  private async chat(messages: ChatMessage[], systemPrompt?: string): Promise<ChatResponse> {
    const fullMessages: ChatMessage[] = systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...messages]
      : messages

    const response = await fetch(`${this.apiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: fullMessages,
        temperature: 0.3
      })
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`DeepSeek error ${response.status}: ${errorText}`)
    }

    const data: any = await response.json()
    const content: string = data?.choices?.[0]?.message?.content || ''
    return { text: this.stripMarkdownFormatting(content) }
  }

  private async chatRaw(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
    const fullMessages: ChatMessage[] = systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...messages]
      : messages

    const response = await fetch(`${this.apiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: fullMessages,
        temperature: 0.3
      })
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`DeepSeek error ${response.status}: ${errorText}`)
    }

    const data: any = await response.json()
    return data?.choices?.[0]?.message?.content || ''
  }

  async generateGoalDescription(input: { title: string; context?: string }): Promise<string> {
    const system = 'Ты помощник по целям. Пиши кратко, структурировано и по делу.'
    const prompt = `Сформируй качественное описание цели на основе заголовка и контекста.
Заголовок: ${input.title}
Контекст: ${input.context || '—'}
Выведи 2-3 абзаца.`
    const { text } = await this.chat([{ role: 'user', content: prompt }], system)
    return this.stripMarkdownFormatting(text)
  }

  async generateTasks(input: { title: string; context?: string; maxItems?: number; deadline?: string }): Promise<Array<{ description: string; deadline?: string }>> {
    const max = input.maxItems || 6
    const timeframe = input.deadline || 'не задан'
    const todayIso = new Date().toISOString()
    const system = 'Ты планировщик. Верни строго JSON без markdown и текста вокруг.'
    const prompt = `Сгенерируй до ${max} базовых задач для достижения цели.
Цель: ${input.title}
Контекст: ${input.context || '—'}
Срок выполнения всей цели: ${timeframe}
Сегодняшняя дата (UTC): ${todayIso}
Требование по срокам задач: каждой задаче присвой свой дедлайн в формате ISO-8601 (например, 2025-03-31T00:00:00.000Z), распределив дедлайны равномерно от сегодняшнего дня по всему сроку. Дедлайны задач должны отличаться друг от друга и идти по времени вперёд.
Формат ответа: массив JSON вида [{"description":"текст задачи","deadline":"ISO-8601"}].`

    // Используем raw, чтобы не потерять JSON в код-блоках
    const raw = await this.chatRaw([{ role: 'user', content: prompt }], system)

    const parsed = this.tryExtractJson<any>(raw)
    if (Array.isArray(parsed)) {
      const cleaned = parsed
        .slice(0, max)
        .map((item: any) => ({
          description: String(item?.description || '').trim(),
          deadline: item?.deadline ? String(item.deadline).trim() : undefined
        }))
        .filter(t => t.description.length > 0)
      if (cleaned.length) return cleaned
    }

    // Фолбэк: вернём только описания без дедлайнов
    const lines = raw.split('\n')
    const items = this.sanitizeListLines(lines).slice(0, max)
    return items.map(description => ({ description, deadline: undefined }))
  }

  async generateMotivation(input: { completed: number; total: number }): Promise<string> {
    const system = 'Ты мотиватор. Пиши дружелюбно и кратко, 1-2 предложения.'
    const prompt = `Сгенерируй персональное мотивационное сообщение.
Выполнено: ${input.completed} из ${input.total}.
Пример стиля: "Отлично, ты завершил ${input.completed} из ${input.total} задач, осталось немного — так держать!"`
    const { text } = await this.chat([{ role: 'user', content: prompt }], system)
    return this.stripMarkdownFormatting(text)
  }

  private condenseWeekly(goalsSummary: any[], completedGoals?: any[]): string {
    const lines: string[] = []
    if (Array.isArray(goalsSummary)) {
      goalsSummary.slice(0, 10).forEach((g: any, idx: number) => {
        const title = (g?.title || '').toString().trim()
        const createdAt = g?.createdAt || ''
        const deadlineAt = g?.deadlineAt || ''
        const timeLeftDays = typeof g?.timeLeftDays === 'number' ? g.timeLeftDays : ''
        const timeLeftHuman = g?.timeLeftHuman || ''
        const completed = g?.completed ?? ''
        const total = g?.total ?? ''
        const done = Array.isArray(g?.completedTasks)
          ? g.completedTasks.slice(0, 5).map((t: any) => `${t?.description || ''} (${t?.dateCompleted || ''})`).join('; ')
          : ''
        const pending = Array.isArray(g?.pendingTasks)
          ? g.pendingTasks.slice(0, 5).map((t: any) => `${t?.description || ''} (до ${t?.deadline || ''})`).join('; ')
          : ''
        lines.push(`${idx + 1}. ${title} [${completed}/${total}] осталось: ${timeLeftHuman || timeLeftDays + ' дн.'} | создана: ${createdAt}, дедлайн: ${deadlineAt}${done ? ` | выполнено: ${done}` : ''}${pending ? ` | в работе: ${pending}` : ''}`)
      })
    }
    if (Array.isArray(completedGoals) && completedGoals.length) {
      const cg = completedGoals.slice(0, 10).map((c: any) => `${c?.title || ''} (завершена ${c?.completedAt || ''}, создана ${c?.createdAt || ''})`).join('; ')
      lines.push(`Завершённые цели: ${cg}`)
    }
    return lines.join('\n')
  }

  async generateWeeklyReport(input: { userName?: string; goalsSummary: any[]; completedGoals?: any[] }): Promise<string> {
    const todayIso = new Date().toISOString()
    const system = [
      'Ты аналитик и мотивирующий коуч. Пиши в стиле данного примера:',
      '"Привет 👋\nПодготовил для тебя статистику за эту неделю - ты просто машина продуктивности!\n\n✅ Задачи: ...\n📈 Продуктивность: ...\n🏆 Завершено: ...\n🎯 Ключевые цели в работе: ...\n⚡️ ...\n\n💪 Мотивация: ...\n\n🎯 ИИ-рекомендация: \"...\""',
      'Сохраняй структуру и тон: приветствие, блок с иконками-строками, мотивация, рекомендация. Больше смайликов, без markdown-разметки и списочных маркеров.'
    ].join(' ')

    const condensed = this.condenseWeekly(input.goalsSummary || [], input.completedGoals || [])
    const prompt = `Пользователь: ${input.userName || 'Пользователь'}\nСегодня: ${todayIso}\nДанные за неделю:\n${condensed}\nСформируй отчёт в стиле примера выше: коротко, по делу, с множеством смайликов. Упоминай числа и сроки лаконично.`
    const { text } = await this.chat([{ role: 'user', content: prompt }], system)
    return this.stripMarkdownFormatting(text)
  }

  async generateTemplates(): Promise<string[]> {
    const system = 'Ты библиотекарь целей. Верни только список шаблонных целей, по одной на строку.'
    const prompt = 'Сгенерируй 10 шаблонных целей для личной продуктивности и саморазвития.'
    const { text } = await this.chat([{ role: 'user', content: prompt }], system)
    return this.sanitizeListLines(text.split('\n'))
  }

  async generateGoalFromTemplate(input: { template: string; deadline: string; maxItems?: number; context?: string }): Promise<{ title: string; description: string; tasks: Array<{ description: string; deadline?: string }> }> {
    const title = input.template?.toString().trim()
    const todayIso = new Date().toISOString()

    // 1) Описание цели из шаблона
    const sysDesc = 'Ты помощник по целям. Сформируй краткое, мотивирующее и конкретное описание цели на основе шаблона.'
    const promptDesc = `Шаблон цели: ${title}\nКонтекст: ${input.context || '—'}\nСрок цели: ${input.deadline}\nСегодняшняя дата (UTC): ${todayIso}\nВыведи 2-3 абзаца без списков.`
    const { text: description } = await this.chat([{ role: 'user', content: promptDesc }], sysDesc)

    // 2) Задачи с дедлайнами под срок цели
    const tasks = await this.generateTasks({
      title,
      context: description,
      maxItems: input.maxItems || 6,
      deadline: input.deadline
    })

    return { title, description: this.stripMarkdownFormatting(description), tasks }
  }
  private condenseGoals(goals: any[]): string {
    if (!Array.isArray(goals)) return '—'
    return goals
      .slice(0, 10)
      .map((g, idx) => {
        const title = (g?.title || '').toString().trim()
        const description = (g?.description || '').toString().replace(/\n+/g, ' ').trim()
        const progress = g?.progress ? `(${g.progress.completed||0}/${g.progress.total||0})` : ''
        const subs = Array.isArray(g?.subGoals)
          ? g.subGoals.slice(0, 5).map((s: any) => `${s?.done ? '[x]' : '[ ]'} ${s?.description || ''}`.trim()).join('; ')
          : ''
        return `${idx+1}. ${title} ${progress} — ${description}${subs ? ` | Задачи: ${subs}` : ''}`.trim()
      })
      .join('\n')
  }

  private tryExtractJson<T = any>(text: string): T | null {
    if (!text) return null
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fenced && fenced[1]) {
      const candidate = fenced[1].trim()
      try { return JSON.parse(candidate) } catch {}
    }
    const arrayMatch = text.match(/\[[\s\S]*\]/)
    if (arrayMatch) {
      try { return JSON.parse(arrayMatch[0]) } catch {}
    }
    const objectMatch = text.match(/\{[\s\S]*\}/)
    if (objectMatch) {
      try { return JSON.parse(objectMatch[0]) } catch {}
    }
    return null
  }

  async chatAboutGoals(input: { question: string; context?: any; history?: Array<{ role: 'user' | 'assistant'; content: string }> }): Promise<{ text: string; selectedGoalTitle?: string }> {
    const goals = input?.context?.goals || []
    const goalsCondensed = this.condenseGoals(goals)

    const system = [
      'Ты консультант по целям. У тебя есть история диалога. Учитывай её при ответе.',
      'Сначала выбери ОДНУ наиболее релевантную цель из списка по смысловой близости к текущему запросу и истории.',
      'Затем дай конкретный ответ только по выбранной цели с практическими шагами.',
      'Отвечай строго в JSON: {"selectedGoalTitle": string, "answer": string}. Без markdown и комментариев.'
    ].join(' ')

    const history = Array.isArray(input?.history) ? input.history.slice(-10) : []
    const historyMessages: ChatMessage[] = history.map(h => ({ role: h.role, content: this.stripMarkdownFormatting(h.content) }))

    const currentUserContent = `Вопрос: ${input.question}\nСписок целей:\n${goalsCondensed}`
    const messages: ChatMessage[] = [...historyMessages, { role: 'user', content: currentUserContent }]

    const { text } = await this.chat(messages, system)

    const data = this.tryExtractJson<{ selectedGoalTitle?: string; answer?: string }>(text)
    if (data?.answer) {
      return { text: this.stripMarkdownFormatting(data.answer), selectedGoalTitle: data.selectedGoalTitle }
    }
    return { text: this.stripMarkdownFormatting(text) }
  }

  async generateTriggerMessage(input: {
    type: 'HALF_DONE' | 'TASK_OVERDUE' | 'FIRST_TASK_DONE' | 'GOAL_OVERDUE' | 'GOAL_COMPLETED'
    goalTitle?: string
    taskTitle?: string
    totalTasks?: number
    completedTasks?: number
    userName?: string
  }): Promise<string> {
    const todayIso = new Date().toISOString()
    const system = 'Ты коуч. Верни одно короткое мотивирующее сообщение с эмодзи. Без markdown и без списков.'

    let prompt = `Сегодня: ${todayIso}\nИмя: ${input.userName || ''}\n`
    switch (input.type) {
      case 'HALF_DONE':
        prompt += `Сгенерируй фразу по достижению половины задач: выполнено ${input.completedTasks}/${input.totalTasks}. Тон: вдохновляющий.`
        break
      case 'TASK_OVERDUE':
        prompt += `Сгенерируй мягкое напоминание: просрочена задача "${input.taskTitle || ''}" в цели "${input.goalTitle || ''}". Предложи начать с малого.`
        break
      case 'FIRST_TASK_DONE':
        prompt += `Сгенерируй обнадёживающее сообщение: выполнена первая задача в цели "${input.goalTitle || ''}".`
        break
      case 'GOAL_OVERDUE':
        prompt += `Сгенерируй поддерживающее сообщение: цель "${input.goalTitle || ''}" просрочена. Предложи скорректировать план.`
        break
      case 'GOAL_COMPLETED':
        prompt += `Сгенерируй поздравление с достижением цели "${input.goalTitle || ''}". Предложи порадовать себя наградой.`
        break
    }

    const { text } = await this.chat([{ role: 'user', content: prompt }], system)
    return this.stripMarkdownFormatting(text)
  }
}

export const aiService = new AIService()


