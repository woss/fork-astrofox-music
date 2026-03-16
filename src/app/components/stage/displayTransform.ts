import { getDisplayRenderGroup } from "@/lib/utils/displayRenderGroup";

type CanvasLike = {
	width?: number;
	height?: number;
};

type TransformableDisplay = {
	type?: string;
	name?: string;
	enabled?: boolean;
	properties?: Record<string, unknown>;
	image?: { naturalWidth?: number; naturalHeight?: number };
	video?: { videoWidth?: number; videoHeight?: number };
	text?: { canvas?: CanvasLike };
	shape?: { canvas?: CanvasLike };
	wave?: { canvas?: CanvasLike };
	bars?: { canvas?: CanvasLike };
};

export type DisplayTransformKind = "size" | "text";

export interface DisplayTransformFrame {
	id: string;
	name: string;
	kind: DisplayTransformKind;
	x: number;
	y: number;
	rotation: number;
	displayZoom: number;
	renderWidth: number;
	renderHeight: number;
	widthOffset: number;
	heightOffset: number;
	fixedAspect: boolean;
	size: number;
	barHeight: number;
	barShadowHeight: number;
}

function getCanvasSize(display: TransformableDisplay) {
	const canvas =
		display.text?.canvas ||
		display.shape?.canvas ||
		display.wave?.canvas ||
		display.bars?.canvas;

	if (!canvas?.width || !canvas?.height) {
		return null;
	}

	return {
		width: Number(canvas.width) || 0,
		height: Number(canvas.height) || 0,
	};
}

function getMediaSize(display: TransformableDisplay) {
	const properties = display.properties || {};

	if (display.name === "ImageDisplay") {
		return {
			width:
				Number(properties.width) || Number(display.image?.naturalWidth) || 0,
			height:
				Number(properties.height) || Number(display.image?.naturalHeight) || 0,
		};
	}

	if (display.name === "VideoDisplay") {
		return {
			width: Number(properties.width) || Number(display.video?.videoWidth) || 0,
			height:
				Number(properties.height) || Number(display.video?.videoHeight) || 0,
		};
	}

	return null;
}

export function getDisplayTransformFrame(
	display?: TransformableDisplay | null,
): DisplayTransformFrame | null {
	if (
		!display ||
		display.enabled === false ||
		display.type !== "display" ||
		getDisplayRenderGroup(display) !== "2d"
	) {
		return null;
	}

	const properties = display.properties || {};
	const x = Number(properties.x ?? 0);
	const y = Number(properties.y ?? 0);
	const rotation = Number(properties.rotation ?? 0);
	const fixedAspect = properties.fixed !== false;
	const size = Math.max(1, Number(properties.size ?? 1));
	const displayZoom = Math.max(0.01, Number(properties.zoom ?? 1));

	if (display.name === "TextDisplay") {
		const canvasSize = getCanvasSize(display);

		if (!canvasSize) {
			return null;
		}

		return {
			id: String((display as { id?: string }).id || ""),
			name: display.name || "",
			kind: "text",
			x,
			y,
			rotation,
			displayZoom,
			renderWidth: canvasSize.width * displayZoom,
			renderHeight: canvasSize.height * displayZoom,
			widthOffset: 0,
			heightOffset: 0,
			fixedAspect: true,
			size,
			barHeight: 0,
			barShadowHeight: 0,
		};
	}

	const canvasSize = getCanvasSize(display);
	const mediaSize = getMediaSize(display);
	const widthProperty = Number(properties.width ?? 0);
	const heightProperty = Number(properties.height ?? 0);
	const shadowHeightProperty = Math.max(
		0,
		Number(properties.shadowHeight ?? 0),
	);
	const isBarSpectrum = display.name === "BarSpectrumDisplay";
	const editableWidth =
		widthProperty > 0
			? widthProperty
			: Number(mediaSize?.width || canvasSize?.width || 0);
	const editableHeight = isBarSpectrum
		? Math.max(1, heightProperty + shadowHeightProperty)
		: heightProperty > 0
			? heightProperty
			: Number(mediaSize?.height || canvasSize?.height || 0);
	const baseRenderWidth =
		(canvasSize?.width || mediaSize?.width || editableWidth) ?? 0;
	const baseRenderHeight =
		(canvasSize?.height || mediaSize?.height || editableHeight) ?? 0;
	const renderWidth = baseRenderWidth * displayZoom;
	const renderHeight = baseRenderHeight * displayZoom;

	if (!renderWidth || !renderHeight) {
		return null;
	}

	return {
		id: String((display as { id?: string }).id || ""),
		name: display.name || "",
		kind: "size",
		x,
		y,
		rotation,
		displayZoom,
		renderWidth,
		renderHeight,
		widthOffset: Math.max(0, baseRenderWidth - Math.max(1, editableWidth)),
		heightOffset: Math.max(0, baseRenderHeight - Math.max(1, editableHeight)),
		fixedAspect:
			display.name === "ImageDisplay" ||
			display.name === "VideoDisplay" ||
			(display.name === "ShapeDisplay" && properties.shape !== "Rectangle")
				? fixedAspect
				: false,
		size,
		barHeight: Math.max(0, heightProperty),
		barShadowHeight: isBarSpectrum ? shadowHeightProperty : 0,
	};
}

export function isTransformable2DDisplay(
	display?: TransformableDisplay | null,
): boolean {
	return getDisplayTransformFrame(display) !== null;
}
