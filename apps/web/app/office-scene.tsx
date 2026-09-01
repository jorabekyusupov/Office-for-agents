'use client';

import { Html, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  CanvasTexture,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  Vector3
} from 'three';
import type { SceneOccupant } from './room-semantics';
import { initialPointFor, targetPointFor } from './scene-motion';
import { defaultGraphicsQuality, graphicsProfileFor, type GraphicsQuality } from './scene-quality';

export type { SceneOccupant } from './room-semantics';
type LightingMode = 'day' | 'twilight' | 'cyberpunk';
type CameraPreset = 'overview' | 'desks' | 'briefing' | 'meeting' | 'server' | 'lounge';
type VisualMode = 'normal' | 'coffee' | 'incident' | 'party';
export type RoomArtifact = { id: string; title: string; status: string; runId?: string | null };
type OfficeSceneProps = {
  occupants: SceneOccupant[];
  artifacts: RoomArtifact[];
  onSelectAgent?: ((occupant: SceneOccupant) => void) | undefined;
  onSelectArtifact?: ((artifact: RoomArtifact) => void) | undefined;
};

const statusTone = (status: string) =>
  status === 'WORKING' || status === 'STARTING'
    ? 'active'
    : status === 'COMPLETED'
      ? 'done'
      : status === 'FAILED' || status === 'CANCELLED' || status === 'BLOCKED'
        ? 'blocked'
        : 'queued';

const statusColor = (status: string, providerColor: string) =>
  status === 'COMPLETED'
    ? '#48c58d'
    : status === 'WORKING' || status === 'STARTING'
      ? '#4ea5ff'
      : status === 'FAILED' || status === 'CANCELLED' || status === 'BLOCKED'
        ? '#f06b78'
        : status === 'WAITING_INPUT'
          ? '#f6bf63'
          : providerColor;

const activityLabel = (status: string) =>
  status === 'WORKING'
    ? 'Ishlayapti'
    : status === 'STARTING'
      ? 'Boshlamoqda'
      : status === 'COMPLETED'
        ? 'Yakunlangan'
        : status === 'WAITING' || status === 'WAITING_INPUT'
          ? 'Javob kutmoqda'
          : status === 'BLOCKED'
            ? 'To‘xtab qolgan'
            : status.toLowerCase();

const statusEmoji = (occupant: SceneOccupant) => {
  if (occupant.status === 'COMPLETED') return '🎉';
  if (occupant.status === 'FAILED' || occupant.status === 'BLOCKED' || occupant.status === 'CANCELLED')
    return '🔥';
  if (occupant.status === 'WAITING_INPUT' || occupant.status === 'WAITING') return '💭';
  if (occupant.status === 'STARTING') return '💡';
  if (occupant.pose === 'researching') return '🔍';
  if (occupant.pose === 'reviewing') return '📋';
  if (occupant.activity.includes('Terminal') || occupant.activity.includes('buyruq')) return '⚡';
  if (occupant.activity.includes('Kod') || occupant.activity.includes('fayl')) return '🛠️';
  return '⚡';
};

/* -------------------------------------------------------------------------- */
/* Web Audio SFX Engine                                                       */
/* -------------------------------------------------------------------------- */
class SoundEngine {
  private ctx: AudioContext | null = null;

  private init() {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  playTyping(bursts = 3) {
    const ctx = this.init();
    if (!ctx) return;
    for (let i = 0; i < bursts; i += 1) {
      const startTime = ctx.currentTime + i * (0.05 + Math.random() * 0.04);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(450 + Math.random() * 350, startTime);
      osc.frequency.exponentialRampToValueAtTime(120, startTime + 0.035);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200 + Math.random() * 800, startTime);
      filter.Q.setValueAtTime(3, startTime);

      gain.gain.setValueAtTime(0.022, startTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.035);

      osc.connect(filter).connect(gain).connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.04);
    }
  }

  playChime() {
    const ctx = this.init();
    if (!ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, index) => {
      const startTime = ctx.currentTime + index * 0.08;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.04, startTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.4);
    });
  }

  playAlert() {
    const ctx = this.init();
    if (!ctx) return;
    const startTime = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(280, startTime);
    osc.frequency.setValueAtTime(340, startTime + 0.1);
    gain.gain.setValueAtTime(0.03, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.28);
    osc.connect(gain).connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + 0.3);
  }
}

const sfx = new SoundEngine();

