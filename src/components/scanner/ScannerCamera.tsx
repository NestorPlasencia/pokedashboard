import { Camera } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cameraSourceRect } from '../../utils/cardScanner';

export function ScannerCamera({ running, onFrame, onStop }: {
  running: boolean;
  onFrame: (image: HTMLCanvasElement) => Promise<void>;
  onStop: (message: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onFrame, onStop });
  useEffect(() => { callbacks.current = { onFrame, onStop }; }, [onFrame, onStop]);

  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    const video = videoRef.current;
    const release = () => {
      cancelled = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach(track => track.stop());
      if (video) video.srcObject = null;
    };
    const hide = () => {
      if (document.hidden) {
        release();
        callbacks.current.onStop('Sesión pausada al salir de la app. Pulsa Continuar para volver a encender la cámara.');
      }
    };
    const leave = () => { release(); callbacks.current.onStop('Sesión pausada.'); };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', leave);

    const readFrame = async () => {
      if (cancelled) return;
      try {
        const guide = guideRef.current;
        if (video?.videoWidth && video.readyState >= 2 && guide) {
          const bounds = video.getBoundingClientRect();
          const frame = guide.getBoundingClientRect();
          const crop = cameraSourceRect(video.videoWidth, video.videoHeight, bounds.width, bounds.height, {
            x: frame.left - bounds.left, y: frame.top - bounds.top, width: frame.width, height: frame.height,
          });
          const canvas = document.createElement('canvas');
          canvas.width = Math.min(1400, Math.round(crop.width));
          canvas.height = Math.round(canvas.width * crop.height / crop.width);
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas unavailable');
          context.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
          // Serial recognition and writes keep frames from piling up on mobile.
          await callbacks.current.onFrame(canvas);
        }
      } catch {
        if (!cancelled) {
          release();
          callbacks.current.onStop('No se pudo procesar el video. La sesión está pausada; vuelve a intentar.');
        }
      }
      if (!cancelled) timer = window.setTimeout(() => void readFrame(), 450);
    };

    const start = async () => {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('HTTPS required');
        const acquired = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
        });
        if (cancelled) { acquired.getTracks().forEach(track => track.stop()); return; }
        stream = acquired;
        if (!video) throw new Error('Video unavailable');
        video.srcObject = stream;
        await video.play();
        if (!cancelled) void readFrame();
      } catch (error) {
        if (cancelled) return;
        release();
        const name = (error as { name?: string }).name;
        callbacks.current.onStop(name === 'NotAllowedError'
          ? 'Permiso de cámara denegado. Actívalo en el navegador y vuelve a iniciar.'
          : name === 'NotFoundError' ? 'No se encontró una cámara disponible.'
            : 'No se pudo abrir la cámara. Usa HTTPS y cierra otras apps que la estén usando.');
      }
    };
    void start();
    return () => {
      release();
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', leave);
    };
  }, [running]);

  return <div className="scanner-camera__preview">
    <video ref={videoRef} autoPlay muted playsInline aria-label="Video continuo del escáner" />
    {!running && <div className="scanner-camera__placeholder"><Camera size={38} aria-hidden="true" /><span>Video pausado</span></div>}
    <div ref={guideRef} className="scanner-camera__guide" aria-hidden="true" />
    <span className="scanner-camera__hint">Mantenla quieta hasta ver «Enviada a revisión»</span>
  </div>;
}
