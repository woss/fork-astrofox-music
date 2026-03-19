import Display from "@/lib/core/Display";

export default class PointWavesDisplay extends Display {
	static config = {
		name: "PointWavesDisplay",
		description: "Displays an animated 3D field of wave points.",
		type: "display",
		label: "Point Waves",
		defaultProperties: {
			color: "#FFFFFF",
			columns: 42,
			rows: 32,
			separation: 32,
			waveHeight: 28,
			pointSize: 4,
			speed: 1,
			frequencyX: 0.3,
			frequencyY: 0.5,
			opacity: 1,
		},
		controls: {
			color: {
				label: "Color",
				type: "color",
			},
			columns: {
				label: "Columns",
				type: "number",
				min: 4,
				max: 96,
				step: 1,
				withRange: true,
			},
			rows: {
				label: "Rows",
				type: "number",
				min: 4,
				max: 96,
				step: 1,
				withRange: true,
			},
			separation: {
				label: "Separation",
				type: "number",
				min: 8,
				max: 120,
				step: 1,
				withRange: true,
			},
			waveHeight: {
				label: "Wave Height",
				type: "number",
				min: 0,
				max: 120,
				step: 1,
				withRange: true,
				withReactor: true,
			},
			pointSize: {
				label: "Point Size",
				type: "number",
				min: 0.5,
				max: 24,
				step: 0.1,
				withRange: true,
				withReactor: true,
			},
			speed: {
				label: "Speed",
				type: "number",
				min: 0,
				max: 6,
				step: 0.01,
				withRange: true,
				withReactor: true,
			},
			frequencyX: {
				label: "Freq X",
				type: "number",
				min: 0.05,
				max: 1,
				step: 0.01,
				withRange: true,
				withReactor: true,
			},
			frequencyY: {
				label: "Freq Y",
				type: "number",
				min: 0.05,
				max: 1,
				step: 0.01,
				withRange: true,
				withReactor: true,
			},
			opacity: {
				label: "Opacity",
				type: "number",
				min: 0,
				max: 1,
				step: 0.01,
				withRange: true,
				withReactor: true,
			},
		},
	};

	constructor(properties?: Record<string, unknown>) {
		super(PointWavesDisplay, properties);
	}
}