/* -------------------------------------------------------------------------- */
/* Animated IDE Screen Canvas Texture                                         */
/* -------------------------------------------------------------------------- */
function useAnimatedCodeTexture(color: string, isWorking: boolean) {
  const { ctx, texture } = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 144;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#060d19';
      ctx.fillRect(0, 0, 256, 144);
    }
    const texture = new CanvasTexture(canvas);
    return { ctx, texture };
  }, []);

  const offset = useRef(0);
  const lastRender = useRef(0);

  useFrame(({ clock }) => {
    if (!ctx) return;
    const time = clock.getElapsedTime();
    if (time - lastRender.current < 0.05) return; // ~20fps texture update cap
    lastRender.current = time;

    if (isWorking) {
      offset.current = (offset.current + 1.2) % 180;
    }

    ctx.fillStyle = '#070f1e';
    ctx.fillRect(0, 0, 256, 144);

    // Header bar
    ctx.fillStyle = '#101c30';
    ctx.fillRect(0, 0, 256, 18);
    ctx.fillStyle = '#ff5f56';
    ctx.beginPath();
    ctx.arc(10, 9, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffbd2e';
    ctx.beginPath();
    ctx.arc(20, 9, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#27c93f';
    ctx.beginPath();
    ctx.arc(30, 9, 3, 0, Math.PI * 2);
    ctx.fill();

    // Line numbers & code lines
    const lineCount = 14;
    const syntaxPalette = ['#62a8ff', '#48c58d', '#f6bf63', '#a87cff', '#5ee4ad', '#cedbe8'];

    for (let i = 0; i < lineCount; i += 1) {
      const y = 28 + i * 9 - (offset.current % 9);
      if (y < 20 || y > 140) continue;

      // Line number
      ctx.fillStyle = '#293a52';
      ctx.fillRect(8, y - 5, 12, 5);

      // Indented code tokens
      const indent = (i % 3) * 14 + 26;
      let tokenX = indent;
      const tokenWidths = [18, 34, 22, 45, 28, 16];
      for (let t = 0; t < 3; t += 1) {
        const w = tokenWidths[(i + t) % tokenWidths.length] ?? 20;
        ctx.fillStyle = syntaxPalette[(i * 2 + t) % syntaxPalette.length] ?? color;
        ctx.fillRect(tokenX, y - 5, w, 5);
        tokenX += w + 6;
      }
    }

    // Pulsing cursor
    if (Math.floor(time * 3) % 2 === 0) {
      ctx.fillStyle = color;
      ctx.fillRect(140, 118, 7, 10);
    }

    texture.needsUpdate = true;
  });

  return texture;
}

/* -------------------------------------------------------------------------- */
/* Dynamic Camera Rig with Cinematic Focus                                    */
/* -------------------------------------------------------------------------- */
function CameraController({
  preset,
  selectedAgent
}: {
  preset: CameraPreset;
  selectedAgent?: SceneOccupant | undefined;
}) {
  const { camera } = useThree();
  const currentPos = useRef(new Vector3(0, 8.5, 12.5));
  const currentTarget = useRef(new Vector3(0, 0.8, -0.55));

  const deskAnchors: [number, number, number][] = [
    [-5.4, 0, -2.55],
    [-2.7, 0, -2.55],
    [0, 0, -2.55],
    [2.7, 0, -2.55],
    [5.4, 0, -2.55],
    [-4.05, 0, 0.45],
    [-1.35, 0, 0.45],
    [1.35, 0, 0.45],
    [4.05, 0, 0.45]
  ];

  const presetPositions: Record<CameraPreset, [[number, number, number], [number, number, number]]> = {
    overview: [
      [0, 8.5, 12.5],
      [0, 0.8, -0.55]
    ],
    desks: [
      [0, 5.8, 8.8],
      [0, 0.8, -2]
    ],
    briefing: [
      [-6.8, 4.8, -1.8],
      [-5.8, 1.05, -4.8]
    ],
    meeting: [
      [-4.2, 5.5, 9.6],
      [0, 0.6, 4]
    ],
    server: [
      [8.8, 5.4, 9],
      [6.4, 1, 4.4]
    ],
    lounge: [
      [8.6, 4.6, 2.3],
      [6, 0.8, -2.4]
    ]
  };

  useFrame((_, delta) => {
    let targetPos: [number, number, number];
    let lookTarget: [number, number, number];

    if (selectedAgent) {
      const anchor = deskAnchors[selectedAgent.anchor % deskAnchors.length] ?? [0, 0, 0];
      targetPos = [anchor[0], 2.8, anchor[2] + 4.2];
      lookTarget = [anchor[0], 0.9, anchor[2]];
    } else {
      [targetPos, lookTarget] = presetPositions[preset];
    }

    currentPos.current.x = MathUtils.damp(currentPos.current.x, targetPos[0], 4.5, delta);
    currentPos.current.y = MathUtils.damp(currentPos.current.y, targetPos[1], 4.5, delta);
    currentPos.current.z = MathUtils.damp(currentPos.current.z, targetPos[2], 4.5, delta);

    currentTarget.current.x = MathUtils.damp(currentTarget.current.x, lookTarget[0], 5.5, delta);
    currentTarget.current.y = MathUtils.damp(currentTarget.current.y, lookTarget[1], 5.5, delta);
    currentTarget.current.z = MathUtils.damp(currentTarget.current.z, lookTarget[2], 5.5, delta);

    camera.position.copy(currentPos.current);
    camera.lookAt(currentTarget.current);
  });

  return null;
}

/* -------------------------------------------------------------------------- */
/* Ergonomic Swivel Mesh Office Chair                                         */
/* -------------------------------------------------------------------------- */
function OfficeChair({
  color = '#25354a',
  swivel = 0
}: {
  color?: string;
  swivel?: number;
}) {
  const chairSwivel = useRef<Group>(null);

  useFrame((_, delta) => {
    if (chairSwivel.current) {
      chairSwivel.current.rotation.y = MathUtils.damp(
        chairSwivel.current.rotation.y,
        swivel,
        5,
        delta
      );
    }
  });

  return (
    <group position={[0, 0, 0.52]}>
      {/* 5-Star Castor Base */}
      <mesh position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.05, 12]} />
        <meshStandardMaterial color="#0b121e" metalness={0.6} roughness={0.3} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => {
        const angle = (Math.PI * 2 * i) / 5;
        return (
          <group key={i} position={[0, 0.035, 0]} rotation-y={angle}>
            <mesh position={[0, 0, 0.12]} castShadow>
              <boxGeometry args={[0.035, 0.02, 0.24]} />
              <meshStandardMaterial color="#172233" metalness={0.8} roughness={0.3} />
            </mesh>
            <mesh position={[0, -0.015, 0.24]} castShadow>
              <sphereGeometry args={[0.024, 8, 8]} />
              <meshStandardMaterial color="#080c14" roughness={0.6} />
            </mesh>
          </group>
        );
      })}

      {/* Hydraulic Chrome Column */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.03, 0.035, 0.28, 16]} />
        <meshStandardMaterial color="#b2c8e0" metalness={0.9} roughness={0.15} />
      </mesh>

      {/* Swiveling Seat & Back Assembly */}
      <group ref={chairSwivel} position={[0, 0.34, 0]}>
        {/* Seat Cushion */}
        <mesh position={[0, 0.04, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.46, 0.065, 0.44]} />
          <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>

        {/* Mesh Backrest Support Frame & Lumbar Rib */}
        <group position={[0, 0.28, 0.2]}>
          {/* Chrome Spine */}
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[0.04, 0.44, 0.03]} />
            <meshStandardMaterial color="#b2c8e0" metalness={0.85} roughness={0.2} />
          </mesh>
          {/* Contoured Mesh Back */}
          <mesh position={[0, 0.04, -0.015]} castShadow>
            <boxGeometry args={[0.42, 0.42, 0.025]} />
            <meshStandardMaterial color="#131e2f" roughness={0.82} />
          </mesh>
          {/* Lumbar Accent Cushion */}
          <mesh position={[0, -0.08, -0.03]}>
            <boxGeometry args={[0.34, 0.09, 0.02]} />
            <meshStandardMaterial color={color} roughness={0.7} />
          </mesh>
        </group>

        {/* Padded Armrests */}
        {[-0.23, 0.23].map((x) => (
          <group key={x} position={[x, 0.12, 0.02]}>
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[0.025, 0.16, 0.03]} />
              <meshStandardMaterial color="#1e2c40" metalness={0.6} />
            </mesh>
            <mesh position={[0, 0.08, 0]}>
              <boxGeometry args={[0.055, 0.022, 0.24]} />
              <meshStandardMaterial color="#0d1522" roughness={0.5} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* Dynamic Multi-Segment Agent Avatar with Organic Life & Seating             */
/* -------------------------------------------------------------------------- */
function AgentAvatar({
  occupant,
  motionRate,
  motionEnabled,
  soundOn
}: {
  occupant: SceneOccupant;
  motionRate: number;
  motionEnabled: boolean;
  soundOn: boolean;
}) {
  const avatar = useRef<Group>(null);
  const body = useRef<Group>(null);
  const head = useRef<Group>(null);
  const leftArm = useRef<Group>(null);
  const rightArm = useRef<Group>(null);
  const leftLeg = useRef<Group>(null);
  const rightLeg = useRef<Group>(null);
  const badgeRef = useRef<Group>(null);

  const skin = ['#f1c6a9', '#d99b78', '#b97857', '#8f543d'][occupant.anchor % 4] ?? '#d99b78';
  const hair = ['#2b1b18', '#342622', '#151821', '#634234'][occupant.anchor % 4] ?? '#342622';
  const target = useRef(new Vector3(...targetPointFor(occupant)));
  const initialized = useRef(false);
  const travel = useRef(false);
  const walkingDirection = useRef(new Vector3());
  const pose = occupant.pose;
  const isAtDesk = occupant.roomAnchor === 'desk' || occupant.roomAnchor === 'arrival';
  const isWorking = occupant.status === 'WORKING';

  useEffect(() => {
    const root = avatar.current;
    target.current.set(...targetPointFor(occupant));
    if (!root || initialized.current) return;
    root.position.set(...initialPointFor(occupant));
    initialized.current = true;
  }, [occupant]);

  // Audio typing bursts
  const lastSound = useRef(0);
  useFrame(({ clock }, delta) => {
    const time = clock.getElapsedTime() * motionRate + occupant.anchor * 0.73;
    const root = avatar.current;
    if (!body.current || !root) return;

    if (soundOn && isWorking && time - lastSound.current > 3.2 + Math.random() * 2) {
      lastSound.current = time;
      sfx.playTyping(4);
    }

    walkingDirection.current.subVectors(target.current, root.position);
    walkingDirection.current.y = 0;
    const distance = walkingDirection.current.length();
    travel.current = motionEnabled && distance > 0.025;

    if (!motionEnabled) root.position.copy(target.current);

    if (travel.current) {
      walkingDirection.current.normalize();
      root.position.addScaledVector(
        walkingDirection.current,
        Math.min(distance, 2.45 * motionRate * delta)
      );
      const facing = Math.atan2(walkingDirection.current.x, walkingDirection.current.z);
      root.rotation.y = MathUtils.damp(root.rotation.y, facing, 12, delta);
    } else if (isAtDesk) {
      // Align facing forward when seated
      root.rotation.y = MathUtils.damp(root.rotation.y, 0, 8, delta);
    }

    const animationTime = motionEnabled ? time : 0;
    const walking = travel.current;
    const sitting = isAtDesk && !walking;
    const typing = pose === 'typing';
    const researching = pose === 'researching';
    const reviewing = pose === 'reviewing';
    const acknowledging = pose === 'acknowledging';
    const alert = pose === 'alert';

    // Organic breathing cycle & spine sway
    const breathing = Math.sin(animationTime * 2.2) * 0.012;
    body.current.position.y = walking
      ? Math.sin(animationTime * 7) * 0.035
      : sitting
        ? 0.38 + breathing
        : breathing;

    body.current.position.z = sitting ? 0.44 : 0;

    // Head subtle micro-movements & gaze
    if (head.current) {
      head.current.rotation.y = researching
        ? Math.sin(animationTime * 1.2) * 0.22
        : typing
          ? Math.sin(animationTime * 2.5) * 0.06
          : Math.sin(animationTime * 0.9) * 0.12;
      head.current.rotation.x = typing ? 0.18 : sitting ? 0.06 : 0;
    }

    // Arms kinematic movements
    if (leftArm.current) {
      leftArm.current.rotation.x = walking
        ? Math.sin(animationTime * 7) * 0.52
        : sitting && typing
          ? 0.92 + Math.sin(animationTime * 10) * 0.08
          : researching || reviewing
            ? 0.52 + Math.sin(animationTime * 3) * 0.12
            : acknowledging
              ? -0.5 + Math.sin(animationTime * 4) * 0.18
              : alert
                ? Math.sin(animationTime * 2) * 0.25
                : 0.22;
      leftArm.current.rotation.z = sitting && typing ? 0.15 : 0.28;
    }

    if (rightArm.current) {
      rightArm.current.rotation.x = walking
        ? -Math.sin(animationTime * 7) * 0.52
        : sitting && typing
          ? 0.92 - Math.sin(animationTime * 10) * 0.08
          : researching || reviewing
            ? 0.42 - Math.sin(animationTime * 3) * 0.12
            : acknowledging
              ? -0.5 - Math.sin(animationTime * 4) * 0.18
              : alert
                ? -Math.sin(animationTime * 2) * 0.25
                : 0.22;
      rightArm.current.rotation.z = sitting && typing ? -0.15 : -0.28;
    }

    // Legs: Seated vs Walking
    if (leftLeg.current) {
      if (sitting) {
        leftLeg.current.position.set(-0.12, 0.02, 0.16);
        leftLeg.current.rotation.x = Math.PI * 0.46;
      } else {
        leftLeg.current.position.set(-0.12, 0.08, 0);
        leftLeg.current.rotation.x = walking ? Math.sin(animationTime * 7) * 0.48 : 0;
      }
    }

    if (rightLeg.current) {
      if (sitting) {
        rightLeg.current.position.set(0.12, 0.02, 0.16);
        rightLeg.current.rotation.x = Math.PI * 0.46;
      } else {
        rightLeg.current.position.set(0.12, 0.08, 0);
        rightLeg.current.rotation.x = walking ? -Math.sin(animationTime * 7) * 0.48 : 0;
      }
    }

    // Floating 3D Badge bobbing
    if (badgeRef.current) {
      badgeRef.current.position.y = 1.25 + Math.sin(animationTime * 3.2) * 0.045;
    }
  });

  const contextProp =
    pose === 'typing' ? (
      <>
        <mesh position={[0.02, 0.48, -0.28]}>
          <boxGeometry args={[0.26, 0.035, 0.13]} />
          <meshStandardMaterial color="#9bc6ee" emissive="#386ca6" emissiveIntensity={0.4} />
        </mesh>
        <mesh position={[0.02, 0.58, -0.34]} rotation-x={-0.7}>
          <planeGeometry args={[0.24, 0.12]} />
          <meshBasicMaterial color="#39ff14" transparent opacity={0.7} />
        </mesh>
      </>
    ) : pose === 'researching' ? (
      <mesh position={[0.2, 0.43, -0.2]} rotation-z={-0.22}>
        <boxGeometry args={[0.22, 0.3, 0.035]} />
        <meshStandardMaterial color="#51b4ff" emissive="#1b6ca7" emissiveIntensity={0.45} />
      </mesh>
    ) : pose === 'reviewing' ? (
      <mesh position={[0.2, 0.43, -0.2]} rotation-z={-0.22}>
        <boxGeometry args={[0.22, 0.3, 0.035]} />
        <meshStandardMaterial color="#f6bf63" emissive="#a36716" emissiveIntensity={0.28} />
      </mesh>
    ) : pose === 'waiting' ? (
      <mesh position={[0, 1.05, 0]}>
        <sphereGeometry args={[0.075, 12, 12]} />
        <meshStandardMaterial color="#f6bf63" emissive="#f6bf63" emissiveIntensity={1.2} />
      </mesh>
    ) : pose === 'alert' ? (
      <mesh position={[0, 1.05, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.16, 12]} />
        <meshStandardMaterial color="#f06b78" emissive="#f06b78" emissiveIntensity={1.5} />
      </mesh>
    ) : pose === 'acknowledging' && occupant.hasReadyArtifact ? (
      <mesh position={[0.24, 0.3, -0.18]}>
        <boxGeometry args={[0.2, 0.17, 0.16]} />
        <meshStandardMaterial color="#48c58d" emissive="#247d56" emissiveIntensity={0.42} />
      </mesh>
    ) : null;

  return (
    <group ref={avatar}>
      <group ref={body} scale={1.15}>
        {/* Left Leg with Upper & Lower Segment */}
        <group ref={leftLeg} position={[-0.12, 0.08, 0]}>
          <mesh position={[0, -0.16, 0]} castShadow>
            <capsuleGeometry args={[0.065, 0.28, 6, 10]} />
            <meshStandardMaterial color="#25354a" roughness={0.74} />
          </mesh>
          <mesh position={[0, -0.35, 0.035]} castShadow>
            <boxGeometry args={[0.12, 0.06, 0.19]} />
            <meshStandardMaterial color="#101827" />
          </mesh>
        </group>

        {/* Right Leg with Upper & Lower Segment */}
        <group ref={rightLeg} position={[0.12, 0.08, 0]}>
          <mesh position={[0, -0.16, 0]} castShadow>
            <capsuleGeometry args={[0.065, 0.28, 6, 10]} />
            <meshStandardMaterial color="#25354a" roughness={0.74} />
          </mesh>
          <mesh position={[0, -0.35, 0.035]} castShadow>
            <boxGeometry args={[0.12, 0.06, 0.19]} />
            <meshStandardMaterial color="#101827" />
          </mesh>
        </group>

        {/* Torso & Shirt */}
        <mesh position={[0, 0.27, 0]} castShadow>
          <capsuleGeometry args={[0.18, 0.36, 8, 14]} />
          <meshStandardMaterial color={occupant.color} roughness={0.58} metalness={0.05} />
        </mesh>

        {/* Left Arm & Hand */}
        <group ref={leftArm} position={[-0.21, 0.37, -0.01]} rotation-z={0.3}>
          <mesh position={[0, -0.16, 0]} castShadow>
            <capsuleGeometry args={[0.055, 0.22, 6, 10]} />
            <meshStandardMaterial color={occupant.color} roughness={0.62} />
          </mesh>
          <mesh position={[0, -0.31, -0.02]}>
            <sphereGeometry args={[0.066, 12, 12]} />
            <meshStandardMaterial color={skin} roughness={0.76} />
          </mesh>
        </group>

        {/* Right Arm & Hand */}
        <group ref={rightArm} position={[0.21, 0.37, -0.01]} rotation-z={-0.3}>
          <mesh position={[0, -0.16, 0]} castShadow>
            <capsuleGeometry args={[0.055, 0.22, 6, 10]} />
            <meshStandardMaterial color={occupant.color} roughness={0.62} />
          </mesh>
          <mesh position={[0, -0.31, -0.02]}>
            <sphereGeometry args={[0.066, 12, 12]} />
            <meshStandardMaterial color={skin} roughness={0.76} />
          </mesh>
        </group>

        {/* Head, Hair & Eyes */}
        <group ref={head} position={[0, 0.65, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.155, 20, 18]} />
            <meshStandardMaterial color={skin} roughness={0.75} />
          </mesh>
          <mesh position={[0, 0.085, -0.01]} castShadow>
            <sphereGeometry args={[0.158, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
            <meshStandardMaterial color={hair} roughness={0.9} />
          </mesh>
          <mesh position={[-0.055, 0.005, -0.135]}>
            <sphereGeometry args={[0.012, 8, 8]} />
            <meshBasicMaterial color="#172033" />
          </mesh>
          <mesh position={[0.055, 0.005, -0.135]}>
            <sphereGeometry args={[0.012, 8, 8]} />
            <meshBasicMaterial color="#172033" />
          </mesh>
        </group>

        {contextProp}

        {/* Floating 3D Holographic Status Badge */}
        <group ref={badgeRef} position={[0, 1.25, 0]}>
          <Html center distanceFactor={6.8} sprite>
            <div className={`scene-desk-label ${statusTone(occupant.status)} scene-agent-float`}>
              <span className="scene-status-pill">
                <i>{statusEmoji(occupant)}</i>
                {occupant.agentName}
              </span>
              <b>{occupant.activity || activityLabel(occupant.status)}</b>
              <small title={occupant.name}>{occupant.name}</small>
            </div>
          </Html>
        </group>
      </group>
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* Workstation Desk with Animated Monitors & Accessories                      */
/* -------------------------------------------------------------------------- */
function Desk({
  occupant,
  onSelectAgent
}: {
  occupant: SceneOccupant;
  onSelectAgent?: ((occupant: SceneOccupant) => void) | undefined;
}) {
  const anchors: [number, number, number][] = [
    [-5.4, -2.55, 0],
    [-2.7, -2.55, 0],
    [0, -2.55, 0],
    [2.7, -2.55, 0],
    [5.4, -2.55, 0],
    [-4.05, 0.45, Math.PI],
    [-1.35, 0.45, Math.PI],
    [1.35, 0.45, Math.PI],
    [4.05, 0.45, Math.PI]
  ];
  const [x, z, rotation] = anchors[occupant.anchor % anchors.length] ?? anchors[0] ?? [0, 0, 0];
  const signal = statusColor(occupant.status, occupant.color);
  const isWorking = occupant.status === 'WORKING' || occupant.status === 'STARTING';
  const codeTexture = useAnimatedCodeTexture(signal, isWorking);
  const screenLight = useRef<PointLight>(null);

  useFrame(({ clock }) => {
    if (screenLight.current && isWorking) {
      screenLight.current.intensity = 0.65 + Math.sin(clock.getElapsedTime() * 10) * 0.08;
    }
  });

  return (
    <group
      position={[x, 0, z]}
      rotation-y={rotation}
      onClick={(event) => {
        event.stopPropagation();
        onSelectAgent?.(occupant);
      }}
    >
      {/* Wooden Desk Top */}
      <mesh position={[0, 0.58, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.58, 0.08, 0.78]} />
        <meshStandardMaterial color="#1e2c40" metalness={0.35} roughness={0.45} />
      </mesh>

      {/* Desk Metal Legs */}
      {[-0.72, 0.72].map((lx) => (
        <group key={lx} position={[lx, 0.28, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.04, 0.54, 0.68]} />
            <meshStandardMaterial color="#0c131f" metalness={0.8} roughness={0.25} />
          </mesh>
        </group>
      ))}

      {/* Primary Widescreen Curved Monitor */}
      <mesh position={[0, 0.93, -0.16]} castShadow>
        <boxGeometry args={[0.92, 0.48, 0.06]} />
        <meshStandardMaterial color="#050b15" metalness={0.65} roughness={0.25} />
      </mesh>
      {/* Primary Display Screen with Animated Code */}
      <mesh position={[0, 0.93, -0.126]}>
        <planeGeometry args={[0.86, 0.42]} />
        <meshBasicMaterial map={codeTexture} transparent opacity={0.95} />
      </mesh>

      {/* Monitor Stand */}
      <mesh position={[0, 0.7, -0.18]} castShadow>
        <cylinderGeometry args={[0.025, 0.03, 0.22, 12]} />
        <meshStandardMaterial color="#0b121e" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.625, -0.18]}>
        <boxGeometry args={[0.22, 0.015, 0.16]} />
        <meshStandardMaterial color="#0b121e" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Secondary Vertical Code / Telemetry Monitor */}
      <mesh position={[-0.52, 0.95, -0.1]} rotation-y={0.28}>
        <boxGeometry args={[0.34, 0.52, 0.05]} />
        <meshStandardMaterial color="#080d17" metalness={0.55} roughness={0.3} />
      </mesh>
      <mesh position={[-0.52, 0.95, -0.07]} rotation-y={0.28}>
        <planeGeometry args={[0.29, 0.46]} />
        <meshBasicMaterial color="#0a1829" />
      </mesh>
      <mesh position={[-0.52, 0.95, -0.065]} rotation-y={0.28}>
        <planeGeometry args={[0.26, 0.42]} />
        <meshBasicMaterial color={signal} transparent opacity={0.68} />
      </mesh>

      {/* Dynamic Screen Glow Light onto Agent & Desk */}
      <pointLight
        ref={screenLight}
        position={[0, 0.95, 0.05]}
        color={signal}
        intensity={isWorking ? 0.7 : 0.25}
        distance={2.2}
      />

      {/* Mechanical Keyboard with Backlit Keycaps */}
      <group position={[0, 0.63, 0.18]}>
        <mesh castShadow>
          <boxGeometry args={[0.48, 0.022, 0.17]} />
          <meshStandardMaterial color="#0e1726" metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.016, 0]}>
          <boxGeometry args={[0.44, 0.012, 0.14]} />
          <meshStandardMaterial color="#1f2d42" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.023, 0.045]}>
          <boxGeometry args={[0.16, 0.008, 0.02]} />
          <meshStandardMaterial color={signal} emissive={signal} emissiveIntensity={0.6} />
        </mesh>
      </group>

      {/* Optical Mouse with RGB Glow Stripe */}
      <group position={[0.34, 0.63, 0.18]}>
        <mesh castShadow>
          <boxGeometry args={[0.07, 0.025, 0.11]} />
          <meshStandardMaterial color="#090f19" roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.014, 0]}>
          <boxGeometry args={[0.012, 0.006, 0.09]} />
          <meshStandardMaterial color={signal} emissive={signal} emissiveIntensity={0.8} />
        </mesh>
      </group>

      {/* Coffee Mug with Steaming Coffee */}
      <group position={[-0.42, 0.63, 0.22]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.045, 0.04, 0.09, 16]} />
          <meshStandardMaterial color="#eef3f8" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.038, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.01, 16]} />
          <meshStandardMaterial color="#2b170e" roughness={0.2} />
        </mesh>
        {isWorking && <SteamEmitter position={[0, 0.06, 0]} count={4} />}
      </group>

      {/* Desk Status LED Beacon */}
      <mesh position={[-0.66, 0.72, 0.22]}>
        <cylinderGeometry args={[0.04, 0.04, 0.14, 16]} />
        <meshStandardMaterial color={signal} emissive={signal} emissiveIntensity={0.8} />
      </mesh>

      {/* Ergonomic Swivel Mesh Office Chair */}
      <OfficeChair color={occupant.color} swivel={isWorking ? 0.05 : 0} />
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* Particle Steam Emitter                                                     */
/* -------------------------------------------------------------------------- */
function SteamEmitter({
  position = [0, 0, 0],
  count = 6
}: {
  position?: [number, number, number];
  count?: number;
}) {
  const particles = useRef<Mesh[]>([]);

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    particles.current.forEach((mesh, index) => {
      if (!mesh) return;
      const offset = (time * 0.45 + (index * 1) / count) % 1;
      mesh.position.y = offset * 0.42;
      mesh.position.x = Math.sin(time * 2 + index) * 0.025;
      mesh.scale.setScalar(0.015 + offset * 0.035);
      if (mesh.material instanceof MeshStandardMaterial) {
        mesh.material.opacity = (1 - offset) * 0.35;
      }
    });
  });

  return (
    <group position={position}>
      {Array.from({ length: count }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            if (el) particles.current[i] = el;
          }}
        >
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color="#eef5fc" transparent opacity={0.3} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* Dynamic Server Rack with Async Data LEDs                                   */
/* -------------------------------------------------------------------------- */
function ServerZone() {
  const leds = useRef<Mesh[]>([]);

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    leds.current.forEach((led, i) => {
      if (!led || !(led.material instanceof MeshStandardMaterial)) return;
      const blink = Math.sin(time * (8 + (i % 7) * 3) + i) > 0.15;
      led.material.emissiveIntensity = blink ? 2.2 : 0.2;
    });
  });

  return (
    <group position={[6.45, 0, 4.45]}>
      {[-1.05, 0, 1.05].map((offset, index) => (
        <group key={offset} position={[offset, 0, 0]}>
          <mesh position={[0, 1.18, 0]} castShadow>
            <boxGeometry args={[0.72, 2.36, 0.72]} />
            <meshStandardMaterial color="#111827" metalness={0.7} roughness={0.3} />
          </mesh>
          <mesh position={[0, 1.18, -0.371]}>
            <boxGeometry args={[0.51, 1.86, 0.018]} />
            <meshStandardMaterial color="#070e17" emissive="#00f5d4" emissiveIntensity={0.15} />
          </mesh>
          {[0.4, 0.65, 0.9, 1.15, 1.4, 1.65, 1.9].map((y, row) => (
            <group key={y} position={[0, y, -0.39]}>
              {[-0.16, -0.05, 0.06, 0.17].map((lx, col) => {
                const ledIndex = index * 28 + row * 4 + col;
                const ledColor = col % 2 === 0 ? '#00f5d4' : row % 2 === 0 ? '#ff007f' : '#39ff14';
                return (
                  <mesh
                    key={lx}
                    position={[lx, 0, 0]}
                    ref={(el) => {
                      if (el) leds.current[ledIndex] = el;
                    }}
                  >
                    <boxGeometry args={[0.045, 0.025, 0.018]} />
                    <meshStandardMaterial
                      color={ledColor}
                      emissive={ledColor}
                      emissiveIntensity={1.8}
                    />
                  </mesh>
                );
              })}
            </group>
          ))}
        </group>
      ))}
      <mesh position={[-0.02, 0.05, 1.12]}>
        <boxGeometry args={[3.95, 0.12, 0.12]} />
        <meshStandardMaterial color="#00f5d4" emissive="#00f5d4" emissiveIntensity={1.4} />
      </mesh>
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* Coffee Lounge with Steaming Espresso Machine                               */
/* -------------------------------------------------------------------------- */
function CoffeeAndLounge() {
  return (
    <group>
      <group position={[6.45, 0, -4.6]}>
        {/* Coffee Bar Counter */}
        <mesh position={[0, 0.58, 0]} castShadow>
          <boxGeometry args={[3.3, 1.16, 0.78]} />
          <meshStandardMaterial color="#5a3d28" roughness={0.62} />
        </mesh>
        <mesh position={[0, 1.2, 0]}>
          <boxGeometry args={[3.5, 0.12, 0.92]} />
          <meshStandardMaterial color="#c49a6c" roughness={0.5} />
        </mesh>

        {/* Espresso Machine */}
        <mesh position={[-0.35, 1.5, 0]} castShadow>
          <boxGeometry args={[0.64, 0.6, 0.44]} />
          <meshStandardMaterial color="#d62828" metalness={0.55} roughness={0.32} />
        </mesh>
        <mesh position={[-0.35, 1.62, 0.23]}>
          <boxGeometry args={[0.42, 0.14, 0.04]} />
          <meshStandardMaterial color="#111" metalness={0.8} roughness={0.2} />
        </mesh>
        <SteamEmitter position={[-0.35, 1.84, 0]} count={7} />

        {/* Coffee Cups */}
        <mesh position={[0.7, 1.35, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 0.27, 16]} />
          <meshStandardMaterial color="#f1e7da" roughness={0.7} />
        </mesh>
        <mesh position={[1.12, 1.35, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 0.27, 16]} />
          <meshStandardMaterial color="#f1e7da" roughness={0.7} />
        </mesh>
      </group>

      {/* Plush Lounge Sofa */}
      <group position={[5.8, 0, -0.7]}>
        <mesh position={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[2.6, 0.72, 0.84]} />
          <meshStandardMaterial color="#7209b7" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.95, -0.1]}>
          <boxGeometry args={[2.6, 0.45, 0.18]} />
          <meshStandardMaterial color="#8338ec" roughness={0.74} />
        </mesh>
        <mesh position={[-1.85, 0.86, 0.2]}>
          <boxGeometry args={[0.72, 1.72, 0.4]} />
          <meshStandardMaterial color="#171b2e" metalness={0.5} />
        </mesh>
        <mesh position={[-1.85, 1.06, -0.02]}>
          <boxGeometry args={[0.5, 0.48, 0.025]} />
          <meshStandardMaterial color="#ff007f" emissive="#ff007f" emissiveIntensity={1.1} />
        </mesh>
      </group>
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* Research Whiteboard                                                        */
/* -------------------------------------------------------------------------- */
function ResearchAndWhiteboard() {
  return (
    <group position={[-6.55, 0, -4.9]}>
      <mesh position={[0, 1.38, 0]}>
        <boxGeometry args={[2.75, 1.88, 0.1]} />
        <meshStandardMaterial color="#e7eff4" roughness={0.56} />
      </mesh>
      <mesh position={[-0.56, 1.5, 0.07]}>
        <boxGeometry args={[0.76, 0.06, 0.025]} />
        <meshBasicMaterial color="#2563eb" />
      </mesh>
      <mesh position={[-0.56, 1.25, 0.07]}>
        <boxGeometry args={[0.92, 0.06, 0.025]} />
        <meshBasicMaterial color="#0f766e" />
      </mesh>
      <mesh position={[0.52, 1.52, 0.07]}>
        <boxGeometry args={[0.62, 0.52, 0.025]} />
        <meshBasicMaterial color="#ffbe0b" />
      </mesh>
      <mesh position={[0, 0.38, 0.5]} castShadow>
        <boxGeometry args={[1.7, 0.1, 0.55]} />
        <meshStandardMaterial color="#c49a6c" roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.82, 0.42]}>
        <boxGeometry args={[0.66, 0.38, 0.06]} />
        <meshStandardMaterial color="#091423" metalness={0.42} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.82, 0.38]}>
        <planeGeometry args={[0.54, 0.25]} />
        <meshBasicMaterial color="#4cc9f0" transparent opacity={0.72} />
      </mesh>
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* Plants with Subtle Wind Sway                                               */
/* -------------------------------------------------------------------------- */
function ArcadeAndPlants() {
  const foliageGroup = useRef<Group>(null);
  const plantPositions: readonly (readonly [number, number])[] = [
    [4.75, -3.05],
    [7.85, -2.8],
    [7.3, 2.45]
  ];

  useFrame(({ clock }) => {
    if (foliageGroup.current) {
      foliageGroup.current.rotation.z = Math.sin(clock.getElapsedTime() * 1.6) * 0.04;
    }
  });

  return (
    <group>
      {/* Retro Arcade Machine */}
      <group position={[8, 0, 0.82]}>
        <mesh position={[0, 0.85, 0]} castShadow>
          <boxGeometry args={[0.68, 1.7, 0.48]} />
          <meshStandardMaterial color="#16182b" metalness={0.45} roughness={0.48} />
        </mesh>
        <mesh position={[0, 1.06, -0.25]}>
          <boxGeometry args={[0.48, 0.48, 0.025]} />
          <meshStandardMaterial color="#ff007f" emissive="#ff007f" emissiveIntensity={1.1} />
        </mesh>
        <mesh position={[0, 0.5, -0.28]}>
          <sphereGeometry args={[0.08, 12, 12]} />
          <meshStandardMaterial color="#ffbe0b" emissive="#ffbe0b" emissiveIntensity={0.65} />
        </mesh>
      </group>

      {/* Wind-Swaying Indoor Plants */}
      <group ref={foliageGroup}>
        {plantPositions.map(([x, z]) => (
          <group key={`${x}:${z}`} position={[x, 0, z]}>
            <mesh position={[0, 0.26, 0]}>
              <cylinderGeometry args={[0.24, 0.3, 0.52, 12]} />
              <meshStandardMaterial color="#d97736" roughness={0.7} />
            </mesh>
            {[-0.18, 0, 0.18].map((offset) => (
              <mesh
                key={offset}
                position={[offset, 0.68 + Math.abs(offset), 0]}
                rotation-z={offset * 1.6}
              >
                <sphereGeometry args={[0.21, 12, 12]} />
                <meshStandardMaterial
                  color={offset === 0 ? '#38b000' : '#197217'}
                  roughness={0.8}
                />
              </mesh>
            ))}
          </group>
        ))}
      </group>
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* Delivery Shelf                                                             */
/* -------------------------------------------------------------------------- */
function DeliveryShelf({
  artifacts,
  onSelectArtifact
}: {
  artifacts: RoomArtifact[];
  onSelectArtifact?: ((artifact: RoomArtifact) => void) | undefined;
}) {
  const ready = artifacts
    .filter((artifact) => ['READY', 'APPROVED'].includes(artifact.status.toUpperCase()))
    .slice(0, 4);
  return (
    <group position={[6.72, 0, -5.2]}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[1.9, 0.12, 0.54]} />
        <meshStandardMaterial color="#1b7868" metalness={0.22} roughness={0.5} />
      </mesh>
      {ready.map((artifact, index) => (
        <group
          key={artifact.id}
          position={[-0.62 + index * 0.42, 0.64, 0]}
          onClick={(event) => {
            event.stopPropagation();
            onSelectArtifact?.(artifact);
          }}
        >
          <mesh castShadow>
            <boxGeometry args={[0.28, 0.28, 0.22]} />
            <meshStandardMaterial color="#48c58d" emissive="#1d6f4b" emissiveIntensity={0.36} />
          </mesh>
          <Html position={[0, 0.42, 0]} center distanceFactor={7} sprite>
            <button
              className="scene-artifact-tag"
              type="button"
              aria-label={`Open artifact ${artifact.title}`}
              onClick={() => onSelectArtifact?.(artifact)}
            >
              {artifact.title}
            </button>
          </Html>
        </group>
      ))}
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* Briefing Wall                                                              */
/* -------------------------------------------------------------------------- */
function BriefingWall({
  artifacts,
  onSelectArtifact
}: {
  artifacts: RoomArtifact[];
  onSelectArtifact?: ((artifact: RoomArtifact) => void) | undefined;
}) {
  return (
    <group position={[0, 0, -5.85]}>
      <mesh position={[0, 1.58, 0]} receiveShadow>
        <boxGeometry args={[17.2, 3.16, 0.15]} />
        <meshStandardMaterial color="#0a1424" metalness={0.28} roughness={0.72} />
      </mesh>
      <mesh position={[0, 1.7, 0.1]}>
        <boxGeometry args={[3.12, 1.56, 0.04]} />
        <meshStandardMaterial color="#0d234a" emissive="#1d69ca" emissiveIntensity={0.32} />
      </mesh>
      <mesh position={[-2.87, 1.82, 0.1]}>
        <boxGeometry args={[1.18, 0.9, 0.04]} />
        <meshStandardMaterial color="#10263e" emissive="#255e9f" emissiveIntensity={0.17} />
      </mesh>
      <mesh position={[2.87, 1.82, 0.1]}>
        <boxGeometry args={[1.18, 0.9, 0.04]} />
        <meshStandardMaterial color="#10263e" emissive="#255e9f" emissiveIntensity={0.17} />
      </mesh>
      <DeliveryShelf artifacts={artifacts} onSelectArtifact={onSelectArtifact} />
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* Meeting Zone                                                               */
/* -------------------------------------------------------------------------- */
function MeetingZone() {
  return (
    <group position={[0, 0, 4.05]}>
      <mesh position={[0, 0.48, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.45, 1.45, 0.14, 40]} />
        <meshStandardMaterial color="#24405a" metalness={0.45} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.19, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.55, 0.52, 24]} />
        <meshStandardMaterial color="#17283d" metalness={0.4} roughness={0.55} />
      </mesh>
      {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((angle) => (
        <group
          key={angle}
          position={[Math.cos(angle) * 1.5, 0, Math.sin(angle) * 1.5]}
          rotation-y={-angle}
        >
          <mesh position={[0, 0.16, 0]} castShadow>
            <cylinderGeometry args={[0.29, 0.34, 0.34, 18]} />
            <meshStandardMaterial color="#16263c" roughness={0.68} />
          </mesh>
          <mesh position={[0, 0.48, 0]}>
            <sphereGeometry args={[0.2, 20, 20]} />
            <meshStandardMaterial color="#cedbe8" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* Voxel Floor Tiles                                                          */
/* -------------------------------------------------------------------------- */
function VoxelFloor() {
  const tiles = useMemo(() => {
    const next: ReactNode[] = [];
    for (let x = -9; x < 9; x += 1)
      for (let z = -7; z < 7; z += 1) {
        const server = x >= 4 && z >= 2;
        const lounge = x >= 4 && z < 2;
        const meeting = x < -3 && z >= 2;
        const color = server
          ? (x + z) % 2
            ? '#132a35'
            : '#0d202a'
          : lounge
            ? (x + z) % 2
              ? '#34254b'
              : '#281d3c'
            : meeting
              ? (x + z) % 2
                ? '#203a3c'
                : '#183035'
              : (x + z) % 2
                ? '#17263a'
                : '#122238';
        next.push(
          <mesh key={`${x}:${z}`} position={[x + 0.5, -0.09, z + 0.5]} receiveShadow>
            <boxGeometry args={[0.98, 0.16, 0.98]} />
            <meshStandardMaterial color={color} roughness={0.84} metalness={0.08} />
          </mesh>
        );
      }
    return next;
  }, []);
  return <group>{tiles}</group>;
}

/* -------------------------------------------------------------------------- */
/* Overall Office Shell Architecture                                          */
/* -------------------------------------------------------------------------- */
function OfficeShell() {
  return (
    <>
      <VoxelFloor />
      <mesh position={[0, -0.22, 0]} receiveShadow>
        <boxGeometry args={[18.5, 0.2, 14.5]} />
        <meshStandardMaterial color="#080d17" />
      </mesh>
      <mesh position={[0, 2.25, -7.22]}>
        <boxGeometry args={[18.4, 4.5, 0.28]} />
        <meshStandardMaterial color="#1f2330" roughness={0.72} />
      </mesh>
      <mesh position={[-9.22, 2.25, 0]}>
        <boxGeometry args={[0.28, 4.5, 14.4]} />
        <meshStandardMaterial color="#1f2330" roughness={0.72} />
      </mesh>
      <mesh position={[0, 4.24, -7.04]}>
        <boxGeometry args={[17.8, 0.08, 0.08]} />
        <meshStandardMaterial color="#00f5d4" emissive="#00f5d4" emissiveIntensity={1.1} />
      </mesh>
      <mesh position={[-9.04, 4.24, 0]}>
        <boxGeometry args={[0.08, 0.08, 13.8]} />
        <meshStandardMaterial color="#ff007f" emissive="#ff007f" emissiveIntensity={1.1} />
      </mesh>
      <mesh position={[-6.95, 1.8, 3.2]}>
        <boxGeometry args={[2.15, 1.45, 0.05]} />
        <meshStandardMaterial color="#12345c" emissive="#236ec4" emissiveIntensity={0.24} />
      </mesh>
      <mesh position={[6.95, 1.8, 3.2]}>
        <boxGeometry args={[2.15, 1.45, 0.05]} />
        <meshStandardMaterial color="#12345c" emissive="#236ec4" emissiveIntensity={0.24} />
      </mesh>
      <ResearchAndWhiteboard />
      <CoffeeAndLounge />
      <ArcadeAndPlants />
      <ServerZone />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Room Scene Container                                                       */
/* -------------------------------------------------------------------------- */
function Room({
  occupants,
  artifacts,
  lighting,
  preset,
  visualMode,
  motionEnabled,
  soundOn,
  selectedAgent,
  onSelectAgent,
  onSelectArtifact
}: OfficeSceneProps & {
  lighting: LightingMode;
  preset: CameraPreset;
  visualMode: VisualMode;
  motionEnabled: boolean;
  soundOn: boolean;
  selectedAgent?: SceneOccupant | undefined;
}) {
  const palette: Record<
    LightingMode,
    { background: string; ambient: number; key: string; neon: string }
  > = {
    day: { background: '#06101f', ambient: 0.82, key: '#ffffff', neon: '#48c58d' },
    twilight: { background: '#100d1c', ambient: 0.55, key: '#ff9b6b', neon: '#ffbe0b' },
    cyberpunk: { background: '#05040d', ambient: 0.36, key: '#f72585', neon: '#00f5d4' }
  };
  const theme = palette[lighting];
  const motionRate = visualMode === 'coffee' ? 2.4 : visualMode === 'party' ? 1.55 : 1;
  const alert = visualMode === 'incident';

  return (
    <>
      <color attach="background" args={[alert ? '#210713' : theme.background]} />
      <fog attach="fog" args={[alert ? '#210713' : theme.background, 11, 25]} />
      <ambientLight intensity={theme.ambient} />
      <directionalLight
        position={[3.8, 8.5, 4]}
        color={alert ? '#ff284f' : theme.key}
        intensity={alert ? 1.55 : 2.25}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <pointLight
        position={[-6.2, 2.6, 0.5]}
        color={alert ? '#ff0044' : '#4ea5ff'}
        intensity={alert ? 21 : 14}
        distance={8}
      />
      <pointLight
        position={[6.2, 2.2, -1.2]}
        color={theme.neon}
        intensity={visualMode === 'party' ? 20 : 11}
        distance={8}
      />

      <OfficeShell />
      <BriefingWall artifacts={artifacts} onSelectArtifact={onSelectArtifact} />
      <MeetingZone />

      {/* Desks */}
      {occupants.map((occupant) => (
        <Desk key={`desk:${occupant.id}`} occupant={occupant} onSelectAgent={onSelectAgent} />
      ))}

      {/* Avatars */}
      {occupants.map((occupant) => (
        <group
          key={`agent:${occupant.id}`}
          onClick={(event) => {
            event.stopPropagation();
            onSelectAgent?.(occupant);
          }}
        >
          <AgentAvatar
            occupant={occupant}
            motionRate={motionRate}
            motionEnabled={motionEnabled}
            soundOn={soundOn}
          />
        </group>
      ))}

      <CameraController preset={preset} selectedAgent={selectedAgent} />
      <OrbitControls
        enablePan
        enableDamping
        dampingFactor={0.08}
        minDistance={6}
        maxDistance={20}
        minPolarAngle={0.45}
        maxPolarAngle={1.42}
        target={[0, 0.8, -0.55]}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Accessible 2D Fallback                                                     */
/* -------------------------------------------------------------------------- */
function RoomFallback({ occupants, artifacts, onSelectAgent, onSelectArtifact }: OfficeSceneProps) {
  return (
    <div className="room-fallback" role="region" aria-label="Project room fallback">
      <div className="room-fallback-briefing">
        <span>LIVE BRIEFING WALL</span>
        <i />
        <i />
        <i />
      </div>
      <div className="room-fallback-grid">
        {occupants.map((occupant) => (
          <button
            type="button"
            className={`room-fallback-desk ${statusTone(occupant.status)}`}
            key={occupant.id}
            onClick={() => onSelectAgent?.(occupant)}
          >
            <span style={{ backgroundColor: statusColor(occupant.status, occupant.color) }} />
            <b>
              {statusEmoji(occupant)} {occupant.agentName} ·{' '}
              {occupant.activity || activityLabel(occupant.status)}
            </b>
            <small>{occupant.name}</small>
          </button>
        ))}
        {!occupants.length && (
          <p className="room-empty">No agent runs have been assigned to this room yet.</p>
        )}
      </div>
      <div className="room-fallback-artifacts">
        Delivery shelf ·{' '}
        {artifacts
          .filter((artifact) => ['READY', 'APPROVED'].includes(artifact.status.toUpperCase()))
          .map((artifact) => (
            <button type="button" key={artifact.id} onClick={() => onSelectArtifact?.(artifact)}>
              {artifact.title}
            </button>
          ))}
        {!artifacts.some((artifact) =>
          ['READY', 'APPROVED'].includes(artifact.status.toUpperCase())
        ) && 'no authorized artifact'}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Exported Main OfficeScene Component                                        */
/* -------------------------------------------------------------------------- */
export function OfficeScene({
  occupants,
  artifacts,
  onSelectAgent,
  onSelectArtifact
}: OfficeSceneProps) {
  const [lighting, setLighting] = useState<LightingMode>('day');
  const [preset, setPreset] = useState<CameraPreset>('overview');
  const [visualMode, setVisualMode] = useState<VisualMode>('normal');
  const [soundOn, setSoundOn] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pageHidden, setPageHidden] = useState(false);
  const [quality, setQuality] = useState<GraphicsQuality>('balanced');
  const [selectedOccupant, setSelectedOccupant] = useState<SceneOccupant | undefined>();

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotion = () => {
      setReducedMotion(media.matches);
      setQuality((previous) =>
        previous === 'balanced' ? defaultGraphicsQuality(media.matches) : previous
      );
    };
    const syncVisibility = () => setPageHidden(document.hidden);
    const stored = window.localStorage.getItem('ai-office.graphics-quality');
    if (stored === 'high' || stored === 'balanced' || stored === 'low') setQuality(stored);
    syncMotion();
    syncVisibility();
    media.addEventListener('change', syncMotion);
    document.addEventListener('visibilitychange', syncVisibility);
    return () => {
      media.removeEventListener('change', syncMotion);
      document.removeEventListener('visibilitychange', syncVisibility);
    };
  }, []);

  const changeQuality = (next: GraphicsQuality) => {
    setQuality(next);
    window.localStorage.setItem('ai-office.graphics-quality', next);
  };

  const graphics = graphicsProfileFor(quality);
  const active = occupants.find(
    (occupant) => occupant.status === 'WORKING' || occupant.status === 'STARTING'
  );
  const activeCount = occupants.filter(
    (occupant) => occupant.status === 'WORKING' || occupant.status === 'STARTING'
  ).length;

  const toggleSound = () => {
    const nextState = !soundOn;
    setSoundOn(nextState);
    if (nextState) {
      sfx.playChime();
    }
  };

  const handleSelectAgent = (occupant: SceneOccupant) => {
    setSelectedOccupant(occupant);
    if (soundOn) sfx.playTyping(2);
    onSelectAgent?.(occupant);
  };

  return (
    <section className="scene-canvas-wrap scene-pixel-sim" aria-label="3D project office">
      <Canvas
        shadows={graphics.shadows}
        dpr={graphics.dpr}
        frameloop={pageHidden ? 'demand' : 'always'}
        camera={{ position: [0, 8.5, 12.5], fov: 40 }}
        gl={{ antialias: graphics.antialias, alpha: false, powerPreference: 'high-performance' }}
        fallback={
          <RoomFallback
            occupants={occupants}
            artifacts={artifacts}
            onSelectAgent={handleSelectAgent}
            onSelectArtifact={onSelectArtifact}
          />
        }
      >
        <Room
          occupants={occupants}
          artifacts={artifacts}
          lighting={lighting}
          preset={preset}
          visualMode={graphics.effects ? visualMode : 'normal'}
          motionEnabled={!reducedMotion}
          soundOn={soundOn}
          selectedAgent={selectedOccupant}
          onSelectAgent={handleSelectAgent}
          onSelectArtifact={onSelectArtifact}
        />
      </Canvas>

      <div className="sim-hud sim-hud-brand" aria-label="Office simulator">
        <b>◈ THE OFFICE</b>
        <span>AI AGENT SIMULATOR</span>
      </div>

      <div className="sim-hud sim-hud-toolbar" role="group" aria-label="Simulator controls">
        <span>LIGHT</span>
        {(['day', 'twilight', 'cyberpunk'] as const).map((mode) => (
          <button
            className={lighting === mode ? 'active' : ''}
            key={mode}
            onClick={() => setLighting(mode)}
          >
            {mode}
          </button>
        ))}
        <button className={soundOn ? 'active sound' : 'sound'} onClick={toggleSound}>
          {soundOn ? '🔊 SFX' : '🔇 SFX'}
        </button>
      </div>

      <div className="sim-hud sim-hud-quality" role="group" aria-label="Graphics quality">
        <span>GRAPHICS</span>
        {(['high', 'balanced', 'low'] as const).map((mode) => (
          <button
            className={quality === mode ? 'active' : ''}
            key={mode}
            onClick={() => changeQuality(mode)}
          >
            {mode}
          </button>
        ))}
      </div>

      <div className="sim-hud sim-hud-camera" role="group" aria-label="Camera presets">
        {(
          [
            ['overview', 'Whole Office'],
            ['desks', 'Dev Corner'],
            ['briefing', 'Briefing'],
            ['meeting', 'Meeting'],
            ['server', 'Server'],
            ['lounge', 'Lounge']
          ] as const
        ).map(([mode, label]) => (
          <button
            className={preset === mode && !selectedOccupant ? 'active' : ''}
            key={mode}
            onClick={() => {
              setSelectedOccupant(undefined);
              setPreset(mode);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="sim-hud sim-hud-events" role="group" aria-label="Visual ambience only">
        <span>AMBIENCE ONLY</span>
        <button
          disabled={!graphics.effects}
          onClick={() => setVisualMode((mode) => (mode === 'coffee' ? 'normal' : 'coffee'))}
        >
          ☕ Coffee glow
        </button>
        <button
          disabled={!graphics.effects}
          onClick={() => setVisualMode((mode) => (mode === 'incident' ? 'normal' : 'incident'))}
        >
          🔥 Alert glow
        </button>
        <button
          disabled={!graphics.effects}
          onClick={() => setVisualMode((mode) => (mode === 'party' ? 'normal' : 'party'))}
        >
          🍕 Neon glow
        </button>
      </div>

      <div className="sim-hud sim-hud-sprint">
        <b>⚡ ACTIVE AI SPRINT</b>
        <span>{active ? `${active.agentName}: ${active.activity}` : 'No active run'}</span>
        <i>
          <em style={{ width: `${Math.min(100, activeCount * 20 + artifacts.length * 8)}%` }} />
        </i>
      </div>

      <div className="sim-hud sim-hud-metrics">
        <span>
          <b>{activeCount}</b> ACTIVE
        </span>
        <span>
          <b>{occupants.length}</b> AGENTS
        </span>
        <span>
          <b>{artifacts.length}</b> OUTPUTS
        </span>
      </div>

      <div className="scene-canvas-caption" aria-hidden="true">
        <span className="scene-live-dot" />
        {reducedMotion
          ? 'Reduced motion · live state'
          : visualMode === 'normal'
            ? 'Live office simulator'
            : 'visual ambience only'}{' '}
        · drag to inspect
      </div>

      <div className="scene-zone-label scene-zone-briefing" aria-hidden="true">
        BRIEFING WALL
      </div>
      <div className="scene-zone-label scene-zone-meeting" aria-hidden="true">
        TEAM TABLE
      </div>
      <div className="scene-zone-label scene-zone-server" aria-hidden="true">
        SERVER RACK
      </div>
      <div className="scene-zone-label scene-zone-lounge" aria-hidden="true">
        COFFEE / LOUNGE
      </div>
    </section>
  );
}
