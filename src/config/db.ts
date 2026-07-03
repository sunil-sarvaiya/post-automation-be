import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/post-automation'

export async function connectDB(): Promise<void> {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('MongoDB connected')
  } catch (error) {
    console.error('MongoDB connection error: DB not available, server running without DB')
  }

  mongoose.connection.on('disconnected', () => {
    console.log('MongoDB disconnected')
  })
}
