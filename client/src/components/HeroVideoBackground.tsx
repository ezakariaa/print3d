import { useEffect, useRef, useState } from 'react';

const videos = Object.values(
  import.meta.glob<string>('../videos/*.{mp4,webm,ogg,mov,m4v}', {
    eager: true,
    import: 'default',
    query: '?url',
  }),
);

type VideoPlaylist = {
  current: string | null;
  remaining: string[];
};

function createPlaylist(availableVideos: string[], previousVideo?: string): VideoPlaylist {
  const shuffled = [...availableVideos];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  if (shuffled.length > 1 && shuffled[0] === previousVideo) {
    [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
  }

  return {
    current: shuffled[0] ?? null,
    remaining: shuffled.slice(1),
  };
}

export function HeroVideoBackground() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playback, setPlayback] = useState(() => ({
    playlist: createPlaylist(videos),
    failedVideos: new Set<string>(),
  }));
  const [isVisible, setIsVisible] = useState(false);
  const { playlist, failedVideos } = playback;
  const currentVideo = playlist.current;

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    if (!currentVideo) {
      console.error('Aucune vidéo de bannière disponible.');
      return;
    }

    const video = videoRef.current;
    if (!video) {
      return;
    }

    let isActive = true;
    let hasAdvanced = false;

    const advance = (failed = false) => {
      if (!isActive || hasAdvanced) {
        return;
      }

      hasAdvanced = true;
      setIsVisible(false);

      const nextFailedVideos = failed
        ? new Set([...failedVideos, currentVideo])
        : failedVideos;
      if (failed) {
        console.error(`La vidéo de bannière est ignorée après son échec : ${currentVideo}`);
      }

      const availableVideos = videos.filter((source) => !nextFailedVideos.has(source));
      if (availableVideos.length === 0) {
        console.error('Toutes les vidéos de bannière ont échoué au chargement.');
        setPlayback({
          playlist: { current: null, remaining: [] },
          failedVideos: nextFailedVideos,
        });
        return;
      }

      const remaining = playlist.remaining.filter((source) => !nextFailedVideos.has(source));
      const nextPlaylist =
        remaining.length > 0
          ? { current: remaining[0], remaining: remaining.slice(1) }
          : createPlaylist(availableVideos, currentVideo);
      setPlayback({ playlist: nextPlaylist, failedVideos: nextFailedVideos });
    };

    const onEnded = () => advance();
    const onError = () => {
      console.error(`Impossible de charger la vidéo de bannière : ${currentVideo}`, video.error);
      advance(true);
    };

    video.addEventListener('ended', onEnded);
    video.addEventListener('error', onError);

    video.play().then(
      () => {
        if (isActive) {
          setIsVisible(true);
        }
      },
      (error: unknown) => {
        if (!isActive || (error instanceof DOMException && error.name === 'AbortError')) {
          return;
        }

        console.error(`Impossible de lire la vidéo de bannière : ${currentVideo}`, error);
        if (!(error instanceof DOMException && error.name === 'NotAllowedError')) {
          advance(true);
        }
      },
    );

    return () => {
      isActive = false;
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onError);
      video.pause();
    };
  }, [currentVideo, failedVideos, playlist.remaining]);

  const hasMultipleAvailableVideos = videos.filter((source) => !failedVideos.has(source)).length > 1;

  return (
    <video
      key={currentVideo ?? 'no-video'}
      ref={videoRef}
      className={`hero-video${isVisible ? ' is-visible' : ''}`}
      src={currentVideo ?? undefined}
      muted
      playsInline
      loop={!hasMultipleAvailableVideos}
      preload="auto"
      aria-hidden="true"
    />
  );
}
