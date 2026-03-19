// @ts-nocheck
import { clamp } from "@/lib/utils/math";
import { useFrame } from "@react-three/fiber";
import React from "react";
import {
	AddEquation,
	BufferAttribute,
	BufferGeometry,
	Color,
	CustomBlending,
	OneFactor,
	ZeroFactor,
} from "three";
import {
	getThreeBlending,
	requiresPremultipliedAlpha,
} from "../layers/TexturePlane";

const POINT_WAVES_VERTEX_SHADER = `
attribute float scale;

void main() {
	vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
	gl_PointSize = max(1.0, scale * (300.0 / max(1.0, -mvPosition.z)));
	gl_Position = projectionMatrix * mvPosition;
}
`;

const POINT_WAVES_FRAGMENT_SHADER = `
uniform vec3 color;
uniform float opacity;

void main() {
	if (length(gl_PointCoord - vec2(0.5, 0.5)) > 0.475) {
		discard;
	}

	gl_FragColor = vec4(color, opacity);
}
`;

function createPointWaveGeometry(
	columns: number,
	rows: number,
	separation: number,
) {
	const pointCount = columns * rows;
	const positions = new Float32Array(pointCount * 3);
	const scales = new Float32Array(pointCount);
	const halfWidth = ((columns - 1) * separation) / 2;
	const halfDepth = ((rows - 1) * separation) / 2;

	let positionIndex = 0;
	let scaleIndex = 0;

	for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
		for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
			positions[positionIndex] = columnIndex * separation - halfWidth;
			positions[positionIndex + 1] = 0;
			positions[positionIndex + 2] = rowIndex * separation - halfDepth;
			scales[scaleIndex] = 1;

			positionIndex += 3;
			scaleIndex += 1;
		}
	}

	const geometry = new BufferGeometry();
	geometry.setAttribute("position", new BufferAttribute(positions, 3));
	geometry.setAttribute("scale", new BufferAttribute(scales, 1));

	return {
		geometry,
		positions,
		scales,
		positionAttribute: geometry.getAttribute("position"),
		scaleAttribute: geometry.getAttribute("scale"),
	};
}

export function PointWavesDisplayLayer3D({
	display,
	order,
	frameData,
	sceneOpacity,
	sceneBlendMode,
	sceneMask,
}) {
	const { properties = {} } = display;
	const {
		color = "#FFFFFF",
		columns = 42,
		rows = 32,
		separation = 32,
		waveHeight = 28,
		pointSize = 4,
		speed = 1,
		frequencyX = 0.3,
		frequencyY = 0.5,
		opacity = 1,
	} = properties;

	const gridColumns = Math.max(4, Math.round(Number(columns) || 4));
	const gridRows = Math.max(4, Math.round(Number(rows) || 4));
	const gridSeparation = Math.max(8, Number(separation) || 8);
	const finalOpacity = clamp(
		Number(opacity ?? 1) * Number(sceneOpacity ?? 1),
		0,
		1,
	);
	const resolvedColor = React.useMemo(
		() => new Color(sceneMask ? "#000000" : color),
		[color, sceneMask],
	);
	const blending = sceneMask
		? CustomBlending
		: getThreeBlending(sceneBlendMode);
	const premultipliedAlpha = requiresPremultipliedAlpha(sceneBlendMode);
	const uniforms = React.useMemo(
		() => ({
			color: { value: new Color() },
			opacity: { value: 1 },
		}),
		[],
	);
	const timeRef = React.useRef(0);
	const geometryData = React.useMemo(
		() => createPointWaveGeometry(gridColumns, gridRows, gridSeparation),
		[gridColumns, gridRows, gridSeparation],
	);

	React.useEffect(() => {
		uniforms.color.value.copy(resolvedColor);
		uniforms.opacity.value = finalOpacity;
	}, [finalOpacity, resolvedColor, uniforms]);

	React.useEffect(() => {
		return () => {
			geometryData.geometry.dispose();
		};
	}, [geometryData.geometry]);

	useFrame((_, delta) => {
		const deltaSeconds = frameData?.hasUpdate
			? Math.max(0, Number(frameData?.delta ?? 16.667)) / 1000
			: delta;
		const waveSpeed = Math.max(0, Number(speed) || 0);
		const waveAmplitude = Math.max(0, Number(waveHeight) || 0);
		const pointScale = Math.max(0.5, Number(pointSize) || 0.5);
		const waveFrequencyX = Math.max(0.05, Number(frequencyX) || 0.05);
		const waveFrequencyY = Math.max(0.05, Number(frequencyY) || 0.05);
		const { positions, scales, positionAttribute, scaleAttribute } =
			geometryData;

		timeRef.current += deltaSeconds * waveSpeed;

		let positionIndex = 0;
		let scaleIndex = 0;

		for (let columnIndex = 0; columnIndex < gridColumns; columnIndex += 1) {
			for (let rowIndex = 0; rowIndex < gridRows; rowIndex += 1) {
				const waveX =
					Math.sin((columnIndex + timeRef.current) * waveFrequencyX) *
					waveAmplitude;
				const waveY =
					Math.sin((rowIndex + timeRef.current) * waveFrequencyY) *
					waveAmplitude;

				positions[positionIndex + 1] = waveX + waveY;
				scales[scaleIndex] =
					(Math.sin((columnIndex + timeRef.current) * waveFrequencyX) + 1) *
						pointScale +
					(Math.sin((rowIndex + timeRef.current) * waveFrequencyY) + 1) *
						pointScale;

				positionIndex += 3;
				scaleIndex += 1;
			}
		}

		positionAttribute.needsUpdate = true;
		scaleAttribute.needsUpdate = true;
	});

	return (
		<points
			geometry={geometryData.geometry}
			renderOrder={order}
			frustumCulled={false}
		>
			<shaderMaterial
				uniforms={uniforms}
				vertexShader={POINT_WAVES_VERTEX_SHADER}
				fragmentShader={POINT_WAVES_FRAGMENT_SHADER}
				transparent={true}
				depthTest={true}
				depthWrite={false}
				premultipliedAlpha={premultipliedAlpha}
				blending={blending}
				blendEquation={sceneMask ? AddEquation : undefined}
				blendSrc={sceneMask ? ZeroFactor : undefined}
				blendDst={sceneMask ? OneFactor : undefined}
				blendEquationAlpha={sceneMask ? AddEquation : undefined}
				blendSrcAlpha={sceneMask ? OneFactor : undefined}
				blendDstAlpha={sceneMask ? ZeroFactor : undefined}
			/>
		</points>
	);
}
