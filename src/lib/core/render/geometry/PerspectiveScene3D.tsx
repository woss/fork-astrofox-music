// @ts-nocheck
import { createPortal, useFrame, useThree } from "@react-three/fiber";
import React from "react";
import {
	DepthFormat,
	DepthTexture,
	HalfFloatType,
	LinearFilter,
	PerspectiveCamera,
	RGBAFormat,
	Scene as ThreeScene,
	UnsignedIntType,
	WebGLRenderTarget,
} from "three";
import ShaderPass from "../composer/ShaderPass";
import DepthOfFieldShader from "../effects/shaders/DepthOfFieldShader";

const PERSPECTIVE_FOV = 50;

function createRenderTarget(width, height, withDepth = false) {
	const target = new WebGLRenderTarget(width, height, {
		minFilter: LinearFilter,
		magFilter: LinearFilter,
		format: RGBAFormat,
		type: HalfFloatType,
		depthBuffer: withDepth,
		stencilBuffer: false,
	});

	if (withDepth) {
		target.depthTexture = new DepthTexture(width, height, UnsignedIntType);
		target.depthTexture.format = DepthFormat;
	}

	return target;
}

export function PerspectiveScene3D({
	width,
	height,
	renderOrder = 0,
	depthOfFieldEffect = null,
	children,
}) {
	const gl = useThree((state) => state.gl);
	const dofProperties = depthOfFieldEffect?.properties || {};
	const depthOfFieldEnabled =
		!!depthOfFieldEffect && depthOfFieldEffect.enabled !== false;

	const cameraZ = React.useMemo(
		() => height / 2 / Math.tan(((PERSPECTIVE_FOV / 2) * Math.PI) / 180),
		[height],
	);

	const perspScene = React.useMemo(() => new ThreeScene(), []);

	const perspCamera = React.useMemo(() => {
		const cam = new PerspectiveCamera(
			PERSPECTIVE_FOV,
			width / height,
			0.1,
			5000,
		);
		cam.position.set(0, 0, cameraZ);
		cam.lookAt(0, 0, 0);
		return cam;
	}, []);

	React.useEffect(() => {
		perspCamera.aspect = width / height;
		perspCamera.position.z = cameraZ;
		perspCamera.updateProjectionMatrix();
	}, [perspCamera, width, height, cameraZ]);

	const colorTarget = React.useMemo(
		() => createRenderTarget(width, height, true),
		[],
	);
	const effectTarget = React.useMemo(
		() => createRenderTarget(width, height, false),
		[],
	);
	const dofPassRef = React.useRef(null);
	const materialRef = React.useRef(null);

	if (!dofPassRef.current) {
		dofPassRef.current = new ShaderPass(DepthOfFieldShader);
	}

	const dofRenderHeight = React.useMemo(() => {
		const requestedHeight = Math.max(
			1,
			Math.round(Number(dofProperties.height ?? height) || height),
		);

		return Math.min(requestedHeight, Math.max(1, height));
	}, [dofProperties.height, height]);

	const dofRenderWidth = React.useMemo(() => {
		if (height <= 0) {
			return Math.max(1, width);
		}

		return Math.max(1, Math.round((width * dofRenderHeight) / height));
	}, [dofRenderHeight, height, width]);

	React.useEffect(() => {
		colorTarget.setSize(width, height);
	}, [colorTarget, width, height]);

	React.useEffect(() => {
		effectTarget.setSize(
			depthOfFieldEnabled ? dofRenderWidth : width,
			depthOfFieldEnabled ? dofRenderHeight : height,
		);
		dofPassRef.current?.setSize(
			depthOfFieldEnabled ? dofRenderWidth : width,
			depthOfFieldEnabled ? dofRenderHeight : height,
		);
	}, [
		depthOfFieldEnabled,
		dofRenderHeight,
		dofRenderWidth,
		effectTarget,
		height,
		width,
	]);

	React.useEffect(() => {
		return () => {
			colorTarget.dispose();
			effectTarget.dispose();
			dofPassRef.current?.dispose?.();
		};
	}, [colorTarget, effectTarget]);

	const outputTexture =
		depthOfFieldEnabled && colorTarget.depthTexture
			? effectTarget.texture
			: colorTarget.texture;

	React.useEffect(() => {
		const material = materialRef.current;
		if (!material) {
			return;
		}

		material.map = outputTexture;
		material.needsUpdate = true;
	}, [outputTexture]);

	useFrame(() => {
		const prevClearAlpha = gl.getClearAlpha();
		gl.setClearAlpha(0);
		gl.setRenderTarget(colorTarget);
		gl.clear();
		gl.render(perspScene, perspCamera);

		if (depthOfFieldEnabled && colorTarget.depthTexture) {
			dofPassRef.current?.setUniforms({
				depthTexture: colorTarget.depthTexture,
				nearClip: perspCamera.near,
				farClip: perspCamera.far,
				focusDistance: Number(dofProperties.focusDistance ?? 0),
				focalLength: Number(dofProperties.focalLength ?? 0.02),
				bokehScale: Number(dofProperties.bokehScale ?? 2),
				resolutionScale: dofRenderHeight / Math.max(1, height),
			});
			dofPassRef.current?.render(gl, colorTarget, effectTarget);
		}

		gl.setRenderTarget(null);
		gl.setClearAlpha(prevClearAlpha);
	}, -2);

	return (
		<>
			{createPortal(children, perspScene)}
			<mesh renderOrder={renderOrder}>
				<planeGeometry args={[width, height]} />
				<meshBasicMaterial
					ref={materialRef}
					map={outputTexture}
					transparent={true}
					toneMapped={false}
					depthTest={false}
					depthWrite={false}
				/>
			</mesh>
		</>
	);
}
