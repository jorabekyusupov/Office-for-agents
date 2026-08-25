'use client';

import { Html, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MathUtils, Vector3, type Group } from 'three';
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

function CameraFrame({ preset }: { preset: CameraPreset }) {
  const { camera } = useThree();
  useEffect(() => {
    const framing: Record<CameraPreset, [[number, number, number], [number, number, number]]> = {
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
    const [position, target] = framing[preset];
    camera.position.set(...position);
    camera.lookAt(...target);
  }, [camera, preset]);
  return null;
}

function AgentAvatar({
  occupant,
  motionRate,
  motionEnabled
}: {
  occupant: SceneOccupant;
  motionRate: number;
  motionEnabled: boolean;
}) {
  const avatar = useRef<Group>(null);
  const body = useRef<Group>(null);
  const leftArm = useRef<Group>(null);
  const rightArm = useRef<Group>(null);
  const leftLeg = useRef<Group>(null);
  const rightLeg = useRef<Group>(null);
  const skin = ['#f1c6a9', '#d99b78', '#b97857', '#8f543d'][occupant.anchor % 4] ?? '#d99b78';
  const hair = ['#2b1b18', '#342622', '#151821', '#634234'][occupant.anchor % 4] ?? '#342622';
  const target = useRef(new Vector3(...targetPointFor(occupant)));
  const initialized = useRef(false);
  const travel = useRef(false);
  const walkingDirection = useRef(new Vector3());
  const pose = occupant.pose;

  useEffect(() => {
    const root = avatar.current;
    target.current.set(...targetPointFor(occupant));
    if (!root || initialized.current) return;
    root.position.set(...initialPointFor(occupant));
    initialized.current = true;
  }, [occupant]);

  useFrame(({ clock }, delta) => {
    const time = clock.getElapsedTime() * motionRate + occupant.anchor * 0.73;
    const root = avatar.current;
    if (!body.current || !root) return;
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
    }
    const animationTime = motionEnabled ? time : 0;
    const walking = travel.current;
    const alert = pose === 'alert';
    const typing = pose === 'typing';
    const researching = pose === 'researching';
    const reviewing = pose === 'reviewing';
    const acknowledging = pose === 'acknowledging';
    body.current.position.y =
      Math.sin(animationTime * 1.4) * (walking ? 0.035 : pose === 'waiting' ? 0.018 : 0.009);
    body.current.rotation.y = researching ? Math.sin(animationTime * 1.1) * 0.18 : 0;
    if (leftArm.current)
      leftArm.current.rotation.x = walking
        ? Math.sin(animationTime * 7) * 0.52
        : typing
          ? 0.88 + Math.sin(animationTime * 8) * 0.18
          : researching || reviewing
            ? 0.52 + Math.sin(animationTime * 3) * 0.12
            : acknowledging
              ? -0.5 + Math.sin(animationTime * 4) * 0.18
              : alert
                ? Math.sin(animationTime * 2) * 0.25
                : 0.22;
    if (rightArm.current)
      rightArm.current.rotation.x = walking
        ? -Math.sin(animationTime * 7) * 0.52
        : typing
          ? 0.88 - Math.sin(animationTime * 8) * 0.18
          : researching || reviewing
            ? 0.42 - Math.sin(animationTime * 3) * 0.12
            : acknowledging
              ? -0.5 - Math.sin(animationTime * 4) * 0.18
              : alert
                ? -Math.sin(animationTime * 2) * 0.25
                : 0.22;
    if (leftLeg.current)
      leftLeg.current.rotation.x = walking ? Math.sin(animationTime * 7) * 0.48 : 0;
    if (rightLeg.current)
      rightLeg.current.rotation.x = walking ? -Math.sin(animationTime * 7) * 0.48 : 0;
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
      <group ref={body} scale={1.18}>
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
        <mesh position={[0, 0.27, 0]} castShadow>
          <capsuleGeometry args={[0.18, 0.36, 8, 14]} />
          <meshStandardMaterial color={occupant.color} roughness={0.58} metalness={0.05} />
        </mesh>
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
        <mesh position={[0, 0.65, 0]} castShadow>
          <sphereGeometry args={[0.155, 20, 18]} />
          <meshStandardMaterial color={skin} roughness={0.75} />
        </mesh>
        <mesh position={[0, 0.735, -0.01]} castShadow>
          <sphereGeometry args={[0.158, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
          <meshStandardMaterial color={hair} roughness={0.9} />
        </mesh>
        <mesh position={[-0.055, 0.655, -0.135]}>
          <sphereGeometry args={[0.012, 8, 8]} />
          <meshBasicMaterial color="#172033" />
        </mesh>
        <mesh position={[0.055, 0.655, -0.135]}>
          <sphereGeometry args={[0.012, 8, 8]} />
          <meshBasicMaterial color="#172033" />
        </mesh>
        {contextProp}
        <Html position={[0, 1.48, 0]} center distanceFactor={7} sprite>
          <div className={`scene-desk-label ${statusTone(occupant.status)} scene-agent-float`}>
            <span>{occupant.agentName}</span>
            <b>{occupant.activity || activityLabel(occupant.status)}</b>
            <small title={occupant.name}>{occupant.name}</small>
          </div>
        </Html>
      </group>
    </group>
  );
}

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
  return (
    <group
      position={[x, 0, z]}
      rotation-y={rotation}
      onClick={(event) => {
        event.stopPropagation();
        onSelectAgent?.(occupant);
      }}
    >
      <mesh position={[0, 0.58, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.58, 0.12, 0.78]} />
        <meshStandardMaterial color="#26384f" metalness={0.38} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.93, -0.16]} castShadow>
        <boxGeometry args={[0.86, 0.46, 0.07]} />
        <meshStandardMaterial color="#050b15" metalness={0.55} roughness={0.28} />
      </mesh>
      <mesh position={[0, 0.93, -0.116]}>
        <planeGeometry args={[0.73, 0.34]} />
        <meshBasicMaterial color={signal} transparent opacity={0.72} />
      </mesh>
      <mesh position={[-0.49, 0.9, -0.12]} rotation-y={0.18}>
        <boxGeometry args={[0.38, 0.3, 0.055]} />
        <meshStandardMaterial color="#080d17" metalness={0.48} roughness={0.32} />
      </mesh>
      <mesh position={[-0.49, 0.9, -0.085]} rotation-y={0.18}>
        <planeGeometry args={[0.31, 0.22]} />
        <meshBasicMaterial color="#39ff14" transparent opacity={0.65} />
      </mesh>
      <mesh position={[0, 0.76, 0.27]}>
        <boxGeometry args={[0.58, 0.025, 0.2]} />
        <meshStandardMaterial color="#8fa7bd" metalness={0.45} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.14, 0.53]} castShadow>
        <cylinderGeometry args={[0.31, 0.35, 0.38, 20]} />
        <meshStandardMaterial color="#16263c" metalness={0.28} roughness={0.68} />
      </mesh>
      <mesh position={[-0.63, 0.78, 0.22]}>
        <cylinderGeometry args={[0.055, 0.055, 0.14, 16]} />
        <meshStandardMaterial color={signal} emissive={signal} emissiveIntensity={0.55} />
      </mesh>
    </group>
  );
}

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

