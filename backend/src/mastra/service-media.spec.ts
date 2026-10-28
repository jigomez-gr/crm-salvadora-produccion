import { resolvePublicMediaUrl, resolveServiceMediaUrls } from './service-media';

describe('Service Media Resolution for WhatsApp Dialogues', () => {
  describe('resolvePublicMediaUrl', () => {
    it('returns null for empty/null/undefined', () => {
      expect(resolvePublicMediaUrl(null, null)).toBeNull();
      expect(resolvePublicMediaUrl('', '')).toBeNull();
      expect(resolvePublicMediaUrl(undefined, undefined)).toBeNull();
    });

    it('keeps full http/https URLs intact', () => {
      expect(resolvePublicMediaUrl('https://example.com/video.mp4')).toBe(
        'https://example.com/video.mp4',
      );
      expect(resolvePublicMediaUrl('http://cdn.com/flyer.png')).toBe(
        'http://cdn.com/flyer.png',
      );
    });

    it('prepends production domain to root-relative paths', () => {
      expect(resolvePublicMediaUrl('/videos/hero.mp4')).toBe(
        'https://salvadora.jigretera.com/videos/hero.mp4',
      );
      expect(resolvePublicMediaUrl('/flyers/yoga.jpeg')).toBe(
        'https://salvadora.jigretera.com/flyers/yoga.jpeg',
      );
    });

    it('converts public/ and media_base/ relative paths to public URLs', () => {
      expect(resolvePublicMediaUrl(null, 'public/flyers/banogongparticular.jpg')).toBe(
        'https://salvadora.jigretera.com/flyers/banogongparticular.jpg',
      );
      expect(resolvePublicMediaUrl(null, 'media_base/videos/constelacionesparticular.mp4')).toBe(
        'https://salvadora.jigretera.com/videos/constelacionesparticular.mp4',
      );
      expect(resolvePublicMediaUrl(null, 'media_base\\videos\\itinerario1.mp4')).toBe(
        'https://salvadora.jigretera.com/videos/itinerario1.mp4',
      );
    });
  });

  describe('resolveServiceMediaUrls precedence', () => {
    it('prefers particular video over general video', () => {
      const media = resolveServiceMediaUrls({
        videoParticularUrl: '/videos/constelacionesparticular.mp4',
        videoUrl: '/videos/general.mp4',
      });
      expect(media.videoUrl).toBe(
        'https://salvadora.jigretera.com/videos/constelacionesparticular.mp4',
      );
    });

    it('falls back to general video if no particular video exists', () => {
      const media = resolveServiceMediaUrls({
        videoParticularUrl: null,
        videoUrl: '/videos/general.mp4',
      });
      expect(media.videoUrl).toBe('https://salvadora.jigretera.com/videos/general.mp4');
    });

    it('returns null video if neither particular nor general video exists', () => {
      const media = resolveServiceMediaUrls({
        videoParticularUrl: null,
        videoUrl: null,
      });
      expect(media.videoUrl).toBeNull();
    });

    it('prefers particular flyer over general flyer', () => {
      const media = resolveServiceMediaUrls({
        flyerParticularUrl: '/flyers/ayuno_particular.jpg',
        flyerUrl: '/flyers/general.jpg',
      });
      expect(media.flyerUrl).toBe(
        'https://salvadora.jigretera.com/flyers/ayuno_particular.jpg',
      );
    });

    it('falls back to general flyer if no particular flyer exists', () => {
      const media = resolveServiceMediaUrls({
        flyerParticularUrl: null,
        flyerUrl: '/flyers/yoga.jpeg',
      });
      expect(media.flyerUrl).toBe('https://salvadora.jigretera.com/flyers/yoga.jpeg');
    });

    it('returns null flyer if neither particular nor general flyer exists', () => {
      const media = resolveServiceMediaUrls({
        flyerParticularUrl: null,
        flyerUrl: null,
      });
      expect(media.flyerUrl).toBeNull();
    });
  });
});
