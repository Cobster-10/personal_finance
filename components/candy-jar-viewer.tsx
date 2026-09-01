"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type CandyJarViewerProps = {
  className?: string;
  liquidColor?: string;
  liquidLevel?: number;
  src: string;
};

type LiquidMetrics = {
  geometryHeight: number;
  geometryMinY: number;
  baseY: number;
  fullHeight: number;
  mesh: THREE.Mesh;
};

function applyLiquidAppearance(metrics: LiquidMetrics, liquidLevel: number, liquidColor: string) {
  const level = Number.isFinite(liquidLevel) ? Math.max(0, Math.min(1, liquidLevel)) : 0;

  const materials = Array.isArray(metrics.mesh.material) ? metrics.mesh.material : [metrics.mesh.material];
  materials.forEach((material) => {
    const colorMaterial = material as THREE.Material & { color?: THREE.Color };
    colorMaterial.color?.set(liquidColor);
    material.needsUpdate = true;
  });

  metrics.mesh.visible = level > 0;
  if (level === 0) {
    return;
  }

  const scaledHeight = metrics.fullHeight * level;
  const scaleY = scaledHeight / metrics.geometryHeight;
  metrics.mesh.scale.y = scaleY;
  metrics.mesh.position.y = metrics.baseY - metrics.geometryMinY * scaleY;
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) {
      return;
    }

    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value && typeof value === "object" && "isTexture" in value) {
          (value as THREE.Texture).dispose();
        }
      });
      material.dispose();
    });
  });
}

export function CandyJarViewer({ className, liquidColor = "#339457", liquidLevel = 0, src }: CandyJarViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const liquidMetricsRef = useRef<LiquidMetrics | null>(null);
  const liquidSettingsRef = useRef({ liquidColor, liquidLevel });
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    liquidSettingsRef.current = { liquidColor, liquidLevel };
    if (liquidMetricsRef.current) {
      applyLiquidAppearance(liquidMetricsRef.current, liquidLevel, liquidColor);
    }
  }, [liquidColor, liquidLevel]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0.12, 4.1);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.className = "candy-jar-canvas";
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.HemisphereLight(0xfffbf0, 0xded8ca, 2.2);
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
    keyLight.position.set(3.2, 4.4, 5.2);
    const fillLight = new THREE.DirectionalLight(0xf6c1b3, 1.3);
    fillLight.position.set(-3, 2, 3);
    scene.add(ambientLight, keyLight, fillLight);

    let jar: THREE.Object3D | null = null;
    let animationFrame = 0;

    const fitCameraToJar = () => {
      if (!jar) {
        return;
      }

      const bounds = new THREE.Box3().setFromObject(jar);
      const size = bounds.getSize(new THREE.Vector3());
      const verticalFov = THREE.MathUtils.degToRad(camera.fov);
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
      const verticalDistance = size.y / (2 * Math.tan(verticalFov / 2));
      const horizontalDistance = size.x / (2 * Math.tan(horizontalFov / 2));
      const distance = Math.max(verticalDistance, horizontalDistance, size.z / 2) * 1.18;

      camera.position.set(0, 0.12, distance);
      camera.lookAt(0, 0, 0);
      camera.far = Math.max(100, distance + size.z * 3);
      camera.updateProjectionMatrix();
    };

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) {
        return;
      }

      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      fitCameraToJar();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const loader = new GLTFLoader();
    loader.load(
      src,
      (gltf) => {
        jar = gltf.scene;

        const bounds = new THREE.Box3().setFromObject(jar);
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        const maxDimension = Math.max(size.x, size.y, size.z) || 1;

        jar.position.sub(center);
        jar.scale.setScalar(2.45 / maxDimension);
        jar.rotation.set(-0.08, -0.42, 0.02);
        scene.add(jar);

        const liquidMesh = jar.getObjectByName("polySurface2_lambert1_0") as THREE.Mesh | undefined;
        if (liquidMesh?.geometry) {
          liquidMesh.geometry.computeBoundingBox();
          const liquidBounds = liquidMesh.geometry.boundingBox;

          if (liquidBounds) {
            const geometryHeight = liquidBounds.max.y - liquidBounds.min.y;
            const baseY = liquidMesh.position.y + liquidBounds.min.y * liquidMesh.scale.y;
            const fillTop = bounds.max.y - size.y * 0.12;

            if (geometryHeight > 0 && fillTop > baseY) {
              liquidMetricsRef.current = {
                geometryHeight,
                geometryMinY: liquidBounds.min.y,
                baseY,
                fullHeight: fillTop - baseY,
                mesh: liquidMesh,
              };
              applyLiquidAppearance(liquidMetricsRef.current, liquidSettingsRef.current.liquidLevel, liquidSettingsRef.current.liquidColor);
            }
          }
        }

        fitCameraToJar();
      },
      undefined,
      () => setHasError(true),
    );

    const animate = () => {
      animationFrame = window.requestAnimationFrame(animate);
      if (jar) {
        jar.rotation.y += 0.004;
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      if (jar) {
        scene.remove(jar);
        disposeObject(jar);
      }
      liquidMetricsRef.current = null;
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [src]);

  return (
    <div className={className} ref={containerRef} aria-label="Candy jar 3D model" role="img">
      {hasError ? <span className="model-error">Jar unavailable</span> : null}
    </div>
  );
}
