import cron from 'node-cron'
import ScheduledPost from '../models/ScheduledPost'
import Post from '../models/Post'
import { publishPost } from '../services/publish.service'

const MAX_RETRIES = 3

export interface PublishOutcome {
  id: string
  outcome: 'published' | 'failed' | 'retrying' | 'skipped'
}

async function publishDuePost(scheduledPostId: string): Promise<PublishOutcome> {
  // Atomic claim: only one cron tick (or overlapping run) can pick this post up.
  const claimed = await ScheduledPost.findOneAndUpdate(
    { _id: scheduledPostId, status: 'Approved', isPublishing: false },
    { $set: { isPublishing: true } },
    { new: true }
  )

  if (!claimed) {
    // Already claimed by another run, or no longer eligible — skip silently.
    return { id: scheduledPostId, outcome: 'skipped' }
  }

  console.log(`[ScheduledPublishJob] Publishing scheduled post ${claimed.id} (platform: ${claimed.platform})`)

  const result = await publishPost({
    description: claimed.description,
    imageUrl: claimed.imageUrl,
    webhookUrl: process.env.N8N_SCHEDULED_POST_WEBHOOK_URL
  })

  const data = result.data

  if (result.success && data && data.results) {
    const results = data.results
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

    console.log(`[ScheduledPublishJob] Published scheduled post ${claimed.id} successfully`)
    return { id: claimed.id, outcome: 'published' }
  }

  const nextRetryCount = claimed.retryCount + 1
  const nextStatus = nextRetryCount >= MAX_RETRIES ? 'Failed' : 'Approved'

  await ScheduledPost.findByIdAndUpdate(claimed._id, {
    status: nextStatus,
    isPublishing: false,
    retryCount: nextRetryCount,
    errorMessage: result.error || 'Unknown publish error'
  })

  console.error(
    `[ScheduledPublishJob] Failed to publish scheduled post ${claimed.id} (attempt ${nextRetryCount}/${MAX_RETRIES}): ${result.error}`
  )

  return { id: claimed.id, outcome: nextStatus === 'Failed' ? 'failed' : 'retrying' }
}

export interface PublishScheduledPostsRunSummary {
  checkedAt: string
  foundCount: number
  results: PublishOutcome[]
}

export async function runPublishScheduledPostsJob(): Promise<PublishScheduledPostsRunSummary> {
  const now = new Date()
  console.log(`[ScheduledPublishJob] Run started at ${now.toISOString()}`)

  let duePosts
  try {
    duePosts = await ScheduledPost.find({
      status: 'Approved',
      scheduledAt: { $lte: now },
      isPublishing: false
    })
  } catch (error) {
    console.error('[ScheduledPublishJob] Failed to fetch due scheduled posts:', error)
    return { checkedAt: now.toISOString(), foundCount: 0, results: [] }
  }

  console.log(`[ScheduledPublishJob] Found ${duePosts.length} due post(s)`)

  const results: PublishOutcome[] = []

  for (const post of duePosts) {
    try {
      results.push(await publishDuePost(post.id))
    } catch (error) {
      console.error(`[ScheduledPublishJob] Unexpected error processing ${post.id}:`, error)
      results.push({ id: post.id, outcome: 'failed' })
    }
  }

  console.log('[ScheduledPublishJob] Run finished')

  return { checkedAt: now.toISOString(), foundCount: duePosts.length, results }
}

export function startScheduledPostsCron(): void {
  const cronExpression = process.env.SCHEDULED_POST_CRON_EXPRESSION || '*/15 * * * *'

  if (!cron.validate(cronExpression)) {
    console.error(`[ScheduledPublishJob] Invalid SCHEDULED_POST_CRON_EXPRESSION "${cronExpression}", falling back to */15 * * * *`)
  }

  cron.schedule(cron.validate(cronExpression) ? cronExpression : '*/15 * * * *', () => {
    runPublishScheduledPostsJob().catch((error) => {
      console.error('[ScheduledPublishJob] Unhandled error in cron run:', error)
    })
  })

  console.log(`[ScheduledPublishJob] Cron registered with expression "${cronExpression}"`)
}
