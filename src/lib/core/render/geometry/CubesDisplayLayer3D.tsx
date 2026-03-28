// @ts-nocheck
import FFTParser from "@/lib/audio/FFTParser";
import React from "react";
import {
	AddEquation,
	BoxGeometry,
	Color,
	CustomBlending,
	EdgesGeometry,
	LineBasicMaterial,
	MeshStandardMaterial,
	OneFactor,
	ZeroFactor,
} from "three";
import {
	getThreeBlending,
	requiresPremultipliedAlpha,
} from "../layers/TexturePlane";

const MOTION_SPEED = 0.08;
const DEPTH_BASE_RATIO = 0.1;
const DEPTH_MAX_RATIO = 3.6;

function clamp(value: number, min: number, max: number) {
	return Math.max(min, Math.min(max, value));
}

function sampleSpectrum(values: Float32Array, t: number) {
	if (!values.length) {
		return 0;
	}

	const clampedT = clamp(t, 0, 1) * (values.length - 1);
	const baseIndex = Math.floor(clampedT);
	const nextIndex = Math.min(values.length - 1, baseIndex + 1);
	const mix = clampedT - baseIndex;

	return values[baseIndex] * (1 - mix) + values[nextIndex] * mix;
}

function wrap01(value: number) {
	const wrapped = value % 1;
	return wrapped < 0 ? wrapped + 1 : wrapped;
}

function sampleSpectrumBinLinear(
	values: Float32Array,
	index: number,
	count: number,
) {
	if (values.length === 0 || count <= 1) {
		return values[0] ?? 0;
	}

	const position = (index / (count - 1)) * Math.max(0, values.length - 1);
	const lower = Math.floor(position);
	const upper = Math.min(values.length - 1, lower + 1);
	const mix = position - lower;
	const start = values[lower] ?? 0;
	const end = values[upper] ?? start;

	return start + (end - start) * mix;
}

function sampleStaticSpectrumField(
	values: Float32Array,
	row: number,
	column: number,
	rows: number,
	columns: number,
) {
	if (!values.length) {
		return 0;
	}

	const totalCells = Math.max(2, rows * columns);
	return sampleSpectrumBinLinear(values, row * columns + column, totalCells);
}

function wrapIndex(value: number, size: number) {
	const wrapped = value % size;
	return wrapped < 0 ? wrapped + size : wrapped;
}

function sampleStaticSpectrumGridLinear(
	values: Float32Array,
	row: number,
	column: number,
	rows: number,
	columns: number,
) {
	if (rows <= 0 || columns <= 0) {
		return 0;
	}

	const rowWrapped = wrapIndex(row, rows);
	const columnWrapped = wrapIndex(column, columns);
	const row0 = Math.floor(rowWrapped);
	const row1 = (row0 + 1) % rows;
	const column0 = Math.floor(columnWrapped);
	const column1 = (column0 + 1) % columns;
	const rowMix = rowWrapped - row0;
	const columnMix = columnWrapped - column0;
	const a = sampleStaticSpectrumField(values, row0, column0, rows, columns);
	const b = sampleStaticSpectrumField(values, row0, column1, rows, columns);
	const c = sampleStaticSpectrumField(values, row1, column0, rows, columns);
	const d = sampleStaticSpectrumField(values, row1, column1, rows, columns);
	const top = a + (b - a) * columnMix;
	const bottom = c + (d - c) * columnMix;

	return top + (bottom - top) * rowMix;
}

function sampleStaticSpectrumNormalized(
	values: Float32Array,
	u: number,
	v: number,
	rows: number,
	columns: number,
) {
	return sampleStaticSpectrumGridLinear(
		values,
		wrap01(v) * rows,
		wrap01(u) * columns,
		rows,
		columns,
	);
}

