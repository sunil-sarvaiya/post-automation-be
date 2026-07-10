import dotenv from 'dotenv'
dotenv.config()

import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import { connectDB } from './config/db'
import postRoutes from './routes/post.routes'
import scheduledPostRoutes from './routes/scheduledPost.routes'

const app = express()
const port = process.env.PORT || 3000

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
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
  app.listen(port, () => {
    console.log(`Server running on port ${port}`)
  })
})

export default app
