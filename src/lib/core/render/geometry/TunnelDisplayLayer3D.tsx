// @ts-nocheck
import { clamp } from "@/lib/utils/math";
import React from "react";
import {
	AddEquation,
	BackSide,
	CatmullRomCurve3,
	Color,
	CustomBlending,
	OneFactor,
	Quaternion,
	TubeGeometry,
	Vector3,
	ZeroFactor,
} from "three";
import {
	getThreeBlending,
	requiresPremultipliedAlpha,
} from "../layers/TexturePlane";

const FOV = 50;

const TUNNEL_VERTEX_SHADER = `
varying vec2 vUv;

void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const TUNNEL_FRAGMENT_SHADER = `
uniform float uTime;
uniform float uTravelSpeed;
uniform float uColumns;
uniform float uRows;
uniform float uLineWidth;
uniform float uOpacity;
uniform vec3 uLineColor;
uniform vec3 uBackgroundColor;

varying vec2 vUv;

float gridLine(float value, float width) {
	float distanceToLine = min(value, 1.0 - value);
	return 1.0 - smoothstep(0.0, width, distanceToLine);
}

void main() {
	float scroll = fract(vUv.x * uRows + uTime * uTravelSpeed);
	float column = fract(vUv.y * uColumns);
	float rowMask = gridLine(scroll, uLineWidth);
	float columnMask = gridLine(column, uLineWidth);
	float grid = max(rowMask, columnMask);
	float glow = max(
		gridLine(scroll, uLineWidth * 2.5),
		gridLine(column, uLineWidth * 2.5)
	);

	vec3 color = mix(uBackgroundColor, uLineColor, glow * 0.35 + grid * 0.65);
	gl_FragColor = vec4(color, uOpacity);
}
`;

// Pre-allocated temp vectors for curve computation (avoids per-frame allocations)
const _worldPoint = new Vector3();
const _cameraPoint = new Vector3();
const _nextPoint = new Vector3();
const _tangent = new Vector3();
const _right = new Vector3();
const _up = new Vector3();
const _relative = new Vector3();
const _bankQuat = new Quaternion();
const _curveP = new Vector3();
const _normal = new Vector3();

function computeWorldPoint(
	out: Vector3,
	distance: number,
	tunnelDepth: number,
	curveTurns: number,
	curveBend: number,
	curveTime: number,
) {
	const primaryAngle =
		(distance / tunnelDepth) * curveTurns * Math.PI * 2 + curveTime * 0.45;
	const secondaryAngle =
		(distance / tunnelDepth) * curveTurns * Math.PI * 4.4 - curveTime * 0.28;

	out.set(
		Math.sin(primaryAngle) * curveBend +
			Math.sin(secondaryAngle) * curveBend * 0.3,
		Math.cos(primaryAngle * 0.82 + 0.6) * curveBend * 0.72 +
			Math.cos(secondaryAngle * 0.7 - 0.35) * curveBend * 0.22,
		-distance,
	);
	return out;
}

function updateTubeVertices(
	geometry,
	curve: CatmullRomCurve3,
	tubularSegments: number,
	radius: number,
	radialSegments: number,
) {
	const frames = curve.computeFrenetFrames(tubularSegments, false);
	const posAttr = geometry.getAttribute("position");
	const normalAttr = geometry.getAttribute("normal");

	let idx = 0;
	for (let i = 0; i <= tubularSegments; i++) {
		curve.getPointAt(i / tubularSegments, _curveP);
		const N = frames.normals[i];
		const B = frames.binormals[i];

		for (let j = 0; j <= radialSegments; j++) {
			const v = (j / radialSegments) * Math.PI * 2;
			const sin = Math.sin(v);
			const cos = -Math.cos(v);

			_normal.x = cos * N.x + sin * B.x;
			_normal.y = cos * N.y + sin * B.y;
			_normal.z = cos * N.z + sin * B.z;
			_normal.normalize();

			normalAttr.setXYZ(idx, _normal.x, _normal.y, _normal.z);
			posAttr.setXYZ(
				idx,
				_curveP.x + radius * _normal.x,
				_curveP.y + radius * _normal.y,
				_curveP.z + radius * _normal.z,
			);

			idx++;
		}
	}

	posAttr.needsUpdate = true;
	normalAttr.needsUpdate = true;
	geometry.computeBoundingSphere();
}

export function TunnelDisplayLayer3D({
	display,
	order,
	height,
	frameData,
	sceneOpacity,
	sceneBlendMode,
	sceneMask,
	sceneInverse,
}) {
	const { properties = {} } = display;
	const {
		color = "#D6ECFF",
		backgroundColor = "#02060A",
		opacity = 1,
		radius = 180,
		depth = 3200,
		curvature = 32,
		turnRate = 2.6,
		travelSpeed = 0.8,
		turnSpeed = 0.8,
		bank = 8,
		gridColumns = 28,
		gridRows = 48,
		lineWidth = 0.08,
		radialSegments = 40,
		lengthSegments = 128,
	} = properties;

	const timeRef = React.useRef(0);
	const materialRef = React.useRef(null);
	const meshRef = React.useRef(null);
	const geometryRef = React.useRef(null);
	const curvePointsRef = React.useRef([]);
	const structuralKeyRef = React.useRef("");
	const deltaSeconds = Math.max(0, Number(frameData?.delta ?? 16.667)) / 1000;

	if (frameData?.hasUpdate) {
		timeRef.current += deltaSeconds;
	}

	const tunnelRadius = Math.max(40, Number(radius) || 0);
	const tunnelDepth = Math.max(600, Number(depth) || 0);
	const curveBend = Math.max(0, Number(curvature) || 0);
	const curveTurns = Math.max(0.1, Number(turnRate) || 0);
	const radialDetail = Math.max(8, Math.round(Number(radialSegments) || 0));
	const lengthDetail = Math.max(16, Math.round(Number(lengthSegments) || 0));
	const pathSamples = Math.max(24, Math.round(lengthDetail / 2));
	const leadDistance = Math.min(240, tunnelDepth * 0.06 + 100);
	const trailDistance = Math.min(760, tunnelDepth * 0.24 + 360);
	const curveTime = timeRef.current * Number(turnSpeed || 0);
	const cameraZ =
		Number(height || 0) > 0
			? Number(height) / 2 / Math.tan(((FOV / 2) * Math.PI) / 180)
			: 0;
	const finalOpacity = clamp(
		Number(opacity ?? 1) * Number(sceneOpacity ?? 1),
		0,
		1,
	);
	const blending = sceneMask
		? CustomBlending
		: getThreeBlending(sceneBlendMode);
	const rollRadians = ((Number(bank) || 0) * Math.PI) / 180;
	const uniforms = React.useMemo(
		() => ({
			uTime: { value: 0 },
			uTravelSpeed: { value: 0 },
			uColumns: { value: 0 },
			uRows: { value: 0 },
			uLineWidth: { value: 0 },
			uOpacity: { value: 1 },
			uLineColor: { value: new Color() },
			uBackgroundColor: { value: new Color() },
		}),
		[],
	);

	uniforms.uTime.value = timeRef.current;
	uniforms.uTravelSpeed.value = Number(travelSpeed || 0) * 1.2;
	uniforms.uColumns.value = Math.max(1, Number(gridColumns) || 1);
	uniforms.uRows.value = Math.max(1, Number(gridRows) || 1);
	uniforms.uLineWidth.value = clamp(Number(lineWidth) || 0, 0.005, 0.3);
	uniforms.uOpacity.value = finalOpacity;
	uniforms.uLineColor.value.set(sceneMask ? "#000000" : color);
	uniforms.uBackgroundColor.value.set(sceneMask ? "#000000" : backgroundColor);

	// Ensure we have enough pre-allocated Vector3s for curve points
	const numPoints = pathSamples + 1;
	const points = curvePointsRef.current;
	while (points.length < numPoints) {
		points.push(new Vector3());
	}
	points.length = numPoints;

	// Compute curve points in-place (reusing pre-allocated Vector3s)
	const sampleStep = 10;
	const currentDistance = curveTime * 320;

	computeWorldPoint(
		_cameraPoint,
		currentDistance,
		tunnelDepth,
		curveTurns,
		curveBend,
		curveTime,
	);
	computeWorldPoint(
		_nextPoint,
		currentDistance + sampleStep,
		tunnelDepth,
		curveTurns,
		curveBend,
		curveTime,
	);
	_tangent.subVectors(_nextPoint, _cameraPoint).normalize();
	_right.crossVectors(_up.set(0, 1, 0), _tangent);
	if (_right.lengthSq() < 1e-6) {
		_right.set(1, 0, 0);
	}
	_right.normalize();
	_up.crossVectors(_tangent, _right).normalize();
	_bankQuat.setFromAxisAngle(_tangent, rollRadians);
	_right.applyQuaternion(_bankQuat);
	_up.applyQuaternion(_bankQuat);

	for (let i = 0; i <= pathSamples; i++) {
		const t = i / pathSamples;
		const distance =
			currentDistance -
			trailDistance +
			t * (tunnelDepth + leadDistance + trailDistance);
		computeWorldPoint(
			_worldPoint,
			distance,
			tunnelDepth,
			curveTurns,
			curveBend,
			curveTime,
		);
		_relative.subVectors(_worldPoint, _cameraPoint);
		points[i].set(
			_relative.dot(_right),
			_relative.dot(_up),
			-_relative.dot(_tangent),
		);
	}

	const curve = new CatmullRomCurve3(points);

	// Only recreate geometry when segment counts change; otherwise update vertices in-place
	const structuralKey = `${lengthDetail}-${radialDetail}`;
	if (structuralKeyRef.current !== structuralKey) {
		if (geometryRef.current) geometryRef.current.dispose();
		geometryRef.current = new TubeGeometry(
			curve,
			lengthDetail,
			tunnelRadius,
			radialDetail,
			false,
		);
		structuralKeyRef.current = structuralKey;
		if (meshRef.current) meshRef.current.geometry = geometryRef.current;
	} else if (geometryRef.current) {
		updateTubeVertices(
			geometryRef.current,
			curve,
			lengthDetail,
			tunnelRadius,
			radialDetail,
		);
	}

	// Dispose geometry on unmount
	React.useEffect(() => {
		return () => {
			if (geometryRef.current) {
				geometryRef.current.dispose();
				geometryRef.current = null;
			}
		};
	}, []);

	// Assign geometry on first mount
	React.useEffect(() => {
		if (meshRef.current && geometryRef.current) {
			meshRef.current.geometry = geometryRef.current;
		}
	});

	return (
		<group position={[0, 0, cameraZ]} scale={[1, 1, 1]}>
			<mesh ref={meshRef} renderOrder={order} frustumCulled={false}>
				<shaderMaterial
					ref={materialRef}
					uniforms={uniforms}
					vertexShader={TUNNEL_VERTEX_SHADER}
					fragmentShader={TUNNEL_FRAGMENT_SHADER}
					transparent={true}
					side={BackSide}
					depthTest={true}
					depthWrite={true}
					premultipliedAlpha={requiresPremultipliedAlpha(sceneBlendMode)}
					blending={blending}
					blendEquation={sceneMask ? AddEquation : undefined}
					blendSrc={sceneMask ? ZeroFactor : undefined}
					blendDst={sceneMask ? OneFactor : undefined}
					blendEquationAlpha={sceneMask ? AddEquation : undefined}
					blendSrcAlpha={sceneMask ? OneFactor : undefined}
					blendDstAlpha={sceneMask ? ZeroFactor : undefined}
				/>
			</mesh>
		</group>
	);
}
