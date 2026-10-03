'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Hero3D, type HeroPose } from '@/game/three/Hero3D';

export default function Lab() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current!;
    const r = new THREE.WebGLRenderer({ antialias: true });
    r.setPixelRatio(2);
    r.setSize(el.clientWidth, el.clientHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    el.appendChild(r.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1b2a5c);
    const pm = new THREE.PMREMGenerator(r);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.7;
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2, 4, 3);
    key.castShadow = true;
    const rim = new THREE.DirectionalLight(0x7fb0ff, 1.6);
    rim.position.set(-3, 2, -3);
    scene.add(key, rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(2, 64), new THREE.MeshStandardMaterial({ color: 0x2fae66 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const cam = new THREE.PerspectiveCamera(32, el.clientWidth / el.clientHeight, 0.1, 50);
    const q = new URLSearchParams(location.search);
    const heroes = [
      new Hero3D({ skin: 0xd9a06f, hair: 0x2a1a10, hairStyle: 'curly', eyes: 0x5a3820, shirt: 0x1e6bff, shirtTrim: 0xffffff, shorts: 0xffffff, socks: 0x1e6bff, shoes: 0xffffff, shoeStripe: 0x1e6bff, number: '4', name: 'ADAM', cape: q.get('cape') ? 0xff4b4b : null }),
      new Hero3D({ skin: 0xc98e62, hair: 0x1a1010, hairStyle: 'short', eyes: 0x2a1a10, shirt: 0x8b3dff, shirtTrim: 0xff8a1f, shorts: 0x2a1a55, socks: 0x8b3dff, shoes: 0x222222, shoeStripe: 0xff8a1f, number: '1', gloves: 0xff8a1f, headband: 0xff8a1f }),
    ];
    heroes[0].root.position.x = -0.55;
    heroes[1].root.position.x = 0.55;
    heroes[1].root.rotation.y = -0.3;
    heroes[0].root.rotation.y = 0.3;
    for (const h of heroes) scene.add(h.root);
    const pose = (q.get('pose') ?? 'idle') as HeroPose;
    heroes[0].setPose(pose);
    if (pose === 'cheer') heroes[0].excited();
    heroes[1].setPose(q.get('pose2') as HeroPose ?? 'ready');
    const view = q.get('view') ?? 'front';
    if (view === 'close') cam.position.set(-0.4, 1.0, 1.6);
    else cam.position.set(0, 0.9, 3.4);
    cam.lookAt(view === 'close' ? -0.5 : 0, view === 'close' ? 0.95 : 0.62, 0);
    let last = performance.now();
    let raf = 0;
    const loop = () => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      for (const h of heroes) h.update(dt);
      r.render(scene, cam);
      raf = requestAnimationFrame(loop);
    };
    loop();
    (window as unknown as { labReady: boolean }).labReady = true;
    return () => {
      cancelAnimationFrame(raf);
      r.dispose();
      el.innerHTML = '';
    };
  }, []);
  return <div ref={host} style={{ position: 'fixed', inset: 0 }} />;
}
