import mongoose, { Schema, Document } from 'mongoose'

export interface IPost extends Document {
  platform: string
  description: string
  imageUrl: string | null
  postId: string
  postUrl: string
  postedAt: Date
}

const postSchema = new Schema<IPost>({
  platform: { type: String, required: true },
  description: { type: String, required: true },
  imageUrl: { type: String, default: null },
  postId: { type: String, required: true },
  postUrl: { type: String, required: true },
  postedAt: { type: Date, default: Date.now }
})

export default mongoose.model<IPost>('Post', postSchema)
