'use client';

import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track, type RemoteParticipant, type LocalParticipant } from 'livekit-client';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Video as VideoIcon } from 'lucide-react';
import { useCallStore } from '@/lib/call-store';
import { getSocket } from '@/lib/socket';
import { Avatar, Spinner } from '@/components/ui';
import { toast } from '@/components/toaster';
import type { PublicUser } from '@/lib/types';
import { cn } from '@/lib/utils';

export function CallOverlay() {
  const mode = useCallStore((s) => s.mode);
  const caller = useCallStore((s) => s.caller);
  const token = useCallStore((s) => s.token);
  const livekitUrl = useCallStore((s) => s.livekitUrl);
  const accept = useCallStore((s) => s.acceptIncoming);
  const reject = useCallStore((s) => s.rejectIncoming);
  const end = useCallStore((s) => s.endCall);
  const setIncoming = useCallStore((s) => s.setIncoming);
  const clear = useCallStore((s) => s.clear);

  useEffect(() => {
    const s = getSocket();
    const onInvite = (p: any) => setIncoming(p);
    const onEnd = () => clear();
    const onReject = () => {
      clear();
      toast('对方拒绝了通话', 'info');
    };
    s.on('call:invite', onInvite);
    s.on('call:end', onEnd);
    s.on('call:reject', onReject);
    return () => {
      s.off('call:invite', onInvite);
      s.off('call:end', onEnd);
      s.off('call:reject', onReject);
    };
  }, [setIncoming, clear]);

  if (!mode) return null;

  if (mode === 'incoming') {
    return <IncomingCard caller={caller} onAccept={accept} onReject={reject} />;
  }

  return <ActiveCall url={livekitUrl} token={token || ''} onEnd={end} callerName={caller?.nickname} />;
}

function IncomingCard({
  caller,
  onAccept,
  onReject,
}: {
  caller: PublicUser | null;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur animate-fade-in">
      <div className="mb-6 text-white/80">incoming video call…</div>
      <Avatar src={caller?.avatar} name={caller?.nickname || 'caller'} size={96} />
      <div className="mt-4 text-xl font-medium text-white">{caller?.nickname || '未知'}</div>
      <div className="mt-1 text-sm text-white/60">邀请你进行视频通话</div>
      <div className="mt-10 flex gap-16">
        <button onClick={() => onReject()} className="flex flex-col items-center gap-2 text-white">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 hover:bg-red-600">
            <PhoneOff size={24} />
          </span>
          <span className="text-xs">拒绝</span>
        </button>
        <button
          onClick={async () => {
            try {
              await onAccept();
            } catch (e) {
              toast((e as Error).message, 'error');
            }
          }}
          className="flex flex-col items-center gap-2 text-white"
        >
          <span className="flex h-14 w-14 animate-pulse items-center justify-center rounded-full bg-primary hover:bg-primary-hover">
            <Phone size={24} />
          </span>
          <span className="text-xs">接听</span>
        </button>
      </div>
    </div>
  );
}

function ActiveCall({
  url,
  token,
  onEnd,
  callerName,
}: {
  url: string;
  token: string;
  onEnd: () => void;
  callerName?: string;
}) {
  const roomRef = useRef<Room | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLDivElement>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!url || !token) return;
    let disposed = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;

    const attachRemote = (track: any) => {
      if (track.kind === Track.Kind.Video) {
        const el = track.attach() as HTMLVideoElement;
        el.className = 'h-full w-full object-cover';
        remoteRef.current?.appendChild(el);
      } else if (track.kind === Track.Kind.Audio) {
        track.attach();
      }
    };

    room.on(RoomEvent.TrackSubscribed, attachRemote);
    room.on(RoomEvent.TrackUnsubscribed, (track: any) => {
      track.detach().forEach((el: any) => el?.remove());
    });
    room.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
      p.videoTrackPublications.forEach((pub) => pub.track && attachRemote(pub.track));
    });

    (async () => {
      try {
        await room.connect(url, token);
        if (disposed) return;
        await room.localParticipant.setCameraEnabled(true);
        await room.localParticipant.setMicrophoneEnabled(true);
        // existing remotes
        room.remoteParticipants.forEach((p) => {
          p.videoTrackPublications.forEach((pub) => pub.track && attachRemote(pub.track));
          p.audioTrackPublications.forEach((pub) => pub.track && attachRemote(pub.track));
        });
        // local preview
        const localCam = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
        if (localCam && localVideoRef.current) {
          (localCam as any).attach(localVideoRef.current);
        }
        setConnecting(false);
      } catch (e) {
        setError((e as Error).message || '连接失败（LiveKit 服务可能未运行）');
        setConnecting(false);
      }
    })();

    return () => {
      disposed = true;
      room.disconnect(true).catch(() => {});
      roomRef.current = null;
    };
  }, [url, token]);

  async function toggleMic() {
    const r = roomRef.current;
    if (!r) return;
    const next = !micOn;
    await r.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
  }
  async function toggleCam() {
    const r = roomRef.current;
    if (!r) return;
    const next = !camOn;
    await r.localParticipant.setCameraEnabled(next);
    setCamOn(next);
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black text-white">
        <VideoIcon size={48} className="text-red-400" />
        <div className="max-w-md px-6 text-center text-sm text-white/80">{error}</div>
        <button onClick={onEnd} className="rounded-md bg-red-500 px-5 py-2 text-sm hover:bg-red-600">
          关闭
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black animate-fade-in">
      <div ref={remoteRef} className="relative flex-1 overflow-hidden">
        {connecting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70">
            <Spinner className="text-white" />
            正在连接 {callerName || ''}…
          </div>
        )}
        <video
          ref={localVideoRef}
          muted
          className="absolute bottom-24 right-4 h-28 w-40 rounded-lg border border-white/20 object-cover shadow-lg"
        />
      </div>
      <div className="flex items-center justify-center gap-6 bg-black/60 py-5">
        <CtrlButton active={micOn} onClick={toggleMic} on={<Mic size={22} />} off={<MicOff size={22} />} label="麦克风" />
        <CtrlButton active={camOn} onClick={toggleCam} on={<Video size={22} />} off={<VideoOff size={22} />} label="摄像头" />
        <button
          onClick={onEnd}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
          title="挂断"
        >
          <PhoneOff size={24} />
        </button>
      </div>
    </div>
  );
}

function CtrlButton({
  active,
  onClick,
  on,
  off,
  label,
}: {
  active: boolean;
  onClick: () => void;
  on: React.ReactNode;
  off: React.ReactNode;
  label: string;
}) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 text-white/80">
      <span className={cn('flex h-12 w-12 items-center justify-center rounded-full', active ? 'bg-white/15' : 'bg-white/80 text-black')}>
        {active ? on : off}
      </span>
      <span className="text-[10px]">{label}</span>
    </button>
  );
}
