interface N8nPlatformResult {
  platform: string
  postId?: string | null
  postUrl?: string | null
}

interface N8nPostResponse {
  success?: boolean
  message?: string
  description?: string
  imageUrl?: string | null
  postedAt?: string
  results?: N8nPlatformResult[]
}

export interface PublishInput {
  description: string
  imageUrl?: string | null
  webhookUrl?: string
}

export interface PublishResult {
  success: boolean
  data?: N8nPostResponse
  error?: string
}

const PUBLISH_WEBHOOK_TIMEOUT_MS = 180000

export async function publishPost(input: PublishInput): Promise<PublishResult> {
  try {
    const webhookResponse = await fetch(input.webhookUrl || (process.env.N8N_CREATE_POST_WEBHOOK_URL as string), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: input.description,
        imageUrl: input.imageUrl || undefined
      }),
      signal: AbortSignal.timeout(PUBLISH_WEBHOOK_TIMEOUT_MS)
    })

    const rawText = await webhookResponse.text()
    console.log(`[PublishService] Webhook raw response (status ${webhookResponse.status}):`, rawText.substring(0, 2000))

    let data: N8nPostResponse
    try {
      data = JSON.parse(rawText) as N8nPostResponse
    } catch {
      return {
        success: false,
        error: `Webhook returned non-JSON response (status ${webhookResponse.status}): ${rawText.substring(0, 500)}`
      }
    }

    if (webhookResponse.status >= 200 && webhookResponse.status < 300) {
      if (data.success !== false) {
        return { success: true, data }
      }
    }

    return {
      success: false,
      error: data.message || `Publish failed with status ${webhookResponse.status}`
    }
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'TimeoutError'
    return {
      success: false,
      error: isTimeout
        ? `Publish webhook timed out after ${PUBLISH_WEBHOOK_TIMEOUT_MS / 1000}s`
        : error instanceof Error
          ? error.message
          : 'Unknown error calling publish webhook'
    }
  }
}
