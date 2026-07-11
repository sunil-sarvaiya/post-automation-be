import ScheduledPost from '../models/ScheduledPost'
import Post from '../models/Post'
import { publishPost } from './publish.service'

const MAX_RETRIES = 3

interface ScheduledJob {
  timeoutId: NodeJS.Timeout
  postId: string
  scheduledAt: Date
}

class PostSchedulerService {
  private jobs: Map<string, ScheduledJob> = new Map()

  schedulePost(postId: string, scheduledAt: Date): void {
    this.cancelPost(postId)

    const delay = scheduledAt.getTime() - Date.now()

    if (delay <= 0) {
      console.log(`[PostScheduler] Post ${postId} scheduled time already passed, publishing now`)
      this.publishNow(postId)
      return
    }

    const timeoutId = setTimeout(() => {
      this.publishNow(postId)
    }, delay)

    this.jobs.set(postId, {
      timeoutId,
      postId,
      scheduledAt
    })

    console.log(`[PostScheduler] Scheduled post ${postId} for ${scheduledAt.toISOString()} (delay: ${Math.round(delay / 1000)}s)`)
  }

  cancelPost(postId: string): void {
    const job = this.jobs.get(postId)
    if (job) {
      clearTimeout(job.timeoutId)
      this.jobs.delete(postId)
      console.log(`[PostScheduler] Cancelled scheduled job for post ${postId}`)
    }
  }

  private async publishNow(postId: string): Promise<void> {
    this.jobs.delete(postId)

    console.log(`[PostScheduler] Time reached! Publishing post ${postId}`)

    const claimed = await ScheduledPost.findOneAndUpdate(
      { _id: postId, status: 'Approved', isPublishing: false },
      { $set: { isPublishing: true } },
      { new: true }
    )

    if (!claimed) {
      console.log(`[PostScheduler] Post ${postId} already claimed or not eligible, skipping`)
      return
    }

    try {
      const result = await publishPost({
        description: claimed.description,
        imageUrl: claimed.imageUrl,
        webhookUrl: process.env.N8N_CREATE_POST_WEBHOOK_URL
      })

      const data = result.data

      if (result.success && data) {
        const results = data.results || []
        const postedAt = data.postedAt ? new Date(data.postedAt) : new Date()
        const primaryResult = results[0]

        await ScheduledPost.findByIdAndUpdate(claimed._id, {
          status: 'Published',
          isPublishing: false,
          publishedAt: postedAt,
          platformResponse: data,
          postId: primaryResult?.postId || null,
          postUrl: primaryResult?.postUrl || null,
          errorMessage: null
        })

        if (results.length > 0) {
          await Post.insertMany(
            results.map((r) => ({
              platform: r.platform,
              description: claimed.description,
              imageUrl: data.imageUrl || claimed.imageUrl || null,
              postId: r.postId,
              postUrl: r.postUrl,
              postedAt
            }))
          )
        }

        console.log(`[PostScheduler] Post ${postId} published successfully`)
      } else {
        await this.handleFailure(claimed, result.error || 'Unknown publish error')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[PostScheduler] Error publishing post ${postId}:`, message)
      await this.handleFailure(claimed, message)
    }
  }

  private async handleFailure(claimed: any, errorMessage: string): Promise<void> {
    const nextRetryCount = claimed.retryCount + 1
    const nextStatus = nextRetryCount >= MAX_RETRIES ? 'Failed' : 'Approved'

    await ScheduledPost.findByIdAndUpdate(claimed._id, {
      status: nextStatus,
      isPublishing: false,
      retryCount: nextRetryCount,
      errorMessage
    })

    if (nextStatus === 'Approved') {
      const retryDelay = 60 * 1000 * nextRetryCount
      const retryAt = new Date(Date.now() + retryDelay)
      console.log(`[PostScheduler] Retrying post ${claimed.id} in ${nextRetryCount} minute(s)`)
      this.schedulePost(claimed.id, retryAt)
    } else {
      console.error(`[PostScheduler] Post ${claimed.id} failed after ${MAX_RETRIES} retries`)
    }
  }

  async loadPendingPosts(): Promise<void> {
    const now = new Date()

    const pendingPosts = await ScheduledPost.find({
      status: 'Approved',
      isPublishing: false
    })

    console.log(`[PostScheduler] Found ${pendingPosts.length} approved post(s) to schedule`)

    for (const post of pendingPosts) {
      if (post.scheduledAt.getTime() <= now.getTime()) {
        console.log(`[PostScheduler] Post ${post.id} already due, publishing now`)
        this.publishNow(post.id)
      } else {
        this.schedulePost(post.id, post.scheduledAt)
      }
    }
  }

  getActiveJobs(): Array<{ postId: string; scheduledAt: string }> {
    return Array.from(this.jobs.values()).map((job) => ({
      postId: job.postId,
      scheduledAt: job.scheduledAt.toISOString()
    }))
  }
}

export const postScheduler = new PostSchedulerService()