function getSpectrumAmplitude(
	values: Float32Array,
	motion: string,
	row: number,
	column: number,
	rows: number,
	columns: number,
	time: number,
) {
	if (!values.length) {
		return 0;
	}

	const rowDrift = time * MOTION_SPEED * rows;
	if (motion === "Static") {
		return sampleStaticSpectrumField(values, row, column, rows, columns);
	}

	if (motion === "Horizontal") {
		return sampleStaticSpectrumGridLinear(
			values,
			row + rowDrift,
			column,
			rows,
			columns,
		);
	}

	if (motion === "Vertical") {
		const u = (column + 0.5) / Math.max(1, columns);
		const v = (row + 0.5) / Math.max(1, rows);
		return sampleStaticSpectrumNormalized(
			values,
			1 - v,
			u + time * MOTION_SPEED,
			rows,
			columns,
		);
	}

	const totalCells = Math.max(2, rows * columns);
	const u = columns <= 1 ? 0 : column / (columns - 1);
	const v = rows <= 1 ? 0 : row / (rows - 1);

	if (motion === "Diagonal") {
		const mapped = u * 0.72 + v * 0.28;
		return sampleSpectrumBinLinear(
			values,
			wrap01(mapped + time * MOTION_SPEED) * (totalCells - 1),
			totalCells,
		);
	}

	const centeredU = u - 0.5;
	const centeredV = v - 0.5;
	const mapped =
		motion === "Radial"
			? Math.sqrt(centeredU * centeredU + centeredV * centeredV) /
				Math.sqrt(0.5 * 0.5 + 0.5 * 0.5)
			: Math.atan2(centeredV, centeredU) / (Math.PI * 2) + 0.5;

	return sampleSpectrumBinLinear(
		values,
		wrap01(mapped + time * MOTION_SPEED) * (totalCells - 1),
		totalCells,
	);
}

