const SUCCESS_STATUSES = new Set(['SUCCESS', 'completed', 'succeeded', 'success']);

export function normalizeProviderTask(data) {
  const status = SUCCESS_STATUSES.has(data?.status) ? 'SUCCESS' : data?.status;

  return {
    taskId: data?.taskId,
    status,
    progress: data?.progress ?? null,
    resultUrl: data?.resultUrl ?? data?.result_url ?? data?.url ?? data?.videoUrl ?? data?.video_url ?? null,
    thumbnailUrl: data?.thumbnailUrl ?? data?.thumbnail_url ?? null,
    failReason: data?.failReason ?? data?.fail_reason ?? data?.error ?? null,
    createdAt: data?.createdAt ?? data?.created_at ?? null,
  };
}
