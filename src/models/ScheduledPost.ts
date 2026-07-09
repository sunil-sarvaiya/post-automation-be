import mongoose, { Schema, Document } from 'mongoose'

export interface IScheduledPost extends Document {
  title: string
  description: string
  hashtags: string[]
  imagePrompt: string | null
  platform: string
  imageUrl: string | null
  scheduledAt: Date
  status: 'Draft' | 'Approved' | 'Published' | 'Failed'
  isPublishing: boolean
  publishedAt: Date | null
  platformResponse: unknown
  postId: string | null
  postUrl: string | null
  errorMessage: string | null
  retryCount: number
  generatedAt: Date | null
}

const scheduledPostSchema = new Schema<IScheduledPost>({
  title: { type: String, default: '' },
  description: { type: String, required: true },
  hashtags: { type: [String], default: [] },
  imagePrompt: { type: String, default: null },
  platform: { type: String, required: true, default: 'linkedin' },
  imageUrl: { type: String, default: null },
  scheduledAt: { type: Date, required: true },
  status: { type: String, enum: ['Draft', 'Approved', 'Published', 'Failed'], default: 'Draft' },
  isPublishing: { type: Boolean, default: false },
  publishedAt: { type: Date, default: null },
  platformResponse: { type: Schema.Types.Mixed, default: null },
  postId: { type: String, default: null },
  postUrl: { type: String, default: null },
  errorMessage: { type: String, default: null },
  retryCount: { type: Number, default: 0 },
  generatedAt: { type: Date, default: null }
})

export default mongoose.model<IScheduledPost>('ScheduledPost', scheduledPostSchema)
