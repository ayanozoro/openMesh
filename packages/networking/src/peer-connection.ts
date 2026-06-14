import type { PeerConnectionConfig } from "./index.js";

export interface PeerConnectionEvents {
  onIceCandidate?: (candidate: RTCIceCandidateInit) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onDataChannel?: (dc: RTCDataChannel) => void;
}

export class PeerConnectionManager {
  private pc: RTCPeerConnection;
  private events: PeerConnectionEvents;

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

  createDataChannel(label = "om-channel", options?: RTCDataChannelInit): RTCDataChannel {
    const dc = this.pc.createDataChannel(label, options);
    return dc;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(answer);
  }

  async handleOfferAndCreateAnswer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    await this.pc.setRemoteDescription(offer);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    try {
      await this.pc.addIceCandidate(candidate as RTCIceCandidateInit);
    } catch (err) {
      // ignore when empty candidate
    }
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
