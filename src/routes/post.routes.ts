import { Router, Request, Response } from 'express'
import Post from '../models/Post'

const router = Router()

interface N8nPostResponse {
  success?: boolean
  message?: string
  platform?: string
  postId?: string
  postUrl?: string
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
    const { description } = req.body

    if (!description || typeof description !== 'string') {
      res.status(400).json({ error: 'description is required and must be a string' })
      return
    }

    const webhookResponse = await fetch(process.env.N8N_CREATE_POST_WEBHOOK_URL as string, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description })
    })

    const data = (await webhookResponse.json()) as N8nPostResponse

    if (webhookResponse.status >= 200 && webhookResponse.status < 300 && data.success) {
      const post = await Post.create({
        platform: data.platform || 'linkedin',
        description,
        imageUrl: null,
        postId: data.postId,
        postUrl: data.postUrl,
        postedAt: data.postedAt ? new Date(data.postedAt) : new Date()
      })

      res.status(webhookResponse.status).json(post)
      return
    }

    res.status(webhookResponse.status).json(data)
  } catch (error) {
    console.error('Webhook call failed:', error)
    res.status(502).json({ error: 'Failed to forward request to automation service' })
  }
})

export default router
