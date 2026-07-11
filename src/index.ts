import dotenv from 'dotenv'
dotenv.config()

import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import { connectDB } from './config/db'
import postRoutes from './routes/post.routes'
import scheduledPostRoutes from './routes/scheduledPost.routes'
import { postScheduler } from './services/postScheduler.service'

const app = express()
const port = process.env.PORT || 3000

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.get('/api/scheduler/jobs', (_req, res) => {
  res.json({ jobs: postScheduler.getActiveJobs() })
})

app.post('/api/manual-post', async (req, res) => {
  try {
    const { title, description, url, source } = req.body

    if (!title && !description) {
      res.status(400).json({ error: 'At least title or description is required' })
      return
    }

    const webhookUrl = process.env.MANUAL_POST_WEBHOOK_URL
    if (!webhookUrl) {
      res.status(500).json({ error: 'Manual post webhook URL not configured' })
      return
    }

    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, url, source })
    })

    const rawText = await webhookResponse.text()
    let data: any
    try { data = JSON.parse(rawText) } catch { data = { raw: rawText } }

    console.log(`[ManualPost] Webhook response (status ${webhookResponse.status}):`, rawText.substring(0, 1000))

    res.status(webhookResponse.status).json(data)
  } catch (error) {
    console.error('Manual post webhook call failed:', error)
    res.status(502).json({ error: 'Failed to call manual post webhook' })
  }
})

app.use('/api/post', postRoutes)
app.use('/api/scheduled-post', scheduledPostRoutes)

async function ensureCollections(): Promise<void> {
  const db = mongoose.connection.db
  if (!db) return

  const existing = await db.listCollections().toArray()
  const names = existing.map(c => c.name)

  const required = [
    { name: 'posts', schema: {} },
    { name: 'scheduledposts', schema: {} },
  ]

  for (const col of required) {
    if (!names.includes(col.name)) {
      await db.createCollection(col.name)
      console.log(`Created collection: ${col.name}`)
    }
  }
}

connectDB().then(async () => {
  await ensureCollections()
  await postScheduler.loadPendingPosts()
  app.listen(port, () => {
    console.log(`Server running on port ${port}`)
  })
})

export default app