function ServerZone() {
  return (
    <group position={[6.45, 0, 4.45]}>
      {[-1.05, 0, 1.05].map((offset, index) => (
        <group key={offset} position={[offset, 0, 0]}>
          <mesh position={[0, 1.18, 0]} castShadow>
            <boxGeometry args={[0.72, 2.36, 0.72]} />
            <meshStandardMaterial color="#111827" metalness={0.66} roughness={0.36} />
          </mesh>
          <mesh position={[0, 1.18, -0.371]}>
            <boxGeometry args={[0.51, 1.86, 0.018]} />
            <meshStandardMaterial color="#0a1421" emissive="#00f5d4" emissiveIntensity={0.12} />
          </mesh>
          {[0.5, 0.92, 1.34, 1.76].map((y, led) => (
            <mesh key={y} position={[0.18, y, -0.39]}>
              <boxGeometry args={[0.11, 0.055, 0.025]} />
              <meshStandardMaterial
                color={led % 2 ? '#00f5d4' : index === 1 ? '#ff007f' : '#39ff14'}
                emissive={led % 2 ? '#00f5d4' : index === 1 ? '#ff007f' : '#39ff14'}
                emissiveIntensity={1.8}
              />
            </mesh>
          ))}
        </group>
      ))}
      <mesh position={[-0.02, 0.05, 1.12]}>
        <boxGeometry args={[3.95, 0.12, 0.12]} />
        <meshStandardMaterial color="#00f5d4" emissive="#00f5d4" emissiveIntensity={1.3} />
      </mesh>
    </group>
  );
}