export function CubesDisplayLayer3D({
	display,
	order,
	width,
	height,
	frameData,
	sceneOpacity,
	sceneBlendMode,
	sceneMask,
}) {
	const { properties = {} } = display;
	const {
		rows = 7,
		columns = 12,
		gap = 2,
		surfaceColor = "#000000",
		borderColor = "#FFFFFF",
		motion = "Horizontal",
		height: heightScale = 4,
		reactivity = undefined,
		opacity = 1,
	} = properties;

	const parserRef = React.useRef(new FFTParser(properties));
	const timeRef = React.useRef(0);

	parserRef.current.update(properties);

	if (frameData?.hasUpdate) {
		timeRef.current += Math.max(0, Number(frameData?.delta ?? 16.667)) / 1000;
	}

	const gridRows = Math.max(1, Math.round(Number(rows) || 1));
	const gridColumns = Math.max(1, Math.round(Number(columns) || 1));
	const viewportWidth = Math.max(1, Number(width) || 1);
	const viewportHeight = Math.max(1, Number(height) || 1);
	const cellWidth = viewportWidth / gridColumns;
	const cellHeight = viewportHeight / gridRows;
	const blockGap = clamp(
		Number(gap) || 0,
		0,
		Math.max(0, Math.min(cellWidth, cellHeight) - 2),
	);
	const cubeWidth = Math.max(2, cellWidth - blockGap);
	const cubeHeight = Math.max(2, cellHeight - blockGap);
	const cellDepth = Math.min(cellWidth, cellHeight);
	const baseDepth = Math.max(4, cellDepth * DEPTH_BASE_RATIO);
	const maxDepth = cellDepth * DEPTH_MAX_RATIO;
	const extrusionHeight = clamp(
		Number(heightScale ?? reactivity ?? 1) || 0,
		0,
		8,
	);
	const spectrumBins = Math.max(32, Math.min(512, gridRows * gridColumns * 2));
	const spectrum = frameData?.fft
		? parserRef.current.parseFFT(frameData.fft, spectrumBins)
		: new Float32Array(spectrumBins);
	const finalOpacity = clamp(
		Number(opacity ?? 1) * Number(sceneOpacity ?? 1),
		0,
		1,
	);
	const blending = sceneMask
		? CustomBlending
		: getThreeBlending(sceneBlendMode);
	const resolvedSurfaceColor = sceneMask ? "#000000" : surfaceColor;
	const resolvedBorderColor = sceneMask ? "#000000" : borderColor;
	const premultipliedAlpha = requiresPremultipliedAlpha(sceneBlendMode);
	const borderOpacity = sceneMask ? 1 : Math.min(1, finalOpacity * 0.95);
	const surfaceEmissiveColor = React.useMemo(
		() => new Color(resolvedSurfaceColor).multiplyScalar(sceneMask ? 0 : 0.08),
		[resolvedSurfaceColor, sceneMask],
	);
	const boxGeometry = React.useMemo(() => {
		const geometry = new BoxGeometry(1, 1, 1);
		geometry.translate(0, 0.5, 0);
		return geometry;
	}, []);
	const edgeGeometry = React.useMemo(
		() => new EdgesGeometry(boxGeometry),
		[boxGeometry],
	);
	const surfaceMaterial = React.useMemo(
		() =>
			new MeshStandardMaterial({
				color: new Color(resolvedSurfaceColor),
				emissive: surfaceEmissiveColor,
				transparent: true,
				opacity: finalOpacity,
				roughness: 0.72,
				metalness: 0.04,
				premultipliedAlpha,
				blending,
				depthTest: true,
				depthWrite: true,
				blendEquation: sceneMask ? AddEquation : undefined,
				blendSrc: sceneMask ? ZeroFactor : undefined,
				blendDst: sceneMask ? OneFactor : undefined,
				blendEquationAlpha: sceneMask ? AddEquation : undefined,
				blendSrcAlpha: sceneMask ? OneFactor : undefined,
				blendDstAlpha: sceneMask ? ZeroFactor : undefined,
			}),
		[
			blending,
			finalOpacity,
			premultipliedAlpha,
			surfaceEmissiveColor,
			resolvedSurfaceColor,
			sceneMask,
		],
	);
	const edgeMaterial = React.useMemo(
		() =>
			new LineBasicMaterial({
				color: new Color(resolvedBorderColor),
				transparent: true,
				opacity: borderOpacity,
				premultipliedAlpha,
				blending,
				depthTest: true,
				depthWrite: false,
			}),
		[blending, borderOpacity, premultipliedAlpha, resolvedBorderColor],
	);
	React.useEffect(() => {
		return () => {
			boxGeometry.dispose();
			edgeGeometry.dispose();
			surfaceMaterial.dispose();
			edgeMaterial.dispose();
		};
	}, [boxGeometry, edgeGeometry, edgeMaterial, surfaceMaterial]);

	const cubes = [];
	for (let rowIndex = 0; rowIndex < gridRows; rowIndex += 1) {
		for (let columnIndex = 0; columnIndex < gridColumns; columnIndex += 1) {
			const value = getSpectrumAmplitude(
				spectrum,
				motion,
				rowIndex,
				columnIndex,
				gridRows,
				gridColumns,
				timeRef.current,
			);
			const shapedValue = clamp(value, 0, 1) ** 0.8;
			const x = -viewportWidth / 2 + cellWidth * (columnIndex + 0.5);
			const z = -viewportHeight / 2 + cellHeight * (rowIndex + 0.5);
			const depth = baseDepth + shapedValue * extrusionHeight * maxDepth;

			cubes.push({
				key: `${rowIndex}-${columnIndex}`,
				position: [x, 0, z],
				scale: [cubeWidth, depth, cubeHeight],
			});
		}
	}

	return (
		<group>
			<mesh
				position={[0, -maxDepth * 0.02, 0]}
				rotation={[-Math.PI / 2, 0, 0]}
				receiveShadow={true}
				renderOrder={order - 0.01}
			>
				<planeGeometry
					args={[viewportWidth + cubeWidth, viewportHeight + cubeHeight]}
				/>
				<shadowMaterial transparent={true} opacity={0.68} />
			</mesh>
			{cubes.map((cube) => (
				<group key={cube.key} position={cube.position} scale={cube.scale}>
					<mesh
						geometry={boxGeometry}
						material={surfaceMaterial}
						renderOrder={order}
						castShadow={true}
						receiveShadow={true}
					/>
					<lineSegments
						geometry={edgeGeometry}
						material={edgeMaterial}
						renderOrder={order + 0.01}
					/>
				</group>
			))}
		</group>
	);
}
