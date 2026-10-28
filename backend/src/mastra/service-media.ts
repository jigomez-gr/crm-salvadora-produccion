/**
 * Utilities for resolving public media URLs (flyers and videos) for CRM services.
 * Compatible with all WhatsApp delivery channels (Evolution API, Meta WhatsApp Cloud API, YCloud).
 */

export function resolvePublicMediaUrl(url?: string | null, path?: string | null): string | null {
  const target = (url || '').trim() || (path || '').trim();
  if (!target) return null;
  if (/^https?:\/\//i.test(target)) return target;
  if (target.startsWith('public/')) {
    return `https://salvadora.jigretera.com/${target.replace(/^public\//, '')}`;
  }
  if (target.startsWith('media_base/')) {
    return `https://salvadora.jigretera.com/${target.replace(/^media_base\//, '')}`;
  }
  if (target.startsWith('/')) {
    return `https://salvadora.jigretera.com${target}`;
  }
  if (target.startsWith('media_base\\') || target.startsWith('public\\')) {
    const normalized = target.replace(/\\/g, '/').replace(/^(media_base|public)\//, '');
    return `https://salvadora.jigretera.com/${normalized}`;
  }
  return `https://salvadora.jigretera.com/${target}`;
}

export function resolveServiceMediaUrls(svc?: {
  videoParticularUrl?: string | null;
  videoParticularPath?: string | null;
  videoUrl?: string | null;
  videoPath?: string | null;
  flyerParticularUrl?: string | null;
  flyerParticularPath?: string | null;
  flyerUrl?: string | null;
  flyerPath?: string | null;
} | null): { videoUrl: string | null; flyerUrl: string | null } {
  if (!svc) return { videoUrl: null, flyerUrl: null };

  // Video precedence: videoParticular > general video
  const videoUrl =
    resolvePublicMediaUrl(svc.videoParticularUrl, svc.videoParticularPath) ||
    resolvePublicMediaUrl(svc.videoUrl, svc.videoPath);

  // Flyer precedence: flyerParticular > general flyer
  const flyerUrl =
    resolvePublicMediaUrl(svc.flyerParticularUrl, svc.flyerParticularPath) ||
    resolvePublicMediaUrl(svc.flyerUrl, svc.flyerPath);

  return { videoUrl, flyerUrl };
}
