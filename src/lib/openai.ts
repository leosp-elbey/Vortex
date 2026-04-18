interface CompletionParams {
  systemPrompt: string
  userPrompt: string
  temperature?: number
  maxTokens?: number
}

interface CompletionResult {
  content: string
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export async function generateCompletion({
  systemPrompt,
  userPrompt,
  temperature = 0.7,
  maxTokens = 800,
}: CompletionParams): Promise<CompletionResult> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error?.message || 'OpenAI request failed')
  }

  return {
    content: data.choices[0].message.content,
    usage: data.usage,
  }
}
