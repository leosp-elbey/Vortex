import { createAdminClient } from './supabase/admin'

interface BlandCallResult {
  callId: string
  status: string
}

export async function triggerCall(
  phone: string,
  firstName: string,
  email: string,
  task?: string
): Promise<BlandCallResult> {
  const supabase = createAdminClient()
  const startTime = Date.now()

  const defaultTask = `You are Maya, a friendly travel savings consultant from VortexTrips. You're calling ${firstName} because they just signed up to learn about exclusive travel savings of 40-60% off hotels, flights, and vacation packages. Keep it warm and conversational. Let them know they'll receive a personalized travel savings quote via email shortly. Ask if they have any upcoming travel plans. Keep the call under 2 minutes.`

  const payload = {
    phone_number: phone,
    voice: 'maya',
    task: task || defaultTask,
    first_sentence: `Hey ${firstName}! This is Maya from VortexTrips. I saw you just signed up and I'm so excited to help you start saving big on travel!`,
    max_duration: 2,
    webhook: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/bland`,
    metadata: { email, firstName },
  }

  const logEntry = await supabase
    .from('ai_actions_log')
    .insert({
      action_type: 'voice-call',
      service: 'bland',
      status: 'pending',
      request_payload: payload as Record<string, unknown>,
    })
    .select('id')
    .single()

  try {
    const response = await fetch('https://api.bland.ai/v1/calls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: process.env.BLAND_API_KEY!,
      },
      body: JSON.stringify(payload),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.message || 'Bland.ai call failed')
    }

    await supabase
      .from('ai_actions_log')
      .update({
        status: 'success',
        response_payload: data as Record<string, unknown>,
        duration_ms: Date.now() - startTime,
      })
      .eq('id', logEntry.data?.id)

    return { callId: data.call_id, status: data.status }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'

    await supabase
      .from('ai_actions_log')
      .update({
        status: 'failed',
        error_message: message,
        duration_ms: Date.now() - startTime,
      })
      .eq('id', logEntry.data?.id)

    throw error
  }
}
