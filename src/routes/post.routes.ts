import { Router, Request, Response } from 'express'
import Post from '../models/Post'

const router = Router()

interface N8nPostResponse {
  success?: boolean
  message?: string
  platform?: string
  postId?: string
  postUrl?: string
  imageUrl?: string | null
  postedAt?: string
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const limit = Math.max(1, parseInt(req.query.limit as string) || 10)
    const { platform } = req.query

    const filter: Record<string, unknown> = {}
    if (platform && typeof platform === 'string') {
      filter.platform = platform
    }

    const [posts, total] = await Promise.all([
      Post.find(filter)
        .sort({ postedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Post.countDocuments(filter)
    ])

    res.status(200).json({
      posts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    })
  } catch (error) {
    console.error('Fetching posts from DB failed:', error)
    res.status(500).json({ error: 'Failed to fetch posts' })
  }
})

router.post('/', async (req: Request, res: Response) => {
  try {
    const { description, platform, imageUrl } = req.body

    if (!description || typeof description !== 'string') {
      res.status(400).json({ error: 'description is required and must be a string' })
      return
    }

    const requestBody = JSON.stringify({
      description,
      platform: platform || 'linkedin',
      ...(imageUrl ? { imageUrl } : {})
    })

    const payloadSizeKB = Buffer.byteLength(requestBody, 'utf8') / 1024
    console.log(`Sending to n8n webhook, payload size: ${payloadSizeKB.toFixed(1)} KB`)

    if (payloadSizeKB > 1024) {
      console.warn('Payload exceeds 1MB, n8n may reject it')
    }

    const webhookResponse = await fetch(process.env.N8N_CREATE_POST_WEBHOOK_URL as string, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
      signal: AbortSignal.timeout(180000)
    })

    const data: any = await webhookResponse.json()

    if (webhookResponse.status >= 200 && webhookResponse.status < 300 && data.success) {
      const result = data.results?.[0] || {}
      const post = await Post.create({
        platform: data.platform || result.platform || 'linkedin',
        description,
        imageUrl: data.imageUrl || null,
        postId: data.postId || result.postId,
        postUrl: data.postUrl || result.postUrl,
        postedAt: data.postedAt ? new Date(data.postedAt) : new Date()
      })

      res.status(webhookResponse.status).json(post)
      return
    }

    res.status(webhookResponse.status).json(data)
  } catch (error) {
    console.error('Webhook call failed:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    const isTimeout = error instanceof Error && error.name === 'TimeoutError'
    res.status(502).json({
      error: 'Failed to forward request to automation service',
      detail: isTimeout ? 'Request timed out after 180s' : message
    })
  }
})

export default router