function CoffeeAndLounge() {
  return (
    <group>
      <group position={[6.45, 0, -4.6]}>
        <mesh position={[0, 0.58, 0]} castShadow>
          <boxGeometry args={[3.3, 1.16, 0.78]} />
          <meshStandardMaterial color="#5a3d28" roughness={0.62} />
        </mesh>
        <mesh position={[0, 1.2, 0]}>
          <boxGeometry args={[3.5, 0.12, 0.92]} />
          <meshStandardMaterial color="#c49a6c" roughness={0.5} />
        </mesh>
        <mesh position={[-0.35, 1.5, 0]}>
          <boxGeometry args={[0.64, 0.6, 0.44]} />
          <meshStandardMaterial color="#d62828" metalness={0.45} roughness={0.38} />
        </mesh>
        <mesh position={[0.7, 1.35, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 0.27, 16]} />
          <meshStandardMaterial color="#f1e7da" roughness={0.7} />
        </mesh>
        <mesh position={[1.12, 1.35, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 0.27, 16]} />
          <meshStandardMaterial color="#f1e7da" roughness={0.7} />
        </mesh>
      </group>
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
          <meshStandardMaterial color="#ff007f" emissive="#ff007f" emissiveIntensity={1.05} />
        </mesh>
      </group>
    </group>
  );
}

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

function ArcadeAndPlants() {
  const plantPositions: readonly (readonly [number, number])[] = [
    [4.75, -3.05],
    [7.85, -2.8],
    [7.3, 2.45]
  ];
  return (
    <group>
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
              <meshStandardMaterial color={offset === 0 ? '#38b000' : '#197217'} roughness={0.8} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

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

function Room({
  occupants,
  artifacts,
  lighting,
  preset,
  visualMode,
  motionEnabled,
  onSelectAgent,
  onSelectArtifact
}: OfficeSceneProps & {
  lighting: LightingMode;
  preset: CameraPreset;
  visualMode: VisualMode;
  motionEnabled: boolean;
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
      {occupants.map((occupant) => (
        <Desk key={`desk:${occupant.id}`} occupant={occupant} onSelectAgent={onSelectAgent} />
      ))}
      {occupants.map((occupant) => (
        <group
          key={`agent:${occupant.id}`}
          onClick={(event) => {
            event.stopPropagation();
            onSelectAgent?.(occupant);
          }}
        >
          <AgentAvatar occupant={occupant} motionRate={motionRate} motionEnabled={motionEnabled} />
        </group>
      ))}
      <CameraFrame preset={preset} />
      <OrbitControls
        enablePan
        enableDamping
        dampingFactor={0.08}
        minDistance={8.5}
        maxDistance={18}
        minPolarAngle={0.65}
        maxPolarAngle={1.35}
        target={[0, 0.8, -0.55]}
      />
    </>
  );
}

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
              {occupant.agentName} · {occupant.activity || activityLabel(occupant.status)}
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
    setSoundOn((previous) => !previous);
    if (!soundOn && typeof window !== 'undefined') {
      const Audio =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Audio) {
        const context = new Audio();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = 660;
        gain.gain.setValueAtTime(0.035, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.12);
      }
    }
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
            onSelectAgent={onSelectAgent}
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
          onSelectAgent={onSelectAgent}
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
            className={preset === mode ? 'active' : ''}
            key={mode}
            onClick={() => setPreset(mode)}
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
