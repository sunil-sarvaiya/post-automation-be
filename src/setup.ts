import dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/post-automation'

async function setup(): Promise<void> {
  console.log(`Connecting to ${MONGODB_URI}...`)

  try {
    await mongoose.connect(MONGODB_URI)
    console.log('Connected to MongoDB')

    const db = mongoose.connection.db!
    const existing = await db.listCollections().toArray()
    const names = existing.map(c => c.name)

    const required = ['posts', 'scheduledposts']

    for (const name of required) {
      if (!names.includes(name)) {
        await db.createCollection(name)
        console.log(`Created collection: ${name}`)
      } else {
        console.log(`Collection already exists: ${name}`)
      }
    }

    console.log('Setup complete! Database and collections ready.')
  } catch (error) {
    console.error('Setup failed:', error)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
  }
}

setup()
