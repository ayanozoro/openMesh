import type { PeerConnectionConfig } from "./index.js";

export interface PeerConnectionEvents {
  onIceCandidate?: (candidate: RTCIceCandidateInit) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onDataChannel?: (dc: RTCDataChannel) => void;
}

export class PeerConnectionManager {
  private pc: RTCPeerConnection;
  private events: PeerConnectionEvents;
  private remoteDescriptionSet = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];

  constructor(config: PeerConnectionConfig, events: PeerConnectionEvents = {}) {
    this.pc = new RTCPeerConnection({ iceServers: config.iceServers });
    this.events = events;

    this.pc.onicecandidate = (ev) => {
      if (ev.candidate && this.events.onIceCandidate) {
        this.events.onIceCandidate(ev.candidate.toJSON());
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (this.events.onConnectionStateChange) {
        this.events.onConnectionStateChange(this.pc.connectionState);
      }
    };

    this.pc.ondatachannel = (ev) => {
      if (this.events.onDataChannel) this.events.onDataChannel(ev.channel);
    };
  }

  private flushPendingCandidates() {
    this.remoteDescriptionSet = true;
    const batch = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const c of batch) {
      this.pc.addIceCandidate(c).catch(() => { /* stale candidate, ignore */ });
    }
  }

  createDataChannel(label = "om-channel", options?: RTCDataChannelInit): RTCDataChannel {
    const dc = this.pc.createDataChannel(label, options);
    return dc;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    try {
      console.debug("[PeerConnection] createOffer -> setLocalDescription, signalingState=", this.pc.signalingState);
    } catch (_) {}
    return offer;
  }

  /**
   * Creates a local offer only if no remote offer has been accepted in the
   * meantime (glare race).  Returns `null` when a remote offer won during the
   * async yield, signalling the caller to skip sending its own offer.
   */
  async tryCreateOffer(): Promise<RTCSessionDescriptionInit | null> {
    if (this.pc.localDescription || this.pc.remoteDescription) return null;
    const stateBefore = this.pc.signalingState;
    try {
      const offer = await this.pc.createOffer();
      // During the yield above a SIGNAL_OFFER handler may have already accepted
      // a remote offer (glare).  If so, abandon our own offer attempt.
      if (this.pc.signalingState !== stateBefore || this.pc.localDescription) return null;
      await this.pc.setLocalDescription(offer);
      return offer;
    } catch {
      return null;
    }
  }

  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    try {
      if (answer.type !== "answer") {
        console.warn(`[PeerConnection] handleAnswer expected type "answer", got "${answer.type}"; ignoring.`);
        return;
      }
      // setRemoteDescription(answer) is only valid when we have a local offer (have-local-offer)
      const state = this.pc.signalingState;
      if (state !== "have-local-offer") {
        console.warn(`[PeerConnection] Received answer while in signalingState=${state}; ignoring stale/duplicate answer.`);
        return;
      }

      await this.pc.setRemoteDescription(answer);
      this.flushPendingCandidates();
    } catch (err) {
      console.error("[PeerConnection] Failed to set remote description:", err);
      // Don't throw — the caller should treat this as a stale signal, not a fatal error.
    }
  }

  async handleOfferAndCreateAnswer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (offer.type !== "offer") {
      throw new Error(`handleOfferAndCreateAnswer expected type "offer", got "${offer.type}"`);
    }

    // If we already have a remote description set, this is a duplicate offer.
    const initialState = this.pc.signalingState;
    if (initialState === "stable" && this.pc.currentRemoteDescription) {
      console.warn("[PeerConnection] Ignoring duplicate offer — remote description already set.");
      throw new Error("Duplicate offer ignored");
    }

    try {
      await this.pc.setRemoteDescription(offer);
    } catch (err) {
      // Handle glare: we may be in have-local-offer state (simultaneous offers).
      const state = this.pc.signalingState;
      console.warn(`[PeerConnection] setRemoteDescription failed during offer handling, signalingState=${state}`, err);

      if (state === "have-local-offer") {
        try {
          // Rollback our local offer so we can accept the remote offer
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          await this.pc.setLocalDescription({ type: "rollback" });
          await this.pc.setRemoteDescription(offer);
        } catch (err2) {
          console.error("[PeerConnection] Failed to recover from glare during offer handling:", err2);
          throw err2;
        }
      } else {
        // Could not accept the remote offer; propagate to caller
        throw err;
      }
    }
    this.flushPendingCandidates();

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    try {
      console.debug("[PeerConnection] handleOfferAndCreateAnswer -> setLocalDescription, signalingState=", this.pc.signalingState);
    } catch (_) {}
    return answer;
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.remoteDescriptionSet) {
      this.pendingCandidates.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(candidate as RTCIceCandidateInit);
    } catch {
      // ignore when empty candidate
    }
  }

  getSignalingState(): RTCSignalingState {
    return this.pc.signalingState;
  }

  hasRemoteDescription(): boolean {
    return this.pc.remoteDescription !== null;
  }

  getConnectionState(): RTCPeerConnectionState {
    return this.pc.connectionState;
  }

  close(): void {
    try {
      this.pc.close();
    } catch (_) {}
  }
}

export default PeerConnectionManager;
