import { Router, Request, Response } from 'express'
import ScheduledPost from '../models/ScheduledPost'

const router = Router()

interface N8nBinaryFile {
  mimeType?: string
  data?: string
}

interface N8nGeneratePostResponse {
  social_caption?: string
  hashtags?: string[]
  image_prompt?: string
  generated_at?: string
  binary?: {
    image?: N8nBinaryFile
  }
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const { platform, status } = req.query

    const filter: Record<string, unknown> = {}
    if (platform && typeof platform === 'string') {
      filter.platform = platform
    }
    if (status && typeof status === 'string') {
      filter.status = status
    }

    const scheduledPosts = await ScheduledPost.find(filter).sort({ scheduledAt: 1 })
    res.status(200).json(scheduledPosts)
  } catch (error) {
    console.error('Fetching scheduled posts from DB failed:', error)
    res.status(500).json({ error: 'Failed to fetch scheduled posts' })
  }
})

router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const allowedFields = ['title', 'description', 'hashtags', 'imagePrompt', 'platform', 'imageUrl', 'scheduledAt', 'status']
    const updates: Record<string, unknown> = {}

    for (const field of allowedFields) {
      if (field in req.body) {
        updates[field] = field === 'scheduledAt' ? new Date(req.body[field]) : req.body[field]
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
    const { platform, scheduledAt, title } = req.body || {}

    const webhookResponse = await fetch(process.env.N8N_SCHEDULED_POST_WEBHOOK_URL as string, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })

    const data = (await webhookResponse.json()) as N8nGeneratePostResponse

    if (!webhookResponse.ok || !data.social_caption) {
      res.status(webhookResponse.status || 502).json({ error: 'Failed to generate scheduled post content', details: data })
      return
    }

    const imageFile = data.binary?.image
    let imageUrl: string | null = null

    if (imageFile?.data && imageFile.data !== 'filesystem-v2') {
      imageUrl = `data:${imageFile.mimeType || 'image/png'};base64,${imageFile.data}`
    } else if (imageFile?.data === 'filesystem-v2') {
      console.warn('Scheduled post webhook returned a filesystem binary reference instead of base64 data; image was not stored')
    }

    const scheduledPost = await ScheduledPost.create({
      title: title || '',
      description: data.social_caption,
      hashtags: data.hashtags || [],
      imagePrompt: data.image_prompt || null,
      platform: platform || 'linkedin',
      imageUrl,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
      status: 'Draft',
      generatedAt: data.generated_at ? new Date(data.generated_at) : new Date()
    })

    res.status(201).json(scheduledPost)
  } catch (error) {
    console.error('Scheduled post webhook call failed:', error)
    res.status(502).json({ error: 'Failed to trigger scheduled post workflow' })
  }
})

export default router
