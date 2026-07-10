import { Router, Request, Response } from 'express'
import ScheduledPost from '../models/ScheduledPost'

const router = Router()

interface N8nScheduledPostResponse {
  title?: string
  description?: string
  source?: string
  url?: string
  caption?: string
  imageDataUrl?: string
  imageBase64?: string
  generatedAt?: string
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const limit = Math.max(1, parseInt(req.query.limit as string) || 10)
    const { platform, status } = req.query

    const filter: Record<string, unknown> = {}
    if (platform && typeof platform === 'string') {
      filter.platform = platform
    }
    if (status && typeof status === 'string') {
      filter.status = status
    }

    const [scheduledPosts, total] = await Promise.all([
      ScheduledPost.find(filter)
        .sort({ scheduledAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      ScheduledPost.countDocuments(filter)
    ])

    res.status(200).json({
      posts: scheduledPosts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    })
  } catch (error) {
    console.error('Fetching scheduled posts from DB failed:', error)
    res.status(500).json({ error: 'Failed to fetch scheduled posts' })
  }
})

router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const allowedFields = ['title', 'description', 'hashtags', 'imagePrompt', 'platform', 'imageUrl', 'scheduledAt', 'status', 'publishedAt', 'postId', 'postUrl']
    const updates: Record<string, unknown> = {}

    for (const field of allowedFields) {
      if (field in req.body) {
        updates[field] = field === 'scheduledAt' || field === 'publishedAt' ? new Date(req.body[field]) : req.body[field]
      }
    }

    const scheduledPost = await ScheduledPost.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })

    if (!scheduledPost) {
      res.status(404).json({ error: 'Scheduled post not found' })
      return
    }

    res.status(200).json(scheduledPost)
  } catch (error) {
    console.error('Updating scheduled post failed:', error)
    res.status(500).json({ error: 'Failed to update scheduled post' })
  }
})

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const scheduledPost = await ScheduledPost.findByIdAndDelete(req.params.id)

    if (!scheduledPost) {
      res.status(404).json({ error: 'Scheduled post not found' })
      return
    }

    res.status(204).send()
  } catch (error) {
    console.error('Deleting scheduled post failed:', error)
    res.status(500).json({ error: 'Failed to delete scheduled post' })
  }
})

router.post('/', async (req: Request, res: Response) => {
  try {
    const { platform, scheduledAt } = req.body || {}

    const webhookResponse = await fetch(process.env.N8N_SCHEDULED_POST_WEBHOOK_URL as string, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })

    const data = (await webhookResponse.json()) as N8nScheduledPostResponse

    if (!webhookResponse.ok || !data.caption) {
      res.status(webhookResponse.status || 502).json({ error: 'Failed to generate scheduled post content', details: data })
      return
    }

    const scheduledPost = await ScheduledPost.create({
      title: data.title || '',
      description: data.caption,
      imageUrl: data.imageDataUrl || null,
      platform: platform || 'linkedin',
      scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
      status: 'Draft',
      generatedAt: data.generatedAt ? new Date(data.generatedAt) : new Date()
    })

    res.status(201).json(scheduledPost)
  } catch (error) {
    console.error('Scheduled post webhook call failed:', error)
    res.status(502).json({ error: 'Failed to trigger scheduled post workflow' })
  }
})

export default router
