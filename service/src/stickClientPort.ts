/**
 * Injectable subset used by daemon HTTP handlers. Production wires `MaveoConnectStickClient`.
 */
import type {
  AutomaticMqttReclaimOptions,
  GarageDoorCommand,
  MaveoConnectStickLifecycleEvent,
  MaveoSession,
  MaveoStickStateUpdate,
  MqttSessionLostEvent,
  MqttTransportState,
} from "maveo-connect-stick-client";

export type StickClientPort = {
  login(): Promise<MaveoSession>;
  connectMqtt(): Promise<void>;
  subscribeBlueFiResponses(): Promise<void>;
  disconnectMqtt(): Promise<void>;
  recoverMqttSession(opts?: {
    refreshCredentials?: boolean;
    stickId?: string;
    resetSessionContention?: boolean;
  }): Promise<void>;
  requestDoorStatus(): Promise<void>;
  requestLightState(): Promise<void>;
  publishLight(on: boolean): Promise<void>;
  publishGarageDoor(cmd: GarageDoorCommand): Promise<void>;
  onStickState(cb: (u: MaveoStickStateUpdate) => void): () => void;
  enableAutomaticMqttReclaim(opts: AutomaticMqttReclaimOptions): () => void;
  onMqttSessionLost(cb: (ev: MqttSessionLostEvent) => void): void;
  /**
   * Returns an unsubscribe function. Note: the upstream lib (1.0.x) only safe to call
   * AFTER `connectMqtt()` has resolved — calling it earlier throws
   * `MaveoMqttIotClient: not connected`.
   */
  onMaveoLifecycle(cb: (e: MaveoConnectStickLifecycleEvent) => void): (() => void) | void;
  getMqttTransportState(): MqttTransportState;
  isMqttConnected(): boolean;
  getAutoReclaimBackoffUntilMs(): number;
  stickSerial(env: NodeJS.ProcessEnv): string;
};
